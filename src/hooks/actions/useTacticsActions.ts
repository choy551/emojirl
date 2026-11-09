import { useCallback } from 'react';
import { chebyshev, withVisibility, runEnemyTurns, applyEnemyTurns, applyEquipmentAndPassives, hasLOSBetween } from '../../game/gameHelpers';
import { getMood } from '../../game/moods';
import { isHostileCombatTarget, resolveCombat } from '../../game/combat';
import type { GameRefs, GameSetters, AddLog } from './types';
import type { Player } from '../../game/types';
import { isArcaneCaster, isFencer, isHitman, isRoyalGuard, activateGuardianStance, planBackdash, planLunge, nearestExecuteTarget, footworkCombo, lungeHitMults } from '../../game/prestige';
import { guardHasRangedWeapon } from '../../game/royalGuard';
import { applyLungeStrike } from '../../game/lunge';
import { FENCER_BACKDASH_CD, FENCER_LUNGE_CD, FENCER_LUNGE_MULT } from '../../game/prestigeConstants';
import { resolveExecuteContract } from '../../game/hitman';

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
    } else if (mode === 'ranged' && isRoyalGuard(state.player.characterClass) && !guardHasRangedWeapon(state.player)) {
      addLog('🏹 Equip a bow or gun before you can shoot. Staying in melee.');
      rangerModeRef.current = 'melee';
      setRangerMode('melee');
      return;
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
      const combo = footworkCombo(prev.player.stats, prev.turn, 'lunge');
      const parries = combo ? 2 : 1;
      const riposteCharges = (prev.player.stats.riposteCharges ?? 0) + (prev.player.stats.riposteReady ? 1 : 0) + parries;
      const text = combo
        ? '🤺 Lunge into Backdash — auto-parry 2, Riposte ×2.'
        : '🤺 Backdash! Auto-parry ready. Riposte ready.';
      const player = {
        ...prev.player,
        pos: dest,
        stats: {
          ...prev.player.stats,
          backdashCooldown: FENCER_BACKDASH_CD,
          fencerParries: parries,
          riposteCharges,
          riposteReady: false,
          fencerLastAct: 'backdash' as const,
          fencerLastActTurn: prev.turn,
        },
      };
      const mid = {
        ...prev,
        player,
        logs: [{ id: `backdash-${prev.turn}`, text, turn: prev.turn }, ...prev.logs].slice(0, 24),
        turn: prev.turn + 1,
      };
      return withVisibility(applyEnemyTurns(mid, runEnemyTurns(mid)));
    });
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
      const combo = footworkCombo(prev.player.stats, prev.turn, 'backdash');
      const swings = lungeHitMults(prev.player.stats, combo ? 2 : 1, combo);
      const banquetFloor = prev.player.banquet && prev.player.banquet.turnsLeft > 0 ? prev.player.banquet.floor : 0;
      const houseFloor = prev.player.houseRound && prev.player.houseRound.turnsLeft > 0 ? prev.player.houseRound.floor : 0;
      const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, false, 0, Math.max(banquetFloor, houseFloor));
      const attacker = applyEquipmentAndPassives({ ...prev.player, pos: plan.pos });
      const combatLogs: string[] = [];
      const note = (text: string) => { combatLogs.push(text); };
      let result = resolveCombat(attacker, plan.target, note, { mood, damageMult: FENCER_LUNGE_MULT * swings.mults[0], floor: prev.currentFloor });
      if (combo && !result.enemyDied && result.enemyHp > 0) {
        const follow = resolveCombat(attacker, { ...plan.target, hp: result.enemyHp }, note, { mood, damageMult: FENCER_LUNGE_MULT * swings.mults[1], floor: prev.currentFloor, noCounter: true });
        result = { ...result, enemyHp: follow.enemyHp, enemyDied: follow.enemyDied };
      }
      const cooled: Player = {
        ...prev.player,
        pos: plan.pos,
        stats: {
          ...prev.player.stats,
          hp: result.playerHp,
          lungeCooldown: FENCER_LUNGE_CD,
          flourishCount: swings.flourish,
          riposteCharges: swings.riposteCharges + (result.parried ? 1 : 0),
          riposteReady: false,
          fencerLastAct: 'lunge',
          fencerLastActTurn: prev.turn,
        },
      };
      const settled = applyLungeStrike({
        player: cooled,
        enemies: prev.enemies,
        items: prev.items,
        killCounts: prev.killCounts,
        targetId: plan.target.id,
        enemyHp: result.enemyHp,
        enemyDied: result.enemyDied,
        floor: prev.currentFloor,
        difficultyTier: prev.difficultyTier,
      });
      if (combo) settled.logs.push('🤺 Backdash into Lunge — double attack.');
      settled.logs.push(...combatLogs);
      const logEntries = [...settled.logs].reverse().map(text => ({ id: Math.random().toString(), text, turn: prev.turn }));
      const mid = {
        ...prev,
        player: settled.player,
        enemies: settled.enemies,
        items: settled.items,
        killCounts: settled.killCounts,
        difficultyTier: settled.difficultyTier,
        logs: [...logEntries, ...prev.logs].slice(0, 24),
        turn: prev.turn + 1,
      };
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
      const live = prev.enemies.find(e => e.id === target.id);
      if (!live) return prev;
      const geared = applyEquipmentAndPassives(prev.player);
      const resolved = resolveExecuteContract({
        player: prev.player,
        enemies: prev.enemies,
        items: prev.items,
        killCounts: prev.killCounts,
        target: live,
        floor: prev.currentFloor,
        attack: geared.stats.attack,
        difficultyTier: prev.difficultyTier,
      });
      const logEntries = [...resolved.logs].reverse().map(text => ({ id: Math.random().toString(), text, turn: prev.turn }));
      const withLogs = {
        ...prev,
        player: resolved.player,
        enemies: resolved.enemies,
        items: resolved.items,
        killCounts: resolved.killCounts,
        difficultyTier: resolved.difficultyTier,
        logs: [...logEntries, ...prev.logs].slice(0, 24),
      };
      if (resolved.playerDied) {
        return { ...withLogs, gameOver: true, killer: resolved.killer };
      }
      const mid = { ...withLogs, turn: prev.turn + 1 };
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
