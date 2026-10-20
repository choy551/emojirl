import { useRef } from 'react';
import { EmojiItem } from '../game/types';
import { getPassiveTooltipSuffix } from '../game/passives';
import { activeKindEmoji } from './itemUtils';
import { ActivePassivesPanel } from './ActivePassivesPanel';

interface HotbarPanelProps {
  bagSlots: (EmojiItem | null)[];
  bank: EmojiItem[];
  selectedItemId: string | null;
  focusedBagIdx: number;
  onSelect: (itemId: string | null) => void;
  onMove: (sourceId: string, dest: string | number | 'bank') => void;
  onShowStatCard: (item: EmojiItem) => void;
  onBanishGhost?: (slot: number) => void;
}

export function HotbarPanel({
  bagSlots,
  bank,
  selectedItemId,
  focusedBagIdx,
  onSelect,
  onMove,
  onShowStatCard,
  onBanishGhost,
}: HotbarPanelProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemInspectProps = (item: EmojiItem | null) => ({
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); if (item) onShowStatCard(item); },
    onPointerDown: (e: React.PointerEvent) => {
      if (item && (e.pointerType === 'touch' || e.pointerType === 'pen')) {
        longPressTimerRef.current = setTimeout(() => onShowStatCard(item), 500);
      }
    },
    onPointerUp:     () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
    onPointerLeave:  () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
    onPointerCancel: () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
  });

  return (
    <div className="mb-5">
      <div className="text-xs text-muted-foreground/70 mb-2 font-medium">Hotbar <span className="opacity-50">— press 1–9 to use</span></div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }, (_, i) => {
          const item = bagSlots[i] ?? null;
          const isSelected = item ? selectedItemId === item.id : false;
          const kindEmoji = activeKindEmoji(item?.activeKind);
          const bankDupes = item
            ? bank.filter(b => !b.isEquipment && !b.consumed && b.emoji === item.emoji).length
            : 0;
          return (
            <button
              key={i}
              onClick={() => {
                if (item?.isVoidGhost) { onBanishGhost?.(i); return; }
                if (!item) {
                  if (selectedItemId) { onMove(selectedItemId, i); onSelect(null); }
                } else if (isSelected) {
                  onSelect(null);
                } else if (selectedItemId) {
                  onMove(selectedItemId, i);
                  onSelect(null);
                } else {
                  onSelect(item.id);
                }
              }}
              {...itemInspectProps(item)}
              title={item ? `[${i + 1}] ${item.name}: ${item.description.replace(/ · Bag: [^·]+$/, '')}${getPassiveTooltipSuffix(item)}${bankDupes > 0 ? ` · ${bankDupes} more in Bank` : ''}` : `Empty slot ${i + 1}`}
              className={`relative aspect-square rounded border flex items-center justify-center text-xl transition-all
                ${focusedBagIdx === i ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-black/50' : ''}
                ${item?.isVoidGhost ? 'opacity-40 border-violet-400/40 bg-violet-950/20 cursor-pointer' : !item
                  ? 'border-border/20 bg-black/20 cursor-default'
                  : isSelected
                    ? 'border-green-400 bg-green-900/30 scale-105 shadow-[0_0_8px_rgba(74,222,128,0.4)]'
                    : item.activeKind
                        ? 'border-amber-600/40 bg-card hover:border-amber-400 cursor-pointer'
                        : 'border-border bg-card hover:border-primary cursor-pointer'}`}
            >
              {item ? item.emoji : null}
              <span className={`absolute top-0.5 left-1 text-[8px] font-bold leading-none ${item ? 'text-muted-foreground/60' : 'text-muted-foreground/20'}`}>{i + 1}</span>
              {item?.isVoidGhost && <span className="absolute bottom-0.5 left-0.5 text-[8px] leading-none">👤</span>}
              {item && kindEmoji && (
                <span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none">{kindEmoji}</span>
              )}
              {item?.charges !== undefined && item.charges >= 0 && (
                <span className="absolute top-0.5 right-0.5 text-[7px] text-amber-400/80 font-bold leading-none">×{item.charges}</span>
              )}
              {item && !item.isEquipment && !kindEmoji && (item.stackCount ?? 0) > 1 && (
                <span className="absolute bottom-0.5 right-0.5 text-[8px] text-emerald-400 font-bold leading-none">×{item.stackCount}</span>
              )}
              {item && !kindEmoji && bankDupes > 0 && (
                <span className="absolute bottom-0.5 left-0.5 text-[8px] text-sky-400 font-bold leading-none">+{bankDupes}</span>
              )}
            </button>
          );
        })}
      </div>
      <ActivePassivesPanel bagSlots={bagSlots} />
    </div>
  );
}
