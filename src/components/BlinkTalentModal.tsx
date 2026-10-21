import type { BlinkTalentDef } from '../game/blinkStrike';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface BlinkTalentModalProps {
  tierLabel: string;
  choices: BlinkTalentDef[];
  /** Shown once for migrated Ninjas choosing a new Tier 3. */
  note?: string;
  onPick: (id: BlinkTalentDef['id']) => void;
}

/** Permanent Blink Strike talent pick. Stays up until a branch is chosen. */
export function BlinkTalentModal({ tierLabel, choices, note, onPick }: BlinkTalentModalProps) {
  const hand = useMobileHand();
  return (
    <div
      className={`fixed inset-0 z-[70] flex bg-black/75 backdrop-blur-sm ${overlayFlexClass(hand)}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="blink-talent-title"
    >
      <div
        className={`bg-card border border-violet-400/50 shadow-2xl p-4 flex flex-col gap-3 ${hand ? overlayPanelClass(hand) : 'rounded-2xl w-[min(24rem,92vw)]'}`}
        style={overlayPanelStyle(hand)}
      >
        <div>
          <div id="blink-talent-title" className="text-sm font-bold uppercase tracking-wide text-violet-200">
            ⚡ Blink talent · {tierLabel}
          </div>
          {note ? (
            <p className="text-[11px] text-violet-200/90 mt-1 leading-snug" data-testid="blink-t3-respec-note">
              {note}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground mt-1">
            Pick one. The choice is permanent for this run.
            {choices.length <= 9 ? ' Number keys select.' : ''}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {choices.map((choice, i) => (
            <button
              key={choice.id}
              type="button"
              data-testid={`blink-talent-${choice.id}`}
              className="w-full text-left rounded-xl border border-violet-400/40 bg-violet-500/10 hover:bg-violet-500/20 active:scale-[0.99] px-3 py-3 min-h-11"
              onClick={() => onPick(choice.id)}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-violet-300/80">{i + 1}</span>
                <span className="font-bold text-sm text-violet-100">{choice.name}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 leading-snug">{choice.detail}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
