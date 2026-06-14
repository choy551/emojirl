import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { GameState, Player, Enemy, EmojiItem, Position, FloatingText, PlacedBomb, ActiveProjectile, EquipSlot, ActiveBuff } from '../game/types';
import { resolveCombat, getCowboyUnarmedBonus } from '../game/combat';
import { getRandomEmojiPower, getRandomHealDrop, getAmmoDrop, getBulletDrop, getRandomActiveDrop, getRandomEquipmentDrop, COOKABLE_EMOJIS, cookFood } from '../game/emojis';
import { getMood } from '../game/moods';
import { generateMap } from '../game/mapgen';
import { markEnemySeen, markEmojiSeen, markEnemyKilled } from '../game/discoveries';
import { isStackableBagPassive } from '../game/passives';
import {
  moodMax, chebyshev, hasLOS, hasLOSBetween, VISION_RADIUS, visionRadiusFor,
  eagleEyeRange, PLAYER_PASSABLE_TILES, computeVisibility, computeBagPassives,
  applyEquipmentAndPassives, withVisibility, runEnemyTurns, applyEnemyTurns, tickActiveBuffs,
  addToBag, activeKindLabel, sortBagSlots, refillBagFromBank, levelFromXP, isNonStackableBagPassiveDuplicate, isActiveKindDuplicate,
  hpBonusForLevel, mpBonusForLevel, computeNinjaEvasion, getRandomCowboyFlavor, spawnEnemies,
  spawnVaultItems, bfsStepToward, bfsNextStep, bfsNextStepWallHug, handleGodBlessedImmunity,
  getDungeonPressure, _flashSignals,
} from '../game/gameHelpers';
import { canEquipItem } from '../components/itemUtils';

interface GameRefs {
  gameStateRef: MutableRefObject<GameState | null>;
  wizardTacticsRef: MutableRefObject<{ mode: 'nearest' | 'furthest' | 'manual' | 'holdfire'; manualTargetId: string | null }>;
  autoStealthRef: MutableRefObject<boolean>;
  rangerModeRef: MutableRefObject<'ranged' | 'melee' | 'flee'>;
  yeehawTurnRef: MutableRefObject<number>;
  lastCowboyFlavorTurnRef: MutableRefObject<number>;
  inspectedEnemyIdRef: MutableRefObject<string | null>;
  dirPickModeRef: MutableRefObject<'gun' | 'freeze' | 'boomerang' | 'bomb' | null>;
  boatConfirmedRef: MutableRefObject<boolean>;
  blinkTurnRef: MutableRefObject<number>;
  trailblazeTurnRef: MutableRefObject<number>;
  restaurantClosedRef: MutableRefObject<boolean>;
}

interface GameSetters {
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  setWizardTactics: React.Dispatch<React.SetStateAction<{ mode: 'nearest' | 'furthest' | 'manual' | 'holdfire'; manualTargetId: string | null }>>;
  setAutoStealth: React.Dispatch<React.SetStateAction<boolean>>;
  setRangerMode: React.Dispatch<React.SetStateAction<'ranged' | 'melee' | 'flee'>>;
  setYeehawTurn: React.Dispatch<React.SetStateAction<number>>;
  setAutoExplore: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoRest: React.Dispatch<React.SetStateAction<boolean>>;
  setInspectedEnemyId: React.Dispatch<React.SetStateAction<string | null>>;
  setDirPickMode: React.Dispatch<React.SetStateAction<'gun' | 'freeze' | 'boomerang' | 'bomb' | null>>;
  setBagTab: React.Dispatch<React.SetStateAction<'hotbar' | 'equipment' | 'bank'>>;
  setBankOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedItemId: React.Dispatch<React.SetStateAction<string | null>>;
  setDrownWarnSlot: React.Dispatch<React.SetStateAction<number | null>>;
  setLastBoatWarnSlot: React.Dispatch<React.SetStateAction<number | null>>;
  setPendingFairyId: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingMonkeyInteraction: React.Dispatch<React.SetStateAction<{ id: string; wants: string } | null>>;
  setPendingAdventurerInteraction: React.Dispatch<React.SetStateAction<string | null>>;
  setBlinkTurn: React.Dispatch<React.SetStateAction<number>>;
  setTrailblazeTurn: React.Dispatch<React.SetStateAction<number>>;
}

const WAIT_HEAL = 1;

