import { useCallback } from 'react';
import { Player, Enemy, Position, FloatingText, GameState } from '../game/types';
import { resolveCombat, getCowboyUnarmedBonus, isHostileCombatTarget } from '../game/combat';
import { getFoodHealItems } from '../game/emojis';
import { rollKillDrop } from '../game/dropTable';
import { applyFlowingStrike } from '../game/blinkStrike';
import { resolveGenieFireball } from '../game/prestigeCast';
import {
  classFlies, fencerOutgoingMult, gunshotPlan, isArcaneCaster, isFencer,
  isGenie, isHitman, isRoyalGuard, notePrestigeKill, pierceDamage, tickPrestigeTimers, tileBeyond,
} from '../game/prestige';
import {
  applyDrinkBuffTick, cowboyCombatMoodValue, isDrinkStealthActive, playerMood,
  RANGER_SURVIVALIST_SAVE_CHANCE, rangerDrinkBonuses, resolveRangedAmmoSpend,
} from '../game/drinks';
import { markEnemySeen, markEmojiSeen, markEnemyKilled } from '../game/discoveries';
import {
  moodMax, chebyshev, hasLOS, hasLOSBetween, VISION_RADIUS,
  eagleEyeRange, PLAYER_PASSABLE_TILES, playerBagPassives,
  applyEquipmentAndPassives, withVisibility, runEnemyTurns, applyEnemyTurns, tickActiveBuffs,
  addToPlayerBag, levelFromXP, livingMaxHp, playerSoftCap,
  mpBonusForLevel, computeNinjaEvasion, getRandomCowboyFlavor, handleGodBlessedImmunity,
  _flashSignals, tryDualGunsFanfare, PEACEMAKERS_LOG, restoreStolenEmojis, stolenEmojiSummary,
  applyBedRest, simulateSleep, SLEEP_TURNS, BED_OVERHEAL_MULT,
  evaluateBedSleep, consumeBedUse, shouldConfirmLavaStep,
} from '../game/gameHelpers';
import { lightningArcDamage } from '../game/passives';
import { canEquipItem } from '../components/itemUtils';
import { creditVoidBoss } from '../game/voidDamage';
import { applyEntropicTithe } from '../game/voidAbilities';
import { applyOverhealDecay, tickBlinkChainOutOfCombat, applyLevelUp } from '../game/playerTurn';
import { descendFloor } from '../game/descend';
import { shouldPromptFinaleStairs, spectatorBumpText } from '../game/finale';
import type { GameRefs, GameSetters } from './actions/types';
import { useTacticsActions } from './actions/useTacticsActions';
import { useInventoryActions } from './actions/useInventoryActions';
import { useItemActions } from './actions/useItemActions';
import { useCombatActions } from './actions/useCombatActions';

const WAIT_HEAL = 1;

function noteKill(player: Player, floor: number) {
  return notePrestigeKill(player, floor, playerSoftCap(player).raw.luck);
}

function stampDualGunsFanfare(state: GameState, prevEquipment: Player['equipment'], addLog: (text: string) => void): GameState {
  const fan = tryDualGunsFanfare({
    characterClass: state.player.characterClass,
    prevEquipment,
    nextEquipment: state.player.equipment,
    alreadyDone: state.dualGunsFanfareDone,
  });
  if (fan.fired) addLog(PEACEMAKERS_LOG);
  return fan.done ? { ...state, dualGunsFanfareDone: true } : state;
}

