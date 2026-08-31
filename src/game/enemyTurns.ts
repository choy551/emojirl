import { Enemy, EmojiItem, GameState, Position, FloatingText, PlacedBomb, ActiveProjectile } from './types';
import { chebyshev } from './geo';
import { applyEquipmentAndPassives, addToBag, computeBagPassives } from './inventory';
import { stealOneSoulEmoji, applySoulThefts, stolenEmojiSummary } from './monkeyLoot';
import { resolveProjectileFlight } from './projectiles';
import { withVisibility, visionRadiusFor } from './vision';
import { bfsStepToward, fleeStep, hasLOSBetween, detectionRadius } from './pathfinding';
import { PLAYER_PASSABLE_TILES, MERMAN_PASSABLE_TILES } from './tiles';
import { tickVolcanoAndLava } from './lava';
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

  const reclaimMonkeyLoot = (e: Enemy) => {
    if (e.monkey && e.stolenEmojis?.length) {
      playerInventoryAdditions.push(...e.stolenEmojis);
      log(`🐒 ${e.name} dropped your ${stolenEmojiSummary(e.stolenEmojis)}!`);
    }
  };

  const stealTakenFrom: Record<string, number> = {};

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
            reclaimMonkeyLoot(e);
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
    const extraBooms = newProjectile.kind === 'boomerang'
      ? state.player.bank.filter(it => it.activeKind === 'boomerang' && !it.consumed).length
      : 0;
    const shot = resolveProjectileFlight(newProjectile, map, newEnemies, player, state.turn, extraBooms);
    newEnemies.length = 0;
    newEnemies.push(...shot.enemies);
    newLogs.push(...shot.logs);
    newFloatingTexts.push(...shot.floats);
    explosionPositions.push(...shot.explosions);
    playerInventoryAdditions.push(...shot.stolenReturns);
    if (shot.beam) enemyBeam = shot.beam;
    if (shot.playerDamage > 0) {
      playerHp = Math.max(0, playerHp - shot.playerDamage);
    }
    if (shot.playerDied) {
      playerDied = true;
      killer = shot.killer;
    }
    newProjectile = shot.projectile;
  }

  const occupied = new Set<string>(newEnemies.map(e => `${e.pos.x},${e.pos.y}`));

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
    if (enemy.hp <= 0) continue;

    if ((enemy.burningTurns ?? 0) > 0) {
      const newBurning = enemy.burningTurns! - 1;
      const newHp = enemy.hp - 1;
      if (newHp <= 0) {
        reclaimMonkeyLoot(enemy);
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
        // Recruited companion: attack nearby hostiles, follow player.
        // Behavior mode (default 'close'):
        //   'close'      — follow within 3 tiles; chase & attack engaged hostiles near player
        //   'far'        — follow within 7 tiles; only attack adjacent enemies (hang back role)
        //   'flee'       — retreat toward player when HP < 50% and hostiles are near; else close
        //   'aggressive' — charge any visible hostile on the floor, ignoring engaged flag
        const behavior = enemy.companionBehavior ?? 'close';
        const searchRadius = enemy.bear ? 5 : 6;
        // Soul-emoji passive bonus to attack
        const soulAtkBonus = enemy.companionSoulEmoji?.bagPassive?.attackBonus ?? 0;
        const soulVampire  = !!(enemy.companionSoulEmoji?.bagPassive?.vampiricStrike);

        // Build the set of hostile targets based on behavior mode
        const hostileTargets = newEnemies.filter((e, ei) => {
          if (ei === i || e.hp <= 0 || e.tag === 'Friendly' || e.tag === 'Neutral') return false;
          if (behavior === 'aggressive') {
            // Any hostile within extended search radius (not just engaged)
            return chebyshev(e.pos, player.pos) <= searchRadius + 3;
          }
          return e.engaged && chebyshev(e.pos, player.pos) <= searchRadius;
        });
        hostileTargets.sort((a, b) => chebyshev(a.pos, enemy.pos) - chebyshev(b.pos, enemy.pos));
        const companionTarget = hostileTargets[0];

        // Flee logic: when HP < 50% and a hostile is nearby, run toward player
        const hpRatio = enemy.hp / enemy.maxHp;
        if (behavior === 'flee' && hpRatio < 0.5 && companionTarget && chebyshev(enemy.pos, companionTarget.pos) <= 3) {
          const nextPos = bfsStepToward(map, enemy.pos, player.pos, occupied);
          if (nextPos && !(nextPos.x === player.pos.x && nextPos.y === player.pos.y)) {
            newEnemies[i] = { ...newEnemies[i], pos: nextPos };
            occupied.add(`${nextPos.x},${nextPos.y}`);
          } else {
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          }
        } else if (companionTarget) {
          const distToTarget = chebyshev(enemy.pos, companionTarget.pos);
          // 'far' mode: don't chase — only strike if already adjacent
          const shouldChase = behavior !== 'far' || distToTarget <= 1;
          if (distToTarget <= 1) {
            const ti = newEnemies.findIndex(e => e.id === companionTarget.id);
            const effectiveAtk = enemy.attack + soulAtkBonus;
            const dmg = Math.max(1, effectiveAtk - Math.floor((companionTarget.defense ?? 0) / 2));
            const newTargetHp = companionTarget.hp - dmg;
            const logPrefix = enemy.bear ? '🐻' : '🤝';
            newFloatingTexts.push({ id: `companion-${enemy.id}-${state.turn}`, pos: { ...companionTarget.pos }, text: `-${dmg}`, color: enemy.bear ? '#f59e0b' : '#22d3ee', life: 2 });
            if (newTargetHp <= 0) {
              reclaimMonkeyLoot(companionTarget);
              newEnemies[ti] = { ...companionTarget, hp: 0 };
              log(`${logPrefix} ${enemy.emoji} ${enemy.name} takes down ${companionTarget.emoji} ${companionTarget.name}!`);
            } else {
              newEnemies[ti] = { ...companionTarget, hp: newTargetHp };
            }
            // Vampiric soul-emoji passive: heal 1 HP on hit
            if (soulVampire && enemy.hp < enemy.maxHp) {
              newEnemies[i] = { ...newEnemies[i], hp: Math.min(enemy.maxHp, enemy.hp + 1) };
            }
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          } else if (shouldChase) {
            const nextPos = bfsStepToward(map, enemy.pos, companionTarget.pos, occupied);
            if (nextPos) {
              newEnemies[i] = { ...newEnemies[i], pos: nextPos };
              occupied.add(`${nextPos.x},${nextPos.y}`);
            } else {
              occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
            }
          } else {
            // 'far' mode with distant target — don't chase, hold position
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          }
        } else {
          // No target — follow player if too far
          const followThreshold = behavior === 'far' ? 7 : 3;
          if (dist > followThreshold) {
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
              reclaimMonkeyLoot(guardTarget);
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
      const theft = stealOneSoulEmoji(player.inventory, stealTakenFrom);
      if (theft) {
        playerInventoryRemovals.push(theft.sourceId);
        const currentStolen = [...(newEnemies[i].stolenEmojis ?? []), theft.stolen];
        newEnemies[i] = { ...newEnemies[i], stolenEmojis: currentStolen };
        log(`🐒 ${enemy.emoji} ${enemy.name} snatched your ${theft.stolen.emoji}! (${currentStolen.length} stolen)`);
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
        const rangedVerb = enemy.name.toLowerCase().includes('mage')
          ? 'casts a bolt'
          : enemy.name.toLowerCase().includes('eye')
            ? 'fires a beam'
            : 'shoots an arrow';
        if (Math.random() * 100 < dodgeChance) {
          log(`The ${enemy.name} ${rangedVerb} — you dodge!`);
        } else {
          const dmg = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
          playerHp -= dmg;
          log(`The ${enemy.name} ${rangedVerb} at you for ${dmg} damage!`);
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
              log(`🔥 The ${enemy.name} ${rangedVerb} again — you dodge!`);
            } else {
              const dmg2 = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
              playerHp -= dmg2;
              log(`🔥 The ${enemy.name} ${rangedVerb} again for ${dmg2} damage! (Berserk!)`);
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
    newInventory = applySoulThefts(newInventory, result.playerInventoryRemovals);
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

  const pendingExplosion = result.explosionPositions.length > 0 ? result.explosionPositions : undefined;
  const pendingBeam = result.enemyBeam ?? state.pendingBeam;

  let next: GameState;
  if (result.newLogs.length === 0 && result.playerHp === state.player.stats.hp && mergedFloating.length === 0 && state.floatingTexts.length === 0 && !hasExtraChanges) {
    next = {
      ...state,
      enemies: result.enemies,
      floatingTexts: mergedFloating,
      placedBombs: result.placedBombs,
      activeProjectile: result.activeProjectile,
      pendingExplosion,
      pendingBeam,
      player: { ...state.player, trailblazerCooldown: result.trailblazerCooldown },
    };
  } else {
    next = {
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
      logs: [...result.newLogs, ...state.logs].slice(0, 24),
      floatingTexts: mergedFloating,
      gameOver: state.gameOver || result.playerDied,
      killer: state.killer ?? result.killer,
      placedBombs: result.placedBombs,
      activeProjectile: result.activeProjectile,
      pendingExplosion,
      pendingBeam,
    };
  }
  return withVisibility(tickVolcanoAndLava(next));
}
