import { Player, EmojiItem, EquipSlot } from '../game/types';
import { canEquipItem, equipRestrictionReason } from './itemUtils';
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
        const siSlots = (selectedItem.equipSlots ?? []) as EquipSlot[];
        const compSlot = siSlots.find(s => player.equipment[s]) ?? siSlots[0];
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
          const canEquipSelected = selectedItemId ? (() => {
            const si = [...player.inventory, ...player.bank].find(i => i.id === selectedItemId);
            return si?.equipSlots?.includes(key) ?? false;
          })() : false;
          const bonusStr = equipped
            ? Object.entries(equipped.equipBonus ?? {})
                .filter(([, v]) => (v ?? 0) !== 0)
                .map(([k, v]) => `${(v ?? 0) > 0 ? '+' : ''}${v}${k.substring(0, 3).toUpperCase()}`)
                .join(' ')
            : '';
          return (
            <div
              key={key}
              onClick={() => {
                if (selectedItemId && canEquipSelected) {
                  onEquip(selectedItemId, key);
                  onSelectItem(null);
                } else if (equipped) {
                  onUnequip(key);
                }
              }}
              {...(equipped ? itemInspectProps(equipped) : {})}
              className={`flex items-center gap-3 rounded-lg border p-2.5 transition-all cursor-pointer
                ${canEquipSelected
                  ? 'border-green-400 bg-green-900/20 hover:bg-green-900/40 shadow-[0_0_6px_rgba(74,222,128,0.3)]'
                  : equipped
                    ? 'border-amber-600/50 bg-amber-900/10 hover:bg-amber-900/20'
                    : 'border-border/30 bg-black/10 hover:border-border/60'}`}
              title={equipped ? `${equipped.name}: click to unequip` : canEquipSelected ? 'Click to equip' : `${label} slot (empty)`}
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
                  <div className="text-sm text-muted-foreground/30 italic">{canEquipSelected ? '← click to equip' : 'Empty'}</div>
                )}
              </div>
              {equipped && <span className="text-[10px] text-muted-foreground/30 shrink-0">unequip</span>}
            </div>
          );
        })}
      </div>

      {allItems.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-muted-foreground/50 mb-1.5 font-medium">Equipment in bag / bank</div>
          <div className="grid grid-cols-4 gap-1.5">
            {allItems.map((item, eqIdx) => {
              const isSelected = selectedItemId === item.id;
              const canEquip = canEquipItem(item, player.characterClass);
              const restrictionMsg = !canEquip ? equipRestrictionReason(item, player.characterClass) : '';
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (!canEquip) return;
                    const slots = (item.equipSlots ?? []) as EquipSlot[];
                    const emptySlot = slots.find(s => !player.equipment[s]);
                    const targetSlot = emptySlot ?? slots[0];
                    if (targetSlot) {
                      onEquip(item.id, targetSlot);
                      onSelectItem(null);
                    } else {
                      onSelectItem(isSelected ? null : item.id);
                    }
                  }}
                  {...itemInspectProps(item)}
                  title={canEquip ? `${item.name}: ${item.description}${rarityTooltipSuffix(item)} — click to equip` : `🚫 ${restrictionMsg}`}
                  className={`relative aspect-square rounded border flex items-center justify-center text-xl transition-all
                    ${focusedBagIdx === eqIdx ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-black/50' : ''}
                    ${!canEquip
                      ? 'border-red-600/60 bg-red-950/40 cursor-not-allowed opacity-70'
                      : isSelected
                        ? 'border-green-400 bg-green-900/30 scale-105 shadow-[0_0_8px_rgba(74,222,128,0.4)] cursor-pointer'
                        : 'border-amber-600/30 bg-card hover:border-amber-400 hover:scale-105 active:scale-95 cursor-pointer'}`}
                >
                  {item.emoji}
                  {!canEquip
                    ? <span className="absolute bottom-0.5 right-0.5 text-[8px] leading-none">🚫</span>
                    : <span className="absolute bottom-0.5 right-0.5 text-[8px] leading-none opacity-60">⚔️</span>
                  }
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-1.5">Click to auto-equip · or select then click a slot for manual control.</p>
        </div>
      )}
      {allItems.length === 0 && !Object.values(player.equipment).some(Boolean) && (
        <p className="text-xs text-muted-foreground/40 italic text-center py-4">No gear yet — defeat enemies to find weapons & armor.<br/><span className="text-[10px]">Active items (🔫💣🪢) go in the hotbar bag, not here.</span></p>
      )}
    </div>
  );
}