export function useGameActions(refs: GameRefs, setters: GameSetters) {
  const {
    gameStateRef, wizardTacticsRef, autoStealthRef, rangerModeRef,
    yeehawTurnRef, lastCowboyFlavorTurnRef, inspectedEnemyIdRef,
    dirPickModeRef, boatConfirmedRef, blinkTurnRef, trailblazeTurnRef,
    restaurantClosedRef,
  } = refs;
  const {
    setGameState, setWizardTactics, setAutoStealth, setRangerMode,
    setYeehawTurn, setAutoExplore, setAutoRest, setInspectedEnemyId,
    setDirPickMode, setBagTab, setBankOpen, setSelectedItemId,
    setDrownWarnSlot, setLastBoatWarnSlot, setPendingFairyId, setPendingMonkeyInteraction,
    setPendingAdventurerInteraction,
    setBlinkTurn, setTrailblazeTurn,
  } = setters;

  const BLINK_ACTIVE = 3;
  const BLINK_CD = 5;

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
              const hpIncrease = hpBonusForLevel(newLevel) - hpBonusForLevel(oldLevel);
              const newMaxHp = newPlayer.stats.maxHp + hpIncrease;
              const newEmoji = { ...getRandomEmojiPower(), id: `lvlup-${Math.random()}`, consumed: false };
              const extraEmoji = player.characterClass === '🧙'
                ? [{ ...getRandomEmojiPower(), id: `lvlup2-${Math.random()}`, consumed: false }]
                : [];
              const { inventory: _inv1, bank: _bank1, nonStackableBanked: _nsb1, duplicateActiveBanked: _dab1 } = addToBag(newPlayer.inventory, newPlayer.bank, newEmoji, ...extraEmoji);
              markEmojiSeen(newEmoji.emoji); extraEmoji.forEach(e => markEmojiSeen(e.emoji));
              _nsb1.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
              _dab1.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
              newPlayer = {
                ...newPlayer,
                stats: { ...newPlayer.stats, level: newLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(player.characterClass), newPlayer.stats.moodValue + 30) },
                inventory: _inv1,
                bank: _bank1,
              };
              addLog(`✨ Level ${newLevel}! Full heal! +${hpIncrease} max HP! Got ${newEmoji.emoji}!`);
              if (player.characterClass === '🧙') {
                const mpInc = mpBonusForLevel(newLevel) - mpBonusForLevel(oldLevel);
                if (mpInc > 0) {
                  const newMaxMana = (newPlayer.stats.maxMana ?? 4) + mpInc;
                  newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, maxMana: newMaxMana, mana: newMaxMana } };
                  addLog(`🔵 +${mpInc} max MP! (${newMaxMana} total)`);
                }
              }
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
          setPendingAdventurerInteraction(enemy.id);
          return prev;
        }
        if (enemy.tag === 'Friendly') {
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
            const hpIncrease = hpBonusForLevel(newLevel) - hpBonusForLevel(oldLevel);
            const newMaxHp = newPlayer.stats.maxHp + hpIncrease;
            const newEmoji = { ...getRandomEmojiPower(), id: `lvlup-${Math.random()}`, consumed: false };
            const extraEmoji = cls === '🧙'
              ? [{ ...getRandomEmojiPower(), id: `lvlup2-${Math.random()}`, consumed: false }]
              : [];
            const { inventory: _inv0, bank: _bank0, nonStackableBanked: _nsb0, duplicateActiveBanked: _dab0 } = addToBag(newPlayer.inventory, newPlayer.bank, newEmoji, ...extraEmoji);
            markEmojiSeen(newEmoji.emoji); extraEmoji.forEach(e => markEmojiSeen(e.emoji));
            _nsb0.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
            _dab0.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
            newPlayer = {
              ...newPlayer,
              stats: { ...newPlayer.stats, level: newLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(cls), newPlayer.stats.moodValue + 30) },
              inventory: _inv0,
              bank: _bank0,
            };
            addLog(`✨ Level ${newLevel}! Full heal! +${hpIncrease} max HP! Got ${newEmoji.emoji}!`);
            if (cls === '🧙') {
              const mpInc = mpBonusForLevel(newLevel) - mpBonusForLevel(oldLevel);
              if (mpInc > 0) {
                const newMaxMana = (newPlayer.stats.maxMana ?? 4) + mpInc;
                newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, maxMana: newMaxMana, mana: newMaxMana } };
                addLog(`🔵 +${mpInc} max MP! (${newMaxMana} total)`);
              }
            }
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
          // Wizard shrine does not increase HP max (only MP), but must not discard existing HP overheal from bar.
          // Just add the shrine heal amount on top of whatever (over)heal is currently present.
          const healedHp = newPlayer.stats.hp + shrineAmt;
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
          if (newPlayer.stats.xp >= cost) {
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
              const hpInc = hpBonusForLevel(boltNewLevel) - hpBonusForLevel(boltOldLevel);
              const newMaxHp = newPlayer.stats.maxHp + hpInc;
              const newEmoji = { ...getRandomEmojiPower(), id: `bolt-lvl-${Math.random()}`, consumed: false };
              const extraEmoji = { ...getRandomEmojiPower(), id: `bolt-lvl2-${Math.random()}`, consumed: false };
              const { inventory: _inv2, bank: _bank2, nonStackableBanked: _nsb2, duplicateActiveBanked: _dab2a } = addToBag(newPlayer.inventory, newPlayer.bank, newEmoji, extraEmoji);
              markEmojiSeen(newEmoji.emoji); markEmojiSeen(extraEmoji.emoji);
              _nsb2.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
              _dab2a.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
              newPlayer = {
                ...newPlayer,
                stats: { ...newPlayer.stats, level: boltNewLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(cls), newPlayer.stats.moodValue + 30) },
                inventory: _inv2,
                bank: _bank2,
              };
              addLog(`✨ Level ${boltNewLevel}! Full heal! +${hpInc} max HP! Got ${newEmoji.emoji}!`);
              const bMoveMpInc = mpBonusForLevel(boltNewLevel) - mpBonusForLevel(boltOldLevel);
              if (bMoveMpInc > 0) {
                const bMoveNewMaxMana = (newPlayer.stats.maxMana ?? 4) + bMoveMpInc;
                newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, maxMana: bMoveNewMaxMana, mana: bMoveNewMaxMana } };
                addLog(`🔵 +${bMoveMpInc} max MP! (${bMoveNewMaxMana} total)`);
              }
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
      if (cls === '🥷') {
        const inCombat = prev.enemies.some(e => e.engaged);
        let outTurns = newPlayer.stats.blinkStrikeInstakillOutOfCombat ?? 0;
        if (inCombat) {
          outTurns = 0;
        } else {
          outTurns += 1;
          if (outTurns >= 10) {
            const chain = newPlayer.stats.blinkStrikeInstakillChain ?? 0;
            if (chain >= 2) {
              newPlayer.stats.blinkStrikeInstakillChain = 0;
              addLog(`🥷 Blink Strike instakill chain faded (10 turns out of combat).`);
              outTurns = 0;
            }
          }
        }
        newPlayer.stats.blinkStrikeInstakillOutOfCombat = outTurns;
      }

      // Overheal decay: every 5 turns, shed 1 HP until back to natural maxHp
      if (newPlayer.stats.hp > newPlayer.stats.maxHp) {
        const tick = ((newPlayer.stats.overhealDecayTick ?? 0) + 1);
        if (tick >= 5) {
          const decayedHp = Math.max(newPlayer.stats.maxHp, newPlayer.stats.hp - 1);
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, hp: decayedHp, overhealDecayTick: 0 } };
          if (decayedHp > newPlayer.stats.maxHp) newState.floatingTexts = [{ id: `oh-decay-${newState.turn}`, pos: { ...newPlayer.pos }, text: '-1 ✨', color: '#fbbf24', life: 2 }, ...newState.floatingTexts];
        } else {
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, overhealDecayTick: tick } };
        }
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
              const hpInc = hpBonusForLevel(boltNewLevel) - hpBonusForLevel(boltOldLevel);
              const newMaxHp = waitPlayer.stats.maxHp + hpInc;
              const newEmoji = { ...getRandomEmojiPower(), id: `bolt-lvl-${Math.random()}`, consumed: false };
              const extraEmoji = { ...getRandomEmojiPower(), id: `bolt-lvl2-${Math.random()}`, consumed: false };
              const { inventory: _inv2, bank: _bank2, nonStackableBanked: _nsb2, duplicateActiveBanked: _dab2b } = addToBag(waitPlayer.inventory, waitPlayer.bank, newEmoji, extraEmoji);
              markEmojiSeen(newEmoji.emoji); markEmojiSeen(extraEmoji.emoji);
              _nsb2.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
              _dab2b.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
              waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, level: boltNewLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(cls), waitPlayer.stats.moodValue + 30) }, inventory: _inv2, bank: _bank2 };
              addLog(`✨ Level ${boltNewLevel}! Full heal! +${hpInc} max HP! Got ${newEmoji.emoji}!`);
              const bWaitMpInc = mpBonusForLevel(boltNewLevel) - mpBonusForLevel(boltOldLevel);
              if (bWaitMpInc > 0) {
                const bWaitNewMaxMana = (waitPlayer.stats.maxMana ?? 4) + bWaitMpInc;
                waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, maxMana: bWaitNewMaxMana, mana: bWaitNewMaxMana } };
                addLog(`🔵 +${bWaitMpInc} max MP! (${bWaitNewMaxMana} total)`);
              }
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
      if (prev.player.characterClass === '🥷') {
        const inCombat = prev.enemies.some(e => e.engaged);
        let outTurns = waitPlayer.stats.blinkStrikeInstakillOutOfCombat ?? 0;
        if (inCombat) {
          outTurns = 0;
        } else {
          outTurns += 1;
          if (outTurns >= 10) {
            const chain = waitPlayer.stats.blinkStrikeInstakillChain ?? 0;
            if (chain >= 2) {
              waitPlayer.stats.blinkStrikeInstakillChain = 0;
              addLog(`🥷 Blink Strike instakill chain faded (10 turns out of combat).`);
              outTurns = 0;
            }
          }
        }
        waitPlayer.stats.blinkStrikeInstakillOutOfCombat = outTurns;
      }

      // Overheal decay on wait
      if (waitPlayer.stats.hp > waitPlayer.stats.maxHp) {
        const tick = ((waitPlayer.stats.overhealDecayTick ?? 0) + 1);
        if (tick >= 5) {
          const decayedHp = Math.max(waitPlayer.stats.maxHp, waitPlayer.stats.hp - 1);
          waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, hp: decayedHp, overhealDecayTick: 0 } };
          if (decayedHp > waitPlayer.stats.maxHp) waitFloats.push({ id: `oh-decay-wait-${prev.turn}`, pos: { ...waitPlayer.pos }, text: '-1 ✨', color: '#fbbf24', life: 2 });
        } else {
          waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, overhealDecayTick: tick } };
        }
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

  const handleUseHeal = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      if (prev.player.stats.hp >= prev.player.stats.maxHp) { addLog('Already at full HP.'); return prev; }

      const healCandidates = prev.player.inventory
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => !it.consumed && it.healAmount !== undefined);
      if (healCandidates.length === 0) { addLog('No healing items! Search for 🍎🍖🧪 drops from enemies.'); return prev; }

      const hpPct = prev.player.stats.hp / prev.player.stats.maxHp;
      const missingHp = prev.player.stats.maxHp - prev.player.stats.hp;
      let best: { it: EmojiItem; idx: number };
      if (hpPct <= 0.4) {
        // Low health — use the biggest heal available
        best = healCandidates.reduce((a, b) => (b.it.healAmount ?? 0) > (a.it.healAmount ?? 0) ? b : a);
      } else {
        // Near full — prefer the smallest heal that covers the gap, avoid wasting big ones
        const fitsGap = healCandidates.filter(({ it }) => (it.healAmount ?? 0) <= missingHp);
        const pool = fitsGap.length > 0 ? fitsGap : healCandidates;
        best = pool.reduce((a, b) => (b.it.healAmount ?? 0) < (a.it.healAmount ?? 0) ? b : a);
      }
      const healIndex = best.idx;

      const item = best.it;
      const amount = item.healAmount ?? 2;
      const stats = { ...prev.player.stats };
      const wasLow = stats.hp / stats.maxHp <= 0.3;

      stats.hp = Math.min(stats.maxHp, stats.hp + amount);
      // Tick active buffs each time food is used (costs 1 turn)
      Object.assign(stats, tickActiveBuffs(stats));

      // Handle cooked food bonus effects
      if (item.cookedBuff) {
        const newBuff: ActiveBuff = {
          stat: item.cookedBuff.stat,
          amount: item.cookedBuff.amount,
          turnsLeft: item.cookedBuff.turns,
          label: `+${item.cookedBuff.amount} ${item.cookedBuff.stat === 'attack' ? 'ATK' : 'DEF'}`,
        };
        stats.activeBuffs = [...(stats.activeBuffs ?? []), newBuff];
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 15));
        addLog(`${item.emoji} ${item.name}: +${amount} HP & ${newBuff.label} for ${item.cookedBuff.turns} turns!`);
      } else if (item.emoji === '🍲') {
        // Mushroom Stew — 40% chance to lift bad mood
        const clearsDebuff = Math.random() < 0.4 && stats.moodValue < 0;
        if (clearsDebuff) stats.moodValue = 0;
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 10));
        addLog(clearsDebuff
          ? `🍲 Mushroom Stew: +${amount} HP & the fog lifts — mood restored!`
          : `🍲 Mushroom Stew: +${amount} HP restored.`);
      } else if (item.isCooked) {
        // Baked Apple / Cooked Berries — mood boost
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 50 : 25));
        addLog(`${item.emoji} ${item.name}: +${amount} HP & mood boost!`);
      } else {
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 10));
        addLog(wasLow
          ? `${item.emoji} ${item.name}: +${amount} HP — relief floods through you! Mood surges!`
          : `${item.emoji} ${item.name}: +${amount} HP restored.`
        );
      }

      const consumed = prev.player.inventory.filter((_, idx) => idx !== healIndex);
      const { inventory: newInventory, bank: newBank } = refillBagFromBank(consumed, prev.player.bank);

      const midState = { ...prev, player: { ...prev.player, stats, inventory: newInventory, bank: newBank }, turn: prev.turn + 1 };
      return applyEnemyTurns(midState, runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const handleCook = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const { x: cpx, y: cpy } = prev.player.pos;
      const nearFire = [-1, 0, 1].some(dy =>
        [-1, 0, 1].some(dx => prev.map[cpy + dy]?.[cpx + dx]?.type === 'campfire')
      );
      const nearRestCook = [-1, 0, 1].some(dy =>
        [-1, 0, 1].some(dx => prev.map[cpy + dy]?.[cpx + dx]?.type === 'restaurant')
      );
      if (!nearFire && !nearRestCook) {
        addLog('🔥 You need to be next to a campfire (🔥) or restaurant (🏪) to cook food.');
        return prev;
      }
      if (nearRestCook && !nearFire && restaurantClosedRef.current) {
        addLog('🏪 The kitchen is closed — thank you for cooking for us today!');
        return prev;
      }
      const rawIdx = prev.player.inventory.findIndex(
        it => !it.consumed && it.healAmount !== undefined && COOKABLE_EMOJIS.has(it.emoji)
      );
      if (rawIdx === -1) {
        addLog('🔥 Nothing to cook — need raw food (🍎 🍞 🍖 🍄 🍇) in your bag.');
        return prev;
      }
      const raw = prev.player.inventory[rawIdx];
      const cooked = cookFood(raw);
      if (!cooked) return prev;
      const cookedItem: EmojiItem = { ...cooked, id: `cooked-${Math.random()}`, consumed: false };
      const newInventory = [...prev.player.inventory];
      newInventory[rawIdx] = cookedItem;
      addLog(`🔥 Cooked ${raw.emoji} → ${cookedItem.emoji} ${cookedItem.name}!`);
      const midState = { ...prev, player: { ...prev.player, inventory: newInventory }, turn: prev.turn + 1 };
      return withVisibility(applyEnemyTurns(midState, runEnemyTurns(midState)));
    });
  }, [addLog, setGameState]);

  const applyWizardMode = useCallback((mode: 'nearest' | 'furthest' | 'manual' | 'holdfire') => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || state.player.characterClass !== '🧙') return;
    const current = wizardTacticsRef.current;
    const LABELS = { nearest: '🎯 Nearest', furthest: '🎯 Furthest', manual: '🎯 Manual', holdfire: '✨ Blink' };

    if (mode === 'holdfire') {
      const elapsed = state.turn - blinkTurnRef.current;
      if (elapsed < BLINK_ACTIVE + BLINK_CD) {
        const remaining = (BLINK_ACTIVE + BLINK_CD) - elapsed;
        addLog(`✨ Blink cooling down… (${remaining}t)`);
        return;
      }
      blinkTurnRef.current = state.turn;
      setBlinkTurn(state.turn);
      setAutoExplore(false);
      setAutoRest(false);
      addLog(`✨ Blink — phasing through gaps & enemies for ${BLINK_ACTIVE} turns!`);
    } else if (current.mode === 'holdfire') {
      addLog(`🧙 Readying Arcane Barrage → ${LABELS[mode]}`);
      setGameState(prev => {
        if (!prev || prev.gameOver) return prev;
        const mid = { ...prev, turn: prev.turn + 1 };
        return withVisibility(applyEnemyTurns(mid, runEnemyTurns(mid)));
      });
    } else {
      addLog(`Tactics: ${LABELS[mode]}`);
    }

    const next = { mode, manualTargetId: mode === 'manual' ? current.manualTargetId : null };
    wizardTacticsRef.current = next;
    setWizardTactics(next);
  }, [addLog, gameStateRef, wizardTacticsRef, blinkTurnRef, setGameState, setAutoExplore, setAutoRest, setWizardTactics, setBlinkTurn]);

  const handleCycleRangedTarget = useCallback((dir: 1 | -1) => {
    const state = gameStateRef.current;
    if (!state || state.gameOver) return;
    const { player } = state;
    const targets = state.enemies
      .filter(e => state.map[e.pos.y]?.[e.pos.x]?.visible)
      .sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos));
    if (targets.length === 0) { addLog('No visible enemies to target.'); return; }
    const idx = targets.findIndex(e => e.id === inspectedEnemyIdRef.current);
    const next = targets[(idx + dir + targets.length) % targets.length];
    setInspectedEnemyId(next.id);
    if (player.characterClass === '🧙') {
      const newT = { ...wizardTacticsRef.current, mode: 'manual' as const, manualTargetId: next.id };
      wizardTacticsRef.current = newT;
      setWizardTactics(newT);
    }
    addLog(`🎯 Targeting: ${next.emoji} ${next.name}`);
  }, [addLog, gameStateRef, inspectedEnemyIdRef, wizardTacticsRef, setInspectedEnemyId, setWizardTactics]);

  const applyNinjaMode = useCallback((stealth: boolean) => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || state.player.characterClass !== '🥷') return;
    setGameState(prev => prev ? { ...prev, stealthMode: stealth } : prev);
    addLog(stealth ? '🥷 Stealth engaged — hug walls or dark tiles' : '🥷 Stealth off — moving freely');
  }, [addLog, gameStateRef, setGameState]);

  const toggleAutoStealth = useCallback(() => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || state.player.characterClass !== '🥷') return;
    const next = !autoStealthRef.current;
    autoStealthRef.current = next;
    setAutoStealth(next);
    if (next) {
      setGameState(prev => {
        if (!prev) return prev;
        const dirs8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
        const nearWall = dirs8.some(([dy, dx]) => {
          const ny = prev.player.pos.y + dy, nx = prev.player.pos.x + dx;
          return ny >= 0 && ny < prev.map.length && nx >= 0 && nx < prev.map[0].length
            && prev.map[ny][nx].type === 'wall';
        });
        return nearWall ? { ...prev, stealthMode: true } : prev;
      });
      addLog('🥷 Auto-Stealth ON — wall-hugging explore active');
    } else {
      addLog('🥷 Auto-Stealth OFF — manual stealth control');
    }
  }, [addLog, gameStateRef, autoStealthRef, setAutoStealth, setGameState]);

  const applyRangerMode = useCallback((mode: 'ranged' | 'melee' | 'flee') => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || state.player.characterClass !== '🧝') return;

    if (mode === 'flee') {
      const elapsed = state.turn - trailblazeTurnRef.current;
      if (elapsed < BLINK_ACTIVE + BLINK_CD) {
        const remaining = (BLINK_ACTIVE + BLINK_CD) - elapsed;
        addLog(`💨 Trailblaze cooling down… (${remaining}t)`);
        return;
      }
      trailblazeTurnRef.current = state.turn;
      setTrailblazeTurn(state.turn);
      addLog(`💨 Trailblaze — sprinting 2 tiles for ${BLINK_ACTIVE} turns!`);
    } else {
      const label = mode === 'melee' ? '⚔️ Melee mode — conserving ammo' : '🏹 Ranged mode — auto-fire bow';
      addLog(label);
    }

    rangerModeRef.current = mode;
    setRangerMode(mode);
  }, [addLog, gameStateRef, rangerModeRef, trailblazeTurnRef, setRangerMode, setTrailblazeTurn]);

  const handleCowboyTactics = useCallback(() => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || state.player.characterClass !== '🤠') return;
    const COOLDOWN = 45;
    const elapsed = state.turn - yeehawTurnRef.current;
    if (elapsed < COOLDOWN) {
      addLog(`🤠 Settle down there, pardner… (${COOLDOWN - elapsed} turns)`);
      return;
    }
    yeehawTurnRef.current = state.turn;
    setYeehawTurn(state.turn);
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const newMoodValue = Math.min(100, prev.player.stats.moodValue + 25);
      return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, moodValue: newMoodValue } } };
    });
    addLog('🤠 YEEHAW! Confidence surges!');
  }, [addLog, gameStateRef, yeehawTurnRef, setYeehawTurn, setGameState]);

  const handlePlantBomb = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const bombItem = prev.player.inventory.find(it => it.activeKind === 'bomb' && !it.consumed && (it.charges ?? 0) > 0);
      if (!bombItem) { addLog('No 💣 Bomb in inventory!'); return prev; }
      const bomb: PlacedBomb = { id: `bomb-${Math.random()}`, pos: { ...prev.player.pos }, countdown: 3, radius: 1 };
      addLog(`💣 You plant a bomb! It will explode in 3 turns!`);
      const newInv = prev.player.inventory.map(it =>
        it.id === bombItem.id ? { ...it, charges: (it.charges ?? 1) - 1, consumed: ((it.charges ?? 1) - 1) <= 0 } : it
      );
      const midState = { ...prev, player: { ...prev.player, inventory: newInv }, placedBombs: [...prev.placedBombs, bomb], turn: prev.turn + 1 };
      return applyEnemyTurns(midState, runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const handleFireProjectile = useCallback((kind: 'gun' | 'freeze' | 'boomerang' | 'bomb', dx: number, dy: number) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      if (prev.activeProjectile) {
        addLog('A projectile is already in flight!');
        return prev;
      }
      const kindEmoji = kind === 'gun' ? '🔫' : kind === 'freeze' ? '❄️' : kind === 'bomb' ? '💣' : '🪃';
      const item = prev.player.inventory.find(it => it.activeKind === kind && !it.consumed && (it.charges === -1 || (it.charges ?? 0) > 0));
      if (!item) { addLog(`No ${kindEmoji} in inventory!`); return prev; }
      const throwLabel = kind === 'boomerang' ? 'throw the boomerang' : kind === 'bomb' ? 'throw the bomb' : kind === 'gun' ? 'fire the gun' : 'fire a freeze bolt';
      const bankBoomerangs = kind === 'boomerang' ? prev.player.bank.filter(it => it.activeKind === 'boomerang' && !it.consumed).length : 0;
      const boomerangPct = Math.round(Math.min(2.0, 1.0 + 0.25 * bankBoomerangs) * 100);
      addLog(`${kindEmoji} You ${throwLabel}!${kind === 'boomerang' && bankBoomerangs > 0 ? ` (${boomerangPct}% ATK — ${bankBoomerangs} extra in Bank)` : ''}`);
      const proj: ActiveProjectile = {
        id: `proj-${Math.random()}`,
        kind,
        pos: { ...prev.player.pos },
        dir: { x: dx, y: dy },
        phase: 'outgoing',
        maxRange: kind === 'boomerang' ? 5 : 8,
        traveled: 0,
      };
      let newInv = prev.player.inventory;
      let newProjBank = prev.player.bank;
      if (kind === 'gun') {
        const newCharges = (item.charges ?? 3) - 1;
        if (newCharges <= 0) {
          addLog('🔫 Gun is empty!');
          const r = refillBagFromBank(prev.player.inventory.filter(it => it.id !== item.id), prev.player.bank);
          newInv = r.inventory; newProjBank = r.bank;
        } else {
          newInv = prev.player.inventory.map(it => it.id === item.id ? { ...it, charges: newCharges } : it);
        }
      } else if (kind === 'freeze') {
        const r = refillBagFromBank(prev.player.inventory.filter(it => it.id !== item.id), prev.player.bank);
        newInv = r.inventory; newProjBank = r.bank;
      } else if (kind === 'bomb') {
        const newCharges = (item.charges ?? 1) - 1;
        if (newCharges <= 0) {
          const r = refillBagFromBank(prev.player.inventory.filter(it => it.id !== item.id), prev.player.bank);
          newInv = r.inventory; newProjBank = r.bank;
        } else {
          newInv = prev.player.inventory.map(it => it.id === item.id ? { ...it, charges: newCharges } : it);
        }
      }
      const midState = { ...prev, player: { ...prev.player, inventory: newInv, bank: newProjBank }, activeProjectile: proj, turn: prev.turn + 1 };
      return applyEnemyTurns(midState, runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const handleUseRope = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const ropeItem = prev.player.inventory.find(it => it.activeKind === 'rope' && !it.consumed && (it.charges ?? 0) > 0);
      if (!ropeItem) { addLog('No 🪢 Rope in inventory!'); return prev; }

      const map = prev.map.map(row => row.map(t => ({ ...t })));
      const mapH = map.length;
      const mapW = map[0].length;

      let vaultX = -1, vaultY = -1;
      const vw = 6, vh = 5;
      let tries = 0;
      outer:
      while (tries++ < 300) {
        const tx = 1 + Math.floor(Math.random() * (mapW - vw - 2));
        const ty = 1 + Math.floor(Math.random() * (mapH - vh - 2));
        for (let ry = ty; ry < ty + vh; ry++) {
          for (let rx = tx; rx < tx + vw; rx++) {
            if (map[ry][rx].type !== 'wall') continue outer;
          }
        }
        vaultX = tx; vaultY = ty; break;
      }

      let newPlayer = { ...prev.player };

      if (vaultX === -1) {
        addLog('🪢 The rope leads nowhere — but fate rewards you anyway!');
        const rewards = Array.from({ length: 2 }, (_, i) => ({
          ...getRandomActiveDrop(), id: `vault-fb-${i}-${Math.random()}`, consumed: false, pos: prev.player.pos,
        }));
        const { inventory: ropeInv, bank: ropeBank } = refillBagFromBank(prev.player.inventory.filter(it => it.id !== ropeItem.id), newPlayer.bank);
        newPlayer = { ...newPlayer, inventory: ropeInv, bank: ropeBank };
        return { ...prev, player: newPlayer, items: [...prev.items, ...rewards] };
      }

      for (let ry = vaultY; ry < vaultY + vh; ry++) {
        for (let rx = vaultX; rx < vaultX + vw; rx++) {
          map[ry][rx] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
        }
      }

      const midX = vaultX + Math.floor(vw / 2);
      const midY = vaultY + Math.floor(vh / 2);
      const PASSABLE_TO_CONNECT = new Set(['floor', 'grass', 'safe-floor', 'shop-item', 'shrine', 'shrine-used', 'boss-floor', 'stairs', 'door-open', 'door-closed']);
      const scanDirs = [
        { sx: midX,        sy: vaultY - 1,  dx:  0, dy: -1 },
        { sx: midX,        sy: vaultY + vh, dx:  0, dy:  1 },
        { sx: vaultX - 1,  sy: midY,        dx: -1, dy:  0 },
        { sx: vaultX + vw, sy: midY,        dx:  1, dy:  0 },
      ];
      const corridorCandidates: { sx: number; sy: number; dx: number; dy: number; dist: number }[] = [];
      for (const { sx, sy, dx, dy } of scanDirs) {
        if (sy < 0 || sy >= mapH || sx < 0 || sx >= mapW) continue;
        let cx = sx, cy = sy, dist = 0;
        while (cx >= 0 && cx < mapW && cy >= 0 && cy < mapH && dist < 20) {
          if (PASSABLE_TO_CONNECT.has(map[cy][cx].type)) {
            corridorCandidates.push({ sx, sy, dx, dy, dist });
            break;
          }
          const ttype = map[cy][cx].type;
          if (ttype === 'water') break;
          cx += dx; cy += dy; dist++;
        }
      }
      if (corridorCandidates.length > 0) {
        corridorCandidates.sort((a, b) => a.dist - b.dist);
        const { sx, sy, dx, dy, dist } = corridorCandidates[0];
        for (let i = 0; i <= dist; i++) {
          const cx = sx + dx * i, cy = sy + dy * i;
          if (map[cy][cx].type === 'wall') {
            map[cy][cx] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
          }
        }
      } else {
        for (let rx = vaultX + vw; rx < Math.min(mapW - 1, vaultX + vw + 15); rx++) {
          if (map[midY][rx].type !== 'wall') break;
          map[midY][rx] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
        }
      }

      const entrancePos = { x: midX, y: midY };
      newPlayer.pos = entrancePos;
      const { inventory: vaultInv, bank: vaultBank } = refillBagFromBank(prev.player.inventory.filter(it => it.id !== ropeItem.id), newPlayer.bank);
      newPlayer = { ...newPlayer, inventory: vaultInv, bank: vaultBank };

      const isTrap = Math.random() < 0.35;
      let newItems = [...prev.items];
      let newLogs: Array<{ id: string; text: string; turn: number }> = [];
      if (isTrap) {
        const trapDmg = Math.max(1, Math.floor(newPlayer.stats.maxHp * 0.25));
        newPlayer.stats = { ...newPlayer.stats, hp: Math.max(1, newPlayer.stats.hp - trapDmg) };
        newLogs = [{ id: Math.random().toString(), text: `🪢 You enter the vault — TRAP! Spikes deal ${trapDmg} damage!`, turn: prev.turn }];
        addLog(`🪢 You enter the vault — TRAP! Spikes deal ${trapDmg} damage!`);
      } else {
        const rewardCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < rewardCount; i++) {
          const rx = vaultX + 1 + Math.floor(Math.random() * (vw - 2));
          const ry = vaultY + 1 + Math.floor(Math.random() * (vh - 2));
          let drop: Omit<EmojiItem, 'id' | 'consumed'>;
          if (newPlayer.characterClass === '🤠' && Math.random() < 0.13) {
            drop = getBulletDrop();
          } else {
            drop = Math.random() < 0.5 ? getRandomEmojiPower() : getRandomActiveDrop();
          }
          newItems.push({ ...drop, id: `vault-${i}-${Math.random()}`, consumed: false, pos: { x: rx, y: ry } });
        }
        addLog(`🪢 You descend into a hidden vault! Treasure awaits…`);
      }

      const midState = { ...prev, player: newPlayer, map, items: newItems, logs: [...newLogs, ...prev.logs].slice(0, 24), turn: prev.turn + 1 };
      const withVis = withVisibility(midState);
      return applyEnemyTurns(withVis, runEnemyTurns(withVis));
    });
  }, [addLog, setGameState]);

  const handleUseSlot = useCallback((bagSlotIndex: number) => {
    const gs = gameStateRef.current;
    if (!gs || gs.gameOver) return;
    const bagItems = sortBagSlots(gs.player.inventory);
    const item = bagItems[bagSlotIndex];
    if (!item || item.consumed) return;

    if (item.isEquipment) {
      setBagTab('equipment');
      setBankOpen(true);
      setSelectedItemId(item.id);
      addLog(`${item.emoji} ${item.name} — select an equipment slot in the Bag window (B).`);
      return;
    }

    if (item.activeKind === 'gun' || item.activeKind === 'boomerang' || item.activeKind === 'freeze' || item.activeKind === 'bomb') {
      if (gs.activeProjectile) { addLog('A projectile is already in flight!'); return; }
      dirPickModeRef.current = item.activeKind as 'gun' | 'freeze' | 'boomerang' | 'bomb';
      setDirPickMode(item.activeKind as 'gun' | 'freeze' | 'boomerang' | 'bomb');
      addLog(`${item.emoji} Pick a direction (arrow/numpad/WASD)…`);
      return;
    }

    if (item.activeKind === 'rope') { handleUseRope(); return; }

    if (item.emoji === '⛵') {
      const tile = gs.map[gs.player.pos.y]?.[gs.player.pos.x];
      if (tile?.type === 'water') {
        setDrownWarnSlot(bagSlotIndex);
        return;
      }
      if (!boatConfirmedRef.current) {
        const totalBoats = gs.player.inventory.filter(i => i.emoji === '⛵' && !i.consumed).length
                         + gs.player.bank.filter(i => i.emoji === '⛵' && !i.consumed).length;
        if (totalBoats <= 1) {
          setLastBoatWarnSlot(bagSlotIndex);
          return;
        }
      }
      boatConfirmedRef.current = false;
    }

    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const prevBagItems = sortBagSlots(prev.player.inventory);
      const slotItem = prevBagItems[bagSlotIndex];
      if (!slotItem) return prev;

      if (slotItem.healAmount !== undefined) {
        if (prev.player.stats.hp >= prev.player.stats.maxHp) { addLog('Already at full HP.'); return prev; }
        const amount = slotItem.healAmount ?? 2;
        const stats = { ...prev.player.stats };
        const wasLow = stats.hp / stats.maxHp <= 0.3;
        stats.hp = Math.min(stats.maxHp, stats.hp + amount);
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 10));
        const { inventory: healInv, bank: healBank } = refillBagFromBank(prev.player.inventory.filter(it => it.id !== slotItem.id), prev.player.bank);
        addLog(wasLow
          ? `${slotItem.emoji} ${slotItem.name}: +${amount} HP — relief floods through you! Mood surges!`
          : `${slotItem.emoji} ${slotItem.name}: +${amount} HP restored.`
        );
        const mid = { ...prev, player: { ...prev.player, stats, inventory: healInv, bank: healBank }, turn: prev.turn + 1 };
        return applyEnemyTurns(mid, runEnemyTurns(mid));
      }

      const stats = { ...prev.player.stats };
      const effect = (slotItem as any).effect;

      if (effect?.instakillNearest) {
        const anyVisible = prev.enemies.some(e => prev.map[e.pos.y]?.[e.pos.x]?.visible);
        if (!anyVisible) {
          addLog(`${slotItem.emoji} No visible enemies to strike!`);
          return prev;
        }
      }

      if (effect) {
        if (effect.hpBonus)      stats.hp        = Math.min(stats.maxHp + (effect.maxHpBonus ?? 0), stats.hp + effect.hpBonus);
        if (effect.maxHpBonus)   stats.maxHp     = stats.maxHp + effect.maxHpBonus;
        if (effect.attackBonus)  stats.attack    = stats.attack  + effect.attackBonus;
        if (effect.defenseBonus) stats.defense   = stats.defense + effect.defenseBonus;
        if (effect.speedBonus)   stats.speed     = (stats.speed   ?? 0) + effect.speedBonus;
        if (effect.evasionBonus) stats.evasion   = (stats.evasion ?? 0) + effect.evasionBonus;
        if (effect.luckBonus)    stats.luck      = (stats.luck    ?? 0) + effect.luckBonus;
        if (effect.moodBonus)    stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + effect.moodBonus);
        if (effect.xpBonus) {
          const newXP = stats.xp + effect.xpBonus;
          const newLevel = levelFromXP(newXP);
          if (newLevel > stats.level) addLog(`✨ Level up! You are now level ${newLevel}!`);
          stats.xp = newXP;
          stats.level = newLevel;
        }
        if (slotItem.emoji === '⛵') { stats.gold = (stats.gold ?? 0) + 50; addLog(`${slotItem.emoji} ${effect.label} +50g from the voyage!`); }
        else addLog(`${slotItem.emoji} ${effect.label}`);
      } else {
        addLog(`${slotItem.emoji} ${slotItem.name} activated!`);
      }
      const isWizard = prev.player.characterClass === '🧙';
      const echo = isWizard && Math.random() < 0.25;
      let newInventory: typeof prev.player.inventory;
      let newSoulBank = prev.player.bank;
      if (echo) {
        addLog(`🧙 Spell Echo! ${slotItem.emoji} resonates — not consumed.`);
        newInventory = [...prev.player.inventory];
      } else if (isStackableBagPassive(slotItem) && (slotItem.stackCount ?? 1) > 1) {
        newInventory = prev.player.inventory.map(it =>
          it.id === slotItem.id ? { ...it, stackCount: (it.stackCount ?? 1) - 1 } : it
        );
        const r = refillBagFromBank(newInventory, prev.player.bank);
        newInventory = r.inventory; newSoulBank = r.bank;
      } else {
        const r = refillBagFromBank(prev.player.inventory.filter(it => it.id !== slotItem.id), prev.player.bank);
        newInventory = r.inventory; newSoulBank = r.bank;
      }

      let newPlayer: Player = { ...prev.player, stats, inventory: newInventory, bank: newSoulBank };
      let newEnemies = prev.enemies;
      let newItems = prev.items;
      const floats: FloatingText[] = [];

      let zapKillCounts = prev.killCounts;
      if (effect?.instakillNearest) {
        const visible = prev.enemies.filter(e => prev.map[e.pos.y]?.[e.pos.x]?.visible);
        const target = visible.reduce((closest, e) => {
          const d1 = Math.abs(e.pos.x - prev.player.pos.x) + Math.abs(e.pos.y - prev.player.pos.y);
          const d2 = Math.abs(closest.pos.x - prev.player.pos.x) + Math.abs(closest.pos.y - prev.player.pos.y);
          return d1 < d2 ? e : closest;
        });
        markEnemySeen(target.emoji);
        markEnemyKilled(target.emoji);
        zapKillCounts = { ...prev.killCounts, [target.emoji]: (prev.killCounts[target.emoji] ?? 0) + 1 };
        addLog(`⚡ ZAP! ${target.emoji} ${target.name} is obliterated!`);
        const xpGain = target.isBoss ? 25 : 5;
        const newXP = newPlayer.stats.xp + xpGain;
        const oldLevel = newPlayer.stats.level;
        const newLevel = levelFromXP(newXP);
        newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, xp: newXP } };
        if (newLevel > oldLevel) {
          const hpInc = hpBonusForLevel(newLevel) - hpBonusForLevel(oldLevel);
          const newMaxHp = newPlayer.stats.maxHp + hpInc;
          const lvlEmoji = { ...getRandomEmojiPower(), id: `zap-lvl-${Math.random()}`, consumed: false };
          const { inventory: _inv, bank: _bnk, nonStackableBanked: _nsbZ, duplicateActiveBanked: _dabZ } = addToBag(newPlayer.inventory, newPlayer.bank, lvlEmoji);
          markEmojiSeen(lvlEmoji.emoji);
          _nsbZ.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
          _dabZ.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, level: newLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(prev.player.characterClass), newPlayer.stats.moodValue + 30) }, inventory: _inv, bank: _bnk };
          addLog(`✨ Level ${newLevel}! Full heal! +${hpInc} max HP! Got ${lvlEmoji.emoji}!`);
        }
        newEnemies = prev.enemies.filter(e => e.id !== target.id);
        newPlayer = applyMonkeyDropOnKill(target, newPlayer);
        if (target.isBoss || Math.random() < 0.50) {
          const r2 = Math.random();
          const drop = r2 < 0.12 ? getRandomEquipmentDrop(prev.currentFloor) : r2 < 0.28 ? getRandomActiveDrop() : getRandomHealDrop();
          newItems = [...newItems, { ...drop, id: `zap-drop-${Math.random()}`, consumed: false, pos: target.pos }];
        }
        floats.push({ id: `zap-${target.id}-${prev.turn}`, pos: { ...target.pos }, text: '⚡ ZAP!', color: '#fbbf24', life: 3 });
      }

      const midState = { ...prev, killCounts: zapKillCounts, player: newPlayer, enemies: newEnemies, items: newItems, floatingTexts: floats, turn: prev.turn + 1 };
      return withVisibility(applyEnemyTurns(midState, runEnemyTurns(midState)));
    });
  }, [handleUseRope, addLog, gameStateRef, setGameState, setBagTab, setBankOpen, setSelectedItemId, dirPickModeRef, setDirPickMode, setDrownWarnSlot, setLastBoatWarnSlot, boatConfirmedRef]);

  const handleBankMove = useCallback((sourceId: string, dest: string | number | 'bank') => {
    setGameState(prev => {
      if (!prev) return prev;
      const inv  = [...prev.player.inventory];
      const bank = [...prev.player.bank];

      const srcInvIdx  = inv.findIndex(i => i.id === sourceId);
      const srcBankIdx = bank.findIndex(i => i.id === sourceId);

      if (dest === 'bank') {
        if (srcInvIdx !== -1) {
          const [item] = inv.splice(srcInvIdx, 1);
          bank.push(item);
        }
      } else if (typeof dest === 'number') {
        const bagItems = sortBagSlots(inv);
        if (srcInvIdx !== -1) {
          const srcBagIdx = bagItems.findIndex(i => i.id === sourceId);
          const dstBagItem = bagItems[dest] ?? null;
          if (srcBagIdx !== -1 && srcBagIdx !== dest) {
            const srcActualIdx = inv.indexOf(bagItems[srcBagIdx]);
            if (dstBagItem) {
              const dstActualIdx = inv.indexOf(dstBagItem);
              [inv[srcActualIdx], inv[dstActualIdx]] = [inv[dstActualIdx], inv[srcActualIdx]];
            } else if (bagItems.length < 9) {
              const [item] = inv.splice(srcActualIdx, 1);
              inv.push(item);
            }
          }
        } else if (srcBankIdx !== -1) {
          const srcItem = bank[srcBankIdx];
          if (isNonStackableBagPassiveDuplicate(srcItem, inv) || isActiveKindDuplicate(srcItem, inv)) {
            return prev; // prevent pulling duplicate non-stackable or active into hotbar
          }
          const [srcItemMoved] = bank.splice(srcBankIdx, 1);
          const dstBagItem = bagItems[dest] ?? null;
          if (dstBagItem) {
            const dstActualIdx = inv.indexOf(dstBagItem);
            bank.push(inv[dstActualIdx]);
            inv[dstActualIdx] = srcItemMoved;
          } else if (bagItems.length < 9) {
            inv.push(srcItemMoved);
          } else {
            bank.push(srcItemMoved);
          }
        }
      } else {
        const dstInvIdx  = inv.findIndex(i => i.id === dest);
        const dstBankIdx = bank.findIndex(i => i.id === dest);
        const srcItem = srcInvIdx !== -1 ? inv[srcInvIdx] : srcBankIdx !== -1 ? bank[srcBankIdx] : null;
        const dstItem = dstInvIdx !== -1 ? inv[dstInvIdx] : dstBankIdx !== -1 ? bank[dstBankIdx] : null;
        if (!srcItem || !dstItem) return prev;
        if (srcBankIdx !== -1 && dstInvIdx !== -1 && (isNonStackableBagPassiveDuplicate(srcItem, inv) || isActiveKindDuplicate(srcItem, inv))) {
          return prev; // prevent introducing duplicate non-stackable/active via bank->hotbar swap
        }
        if (srcInvIdx !== -1 && dstInvIdx !== -1) { inv[srcInvIdx] = dstItem; inv[dstInvIdx] = srcItem; }
        else if (srcBankIdx !== -1 && dstBankIdx !== -1) { bank[srcBankIdx] = dstItem; bank[dstBankIdx] = srcItem; }
        else if (srcInvIdx !== -1 && dstBankIdx !== -1) { inv[srcInvIdx] = dstItem; bank[dstBankIdx] = srcItem; }
        else if (srcBankIdx !== -1 && dstInvIdx !== -1) { bank[srcBankIdx] = dstItem; inv[dstInvIdx] = srcItem; }
      }

      return { ...prev, player: { ...prev.player, inventory: inv, bank } };
    });
  }, [setGameState]);

  const handleConsumeBankItem = useCallback((itemId: string) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const item = prev.player.bank.find(i => i.id === itemId);
      if (!item || item.consumed || item.isEquipment) return prev;

      const stats = { ...prev.player.stats };

      if (item.healAmount !== undefined) {
        if (stats.hp >= stats.maxHp) { addLog('Already at full HP.'); return prev; }
        const amount = item.healAmount ?? 2;
        const wasLow = stats.hp / stats.maxHp <= 0.3;
        stats.hp = Math.min(stats.maxHp, stats.hp + amount);
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 10));
        addLog(wasLow
          ? `${item.emoji} ${item.name}: +${amount} HP — relief floods through you! Mood surges!`
          : `${item.emoji} ${item.name}: +${amount} HP restored.`);
        const newBank = prev.player.bank.filter(i => i.id !== itemId);
        const mid = { ...prev, player: { ...prev.player, stats, bank: newBank }, turn: prev.turn + 1 };
        return applyEnemyTurns(mid, runEnemyTurns(mid));
      }

      const effect = (item as any).effect;
      if (effect?.instakillNearest) {
        const anyVisible = prev.enemies.some(e => prev.map[e.pos.y]?.[e.pos.x]?.visible);
        if (!anyVisible) { addLog(`${item.emoji} No visible enemies to strike!`); return prev; }
      }
      if (effect) {
        if (effect.hpBonus)      stats.hp        = Math.min(stats.maxHp + (effect.maxHpBonus ?? 0), stats.hp + effect.hpBonus);
        if (effect.maxHpBonus)   stats.maxHp     = stats.maxHp + effect.maxHpBonus;
        if (effect.attackBonus)  stats.attack    = stats.attack  + effect.attackBonus;
        if (effect.defenseBonus) stats.defense   = stats.defense + effect.defenseBonus;
        if (effect.speedBonus)   stats.speed     = (stats.speed   ?? 0) + effect.speedBonus;
        if (effect.evasionBonus) stats.evasion   = (stats.evasion ?? 0) + effect.evasionBonus;
        if (effect.luckBonus)    stats.luck      = (stats.luck    ?? 0) + effect.luckBonus;
        if (effect.moodBonus)    stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + effect.moodBonus);
        if (effect.xpBonus) {
          const newXP = stats.xp + effect.xpBonus;
          const newLevel = levelFromXP(newXP);
          if (newLevel > stats.level) addLog(`✨ Level up! You are now level ${newLevel}!`);
          stats.xp = newXP; stats.level = newLevel;
        }
        addLog(`${item.emoji} ${effect.label}`);
      } else {
        addLog(`${item.emoji} ${item.name} activated!`);
      }

      const isWizard = prev.player.characterClass === '🧙';
      const echo = isWizard && Math.random() < 0.25;
      let newBank = prev.player.bank;
      if (echo) {
        addLog(`🧙 Spell Echo! ${item.emoji} resonates — not consumed.`);
      } else if (isStackableBagPassive(item) && (item.stackCount ?? 1) > 1) {
        newBank = prev.player.bank.map(it => it.id === itemId ? { ...it, stackCount: (it.stackCount ?? 1) - 1 } : it);
      } else {
        newBank = prev.player.bank.filter(i => i.id !== itemId);
      }

      let newPlayer = { ...prev.player, stats, bank: newBank };
      let newEnemies = prev.enemies;
      let newItems = prev.items;

      if (effect?.instakillNearest) {
        const visible = prev.enemies.filter(e => prev.map[e.pos.y]?.[e.pos.x]?.visible);
        const target = visible.reduce((closest, e) => {
          const d1 = Math.abs(e.pos.x - prev.player.pos.x) + Math.abs(e.pos.y - prev.player.pos.y);
          const d2 = Math.abs(closest.pos.x - prev.player.pos.x) + Math.abs(closest.pos.y - prev.player.pos.y);
          return d1 < d2 ? e : closest;
        });
        markEnemySeen(target.emoji); markEnemyKilled(target.emoji);
        addLog(`⚡ ZAP! ${target.emoji} ${target.name} is obliterated!`);
        newEnemies = prev.enemies.filter(e => e.id !== target.id);
        newPlayer = applyMonkeyDropOnKill(target, newPlayer);
        if (target.isBoss || Math.random() < 0.50) {
          const r2 = Math.random();
          const drop = r2 < 0.12 ? getRandomEquipmentDrop(prev.currentFloor) : r2 < 0.28 ? getRandomActiveDrop() : getRandomHealDrop();
          newItems = [...newItems, { ...drop, id: `zap-drop-${Math.random()}`, consumed: false, pos: target.pos }];
        }
      }

      const mid = { ...prev, player: newPlayer, enemies: newEnemies, items: newItems, turn: prev.turn + 1 };
      return applyEnemyTurns(mid, runEnemyTurns(mid));
    });
  }, [addLog, setGameState]);

  const handleEquip = useCallback((itemId: string, slot: EquipSlot) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const { player } = prev;
      const invIdx  = player.inventory.findIndex(i => i.id === itemId);
      const bankIdx = player.bank.findIndex(i => i.id === itemId);
      const item = invIdx >= 0 ? player.inventory[invIdx] : bankIdx >= 0 ? player.bank[bankIdx] : null;
      if (!item || !item.isEquipment) return prev;
      if (!item.equipSlots?.includes(slot)) { addLog(`${item.emoji} can't go in ${slot} slot.`); return prev; }

      const cls = player.characterClass;
      if (item.specialAmmoKind && cls !== '🧝') { addLog(`${item.emoji} Special arrows are Ranger-only.`); return prev; }
      if ((slot === 'mainHand' || slot === 'offHand') && item.weaponKind) {
        if (cls === '🧙' && item.weaponKind !== 'staff') { addLog(`🧙 Wizard main/off-hand: staves & wands only.`); return prev; }
        if (cls === '🥷' && item.weaponKind !== 'blade') { addLog(`🥷 Ninja main/off-hand: blades only.`); return prev; }
        if (cls === '🧝' && slot === 'mainHand' && !['bow', 'gun'].includes(item.weaponKind)) { addLog(`🧝 Ranger main hand: bow or gun only.`); return prev; }
        if (cls === '🤠' && item.weaponKind !== 'gun') { addLog(`🤠 Only real Cowboys fight with their fists!`); return prev; }
      }
      if (item.armorKind === 'shield' && slot !== 'offHand') { addLog(`Shield goes in the off-hand slot.`); return prev; }
      if (item.armorKind && (slot === 'mainHand' || slot === 'offHand') && item.armorKind !== 'shield' && cls !== '🤠') {
        addLog(`Armor goes in the Body slot.`); return prev;
      }

      let newInv = [...player.inventory];
      let newBank = [...player.bank];
      const currentEquipped = player.equipment[slot];
      if (currentEquipped) {
        const result = addToBag(newInv, newBank, currentEquipped);
        newInv = result.inventory; newBank = result.bank;
        result.nonStackableBanked.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
        result.duplicateActiveBanked.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
      }
      if (invIdx >= 0) newInv = newInv.filter(i => i.id !== itemId);
      else newBank = newBank.filter(i => i.id !== itemId);

      const bonusStr = Object.entries(item.equipBonus ?? {}).filter(([,v]) => (v ?? 0) !== 0).map(([k, v]) => `${(v ?? 0) > 0 ? '+' : ''}${v}${k.substring(0,3).toUpperCase()}`).join(' ');
      addLog(`${item.emoji} ${item.name} equipped${bonusStr ? ` (${bonusStr})` : ''}.`);
      const newEquipment = { ...player.equipment, [slot]: item };
      const wasAlreadyDualGun = player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
      if (cls === '🤠' && item.weaponKind === 'gun' && !wasAlreadyDualGun && newEquipment.mainHand?.weaponKind === 'gun' && newEquipment.offHand?.weaponKind === 'gun') {
        addLog(`🤠 Real Cowboys fight with their fists... but a Real American Hero fights with his two Peacemakers!`);
      }
      return { ...prev, player: { ...player, inventory: newInv, bank: newBank, equipment: newEquipment } };
    });
  }, [addLog, setGameState]);

  const handleUnequip = useCallback((slot: EquipSlot) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const { player } = prev;
      const item = player.equipment[slot];
      if (!item) return prev;
      const { inventory, bank, nonStackableBanked: _nsbU, duplicateActiveBanked: _dabU } = addToBag(player.inventory, player.bank, item);
      _nsbU.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
      _dabU.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
      const newEquipment = { ...player.equipment };
      delete newEquipment[slot];
      addLog(`${item.emoji} ${item.name} unequipped.`);
      return { ...prev, player: { ...player, inventory, bank, equipment: newEquipment } };
    });
  }, [addLog, setGameState]);

  const handleBlinkStrikeOnTarget = useCallback((targetId: string) => {
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.player.characterClass !== '🥷') return prev;
      const cooldown = prev.player.stats.blinkStrikeCooldown ?? 0;
      if (cooldown > 0) {
        addLog(`🥷 Blink Strike not ready — ${cooldown}t remaining.`);
        return prev;
      }
      const target = prev.enemies.find(e => e.id === targetId);
      if (!target) { addLog('🥷 Blink Strike — target lost.'); return prev; }
      if (target.tag === 'Friendly' || (target.tag === 'Neutral' && !target.engaged)) {
        addLog(`🥷 Blink Strike — ${target.name} is not hostile.`);
        return prev;
      }
      const dist = chebyshev(prev.player.pos, target.pos);
      if (dist < 1 || dist > 6 || !hasLOSBetween(prev.map, prev.player.pos, target.pos) || !prev.map[target.pos.y]?.[target.pos.x]?.visible) {
        addLog('🥷 Blink Strike — target out of range or LOS broken.');
        return prev;
      }

      const dirs8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      const adjFree = dirs8
        .map(([dy, dx]) => ({ x: target.pos.x + dx, y: target.pos.y + dy }))
        .filter(p => {
          const tile = prev.map[p.y]?.[p.x];
          return tile && PLAYER_PASSABLE_TILES.has(tile.type) &&
            !prev.enemies.some(e => e.id !== target.id && e.pos.x === p.x && e.pos.y === p.y);
        });
      const blinkPos = adjFree.length > 0 ? adjFree[0] : prev.player.pos;

      const _blinkPassives = computeBagPassives(prev.player.inventory);
      const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, false);
      const blinkEffPlayer = applyEquipmentAndPassives({ ...prev.player, pos: blinkPos });
      const boostedPlayer = { ...blinkEffPlayer, pos: blinkPos, stats: { ...blinkEffPlayer.stats, attack: Math.round(blinkEffPlayer.stats.attack * 2) } };

      addLog(`🥷 Blink Strike → ${target.emoji} ${target.name}!`);
      const combatResult = resolveCombat(boostedPlayer, target, addLog, { mood, advantage: _blinkPassives.advantageDice, execBlow: _blinkPassives.execBlow });

      let actuallyKilled = combatResult.enemyDied;
      const blinkDmg = target.hp - Math.max(0, combatResult.enemyHp);

      const blinkFloats: FloatingText[] = [];
      if (blinkDmg > 0) blinkFloats.push({ id: `blink-e-${target.id}-${prev.turn}`, pos: { ...target.pos }, text: `-${blinkDmg}`, color: '#818cf8', life: 2 });
      const dmgToPlayer = prev.player.stats.hp - combatResult.playerHp;
      if (dmgToPlayer > 0) blinkFloats.push({ id: `blink-p-${prev.turn}`, pos: { ...blinkPos }, text: `-${dmgToPlayer}`, color: '#f97316', life: 2 });

      let newEnemies = [...prev.enemies];
      const targetIdx = newEnemies.findIndex(e => e.id === target.id);
      let newKillCounts = { ...prev.killCounts };
      let ninjaFreeMoves = prev.ninjaFreeMoves ?? 0;

      let newPlayer: Player = {
        ...prev.player,
        pos: blinkPos,
        stats: { ...prev.player.stats, hp: combatResult.playerHp, blinkStrikeCooldown: 8, moodValue: Math.max(-100, prev.player.stats.moodValue - 5) },
      };

      if (combatResult.enemyDied && target.godBlessed) {
        const gb = handleGodBlessedImmunity(target, newEnemies, targetIdx, newPlayer.stats.hp, prev.turn, addLog, blinkFloats);
        if (gb.proc) {
          actuallyKilled = false;
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, hp: gb.newPlayerHp } };
          newEnemies = gb.newEnemies;
          if (gb.newPlayerHp <= 0) {
            return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer: { name: target.name, emoji: target.emoji }, floatingTexts: [...blinkFloats, ...prev.floatingTexts] };
          }
        }
      }

      if (actuallyKilled) {
        markEnemyKilled(target.emoji);
        newKillCounts[target.emoji] = (newKillCounts[target.emoji] ?? 0) + 1;
        if (targetIdx !== -1) newEnemies.splice(targetIdx, 1);
        newPlayer = applyMonkeyDropOnKill(target, newPlayer);
        const blinkInstakill = target.hp >= target.maxHp;
        const currentChain = prev.player.stats.blinkStrikeInstakillChain ?? 0;
        if (blinkInstakill && currentChain < 3) {
          const newChain = currentChain + 1;
          newPlayer.stats.blinkStrikeCooldown = 0;
          newPlayer.stats.blinkStrikeInstakillChain = newChain;
          addLog(`🥷 Blink Kill! Chain ${newChain}/3 — instant reset!`);
        } else if (blinkInstakill) {
          newPlayer.stats.blinkStrikeCooldown = 3;
          newPlayer.stats.blinkStrikeInstakillChain = currentChain;
          addLog(`🥷 Blink Kill! Chain maxed — 3t cooldown.`);
        } else {
          newPlayer.stats.blinkStrikeCooldown = 7;
          newPlayer.stats.blinkStrikeInstakillChain = 0;
          addLog(`🥷 Blink Kill! Cooldown: 7t.`);
        }
        newPlayer.stats.moodValue = Math.min(moodMax('🥷'), prev.player.stats.moodValue + 15);
        const freeMovesGain = prev.stealthMode ? 2 : 1;
        ninjaFreeMoves += freeMovesGain;
        addLog(`🥷 Assassin's Edge — ${freeMovesGain} free move${freeMovesGain > 1 ? 's' : ''}!`);
      } else if (!target.godBlessed || !combatResult.enemyDied) {
        if (targetIdx !== -1) newEnemies[targetIdx] = { ...target, hp: combatResult.enemyHp, engaged: true };
        newPlayer.stats.blinkStrikeInstakillChain = 0;
        addLog(`🥷 Blink Strike — 8 turn cooldown started.`);
      } else {
        newPlayer.stats.blinkStrikeInstakillChain = 0;
        addLog(`🥷 Blink Strike — 8 turn cooldown started.`);
      }

      if (combatResult.playerDied) {
        return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer: { name: target.name, emoji: target.emoji }, floatingTexts: [...blinkFloats, ...prev.floatingTexts] };
      }

      newPlayer.stats.blinkStrikeInstakillOutOfCombat = 0;
      const midState: GameState = { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, killCounts: newKillCounts, floatingTexts: [...blinkFloats, ...prev.floatingTexts], ninjaFreeMoves };
      return applyEnemyTurns(withVisibility(midState), runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const handleBlinkStrike = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.player.characterClass !== '🥷') return prev;
      const cooldown = prev.player.stats.blinkStrikeCooldown ?? 0;
      if (cooldown > 0) {
        addLog(`🥷 Blink Strike not ready — ${cooldown} turn${cooldown > 1 ? 's' : ''} remaining.`);
        return prev;
      }

      const targets = prev.enemies.filter(e => {
        const dist = chebyshev(prev.player.pos, e.pos);
        return dist >= 1 && dist <= 6 && hasLOSBetween(prev.map, prev.player.pos, e.pos) && prev.map[e.pos.y]?.[e.pos.x]?.visible
          && (e.tag === 'Hostile' || e.engaged);
      });
      if (targets.length === 0) {
        addLog('🥷 Blink Strike — no targets in range (6 tiles, requires LOS).');
        return prev;
      }
      const target = targets.reduce((a, b) =>
        chebyshev(prev.player.pos, a.pos) <= chebyshev(prev.player.pos, b.pos) ? a : b
      );

      const dirs8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      const adjFree = dirs8
        .map(([dy, dx]) => ({ x: target.pos.x + dx, y: target.pos.y + dy }))
        .filter(p => {
          const tile = prev.map[p.y]?.[p.x];
          return tile && PLAYER_PASSABLE_TILES.has(tile.type) &&
            !prev.enemies.some(e => e.id !== target.id && e.pos.x === p.x && e.pos.y === p.y);
        });
      const blinkPos = adjFree.length > 0 ? adjFree[0] : prev.player.pos;

      const _blinkPassives = computeBagPassives(prev.player.inventory);
      const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, false);
      const blinkEffPlayer = applyEquipmentAndPassives({ ...prev.player, pos: blinkPos });
      const boostedPlayer = { ...blinkEffPlayer, pos: blinkPos, stats: { ...blinkEffPlayer.stats, attack: Math.round(blinkEffPlayer.stats.attack * 2) } };

      addLog(`🥷 Blink Strike → ${target.emoji} ${target.name}!`);
      const combatResult = resolveCombat(boostedPlayer, target, addLog, { mood, advantage: _blinkPassives.advantageDice, execBlow: _blinkPassives.execBlow });

      let actuallyKilledX = combatResult.enemyDied;
      const blinkDmg = target.hp - Math.max(0, combatResult.enemyHp);

      const blinkFloats: FloatingText[] = [];
      if (blinkDmg > 0) blinkFloats.push({ id: `blink-e-${target.id}-${prev.turn}`, pos: { ...target.pos }, text: `-${blinkDmg}`, color: '#818cf8', life: 2 });
      const dmgToPlayer = prev.player.stats.hp - combatResult.playerHp;
      if (dmgToPlayer > 0) blinkFloats.push({ id: `blink-p-${prev.turn}`, pos: { ...blinkPos }, text: `-${dmgToPlayer}`, color: '#f97316', life: 2 });

      let newEnemies = [...prev.enemies];
      const targetIdx = newEnemies.findIndex(e => e.id === target.id);
      let newKillCounts = { ...prev.killCounts };
      let ninjaFreeMoves = prev.ninjaFreeMoves ?? 0;

      let newPlayer: Player = {
        ...prev.player,
        pos: blinkPos,
        stats: { ...prev.player.stats, hp: combatResult.playerHp, blinkStrikeCooldown: 8, moodValue: Math.max(-100, prev.player.stats.moodValue - 5) },
      };

      if (combatResult.enemyDied && target.godBlessed) {
        const gb = handleGodBlessedImmunity(target, newEnemies, targetIdx, newPlayer.stats.hp, prev.turn, addLog, blinkFloats);
        if (gb.proc) {
          actuallyKilledX = false;
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, hp: gb.newPlayerHp } };
          newEnemies = gb.newEnemies;
          if (gb.newPlayerHp <= 0) {
            return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer: { name: target.name, emoji: target.emoji }, floatingTexts: [...blinkFloats, ...prev.floatingTexts] };
          }
        }
      }

      if (actuallyKilledX) {
        markEnemyKilled(target.emoji);
        newKillCounts[target.emoji] = (newKillCounts[target.emoji] ?? 0) + 1;
        if (targetIdx !== -1) newEnemies.splice(targetIdx, 1);
        newPlayer = applyMonkeyDropOnKill(target, newPlayer);
        const blinkInstakillX = target.hp >= target.maxHp;
        const currentChainX = prev.player.stats.blinkStrikeInstakillChain ?? 0;
        if (blinkInstakillX && currentChainX < 3) {
          const newChain = currentChainX + 1;
          newPlayer.stats.blinkStrikeCooldown = 0;
          newPlayer.stats.blinkStrikeInstakillChain = newChain;
          addLog(`🥷 Blink Kill! Chain ${newChain}/3 — instant reset!`);
        } else if (blinkInstakillX) {
          newPlayer.stats.blinkStrikeCooldown = 3;
          newPlayer.stats.blinkStrikeInstakillChain = currentChainX;
          addLog(`🥷 Blink Kill! Chain maxed — 3t cooldown.`);
        } else {
          newPlayer.stats.blinkStrikeCooldown = 7;
          newPlayer.stats.blinkStrikeInstakillChain = 0;
          addLog(`🥷 Blink Kill! Cooldown: 7t.`);
        }
        newPlayer.stats.moodValue = Math.min(moodMax('🥷'), prev.player.stats.moodValue + 15);
        const freeMovesGain = prev.stealthMode ? 2 : 1;
        ninjaFreeMoves += freeMovesGain;
        addLog(`🥷 Assassin's Edge — ${freeMovesGain} free move${freeMovesGain > 1 ? 's' : ''}!`);
      } else if (!target.godBlessed || !combatResult.enemyDied) {
        if (targetIdx !== -1) newEnemies[targetIdx] = { ...target, hp: combatResult.enemyHp, engaged: true };
        newPlayer.stats.blinkStrikeInstakillChain = 0;
        addLog(`🥷 Blink Strike — 8 turn cooldown started.`);
      } else {
        newPlayer.stats.blinkStrikeInstakillChain = 0;
        addLog(`🥷 Blink Strike — 8 turn cooldown started.`);
      }

      if (combatResult.playerDied) {
        return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer: { name: target.name, emoji: target.emoji }, floatingTexts: [...blinkFloats, ...prev.floatingTexts] };
      }

      newPlayer.stats.blinkStrikeInstakillOutOfCombat = 0;
      const midState: GameState = { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, killCounts: newKillCounts, floatingTexts: [...blinkFloats, ...prev.floatingTexts], ninjaFreeMoves };
      return applyEnemyTurns(withVisibility(midState), runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

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
