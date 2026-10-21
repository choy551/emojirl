import { useRef } from 'react';
import { EmojiItem } from '../game/types';
import { getPassiveTooltipSuffix } from '../game/passives';
import { rarityTooltipSuffix } from '../game/dropTable';
import { BAG_LONG_PRESS_MS, resolveBagSlotClick } from '../game/bagConsume';
import { voidGhostBadge } from '../game/voidCharge';
import { activeKindEmoji } from './itemUtils';
import { ActivePassivesPanel } from './ActivePassivesPanel';

interface HotbarPanelProps {
  bagSlots: (EmojiItem | null)[];
  bank: EmojiItem[];
  selectedItemId: string | null;
  focusedBagIdx: number;
  onSelect: (itemId: string | null) => void;
  onMove: (sourceId: string, dest: string | number | 'bank') => void;
  onShowStatCard: (item: EmojiItem, opts?: { consumeSlot?: number }) => void;
  onBanishGhost?: (slot: number) => void;
  /** Mobile bag: double-tap uses the slot; long-press offers Consume. Desktop stays select-only. */
  mobileConsume?: boolean;
  onUseSlot?: (slot: number) => void;
  onConsumeRefused?: (item: EmojiItem) => void;
  /** Void unmakes charge items and money bags on double-tap. */
  asVoid?: boolean;
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
  mobileConsume = false,
  onUseSlot,
  onConsumeRefused,
  asVoid = false,
}: HotbarPanelProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ slot: number; at: number; selectOnly: boolean } | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const itemInspectProps = (item: EmojiItem | null, slotIndex: number) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!item) return;
      onShowStatCard(item, mobileConsume ? { consumeSlot: slotIndex } : undefined);
    },
    onPointerDown: (e: React.PointerEvent) => {
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (item && (touch || (mobileConsume && e.pointerType === 'mouse'))) {
        clearLongPress();
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          lastTapRef.current = null;
          onShowStatCard(item, mobileConsume ? { consumeSlot: slotIndex } : undefined);
        }, BAG_LONG_PRESS_MS);
      }
    },
    onPointerUp:     () => { clearLongPress(); },
    onPointerLeave:  () => { clearLongPress(); },
    onPointerCancel: () => { clearLongPress(); },
  });

  return (
    <div className="mb-5">
      <div className="text-xs text-muted-foreground/70 mb-2 font-medium">Hotbar <span className="opacity-50">{mobileConsume ? '— double-tap to consume · hold for details' : '— press 1–9 to use'}</span></div>
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
                if (item?.isVoidGhost) {
                  lastTapRef.current = null;
                  onBanishGhost?.(i);
                  return;
                }
                if (mobileConsume) {
                  const decision = resolveBagSlotClick({
                    mobile: true,
                    slot: i,
                    item,
                    selectedItemId,
                    now: Date.now(),
                    last: lastTapRef.current,
                    asVoid,
                  });
                  lastTapRef.current = decision.last;
                  if (decision.action === 'use' && onUseSlot) {
                    onSelect(null);
                    onUseSlot(i);
                    return;
                  }
                  if (decision.action === 'refuse') {
                    if (item) onConsumeRefused?.(item);
                    return;
                  }
                }
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
              {...(mobileConsume ? { style: { touchAction: 'manipulation' as const } } : {})}
              {...itemInspectProps(item, i)}
              title={item ? `[${i + 1}] ${item.name}: ${item.description.replace(/ · Bag: [^·]+$/, '')}${getPassiveTooltipSuffix(item)}${bankDupes > 0 ? ` · ${bankDupes} more in Bank` : ''}${rarityTooltipSuffix(item)}` : `Empty slot ${i + 1}`}
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
              {item?.isVoidGhost && (
                <span data-testid={`ghost-stack-${item.emoji}`} className="absolute top-0.5 right-0.5 text-[8px] text-violet-300 font-bold leading-none">{voidGhostBadge(item)}</span>
              )}
              {item && kindEmoji && (
                <span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none">{kindEmoji}</span>
              )}
              {item?.charges !== undefined && item.charges >= 0 && !item.isVoidGhost && (
                <span className="absolute top-0.5 right-0.5 text-[7px] text-amber-400/80 font-bold leading-none">×{item.charges}</span>
              )}
              {item && !item.isVoidGhost && !item.isEquipment && !kindEmoji && (item.stackCount ?? 0) > 1 && (
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
