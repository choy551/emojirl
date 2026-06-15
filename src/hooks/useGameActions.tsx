import { useCallback } from 'react';
import { Player, Enemy, Position, FloatingText } from '../game/types';
import { resolveCombat, getCowboyUnarmedBonus } from '../game/combat';
import { getRandomEmojiPower, getRandomHealDrop, getAmmoDrop, getBulletDrop, getRandomActiveDrop, getRandomEquipmentDrop } from '../game/emojis';
import { getMood } from '../game/moods';
import { generateMap } from '../game/mapgen';
import { markEnemySeen, markEmojiSeen, markEnemyKilled } from '../game/discoveries';
import {
  moodMax, chebyshev, hasLOS, hasLOSBetween, VISION_RADIUS, visionRadiusFor,
  eagleEyeRange, PLAYER_PASSABLE_TILES, computeVisibility, computeBagPassives,
  applyEquipmentAndPassives, withVisibility, runEnemyTurns, applyEnemyTurns, tickActiveBuffs,
  addToBag, levelFromXP,
  mpBonusForLevel, computeNinjaEvasion, getRandomCowboyFlavor, spawnEnemies,
  spawnVaultItems, handleGodBlessedImmunity,
  getDungeonPressure, _flashSignals,
} from '../game/gameHelpers';
import { canEquipItem } from '../components/itemUtils';
import { applyOverhealDecay, tickBlinkChainOutOfCombat, applyLevelUp } from '../game/playerTurn';
import type { GameRefs, GameSetters } from './actions/types';
import { useTacticsActions } from './actions/useTacticsActions';
import { useInventoryActions } from './actions/useInventoryActions';
import { useItemActions } from './actions/useItemActions';
import { useCombatActions } from './actions/useCombatActions';

const WAIT_HEAL = 1;

