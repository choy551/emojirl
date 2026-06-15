import { useRef } from 'react';
import { EmojiItem, Player } from '../game/types';
import { hasBagPassive, getPassiveTooltipSuffix, isStackableBagPassive, getStackableBonusLabel } from '../game/passives';
import { isNonStackableBagPassiveDuplicate, isActiveKindDuplicate } from '../game/gameHelpers';
import { activeKindEmoji } from './itemUtils';
import { ActivePassivesPanel } from './ActivePassivesPanel';

interface BankPanelProps {
  player: Player;
  bagSlots: (EmojiItem | null)[];
  selectedItemId: string | null;
  focusedBagIdx: number;
  onSelect: (itemId: string | null) => void;
  onMove: (sourceId: string, dest: string | number | 'bank') => void;
  onConsume: (itemId: string) => void;
  onClose: () => void;
  onShowStatCard: (item: EmojiItem) => void;
}

export function BankPanel({
  player,
  bagSlots,
  selectedItemId,
  focusedBagIdx,
  onSelect,
  onMove,
  onConsume,
  onShowStatCard,
}: BankPanelProps) {
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
    <div>
      {/* Mini hotbar reference — 1-9 slots at a glance */}
      <div className="mb-3">
        <div className="text-[10px] text-muted-foreground/50 mb-1 font-medium uppercase tracking-wide">🎒 Hotbar (1–9)</div>
        <div className="grid grid-cols-9 gap-0.5">
          {Array.from({ length: 9 }, (_, i) => {
            const hItem = bagSlots[i] ?? null;
            const hKind = activeKindEmoji(hItem?.activeKind);
            const hBankDupes = hItem
              ? player.bank.filter(b => !b.isEquipment && !b.consumed && b.emoji === hItem.emoji).length
              : 0;
            return (
              <div
                key={i}
                title={hItem ? `[${i + 1}] ${hItem.name}: ${hItem.description.replace(/ · Bag: [^·]+$/, '')}${getPassiveTooltipSuffix(hItem)}${hBankDupes > 0 ? ` · ${hBankDupes} more in Bank` : ''}` : `Empty slot ${i + 1}`}
                className={`relative aspect-square rounded flex items-center justify-center text-sm border select-none
                  ${hItem ? 'border-border/60 bg-black/30' : 'border-border/20 bg-black/10'}`}
              >
                {hItem ? hItem.emoji : <span className="text-[8px] text-muted-foreground/20">{i + 1}</span>}
                {hItem && !hKind && (hItem.stackCount ?? 0) > 1 && (
                  <span className="absolute bottom-0 right-0.5 text-[7px] text-emerald-400 font-bold leading-none">×{hItem.stackCount}</span>
                )}
                {hItem && hKind && <span className="absolute bottom-0 right-0.5 text-[7px] leading-none">{hKind}</span>}
                {hItem && hItem.charges !== undefined && hItem.charges >= 0 && (
                  <span className="absolute top-0 right-0.5 text-[7px] text-amber-400/80 font-bold leading-none">×{hItem.charges}</span>
                )}
                {hItem && !hKind && hBankDupes > 0 && (
                  <span className="absolute bottom-0 left-0.5 text-[7px] text-sky-400 font-bold leading-none">+{hBankDupes}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-muted-foreground/70 mb-2 font-medium">
        Bank <span className="opacity-50">— overflow storage ({player.bank.filter(i => !i.isEquipment).length} items)</span>
      </div>

      {/* Selected-item action panel */}
      {selectedItemId && player.bank.some(i => i.id === selectedItemId && !i.isEquipment) && (() => {
        const si = player.bank.find(i => i.id === selectedItemId)!;
        const canConsume = !si.isEquipment && !si.activeKind && (si.healAmount !== undefined || (si as any).effect || si.bagPassive);
        const needsHotbar = !si.isEquipment && !!si.activeKind;
        const alreadyActiveNonStack = (si.bagPassive?.nonStackable ?? false) && isNonStackableBagPassiveDuplicate(si, player.inventory);
        const alreadyActiveKind = !!si.activeKind && isActiveKindDuplicate(si, player.inventory);
        const wouldBeDuplicate = alreadyActiveNonStack || alreadyActiveKind;
        return (
          <div className="bg-black/30 rounded-lg p-2.5 text-xs space-y-1 border border-primary/30 mb-3">
            <div className="font-bold text-foreground">{si.emoji} {si.name}</div>
            <div className="text-muted-foreground/70 leading-snug">{si.description}</div>
            {hasBagPassive(si) && (() => {
              const alreadyActive = (si.bagPassive?.nonStackable ?? false)
                ? isNonStackableBagPassiveDuplicate(si, player.inventory)
                : false;
              return alreadyActive
                ? <div className="text-zinc-400/70 text-[10px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500/70 inline-block shrink-0" />Passive: {si.bagPassive!.description} <span className="text-zinc-500">(already active)</span></div>
                : <div className="text-green-400/80 text-[10px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_3px_rgba(74,222,128,0.9)] inline-block shrink-0" />Passive: {si.bagPassive!.description}</div>;
            })()}
            {needsHotbar && !wouldBeDuplicate && <div className="text-amber-400/70 text-[10px]">Pull to hotbar to activate this item.</div>}
            {needsHotbar && wouldBeDuplicate && <div className="text-amber-400/70 text-[10px]">You already carry this active ability.</div>}
            <div className="flex gap-1.5 pt-0.5">
              {!si.isEquipment && !wouldBeDuplicate && (
                <button
                  onClick={() => {
                    const bagNonHeal = player.inventory.filter(i => i.healAmount === undefined && i.ammoAmount === undefined);
                    onMove(si.id, bagNonHeal.length < 9 ? bagNonHeal.length : 0);
                    onSelect(null);
                  }}
                  className="flex-1 text-[10px] py-1 rounded bg-secondary/40 border border-border/60 text-muted-foreground hover:bg-secondary/60 transition-colors"
                >Pull to Hotbar</button>
              )}
              {canConsume && (
                <button
                  onClick={() => { onConsume(si.id); onSelect(null); }}
                  className="flex-1 text-[10px] py-1 rounded bg-primary/20 border border-primary/40 text-foreground font-semibold hover:bg-primary/30 transition-colors"
                >✨ Consume</button>
              )}
              <button
                onClick={() => onSelect(null)}
                className="text-[10px] px-2 py-1 rounded bg-black/20 border border-border/30 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >✕</button>
            </div>
          </div>
        );
      })()}

      {player.bank.filter(i => !i.isEquipment).length === 0 ? (
        <p className="text-xs text-muted-foreground/40 italic">Empty — bag items overflow here when bag is full</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {(() => {
            // Stack identical items (same name+emoji+kind) into one cell
            const nonEq = player.bank.filter(i => !i.isEquipment);
            type BankGroup = { rep: EmojiItem; items: EmojiItem[]; totalCharges: number };
            const groups: BankGroup[] = [];
            const seen = new Set<string>();
            for (const item of nonEq) {
              const key = `${item.name}|${item.emoji}|${item.activeKind ?? ''}`;
              if (!seen.has(key)) {
                seen.add(key);
                const grp = nonEq.filter(i => `${i.name}|${i.emoji}|${i.activeKind ?? ''}` === key);
                groups.push({ rep: grp[0], items: grp, totalCharges: grp.reduce((s, i) => s + (i.charges ?? 1), 0) });
              }
            }
            return groups.map(({ rep: item, items, totalCharges }, bankIdx) => {
              const isSelected = items.some(i => i.id === selectedItemId);
              const kindEmoji = activeKindEmoji(item.activeKind);
              const itemHasBagPassive = hasBagPassive(item);
              const passiveAlreadyActive = itemHasBagPassive && (item.bagPassive?.nonStackable ?? false)
                ? player.inventory.some(i => !i.consumed && !i.isEquipment && i.emoji === item.emoji && i.bagPassive)
                : false;
              const passiveComputedSuffix = itemHasBagPassive
                ? passiveAlreadyActive
                  ? `${getPassiveTooltipSuffix(item)} (already active in hotbar)`
                  : getPassiveTooltipSuffix(item)
                : '';
              const stackLabel = items.length > 1 ? `×${totalCharges}` : item.charges !== undefined && item.charges >= 0 ? `×${item.charges}` : null;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isSelected) { onSelect(null); }
                    else if (selectedItemId) { onMove(selectedItemId, item.id); onSelect(null); }
                    else { onSelect(item.id); }
                  }}
                  {...itemInspectProps(item)}
                  title={`${item.name}${items.length > 1 ? ` ×${items.length}` : ''}: ${item.description}${passiveComputedSuffix}${isStackableBagPassive(item) ? ' · Stackable — compounding power per copy' : ''}`}
                  className={`relative aspect-square rounded border flex items-center justify-center text-xl transition-all cursor-pointer
                    ${focusedBagIdx === bankIdx ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-black/50' : ''}
                    ${isSelected
                      ? 'border-green-400 bg-green-900/30 scale-105 shadow-[0_0_8px_rgba(74,222,128,0.4)]'
                      : item.isEquipment
                        ? 'border-amber-600/40 bg-card hover:border-amber-400'
                        : item.activeKind
                          ? 'border-amber-600/40 bg-card hover:border-amber-400'
                          : isStackableBagPassive(item)
                            ? 'border-emerald-500/50 bg-emerald-900/10 hover:border-emerald-400'
                            : 'border-border bg-card hover:border-primary'}`}
                >
                  {item.emoji}
                  {item.isEquipment && <span className="absolute bottom-0.5 right-0.5 text-[8px] leading-none opacity-60">⚔️</span>}
                  {!item.isEquipment && kindEmoji && (
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none">{kindEmoji}</span>
                  )}
                  {stackLabel && (
                    <span className="absolute top-0.5 right-0.5 text-[7px] text-amber-400/80 font-bold leading-none">{stackLabel}</span>
                  )}
                  {!item.isEquipment && !kindEmoji && !item.charges && (item.stackCount ?? 0) > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 text-[8px] text-emerald-400 font-bold leading-none">×{item.stackCount}</span>
                  )}
                  {isStackableBagPassive(item) && (() => {
                    const label = getStackableBonusLabel(item);
                    return label ? (
                      <span className="absolute bottom-0 left-0 right-0 text-center text-[6px] text-emerald-300/90 font-bold leading-none bg-black/50 rounded-b px-0.5 py-[1px]">{label}</span>
                    ) : null;
                  })()}
                </button>
              );
            });
          })()}
        </div>
      )}

      {player.bank.some(i => !i.isEquipment && isStackableBagPassive(i)) && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
            <span className="shrink-0 w-2.5 h-2.5 rounded-sm border border-emerald-500/60 bg-emerald-900/30 inline-block" />
            <span>Green border = stackable passive — compounding power per copy</span>
          </div>
        </div>
      )}

      <ActivePassivesPanel bagSlots={bagSlots} />
    </div>
  );
}
