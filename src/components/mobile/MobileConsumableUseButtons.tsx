import { EmojiItem } from '../../game/types';
import { mobileQuickUseLabel } from '../../game/mobileQuickUse';

interface Entry {
  slot: number;
  item: EmojiItem;
}

interface Props {
  entries: Entry[];
  dirPickMode?: 'gun' | 'freeze' | 'boomerang' | 'bomb' | null;
  activeProjectileKind?: string | null;
  onUse: (slot: number) => void;
}

/** Thumb-reachable Use buttons for aimed actives and lightning zap. */
export function MobileConsumableUseButtons({ entries, dirPickMode, activeProjectileKind, onUse }: Props) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      {entries.map(({ slot, item }) => {
        const aiming = !!item.activeKind && (dirPickMode === item.activeKind || activeProjectileKind === item.activeKind);
        const badge = (item.charges ?? 0) > 0
          ? item.charges
          : (item.stackCount ?? 0) > 1
            ? `×${item.stackCount}`
            : null;
        const label = mobileQuickUseLabel(item);
        return (
          <button
            key={`${item.id}-${slot}`}
            type="button"
            data-testid={`mobile-quick-use-${slot}`}
            onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onUse(slot); }}
            className={[
              'relative flex flex-col items-center justify-center rounded-xl border shadow-lg select-none touch-none',
              'transition-transform duration-75 active:scale-90 text-white',
              aiming
                ? 'bg-amber-700/70 border-amber-300/70'
                : 'bg-slate-800/70 border-slate-300/35',
            ].join(' ')}
            style={{ width: 52, height: 52 }}
            aria-label={`${label} ${item.name}`}
            title={`${item.emoji} ${item.name}`}
          >
            <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{item.emoji}</span>
            <span className="text-[8px] font-bold leading-none mt-0.5">{label}</span>
            {badge != null && (
              <span className="absolute -top-1 -right-1 min-w-[14px] px-0.5 rounded-full bg-emerald-600 text-[8px] font-bold leading-tight">
                {badge}
              </span>
            )}
            {aiming && <span className="absolute -top-0.5 -left-0.5 w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />}
          </button>
        );
      })}
    </div>
  );
}
