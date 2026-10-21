import type { GameState } from '../game/types';
import { executeShrineOffer, shrineBuffLabel, sinkFoods } from '../game/foodSinks';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface ShrineOfferingModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function ShrineOfferingModal({ gameState, setGameState, addLog, onClose }: ShrineOfferingModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const foods = sinkFoods(gameState.player);
  const held = gameState.player.shrineOffering;
  const blocked = held ? 'This floor already holds your offering.' : null;

  const offer = (itemId: string) => {
    if (blocked) return;
    let message = '';
    let ok = false;
    setGameState(prev => {
      if (!prev) return prev;
      const result = executeShrineOffer(prev.player, itemId);
      message = result.ok ? (result.log ?? 'Offering accepted.') : (result.reason ?? 'Offering refused.');
      if (!result.ok || !result.player) return prev;
      ok = true;
      return {
        ...prev,
        player: result.player,
        logs: [{ id: `offer-${prev.turn}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
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
        className={`bg-card border border-amber-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Shrine offering"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-200">🛕 Shrine Offering</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              One food, once this floor. The blessing lasts until you descend. Potions, hearts, and gold are not food.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground hover:text-foreground px-2 rounded">
            ESC
          </button>
        </div>

        {held && (
          <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
            {blocked} Current: {held.foodEmoji} {held.label}, +{held.attack} ATK{held.defense > 0 ? ` +${held.defense} DEF` : ''}.
          </p>
        )}

        {foods.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">No food in your bag or bank.</p>
        )}
        <div className="flex flex-col gap-1.5">
          {foods.map(item => {
            const where = gameState.player.bank.some(entry => entry.id === item.id) ? 'Bank' : 'Bag';
            return (
              <button
                key={item.id}
                type="button"
                disabled={!!blocked}
                onClick={() => offer(item.id)}
                className="min-h-11 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left border border-amber-500/30 bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="text-2xl leading-none shrink-0">{item.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold leading-tight">{item.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{where} · {shrineBuffLabel(item)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <CloseHintButton onClose={dismiss}>Step back</CloseHintButton>
      </div>
    </div>
  );
}
