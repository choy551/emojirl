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
}

/** Compact horizontal quick-use hotbar shown on touch devices in place of the sidebar. */
export function MobileBagStrip({
  bagSlots, healSlots, activeProjectileKind, onUseSlot, onUseHeal, onOpenBag, itemInspectProps,
}: MobileBagStripProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-sidebar/80 border-b border-border/40 overflow-x-auto shrink-0">
      {Array.from({ length: 9 }, (_, i) => {
        const item = bagSlots[i] ?? null;
        if (!item) {
          return (
            <div key={`empty-${i}`} className="relative w-9 h-9 shrink-0 bg-black/20 border border-border/20 rounded flex items-center justify-center">
              <span className="text-[8px] text-muted-foreground/20 font-bold">{i + 1}</span>
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
            className={`relative w-9 h-9 shrink-0 bg-card border rounded flex items-center justify-center text-lg active:scale-90 transition-transform ${item.isEquipment ? 'border-amber-500/60' : item.activeKind ? 'border-amber-600/40' : 'border-border'}`}
            title={`[${i + 1}] ${item.name}`}
          >
            {item.emoji}
            <span className="absolute top-0 left-0.5 text-[7px] text-muted-foreground/60 font-bold leading-none">{i + 1}</span>
            {kindEmoji && <span className="absolute bottom-0 right-0 text-[8px] leading-none">{kindEmoji}</span>}
            {!item.isEquipment && !kindEmoji && (item.stackCount ?? 0) > 1 && (
              <span className="absolute bottom-0 right-0.5 text-[8px] text-emerald-400 font-bold leading-none">×{item.stackCount}</span>
            )}
            {inFlight && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 animate-ping" />}
          </button>
        );
      })}

      {healSlots.length > 0 && (
        <button
          data-testid="mobile-heal"
          onClick={onUseHeal}
          className="relative w-9 h-9 shrink-0 bg-card border border-emerald-500/40 rounded flex items-center justify-center text-lg active:scale-90 transition-transform"
          title="Use best heal (H)"
        >
          {healSlots[0].emoji}
          {healSlots.length > 1 && <span className="absolute bottom-0 right-0.5 text-[8px] text-emerald-400 font-bold leading-none">×{healSlots.length}</span>}
        </button>
      )}

      <button
        onClick={onOpenBag}
        className="w-9 h-9 shrink-0 bg-secondary/50 border border-border/50 rounded flex items-center justify-center text-base active:scale-90 transition-transform ml-auto"
        aria-label="Open bag"
        title="Open bag (B)"
      >
        🎒
      </button>
    </div>
  );
}
