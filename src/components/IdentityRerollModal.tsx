import type { GameState } from '../game/types';
import { executeIdentityReroll, rerollCost, rerollTargets } from '../game/goldSinks';
import { VOID } from '../game/prestigeConstants';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface IdentityRerollModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function IdentityRerollModal({ gameState, setGameState, addLog, onClose }: IdentityRerollModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const player = gameState.player;
  const cost = rerollCost(gameState.currentFloor);
  const used = !!player.identityRerolled;
  const broke = player.stats.gold < cost;
  const choices = rerollTargets(player.characterClass);

  const choose = (emoji: string) => {
    if (used || broke) return;
    let message = '';
    let ok = false;
    setGameState(prev => {
      if (!prev) return prev;
      const result = executeIdentityReroll(prev.player, prev.currentFloor, emoji);
      message = result.ok ? (result.log ?? 'Rerolled.') : (result.reason ?? 'Reroll refused.');
      if (!result.ok || !result.player) return prev;
      ok = true;
      return {
        ...prev,
        player: result.player,
        logs: [{ id: `reroll-${prev.turn}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
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
        className={`bg-card border border-sky-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Identity reroll"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-sky-200">🪞 Identity Reroll</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Once this run. Bag, hotbar, and bank stay. Base stats shift to the new class. {cost}g.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground px-2 rounded">ESC</button>
        </div>

        {used && (
          <p className="text-xs text-sky-100 bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2 mb-3">
            The mirror already knows you this run.
          </p>
        )}
        {!used && broke && (
          <p className="text-xs text-amber-200 mb-3">Need {cost} gold. You have {player.stats.gold}g.</p>
        )}

        <div className="flex flex-col gap-1.5">
          {choices.map(choice => {
            const locked = !choice.unlocked;
            const disabled = used || broke || locked;
            return (
              <button
                key={choice.emoji}
                type="button"
                disabled={disabled}
                onClick={() => choose(choice.emoji)}
                className="min-h-11 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left border border-sky-500/30 bg-sky-500/10 disabled:opacity-40"
              >
                <span className="text-2xl leading-none shrink-0">{choice.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold leading-tight">{choice.name}</span>
                  <span className="block text-[10px] text-muted-foreground leading-snug">
                    {locked ? choice.hint : choice.emoji === VOID ? 'A filled hotbar still takes Void damage.' : `${cost}g`}
                  </span>
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
