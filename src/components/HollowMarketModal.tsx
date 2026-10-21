import type { GameState } from '../game/types';
import {
  HOLLOW_HP_CONSUMES,
  HOLLOW_HP_COST,
  HOLLOW_REROLL_SPARE,
  HOLLOW_UNMAKE_CONSUMES,
  catalogSpareRows,
  heldGhostEmojis,
  hollowSoulChoices,
  offerBlood,
  rerollVoidProgress,
  unmakeAtMarket,
} from '../game/hollowMarket';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface HollowMarketModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function HollowMarketModal({ gameState, setGameState, addLog, onClose }: HollowMarketModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const player = gameState.player;
  const floor = gameState.currentFloor;
  const used = gameState.hollowUsedFloor === floor;
  const closed = player.characterClass !== '👤';
  const souls = hollowSoulChoices(player);
  const spares = catalogSpareRows();
  const ghosts = heldGhostEmojis(player);
  const hpShort = player.stats.hp < HOLLOW_HP_COST + 1;

  const finish = (ok: boolean, message: string) => {
    if (message) addLog(message);
    if (ok) onClose();
  };

  const unmake = (itemId: string) => {
    if (closed || used) return;
    let message = '';
    let ok = false;
    setGameState(prev => {
      if (!prev) return prev;
      const result = unmakeAtMarket(prev.player, itemId, prev.currentFloor, prev.hollowUsedFloor);
      message = result.ok ? (result.log ?? 'Unmade.') : (result.reason ?? 'The Void refuses.');
      if (!result.ok || !result.player) return prev;
      ok = true;
      return {
        ...prev,
        hollowUsedFloor: result.hollowUsedFloor,
        player: result.player,
        logs: [{ id: `hollow-${prev.turn}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    finish(ok, message);
  };

  const reroll = (emoji: string) => {
    if (closed || used) return;
    let message = '';
    let ok = false;
    setGameState(prev => {
      if (!prev) return prev;
      const result = rerollVoidProgress(prev.player, emoji, prev.currentFloor, prev.hollowUsedFloor, Math.random());
      message = result.ok ? (result.log ?? 'Rerolled.') : (result.reason ?? 'The Void refuses.');
      if (!result.ok || !result.player) return prev;
      ok = true;
      return {
        ...prev,
        hollowUsedFloor: result.hollowUsedFloor,
        player: result.player,
        logs: [{ id: `hollow-${prev.turn}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    finish(ok, message);
  };

  const bleed = (emoji: string) => {
    if (closed || used || hpShort) return;
    let message = '';
    let ok = false;
    setGameState(prev => {
      if (!prev) return prev;
      const result = offerBlood(prev.player, emoji, prev.currentFloor, prev.hollowUsedFloor);
      message = result.ok ? (result.log ?? 'Offered.') : (result.reason ?? 'The Void refuses.');
      if (!result.ok || !result.player) return prev;
      ok = true;
      return {
        ...prev,
        hollowUsedFloor: result.hollowUsedFloor,
        player: result.player,
        logs: [{ id: `hollow-${prev.turn}`, text: message, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    finish(ok, message);
  };

  return (
    <div
      className={`fixed inset-0 z-[80] flex bg-black/60 backdrop-blur-sm p-3 ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
      data-testid="hollow-market"
    >
      <div
        className={`bg-card border border-violet-500/40 p-4 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Hollow Market"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-violet-200">🌑 Hollow Market</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              The Void does not deal in gold. Unmake a hotbar soul for +{HOLLOW_UNMAKE_CONSUMES} consumes.
              Move {HOLLOW_REROLL_SPARE} spare consumes onto another soul.
              Offer {HOLLOW_HP_COST} HP (leave at least 1) for +{HOLLOW_HP_CONSUMES} consumes on a ghost you hold.
              One trade this floor.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="min-h-11 min-w-11 text-xs text-muted-foreground px-2 rounded">ESC</button>
        </div>

        {closed && (
          <p className="text-xs text-violet-100 bg-violet-500/10 border border-violet-500/30 rounded-lg px-3 py-2 mb-3">
            The Hollow Market is closed. Only the Void may unmake here.
          </p>
        )}
        {used && !closed && (
          <p className="text-xs text-violet-100 bg-violet-500/10 border border-violet-500/30 rounded-lg px-3 py-2 mb-3">
            The market already took its due this floor.
          </p>
        )}

        <section className="mb-3">
          <h3 className="text-[10px] uppercase tracking-widest text-violet-300/80 mb-1.5">Unmake a soul</h3>
          {souls.length === 0 && <p className="text-[11px] text-muted-foreground">No hotbar soul to unmake.</p>}
          <div className="flex flex-col gap-1.5">
            {souls.map(item => (
              <button
                key={item.id}
                type="button"
                data-testid={`hollow-unmake-${item.emoji}`}
                disabled={closed || used}
                onClick={() => unmake(item.id)}
                className="min-h-11 text-left text-xs px-3 rounded-lg border border-violet-500/30 bg-violet-950/30 disabled:opacity-40"
              >
                Unmake {item.emoji} {item.name} · +{HOLLOW_UNMAKE_CONSUMES} consumes
              </button>
            ))}
          </div>
        </section>

        <section className="mb-3">
          <h3 className="text-[10px] uppercase tracking-widest text-violet-300/80 mb-1.5">Reroll spare progress</h3>
          {spares.length === 0 && <p className="text-[11px] text-muted-foreground">No consumed-emoji progress yet.</p>}
          <div className="flex flex-col gap-1.5">
            {spares.map(row => {
              const ready = row.spare >= HOLLOW_REROLL_SPARE;
              return (
                <button
                  key={row.emoji}
                  type="button"
                  data-testid={`hollow-reroll-${row.emoji}`}
                  disabled={closed || used || !ready}
                  onClick={() => reroll(row.emoji)}
                  className="min-h-11 text-left text-xs px-3 rounded-lg border border-violet-500/30 bg-violet-950/30 disabled:opacity-40"
                >
                  {row.emoji} spare {row.spare} · stack ×{row.unlocks}
                  {ready ? ` · move ${HOLLOW_REROLL_SPARE}` : ` · need ${HOLLOW_REROLL_SPARE} spare`}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-3">
          <h3 className="text-[10px] uppercase tracking-widest text-violet-300/80 mb-1.5">Blood offering</h3>
          {ghosts.length === 0 && <p className="text-[11px] text-muted-foreground">No ghost to feed.</p>}
          {hpShort && ghosts.length > 0 && (
            <p className="text-[11px] text-amber-200 mb-1.5">Need {HOLLOW_HP_COST + 1} HP. You have {player.stats.hp}.</p>
          )}
          <div className="flex flex-col gap-1.5">
            {ghosts.map(emoji => (
              <button
                key={emoji}
                type="button"
                data-testid={`hollow-blood-${emoji}`}
                disabled={closed || used || hpShort}
                onClick={() => bleed(emoji)}
                className="min-h-11 text-left text-xs px-3 rounded-lg border border-violet-500/30 bg-violet-950/30 disabled:opacity-40"
              >
                Offer {HOLLOW_HP_COST} HP to {emoji} · +{HOLLOW_HP_CONSUMES} consumes
              </button>
            ))}
          </div>
        </section>

        <CloseHintButton onClose={dismiss} />
      </div>
    </div>
  );
}
