import { useState } from 'react';
import type { GameState } from '../game/types';
import { executeInsurance, insurableHotbar, insuranceCost, INSURE_MAX_SLOTS } from '../game/goldSinks';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface InsuranceModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function InsuranceModal({ gameState, setGameState, addLog, onClose }: InsuranceModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const [picked, setPicked] = useState<string[]>([]);
  const hotbar = insurableHotbar(gameState.player);
  const count = picked.length;
  const cost = count > 0 ? insuranceCost(gameState.currentFloor, count) : 0;
  const held = gameState.player.insurance?.items ?? [];
  const ready = count >= 1 && count <= INSURE_MAX_SLOTS && gameState.player.stats.gold >= cost;

  const toggle = (id: string) => {
    setPicked(prev => {
      if (prev.includes(id)) return prev.filter(entry => entry !== id);
      if (prev.length >= INSURE_MAX_SLOTS) return prev;
      return [...prev, id];
    });
  };

  const insure = () => {
    if (!ready) return;
    let message = '';
    let ok = false;
    setGameState(prev => {
      if (!prev) return prev;
      const result = executeInsurance(prev.player, prev.currentFloor, picked);
      message = result.ok ? (result.log ?? 'Insured.') : (result.reason ?? 'Insurance refused.');
      if (!result.ok || !result.player) return prev;
      ok = true;
      return {
        ...prev,
        player: result.player,
        logs: [{ id: `insure-${prev.turn}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    if (message) addLog(message);
    if (ok) onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-[80] flex bg-black/60 backdrop-blur-sm p-3 ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-emerald-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Vault insurance"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-200">🏦 Vault Insurance</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Insure 1–{INSURE_MAX_SLOTS} hotbar emojis. If you die, those copies start the next run, once. A new policy replaces the old one.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground px-2 rounded">ESC</button>
        </div>

        {held.length > 0 && (
          <p className="text-xs text-emerald-100 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 mb-3">
            Current policy: {held.map(item => item.emoji).join(' ')}
          </p>
        )}

        {hotbar.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">No hotbar emojis to insure.</p>
        )}
        <div className="flex flex-col gap-1.5 mb-3">
          {hotbar.map(item => {
            const on = picked.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={on}
                className={`min-h-11 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left border ${on ? 'border-emerald-400 bg-emerald-500/15' : 'border-border/40 bg-secondary/20'}`}
              >
                <span className="text-2xl leading-none shrink-0">{item.emoji}</span>
                <span className="flex-1 min-w-0 text-xs font-bold">{item.name}</span>
                <span className="text-xs text-emerald-200">{on ? 'In' : 'Out'}</span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mb-3">
          {count === 0 ? `Choose 1 to ${INSURE_MAX_SLOTS}.` : `${count} insured · ${cost}g · you have ${gameState.player.stats.gold}g`}
        </p>
        <button
          type="button"
          disabled={!ready}
          onClick={insure}
          className="w-full min-h-11 rounded-lg border border-emerald-400/50 bg-emerald-500/20 text-emerald-50 text-sm font-bold disabled:opacity-40"
        >
          {count === 0 ? 'Pay the vault tax' : `Insure for ${cost}g`}
        </button>
        <CloseHintButton onClose={dismiss}>Leave the vault</CloseHintButton>
      </div>
    </div>
  );
}
