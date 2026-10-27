import { Player, EmojiItem, EquipSlot } from '../game/types';
import { canEquipInSlot, canEquipItem, equipRestrictionReason, legalEquipSlots, preferredEquipSlot } from './itemUtils';
import { RarityLabel } from './RarityLabel';
import { rarityTooltipSuffix } from '../game/dropTable';

interface EquipmentTabProps {
  player: Player;
  selectedItemId: string | null;
  focusedBagIdx: number;
  onEquip: (itemId: string, slot: EquipSlot) => void;
  onUnequip: (slot: EquipSlot) => void;
  onSelectItem: (id: string | null) => void;
  itemInspectProps: (item: EmojiItem | null) => object;
}

const SLOTS: { key: EquipSlot; label: string; icon: string }[] = [
  { key: 'body',      label: 'Body',       icon: '🥋' },
  { key: 'mainHand',  label: 'Main Hand',  icon: '⚔️' },
  { key: 'offHand',   label: 'Off Hand',   icon: '🛡️' },
  { key: 'accessory', label: 'Accessory',  icon: '💍' },
];

const STAT_LABELS: Record<string, string> = { attack: 'ATK', defense: 'DEF', speed: 'SPD', evasion: 'EVA', luck: 'LCK' };
const ALL_STAT_KEYS = ['attack', 'defense', 'speed', 'evasion', 'luck'] as const;

