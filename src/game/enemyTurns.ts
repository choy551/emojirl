import { Enemy, EmojiItem, GameState, Position, FloatingText, PlacedBomb, ActiveProjectile } from './types';
import { chebyshev } from './geo';
import { applyEquipmentAndPassives, addToBag, computeBagPassives } from './inventory';
import { withVisibility, visionRadiusFor } from './vision';
import { bfsStepToward, fleeStep, hasLOSBetween, detectionRadius } from './pathfinding';
import { PLAYER_PASSABLE_TILES, MERMAN_PASSABLE_TILES } from './tiles';
import { _flashSignals } from './flashSignals';
import { nearRestaurant, crowGoldSteal } from './economy';
import { computeNinjaEvasion } from './progression';

export interface EnemyTurnResult {
  enemies: Enemy[];
  playerHp: number;
  playerDied: boolean;
  killer?: { name: string; emoji: string };
  newLogs: Array<{ id: string; text: string; turn: number }>;
  newFloatingTexts: FloatingText[];
  placedBombs: PlacedBomb[];
  activeProjectile: ActiveProjectile | null;
  explosionPositions: Position[];
  kitePos?: Position;
  trailblazerCooldown?: number;
  moodDrain: number;
  goldDrain: number;
  playerInventoryRemovals: string[];
  playerInventoryAdditions: EmojiItem[];
  enemyBeam?: { positions: Position[]; color: string };
}

