import { useCallback } from 'react';
import { chebyshev, withVisibility, runEnemyTurns, applyEnemyTurns } from '../../game/gameHelpers';
import type { GameRefs, GameSetters, AddLog } from './types';

const BLINK_ACTIVE = 3;
const BLINK_CD = 5;

export function useTacticsActions(refs: GameRefs, setters: GameSetters, addLog: AddLog) {
  const {
    gameStateRef, wizardTacticsRef, blinkTurnRef, inspectedEnemyIdRef,
    autoStealthRef, rangerModeRef, trailblazeTurnRef, yeehawTurnRef,
  } = refs;
  const {
    setGameState, setAutoExplore, setAutoRest, setWizardTactics, setBlinkTurn,
    setInspectedEnemyId, setAutoStealth, setRangerMode, setTrailblazeTurn, setYeehawTurn,
  } = setters;

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

  return { applyWizardMode, handleCycleRangedTarget, applyNinjaMode, toggleAutoStealth, applyRangerMode, handleCowboyTactics };
}