export function EquipmentTab({
  player,
  selectedItemId,
  focusedBagIdx,
  onEquip,
  onUnequip,
  onSelectItem,
  itemInspectProps,
}: EquipmentTabProps) {
  const allItems = [
    ...player.inventory.filter(i => i.isEquipment && !i.consumed),
    ...player.bank.filter(i => i.isEquipment && !i.consumed),
  ];

  const selectedItem = selectedItemId
    ? [...player.inventory, ...player.bank].find(i => i.id === selectedItemId)
    : undefined;

  return (
    <div className="space-y-3">
      {selectedItem && selectedItem.isEquipment && (() => {
        const compSlot = preferredEquipSlot(selectedItem, player.characterClass, player.equipment);
        const currentlyEquipped = compSlot ? player.equipment[compSlot] : undefined;
        const newB = selectedItem.equipBonus ?? {};
        const curB = currentlyEquipped?.equipBonus ?? {};
        const diffEntries = ALL_STAT_KEYS
          .map(k => ({ k, newVal: newB[k] ?? 0, curVal: curB[k] ?? 0, diff: (newB[k] ?? 0) - (curB[k] ?? 0) }))
          .filter(e => e.newVal !== 0 || e.curVal !== 0);
        return (
          <div className="bg-black/30 rounded-lg p-2.5 text-xs space-y-1.5 border border-primary/30">
            <div className="font-bold text-foreground flex items-center gap-1.5">{selectedItem.emoji} {selectedItem.name} <RarityLabel item={selectedItem} className="text-[9px]" /></div>
            <div className="text-muted-foreground/70 leading-relaxed">{selectedItem.description}</div>
            {diffEntries.length > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">
                  {currentlyEquipped
                    ? <>vs equipped — {currentlyEquipped.emoji} <span className="text-muted-foreground/70">{currentlyEquipped.name}</span></>
                    : 'Stat bonuses'}
                </div>
                <div className="flex flex-wrap gap-1">
                  {diffEntries.map(({ k, newVal, diff }) => {
                    const label = STAT_LABELS[k] ?? k.toUpperCase();
                    const hasCurrent = currentlyEquipped !== undefined;
                    const badgeCls = !hasCurrent || diff === 0
                      ? diff > 0 || (!hasCurrent && newVal > 0)
                        ? 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40'
                        : 'text-muted-foreground/50 bg-black/20 border-border/30'
                      : diff > 0
                        ? 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40'
                        : 'text-red-400 bg-red-900/20 border-red-800/40';
                    return (
                      <span key={k} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${badgeCls}`}>
                        {newVal > 0 ? '+' : ''}{newVal} {label}
                        {hasCurrent && diff !== 0 && (
                          <span className="ml-1 text-[9px] opacity-75">({diff > 0 ? '+' : ''}{diff})</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="text-muted-foreground/50">Slots: {selectedItem.equipSlots?.join(', ') ?? '—'}</div>
            <button onClick={() => onSelectItem(null)} className="text-muted-foreground/40 hover:text-muted-foreground text-[10px]">✕ deselect</button>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 gap-2">
        {SLOTS.map(({ key, label, icon }) => {
          const equipped = player.equipment[key];
          const slotPick = selectedItem?.isEquipment ? selectedItem : undefined;
          const canEquipSelected = slotPick ? canEquipInSlot(slotPick, player.characterClass, key) : false;
          const slotBlocked = !!slotPick && !canEquipSelected;
          const slotReason = slotBlocked ? equipRestrictionReason(slotPick, player.characterClass, key) : '';
          const bonusStr = equipped
            ? Object.entries(equipped.equipBonus ?? {})
                .filter(([, v]) => (v ?? 0) !== 0)
                .map(([k, v]) => `${(v ?? 0) > 0 ? '+' : ''}${v}${k.substring(0, 3).toUpperCase()}`)
                .join(' ')
            : '';
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              data-testid={`equip-slot-${key}`}
              aria-disabled={slotBlocked}
              onClick={() => {
                if (slotPick) {
                  onEquip(slotPick.id, key);
                  if (canEquipSelected) onSelectItem(null);
                } else if (equipped) {
                  onUnequip(key);
                }
              }}
              onKeyDown={e => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                e.stopPropagation();
                if (slotPick) {
                  onEquip(slotPick.id, key);
                  if (canEquipSelected) onSelectItem(null);
                } else if (equipped) {
                  onUnequip(key);
                }
              }}
              {...(equipped && !slotPick ? itemInspectProps(equipped) : {})}
              className={`flex items-center gap-3 rounded-lg border p-2.5 min-h-11 transition-all cursor-pointer touch-manipulation
                ${canEquipSelected
                  ? 'border-green-400 bg-green-900/20 hover:bg-green-900/40 shadow-[0_0_6px_rgba(74,222,128,0.3)]'
                  : slotBlocked
                    ? 'grayscale opacity-60 border-border/40 bg-black/30'
                    : equipped
                      ? 'border-amber-600/50 bg-amber-900/10 hover:bg-amber-900/20'
                      : 'border-border/30 bg-black/10 hover:border-border/60'}`}
              title={slotBlocked ? slotReason : equipped ? `${equipped.name}: click to unequip` : canEquipSelected ? 'Click to equip' : `${label} slot (empty)`}
            >
              <div className="text-2xl w-10 h-10 flex items-center justify-center rounded bg-black/30 border border-border/20 shrink-0">
                {equipped ? equipped.emoji : icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-muted-foreground/60 leading-none mb-0.5">{label}</div>
                {equipped ? (
                  <>
                    <div className="text-sm font-semibold text-foreground truncate">{equipped.name}</div>
                    {bonusStr && <div className="text-[10px] text-emerald-400/80 mt-0.5">{bonusStr}</div>}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground/30 italic">{canEquipSelected ? '← tap to equip' : 'Empty'}</div>
                )}
                {slotBlocked && (
                  <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">{slotReason}</p>
                )}
              </div>
              {equipped && !slotPick && <span className="text-[10px] text-muted-foreground/30 shrink-0">unequip</span>}
            </div>
          );
        })}
      </div>

      {allItems.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-muted-foreground/50 mb-1.5 font-medium">Equipment in bag / bank</div>
          <div className="flex flex-col gap-1.5">
            {allItems.map((item, eqIdx) => {
              const isSelected = selectedItemId === item.id;
              const canEquip = canEquipItem(item, player.characterClass);
              const legal = legalEquipSlots(item, player.characterClass);
              const restrictionMsg = !canEquip ? equipRestrictionReason(item, player.characterClass) : '';
              const choosesHand = canEquip && legal.length > 1;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`equip-option-${item.id}`}
                  aria-disabled={!canEquip}
                  onClick={() => {
                    if (!canEquip) {
                      const blocked = (item.equipSlots?.[0] as EquipSlot | undefined) ?? 'mainHand';
                      onEquip(item.id, blocked);
                      return;
                    }
                    if (choosesHand && !isSelected) {
                      onSelectItem(item.id);
                      return;
                    }
                    const targetSlot = preferredEquipSlot(item, player.characterClass, player.equipment);
                    if (!targetSlot) return;
                    onEquip(item.id, targetSlot);
                    onSelectItem(null);
                  }}
                  {...itemInspectProps(item)}
                  title={canEquip ? `${item.name}: ${item.description}${rarityTooltipSuffix(item)} — tap to equip` : restrictionMsg}
                  className={`min-h-11 w-full flex items-center gap-3 rounded-lg border px-2.5 py-2 text-left touch-manipulation transition-all
                    ${focusedBagIdx === eqIdx ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-black/50' : ''}
                    ${!canEquip
                      ? 'grayscale opacity-60 border-border/40 bg-black/25 cursor-not-allowed'
                      : isSelected
                        ? 'border-green-400 bg-green-900/30 shadow-[0_0_8px_rgba(74,222,128,0.4)] cursor-pointer'
                        : 'border-amber-600/30 bg-card hover:border-amber-400 active:scale-[0.99] cursor-pointer'}`}
                >
                  <span className="text-2xl w-10 h-10 shrink-0 flex items-center justify-center rounded bg-black/30 border border-border/20">{item.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground truncate">{item.name}</span>
                    {!canEquip && (
                      <span className="block text-[11px] leading-snug text-muted-foreground line-clamp-2">{restrictionMsg}</span>
                    )}
                  </span>
                  <span className="text-[10px] shrink-0 text-muted-foreground/70">{!canEquip ? 'Locked' : choosesHand && !isSelected ? 'Choose' : 'Equip'}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-1.5">Tap to equip. A piece that fits both hands asks you to tap a slot. Grey rows do not fit this class — the reason is on the row, and a tap logs it.</p>
        </div>
      )}
      {allItems.length === 0 && !Object.values(player.equipment).some(Boolean) && (
        <p className="text-xs text-muted-foreground/40 italic text-center py-4">No gear yet — defeat enemies to find weapons & armor.<br/><span className="text-[10px]">Active items (🔫💣🪢) go in the hotbar bag, not here.</span></p>
      )}
    </div>
  );
}
