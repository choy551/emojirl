import { AbilityDescriptor } from './classAbilities';

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
  onClose: () => void;
}

function ActionTile({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); if (!item.disabled) { item.onUse(); onClose(); } }}
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
export function ActionsMenu({ general, abilities, onOpenTactics, onClose }: ActionsMenuProps) {
  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      onPointerDown={e => e.stopPropagation()}
    >
      <div
        className="w-full max-w-md bg-card border-t border-x border-border rounded-t-2xl shadow-2xl p-4 max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
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
                  onClose={onClose}
                />
              ))}
            </div>
          </>
        )}

        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5 px-1">Actions</div>
        <div className="grid grid-cols-4 gap-2">
          {general.map(item => (
            <ActionTile key={item.id} item={item} onClose={onClose} />
          ))}
          <ActionTile
            item={{ id: 'tactics', icon: '🧭', label: 'Tactics', onUse: onOpenTactics }}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