export function runEnemyTurns(state: GameState, skipId?: string): EnemyTurnResult {
  const { player, map } = state;
  const effectivePlayer = applyEquipmentAndPassives(player);
  // Player's true sight range (class/level + bag LOS passives). Ranged enemies may
  // only attack while the player can actually see them — i.e. within this radius
  // with clear line of sight — so archers can't snipe from the unseen fog.
  const playerVisionRadius = Math.max(1, visionRadiusFor(player.characterClass, player.stats.level) + computeBagPassives(player.inventory).losBonus);
  const newEnemies = [...state.enemies];
  let playerHp = player.stats.hp;
  let playerDied = false;
  let killer: { name: string; emoji: string } | undefined;
  const newLogs: Array<{ id: string; text: string; turn: number }> = [];
  const newFloatingTexts: FloatingText[] = [];
  const explosionPositions: Position[] = [];
  let moodDrain = 0;
  let goldDrain = 0;
  let playerGold = player.stats.gold;
  const playerInventoryRemovals: string[] = [];
  const playerInventoryAdditions: EmojiItem[] = [];

  const log = (text: string) =>
    newLogs.push({ id: Math.random().toString(), text, turn: state.turn });

  const stealGoldOnCrowHit = (enemy: Enemy) => {
    if (!enemy.crow || playerGold <= 0) return;
    const stolen = crowGoldSteal(state.currentFloor, playerGold);
    if (stolen <= 0) return;
    goldDrain += stolen;
    playerGold -= stolen;
    log(`🐦‍⬛ ${enemy.name} pecks you and flies off with ${stolen}g!`);
    newFloatingTexts.push({
      id: `crow-steal-${enemy.id}-${state.turn}-${Math.random()}`,
      pos: { ...player.pos },
      text: `-${stolen}g`,
      color: '#facc15',
      life: 2,
    });
  };

  let newBombs: PlacedBomb[] = [];
  let enemyBeam: { positions: Position[]; color: string } | undefined;
  for (const bomb of state.placedBombs) {
    const newCount = bomb.countdown - 1;
    if (newCount <= 0) {
      log(`💥 BOOM! The bomb explodes!`);
      newFloatingTexts.push({
        id: `bomb-exp-${bomb.id}`,
        pos: { ...bomb.pos },
        text: '💥',
        color: '#f97316',
        life: 3,
      });
      for (let fy = bomb.pos.y - bomb.radius; fy <= bomb.pos.y + bomb.radius; fy++) {
        for (let fx = bomb.pos.x - bomb.radius; fx <= bomb.pos.x + bomb.radius; fx++) {
          if (chebyshev({ x: fx, y: fy }, bomb.pos) <= bomb.radius) {
            explosionPositions.push({ x: fx, y: fy });
          }
        }
      }
      for (let ei = newEnemies.length - 1; ei >= 0; ei--) {
        const e = newEnemies[ei];
        if (chebyshev(e.pos, bomb.pos) <= bomb.radius) {
          const dmg = Math.max(1, player.stats.attack * 2 - (e.defense ?? 0));
          const newHp = e.hp - dmg;
          log(`💥 Explosion hits ${e.emoji} ${e.name} for ${dmg} dmg!`);
          newFloatingTexts.push({ id: `bomb-hit-${e.id}`, pos: { ...e.pos }, text: `-${dmg}`, color: '#f97316', life: 2 });
          if (newHp <= 0) {
            if (e.stolenEmojis?.length) {
              playerInventoryAdditions.push(...e.stolenEmojis);
              log(`🐒 ${e.name} dropped your ${e.stolenEmojis.map(s => s.emoji).join('')}!`);
            }
            newEnemies.splice(ei, 1);
          } else {
            newEnemies[ei] = { ...e, hp: newHp, engaged: true };
          }
        }
      }
    } else {
      newBombs.push({ ...bomb, countdown: newCount });
    }
  }

  let newProjectile: ActiveProjectile | null = state.activeProjectile;
  if (newProjectile) {
    const proj = newProjectile;
    const nextX = proj.pos.x + proj.dir.x;
    const nextY = proj.pos.y + proj.dir.y;
    const outOfBounds = nextY < 0 || nextY >= map.length || nextX < 0 || nextX >= map[0].length;
    const hitWall = !outOfBounds && map[nextY][nextX].type === 'wall';

    if (proj.phase === 'outgoing') {
      // Co-location check: an enemy may have stepped onto the boomerang's current tile
      // last turn (both moving 1 tile/turn toward each other — they "swap" positions and
      // the normal nextX/nextY check would miss entirely).
      const colocIdx = proj.traveled > 0
        ? newEnemies.findIndex(e => e.pos.x === proj.pos.x && e.pos.y === proj.pos.y)
        : -1;
      if (colocIdx !== -1) {
        const colocTarget = newEnemies[colocIdx];
        if (proj.kind === 'boomerang') {
          const bankBoomerangs = state.player.bank.filter(it => it.activeKind === 'boomerang' && !it.consumed).length;
          const boomerangMultiplier = Math.min(2.0, 1.0 + 0.25 * bankBoomerangs);
          const dmg = Math.max(1, Math.floor(player.stats.attack * boomerangMultiplier) - (colocTarget.defense ?? 0));
          const pctLabel = Math.round(boomerangMultiplier * 100);
          log(`🪃 Boomerang hits ${colocTarget.emoji} ${colocTarget.name} for ${dmg} dmg! (${pctLabel}% ATK)`);
          newFloatingTexts.push({ id: `boom-coloc-${colocTarget.id}`, pos: { ...colocTarget.pos }, text: `-${dmg}`, color: '#fde68a', life: 2 });
          const colocNewHp = colocTarget.hp - dmg;
          if (colocNewHp <= 0) { newEnemies.splice(colocIdx, 1); }
          else { newEnemies[colocIdx] = { ...colocTarget, hp: colocNewHp, engaged: true }; }
          newProjectile = { ...proj, dir: { x: -proj.dir.x, y: -proj.dir.y }, phase: 'returning', traveled: 0 };
        } else if (proj.kind === 'gun') {
          const dmg = Math.max(1, player.stats.attack - (colocTarget.defense ?? 0));
          log(`🔫 Bullet hits ${colocTarget.emoji} ${colocTarget.name} for ${dmg} dmg!`);
          newFloatingTexts.push({ id: `gun-coloc-${colocTarget.id}`, pos: { ...colocTarget.pos }, text: `-${dmg}`, color: '#ef4444', life: 2 });
          const colocNewHp = colocTarget.hp - dmg;
          if (colocNewHp <= 0) { newEnemies.splice(colocIdx, 1); } else { newEnemies[colocIdx] = { ...colocTarget, hp: colocNewHp, engaged: true }; }
          newProjectile = null;
        } else if (proj.kind === 'freeze') {
          const dmg = Math.max(1, player.stats.attack - (colocTarget.defense ?? 0));
          log(`❄️ Freeze hits ${colocTarget.emoji} ${colocTarget.name} for ${dmg} dmg! Frozen for 3 turns!`);
          newFloatingTexts.push({ id: `freeze-coloc-${colocTarget.id}`, pos: { ...colocTarget.pos }, text: `❄️-${dmg}`, color: '#93c5fd', life: 2 });
          const colocNewHp = colocTarget.hp - dmg;
          if (colocNewHp <= 0) { newEnemies.splice(colocIdx, 1); } else { newEnemies[colocIdx] = { ...colocTarget, hp: colocNewHp, engaged: true, frozenTurns: 3, slowedTurns: 0 }; }
          newProjectile = null;
        }
        // bomb co-location: AOE still triggers below via nextX/nextY on the next tick
      } else if (outOfBounds || hitWall || proj.traveled >= proj.maxRange) {
        if (proj.kind === 'boomerang') {
          newProjectile = {
            ...proj,
            pos: { x: nextX, y: nextY },
            dir: { x: -proj.dir.x, y: -proj.dir.y },
            phase: 'returning',
            traveled: 0,
          };
        } else {
          newProjectile = null;
        }
      } else {
        const hitIdx = newEnemies.findIndex(e => e.pos.x === nextX && e.pos.y === nextY);
        if (hitIdx !== -1) {
          const target = newEnemies[hitIdx];
          if (proj.kind === 'gun') {
            const dmg = Math.max(1, player.stats.attack - (target.defense ?? 0));
            log(`🔫 Bullet hits ${target.emoji} ${target.name} for ${dmg} dmg!`);
            newFloatingTexts.push({ id: `gun-hit-${target.id}`, pos: { ...target.pos }, text: `-${dmg}`, color: '#ef4444', life: 2 });
            const newHp = target.hp - dmg;
            if (newHp <= 0) {
              newEnemies.splice(hitIdx, 1);
            } else {
              newEnemies[hitIdx] = { ...target, hp: newHp, engaged: true };
            }
            newProjectile = null;
          } else if (proj.kind === 'freeze') {
            const dmg = Math.max(1, player.stats.attack - (target.defense ?? 0));
            log(`❄️ Freeze hits ${target.emoji} ${target.name} for ${dmg} dmg! Frozen for 3 turns!`);
            newFloatingTexts.push({ id: `freeze-hit-${target.id}`, pos: { ...target.pos }, text: `❄️-${dmg}`, color: '#93c5fd', life: 2 });
            const newHp = target.hp - dmg;
            if (newHp <= 0) {
              newEnemies.splice(hitIdx, 1);
            } else {
              newEnemies[hitIdx] = { ...target, hp: newHp, engaged: true, frozenTurns: 3, slowedTurns: 0 };
            }
            newProjectile = null;
          } else if (proj.kind === 'boomerang') {
            const bankBoomerangs = state.player.bank.filter(it => it.activeKind === 'boomerang' && !it.consumed).length;
            const boomerangMultiplier = Math.min(2.0, 1.0 + 0.25 * bankBoomerangs);
            const dmg = Math.max(1, Math.floor(player.stats.attack * boomerangMultiplier) - (target.defense ?? 0));
            const pctLabel = Math.round(boomerangMultiplier * 100);
            log(`🪃 Boomerang hits ${target.emoji} ${target.name} for ${dmg} dmg! (${pctLabel}% ATK)`);
            newFloatingTexts.push({ id: `boom-hit-${target.id}`, pos: { ...target.pos }, text: `-${dmg}`, color: '#fde68a', life: 2 });
            const newHp = target.hp - dmg;
            if (newHp <= 0) {
              newEnemies.splice(hitIdx, 1);
            } else {
              newEnemies[hitIdx] = { ...target, hp: newHp, engaged: true };
            }
            newProjectile = {
              ...proj,
              pos: { x: nextX, y: nextY },
              dir: { x: -proj.dir.x, y: -proj.dir.y },
              phase: 'returning',
              traveled: 0,
            };
          } else if (proj.kind === 'bomb') {
            // Instant 3×3 AOE explosion on hitting an enemy
            const blastPos = { x: nextX, y: nextY };
            const blastRadius = 1;
            log(`💥 BOOM! Bomb detonates on ${target.emoji} ${target.name}!`);
            newFloatingTexts.push({ id: `bomb-proj-exp-${proj.id}`, pos: { ...blastPos }, text: '💥', color: '#f97316', life: 3 });
            for (let fy = blastPos.y - blastRadius; fy <= blastPos.y + blastRadius; fy++) {
              for (let fx = blastPos.x - blastRadius; fx <= blastPos.x + blastRadius; fx++) {
                if (chebyshev({ x: fx, y: fy }, blastPos) <= blastRadius) {
                  explosionPositions.push({ x: fx, y: fy });
                }
              }
            }
            const bombAtk = player.stats.attack * 2;
            for (let ei = newEnemies.length - 1; ei >= 0; ei--) {
              const e = newEnemies[ei];
              if (chebyshev(e.pos, blastPos) <= blastRadius) {
                const dmg = Math.max(1, bombAtk - (e.defense ?? 0));
                log(`💥 Explosion hits ${e.emoji} ${e.name} for ${dmg} dmg!`);
                newFloatingTexts.push({ id: `bomb-proj-hit-${e.id}`, pos: { ...e.pos }, text: `-${dmg}`, color: '#f97316', life: 2 });
                const newHp = e.hp - dmg;
                if (newHp <= 0) {
                  if (e.stolenEmojis?.length) {
                    playerInventoryAdditions.push(...e.stolenEmojis);
                    log(`🐒 ${e.name} dropped your ${e.stolenEmojis.map(s => s.emoji).join('')}!`);
                  }
                  newEnemies.splice(ei, 1);
                } else {
                  newEnemies[ei] = { ...e, hp: newHp, engaged: true };
                }
              }
            }
            // Player caught in blast?
            if (chebyshev(player.pos, blastPos) <= blastRadius) {
              const selfDmg = Math.max(1, bombAtk);
              playerHp = Math.max(0, playerHp - selfDmg);
              log(`💥 You're caught in your own explosion! -${selfDmg} HP!`);
              newFloatingTexts.push({ id: `bomb-self-${proj.id}`, pos: { ...player.pos }, text: `-${selfDmg}`, color: '#f97316', life: 2 });
              if (playerHp <= 0) { playerDied = true; killer = { name: 'your own bomb', emoji: '💣' }; }
            }
            newProjectile = null;
          }
        } else {
          newProjectile = { ...proj, pos: { x: nextX, y: nextY }, traveled: proj.traveled + 1 };
        }
      }
    } else {
      if (outOfBounds || hitWall) {
        newProjectile = null;
      } else if (nextX === player.pos.x && nextY === player.pos.y) {
        log('🪃 The boomerang returns to your hand!');
        newProjectile = null;
      } else {
        newProjectile = { ...proj, pos: { x: nextX, y: nextY }, traveled: proj.traveled + 1 };
        if (proj.traveled >= proj.maxRange * 2) newProjectile = null;
      }
    }
  }

  const occupied = new Set<string>(state.enemies.map(e => `${e.pos.x},${e.pos.y}`));

  const playerOnWater = map[player.pos.y]?.[player.pos.x]?.type === 'water';
  const playerNearWater = playerOnWater || [[-1,0],[1,0],[0,-1],[0,1]].some(
    ([dx, dy]) => map[player.pos.y + dy]?.[player.pos.x + dx]?.type === 'water'
  );

  const _freezePassives = computeBagPassives(state.player.inventory);
  if (_freezePassives.freezeAura) {
    for (let i = 0; i < newEnemies.length; i++) {
      if (chebyshev(newEnemies[i].pos, state.player.pos) <= 1 && (newEnemies[i].slowedTurns ?? 0) < 2) {
        newEnemies[i] = { ...newEnemies[i], slowedTurns: 2, slowSkipNext: false };
      }
    }
  }
  const regen = _freezePassives.combatRegen || 0;
  if (regen > 0 && playerHp < player.stats.maxHp) {
    playerHp = Math.min(player.stats.maxHp, playerHp + regen);
  }
  if (_freezePassives.regeneration > 0 && state.turn % Math.max(1, 6 - _freezePassives.regeneration) === 0 && playerHp < player.stats.maxHp) {
    playerHp = Math.min(player.stats.maxHp, playerHp + 1);
    log('💊 You regenerate! (+1 HP)');
  }
  const _soulCount = player.inventory.filter(i => !i.consumed && !i.isEquipment && i.bagPassive && !i.activeKind && i.healAmount == null && i.ammoAmount == null).length;
  if (_soulCount === 0) {
    const _emojilessDmg = state.currentFloor;
    playerHp -= _emojilessDmg;
    log(`💀 You are emoji-less! Taking ${_emojilessDmg} dmg/turn (floor ${state.currentFloor}). Find an emoji or die!`);
    _flashSignals.emojilessFlashPending = true;
    if (playerHp <= 0) { playerDied = true; killer = { name: 'the void', emoji: '💀' }; }
  }

  for (let i = 0; i < newEnemies.length; i++) {
    const enemy = newEnemies[i];

    if (enemy.id === skipId) continue;

    if ((enemy.burningTurns ?? 0) > 0) {
      const newBurning = enemy.burningTurns! - 1;
      const newHp = enemy.hp - 1;
      if (newHp <= 0) {
        if (enemy.stolenEmojis?.length) {
          playerInventoryAdditions.push(...enemy.stolenEmojis);
          log(`🐒 ${enemy.name} dropped your ${enemy.stolenEmojis.map(s => s.emoji).join('')}!`);
        }
        newEnemies[i] = { ...enemy, hp: 0, burningTurns: 0 };
        log(`🔥 ${enemy.name} burns to ash!`);
        continue;
      }
      newEnemies[i] = { ...enemy, hp: newHp, burningTurns: newBurning };
      if (newBurning === 0) log(`🔥 ${enemy.name} stops burning.`);
      else log(`🔥 ${enemy.name} burns! (−1 hp)`);
    }

    if ((enemy.frozenTurns ?? 0) > 0) {
      const newFrozen = (enemy.frozenTurns ?? 1) - 1;
      const gains = newFrozen === 0 ? { slowedTurns: 3, slowSkipNext: false } : {};
      if (newFrozen === 0) log(`${enemy.emoji} ${enemy.name} thaws — but is slowed!`);
      newEnemies[i] = { ...enemy, frozenTurns: newFrozen, ...gains };
      continue;
    }
    if ((enemy.webbedTurns ?? 0) > 0) {
      newEnemies[i] = { ...enemy, webbedTurns: (enemy.webbedTurns ?? 1) - 1 };
      continue;
    }
    if ((enemy.paralyzedTurns ?? 0) > 0) {
      newEnemies[i] = { ...enemy, paralyzedTurns: (enemy.paralyzedTurns ?? 1) - 1 };
      continue;
    }

    if ((enemy.slowedTurns ?? 0) > 0) {
      const newSlowed = (enemy.slowedTurns ?? 1) - 1;
      if (enemy.slowSkipNext) {
        newEnemies[i] = { ...enemy, slowedTurns: newSlowed, slowSkipNext: false };
        continue;
      } else {
        newEnemies[i] = { ...enemy, slowedTurns: newSlowed, slowSkipNext: true };
      }
    }

    occupied.delete(`${enemy.pos.x},${enemy.pos.y}`);

    const dist = chebyshev(enemy.pos, player.pos);
    const playerKey = `${player.pos.x},${player.pos.y}`;

    if (enemy.tag === 'Friendly') {
      if (enemy.isAdventurer || (enemy.bear && enemy.isRecruited)) {
        // Recruited companion (adventurer or bear): attack nearby hostiles, follow player
        const searchRadius = enemy.bear ? 5 : 6;
        const hostileTargets = newEnemies.filter((e, ei) =>
          ei !== i && e.hp > 0 && e.tag !== 'Friendly' && e.tag !== 'Neutral' &&
          e.engaged && chebyshev(e.pos, player.pos) <= searchRadius
        );
        hostileTargets.sort((a, b) => chebyshev(a.pos, enemy.pos) - chebyshev(b.pos, enemy.pos));
        const companionTarget = hostileTargets[0];
        if (companionTarget) {
          const distToTarget = chebyshev(enemy.pos, companionTarget.pos);
          if (distToTarget <= 1) {
            const ti = newEnemies.findIndex(e => e.id === companionTarget.id);
            const dmg = Math.max(1, enemy.attack - Math.floor((companionTarget.defense ?? 0) / 2));
            const newTargetHp = companionTarget.hp - dmg;
            const logPrefix = enemy.bear ? '🐻' : '🤝';
            newFloatingTexts.push({ id: `companion-${enemy.id}-${state.turn}`, pos: { ...companionTarget.pos }, text: `-${dmg}`, color: enemy.bear ? '#f59e0b' : '#22d3ee', life: 2 });
            if (newTargetHp <= 0) {
              newEnemies[ti] = { ...companionTarget, hp: 0 };
              log(`${logPrefix} ${enemy.emoji} ${enemy.name} takes down ${companionTarget.emoji} ${companionTarget.name}!`);
            } else {
              newEnemies[ti] = { ...companionTarget, hp: newTargetHp };
            }
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          } else {
            const nextPos = bfsStepToward(map, enemy.pos, companionTarget.pos, occupied);
            if (nextPos) {
              newEnemies[i] = { ...newEnemies[i], pos: nextPos };
              occupied.add(`${nextPos.x},${nextPos.y}`);
            } else {
              occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
            }
          }
        } else if (dist > 3) {
          const nextPos = bfsStepToward(map, enemy.pos, player.pos, occupied);
          if (nextPos && !(nextPos.x === player.pos.x && nextPos.y === player.pos.y)) {
            newEnemies[i] = { ...newEnemies[i], pos: nextPos };
            occupied.add(`${nextPos.x},${nextPos.y}`);
          } else {
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      } else if (enemy.bear && !enemy.isRecruited) {
        // Friendly non-recruited bear: guards its position, attacks nearby hostiles near the player but does not follow
        const guardTargets = newEnemies.filter((e, ei) =>
          ei !== i && e.hp > 0 && e.tag !== 'Friendly' && e.tag !== 'Neutral' &&
          e.engaged && chebyshev(e.pos, enemy.pos) <= 3 && chebyshev(e.pos, player.pos) <= 5
        );
        guardTargets.sort((a, b) => chebyshev(a.pos, enemy.pos) - chebyshev(b.pos, enemy.pos));
        const guardTarget = guardTargets[0];
        if (guardTarget) {
          const distToTarget = chebyshev(enemy.pos, guardTarget.pos);
          if (distToTarget <= 1) {
            const ti = newEnemies.findIndex(e => e.id === guardTarget.id);
            const dmg = Math.max(1, enemy.attack - Math.floor((guardTarget.defense ?? 0) / 2));
            const newTargetHp = guardTarget.hp - dmg;
            newFloatingTexts.push({ id: `bear-guard-${enemy.id}-${state.turn}`, pos: { ...guardTarget.pos }, text: `-${dmg}`, color: '#f59e0b', life: 2 });
            if (newTargetHp <= 0) {
              newEnemies[ti] = { ...guardTarget, hp: 0 };
              log(`🐻 ${enemy.emoji} ${enemy.name} defends the area, taking down ${guardTarget.emoji} ${guardTarget.name}!`);
            } else {
              newEnemies[ti] = { ...guardTarget, hp: newTargetHp };
            }
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          } else {
            const nextPos = bfsStepToward(map, enemy.pos, guardTarget.pos, occupied);
            if (nextPos) {
              newEnemies[i] = { ...newEnemies[i], pos: nextPos };
              occupied.add(`${nextPos.x},${nextPos.y}`);
            } else {
              occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
            }
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      } else {
        occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
      }
      continue;
    }

    if (enemy.waterAggro && !enemy.engaged && playerNearWater && dist <= 6) {
      newEnemies[i] = { ...newEnemies[i], engaged: true };
      log(`🧜‍♂️ ${enemy.emoji} ${enemy.name} senses your presence — turns hostile!`);
    }

    if (enemy.monkey && dist <= 1 && !playerDied) {
      const stealable = player.inventory.filter(i =>
        !i.consumed && !i.isEquipment && i.bagPassive && !i.activeKind &&
        i.healAmount == null && i.ammoAmount == null &&
        !playerInventoryRemovals.includes(i.id)
      );
      if (stealable.length > 0) {
        const stolen = stealable[Math.floor(Math.random() * stealable.length)];
        playerInventoryRemovals.push(stolen.id);
        const currentStolen = [...(newEnemies[i].stolenEmojis ?? []), stolen];
        newEnemies[i] = { ...newEnemies[i], stolenEmojis: currentStolen };
        log(`🐒 ${enemy.emoji} ${enemy.name} snatched your ${stolen.emoji}! (${currentStolen.length} stolen)`);
        newFloatingTexts.push({ id: `monkey-steal-${enemy.id}-${state.turn}-${Math.random()}`, pos: { ...enemy.pos }, text: '🐒💨', color: '#f59e0b', life: 2 });
      }
    }

    const baseDetectionRadius = detectionRadius(enemy.speed);
    const _bagPassivesDetect = computeBagPassives(state.player.inventory);
    const isStealthy = (state.stealthMode && state.player.characterClass === '🥷') || _bagPassivesDetect.stealthBonus > 0;
    // When player lingers in the restaurant 3×3 safe zone, every mob on the map aggroes —
    // the smell of food and activity draws everything in. They lose track once the player leaves.
    const playerNearRestaurant = nearRestaurant(map, player.pos) && !isStealthy;
    const enemyDetectionRadius = playerNearRestaurant
      ? 9999
      : isStealthy
        ? Math.max(1, Math.ceil(baseDetectionRadius / 2))
        : baseDetectionRadius + (_bagPassivesDetect.stealthPenalty > 0 ? 2 : 0);
    const HUNT_TURNS_BASE = 5;

    if (enemy.engaged && dist > enemyDetectionRadius) {
      const remaining = (enemy.huntTurns ?? HUNT_TURNS_BASE) - 1;
      if (remaining <= 0) {
        log(`💨 ${enemy.name} lost sight of you!`);
        newEnemies[i] = { ...newEnemies[i], engaged: false, alertedBlind: undefined, huntTurns: undefined, patrolTarget: undefined };
        occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        continue;
      }
    }

    const engagedAfterUpdate = newEnemies[i].engaged;
    const entersCombat = enemy.tag === 'Neutral'
      ? engagedAfterUpdate
      : (dist <= enemyDetectionRadius || enemy.engaged);
    if (entersCombat) {
      if (!enemy.engaged && dist <= enemyDetectionRadius && enemy.tag !== 'Neutral') {
        if (_freezePassives.royalAura && Math.random() < 0.20) {
          log(`👑 ${enemy.emoji} ${enemy.name} cowers before your royal aura!`);
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          continue;
        }
        const traitHint = enemy.cowardly
          ? ' ...it looks ready to bolt!'
          : enemy.berserker
            ? ' ...it looks enraged!'
            : enemy.packHunter
              ? ' ...it calls to its allies!'
              : '';
        log(`${enemy.emoji} ${enemy.name} spotted you!${traitHint}${enemy.silent ? ' 🔇 (lone hunter — won\'t call for help)' : ''}`);
        if (enemy.isEcho) {
          log('✨ A boss echo — tread carefully.');
        }
        newFloatingTexts.push({
          id: `spot-${enemy.id}-${state.turn}`,
          pos: { x: enemy.pos.x, y: enemy.pos.y },
          text: '❗',
          color: '#facc15',
          life: 2,
        });

        if (enemy.silent) {
        } else {
          const ALERT_RADIUS = state.currentFloor >= 3 ? 2 : 3;
          const MAX_ALERT_HOPS = state.currentFloor >= 6 ? 1 : 2;
          const alertQueue: Array<{ idx: number; hop: number }> = [{ idx: i, hop: 0 }];
          const alertedIndices = new Set<number>([i]);

          while (alertQueue.length > 0) {
            const { idx: alerterIdx, hop } = alertQueue.shift()!;
            if (hop >= MAX_ALERT_HOPS) continue;
            const alerterPos = newEnemies[alerterIdx].pos;

            for (let j = 0; j < newEnemies.length; j++) {
              if (alertedIndices.has(j)) continue;
              const ally = newEnemies[j];
              if (ally.engaged) continue;
              if (ally.silent) continue;
              if (chebyshev(ally.pos, alerterPos) <= ALERT_RADIUS) {
                newEnemies[j] = { ...ally, engaged: true, alertedBlind: true, huntTurns: HUNT_TURNS_BASE };
                alertedIndices.add(j);
                log(`🔊 ${ally.name} heard the commotion!`);
                newFloatingTexts.push({
                  id: `alert-${ally.id}-${state.turn}-${hop}`,
                  pos: { x: ally.pos.x, y: ally.pos.y },
                  text: '❗',
                  color: '#facc15',
                  life: 2,
                });
                alertQueue.push({ idx: j, hop: hop + 1 });
              }
            }
          }
        }
      }

      const huntTurns = dist <= enemyDetectionRadius
        ? HUNT_TURNS_BASE
        : Math.max(0, (enemy.huntTurns ?? HUNT_TURNS_BASE) - 1);
      const alertedBlind = enemy.alertedBlind && dist > enemyDetectionRadius ? true : undefined;
      let updated: Enemy = { ...newEnemies[i], engaged: true, huntTurns, alertedBlind };

      if (enemy.cowardly && enemy.hp / enemy.maxHp < 0.3) {
        const fleePos = fleeStep(map, updated.pos, player.pos, occupied);
        if (fleePos) {
          updated = { ...updated, pos: fleePos, patrolTarget: undefined };
          occupied.add(`${fleePos.x},${fleePos.y}`);
          log(`💨 ${enemy.emoji} ${enemy.name} is terrified and flees!`);
        } else {
          occupied.add(`${updated.pos.x},${updated.pos.y}`);
        }
        newEnemies[i] = updated;
        continue;
      }

      if (enemy.madScientist) {
        const newCd = Math.max(0, (newEnemies[i].healCooldown ?? 3) - 1);
        let msUpdated: Enemy = { ...updated, healCooldown: newCd };
        if (newCd <= 0) {
          const healTarget = newEnemies.find((a, ai) => ai !== i && a.hp < a.maxHp && hasLOSBetween(map, enemy.pos, a.pos));
          if (healTarget) {
            const healAmt = Math.max(1, Math.ceil(healTarget.maxHp * 0.3));
            const ti = newEnemies.findIndex(a => a.id === healTarget.id);
            newEnemies[ti] = { ...healTarget, hp: Math.min(healTarget.maxHp, healTarget.hp + healAmt) };
            log(`🧑‍🔬 ${enemy.emoji} ${enemy.name} injects ${healTarget.emoji} ${healTarget.name}! (+${healAmt} HP)`);
            newFloatingTexts.push({ id: `madsci-${enemy.id}-${state.turn}`, pos: { ...healTarget.pos }, text: `+${healAmt}`, color: '#34d399', life: 2 });
            msUpdated = { ...msUpdated, healCooldown: 3 };
          }
        }
        const fleeP = fleeStep(map, msUpdated.pos, player.pos, occupied);
        if (fleeP) { msUpdated = { ...msUpdated, pos: fleeP, patrolTarget: undefined }; occupied.add(`${fleeP.x},${fleeP.y}`); }
        else { occupied.add(`${msUpdated.pos.x},${msUpdated.pos.y}`); }
        newEnemies[i] = msUpdated;
        continue;
      }

      const packBonus = enemy.packHunter
        ? Math.min(3, newEnemies.filter((a, ai) => ai !== i && chebyshev(a.pos, enemy.pos) <= 2).length)
        : 0;
      if (packBonus > 0 && !newLogs.some(l => l.text.includes(`${enemy.name} hunts`))) {
        log(`🐾 ${enemy.emoji} ${enemy.name} hunts in a pack! (+${packBonus} ATK)`);
      }

      const divineMult = (updated.divineBuff ?? 0) > 0 ? updated.divineBuff! : 1;
      if (divineMult > 1) {
        log(`✨ ${enemy.emoji} ${enemy.name} strikes with divine fury! (+25% damage)`);
        updated = { ...updated, divineBuff: 0 };
      }
      const monkeyBonus = (enemy.monkey && newEnemies[i].engaged) ? (newEnemies[i].stolenEmojis?.length ?? 0) : 0;
      if (monkeyBonus > 0) log(`🐒 ${enemy.emoji} ${enemy.name} fights with your stolen emojis! (+${monkeyBonus} ATK)`);
      const effectiveAttack = Math.round((enemy.attack + packBonus + monkeyBonus) * divineMult);

      if (enemy.ranged && hasLOSBetween(map, enemy.pos, player.pos) && chebyshev(enemy.pos, player.pos) <= playerVisionRadius && !playerDied) {
        // Simple visual line/flash for the arrow shot (reuses the pendingBeam system used by player ranger/wizard attacks)
        const dx = player.pos.x - enemy.pos.x;
        const dy = player.pos.y - enemy.pos.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
        const _aBeam: Position[] = [];
        for (let n = 1; n <= steps; n++) {
          _aBeam.push({
            x: Math.round(enemy.pos.x + (dx * n) / steps),
            y: Math.round(enemy.pos.y + (dy * n) / steps),
          });
        }
        enemyBeam = { positions: _aBeam, color: '#f59e0b' }; // warm elven arrow color

        if (enemy.ghostly) {
          moodDrain += 1;
          log(`👻 ${enemy.name}'s ethereal arrow chills your soul! (mood −1)`);
        }
        const dodgeChance = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
        if (Math.random() * 100 < dodgeChance) {
          log(`The ${enemy.name} shoots an arrow — you dodge!`);
        } else {
          const dmg = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
          playerHp -= dmg;
          log(`The ${enemy.name} shoots an arrow at you for ${dmg} damage!`);
          if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
          newFloatingTexts.push({
            id: `hit-p-${enemy.id}-ranged-${state.turn}-${Math.random()}`,
            pos: { ...player.pos },
            text: `-${dmg}`,
            color: '#f97316',
            life: 2,
          });
          if (enemy.berserker && !playerDied) {
            const dodgeChance2 = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
            if (Math.random() * 100 < dodgeChance2) {
              log(`🔥 The ${enemy.name} shoots an arrow again — you dodge!`);
            } else {
              const dmg2 = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
              playerHp -= dmg2;
              log(`🔥 The ${enemy.name} shoots an arrow again for ${dmg2} damage! (Berserk!)`);
              if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
              newFloatingTexts.push({
                id: `hit-p-${enemy.id}-ranged-berserk-${state.turn}-${Math.random()}`,
                pos: { ...player.pos },
                text: `-${dmg2}`,
                color: '#dc2626',
                life: 2,
              });
            }
            _flashSignals.berserkFlashPending = enemy.id;
          }
        }
        occupied.add(`${updated.pos.x},${updated.pos.y}`);
        newEnemies[i] = updated;
        continue;
      }

      if (dist <= 1) {
        if (enemy.ghostly) {
          moodDrain += 1;
          log(`👻 ${enemy.name}'s ethereal touch chills your soul! (mood −1)`);
        }
        const dodgeChance = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
        if (Math.random() * 100 < dodgeChance) {
          log(`${enemy.emoji} ${enemy.name} attacks — you dodge!`);
        } else {
          const dmg = enemy.crow
            ? 1
            : Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
          playerHp -= dmg;
          log(`${enemy.emoji} ${enemy.name} hits you for ${dmg} dmg!`);
          if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
          newFloatingTexts.push({
            id: `hit-p-${enemy.id}-adj-${state.turn}-${Math.random()}`,
            pos: { ...player.pos },
            text: `-${dmg}`,
            color: '#f97316',
            life: 2,
          });
          if (!playerDied) stealGoldOnCrowHit(enemy);
          if (enemy.berserker && !playerDied) {
            const dodgeChance2 = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
            if (Math.random() * 100 < dodgeChance2) {
              log(`🔥 ${enemy.emoji} ${enemy.name} attacks again — you dodge!`);
            } else {
              const dmg2 = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
              playerHp -= dmg2;
              log(`🔥 ${enemy.emoji} ${enemy.name} attacks again for ${dmg2} dmg! (Berserk!)`);
              if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
              newFloatingTexts.push({
                id: `hit-p-${enemy.id}-berserk-${state.turn}-${Math.random()}`,
                pos: { ...player.pos },
                text: `-${dmg2}`,
                color: '#dc2626',
                life: 2,
              });
            }
            _flashSignals.berserkFlashPending = enemy.id;
          }
        }
        occupied.add(`${updated.pos.x},${updated.pos.y}`);
      } else {
        const nextPos = enemy.waterAggro
          ? bfsStepToward(map, enemy.pos, player.pos, occupied, MERMAN_PASSABLE_TILES)
          : bfsStepToward(map, enemy.pos, player.pos, occupied);
        if (nextPos && !(nextPos.x === player.pos.x && nextPos.y === player.pos.y)) {
          updated = { ...updated, pos: nextPos, patrolTarget: undefined };
          occupied.add(`${nextPos.x},${nextPos.y}`);

          if (chebyshev(nextPos, player.pos) <= 1) {
            if (enemy.ghostly) {
              moodDrain += 1;
              log(`👻 ${enemy.name}'s ethereal touch chills your soul! (mood −1)`);
            }
            const dodgeChance = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
            if (Math.random() * 100 < dodgeChance) {
              log(`${enemy.emoji} ${enemy.name} lunges — you dodge!`);
            } else {
              const dmg = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
              playerHp -= dmg;
              log(`${enemy.emoji} ${enemy.name} lunges at you for ${dmg} dmg!`);
              if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
              newFloatingTexts.push({
                id: `hit-p-${enemy.id}-lunge-${state.turn}-${Math.random()}`,
                pos: { ...player.pos },
                text: `-${dmg}`,
                color: '#f97316',
                life: 2,
              });
              if (enemy.berserker && !playerDied) {
                const dodgeChance2 = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
                if (Math.random() * 100 < dodgeChance2) {
                  log(`🔥 ${enemy.emoji} ${enemy.name} attacks again — you dodge!`);
                } else {
                  const dmg2 = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
                  playerHp -= dmg2;
                  log(`🔥 ${enemy.emoji} ${enemy.name} attacks again for ${dmg2} dmg! (Berserk!)`);
                  if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
                  newFloatingTexts.push({
                    id: `hit-p-${enemy.id}-lunge-berserk-${state.turn}-${Math.random()}`,
                    pos: { ...player.pos },
                    text: `-${dmg2}`,
                    color: '#dc2626',
                    life: 2,
                  });
                }
                _flashSignals.berserkFlashPending = enemy.id;
              }
            }
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      }
      newEnemies[i] = updated;
    } else {
      let updated: Enemy = { ...newEnemies[i] };

      if (enemy.waterAggro) {
        let target = enemy.patrolTarget;
        const atTarget = target && target.x === enemy.pos.x && target.y === enemy.pos.y;
        if (!target || atTarget) {
          const waterTiles: Position[] = [];
          for (let wy = 1; wy < map.length - 1; wy++) {
            for (let wx = 1; wx < map[0].length - 1; wx++) {
              if (map[wy][wx].type === 'water') waterTiles.push({ x: wx, y: wy });
            }
          }
          if (waterTiles.length > 0) {
            target = waterTiles[Math.floor(Math.random() * waterTiles.length)];
            updated = { ...updated, patrolTarget: target };
          }
        }
        if (target) {
          const nextPos = bfsStepToward(map, enemy.pos, target, occupied, MERMAN_PASSABLE_TILES);
          if (nextPos && `${nextPos.x},${nextPos.y}` !== playerKey) {
            updated = { ...updated, pos: nextPos };
            occupied.add(`${nextPos.x},${nextPos.y}`);
          } else {
            updated = { ...updated, patrolTarget: undefined };
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      } else {
        const bounds = enemy.spawnRoomBounds;

        if (bounds) {
          let target = enemy.patrolTarget;
          const atTarget = target && target.x === enemy.pos.x && target.y === enemy.pos.y;
          if (!target || atTarget) {
            const rx = bounds.x + 1 + Math.floor(Math.random() * Math.max(1, bounds.w - 2));
            const ry = bounds.y + 1 + Math.floor(Math.random() * Math.max(1, bounds.h - 2));
            target = { x: rx, y: ry };
            updated = { ...updated, patrolTarget: target };
          }

          const nextPos = bfsStepToward(map, enemy.pos, target, occupied);
          if (nextPos && `${nextPos.x},${nextPos.y}` !== playerKey) {
            updated = { ...updated, pos: nextPos };
            occupied.add(`${nextPos.x},${nextPos.y}`);
          } else {
            updated = { ...updated, patrolTarget: undefined };
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      }

      newEnemies[i] = updated;
    }
  }

  let kitePos: Position | undefined;
  let trailblazerCooldown = Math.max(0, (player.trailblazerCooldown ?? 0) - 1);
  if (!playerDied && player.characterClass === '🧝') {
    const wasAdjacent = new Set(state.enemies.filter(e => chebyshev(e.pos, player.pos) <= 1).map(e => e.id));
    const trigger = newEnemies.find(e => chebyshev(e.pos, player.pos) <= 1 && !wasAdjacent.has(e.id));
    if (trigger) {
      if (trailblazerCooldown > 0) {
        log(`🧝 Trailblazer on cooldown (${trailblazerCooldown} turns)!`);
      } else {
        const kiteOccupied = new Set(newEnemies.map(e => `${e.pos.x},${e.pos.y}`));
        const kp = fleeStep(map, player.pos, trigger.pos, kiteOccupied, PLAYER_PASSABLE_TILES);
        if (kp) {
          kitePos = kp;
          trailblazerCooldown = 3;
          log(`🧝 Trailblazer — you spring away from ${trigger.emoji}!`);
        }
      }
    }
  }

  return { enemies: newEnemies.filter(e => e.hp > 0), playerHp, playerDied, killer, newLogs, newFloatingTexts, placedBombs: newBombs, activeProjectile: newProjectile, explosionPositions, kitePos, trailblazerCooldown, moodDrain, goldDrain, playerInventoryRemovals, playerInventoryAdditions, enemyBeam };
}

export function applyEnemyTurns(state: GameState, result: EnemyTurnResult): GameState {
  const tickedTexts = state.floatingTexts
    .map(ft => ({ ...ft, life: ft.life - 1 }))
    .filter(ft => ft.life > 0);
  const mergedFloating = [...result.newFloatingTexts, ...tickedTexts];

  let newInventory = state.player.inventory;
  let newBank = state.player.bank;
  if (result.playerInventoryRemovals.length > 0) {
    newInventory = newInventory.filter(i => !result.playerInventoryRemovals.includes(i.id));
  }
  if (result.playerInventoryAdditions.length > 0) {
    const added = addToBag(newInventory, newBank, ...result.playerInventoryAdditions);
    newInventory = added.inventory;
    newBank = added.bank;
  }
  const newMoodValue = result.moodDrain > 0
    ? Math.max(-100, state.player.stats.moodValue - result.moodDrain)
    : state.player.stats.moodValue;
  const newGold = result.goldDrain > 0
    ? Math.max(0, state.player.stats.gold - result.goldDrain)
    : state.player.stats.gold;
  const hasExtraChanges = result.playerInventoryRemovals.length > 0 || result.playerInventoryAdditions.length > 0 || result.moodDrain > 0 || result.goldDrain > 0;

  if (result.newLogs.length === 0 && result.playerHp === state.player.stats.hp && mergedFloating.length === 0 && state.floatingTexts.length === 0 && !hasExtraChanges) {
    return withVisibility({ ...state, enemies: result.enemies, floatingTexts: mergedFloating, placedBombs: result.placedBombs, activeProjectile: result.activeProjectile, pendingExplosion: result.explosionPositions.length > 0 ? result.explosionPositions : undefined, pendingBeam: result.enemyBeam ?? state.pendingBeam, player: { ...state.player, trailblazerCooldown: result.trailblazerCooldown } });
  }
  const mergedLogs = [...result.newLogs, ...state.logs].slice(0, 24);
  return withVisibility({
    ...state,
    enemies: result.enemies,
    player: {
      ...state.player,
      pos: result.kitePos ?? state.player.pos,
      stats: { ...state.player.stats, hp: result.playerHp, moodValue: newMoodValue, gold: newGold },
      inventory: newInventory,
      bank: newBank,
      trailblazerCooldown: result.trailblazerCooldown,
    },
    logs: mergedLogs,
    floatingTexts: mergedFloating,
    gameOver: state.gameOver || result.playerDied,
    killer: state.killer ?? result.killer,
    placedBombs: result.placedBombs,
    activeProjectile: result.activeProjectile,
    pendingExplosion: result.explosionPositions.length > 0 ? result.explosionPositions : undefined,
    pendingBeam: result.enemyBeam ?? state.pendingBeam,
  });
}
