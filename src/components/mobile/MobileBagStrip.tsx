import type { DOMAttributes } from 'react';
import { EmojiItem } from '../../game/types';
import { activeKindEmoji } from '../itemUtils';

interface MobileBagStripProps {
  bagSlots: EmojiItem[];
  healSlots: EmojiItem[];
  activeProjectileKind?: string;
  onUseSlot: (i: number) => void;
  onUseHeal: () => void;
  onOpenBag: () => void;
  itemInspectProps: (item: EmojiItem | null) => DOMAttributes<HTMLButtonElement>;
  /** Compact 3×3 grid for one-handed thumb reach; default is the full-width strip. */
  layout?: 'bar' | 'grid';
  align?: 'left' | 'right' | 'stretch';
}

/** Compact horizontal quick-use hotbar shown on touch devices in place of the sidebar. */
export function MobileBagStrip({
  bagSlots, healSlots, activeProjectileKind, onUseSlot, onUseHeal, onOpenBag, itemInspectProps,
  layout = 'bar', align = 'stretch',
}: MobileBagStripProps) {
  const slots = (
    <>
      {Array.from({ length: 9 }, (_, i) => {
        const item = bagSlots[i] ?? null;
        if (!item) {
          return (
            <div key={`empty-${i}`} className="relative w-full aspect-square bg-black/20 border border-border/20 rounded flex items-center justify-center">
              <span className="text-[7px] text-muted-foreground/20 font-bold">{i + 1}</span>
            </div>
          );
        }
        const kindEmoji = activeKindEmoji(item.activeKind);
        const inFlight = !!item.activeKind && activeProjectileKind === item.activeKind;
        return (
          <button
            key={item.id}
            data-testid={`mobile-slot-${i + 1}`}
            onClick={() => onUseSlot(i)}
            {...itemInspectProps(item)}
            className={`relative w-full aspect-square bg-card border rounded flex items-center justify-center text-base active:scale-90 transition-transform ${item.isEquipment ? 'border-amber-500/60' : item.activeKind ? 'border-amber-600/40' : 'border-border'}`}
            title={`[${i + 1}] ${item.name}`}
          >
            {item.emoji}
            <span className="absolute top-0 left-px text-[6px] text-muted-foreground/60 font-bold leading-none">{i + 1}</span>
            {kindEmoji && <span className="absolute bottom-0 right-0 text-[7px] leading-none">{kindEmoji}</span>}
            {!item.isEquipment && !kindEmoji && (item.stackCount ?? 0) > 1 && (
              <span className="absolute bottom-0 right-px text-[7px] text-emerald-400 font-bold leading-none">×{item.stackCount}</span>
            )}
            {inFlight && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />}
          </button>
        );
      })}
    </>
  );

  const extras = (
    <>
      {healSlots.length > 0 && (
        <button
          data-testid="mobile-heal"
          onClick={onUseHeal}
          className="relative w-8 h-8 shrink-0 bg-card border border-emerald-500/40 rounded flex items-center justify-center text-base active:scale-90 transition-transform"
          title="Use best heal (H)"
        >
          {healSlots[0].emoji}
          {healSlots.length > 1 && <span className="absolute bottom-0 right-px text-[7px] text-emerald-400 font-bold leading-none">×{healSlots.length}</span>}
        </button>
      )}
      <button
        onClick={onOpenBag}
        className="w-8 h-8 shrink-0 bg-secondary/50 border border-border/50 rounded flex items-center justify-center text-sm active:scale-90 transition-transform"
        aria-label="Open bag"
        title="Open bag (B)"
      >
        🎒
      </button>
    </>
  );

  if (layout === 'grid') {
    return (
      <div
        className={`flex flex-col gap-1 p-1 rounded-xl bg-black/40 backdrop-blur-sm border border-white/10 shadow-2xl ${align === 'right' ? 'items-end' : 'items-start'}`}
        style={{ width: 132 }}
      >
        <div className="grid grid-cols-3 gap-0.5 w-full">{slots}</div>
        <div className="flex items-center gap-0.5">{extras}</div>
      </div>
    );
  }

  const cluster = align === 'left' || align === 'right';
  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 bg-sidebar/80 border-b border-border/40 shrink-0">
      {align === 'left' && extras}
      <div className={`grid grid-cols-9 gap-0.5 min-w-0 ${cluster ? 'max-w-[22rem] w-full' : 'flex-1'} ${align === 'right' ? 'ml-auto' : ''} ${align === 'left' ? 'mr-auto' : ''}`}>{slots}</div>
      {align !== 'left' && extras}
    </div>
  );
}