export function useGameActions(refs: GameRefs, setters: GameSetters) {
  const {
    gameStateRef, wizardTacticsRef, autoStealthRef, rangerModeRef,
    lastCowboyFlavorTurnRef,
    blinkTurnRef, trailblazeTurnRef,
    lavaStepConfirmedRef,
    finalePromptRef,
    voidAttackModeRef,
  } = refs;
  const {
    setGameState, setWizardTactics, setRangerMode,
    setPendingFairyId, setPendingMonkeyInteraction,
    setPendingAdventurerInteraction, setPendingBearInteraction,
    setBlinkTurn, setTrailblazeTurn,
    setPendingLavaStep,
    setFinalePrompt,
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
      const restored = restoreStolenEmojis(p, killed.stolenEmojis);
      const bankNote = restored.banked > 0 ? ` (${restored.banked} overflowed to bank)` : '';
      addLog(`🐒 ${killed.emoji} Monkey dropped your ${stolenEmojiSummary(killed.stolenEmojis)}! Soul restored.${bankNote}`);
      return { ...p, inventory: restored.inventory, bank: restored.bank };
    }
    return p;
  };

  const handleMove = useCallback((dx: number, dy: number) => {
    // Auto-deactivate expired Blink / Trailblaze (must run outside setGameState)
    const _outerState = gameStateRef.current;
    if (_outerState && !_outerState.gameOver) {
      const _cls = _outerState.player.characterClass;
      if (isArcaneCaster(_cls) && wizardTacticsRef.current.mode === 'holdfire' && _outerState.turn - blinkTurnRef.current >= BLINK_ACTIVE) {
        const _reset = { mode: 'nearest' as const, manualTargetId: null };
        wizardTacticsRef.current = _reset;
        setWizardTactics(_reset);
        addLog(isGenie(_cls) ? '✨ Blink faded — Fireball resumes' : '✨ Blink faded — Arcane Barrage resumes');
      }
      if (_cls === '🧝' && rangerModeRef.current === 'flee' && _outerState.turn - trailblazeTurnRef.current >= BLINK_ACTIVE) {
        rangerModeRef.current = 'ranged';
        setRangerMode('ranged');
        addLog('💨 Trailblaze faded — bow at the ready');
      }

      const from = _outerState.player.pos;
      const cls = _outerState.player.characterClass;
      const previewShot = gunshotPlan(_outerState.player);
      let cowboyWouldShoot = false;
      if (previewShot) {
        for (let range = 2; range <= previewShot.range; range++) {
          const tx = from.x + dx * range;
          const ty = from.y + dy * range;
          const enemy = _outerState.enemies.find(e => e.pos.x === tx && e.pos.y === ty);
          if (!enemy) continue;
          if (!hasLOS(_outerState.map, from, dx, dy, range)) break;
          if (enemy.isSpectator) break;
          if (enemy.tag === 'Friendly') continue;
          if (enemy.tag === 'Neutral' && !enemy.engaged) continue;
          cowboyWouldShoot = true;
          break;
        }
      }
      let walkDest = { x: from.x + dx, y: from.y + dy };
      const isBlinkActive = isArcaneCaster(cls) && wizardTacticsRef.current.mode === 'holdfire' && (_outerState.turn - blinkTurnRef.current) < BLINK_ACTIVE;
      if (isBlinkActive) {
        const pos2 = { x: from.x + 2 * dx, y: from.y + 2 * dy };
        const destTile = _outerState.map[pos2.y]?.[pos2.x];
        const canSwim = playerBagPassives(_outerState.player).canSwim || classFlies(cls);
        if (destTile && (PLAYER_PASSABLE_TILES.has(destTile.type) || destTile.type === 'door-closed' || (destTile.type === 'water' && canSwim) || (destTile.type === 'lava' && classFlies(cls)))) {
          walkDest = pos2;
        }
      }
      const fromType = _outerState.map[from.y]?.[from.x]?.type ?? '';
      const destType = _outerState.map[walkDest.y]?.[walkDest.x]?.type ?? '';
      const occupant = _outerState.enemies.some(e => e.pos.x === walkDest.x && e.pos.y === walkDest.y);
      if (
        !cowboyWouldShoot &&
        !classFlies(cls) &&
        shouldConfirmLavaStep(fromType, destType) &&
        !occupant &&
        !lavaStepConfirmedRef.current
      ) {
        setPendingLavaStep({ dx, dy });
        return;
      }
      lavaStepConfirmedRef.current = false;
    }

    setGameState(prev => {
      if (!prev || prev.gameOver || prev.floorAnnouncement) return prev;

      const { player } = prev;
      const cls = player.characterClass;

      const cowboyDualGuns = cls === '🤠' && player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
      const shotPlan = gunshotPlan(player);
      if (shotPlan) {
        for (let range = 2; range <= shotPlan.range; range++) {
          const tx = player.pos.x + dx * range;
          const ty = player.pos.y + dy * range;
          const enemyIdx = prev.enemies.findIndex(e => e.pos.x === tx && e.pos.y === ty);
          if (enemyIdx === -1) continue;
          if (!hasLOS(prev.map, player.pos, dx, dy, range)) break;
          const enemy = prev.enemies[enemyIdx];
          if (enemy.isSpectator) break;
          if (enemy.tag === 'Friendly') continue;
          if (enemy.tag === 'Neutral' && !enemy.engaged) continue;
          markEnemySeen(enemy.emoji);
          const mood = playerMood(prev.player);
          const effectiveCowboy = applyEquipmentAndPassives(player);
          const _cowboyPassives = playerBagPassives(prev.player);
          const cResult = resolveCombat(effectiveCowboy, enemy, addLog, { mood, cowboyMoodValue: cowboyCombatMoodValue(prev.player), advantage: _cowboyPassives.advantageDice, execBlow: _cowboyPassives.execBlow, trueAim: _cowboyPassives.trueAim, shieldWall: _cowboyPassives.shieldWall, isRanged: true, damageMult: shotPlan.damageMult });
          if (cResult.fled) { const midState = { ...prev, turn: prev.turn + 1 }; return applyEnemyTurns(midState, runEnemyTurns(midState)); }
          addLog(shotPlan.label);
          const cFloats: FloatingText[] = [];
          const cDmg = enemy.hp - cResult.enemyHp;
          if (cDmg > 0) cFloats.push({ id: `hit-e-cg-${enemy.id}-${prev.turn}`, pos: { ...enemy.pos }, text: `-${cDmg}`, color: '#fbbf24', life: 2 });
          const _cBeam: Position[] = [];
          for (let n = 1; n <= range; n++) _cBeam.push({ x: player.pos.x + dx * n, y: player.pos.y + dy * n });
          const cBeam = { positions: _cBeam, color: '#fbbf24' };
          let cEnemies = [...prev.enemies];
          let cPlayer: Player = { ...player, ammo: player.ammo - shotPlan.ammoCost, stats: { ...player.stats, hp: cResult.playerHp } };
          let cSkip: string | undefined;
          let cKillCounts = { ...prev.killCounts };
          if (cResult.enemyDied) {
            markEnemyKilled(enemy.emoji);
            cKillCounts = { ...cKillCounts, [enemy.emoji]: (cKillCounts[enemy.emoji] ?? 0) + 1 };
            cPlayer = applyMonkeyDropOnKill(enemy, cPlayer);
            {
              const paid = noteKill(cPlayer, prev.currentFloor);
              cPlayer = paid.player;
              paid.logs.forEach(addLog);
            }
            cEnemies.splice(enemyIdx, 1);
            cPlayer.stats.xp = cPlayer.stats.xp + (enemy.isBoss ? 25 : 5);
            cPlayer.stats.moodValue = Math.min(moodMax(cls), cPlayer.stats.moodValue + 10);
            const cDrop = rollKillDrop({
              boss: !!enemy.isBoss,
              clover: _cowboyPassives.bonusLoot,
              floor: prev.currentFloor,
              playerClass: cls,
              cowboyDualGuns: true,
            });
            if (cDrop) {
              const cItem = { ...cDrop, id: `drop-${Math.random()}`, consumed: false, pos: enemy.pos };
              const cMid = { ...prev, killCounts: cKillCounts, player: cPlayer, enemies: cEnemies, items: [...prev.items, cItem], turn: prev.turn + 1, floatingTexts: cFloats, pendingBeam: cBeam };
              return applyEnemyTurns(cMid, runEnemyTurns(cMid));
            }
          } else {
            const cLanded = cResult.enemyHp < enemy.hp;
            const _cBurning = cLanded && _cowboyPassives.burningOnHit ? { burningTurns: 3 } : {};
            if (cLanded && _cowboyPassives.burningOnHit) addLog(`🔥 ${enemy.emoji} is ignited!`);
            cEnemies[enemyIdx] = { ...enemy, hp: cResult.enemyHp, engaged: true, ..._cBurning };
            cSkip = enemy.id;
          }
          if (cResult.playerDied) return { ...prev, killCounts: cKillCounts, player: cPlayer, enemies: cEnemies, floatingTexts: cFloats, gameOver: true, killer: { name: enemy.name, emoji: enemy.emoji } };
          const cMid = { ...prev, killCounts: cKillCounts, player: cPlayer, enemies: cEnemies, turn: prev.turn + 1, floatingTexts: cFloats, pendingBeam: cBeam };
          return applyEnemyTurns(cMid, runEnemyTurns(cMid, cSkip));
        }
      }

      const voidRanged = cls === '👤' && voidAttackModeRef.current === 'ranger';
      if (((cls === '🧝' || isRoyalGuard(cls)) && rangerModeRef.current === 'ranged') || voidRanged) {
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
          if (enemy.isSpectator) break;
          if (enemy.tag === 'Friendly') continue;
          if (enemy.tag === 'Neutral' && !enemy.engaged) continue;
          const mood = playerMood(prev.player);
          const effectiveRanger = applyEquipmentAndPassives(player);
          const _rangerPassives = playerBagPassives(prev.player);
          const combatResult = resolveCombat(effectiveRanger, enemy, addLog, { mood, cowboyMoodValue: cowboyCombatMoodValue(prev.player), advantage: _rangerPassives.advantageDice, execBlow: _rangerPassives.execBlow, trueAim: _rangerPassives.trueAim, shieldWall: _rangerPassives.shieldWall, firstShot: (cls === '🧝' || voidRanged) && !enemy.engaged, isRanged: true });

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
          if (!combatResult.fled && combatResult.enemyHp > 0 && combatResult.enemyHp < enemy.hp && _rangerPassives.burningOnHit && !specialAmmoEffect.burningTurns) {
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
          const drinkAmmo = rangerDrinkBonuses(prev.player);
          const royalBrew = isRoyalGuard(cls) && (drinkAmmo.survivalistBonus > 0 || drinkAmmo.arrowReclaimChance > 0);
          const ammoSpend = (cls === '🧝' || royalBrew)
            ? resolveRangedAmmoSpend(
              RANGER_SURVIVALIST_SAVE_CHANCE,
              drinkAmmo.survivalistBonus,
              drinkAmmo.arrowReclaimChance,
              Math.random,
            )
            : { saved: false, reclaimed: false, ammoDelta: -1 };
          if (ammoSpend.saved) addLog(`🪶 Survivalist — ammo saved!`);
          else if (ammoSpend.reclaimed) addLog(`🏹 Arrow reclaimed!`);
          let newPlayer: Player = {
            ...player,
            ammo: player.ammo + ammoSpend.ammoDelta,
            stats: { ...player.stats, hp: combatResult.playerHp },
          };

          let skipFightId: string | undefined;
          let rangerKillCounts = { ...prev.killCounts };
          const applyShotPierce = () => {
            if (!isRoyalGuard(cls) || rangedDmgToEnemy <= 0) return;
            const beyond = tileBeyond(player.pos, enemy.pos);
            const victim = newEnemies.find(e => e.hp > 0 && e.pos.x === beyond.x && e.pos.y === beyond.y && isHostileCombatTarget(e));
            if (!victim) return;
            const pd = pierceDamage(rangedDmgToEnemy);
            addLog(`💂 Piercing shot hits ${victim.emoji} for ${pd}.`);
            if (victim.hp - pd <= 0) {
              markEnemyKilled(victim.emoji);
              rangerKillCounts = { ...rangerKillCounts, [victim.emoji]: (rangerKillCounts[victim.emoji] ?? 0) + 1 };
              newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, xp: newPlayer.stats.xp + (victim.isBoss ? 25 : 5) } };
              newEnemies = newEnemies.filter(e => e.id !== victim.id);
            } else {
              newEnemies = newEnemies.map(e => e.id === victim.id ? { ...e, hp: e.hp - pd, engaged: true } : e);
            }
          };
          if (combatResult.enemyDied) {
            markEnemyKilled(enemy.emoji);
            rangerKillCounts = { ...rangerKillCounts, [enemy.emoji]: (rangerKillCounts[enemy.emoji] ?? 0) + 1 };
            newPlayer = applyMonkeyDropOnKill(enemy, newPlayer);
            {
              const paid = noteKill(newPlayer, prev.currentFloor);
              newPlayer = paid.player;
              paid.logs.forEach(addLog);
            }
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
            const drop = rollKillDrop({
              boss: !!enemy.isBoss,
              clover: _rangerPassives.bonusLoot,
              floor: prev.currentFloor,
              playerClass: cls,
            });
            if (drop) {
              const newItem = { ...drop, id: `drop-${Math.random()}`, consumed: false, pos: enemy.pos };
              applyShotPierce();
              let midState: GameState = { ...prev, killCounts: rangerKillCounts, player: newPlayer, enemies: newEnemies, items: [...prev.items, newItem], turn: prev.turn + 1, floatingTexts: rangedBaseFloats, pendingBeam: rangerBeam, difficultyTier: enemy.isBoss ? (prev.difficultyTier ?? 0) + 1 : (prev.difficultyTier ?? 0) };
              if (enemy.isBoss) midState = creditVoidBoss(midState, enemy);
              return applyEnemyTurns(midState, runEnemyTurns(midState));
            }
          } else {
            newEnemies[enemyIdx] = { ...enemy, hp: combatResult.enemyHp, engaged: true, ...specialAmmoEffect };
            skipFightId = enemy.id;
          }

          applyShotPierce();
          if (combatResult.playerDied) return { ...prev, killCounts: rangerKillCounts, player: newPlayer, enemies: newEnemies, floatingTexts: rangedBaseFloats, gameOver: true, killer: { name: enemy.name, emoji: enemy.emoji } };
          let midState: GameState = { ...prev, killCounts: rangerKillCounts, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, floatingTexts: rangedBaseFloats, pendingBeam: rangerBeam };
          if (combatResult.enemyDied && enemy.isBoss) midState = creditVoidBoss(midState, enemy);
          return applyEnemyTurns(midState, runEnemyTurns(midState, skipFightId));
        }
      }

      let newPos = { x: player.pos.x + dx, y: player.pos.y + dy };

      // ── Wizard Blink: teleport 2 tiles, ignoring intermediate tile ──────────
      const isBlinkActive = isArcaneCaster(cls) && wizardTacticsRef.current.mode === 'holdfire' && (prev.turn - blinkTurnRef.current) < BLINK_ACTIVE;
      if (isBlinkActive) {
        const pos2 = { x: player.pos.x + 2 * dx, y: player.pos.y + 2 * dy };
        if (pos2.y >= 0 && pos2.y < prev.map.length && pos2.x >= 0 && pos2.x < prev.map[0].length) {
          const destTile = prev.map[pos2.y][pos2.x];
          const _canSwimBlink = playerBagPassives(prev.player).canSwim || classFlies(cls);
          const destPassable = PLAYER_PASSABLE_TILES.has(destTile.type) || destTile.type === 'door-closed' || (destTile.type === 'water' && _canSwimBlink) || (destTile.type === 'lava' && classFlies(cls));
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

      if (tile.type === 'lava') {
        // Walkable but deadly — damage is applied in tickVolcanoAndLava at end of turn.
      } else if (tile.type === 'water') {
        const canSwim = playerBagPassives(prev.player).canSwim || classFlies(cls);
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
                } else {
                  const { inventory: _bInv, bank: _bBnk } = addToPlayerBag(bumpedPlayer, pickedUp);
                  const wentToBank = _bBnk.length > bumpedPlayer.bank.length;
                  bumpedPlayer = { ...bumpedPlayer, inventory: _bInv, bank: _bBnk };
                  addLog(wentToBank
                    ? `🎒 Bag full! Picked up ${pickedUp.emoji} ${pickedUp.name} — sent to bank.`
                    : `Picked up ${pickedUp.emoji} ${pickedUp.name} (${pickedUp.description})`);
                }
              }
              const midState = stampDualGunsFanfare(
                { ...prev, player: bumpedPlayer, items: newItems, turn: prev.turn + 1 },
                player.equipment,
                addLog,
              );
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
          const tile2Passable = (PLAYER_PASSABLE_TILES.has(tile2.type) && tile2.type !== 'door-closed')
            || (tile2.type === 'water' && (playerBagPassives(prev.player).canSwim || classFlies(cls)));
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

        if (enemy.isSpectator) {
          addLog(spectatorBumpText(enemy.emoji));
          return prev;
        }

        if ((enemy.isAdventurer || enemy.bear) && enemy.isRecruited) {
          // DCSS-style: bump into recruited companion (adventurer or bear) swaps positions
          const companion = prev.enemies[enemyIndex];
          const newEnemies = [...prev.enemies];
          newEnemies[enemyIndex] = { ...companion, pos: { x: player.pos.x, y: player.pos.y } };

          const newPlayer: Player = {
            ...player,
            pos: { x: companion.pos.x, y: companion.pos.y },
          };

          addLog(`You swap places with ${companion.emoji} ${companion.name}.`);

          // Mood update as if moving
          const hpRatio = newPlayer.stats.hp / livingMaxHp(newPlayer);
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
        if (enemy.monkey && !enemy.engaged) {
          const MONKEY_FOODS = ['🍎', '🍖', '🧪', '🍇', '🫀', '🍞', '🧅', '🍄'];
          const wants = MONKEY_FOODS[Math.floor(Math.random() * MONKEY_FOODS.length)];
          setPendingMonkeyInteraction({ id: enemy.id, wants });
          return prev;
        }
        if (enemy.bear && !enemy.engaged && enemy.tag !== 'Hostile') {
          const foodItems = getFoodHealItems(prev.player.inventory);
          const offerItem = foodItems.length > 0 ? foodItems[Math.floor(Math.random() * foodItems.length)] : null;
          setPendingBearInteraction({ id: enemy.id, stage: enemy.tag === 'Friendly' ? 'friendly' : 'neutral', offerId: offerItem?.id ?? null });
          return prev;
        }
        if (enemy.tag === 'Friendly' && !enemy.isAdventurer && !enemy.bear) {
          // Only genuine fairies reach here. Friendly bears/adventurers are handled above.
          setPendingFairyId(enemy.id);
          return prev;
        }
        const mood = playerMood(prev.player);
        const weakMelee = cls === '🧝' && player.ammo <= 0;
        const wizardMelee = cls === '🧙';
        const fencerSwing = isFencer(cls) ? fencerOutgoingMult(player.stats) : null;
        const holdFire = isBlinkActive;
        const rangerFlee = isTrailblazeActive;
        const hasDualBlades = cls === '🥷' && player.equipment.mainHand?.weaponKind === 'blade' && player.equipment.offHand?.weaponKind === 'blade';
        const isPistolWhip = cowboyDualGuns && player.ammo < 2;
        if (isPistolWhip) addLog(`🤠 I'll pistol whip tha' shit outta you!`);
        const isCowboyUnarmed = cls === '🤠' && !player.equipment.mainHand?.weaponKind && !player.equipment.offHand?.weaponKind;
        const cowboyIronFistBonus = (isPistolWhip || isCowboyUnarmed) ? getCowboyUnarmedBonus(player.stats.level) : 0;
        const meleeBasePlayer = cowboyIronFistBonus > 0
          ? { ...player, stats: { ...player.stats, attack: player.stats.attack + cowboyIronFistBonus } }
          : player;
        const effectiveMeleePlayer = applyEquipmentAndPassives(meleeBasePlayer);
        const combatPlayer = (holdFire || rangerFlee) ? { ...effectiveMeleePlayer, stats: { ...effectiveMeleePlayer.stats, defense: 0 } } : effectiveMeleePlayer;
        const _meleePassives = playerBagPassives(prev.player);
        const ninjaEvaCombatPlayer = cls === '🥷'
          ? { ...combatPlayer, stats: { ...combatPlayer.stats, evasion: computeNinjaEvasion(combatPlayer) } }
          : combatPlayer;
        const combatResult = resolveCombat(ninjaEvaCombatPlayer, enemy, addLog, { weakMelee, wizardMelee, pistolWhip: isPistolWhip, mood, cowboyMoodValue: cowboyCombatMoodValue(prev.player), dualStrike: false, quadStrike: hasDualBlades, advantage: _meleePassives.advantageDice, execBlow: _meleePassives.execBlow, shieldWall: _meleePassives.shieldWall, floor: prev.currentFloor, damageMult: fencerSwing?.mult ?? 1 });

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
        if (cls === '🥷' && !combatResult.fled) {
          const flow = applyFlowingStrike(newPlayer.stats);
          if (flow.log) addLog(flow.log);
          newPlayer = { ...newPlayer, stats: flow.stats };
        }
        if (fencerSwing && (combatResult.enemyDied || combatResult.enemyHp < enemy.hp)) {
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, flourishCount: fencerSwing.nextFlourish, riposteReady: false } };
          if (fencerSwing.nextFlourish === 0 && (player.stats.flourishCount ?? 0) > 0) addLog(`🤺 Blade Flourish!`);
        }
        if (combatResult.parried) {
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, riposteReady: true } };
          addLog(`🤺 Riposte ready.`);
        }
        if (combatResult.goldStolen && combatResult.goldStolen > 0) {
          newPlayer.stats.gold = Math.max(0, newPlayer.stats.gold - combatResult.goldStolen);
        }

        let skipFightId: string | undefined;
        const meleeBaseFloats: FloatingText[] = [];
        if (combatResult.goldStolen && combatResult.goldStolen > 0) {
          meleeBaseFloats.push({
            id: `crow-steal-melee-${enemy.id}-${prev.turn}`,
            pos: { ...player.pos },
            text: `-${combatResult.goldStolen}g`,
            color: '#facc15',
            life: 2,
          });
        }
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
            const wasUnseen = !!prev.stealthMode || isDrinkStealthActive(prev.player);
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
          {
            const paid = noteKill(newPlayer, prev.currentFloor);
            newPlayer = paid.player;
            paid.logs.forEach(addLog);
          }

          const drop = rollKillDrop({
            boss: !!enemy.isBoss,
            clover: _meleePassives.bonusLoot,
            floor: prev.currentFloor,
            playerClass: cls,
            cowboyDualGuns,
          });
          if (drop) {
            newState.items = [...prev.items, { ...drop, id: `drop-${Math.random()}`, consumed: false, pos: enemy.pos }];
          }
        }
        const playerLanded = (combatResult.enemyDied && !godBlessedProc) || combatResult.enemyHp < enemy.hp;
        if (!godBlessedProc && !combatResult.enemyDied) {
          const _mBurning = playerLanded && _meleePassives.burningOnHit ? { burningTurns: 3 } : {};
          if (playerLanded && _meleePassives.burningOnHit) addLog(`🔥 ${enemy.emoji} is ignited!`);
          newEnemies[enemyIndex] = { ...enemy, hp: combatResult.enemyHp, engaged: true, ..._mBurning };
          skipFightId = enemy.id;
        }
        if (isRoyalGuard(cls) && playerLanded) {
          const dealt = enemy.hp - Math.max(0, combatResult.enemyHp);
          const beyond = tileBeyond(player.pos, enemy.pos);
          const victim = newEnemies.find(e => e.hp > 0 && e.pos.x === beyond.x && e.pos.y === beyond.y && isHostileCombatTarget(e));
          if (victim && dealt > 0) {
            const pd = pierceDamage(dealt);
            addLog(`💂 Piercing slash hits ${victim.emoji} for ${pd}.`);
            if (victim.hp - pd <= 0) {
              markEnemyKilled(victim.emoji);
              updatedKillCounts[victim.emoji] = (updatedKillCounts[victim.emoji] ?? 0) + 1;
              newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, xp: newPlayer.stats.xp + (victim.isBoss ? 25 : 5) } };
              newEnemies = newEnemies.filter(e => e.id !== victim.id);
            } else {
              newEnemies = newEnemies.map(e => e.id === victim.id ? { ...e, hp: e.hp - pd, engaged: true } : e);
            }
          }
        }
        if (_meleePassives.lightningBolt && playerLanded) {
          const arcCandidates = newEnemies.filter(e2 =>
            e2.id !== enemy.id && !e2.isSpectator && chebyshev(e2.pos, enemy.pos) <= 2 && e2.hp > 0
          );
          if (arcCandidates.length > 0) {
            const arcCount = Math.min(arcCandidates.length, 1 + Math.floor(Math.random() * 3));
            const shuffled = [...arcCandidates].sort(() => Math.random() - 0.5).slice(0, arcCount);
            const bits: string[] = [];
            const arcAtk = combatPlayer.stats.attack;
            const arcStacks = _meleePassives.lightningBolt;
            shuffled.forEach((tgt, arcI) => {
              const idx = newEnemies.findIndex(e2 => e2.id === tgt.id);
              if (idx === -1) return;
              const arcDmg = lightningArcDamage(arcAtk, arcStacks, arcI);
              const newHp = tgt.hp - arcDmg;
              bits.push(`${tgt.emoji}-${arcDmg}`);
              if (newHp <= 0) {
                markEnemyKilled(tgt.emoji);
                updatedKillCounts[tgt.emoji] = (updatedKillCounts[tgt.emoji] ?? 0) + 1;
                newPlayer = applyMonkeyDropOnKill(tgt, newPlayer);
                newEnemies.splice(idx, 1);
                newPlayer.stats.xp += tgt.isBoss ? 25 : 5;
                const tithed = applyEntropicTithe({ ...prev, player: newPlayer, logs: newState.logs }, 'lightningBolt');
                newPlayer = tithed.player;
                newState.logs = tithed.logs;
              } else {
                newEnemies[idx] = { ...tgt, hp: newHp, engaged: true };
              }
            });
            if (bits.length > 0) addLog(`⚡ Arc! ${bits.join(' ')}`);
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
        const pool = livingMaxHp(newPlayer);
        if (vampCount > 0 && meleeDmgToEnemy > 0 && newPlayer.stats.hp < pool) {
          newPlayer.stats.hp = Math.min(pool, newPlayer.stats.hp + vampCount);
        }
        if (_meleePassives.healOnKill > 0 && combatResult.enemyDied && newPlayer.stats.hp < pool) {
          const mushHeal = Math.min(_meleePassives.healOnKill, pool - newPlayer.stats.hp);
          newPlayer.stats.hp += mushHeal;
          addLog(`🍄 Heal on kill! +${mushHeal} HP`);
        }
        const dodgeCount = _meleePassives.dodgeHeal || 0;
        if (dodgeCount > 0 && combatResult.dodged && newPlayer.stats.hp < pool) {
          newPlayer.stats.hp = Math.min(pool, newPlayer.stats.hp + dodgeCount);
          addLog(`🦋 Dodge heals! +${dodgeCount} HP`);
        }
        if (_meleePassives.thorns > 0 && meleeDmgToPlayer > 0) {
          const thornIdx = newEnemies.findIndex(e => e.id === enemy.id);
          if (thornIdx !== -1) {
            const thornNewHp = newEnemies[thornIdx].hp - _meleePassives.thorns;
            if (thornNewHp <= 0) {
              newEnemies.splice(thornIdx, 1);
              addLog(`💎 Thorns finish off ${enemy.emoji}!`);
              const tithed = applyEntropicTithe({ ...prev, player: newPlayer, logs: newState.logs }, 'thorns');
              newPlayer = tithed.player;
              newState.logs = tithed.logs;
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
        if (combatResult.enemyDied && !godBlessedProc && enemy.isBoss) newState = creditVoidBoss(newState, enemy);
        return applyEnemyTurns(newState, runEnemyTurns(newState, skipFightId));
      }

      let newPlayer: Player = { ...player, pos: newPos, stats: { ...player.stats } };

      const hpRatio = newPlayer.stats.hp / livingMaxHp(newPlayer);
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
          } else {
            const { inventory: _pInv, bank: _pBnk } = addToPlayerBag(newPlayer, pickedUp);
            const wentToBank = _pBnk.length > newPlayer.bank.length;
            newPlayer = { ...newPlayer, inventory: _pInv, bank: _pBnk };
            addLog(wentToBank
              ? `🎒 Bag full! ${pickedUp.emoji} ${pickedUp.name} sent to bank. (B to open)`
              : `Picked up ${pickedUp.emoji} ${pickedUp.name} (${pickedUp.description})`);
          }
          if (!pickedUp.healAmount) markEmojiSeen(pickedUp.emoji);
          newPlayer.stats.moodValue = Math.min(moodMax(cls), newPlayer.stats.moodValue + 5);
        }
      }

      const _mvPassives = playerBagPassives(newPlayer);
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
              } else {
                const { inventory: _mInv, bank: _mBnk } = addToPlayerBag(newPlayer, pickedUp);
                const magnetWentToBank = _mBnk.length > newPlayer.bank.length;
                newPlayer = { ...newPlayer, inventory: _mInv, bank: _mBnk };
                addLog(magnetWentToBank
                  ? `🧲 ${pickedUp.emoji} ${pickedUp.name} drawn to you — bag full, sent to bank.`
                  : `🧲 ${pickedUp.emoji} ${pickedUp.name} drawn to you!`);
              }
              if (!pickedUp.healAmount) markEmojiSeen(pickedUp.emoji);
              newPlayer.stats.moodValue = Math.min(moodMax(cls), newPlayer.stats.moodValue + 3);
            }
          }
          newState.items = newState.items.filter(it => !magnetItems.some(m => m.id === it.id));
        }
      }

      if (tile.type === 'slot-shrine') {
        // Repeatable gold sink. Modal opens from the page; the tile is not consumed.
      }

      if (tile.type === 'shrine') {
        const shrineAmt = 2 + Math.floor((prev.currentFloor - 1) / 2);
        const oldMaxHp = newPlayer.stats.maxHp;
        const currentOverheal = Math.max(0, newPlayer.stats.hp - oldMaxHp);
        if (isArcaneCaster(cls)) {
          // Arcane shrine gives +max MP and a plain +HP heal (no +max HP, no overheal).
          // Heal up to maxHp, but never strip an existing overheal buffer (e.g. from the 🍺 bar).
          const pool = livingMaxHp(newPlayer);
          const healedHp = Math.max(newPlayer.stats.hp, Math.min(pool, newPlayer.stats.hp + shrineAmt));
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
          { id: `shrine-${newPos.x}-${newPos.y}-${prev.turn}`, pos: { ...newPos }, text: isArcaneCaster(cls) ? `+${shrineAmt} HP / +1 MAX MP` : `+${shrineAmt} HP / +${shrineAmt} MAX`, color: '#34d399', life: 3 },
          ...prev.floatingTexts,
        ];
        addLog(isArcaneCaster(cls) ? `🛕 Arcane shrine — +${shrineAmt} HP & +1 max MP! Full mana restored!` : `🛕 The shrine pulses with light — +${shrineAmt} HP & +${shrineAmt} max HP!`);
      }

      if (tile.type === 'shop-item') {
        if (tile.emoji === '🍺') {
          const cost = 15;
          const pool = livingMaxHp(newPlayer);
          if (newPlayer.stats.hp > pool) {
            // Already overhealed — don't charge XP or re-apply.
            addLog(`🍺 Innkeeper: You're already overhealed — come back when it fades!`);
          } else if (newPlayer.stats.xp >= cost) {
            const overhealHp = Math.floor(pool * 1.5);
            const isWizard = isArcaneCaster(newPlayer.characterClass);
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
            addLog(`🍺 Innkeeper charges 15 XP — full heal & overheal! HP: ${overhealHp} (decays to ${pool}).${mpMsg}`);
          } else {
            addLog(`🍺 Innkeeper wants 15 XP — you only have ${newPlayer.stats.xp}. Earn more first!`);
          }
        } else if (tile.emoji === '📦') {
          const cls = newPlayer.characterClass;
          if (cls === '🤠' || isHitman(cls)) addLog('📦 Ammo cache! Stock up on bullets before the boss.');
          else if (cls === '🧝' || isRoyalGuard(cls)) addLog('📦 Supply crate! Grab some arrows before the boss.');
          else addLog('📦 A supply crate — nothing here for you.');
        } else {
          addLog('🏪 Welcome to the shop! Buy & sell emojis for gold.');
        }
      }

      if (tile.type === 'restaurant') {
        addLog('🏪 Welcome to the Restaurant! Food & rest available — food smell draws enemies...');
      }

      if (tile.type === 'stairs') {
        if (shouldPromptFinaleStairs(prev)) {
          if (!finalePromptRef.current) setFinalePrompt('win');
          return prev;
        }
        return descendFloor({ ...newState, player: newPlayer }, addLog);
      }

      if (isGenie(cls)) {
        const volley = resolveGenieFireball({
          player: newPlayer,
          enemies: newState.enemies,
          map: newState.map,
          mode: wizardTacticsRef.current.mode,
          manualTargetId: wizardTacticsRef.current.manualTargetId,
          turn: newState.turn,
          floor: prev.currentFloor,
          addLog,
        });
        if (volley.cast) {
          newPlayer = volley.player;
          newState.enemies = volley.enemies;
          newState.items = [...newState.items, ...volley.items];
          newState.floatingTexts = [...volley.floats, ...(newState.floatingTexts ?? [])];
          if (volley.beam) newState.pendingBeam = volley.beam;
          const counts = { ...(newState.killCounts ?? {}) };
          for (const em of volley.killCountAdds) counts[em] = (counts[em] ?? 0) + 1;
          newState.killCounts = counts;
          newState.difficultyTier = (newState.difficultyTier ?? 0) + volley.difficultyBump;
          if (volley.playerDied) {
            return { ...newState, player: newPlayer, turn: newState.turn + 1, gameOver: true, killer: volley.killer };
          }
        }
      }

      if (cls === '🧙' || (cls === '👤' && voidAttackModeRef.current === 'wizard')) {
        const boltCandidates = newState.enemies.filter(e => {
          const dist = chebyshev(newPlayer.pos, e.pos);
          return dist > 1 && dist <= VISION_RADIUS && hasLOSBetween(newState.map, newPlayer.pos, e.pos)
            && isHostileCombatTarget(e);
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

        const voidWizardShot = cls === '👤';
        if (boltTarget && (voidWizardShot || (newPlayer.stats.mana ?? 0) > 0)) {
          markEnemySeen(boltTarget.emoji);
          if (!voidWizardShot) {
            newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, mana: Math.max(0, (newPlayer.stats.mana ?? 0) - 1) } };
          }
          const boltMood = playerMood(newPlayer);
          const _boltPassives = playerBagPassives(newPlayer);
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
              newState = creditVoidBoss(newState, boltTarget);
            }
            if (boltNewLevel > boltOldLevel) {
              newPlayer = applyLevelUp(newPlayer, boltOldLevel, boltNewLevel, addLog);
            }
            const bDrop = rollKillDrop({
              boss: !!boltTarget.isBoss,
              clover: _boltPassives.bonusLoot,
              floor: prev.currentFloor,
              playerClass: cls,
            });
            if (bDrop) {
              newState.items = [...newState.items, { ...bDrop, id: `bolt-drop-${Math.random()}`, consumed: false, pos: boltTarget.pos }];
            }
          } else {
            const boltLanded = boltResult.enemyHp < boltTarget.hp;
            const _bBurning = boltLanded && _boltPassives.burningOnHit ? { burningTurns: 3 } : {};
            if (boltLanded && _boltPassives.burningOnHit) addLog(`🔥 ${boltTarget.emoji} is ignited!`);
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
      newPlayer = tickPrestigeTimers(newPlayer);

      // Out-of-combat decay for Blink Strike instakill chain (resets 2/3 or 3/3 after 10 turns with no engaged enemies)
      newPlayer = tickBlinkChainOutOfCombat(newPlayer, prev.enemies.some(e => e.engaged), addLog);

      // Overheal decay: every 5 turns, shed 1 HP until back to natural maxHp
      {
        const ohDecay = applyOverhealDecay(newPlayer, newState.turn, newPlayer.pos, 'oh-decay');
        newPlayer = ohDecay.player;
        if (ohDecay.float) newState.floatingTexts = [ohDecay.float, ...newState.floatingTexts];
      }

      newState.player = newPlayer;
      newState = stampDualGunsFanfare(newState, player.equipment, addLog);
      newState.turn++;

      // Assassin's Edge: free movement turns — enemies don't act
      if (cls === '🥷' && (prev.ninjaFreeMoves ?? 0) > 0) {
        const remaining = (prev.ninjaFreeMoves ?? 0) - 1;
        newState.ninjaFreeMoves = remaining;
        if (remaining > 0) addLog(`🥷 Ghost step! (${remaining} free move${remaining !== 1 ? 's' : ''} left)`);
        return withVisibility(applyDrinkBuffTick(newState));
      }

      return withVisibility(applyEnemyTurns(newState, runEnemyTurns(newState)));
    });
  }, [addLog, setGameState, rangerModeRef, wizardTacticsRef, autoStealthRef, lastCowboyFlavorTurnRef, blinkTurnRef, trailblazeTurnRef, setWizardTactics, setRangerMode, setBlinkTurn, setTrailblazeTurn, gameStateRef, voidAttackModeRef]);

  const handleWait = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.floorAnnouncement) return prev;
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
      const waitPassives = playerBagPassives(prev.player);
      const regen = waitPassives.combatRegen || 0;
      const totalHeal = WAIT_HEAL + regen + campfireBonus;
      const pool = livingMaxHp(prev.player);
      const atFull = stats.hp >= pool;
      if (!atFull) {
        stats.hp = Math.min(pool, stats.hp + totalHeal);
        stats.moodValue = Math.min(moodMax(cls), stats.moodValue + 2);
      }
      // Tick down active food buffs each turn
      Object.assign(stats, tickActiveBuffs(stats));

      if (isArcaneCaster(cls)) {
        const seenByEnemy = prev.enemies.some(e =>
          isHostileCombatTarget(e) &&
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

      if (isGenie(cls)) {
        const volley = resolveGenieFireball({
          player: waitPlayer,
          enemies: waitEnemies,
          map: prev.map,
          mode: wizardTacticsRef.current.mode,
          manualTargetId: wizardTacticsRef.current.manualTargetId,
          turn: prev.turn,
          floor: prev.currentFloor,
          addLog,
        });
        if (volley.cast) {
          waitPlayer = volley.player;
          waitEnemies = volley.enemies;
          waitItems = [...waitItems, ...volley.items];
          waitFloats.push(...volley.floats);
          if (volley.beam) waitBeam = volley.beam;
          for (const em of volley.killCountAdds) waitKillCounts = { ...waitKillCounts, [em]: (waitKillCounts[em] ?? 0) + 1 };
          if (volley.playerDied) {
            return { ...prev, player: waitPlayer, enemies: waitEnemies, items: waitItems, killCounts: waitKillCounts, floatingTexts: [...waitFloats, ...(prev.floatingTexts ?? [])], pendingBeam: waitBeam, turn: prev.turn + 1, gameOver: true, killer: volley.killer, difficultyTier: (prev.difficultyTier ?? 0) + volley.difficultyBump };
          }
        }
      }

      if (cls === '🧙' || (cls === '👤' && voidAttackModeRef.current === 'wizard')) {
        const boltCandidates = waitEnemies.filter(e => {
          const dist = chebyshev(waitPlayer.pos, e.pos);
          return dist > 1 && dist <= VISION_RADIUS && hasLOSBetween(prev.map, waitPlayer.pos, e.pos)
            && isHostileCombatTarget(e);
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

        const voidWizardShot = cls === '👤';
        if (boltTarget && (voidWizardShot || (waitPlayer.stats.mana ?? 0) > 0)) {
          markEnemySeen(boltTarget.emoji);
          if (!voidWizardShot) {
            waitPlayer = { ...waitPlayer, stats: { ...waitPlayer.stats, mana: Math.max(0, (waitPlayer.stats.mana ?? 0) - 1) } };
          }
          const boltMood = playerMood(waitPlayer);
          const _boltPassives = playerBagPassives(waitPlayer);
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
            const bDrop = rollKillDrop({
              boss: !!boltTarget.isBoss,
              clover: _boltPassives.bonusLoot,
              floor: prev.currentFloor,
              playerClass: cls,
            });
            if (bDrop) {
              waitItems = [...waitItems, { ...bDrop, id: `bolt-drop-${Math.random()}`, consumed: false, pos: boltTarget.pos }];
            }
          } else {
            const boltLanded = boltResult.enemyHp < boltTarget.hp;
            const _bBurning = boltLanded && _boltPassives.burningOnHit ? { burningTurns: 3 } : {};
            if (boltLanded && _boltPassives.burningOnHit) addLog(`🔥 ${boltTarget.emoji} is ignited!`);
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
      waitPlayer = tickPrestigeTimers(waitPlayer);

      // Out-of-combat decay for Blink Strike instakill chain on wait
      waitPlayer = tickBlinkChainOutOfCombat(waitPlayer, prev.enemies.some(e => e.engaged), addLog);

      // Overheal decay on wait
      {
        const ohDecayW = applyOverhealDecay(waitPlayer, prev.turn, waitPlayer.pos, 'oh-decay-wait');
        waitPlayer = ohDecayW.player;
        if (ohDecayW.float) waitFloats.push(ohDecayW.float);
      }

      const waitedBoss = prev.enemies.find(e => e.isBoss && !e.isEcho && !waitEnemies.find(w => w.id === e.id));
      let midState: GameState = {
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
      if (waitedBoss) midState = creditVoidBoss(midState, waitedBoss);
      return withVisibility(applyEnemyTurns(midState, runEnemyTurns(midState)));
    });
  }, [addLog, setGameState, wizardTacticsRef, voidAttackModeRef]);

  const handleCloseDoor = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.floorAnnouncement) return prev;
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

  const handleBedRest = useCallback(() => {
    setBlinkTurn(-999);
    setTrailblazeTurn(-999);
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.floorAnnouncement) return prev;
      const check = evaluateBedSleep(prev);
      if (!check.ok) {
        const text = check.reason === 'worn'
          ? "🛏️ You've already slept enough!"
          : `🛏️ You can't sleep — ${check.threat?.emoji} ${check.threat?.name} is in sight!`;
        return {
          ...prev,
          logs: [{ id: `sleep-block-${prev.turn}`, text, turn: prev.turn }, ...prev.logs].slice(0, 24),
        };
      }
      const rested: typeof prev = {
        ...prev,
        map: consumeBedUse(prev.map, prev.player.pos),
        player: applyBedRest(prev.player),
        logs: [
          { id: `sleep-start-${prev.turn}`, text: `🛏️ You lie down. ${SLEEP_TURNS} turns will pass...`, turn: prev.turn },
          ...prev.logs,
        ].slice(0, 24),
      };
      const { state, wokeBy, turnsSlept } = simulateSleep(rested, SLEEP_TURNS);
      if (wokeBy) return withVisibility(state);
      const overhealHp = Math.floor(livingMaxHp(state.player) * BED_OVERHEAL_MULT);
      const mpMsg = isArcaneCaster(state.player.characterClass) ? ' MP full.' : '';
      const left = check.usesLeft - 1;
      const usesMsg = left <= 0 ? ' The bed is worn out.' : ` (${left} rest${left === 1 ? '' : 's'} left)`;
      return withVisibility({
        ...state,
        logs: [
          { id: `sleep-end-${state.turn}`, text: `🛏️ You wake after ${turnsSlept} turns — overheal ${overhealHp} HP, cooldowns reset.${mpMsg}${usesMsg}`, turn: state.turn },
          ...state.logs,
        ].slice(0, 24),
        floatingTexts: [
          { id: `bed-oh-${state.turn}`, pos: { ...state.player.pos }, text: `✨ OVERHEAL! (${overhealHp} HP)`, color: '#fbbf24', life: 4 },
          ...state.floatingTexts,
        ],
      });
    });
  }, [setGameState, setBlinkTurn, setTrailblazeTurn]);

  const {
    applyWizardMode, handleCycleRangedTarget, applyNinjaMode,
    toggleAutoStealth, applyRangerMode, handleCowboyTactics,
    handleBackdash, handleLunge, handleExecuteContract, handleGuardianStance,
  } = useTacticsActions(refs, setters, addLog);

  const {
    handleUseHeal, handleUseDrink, handleCook, handleUseRope, handleUseSlot, handleShopBuyAndUse,
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
    handleBedRest,
    handleUseHeal,
    handleUseDrink,
    handleCook,
    applyWizardMode,
    handleCycleRangedTarget,
    applyNinjaMode,
    toggleAutoStealth,
    applyRangerMode,
    handleCowboyTactics,
    handleBackdash,
    handleLunge,
    handleExecuteContract,
    handleGuardianStance,
    handlePlantBomb,
    handleFireProjectile,
    handleUseRope,
    handleUseSlot,
    handleShopBuyAndUse,
    handleBankMove,
    handleConsumeBankItem,
    handleEquip,
    handleUnequip,
    handleBlinkStrike,
    handleBlinkStrikeOnTarget,
  };
}
