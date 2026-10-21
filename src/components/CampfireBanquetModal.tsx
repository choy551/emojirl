import { useState } from 'react';
import type { GameState } from '../game/types';
import { isCookedDish } from '../game/economy';
import {
  BANQUET_MIN_DISHES,
  banquetPlan,
  executeBanquet,
} from '../game/foodSinks';
import { livingMaxHp } from '../game/inventory';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface CampfireBanquetModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function CampfireBanquetModal({ gameState, setGameState, addLog, onClose }: CampfireBanquetModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const [picked, setPicked] = useState<string[] | null>(null);

  const dishes = [
    ...gameState.player.inventory.filter(isCookedDish).map(item => ({ item, where: 'Bag' })),
    ...gameState.player.bank.filter(isCookedDish).map(item => ({ item, where: 'Bank' })),
  ];
  const selected = picked ?? dishes.map(row => row.item.id);
  const ready = selected.length >= BANQUET_MIN_DISHES;
  const shown = ready ? banquetPlan(selected.length) : null;
  const baseline = banquetPlan(BANQUET_MIN_DISHES);
  const pool = livingMaxHp(gameState.player);

  const toggle = (id: string) => {
    setPicked(prev => {
      const current = prev ?? dishes.map(row => row.item.id);
      return current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    });
  };

  const hold = () => {
    let message = '';
    let ok = false;
    setGameState(prev => {
      if (!prev) return prev;
      const result = executeBanquet(prev.player, selected);
      message = result.ok ? (result.log ?? 'Banquet held.') : (result.reason ?? 'Banquet failed.');
      if (!result.ok || !result.player) return prev;
      ok = true;
      return {
        ...prev,
        player: result.player,
        logs: [{ id: `banquet-${prev.turn}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    if (message) addLog(message);
    if (ok) onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex bg-black/60 backdrop-blur-sm p-3 ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-orange-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Campfire banquet"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-orange-300">🍽️ Campfire Banquet</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Dump at least {BANQUET_MIN_DISHES} cooked dishes for a full heal. {BANQUET_MIN_DISHES} dishes hold mood at {baseline.floor} for {baseline.turns} turns. Extra dishes raise both, up to a cap. Gold stays in your pocket.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground hover:text-foreground px-2 rounded">
            ESC
          </button>
        </div>

        {dishes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">No cooked dishes in your bag or bank.</p>
        )}
        <div className="flex flex-col gap-1.5 mb-4">
          {dishes.map(({ item, where }) => {
            const on = selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={on}
                className={`min-h-11 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left border transition-colors ${on ? 'border-orange-400 bg-orange-500/15' : 'border-border/40 bg-secondary/20'}`}
              >
                <span className="text-2xl leading-none shrink-0">{item.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold leading-tight">{item.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{where}</span>
                </span>
                <span className="text-xs font-bold text-orange-200 shrink-0">{on ? 'In' : 'Out'}</span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
          {shown
            ? `Full heal to ${pool} HP. Mood floor ${shown.floor} for ${shown.turns} turns.`
            : `Choose at least ${BANQUET_MIN_DISHES} cooked dishes.`}
        </p>

        <button
          type="button"
          disabled={!ready}
          onClick={hold}
          className="w-full min-h-11 rounded-lg border border-orange-400/50 bg-orange-500/20 text-orange-100 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Hold banquet ({selected.length})
        </button>
        <CloseHintButton onClose={dismiss}>Leave the fire</CloseHintButton>
      </div>
    </div>
  );
}
