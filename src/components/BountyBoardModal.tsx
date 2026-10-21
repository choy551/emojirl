import type { GameState } from '../game/types';
import { acceptBounty, bountyProgress, bountyTaskLine } from '../game/goldSinks2';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface BountyBoardModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function BountyBoardModal({ gameState, setGameState, addLog, onClose }: BountyBoardModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const quest = gameState.bounty?.floor === gameState.currentFloor ? gameState.bounty : undefined;
  const progress = bountyProgress(gameState);
  const broke = !!quest && quest.status === 'offered' && gameState.player.stats.gold < quest.ante;

  const accept = () => {
    let message = '';
    setGameState(prev => {
      if (!prev) return prev;
      const result = acceptBounty(prev);
      message = result.ok ? (result.log ?? 'Bounty accepted.') : (result.reason ?? 'The board refuses.');
      return result.ok && result.state ? result.state : prev;
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
        className={`bg-card border border-amber-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Bounty board"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-200">📜 Bounty Board</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              One contract on this floor. The ante is spent when you accept. Leaving the floor expires it.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground px-2 rounded">ESC</button>
        </div>

        {!quest && (
          <p className="text-xs text-muted-foreground">The board is blank.</p>
        )}

        {quest && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3">
            <p className="text-sm font-bold text-amber-50">{bountyTaskLine(quest)}</p>
            <p className="text-xs text-amber-100 mt-2">
              Reward: {quest.reward.emoji} {quest.reward.name} ({quest.reward.tier})
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Ante {quest.ante}g · you have {gameState.player.stats.gold}g</p>
            {quest.status !== 'offered' && (
              <p className="text-xs mt-2 text-amber-100">{progress.label}</p>
            )}
          </div>
        )}

        {quest?.status === 'offered' && (
          <button
            type="button"
            disabled={broke}
            onClick={accept}
            className="mt-3 min-h-11 w-full rounded-lg border border-amber-400/50 bg-amber-500/20 text-amber-50 text-sm font-bold disabled:opacity-40"
          >
            {broke ? `Need ${quest.ante}g` : `Accept for ${quest.ante}g`}
          </button>
        )}
        {quest?.status === 'done' && (
          <p className="mt-3 text-xs text-emerald-200">The contract is paid.</p>
        )}
        <CloseHintButton onClose={dismiss}>Step away</CloseHintButton>
      </div>
    </div>
  );
}
