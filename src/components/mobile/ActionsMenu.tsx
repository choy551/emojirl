import { AbilityDescriptor } from './classAbilities';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './oneHandedLayout';
import { swallowGhostClick, useDismissGuard } from '../../hooks/useDismissGuard';

export interface ActionItem {
  id: string;
  icon: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  active?: boolean;
  onUse: () => void;
}

interface ActionsMenuProps {
  general: ActionItem[];
  abilities: AbilityDescriptor[];
  onOpenTactics: () => void;
  onOpenGoto: () => void;
  onClose: () => void;
}

function ActionTile({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  return (
    <button
      onPointerDown={e => {
        e.preventDefault();
        e.stopPropagation();
        if (item.disabled) return;
        item.onUse();
        onClose();
      }}
      disabled={item.disabled}
      className={[
        'flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl border select-none touch-none',
        'transition-transform duration-75 active:scale-90',
        item.disabled
          ? 'bg-black/30 border-white/10 text-white/35'
          : item.active
            ? 'bg-violet-700/60 border-violet-300/50 text-white'
            : 'bg-secondary/60 border-border/50 text-foreground hover:bg-secondary/80',
      ].join(' ')}
      title={`${item.label}${item.detail ? ` — ${item.detail}` : ''}`}
    >
      <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{item.icon}</span>
      <span className="text-[10px] font-bold leading-tight text-center px-1">{item.label}</span>
      {item.detail && <span className="text-[8px] opacity-60 leading-none">{item.detail}</span>}
    </button>
  );
}

/** Bottom sheet listing every available action plus per-class abilities and Tactics. */
export function ActionsMenu({ general, abilities, onOpenTactics, onOpenGoto, onClose }: ActionsMenuProps) {
  const hand = useMobileHand();
  const closeSheet = () => {
    // Sheet unmounts on pointerdown; eat the trailing click so it cannot
    // hit the combat log (or other UI) now sitting under the finger.
    swallowGhostClick();
    onClose();
  };
  const dismiss = useDismissGuard(closeSheet);
  return (
    <div
      className={`fixed inset-0 z-[55] flex bg-black/60 backdrop-blur-sm ${hand ? overlayFlexClass(hand) : 'items-end justify-center'}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`w-full max-w-md bg-card border-border shadow-2xl p-4 overflow-y-auto ${hand ? overlayPanelClass(hand) + ' border' : 'border-t border-x rounded-t-2xl max-h-[80vh]'}`}
        style={hand ? overlayPanelStyle(hand) : { paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <span className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {abilities.length > 0 && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5 px-1">Abilities</div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {abilities.map(a => (
                <ActionTile
                  key={a.id}
                  item={{ id: a.id, icon: a.icon, label: a.label, detail: a.detail, disabled: a.disabled, active: a.active, onUse: a.onUse }}
                  onClose={closeSheet}
                />
              ))}
            </div>
          </>
        )}

        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5 px-1">Actions</div>
        <div className="grid grid-cols-4 gap-2">
          {general.map(item => (
            <ActionTile key={item.id} item={item} onClose={closeSheet} />
          ))}
          <ActionTile
            item={{ id: 'tactics', icon: '🧭', label: 'Tactics', onUse: onOpenTactics }}
            onClose={closeSheet}
          />
          <ActionTile
            item={{ id: 'goto', icon: '🗺️', label: 'Go to', onUse: onOpenGoto }}
            onClose={closeSheet}
          />
        </div>
      </div>
    </div>
  );
}
