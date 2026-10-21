import { useCallback } from 'react';
import { chebyshev, withVisibility, runEnemyTurns, applyEnemyTurns, applyEquipmentAndPassives, hasLOSBetween, playerSoftCap } from '../../game/gameHelpers';
import { getMood } from '../../game/moods';
import { isHostileCombatTarget, resolveCombat } from '../../game/combat';
import type { GameRefs, GameSetters, AddLog } from './types';
import type { Player } from '../../game/types';
import { isArcaneCaster, isFencer, isHitman, isRoyalGuard, activateGuardianStance, planBackdash, planLunge, nearestExecuteTarget, executeStrike, notePrestigeKill, fencerOutgoingMult } from '../../game/prestige';
import { FENCER_BACKDASH_CD, FENCER_LUNGE_CD, FENCER_LUNGE_MULT, HITMAN_EXECUTE_BULLETS, HITMAN_EXECUTE_CD, HITMAN_EXECUTE_GOLD } from '../../game/prestigeConstants';
import { goldWithLuck } from '../../game/softCap';

const BLINK_ACTIVE = 3;
const BLINK_CD = 5;

export function useTacticsActions(refs: GameRefs, setters: GameSetters, addLog: AddLog) {
  const {
    gameStateRef, wizardTacticsRef, blinkTurnRef, inspectedEnemyIdRef,
    autoStealthRef, rangerModeRef, trailblazeTurnRef, yeehawTurnRef, voidAttackModeRef,
  } = refs;
  const {
    setGameState, setAutoExplore, setAutoRest, setWizardTactics, setBlinkTurn,
    setInspectedEnemyId, setAutoStealth, setRangerMode, setTrailblazeTurn, setYeehawTurn,
  } = setters;

  const applyWizardMode = useCallback((mode: 'nearest' | 'furthest' | 'manual' | 'holdfire') => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || !isArcaneCaster(state.player.characterClass)) return;
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
      .filter(e => !isArcaneCaster(player.characterClass) || isHostileCombatTarget(e))
      .sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos));
    if (targets.length === 0) { addLog('No visible enemies to target.'); return; }
    const idx = targets.findIndex(e => e.id === inspectedEnemyIdRef.current);
    const next = targets[(idx + dir + targets.length) % targets.length];
    setInspectedEnemyId(next.id);
    if (isArcaneCaster(player.characterClass) || (player.characterClass === '👤' && voidAttackModeRef.current === 'wizard')) {
      const newT = { ...wizardTacticsRef.current, mode: 'manual' as const, manualTargetId: next.id };
      wizardTacticsRef.current = newT;
      setWizardTactics(newT);
    }
    addLog(`🎯 Targeting: ${next.emoji} ${next.name}`);
  }, [addLog, gameStateRef, inspectedEnemyIdRef, wizardTacticsRef, voidAttackModeRef, setInspectedEnemyId, setWizardTactics]);

  const applyNinjaMode = useCallback((stealth: boolean) => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || (state.player.characterClass !== '🥷' && !isHitman(state.player.characterClass))) return;
    setGameState(prev => prev ? { ...prev, stealthMode: stealth } : prev);
    addLog(stealth
      ? (isHitman(state.player.characterClass) ? '🕴️ Stealth engaged — you hang above the floor.' : '🥷 Stealth engaged — hug walls or dark tiles')
      : (isHitman(state.player.characterClass) ? '🕴️ Stealth off.' : '🥷 Stealth off — moving freely'));
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
    if (!state || state.gameOver || (state.player.characterClass !== '🧝' && !isRoyalGuard(state.player.characterClass))) return;

    if (mode === 'flee') {
      if (state.player.characterClass !== '🧝') return;
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

  const handleBackdash = useCallback(() => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || !isFencer(state.player.characterClass)) return;
    if ((state.player.stats.backdashCooldown ?? 0) > 0) {
      addLog(`🤺 Backdash cooling down (${state.player.stats.backdashCooldown}t).`);
      return;
    }
    const dest = planBackdash(state.player, state.enemies, state.map);
    if (!dest) { addLog('🤺 No room to backdash.'); return; }
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const player = { ...prev.player, pos: dest, stats: { ...prev.player.stats, backdashCooldown: FENCER_BACKDASH_CD } };
      const mid = { ...prev, player, turn: prev.turn + 1 };
      return withVisibility(applyEnemyTurns(mid, runEnemyTurns(mid)));
    });
    addLog('🤺 Backdash!');
  }, [addLog, gameStateRef, setGameState]);

  const handleLunge = useCallback(() => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || !isFencer(state.player.characterClass)) return;
    if ((state.player.stats.lungeCooldown ?? 0) > 0) {
      addLog(`🤺 Lunge cooling down (${state.player.stats.lungeCooldown}t).`);
      return;
    }
    const plan = planLunge(state.player, state.enemies, state.map);
    if (!plan) { addLog('🤺 Nobody in lunge range.'); return; }
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const swing = fencerOutgoingMult(prev.player.stats);
      const banquetFloor = prev.player.banquet && prev.player.banquet.turnsLeft > 0 ? prev.player.banquet.floor : 0;
      const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, false, 0, banquetFloor);
      const attacker = applyEquipmentAndPassives({ ...prev.player, pos: plan.pos });
      const result = resolveCombat(attacker, plan.target, addLog, { mood, damageMult: FENCER_LUNGE_MULT * swing.mult, floor: prev.currentFloor });
      let player: Player = { ...prev.player, pos: plan.pos, stats: { ...prev.player.stats, hp: result.playerHp, lungeCooldown: FENCER_LUNGE_CD, flourishCount: swing.nextFlourish, riposteReady: result.parried } };
      let enemies = prev.enemies.map(e => ({ ...e }));
      const idx = enemies.findIndex(e => e.id === plan.target.id);
      if (result.enemyDied && idx >= 0) {
        const paid = notePrestigeKill(player, prev.currentFloor, playerSoftCap(player).raw.luck);
        player = paid.player;
        paid.logs.forEach(addLog);
        player = { ...player, stats: { ...player.stats, xp: player.stats.xp + (plan.target.isBoss ? 25 : 5) } };
        enemies.splice(idx, 1);
      } else if (idx >= 0) {
        enemies[idx] = { ...enemies[idx], hp: result.enemyHp, engaged: true };
      }
      addLog('🤺 Lunge!');
      const mid = { ...prev, player, enemies, turn: prev.turn + 1 };
      return withVisibility(applyEnemyTurns(mid, runEnemyTurns(mid)));
    });
  }, [addLog, gameStateRef, setGameState]);

  const handleExecuteContract = useCallback(() => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || !isHitman(state.player.characterClass)) return;
    if ((state.player.stats.executeCooldown ?? 0) > 0) {
      addLog(`🕴️ Execute Contract cooling down (${state.player.stats.executeCooldown}t).`);
      return;
    }
    const target = nearestExecuteTarget(state.player, state.enemies, (from, to) => hasLOSBetween(state.map, from, to));
    if (!target) { addLog('🕴️ No contract in line of sight.'); return; }
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const geared = applyEquipmentAndPassives(prev.player);
      const strike = executeStrike(geared.stats.attack, target.hp, target.maxHp, target.defense ?? 0);
      let hp = target.godBlessed && strike.damage >= target.hp ? 1 : target.hp - strike.damage;
      let player: Player = { ...prev.player, stats: { ...prev.player.stats, executeCooldown: HITMAN_EXECUTE_CD } };
      let enemies = prev.enemies.map(e => ({ ...e }));
      const idx = enemies.findIndex(e => e.id === target.id);
      if (hp <= 0 && idx >= 0) {
        if (strike.executed) {
          const gained = goldWithLuck(HITMAN_EXECUTE_GOLD, playerSoftCap(player).raw.luck);
          player = {
            ...player,
            ammo: (player.ammo ?? 0) + HITMAN_EXECUTE_BULLETS,
            stats: { ...player.stats, gold: player.stats.gold + gained, xp: player.stats.xp + (target.isBoss ? 25 : 5) },
          };
          addLog(`🕴️ Contract executed — +${gained} gold, +${HITMAN_EXECUTE_BULLETS} bullets.`);
        } else {
          player = { ...player, stats: { ...player.stats, xp: player.stats.xp + (target.isBoss ? 25 : 5) } };
          addLog(`🕴️ Execute Contract — ${strike.damage} damage.`);
        }
        const paid = notePrestigeKill(player, prev.currentFloor, playerSoftCap(player).raw.luck);
        player = paid.player;
        paid.logs.forEach(addLog);
        enemies.splice(idx, 1);
      } else if (idx >= 0) {
        enemies[idx] = { ...enemies[idx], hp, engaged: true };
        addLog(strike.executed ? `🕴️ The mark survives on a thread.` : `🕴️ Execute Contract — ${strike.damage} damage.`);
      }
      const mid = { ...prev, player, enemies, turn: prev.turn + 1 };
      return withVisibility(applyEnemyTurns(mid, runEnemyTurns(mid)));
    });
  }, [addLog, gameStateRef, setGameState]);

  const handleGuardianStance = useCallback(() => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || !isRoyalGuard(state.player.characterClass)) return;
    const stance = activateGuardianStance(state.player);
    addLog(stance.log);
    if (!stance.ok) return;
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const mid = { ...prev, player: stance.player, turn: prev.turn + 1 };
      return withVisibility(applyEnemyTurns(mid, runEnemyTurns(mid)));
    });
  }, [addLog, gameStateRef, setGameState]);

  return {
    applyWizardMode, handleCycleRangedTarget, applyNinjaMode, toggleAutoStealth, applyRangerMode, handleCowboyTactics,
    handleBackdash, handleLunge, handleExecuteContract, handleGuardianStance,
  };
}