export function useGameActions(refs: GameRefs, setters: GameSetters) {
  const {
    gameStateRef, wizardTacticsRef, autoStealthRef, rangerModeRef,
    lastCowboyFlavorTurnRef,
    blinkTurnRef, trailblazeTurnRef,
  } = refs;
  const {
    setGameState, setWizardTactics, setRangerMode,
    setPendingFairyId, setPendingMonkeyInteraction,
    setPendingAdventurerInteraction,
    setBlinkTurn, setTrailblazeTurn,
  } = setters;

  const BLINK_ACTIVE = 3;

  const addLog = useCallback((text: string) => {
    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, logs: [{ id: Math.random().toString(), text, turn: prev.turn }, ...prev.logs].slice(0, 24) };
    });
  }, [setGameState]);

  // Helper to consistently return stolen emojis (via proper addToBag for stacking/banking) when a monkey is killed.
  // Used in all kill paths (melee/ranged/bolt/blink/zap/arc/etc) to fix incomplete returns.
  const applyMonkeyDropOnKill = (killed: any, p: Player) => {
    if (killed?.monkey && killed.stolenEmojis?.length) {
      const { inventory: ii, bank: bb } = addToBag(p.inventory, p.bank, ...killed.stolenEmojis);
      addLog(`🐒 ${killed.emoji} Monkey dropped your ${killed.stolenEmojis.map((e: any) => e.emoji).join('')}! Soul restored.`);
      return { ...p, inventory: ii, bank: bb };
    }
    return p;
  };

  const handleMove = useCallback((dx: number, dy: number) => {
    // Auto-deactivate expired Blink / Trailblaze (must run outside setGameState)
    const _outerState = gameStateRef.current;
    if (_outerState && !_outerState.gameOver) {
      const _cls = _outerState.player.characterClass;
      if (_cls === '🧙' && wizardTacticsRef.current.mode === 'holdfire' && _outerState.turn - blinkTurnRef.current >= BLINK_ACTIVE) {
        const _reset = { mode: 'nearest' as const, manualTargetId: null };
        wizardTacticsRef.current = _reset;
        setWizardTactics(_reset);
        addLog('✨ Blink faded — Arcane Barrage resumes');
      }
      if (_cls === '🧝' && rangerModeRef.current === 'flee' && _outerState.turn - trailblazeTurnRef.current >= BLINK_ACTIVE) {
        rangerModeRef.current = 'ranged';
        setRangerMode('ranged');
        addLog('💨 Trailblaze faded — bow at the ready');
      }
    }

    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;

      const { player } = prev;
      const cls = player.characterClass;

      const cowboyDualGuns = cls === '🤠' && player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
      if (cowboyDualGuns && player.ammo > 0) {
        for (let range = 2; range <= 4; range++) {
          const tx = player.pos.x + dx * range;
          const ty = player.pos.y + dy * range;
          const enemyIdx = prev.enemies.findIndex(e => e.pos.x === tx && e.pos.y === ty);
          if (enemyIdx === -1) continue;
          if (!hasLOS(prev.map, player.pos, dx, dy, range)) break;
          const enemy = prev.enemies[enemyIdx];
          if (enemy.tag === 'Friendly') continue;
          if (enemy.tag === 'Neutral' && !enemy.engaged) continue;
          markEnemySeen(enemy.emoji);
          const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, true);
          const effectiveCowboy = applyEquipmentAndPassives(player);
          const _cowboyPassives = computeBagPassives(prev.player.inventory);
          const cResult = resolveCombat(effectiveCowboy, enemy, addLog, { mood, cowboyMoodValue: prev.player.stats.moodValue, advantage: _cowboyPassives.advantageDice, execBlow: _cowboyPassives.execBlow, shieldWall: _cowboyPassives.shieldWall, isRanged: true });
          if (cResult.fled) { const midState = { ...prev, turn: prev.turn + 1 }; return applyEnemyTurns(midState, runEnemyTurns(midState)); }
          addLog(`🤠 Dual guns — BANG BANG!`);
          const cFloats: FloatingText[] = [];
          const cDmg = enemy.hp - cResult.enemyHp;
          if (cDmg > 0) cFloats.push({ id: `hit-e-cg-${enemy.id}-${prev.turn}`, pos: { ...enemy.pos }, text: `-${cDmg}`, color: '#fbbf24', life: 2 });
          const _cBeam: Position[] = [];
          for (let n = 1; n <= range; n++) _cBeam.push({ x: player.pos.x + dx * n, y: player.pos.y + dy * n });
          const cBeam = { positions: _cBeam, color: '#fbbf24' };
          let cEnemies = [...prev.enemies];
          let cPlayer: Player = { ...player, ammo: player.ammo - 1, stats: { ...player.stats, hp: cResult.playerHp } };
          let cSkip: string | undefined;
          let cKillCounts = { ...prev.killCounts };
          if (cResult.enemyDied) {
            markEnemyKilled(enemy.emoji);
            cKillCounts = { ...cKillCounts, [enemy.emoji]: (cKillCounts[enemy.emoji] ?? 0) + 1 };
            cPlayer = applyMonkeyDropOnKill(enemy, cPlayer);
            cEnemies.splice(enemyIdx, 1);
            cPlayer.stats.xp = cPlayer.stats.xp + (enemy.isBoss ? 25 : 5);
            cPlayer.stats.moodValue = Math.min(moodMax(cls), cPlayer.stats.moodValue + 10);
            if (enemy.isBoss || Math.random() < 0.50) {
              const r2 = Math.random();
              const cDrop = r2 < 0.12 ? getRandomEquipmentDrop(prev.currentFloor) : r2 < 0.28 ? getRandomActiveDrop() : Math.random() < 0.40 ? getBulletDrop() : getRandomHealDrop();
              const cItem = { ...cDrop, id: `drop-${Math.random()}`, consumed: false, pos: enemy.pos };
              const cMid = { ...prev, killCounts: cKillCounts, player: cPlayer, enemies: cEnemies, items: [...prev.items, cItem], turn: prev.turn + 1, floatingTexts: cFloats, pendingBeam: cBeam };
              return applyEnemyTurns(cMid, runEnemyTurns(cMid));
            }
          } else {
            const _cBurning = _cowboyPassives.burningOnHit ? { burningTurns: 3 } : {};
            if (_cowboyPassives.burningOnHit) addLog(`🔥 ${enemy.emoji} is ignited!`);
            cEnemies[enemyIdx] = { ...enemy, hp: cResult.enemyHp, engaged: true, ..._cBurning };
            cSkip = enemy.id;
          }
          if (cResult.playerDied) return { ...prev, killCounts: cKillCounts, player: cPlayer, enemies: cEnemies, floatingTexts: cFloats, gameOver: true, killer: { name: enemy.name, emoji: enemy.emoji } };
          const cMid = { ...prev, killCounts: cKillCounts, player: cPlayer, enemies: cEnemies, turn: prev.turn + 1, floatingTexts: cFloats, pendingBeam: cBeam };
          return applyEnemyTurns(cMid, runEnemyTurns(cMid, cSkip));
        }
      }

      if (cls === '🧝' && rangerModeRef.current === 'ranged') {
        for (let range = 2; range <= eagleEyeRange(player.stats.level); range++) {
          const tx = player.pos.x + dx * range;
          const ty = player.pos.y + dy * range;
          const enemyIdx = prev.enemies.findIndex(e => e.pos.x === tx && e.pos.y === ty);
          if (enemyIdx === -1) continue;
          if (!hasLOS(prev.map, player.pos, dx, dy, range)) break;

          if (player.ammo <= 0) {
            break;
          }

          const enemy = prev.enemies[enemyIdx];
          if (enemy.tag === 'Friendly') continue;
          if (enemy.tag === 'Neutral' && !enemy.engaged) continue;
          const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, player.characterClass === '🤠');
          const effectiveRanger = applyEquipmentAndPassives(player);
          const _rangerPassives = computeBagPassives(prev.player.inventory);
          const combatResult = resolveCombat(effectiveRanger, enemy, addLog, { mood, cowboyMoodValue: player.characterClass === '🤠' ? prev.player.stats.moodValue : undefined, advantage: _rangerPassives.advantageDice, execBlow: _rangerPassives.execBlow, trueAim: _rangerPassives.trueAim, shieldWall: _rangerPassives.shieldWall, firstShot: !enemy.engaged });

          const offHandAmmo = player.equipment.offHand?.specialAmmoKind;
          let specialAmmoEffect: Partial<Enemy> = {};
          if (!combatResult.fled && combatResult.enemyHp > 0 && offHandAmmo) {
            if (offHandAmmo === 'fire') {
              specialAmmoEffect = { burningTurns: 3 };
              addLog(`🔥 Fire arrow ignites ${enemy.emoji} ${enemy.name}!`);
            } else if (offHandAmmo === 'freeze') {
              specialAmmoEffect = { slowedTurns: 3, slowSkipNext: false };
              addLog(`🧊 Ice arrow slows ${enemy.emoji} ${enemy.name}!`);
            }
          }
          if (!combatResult.fled && combatResult.enemyHp > 0 && _rangerPassives.burningOnHit && !specialAmmoEffect.burningTurns) {
            specialAmmoEffect = { ...specialAmmoEffect, burningTurns: 3 };
            addLog(`🔥 ${enemy.emoji} is ignited!`);
          }

          if (combatResult.fled) {
            const midState = { ...prev, turn: prev.turn + 1 };
            return applyEnemyTurns(midState, runEnemyTurns(midState));
          }

          const rangedFloats: FloatingText[] = [];
          const rangedDmgToEnemy = enemy.hp - combatResult.enemyHp;
          if (rangedDmgToEnemy > 0) {
            rangedFloats.push({ id: `hit-e-ranged-${enemy.id}-${prev.turn}`, pos: { ...enemy.pos }, text: `-${rangedDmgToEnemy}`, color: '#ef4444', life: 2 });
          }
          const rangedDmgToPlayer = player.stats.hp - combatResult.playerHp;
          if (rangedDmgToPlayer > 0) {
            rangedFloats.push({ id: `hit-p-ranged-${prev.turn}`, pos: { ...player.pos }, text: `-${rangedDmgToPlayer}`, color: '#f97316', life: 2 });
          }
          const rangedBaseFloats = [...rangedFloats, ...prev.floatingTexts];
          const _rBeam: Position[] = [];
          for (let n = 1; n <= range; n++) _rBeam.push({ x: player.pos.x + dx * n, y: player.pos.y + dy * n });
          const rangerBeam = { positions: _rBeam, color: '#fb923c' };

          let newEnemies = [...prev.enemies];
          const ammoSaved = Math.random() < 0.5;
          if (ammoSaved) addLog(`🪶 Survivalist — ammo saved!`);
          let newPlayer: Player = {
            ...player,
            ammo: player.ammo - (ammoSaved ? 0 : 1),
            stats: { ...player.stats, hp: combatResult.playerHp },
          };

          let skipFightId: string | undefined;
          let rangerKillCounts = { ...prev.killCounts };
          if (combatResult.enemyDied) {
            markEnemyKilled(enemy.emoji);
            rangerKillCounts = { ...rangerKillCounts, [enemy.emoji]: (rangerKillCounts[enemy.emoji] ?? 0) + 1 };
            newPlayer = applyMonkeyDropOnKill(enemy, newPlayer);
            newEnemies.splice(enemyIdx, 1);
            const xpGain = enemy.isBoss ? 25 : 5;
            const newXP = newPlayer.stats.xp + xpGain;
            const oldLevel = newPlayer.stats.level;
            const newLevel = levelFromXP(newXP);
            newPlayer.stats.xp = newXP;
            if (enemy.isBoss) {
              addLog(`🏆 You defeated ${enemy.name}! +${xpGain} XP!`);
              addLog(`⬆️ Darkness stirs — enemies grow stronger from here on!`);
            }
            if (newLevel > oldLevel) {
              newPlayer = applyLevelUp(newPlayer, oldLevel, newLevel, addLog);
            }
            newPlayer.stats.moodValue = Math.min(moodMax(player.characterClass), newPlayer.stats.moodValue + 10);
            if (enemy.isBoss || Math.random() < 0.55) {
              let drop;
              if (enemy.isBoss) {
                drop = Math.random() < 0.4 ? getRandomEquipmentDrop(prev.currentFloor) : getRandomEmojiPower();
              } else {
                const r2 = Math.random();
                drop = r2 < 0.10 ? getRandomEquipmentDrop(prev.currentFloor) : r2 < 0.22 ? getRandomActiveDrop() : r2 < 0.57 ? getAmmoDrop() : getRandomHealDrop();
              }
              const newItem = { ...drop, id: `drop-${Math.random()}`, consumed: false, pos: enemy.pos };
              const midState = { ...prev, killCounts: rangerKillCounts, player: newPlayer, enemies: newEnemies, items: [...prev.items, newItem], turn: prev.turn + 1, floatingTexts: rangedBaseFloats, pendingBeam: rangerBeam, difficultyTier: enemy.isBoss ? (prev.difficultyTier ?? 0) + 1 : (prev.difficultyTier ?? 0) };
              return applyEnemyTurns(midState, runEnemyTurns(midState));
            }
          } else {
            newEnemies[enemyIdx] = { ...enemy, hp: combatResult.enemyHp, engaged: true, ...specialAmmoEffect };
            skipFightId = enemy.id;
          }

          if (combatResult.playerDied) return { ...prev, killCounts: rangerKillCounts, player: newPlayer, enemies: newEnemies, floatingTexts: rangedBaseFloats, gameOver: true, killer: { name: enemy.name, emoji: enemy.emoji } };
          const midState = { ...prev, killCounts: rangerKillCounts, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, floatingTexts: rangedBaseFloats, pendingBeam: rangerBeam };
          return applyEnemyTurns(midState, runEnemyTurns(midState, skipFightId));
        }
      }

      let newPos = { x: player.pos.x + dx, y: player.pos.y + dy };

      // ── Wizard Blink: teleport 2 tiles, ignoring intermediate tile ──────────
      const isBlinkActive = cls === '🧙' && wizardTacticsRef.current.mode === 'holdfire' && (prev.turn - blinkTurnRef.current) < BLINK_ACTIVE;
      if (isBlinkActive) {
        const pos2 = { x: player.pos.x + 2 * dx, y: player.pos.y + 2 * dy };
        if (pos2.y >= 0 && pos2.y < prev.map.length && pos2.x >= 0 && pos2.x < prev.map[0].length) {
          const destTile = prev.map[pos2.y][pos2.x];
          const _canSwimBlink = computeBagPassives(prev.player.inventory).canSwim;
          const destPassable = PLAYER_PASSABLE_TILES.has(destTile.type) || destTile.type === 'door-closed' || (destTile.type === 'water' && _canSwimBlink);
          if (destPassable) newPos = pos2;
        }
      }

      if (newPos.y < 0 || newPos.y >= prev.map.length || newPos.x < 0 || newPos.x >= prev.map[0].length) return prev;
      const tile = prev.map[newPos.y][newPos.x];

      if (tile.type === 'door-closed') {
        const noEnemy = !prev.enemies.some(e => e.pos.x === newPos.x && e.pos.y === newPos.y);
        if (noEnemy) {
          const openedMap = prev.map.map((row, my) =>
            row.map((t, mx) =>
              mx === newPos.x && my === newPos.y
                ? { ...t, type: 'door-open' as const, emoji: '🔓' }
                : t
            )
          );
          addLog('🚪 You open the door.');
          const midState = { ...prev, map: openedMap, turn: prev.turn + 1 };
          return applyEnemyTurns(withVisibility(midState), runEnemyTurns(midState));
        }
        return prev;
      }

      if (tile.type === 'water') {
        const canSwim = computeBagPassives(prev.player.inventory).canSwim;
        if (!canSwim) {
          const hasEnemyThere = prev.enemies.some(e => e.pos.x === newPos.x && e.pos.y === newPos.y);
          if (hasEnemyThere) {
            // fall through: allow melee bump attack on water enemies (e.g. Mermen near shore) without swimming
          } else {
            const itemIndex = prev.items.findIndex(it => it.pos.x === newPos.x && it.pos.y === newPos.y);
            if (itemIndex !== -1) {
              // special "bump" pickup for loot on water tiles (e.g. dropped by Mermen) without entering water
              let bumpedPlayer: Player = { ...player };
              const item = prev.items[itemIndex];
              const newItems = prev.items.filter((_, i) => i !== itemIndex);
              if (item.ammoAmount) {
                bumpedPlayer.ammo = (bumpedPlayer.ammo ?? 0) + item.ammoAmount;
                const _ammoWord = item.emoji === '🪙' ? 'bullets' : 'arrows';
                addLog(`${item.emoji} +${item.ammoAmount} ${_ammoWord} — ${bumpedPlayer.ammo} total`);
              } else {
                const { pos: _pos, ...pickedUp } = item;
                const isUnequippable = pickedUp.isEquipment && !canEquipItem(pickedUp, bumpedPlayer.characterClass);
                const bagCount = bumpedPlayer.inventory.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment).length;
                if (pickedUp.isEquipment) {
                  const autoSlot = !isUnequippable
                    ? (pickedUp.equipSlots ?? []).find(s => !bumpedPlayer.equipment[s as import('../game/types').EquipSlot])
                    : undefined;
                  if (autoSlot) {
                    bumpedPlayer = { ...bumpedPlayer, equipment: { ...bumpedPlayer.equipment, [autoSlot]: pickedUp } };
                    addLog(`Auto-equipped ${pickedUp.emoji} ${pickedUp.name} → ${autoSlot}!`);
                  } else {
                    bumpedPlayer = { ...bumpedPlayer, bank: [...bumpedPlayer.bank, pickedUp] };
                    addLog(isUnequippable
                      ? `Picked up ${pickedUp.emoji} ${pickedUp.name} — can't equip, sent to bank.`
                      : `Picked up ${pickedUp.emoji} ${pickedUp.name} → Equip tab (⚔️).`);
                  }
                } else if (pickedUp.healAmount !== undefined || bagCount < 9) {
                  bumpedPlayer.inventory = [...bumpedPlayer.inventory, pickedUp];
                  addLog(`Picked up ${pickedUp.emoji} ${pickedUp.name} (${pickedUp.description})`);
                } else {
                  bumpedPlayer.bank = [...bumpedPlayer.bank, pickedUp];
                  addLog(`Picked up ${pickedUp.emoji} ${pickedUp.name} — bag full, sent to bank.`);
                }
              }
              const midState = { ...prev, player: bumpedPlayer, items: newItems, turn: prev.turn + 1 };
              return applyEnemyTurns(withVisibility(midState), runEnemyTurns(midState));
            } else {
              addLog("You can't swim! 🌊 (Find a ⛵ Boat to cross water)");
              return prev;
            }
          }
        }
      } else if (!PLAYER_PASSABLE_TILES.has(tile.type)) {
        return prev;
      }

      // ── Ranger Trailblaze: sprint 2 tiles (passable + no enemy at dest) ─────
      const isTrailblazeActive = cls === '🧝' && rangerModeRef.current === 'flee' && (prev.turn - trailblazeTurnRef.current) < BLINK_ACTIVE;
      if (!isBlinkActive && isTrailblazeActive) {
        const pos2 = { x: newPos.x + dx, y: newPos.y + dy };
        if (pos2.y >= 0 && pos2.y < prev.map.length && pos2.x >= 0 && pos2.x < prev.map[0].length) {
          const tile2 = prev.map[pos2.y][pos2.x];
          const noEnemyAt2 = !prev.enemies.some(e => e.pos.x === pos2.x && e.pos.y === pos2.y);
          const tile2Passable = PLAYER_PASSABLE_TILES.has(tile2.type) || (tile2.type === 'water' && computeBagPassives(prev.player.inventory).canSwim);
          if (tile2Passable && noEnemyAt2) newPos = pos2;
        }
      }

      let newState = { ...prev };
      const updatedKillCounts = { ...prev.killCounts };

      if (cls === '🥷' && prev.stealthMode) {
        const newTile = prev.map[newPos.y][newPos.x];
        if (newTile.visible) {
          const dirs: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          const nearWall = dirs.some(([wy, wx]) => {
            const ny = newPos.y + wy, nx = newPos.x + wx;
            return ny >= 0 && ny < prev.map.length && nx >= 0 && nx < prev.map[0].length
              && prev.map[ny][nx].type === 'wall';
          });
          if (!nearWall) {
            newState.stealthMode = false;
            addLog('🥷 Stealth broken — stepped into open ground!');
          }
        }
        if (autoStealthRef.current && !newState.stealthMode) {
          const dirs8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          const nearWallNew = dirs8.some(([wy, wx]) => {
            const ny = newPos.y + wy, nx = newPos.x + wx;
            return ny >= 0 && ny < prev.map.length && nx >= 0 && nx < prev.map[0].length
              && prev.map[ny][nx].type === 'wall';
          });
          if (nearWallNew) newState = { ...newState, stealthMode: true };
        }
      }

      const enemyIndex = prev.enemies.findIndex(e => e.pos.x === newPos.x && e.pos.y === newPos.y);
      if (enemyIndex !== -1) {
        const enemy = prev.enemies[enemyIndex];
        markEnemySeen(enemy.emoji);

        if (enemy.isAdventurer && enemy.isRecruited) {
          // DCSS-style: bump into recruited companion swaps positions (prevents soft-locks in 1x1 hallways)
          const companion = prev.enemies[enemyIndex];
          const newEnemies = [...prev.enemies];
          newEnemies[enemyIndex] = { ...companion, pos: { x: player.pos.x, y: player.pos.y } };

          const newPlayer: Player = {
            ...player,
            pos: { x: companion.pos.x, y: companion.pos.y },
          };

          addLog(`You swap places with ${companion.emoji} ${companion.name}.`);

          // Mood update as if moving
          const hpRatio = newPlayer.stats.hp / newPlayer.stats.maxHp;
          if (hpRatio < 0.3) newPlayer.stats.moodValue = Math.max(-100, newPlayer.stats.moodValue - 3);
          else if (hpRatio < 0.5) newPlayer.stats.moodValue = Math.max(-100, newPlayer.stats.moodValue - 1);
          if (newPlayer.stats.moodValue > 0) newPlayer.stats.moodValue = Math.max(0, newPlayer.stats.moodValue - 1);
          else if (newPlayer.stats.moodValue < 0) newPlayer.stats.moodValue = Math.min(0, newPlayer.stats.moodValue + 1);

          const newState = { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1 };
          return applyEnemyTurns(newState, runEnemyTurns(newState));
        }
        if (enemy.isAdventurer && !enemy.engaged) {
          // Offer recruitment only while the adventurer is not in combat with the
          // player. If they're engaged (e.g. accidentally hit by a bomb/projectile
          // and now attacking back), fall through to normal melee so the player can
          // fight back. Recruited companions are handled by the swap branch above.
          setPendingAdventurerInteraction(enemy.id);
          return prev;
        }
        if (enemy.tag === 'Friendly' && !enemy.isAdventurer) {
          // Only genuine fairies reach here. Adventurers with tag 'Friendly' who are
          // engaged (e.g. splash-damaged) are intentionally allowed to fall through to
          // melee — the player caused it and deserves to be able to fight back.
          setPendingFairyId(enemy.id);
          return prev;
        }
        if (enemy.monkey && !enemy.engaged) {
          const MONKEY_FOODS = ['🍎', '🍖', '🧪', '🍇', '🫀', '🍞', '🧅', '🍄'];
          const wants = MONKEY_FOODS[Math.floor(Math.random() * MONKEY_FOODS.length)];
          setPendingMonkeyInteraction({ id: enemy.id, wants });
          return prev;
        }
        const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, cls === '🤠');
        const weakMelee = cls === '🧝' && player.ammo <= 0;
        const wizardMelee = cls === '🧙';
        const holdFire = isBlinkActive;
        const rangerFlee = isTrailblazeActive;
        const hasDualBlades = cls === '🥷' && player.equipment.mainHand?.weaponKind === 'blade' && player.equipment.offHand?.weaponKind === 'blade';
        const isPistolWhip = cowboyDualGuns && player.ammo <= 0;
        if (isPistolWhip) addLog(`🤠 I'll pistol whip tha' shit outta you!`);
        const isCowboyUnarmed = cls === '🤠' && !player.equipment.mainHand?.weaponKind && !player.equipment.offHand?.weaponKind;
        const cowboyIronFistBonus = (isPistolWhip || isCowboyUnarmed) ? getCowboyUnarmedBonus(player.stats.level) : 0;
        const meleeBasePlayer = cowboyIronFistBonus > 0
          ? { ...player, stats: { ...player.stats, attack: player.stats.attack + cowboyIronFistBonus } }
          : player;
        const effectiveMeleePlayer = applyEquipmentAndPassives(meleeBasePlayer);
        const combatPlayer = (holdFire || rangerFlee) ? { ...effectiveMeleePlayer, stats: { ...effectiveMeleePlayer.stats, defense: 0 } } : effectiveMeleePlayer;
        const _meleePassives = computeBagPassives(prev.player.inventory);
        const ninjaEvaCombatPlayer = cls === '🥷'
          ? { ...combatPlayer, stats: { ...combatPlayer.stats, evasion: computeNinjaEvasion(combatPlayer) } }
          : combatPlayer;
        const combatResult = resolveCombat(ninjaEvaCombatPlayer, enemy, addLog, { weakMelee, wizardMelee, pistolWhip: isPistolWhip, mood, cowboyMoodValue: cls === '🤠' ? prev.player.stats.moodValue : undefined, dualStrike: false, quadStrike: hasDualBlades, advantage: _meleePassives.advantageDice, execBlow: _meleePassives.execBlow, shieldWall: _meleePassives.shieldWall });

        if (cls === '🤠' && !combatResult.fled) {
          const dmgDealt = enemy.hp - Math.max(0, combatResult.enemyHp);
          const bigHit = combatResult.enemyDied || dmgDealt > enemy.hp * 0.4;
          const flavorElapsed = prev.turn - lastCowboyFlavorTurnRef.current;
          if ((combatResult.stunned || bigHit) && flavorElapsed >= 2) {
            addLog(`🤠 ${getRandomCowboyFlavor()}`);
            lastCowboyFlavorTurnRef.current = prev.turn;
          }
        }

        if (combatResult.fled) {
          let newPlayer = { ...player };
          newPlayer.stats.moodValue = Math.max(-100, newPlayer.stats.moodValue - 5);
          const midState = { ...prev, player: newPlayer, turn: prev.turn + 1 };
          return applyEnemyTurns(midState, runEnemyTurns(midState));
        }

        let newEnemies = [...prev.enemies];
        let newPlayer: Player = { ...player, stats: { ...player.stats, hp: combatResult.playerHp } };

        let skipFightId: string | undefined;
        const meleeBaseFloats: FloatingText[] = [];
        let godBlessedProc = false;
        if (combatResult.enemyDied && enemy.godBlessed) {
          const gb = handleGodBlessedImmunity(enemy, newEnemies, enemyIndex, newPlayer.stats.hp, prev.turn, addLog, meleeBaseFloats);
          if (gb.proc) {
            godBlessedProc = true;
            newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, hp: gb.newPlayerHp } };
            newEnemies = gb.newEnemies;
            skipFightId = enemy.id;
            if (gb.newPlayerHp <= 0) {
              return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, killCounts: updatedKillCounts, floatingTexts: [...meleeBaseFloats, ...prev.floatingTexts], gameOver: true, killer: { name: enemy.name, emoji: enemy.emoji } };
            }
          }
        }
        if (combatResult.enemyDied && !godBlessedProc) {
          markEnemyKilled(enemy.emoji);
          updatedKillCounts[enemy.emoji] = (updatedKillCounts[enemy.emoji] ?? 0) + 1;
          newPlayer = applyMonkeyDropOnKill(enemy, newPlayer);
          newEnemies.splice(enemyIndex, 1);
          const xpGain = enemy.isBoss ? 25 : 5;
          const newXP = newPlayer.stats.xp + xpGain;
          const oldLevel = newPlayer.stats.level;
          const newLevel = levelFromXP(newXP);
          newPlayer.stats.xp = newXP;
          if (enemy.isBoss) {
            addLog(`🏆 You defeated ${enemy.name}! +${xpGain} XP!`);
            addLog(`⬆️ Darkness stirs — enemies grow stronger from here on!`);
            newState.difficultyTier = (prev.difficultyTier ?? 0) + 1;
          }
          if (newLevel > oldLevel) {
            newPlayer = applyLevelUp(newPlayer, oldLevel, newLevel, addLog);
          }
          newPlayer.stats.moodValue = Math.min(moodMax(cls), newPlayer.stats.moodValue + 10);
          if (cls === '🥷') {
            const wasUnseen = !!prev.stealthMode;
            const freeMovesGain = wasUnseen ? 2 : 1;
            newState.ninjaFreeMoves = (prev.ninjaFreeMoves ?? 0) + freeMovesGain;
            if ((newPlayer.stats.blinkStrikeCooldown ?? 0) > 0) {
              const isInstakill = enemy.hp >= enemy.maxHp;
              const cdReduce = isInstakill ? 2 : 1;
              const newCd = Math.max(0, (newPlayer.stats.blinkStrikeCooldown ?? 0) - cdReduce);
              newPlayer.stats.blinkStrikeCooldown = newCd;
              const cdNote = newCd === 0 ? ' ⚡ Blink ready!' : ` Cooldown: ${newCd}t`;
              addLog(wasUnseen
                ? `🥷 Assassin's Edge — 2 free moves! (unseen kill)${cdNote}`
                : `🥷 Assassin's Edge — 1 free move!${cdNote}`);
            } else {
            addLog(wasUnseen
              ? `🥷 Assassin's Edge — 2 free moves! (unseen kill)`
              : `🥷 Assassin's Edge — 1 free move!`);
            }
          }
          if (cls === '🧙') {
            const prevMana = newPlayer.stats.mana ?? 0;
            const maxMana = newPlayer.stats.maxMana ?? 4;
            const mpRestore = Math.min(maxMana - prevMana, 3 + mpBonusForLevel(newPlayer.stats.level));
            if (mpRestore > 0) {
              newPlayer.stats.mana = prevMana + mpRestore;
              addLog(`⚔️ Arcane Feedback — +${mpRestore} MP (${prevMana + mpRestore}/${maxMana})`);
            }
          }

          if (enemy.isBoss) {
            const bossDrop = Math.random() < 0.4 ? getRandomEquipmentDrop() : getRandomEmojiPower();
            newState.items = [...prev.items, { ...bossDrop, id: `drop-${Math.random()}`, consumed: false, pos: enemy.pos }];
          } else if (Math.random() < Math.min(0.95, 0.55 + 0.15 * _meleePassives.bonusLoot)) {
            const roll = Math.random();
            const isEquipDrop = roll < 0.10;
            const isActiveDrop = !isEquipDrop && roll < 0.22;
            const dropAmmo = !isEquipDrop && !isActiveDrop && (
              cls === '🧝' ? Math.random() < 0.47 :
              cls === '🤠' && cowboyDualGuns ? Math.random() < 0.40 :
              cls === '🤠' ? Math.random() < 0.13 :
              Math.random() < 0.15
            );
            const drop = isEquipDrop ? getRandomEquipmentDrop(prev.currentFloor) : isActiveDrop ? getRandomActiveDrop() : dropAmmo ? (cls === '🤠' ? getBulletDrop() : getAmmoDrop()) : getRandomHealDrop();
            newState.items = [...prev.items, { ...drop, id: `drop-${Math.random()}`, consumed: false, pos: enemy.pos }];
          }
        } else if (!godBlessedProc) {
          const _mBurning = _meleePassives.burningOnHit ? { burningTurns: 3 } : {};
          if (_meleePassives.burningOnHit) addLog(`🔥 ${enemy.emoji} is ignited!`);
          newEnemies[enemyIndex] = { ...enemy, hp: combatResult.enemyHp, engaged: true, ..._mBurning };
          skipFightId = enemy.id;
        }

        const playerLanded = (combatResult.enemyDied && !godBlessedProc) || combatResult.enemyHp < enemy.hp;
        if (_meleePassives.lightningBolt && playerLanded) {
          const arcCandidates = newEnemies.filter(e2 =>
            e2.id !== enemy.id && chebyshev(e2.pos, enemy.pos) <= 2 && e2.hp > 0
          );
          if (arcCandidates.length > 0) {
            const arcCount = Math.min(arcCandidates.length, 1 + Math.floor(Math.random() * 3));
            const shuffled = [...arcCandidates].sort(() => Math.random() - 0.5).slice(0, arcCount);
            const arcedIds: string[] = [];
            for (const tgt of shuffled) {
              const idx = newEnemies.findIndex(e2 => e2.id === tgt.id);
              if (idx === -1) continue;
              const newHp = tgt.hp - 1;
              if (newHp <= 0) {
                markEnemyKilled(tgt.emoji);
                updatedKillCounts[tgt.emoji] = (updatedKillCounts[tgt.emoji] ?? 0) + 1;
                newPlayer = applyMonkeyDropOnKill(tgt, newPlayer);
                newEnemies.splice(idx, 1);
                newPlayer.stats.xp += tgt.isBoss ? 25 : 5;
              } else {
                newEnemies[idx] = { ...tgt, hp: newHp, engaged: true };
              }
              arcedIds.push(tgt.emoji);
            }
            if (arcedIds.length > 0) addLog(`⚡ Arc! ${arcedIds.join('')} zapped!`);
          }
        }

        if (combatResult.playerHp < prev.player.stats.hp) {
          newPlayer.stats.moodValue = Math.max(-100, newPlayer.stats.moodValue - 8);
        }

        const ninjaComboCount = _meleePassives.ninjaCombo || 0;
        const ninjaComboChance = 0.25 + (ninjaComboCount - 1) * 0.15;
        if (cls === '🥷' && ninjaComboCount > 0 && Math.random() < Math.min(0.8, ninjaComboChance)) {
          const nci = newEnemies.findIndex(e => e.id === enemy.id);
          if (nci !== -1) {
            const ncEnemy = newEnemies[nci];
            const ncDmg = Math.max(1, Math.floor(combatPlayer.stats.attack * 0.25) - (ncEnemy.defense ?? 0));
            addLog(`🗡️ Combo! +${ncDmg} bonus dmg!`);
            const ncNewHp = ncEnemy.hp - ncDmg;
            if (ncNewHp <= 0) {
              markEnemyKilled(ncEnemy.emoji);
              updatedKillCounts[ncEnemy.emoji] = (updatedKillCounts[ncEnemy.emoji] ?? 0) + 1;
              newPlayer = applyMonkeyDropOnKill(ncEnemy, newPlayer);
              newEnemies.splice(nci, 1);
              newPlayer.stats.xp += enemy.isBoss ? 25 : 5;
              newPlayer.stats.moodValue = Math.min(moodMax(cls), newPlayer.stats.moodValue + 10);
              skipFightId = undefined;
            } else {
              newEnemies[nci] = { ...ncEnemy, hp: ncNewHp };
            }
          }
        }

        const meleeFloats: FloatingText[] = [];
        const meleeDmgToEnemy = enemy.hp - combatResult.enemyHp;
        if (meleeDmgToEnemy > 0) {
          meleeFloats.push({ id: `hit-e-${enemy.id}-${prev.turn}`, pos: { ...enemy.pos }, text: `-${meleeDmgToEnemy}`, color: '#ef4444', life: 2 });
        }
        const meleeDmgToPlayer = player.stats.hp - combatResult.playerHp;
        if (meleeDmgToPlayer > 0) {
          meleeFloats.push({ id: `hit-p-melee-${prev.turn}`, pos: { ...player.pos }, text: `-${meleeDmgToPlayer}`, color: '#f97316', life: 2 });
        }

        const vampCount = _meleePassives.vampiricStrike || 0;
        if (vampCount > 0 && meleeDmgToEnemy > 0 && newPlayer.stats.hp < newPlayer.stats.maxHp) {
          newPlayer.stats.hp = Math.min(newPlayer.stats.maxHp, newPlayer.stats.hp + vampCount);
        }
        if (_meleePassives.healOnKill > 0 && combatResult.enemyDied && newPlayer.stats.hp < newPlayer.stats.maxHp) {
          const mushHeal = Math.min(_meleePassives.healOnKill, newPlayer.stats.maxHp - newPlayer.stats.hp);
          newPlayer.stats.hp += mushHeal;
          addLog(`🍄 Heal on kill! +${mushHeal} HP`);
        }
        const dodgeCount = _meleePassives.dodgeHeal || 0;
        if (dodgeCount > 0 && combatResult.dodged && newPlayer.stats.hp < newPlayer.stats.maxHp) {
          newPlayer.stats.hp = Math.min(newPlayer.stats.maxHp, newPlayer.stats.hp + dodgeCount);
          addLog(`🦋 Dodge heals! +${dodgeCount} HP`);
        }
        if (_meleePassives.thorns > 0 && meleeDmgToPlayer > 0) {
          const thornIdx = newEnemies.findIndex(e => e.id === enemy.id);
          if (thornIdx !== -1) {
            const thornNewHp = newEnemies[thornIdx].hp - _meleePassives.thorns;
            if (thornNewHp <= 0) {
              newEnemies.splice(thornIdx, 1);
              addLog(`💎 Thorns finish off ${enemy.emoji}!`);
            } else {
              newEnemies[thornIdx] = { ...newEnemies[thornIdx], hp: thornNewHp };
              addLog(`💎 Thorns reflect ${_meleePassives.thorns} dmg to ${enemy.emoji}!`);
            }
          }
        }

        newState.floatingTexts = [...meleeFloats, ...prev.floatingTexts];
        newState.killCounts = updatedKillCounts;

        if (combatResult.playerDied) {
          return { ...newState, player: newPlayer, enemies: newEnemies, turn: newState.turn + 1, gameOver: true, killer: { name: enemy.name, emoji: enemy.emoji } };
        }
        newState.player = newPlayer;
        newState.enemies = newEnemies;
        newState.turn++;
        return applyEnemyTurns(newState, runEnemyTurns(newState, skipFightId));
      }

      let newPlayer: Player = { ...player, pos: newPos, stats: { ...player.stats } };

      const hpRatio = newPlayer.stats.hp / newPlayer.stats.maxHp;
      if (hpRatio < 0.3) newPlayer.stats.moodValue = Math.max(-100, newPlayer.stats.moodValue - 3);
      else if (hpRatio < 0.5) newPlayer.stats.moodValue = Math.max(-100, newPlayer.stats.moodValue - 1);
      if (newPlayer.stats.moodValue > 0) newPlayer.stats.moodValue = Math.max(0, newPlayer.stats.moodValue - 1);
      else if (newPlayer.stats.moodValue < 0) newPlayer.stats.moodValue = Math.min(0, newPlayer.stats.moodValue + 1);

      const itemIndex = prev.items.findIndex(it => it.pos.x === newPos.x && it.pos.y === newPos.y);
      if (itemIndex !== -1) {
        const item = prev.items[itemIndex];
        newState.items = prev.items.filter((_, i) => i !== itemIndex);

        if (item.ammoAmount) {
          newPlayer.ammo = (newPlayer.ammo ?? 0) + item.ammoAmount;
          const _ammoWord = item.emoji === '🪙' ? 'bullets' : 'arrows';
          addLog(`${item.emoji} +${item.ammoAmount} ${_ammoWord} — ${newPlayer.ammo} total`);
        } else {
          const { pos: _pos, ...pickedUp } = item;
          const isUnequippable = pickedUp.isEquipment && !canEquipItem(pickedUp, newPlayer.characterClass);
          const bagCount = newPlayer.inventory.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment).length;
          if (pickedUp.isEquipment) {
            const autoSlot = !isUnequippable
              ? (pickedUp.equipSlots ?? []).find(s => !newPlayer.equipment[s as import('../game/types').EquipSlot])
              : undefined;
            if (autoSlot) {
              newPlayer = { ...newPlayer, equipment: { ...newPlayer.equipment, [autoSlot]: pickedUp } };
              addLog(`Auto-equipped ${pickedUp.emoji} ${pickedUp.name} → ${autoSlot}!`);
            } else {
              newPlayer = { ...newPlayer, bank: [...newPlayer.bank, pickedUp] };
              addLog(isUnequippable
                ? `Picked up ${pickedUp.emoji} ${pickedUp.name} — can't equip, sent to bank.`
                : `Picked up ${pickedUp.emoji} ${pickedUp.name} → Equip tab (⚔️).`);
            }
          } else if (pickedUp.healAmount !== undefined || bagCount < 9) {
            newPlayer.inventory = [...newPlayer.inventory, pickedUp];
            addLog(`Picked up ${pickedUp.emoji} ${pickedUp.name} (${pickedUp.description})`);
          } else {
            newPlayer = { ...newPlayer, bank: [...newPlayer.bank, pickedUp] };
            addLog(`🎒 Bag full! ${pickedUp.emoji} ${pickedUp.name} sent to bank. (B to open)`);
          }
          if (!pickedUp.healAmount) markEmojiSeen(pickedUp.emoji);
          newPlayer.stats.moodValue = Math.min(moodMax(cls), newPlayer.stats.moodValue + 5);
        }
      }

      const _mvPassives = computeBagPassives(newPlayer.inventory);
      if (_mvPassives.itemMagnet && newState.items.length > 0) {
        const magnetItems = newState.items.filter(it => it.pos && prev.map[it.pos.y]?.[it.pos.x]?.visible);
        if (magnetItems.length > 0) {
          for (const mItem of magnetItems) {
            const { pos: _mp, ...pickedUp } = mItem;
            if (pickedUp.ammoAmount) {
              newPlayer.ammo = (newPlayer.ammo ?? 0) + pickedUp.ammoAmount;
              const _magnetAmmoWord = pickedUp.emoji === '🪙' ? 'bullets' : 'arrows';
              addLog(`🧲 ${pickedUp.emoji} +${pickedUp.ammoAmount} ${_magnetAmmoWord} — ${newPlayer.ammo} total`);
            } else {
              const isUnequippableMagnet = pickedUp.isEquipment && !canEquipItem(pickedUp, newPlayer.characterClass);
              const bagCount = newPlayer.inventory.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment).length;
              if (pickedUp.isEquipment) {
                const autoSlotMagnet = !isUnequippableMagnet
                  ? (pickedUp.equipSlots ?? []).find(s => !newPlayer.equipment[s as import('../game/types').EquipSlot])
                  : undefined;
                if (autoSlotMagnet) {
                  newPlayer = { ...newPlayer, equipment: { ...newPlayer.equipment, [autoSlotMagnet]: pickedUp } };
                  addLog(`🧲 Auto-equipped ${pickedUp.emoji} ${pickedUp.name} → ${autoSlotMagnet}!`);
                } else {
                  newPlayer = { ...newPlayer, bank: [...newPlayer.bank, pickedUp] };
                  addLog(isUnequippableMagnet
                    ? `🧲 ${pickedUp.emoji} ${pickedUp.name} drawn to you — can't equip, sent to bank.`
                    : `🧲 ${pickedUp.emoji} ${pickedUp.name} drawn to you → Equip tab (⚔️).`);
                }
              } else if (pickedUp.healAmount !== undefined || bagCount < 9) {
                newPlayer.inventory = [...newPlayer.inventory, pickedUp];
                addLog(`🧲 ${pickedUp.emoji} ${pickedUp.name} drawn to you!`);
              } else {
                newPlayer = { ...newPlayer, bank: [...newPlayer.bank, pickedUp] };
                addLog(`🧲 ${pickedUp.emoji} ${pickedUp.name} drawn to you — bag full, sent to bank.`);
              }
              if (!pickedUp.healAmount) markEmojiSeen(pickedUp.emoji);
              newPlayer.stats.moodValue = Math.min(moodMax(cls), newPlayer.stats.moodValue + 3);
            }
          }
          newState.items = newState.items.filter(it => !magnetItems.some(m => m.id === it.id));
        }
      }

      if (tile.type === 'shrine') {
        const shrineAmt = 2 + Math.floor((prev.currentFloor - 1) / 2);
        const oldMaxHp = newPlayer.stats.maxHp;
        const currentOverheal = Math.max(0, newPlayer.stats.hp - oldMaxHp);
        if (cls === '🧙') {
          // Wizard shrine gives +max MP and a plain +HP heal (no +max HP, no overheal).
          // Heal up to maxHp, but never strip an existing overheal buffer (e.g. from the 🍺 bar).
          const healedHp = Math.max(newPlayer.stats.hp, Math.min(newPlayer.stats.maxHp, newPlayer.stats.hp + shrineAmt));
          const newMaxMana = (newPlayer.stats.maxMana ?? 4) + 1;
          newPlayer.stats = { ...newPlayer.stats, hp: healedHp, maxMana: newMaxMana, mana: newMaxMana };
        } else {
          const newMaxHp = oldMaxHp + shrineAmt;
          // Preserve any existing overheal buffer from bar (hp - oldMax) on top of the new max.
          // Also apply the shrine's +shrineAmt heal effect without letting the max increase "eat" the buffer.
          const shrineHealTarget = newPlayer.stats.hp + shrineAmt;
          const healedHp = Math.max(shrineHealTarget, newMaxHp + currentOverheal);
          newPlayer.stats = { ...newPlayer.stats, maxHp: newMaxHp, hp: healedHp };
        }
        const newMap = newState.map.map((row, my) =>
          row.map((t, mx) =>
            mx === newPos.x && my === newPos.y
              ? { ...t, type: 'shrine-used' as const, emoji: '🪨' }
              : t
          )
        );
        newState.map = newMap;
        newState.floatingTexts = [
          { id: `shrine-${newPos.x}-${newPos.y}-${prev.turn}`, pos: { ...newPos }, text: cls === '🧙' ? `+${shrineAmt} HP / +1 MAX MP` : `+${shrineAmt} HP / +${shrineAmt} MAX`, color: '#34d399', life: 3 },
          ...prev.floatingTexts,
        ];
        addLog(cls === '🧙' ? `🛕 Arcane shrine — +${shrineAmt} HP & +1 max MP! Full mana restored!` : `🛕 The shrine pulses with light — +${shrineAmt} HP & +${shrineAmt} max HP!`);
      }

      if (tile.type === 'shop-item') {
        if (tile.emoji === '🍺') {
          const cost = 15;
          if (newPlayer.stats.hp > newPlayer.stats.maxHp) {
            // Already overhealed — don't charge XP or re-apply.
            addLog(`🍺 Innkeeper: You're already overhealed — come back when it fades!`);
          } else if (newPlayer.stats.xp >= cost) {
            const overhealHp = Math.floor(newPlayer.stats.maxHp * 1.5);
            const isWizard = newPlayer.characterClass === '🧙';
            newPlayer.stats = {
              ...newPlayer.stats,
              hp: overhealHp,
              xp: newPlayer.stats.xp - cost,
              overhealDecayTick: 0,
              ...(isWizard ? { mana: newPlayer.stats.maxMana ?? 4 } : {}),
            };
            const newMap = newState.map.map((row, my) =>
              row.map((t, mx) =>
                mx === newPos.x && my === newPos.y
                  ? { ...t, type: 'safe-floor' as const, emoji: '⬜' }
                  : t
              )
            );
            newState.map = newMap;
            newState.floatingTexts = [
              { id: `bar-${newPos.x}-${newPos.y}-${prev.turn}`, pos: { ...newPos }, text: `✨ OVERHEAL! (${overhealHp} HP)`, color: '#fbbf24', life: 4 },
              ...prev.floatingTexts,
            ];
            const mpMsg = isWizard ? ' MP fully restored!' : '';
            addLog(`🍺 Innkeeper charges 15 XP — full heal & overheal! HP: ${overhealHp} (decays to ${newPlayer.stats.maxHp}).${mpMsg}`);
          } else {
            addLog(`🍺 Innkeeper wants 15 XP — you only have ${newPlayer.stats.xp}. Earn more first!`);
          }
        } else if (tile.emoji === '📦') {
          const cls = newPlayer.characterClass;
          if (cls === '🤠') addLog('📦 Ammo cache! Stock up on bullets before the boss.');
          else if (cls === '🧝') addLog('📦 Supply crate! Grab some arrows before the boss.');
          else addLog('📦 A supply crate — nothing here for you.');
        } else {
          addLog('🏪 Welcome to the shop! Buy & sell emojis for gold.');
        }
      }

      if (tile.type === 'restaurant') {
        addLog('🏪 Welcome to the Restaurant! Food & rest available — food smell draws enemies...');
      }

      if (tile.type === 'stairs') {
        const nextFloor = prev.currentFloor + 1;
        const { map, startPos, rooms } = generateMap(nextFloor);
        newState.map = computeVisibility(map, startPos, visionRadiusFor(newPlayer.characterClass, newPlayer.stats.level));
        newPlayer.pos = startPos;
        newState.currentFloor = nextFloor;
        newState.enemies = spawnEnemies(nextFloor, rooms, startPos, prev.difficultyTier ?? 0, map);
        newState.items = spawnVaultItems(rooms, newPlayer.characterClass, nextFloor);
        newState.placedBombs = [];
        newState.activeProjectile = null;
        newState.pendingExplosion = undefined;
        newState.pendingBeam = undefined;
        if (nextFloor % 5 === 0) {
          addLog(`⚠️ Floor ${nextFloor} — a boss lurks here! Prepare yourself!`);
        } else {
          addLog(`Descended to floor ${nextFloor}.`);
        }
        const newPressureTier = getDungeonPressure(nextFloor).atk;
        const highestWarned = prev.highestPressureTierWarned ?? 0;
        if (newPressureTier > 0 && newPressureTier > highestWarned) {
          addLog(`⚠️ Dungeon Pressure rises to +${newPressureTier}! Enemies grow stronger.`);
          newState.highestPressureTierWarned = newPressureTier;
          _flashSignals.pressureFlashPending = true;
        }
        if (rooms.some(r => r.theme === 'monster-den')) addLog(`🦴 You sense a terrible presence nearby...`);
        if (rooms.some(r => r.theme === 'treasure-vault')) addLog(`💎 You sense hidden treasure surrounded by water...`);
        newPlayer.stats.moodValue = Math.min(moodMax(cls), newPlayer.stats.moodValue + 15);
        if (cls === '🧙') newPlayer.stats.mana = newPlayer.stats.maxMana ?? 4;
        newState.stealthMode = false;
        newState.ninjaFreeMoves = 0;
        newState.player = newPlayer;
        newState.turn++;
        return newState;
      }

      if (cls === '🧙') {
        const boltCandidates = newState.enemies.filter(e => {
          const dist = chebyshev(newPlayer.pos, e.pos);
          return dist > 1 && dist <= VISION_RADIUS && hasLOSBetween(newState.map, newPlayer.pos, e.pos)
            && (e.tag === 'Hostile' || e.engaged);
        });
        const boltTactics = wizardTacticsRef.current;
        const boltTarget = boltTactics.mode === 'holdfire'
          ? undefined
          : boltTactics.mode === 'furthest'
            ? [...boltCandidates].sort((a, b) => chebyshev(newPlayer.pos, b.pos) - chebyshev(newPlayer.pos, a.pos))[0]
            : boltTactics.mode === 'manual'
              ? (boltCandidates.find(e => e.id === boltTactics.manualTargetId) ??
                 [...boltCandidates].sort((a, b) => chebyshev(newPlayer.pos, a.pos) - chebyshev(newPlayer.pos, b.pos))[0])
              : [...boltCandidates].sort((a, b) => chebyshev(newPlayer.pos, a.pos) - chebyshev(newPlayer.pos, b.pos))[0];

        if (boltTarget && (newPlayer.stats.mana ?? 0) > 0) {
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, mana: Math.max(0, (newPlayer.stats.mana ?? 0) - 1) } };
          const boltMood = getMood(newPlayer.stats.moodValue, newPlayer.stats.hp, newPlayer.stats.maxHp, newPlayer.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, false);
          const _boltPassives = computeBagPassives(newPlayer.inventory);
          const boltResult = resolveCombat(applyEquipmentAndPassives(newPlayer), boltTarget, addLog, { mood: boltMood, advantage: _boltPassives.advantageDice, execBlow: _boltPassives.execBlow, trueAim: _boltPassives.trueAim, shieldWall: _boltPassives.shieldWall });

          const boltDmg = boltTarget.hp - boltResult.enemyHp;
          const boltPlayerDmg = newPlayer.stats.hp - boltResult.playerHp;
          const boltFloats: FloatingText[] = [];
          if (boltDmg > 0) boltFloats.push({ id: `bolt-e-${boltTarget.id}-${newState.turn}`, pos: { ...boltTarget.pos }, text: `-${boltDmg}`, color: '#a78bfa', life: 2 });
          if (boltPlayerDmg > 0) boltFloats.push({ id: `bolt-p-${newState.turn}`, pos: { ...newPlayer.pos }, text: `-${boltPlayerDmg}`, color: '#f97316', life: 2 });
          newState.floatingTexts = [...boltFloats, ...(newState.floatingTexts ?? [])];
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, hp: boltResult.playerHp } };

          if (boltResult.playerDied) {
            return { ...newState, player: newPlayer, turn: newState.turn + 1, gameOver: true, killer: { name: boltTarget.name, emoji: boltTarget.emoji } };
          }

          const boltEnemyIdx = newState.enemies.findIndex(e => e.id === boltTarget.id);
          let boltEnemies = [...newState.enemies];
          if (boltResult.enemyDied) {
            markEnemyKilled(boltTarget.emoji);
            newState.killCounts = { ...newState.killCounts, [boltTarget.emoji]: (newState.killCounts[boltTarget.emoji] ?? 0) + 1 };
            newPlayer = applyMonkeyDropOnKill(boltTarget, newPlayer);
            boltEnemies.splice(boltEnemyIdx, 1);
            const boltXpGain = boltTarget.isBoss ? 25 : 5;
            const boltXP = newPlayer.stats.xp + boltXpGain;
            const boltOldLevel = newPlayer.stats.level;
            const boltNewLevel = levelFromXP(boltXP);
            newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, xp: boltXP, moodValue: Math.min(moodMax(cls), newPlayer.stats.moodValue + 10) } };
            if (boltTarget.isBoss) {
              addLog(`🏆 You defeated ${boltTarget.name}! +${boltXpGain} XP!`);
              addLog(`⬆️ Darkness stirs — enemies grow stronger from here on!`);
              newState.difficultyTier = (newState.difficultyTier ?? 0) + 1;
            }
            if (boltNewLevel > boltOldLevel) {
              newPlayer = applyLevelUp(newPlayer, boltOldLevel, boltNewLevel, addLog);
            }
            if (boltTarget.isBoss || Math.random() < 0.55) {
              const r2 = Math.random();
              const bDrop = boltTarget.isBoss
                ? (r2 < 0.4 ? getRandomEquipmentDrop(prev.currentFloor) : getRandomEmojiPower())
                : (r2 < 0.10 ? getRandomEquipmentDrop(prev.currentFloor) : getRandomHealDrop());
              newState.items = [...newState.items, { ...bDrop, id: `bolt-drop-${Math.random()}`, consumed: false, pos: boltTarget.pos }];
            }
          } else {
            const _bBurning = _boltPassives.burningOnHit ? { burningTurns: 3 } : {};
            if (_boltPassives.burningOnHit) addLog(`🔥 ${boltTarget.emoji} is ignited!`);
            boltEnemies[boltEnemyIdx] = { ...boltTarget, hp: boltResult.enemyHp, engaged: true, ..._bBurning };
          }
          newState.enemies = boltEnemies;
          const _bdx = boltTarget.pos.x - newPlayer.pos.x;
          const _bdy = boltTarget.pos.y - newPlayer.pos.y;
          const _bsteps = Math.max(Math.abs(_bdx), Math.abs(_bdy));
          const _bBeam: Position[] = [];
          for (let n = 1; n <= _bsteps; n++) {
            _bBeam.push({ x: Math.round(newPlayer.pos.x + (_bdx * n) / _bsteps), y: Math.round(newPlayer.pos.y + (_bdy * n) / _bsteps) });
          }
          newState.pendingBeam = { positions: _bBeam, color: '#a78bfa' };
        }
      }

      if (cls === '🤠') {
        const flavorElapsed = newState.turn - lastCowboyFlavorTurnRef.current;
        const flavorInterval = 4 + Math.floor(Math.random() * 3);
        if (flavorElapsed >= flavorInterval && Math.random() < 0.6) {
          addLog(`🤠 ${getRandomCowboyFlavor()}`);
          lastCowboyFlavorTurnRef.current = newState.turn;
        }
      }

      // Tick blink strike cooldown per turn
      if (cls === '🥷' && (newPlayer.stats.blinkStrikeCooldown ?? 0) > 0) {
        newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, blinkStrikeCooldown: (newPlayer.stats.blinkStrikeCooldown ?? 1) - 1 } };
      }

      // Out-of-combat decay for Blink Strike instakill chain (resets 2/3 or 3/3 after 10 turns with no engaged enemies)
      newPlayer = tickBlinkChainOutOfCombat(newPlayer, prev.enemies.some(e => e.engaged), addLog);

      // Overheal decay: every 5 turns, shed 1 HP until back to natural maxHp
      {
        const ohDecay = applyOverhealDecay(newPlayer, newState.turn, newPlayer.pos, 'oh-decay');
        newPlayer = ohDecay.player;
        if (ohDecay.float) newState.floatingTexts = [ohDecay.float, ...newState.floatingTexts];
      }

      newState.player = newPlayer;
      newState.turn++;

      // Assassin's Edge: free movement turns — enemies don't act
      if (cls === '🥷' && (prev.ninjaFreeMoves ?? 0) > 0) {
        const remaining = (prev.ninjaFreeMoves ?? 0) - 1;
        newState.ninjaFreeMoves = remaining;
        if (remaining > 0) addLog(`🥷 Ghost step! (${remaining} free move${remaining !== 1 ? 's' : ''} left)`);
        return withVisibility(newState);
      }

      return withVisibility(applyEnemyTurns(newState, runEnemyTurns(newState)));
    });
  }, [addLog, setGameState, rangerModeRef, wizardTacticsRef, autoStealthRef, lastCowboyFlavorTurnRef, blinkTurnRef, trailblazeTurnRef, setWizardTactics, setRangerMode, setBlinkTurn, setTrailblazeTurn, gameStateRef]);

  const handleWait = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const cls = prev.player.characterClass;
      const { x: px, y: py } = prev.player.pos;
      const nearCampfire = [-1, 0, 1].some(dy =>
        [-1, 0, 1].some(dx => prev.map[py + dy]?.[px + dx]?.type === 'campfire')
      );
      const nearRest = [-1, 0, 1].some(dy =>
        [-1, 0, 1].some(dx => prev.map[py + dy]?.[px + dx]?.type === 'restaurant')
      );
      const onCampfire = nearCampfire || nearRest;
      const campfireBonus = onCampfire ? 2 : 0;
      const stats = { ...prev.player.stats };
      const waitPassives = computeBagPassives(prev.player.inventory);
      const regen = waitPassives.combatRegen || 0;
      const totalHeal = WAIT_HEAL + regen + campfireBonus;
      const atFull = stats.hp >= stats.maxHp;
      if (!atFull) {
        stats.hp = Math.min(stats.maxHp, stats.hp + totalHeal);
        stats.moodValue = Math.min(moodMax(cls), stats.moodValue + 2);
      }
      // Tick down active food buffs each turn
      Object.assign(stats, tickActiveBuffs(stats));

      if (cls === '🧙') {
        const seenByEnemy = prev.enemies.some(e =>
          chebyshev(prev.player.pos, e.pos) <= VISION_RADIUS &&
          hasLOSBetween(prev.map, prev.player.pos, e.pos)
        );
        if (!seenByEnemy) {
          stats.mana = Math.min(stats.maxMana ?? 4, (stats.mana ?? 0) + 1);
        }
      }

      let waitPlayer = { ...prev.player, stats };
      let waitEnemies = [...prev.enemies];
      let waitItems = prev.items;
      let waitKillCounts = prev.killCounts;
      const waitFloats: FloatingText[] = [];
      let waitBeam: { positions: Position[]; color: string } | undefined;

      if (cls === '🧙') {
        const boltCandidates = waitEnemies.filter(e => {
          const dist = chebyshev(waitPlayer.pos, e.pos);
          return dist > 1 && dist <= VISION_RADIUS && hasLOSBetween(prev.map, waitPlayer.pos, e.pos);
        });
        const boltTactics = wizardTacticsRef.current;
        const boltTarget = boltTactics.mode === 'holdfire'
          ? undefined
          : boltTactics.mode === 'furthest'
            ? [...boltCandidates].sort((a, b) => chebyshev(waitPlayer.pos, b.pos) - chebyshev(waitPlayer.pos, a.pos))[0]
            : boltTactics.mode === 'manual'
              ? (boltCandidates.find(e => e.id === boltTactics.manualTargetId) ??
                 [...boltCandidates].sort((a, b) => chebyshev(waitPlayer.pos, a.pos) - chebyshev(waitPlayer.pos, b.pos))[0])
              : [...boltCandidates].sort((a, b) => chebyshev(waitPlayer.pos, a.pos) - chebyshev(waitPlayer.pos, b.pos))[0];

        if (boltTarget && (waitPlayer.stats.mana ?? 0) > 0) {
          waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, mana: Math.max(0, (waitPlayer.stats.mana ?? 0) - 1) } };
          const boltMood = getMood(waitPlayer.stats.moodValue, waitPlayer.stats.hp, waitPlayer.stats.maxHp, waitPlayer.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, false);
          const _boltPassives = computeBagPassives(waitPlayer.inventory);
          const boltResult = resolveCombat(applyEquipmentAndPassives(waitPlayer), boltTarget, addLog, { mood: boltMood, advantage: _boltPassives.advantageDice, execBlow: _boltPassives.execBlow, trueAim: _boltPassives.trueAim, shieldWall: _boltPassives.shieldWall });
          const boltDmg = boltTarget.hp - boltResult.enemyHp;
          const boltPlayerDmg = waitPlayer.stats.hp - boltResult.playerHp;
          if (boltDmg > 0) waitFloats.push({ id: `bolt-e-${boltTarget.id}-${prev.turn}`, pos: { ...boltTarget.pos }, text: `-${boltDmg}`, color: '#a78bfa', life: 2 });
          if (boltPlayerDmg > 0) waitFloats.push({ id: `bolt-p-${prev.turn}`, pos: { ...waitPlayer.pos }, text: `-${boltPlayerDmg}`, color: '#f97316', life: 2 });
          waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, hp: boltResult.playerHp } };
          if (boltResult.playerDied) {
            return { ...prev, player: waitPlayer, enemies: waitEnemies, floatingTexts: [...waitFloats, ...(prev.floatingTexts ?? [])], turn: prev.turn + 1, gameOver: true, killer: { name: boltTarget.name, emoji: boltTarget.emoji } };
          }
          const boltEnemyIdx = waitEnemies.findIndex(e => e.id === boltTarget.id);
          if (boltResult.enemyDied) {
            markEnemyKilled(boltTarget.emoji);
            waitKillCounts = { ...waitKillCounts, [boltTarget.emoji]: (waitKillCounts[boltTarget.emoji] ?? 0) + 1 };
            waitPlayer = applyMonkeyDropOnKill(boltTarget, waitPlayer);
            waitEnemies.splice(boltEnemyIdx, 1);
            const boltXpGain = boltTarget.isBoss ? 25 : 5;
            const boltXP = waitPlayer.stats.xp + boltXpGain;
            const boltOldLevel = waitPlayer.stats.level;
            const boltNewLevel = levelFromXP(boltXP);
            waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, xp: boltXP, moodValue: Math.min(moodMax(cls), waitPlayer.stats.moodValue + 10) } };
            if (boltTarget.isBoss) {
              addLog(`🏆 You defeated ${boltTarget.name}! +${boltXpGain} XP!`);
              addLog(`⬆️ Darkness stirs — enemies grow stronger from here on!`);
            }
            if (boltNewLevel > boltOldLevel) {
              waitPlayer = applyLevelUp(waitPlayer, boltOldLevel, boltNewLevel, addLog);
            }
            if (boltTarget.isBoss || Math.random() < 0.55) {
              const r2 = Math.random();
              const bDrop = boltTarget.isBoss
                ? (r2 < 0.4 ? getRandomEquipmentDrop(prev.currentFloor) : getRandomEmojiPower())
                : (r2 < 0.10 ? getRandomEquipmentDrop(prev.currentFloor) : getRandomHealDrop());
              waitItems = [...waitItems, { ...bDrop, id: `bolt-drop-${Math.random()}`, consumed: false, pos: boltTarget.pos }];
            }
          } else {
            const _bBurning = _boltPassives.burningOnHit ? { burningTurns: 3 } : {};
            if (_boltPassives.burningOnHit) addLog(`🔥 ${boltTarget.emoji} is ignited!`);
            waitEnemies[boltEnemyIdx] = { ...boltTarget, hp: boltResult.enemyHp, engaged: true, ..._bBurning };
          }
          const _bdx = boltTarget.pos.x - waitPlayer.pos.x;
          const _bdy = boltTarget.pos.y - waitPlayer.pos.y;
          const _bsteps = Math.max(Math.abs(_bdx), Math.abs(_bdy));
          const _bBeam: Position[] = [];
          for (let n = 1; n <= _bsteps; n++) {
            _bBeam.push({ x: Math.round(waitPlayer.pos.x + (_bdx * n) / _bsteps), y: Math.round(waitPlayer.pos.y + (_bdy * n) / _bsteps) });
          }
          waitBeam = { positions: _bBeam, color: '#a78bfa' };
        }
      }

      // Tick blink strike cooldown on wait
      if (prev.player.characterClass === '🥷' && (waitPlayer.stats.blinkStrikeCooldown ?? 0) > 0) {
        waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, blinkStrikeCooldown: (waitPlayer.stats.blinkStrikeCooldown ?? 1) - 1 } };
      }

      // Out-of-combat decay for Blink Strike instakill chain on wait
      waitPlayer = tickBlinkChainOutOfCombat(waitPlayer, prev.enemies.some(e => e.engaged), addLog);

      // Overheal decay on wait
      {
        const ohDecayW = applyOverhealDecay(waitPlayer, prev.turn, waitPlayer.pos, 'oh-decay-wait');
        waitPlayer = ohDecayW.player;
        if (ohDecayW.float) waitFloats.push(ohDecayW.float);
      }

      const midState = {
        ...prev,
        player: waitPlayer,
        enemies: waitEnemies,
        items: waitItems,
        killCounts: waitKillCounts,
        floatingTexts: [...waitFloats, ...(prev.floatingTexts ?? [])],
        pendingBeam: waitBeam,
        turn: prev.turn + 1,
        difficultyTier: waitEnemies.length < prev.enemies.length && prev.enemies.some(e => e.isBoss && !waitEnemies.find(w => w.id === e.id)) ? (prev.difficultyTier ?? 0) + 1 : (prev.difficultyTier ?? 0),
        logs: [
          {
            id: Math.random().toString(),
            text: atFull
              ? (onCampfire ? '🔥 Campfire crackles warmly…' : 'You wait, watching the shadows…')
              : (onCampfire ? `🔥 Campfire rest. (+${totalHeal} HP)` : nearRest ? `🏪 Restaurant rest. (+${totalHeal} HP, mood ↑)` : `You rest a moment. (+${totalHeal} HP)`),
            turn: prev.turn,
          },
          ...prev.logs,
        ].slice(0, 24),
      };
      return withVisibility(applyEnemyTurns(midState, runEnemyTurns(midState)));
    });
  }, [addLog, setGameState, wizardTacticsRef]);

  const handleCloseDoor = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const { player } = prev;
      const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const openDoor = dirs
        .map(([dx, dy]) => ({ x: player.pos.x + dx, y: player.pos.y + dy }))
        .find(p =>
          p.y >= 0 && p.y < prev.map.length && p.x >= 0 && p.x < prev.map[0].length &&
          prev.map[p.y][p.x].type === 'door-open' &&
          !prev.enemies.some(e => e.pos.x === p.x && e.pos.y === p.y)
        );
      if (!openDoor) return prev;
      const closedMap = prev.map.map((row, my) =>
        row.map((t, mx) =>
          mx === openDoor.x && my === openDoor.y
            ? { ...t, type: 'door-closed' as const, emoji: '🚪' }
            : t
        )
      );
      addLog('🚪 You close the door.');
      const midState = { ...prev, map: closedMap, turn: prev.turn + 1 };
      return applyEnemyTurns(withVisibility(midState), runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const {
    applyWizardMode, handleCycleRangedTarget, applyNinjaMode,
    toggleAutoStealth, applyRangerMode, handleCowboyTactics,
  } = useTacticsActions(refs, setters, addLog);

  const {
    handleUseHeal, handleCook, handleUseRope, handleUseSlot,
  } = useItemActions(refs, setters, addLog, applyMonkeyDropOnKill);

  const {
    handlePlantBomb, handleFireProjectile, handleBlinkStrikeOnTarget, handleBlinkStrike,
  } = useCombatActions(setters, addLog, applyMonkeyDropOnKill);

  const {
    handleBankMove, handleConsumeBankItem, handleEquip, handleUnequip,
  } = useInventoryActions(setters, addLog, applyMonkeyDropOnKill);

  return {
    addLog,
    handleMove,
    handleWait,
    handleCloseDoor,
    handleUseHeal,
    handleCook,
    applyWizardMode,
    handleCycleRangedTarget,
    applyNinjaMode,
    toggleAutoStealth,
    applyRangerMode,
    handleCowboyTactics,
    handlePlantBomb,
    handleFireProjectile,
    handleUseRope,
    handleUseSlot,
    handleBankMove,
    handleConsumeBankItem,
    handleEquip,
    handleUnequip,
    handleBlinkStrike,
    handleBlinkStrikeOnTarget,
  };
}
