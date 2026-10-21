import { useState } from 'react';
import type { GameState } from '../game/types';
import {
  executeFarmerTrade,
  farmerAskPrice,
  farmerPayLabel,
  farmerTradeValue,
  formatTradePoints,
  payableFarmerItems,
} from '../game/farmer';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface FarmerTradeModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  farmerId: string;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function FarmerTradeModal({ gameState, setGameState, farmerId, addLog, onClose }: FarmerTradeModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [offerIds, setOfferIds] = useState<string[]>([]);

  const farmer = gameState.enemies.find(e => e.id === farmerId && e.isFarmer && e.hp > 0);
  const stock = (farmer?.tradeStock ?? []).filter(item => !item.consumed);
  const foods = payableFarmerItems(gameState.player);
  const picked = stock.find(item => item.id === pickedId) ?? null;
  const price = picked ? farmerAskPrice(picked) : 0;
  const offered = foods.filter(item => offerIds.includes(item.id));
  const paid = offered.reduce((sum, item) => sum + farmerTradeValue(item), 0);
  const canTrade = !!picked && paid + 1e-9 >= price;

  const toggleOffer = (id: string) => {
    setOfferIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const trade = () => {
    if (!picked) return;
    let message = '';
    setGameState(prev => {
      if (!prev) return prev;
      const live = prev.enemies.find(e => e.id === farmerId);
      if (!live?.tradeStock) return prev;
      const result = executeFarmerTrade(prev.player, live.tradeStock, picked.id, offerIds);
      message = result.ok ? (result.log ?? 'Traded.') : (result.reason ?? 'Trade failed.');
      if (!result.ok || !result.player || !result.stock) return prev;
      return {
        ...prev,
        player: result.player,
        enemies: prev.enemies.map(e => e.id === farmerId ? { ...e, tradeStock: result.stock } : e),
      };
    });
    if (message) addLog(message);
    setOfferIds([]);
    setPickedId(null);
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex bg-black/60 backdrop-blur-sm p-3 ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-green-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Farmer trade"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-green-300">🧑‍🌾 Farmer</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Barter food and healing items. Cooked ×1.25, raw ×1, potions ×0.75. No gold.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground hover:text-foreground px-2 rounded">
            ESC
          </button>
        </div>

        {!farmer && <p className="text-sm text-muted-foreground py-6 text-center">The farmer is gone.</p>}

        {farmer && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">For trade</div>
            {stock.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">The farmer's cart is empty.</p>}
            <div className="flex flex-col gap-1.5 mb-4">
              {stock.map(item => {
                const cost = farmerAskPrice(item);
                const selected = item.id === pickedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPickedId(item.id)}
                    className={`min-h-11 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left border transition-colors ${selected ? 'border-green-400 bg-green-500/15' : 'border-border/40 bg-secondary/20'}`}
                  >
                    <span className="text-2xl leading-none shrink-0">{item.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold leading-tight">{item.name}</span>
                      <span className="block text-[10px] text-muted-foreground leading-snug line-clamp-2">{item.description}</span>
                    </span>
                    <span className="text-xs font-bold text-green-300 shrink-0">{formatTradePoints(cost)}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Your food</div>
            {foods.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Nothing to offer. Gold stays in your pocket.</p>
            )}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {foods.map(item => {
                const on = offerIds.includes(item.id);
                const fromBank = gameState.player.bank.some(b => b.id === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleOffer(item.id)}
                    className={`min-h-11 rounded-lg px-2 py-2 text-left border ${on ? 'border-green-400 bg-green-500/15' : 'border-border/40 bg-secondary/10'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-xl leading-none">{item.emoji}</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold truncate">{item.name}{fromBank ? ' · bank' : ''}</span>
                        <span className="block text-[10px] text-muted-foreground">{farmerPayLabel(item)} · {formatTradePoints(farmerTradeValue(item))}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground">{picked ? picked.name : 'Pick an emoji'}</span>
              <span className={canTrade ? 'text-green-300 font-bold' : 'text-muted-foreground'}>
                {formatTradePoints(paid)} / {picked ? formatTradePoints(price) : '—'}
              </span>
            </div>
            <button
              type="button"
              disabled={!canTrade}
              onClick={trade}
              className="w-full min-h-12 rounded-lg bg-green-600 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Trade
            </button>
          </>
        )}
        <CloseHintButton onClose={dismiss} />
      </div>
    </div>
  );
}
