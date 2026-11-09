import type { BlinkTalentAvailability, BlinkTalentDef } from '../game/blinkStrike';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

export interface BlinkTalentRow {
  talent: BlinkTalentDef;
  state: BlinkTalentAvailability;
}

interface BlinkTalentModalProps {
  earned: number;
  held: number;
  progressLabel: string;
  rows: BlinkTalentRow[];
  note?: string;
  onBuy: (id: BlinkTalentDef['id']) => void;
  onClose?: () => void;
}

const STATE_LABEL: Record<BlinkTalentAvailability, string> = {
  owned: 'Owned',
  buy: 'Buy',
  short: 'Need tokens',
  'branch-locked': 'Other branch at 5 earned',
  'tier-locked': 'Locked',
};

/** Talent token shop. Visible tiers can be bought, skipped, or banked. */
export function BlinkTalentModal({ earned, held, progressLabel, rows, note, onBuy, onClose }: BlinkTalentModalProps) {
  const hand = useMobileHand();
  return (
    <div
      className={`fixed inset-0 z-[70] flex bg-black/75 backdrop-blur-sm ${overlayFlexClass(hand)}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="blink-talent-title"
      onClick={onClose}
    >
      <div
        className={`bg-card border border-violet-400/50 shadow-2xl p-4 flex flex-col gap-3 max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-2xl w-[min(26rem,92vw)]'}`}
        style={overlayPanelStyle(hand)}
        onClick={event => event.stopPropagation()}
      >
        <div>
          <div id="blink-talent-title" className="text-sm font-bold uppercase tracking-wide text-violet-200">
            ⚡ Talent tokens
          </div>
          <p className="text-[11px] text-violet-100 mt-1" data-testid="blink-token-wallet">
            {held} held · {earned} earned · {progressLabel}
          </p>
          {note ? (
            <p className="text-[11px] text-violet-200/90 mt-1 leading-snug" data-testid="blink-t3-respec-note">
              {note}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground mt-1">
            Tier N costs N tokens. A tier is visible once N tokens are earned. Buying spends tokens you still hold.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map(row => {
            const buy = row.state === 'buy';
            return (
              <button
                key={row.talent.id}
                type="button"
                disabled={!buy}
                data-testid={`blink-talent-${row.talent.id}`}
                data-state={row.state}
                className={`w-full text-left rounded-xl border px-3 py-3 min-h-11 ${buy ? 'border-violet-400/40 bg-violet-500/10 hover:bg-violet-500/20' : 'border-border/40 bg-secondary/20 opacity-80'}`}
                onClick={() => { if (buy) onBuy(row.talent.id); }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-violet-300/80">T{row.talent.tier}</span>
                  <span className="font-bold text-sm text-violet-100">{row.talent.name}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">{STATE_LABEL[row.state]}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 leading-snug">{row.talent.detail}</div>
              </button>
            );
          })}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="min-h-11 text-xs text-muted-foreground">Close</button>
        )}
      </div>
    </div>
  );
}
