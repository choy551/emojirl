import type { GameState } from '../game/types';
import { VANITY_TITLES, VANITY_TRAILS, buyVanity } from '../game/goldSinks2';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface VanityFlexModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function VanityFlexModal({ gameState, setGameState, addLog, onClose }: VanityFlexModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const player = gameState.player;
  const gold = player.stats.gold;

  const buy = (slot: 'trail' | 'title', id: string) => {
    let message = '';
    setGameState(prev => {
      if (!prev) return prev;
      const result = buyVanity(prev.player, slot, id);
      message = result.ok ? (result.log ?? 'Bought.') : (result.reason ?? 'The vendor declines.');
      if (!result.ok || !result.player) return prev;
      return {
        ...prev,
        player: result.player,
        logs: [{ id: `vanity-${prev.turn}-${id}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    if (message) addLog(message);
  };

  return (
    <div
      className={`fixed inset-0 z-[80] flex bg-black/60 backdrop-blur-sm p-3 ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-fuchsia-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Vanity flex"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-fuchsia-200">💎 Vanity Flex</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Cosmetics only. Zero attack, defense, HP, or any other combat power. A new purchase replaces that slot. You have {gold}g.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground px-2 rounded">ESC</button>
        </div>

        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Trails</div>
        <div className="flex flex-col gap-1.5 mb-3">
          {VANITY_TRAILS.map(trail => {
            const owned = player.vanity?.trail === trail.id;
            return (
              <button
                key={trail.id}
                type="button"
                disabled={owned || gold < trail.price}
                onClick={() => buy('trail', trail.id)}
                className="min-h-11 w-full flex items-center gap-2 rounded-lg px-3 text-left border border-fuchsia-500/30 bg-fuchsia-500/10 disabled:opacity-40"
              >
                <span className="text-2xl leading-none">{trail.emoji}</span>
                <span className="flex-1 text-xs font-bold">{trail.name}</span>
                <span className="text-[11px] text-fuchsia-100">{owned ? 'Worn' : `${trail.price}g`}</span>
              </button>
            );
          })}
        </div>

        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Titles</div>
        <div className="flex flex-col gap-1.5">
          {VANITY_TITLES.map(title => {
            const owned = player.vanity?.title === title.id;
            return (
              <button
                key={title.id}
                type="button"
                disabled={owned || gold < title.price}
                onClick={() => buy('title', title.id)}
                className="min-h-11 w-full flex items-center gap-2 rounded-lg px-3 text-left border border-fuchsia-500/30 bg-fuchsia-500/10 disabled:opacity-40"
              >
                <span className="flex-1 text-xs font-bold">{title.name}</span>
                <span className="text-[11px] text-fuchsia-100">{owned ? 'Worn' : `${title.price}g`}</span>
              </button>
            );
          })}
        </div>
        <CloseHintButton onClose={dismiss}>Leave the stall</CloseHintButton>
      </div>
    </div>
  );
}
