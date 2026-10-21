import { useState } from 'react';
import type { BountyReward, GameState } from '../game/types';
import {
  AUCTION_SWEETENERS,
  auctionGold,
  auctionHpCost,
  executeBloodAuction,
  rollRareReward,
} from '../game/goldSinks2';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface BloodAuctionModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
  /** Fixed lot for tests. The live stall rolls one rare emoji when the sheet opens. */
  lot?: BountyReward;
}

export function BloodAuctionModal({ gameState, setGameState, addLog, onClose, lot }: BloodAuctionModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const [offered] = useState<BountyReward>(() => lot ?? rollRareReward());
  const [pct, setPct] = useState<(typeof AUCTION_SWEETENERS)[number]['pct']>(10);
  const player = gameState.player;
  const gold = auctionGold(gameState.currentFloor);
  const plan = AUCTION_SWEETENERS.find(row => row.pct === pct)!;
  const hpCost = auctionHpCost(player.stats.hp, pct);
  const broke = player.stats.gold < gold;
  const thin = player.stats.hp <= 1;

  const bid = () => {
    if (broke || thin) return;
    let message = '';
    let placed = false;
    setGameState(prev => {
      if (!prev) return prev;
      const result = executeBloodAuction(prev.player, prev.currentFloor, pct, offered);
      message = result.ok ? (result.log ?? 'Bid placed.') : (result.reason ?? 'The auctioneer refuses.');
      if (!result.ok || !result.player) return prev;
      placed = true;
      return {
        ...prev,
        player: result.player,
        logs: [{ id: `auction-${prev.turn}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    if (message) addLog(message);
    if (placed) onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-[80] flex bg-black/60 backdrop-blur-sm p-3 ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-rose-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Blood auction"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-rose-200">☠️ Blood Auction</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Gold is spent as soon as you bid, win or lose. HP is the sweetener and is paid only if you win. A win never drops you below 1 HP.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground px-2 rounded">ESC</button>
        </div>

        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-3 mb-3">
          <p className="text-sm font-bold text-rose-50">Lot: {offered.emoji} {offered.name}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Guaranteed rare. Shown before you bid. Stake {gold}g · you have {player.stats.gold}g.</p>
        </div>

        <div className="flex flex-col gap-1.5 mb-3">
          {AUCTION_SWEETENERS.map(row => (
            <button
              key={row.pct}
              type="button"
              aria-pressed={pct === row.pct}
              onClick={() => setPct(row.pct)}
              className={`min-h-11 w-full rounded-lg px-3 text-left text-xs font-bold border ${pct === row.pct ? 'border-rose-300 bg-rose-500/20 text-rose-50' : 'border-border/40 bg-secondary/20 text-foreground'}`}
            >
              Sweeten {row.pct}% HP · {Math.round(row.chance * 100)}% chance
            </button>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground mb-3">
          If this bid wins you lose {hpCost} HP and keep at least 1. If it fails, HP stays {player.stats.hp}. Chance {Math.round(plan.chance * 100)}%.
        </p>
        {thin && <p className="text-xs text-amber-200 mb-2">You need more than 1 HP to sweeten a bid.</p>}
        <button
          type="button"
          disabled={broke || thin}
          onClick={bid}
          className="min-h-11 w-full rounded-lg border border-rose-400/50 bg-rose-500/20 text-rose-50 text-sm font-bold disabled:opacity-40"
        >
          {broke ? `Need ${gold}g` : `Bid ${gold}g`}
        </button>
        <CloseHintButton onClose={dismiss}>Keep your blood</CloseHintButton>
      </div>
    </div>
  );
}
