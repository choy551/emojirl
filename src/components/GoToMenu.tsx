import { GotoDestination } from '../game/goto';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface GoToMenuProps {
  floor: number;
  destinations: GotoDestination[];
  onPick: (dest: GotoDestination) => void;
  onClose: () => void;
}

/** DCSS-style Go to list of known destinations on the current floor. */
export function GoToMenu({ floor, destinations, onPick, onClose }: GoToMenuProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  return (
    <div
      className={`fixed inset-0 z-[70] flex ${overlayFlexClass(hand)}`}
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-border shadow-2xl w-[min(22rem,92vw)] max-h-[80vh] overflow-y-auto p-4 ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="text-sm font-bold uppercase tracking-widest text-center mb-1 text-muted-foreground">
          Go to
        </div>
        <div className="text-[11px] text-center text-muted-foreground/60 mb-3">
          D:{floor} · known destinations
        </div>

        {destinations.length === 0 ? (
          <p className="text-xs text-muted-foreground/70 text-center py-4">
            No known destinations on this floor.
          </p>
        ) : (
          <div className="space-y-1">
            {destinations.map((d, i) => (
              <button
                key={`${d.kind}-${d.pos.x}-${d.pos.y}`}
                className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 text-sm hover:bg-secondary/60 transition-colors"
                onClick={() => onPick(d)}
              >
                <span className="font-mono text-muted-foreground w-4 shrink-0">
                  {i < 9 ? i + 1 : d.key}
                </span>
                <span className="text-base leading-none">{d.icon}</span>
                <span className="flex-1 min-w-0 truncate">{d.label}</span>
                <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                  {d.dist === 0 ? 'here' : `${d.dist}t`}
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/40 text-center mt-3">
          1–9 / a–z select · Esc or G close
        </p>
      </div>
    </div>
  );
}
