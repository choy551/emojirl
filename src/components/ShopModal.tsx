import { GameState, EmojiItem, EquipSlot, Equipment } from '../game/types';
import { getItemBuyPrice, getItemSellValue, addToBag } from '../game/gameHelpers';
import { canEquipItem } from './itemUtils';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface ShopModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  shopItems: EmojiItem[];
  setShopItems: React.Dispatch<React.SetStateAction<EmojiItem[]>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function ShopModal({ gameState, setGameState, shopItems, setShopItems, addLog, onClose }: ShopModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  return (
    <div
      className={`fixed inset-0 z-[70] flex bg-black/60 backdrop-blur-sm ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-yellow-500/30 p-5 shadow-2xl w-96 max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-yellow-300">🏪 Emoji Shop</h2>
            <div className="text-[10px] text-muted-foreground mt-0.5">Buy & sell emojis for gold</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1">
              <span className="text-base leading-none">💰</span>
              <span className="text-sm font-bold text-yellow-300 tabular-nums">{gameState.player.stats.gold}g</span>
            </div>
            <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">ESC</button>
          </div>
        </div>

        {/* For Sale */}
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">For Sale</div>
          {shopItems.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">Sold out!</div>}
          <div className="flex flex-col gap-1.5">
            {shopItems.map(item => {
              const price = getItemBuyPrice(item, gameState.currentFloor);
              const canAfford = gameState.player.stats.gold >= price;
              const nonHealBagCount = gameState.player.inventory.filter(i => i.healAmount === undefined && i.ammoAmount === undefined).length;
              const bagFull = !item.isEquipment && item.healAmount === undefined && item.ammoAmount === undefined && nonHealBagCount >= 9;
              return (
                <div key={item.id} className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                  <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold leading-tight">{item.name}</div>
                    <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none">{item.description}</div>
                  </div>
                  <button
                    disabled={!canAfford || bagFull}
                    onClick={() => {
                      let sentToBank = false;
                      let shopAmmoTotal: number | null = null;
                      let autoEquippedSlot: EquipSlot | null = null;
                      setGameState(prev => {
                        if (!prev) return prev;
                        if (prev.player.stats.gold < price) return prev;
                        const boughtItem = { ...item, id: `bought-${Math.random().toString(36).slice(2)}` };
                        const newGold = prev.player.stats.gold - price;
                        if (boughtItem.ammoAmount) {
                          const newAmmo = (prev.player.ammo ?? 0) + boughtItem.ammoAmount;
                          shopAmmoTotal = newAmmo;
                          return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, ammo: newAmmo } };
                        }
                        const isUnequippable = boughtItem.isEquipment && !canEquipItem(boughtItem, prev.player.characterClass);
                        if (isUnequippable) {
                          sentToBank = true;
                          return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, bank: [...prev.player.bank, boughtItem] } };
                        }
                        if (boughtItem.isEquipment) {
                          const slots = (boughtItem.equipSlots ?? []) as EquipSlot[];
                          const emptySlot = slots.find(s => !prev.player.equipment[s]);
                          if (emptySlot) {
                            autoEquippedSlot = emptySlot;
                            return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, equipment: { ...prev.player.equipment, [emptySlot]: boughtItem } } };
                          }
                        }
                        const { inventory, bank } = addToBag(prev.player.inventory, prev.player.bank, boughtItem);
                        return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, inventory, bank } };
                      });
                      if (shopAmmoTotal !== null) {
                        const shopAmmoWord = item.emoji === '🪙' ? 'bullets' : 'arrows';
                        addLog(`🏪 ${item.emoji} +${item.ammoAmount} ${shopAmmoWord} for ${price}g — ${shopAmmoTotal} total`);
                      } else {
                        addLog(sentToBank
                          ? `🏪 Bought ${item.emoji} ${item.name} for ${price}g — your class can't equip it, sent to bank.`
                          : autoEquippedSlot
                            ? `🏪 Bought ${item.emoji} ${item.name} for ${price}g — auto-equipped to ${autoEquippedSlot} slot!`
                            : `🏪 Bought ${item.emoji} ${item.name} for ${price}g!`);
                      }
                      setShopItems(prev => prev.filter(i => i.id !== item.id));
                    }}
                    className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                      canAfford && !bagFull
                        ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/30'
                        : bagFull
                          ? 'bg-secondary/10 border-border/30 text-orange-400/60 cursor-not-allowed'
                          : 'bg-secondary/10 border-border/30 text-red-400/60 cursor-not-allowed'
                    }`}
                  >
                    {bagFull ? 'Full' : `${price}g`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sell */}
        {(() => {
          const cls = gameState.player.characterClass;
          const allSellable = [
            ...gameState.player.inventory.filter(i => !i.consumed),
            ...gameState.player.bank.filter(i => !i.consumed),
          ];
          const souls = allSellable.filter(i => !i.healAmount && !i.ammoAmount);
          const food  = allSellable.filter(i => i.healAmount !== undefined);
          const isJunk = (i: EmojiItem) =>
            (i.isEquipment && !canEquipItem(i, cls)) ||
            (i.healAmount !== undefined && !i.isCooked && !i.cookedBuff && i.healAmount <= 4);
          const junk = allSellable.filter(isJunk);
          const junkGold = junk.reduce((s, i) => s + getItemSellValue(i), 0);

          const SellRow = ({ item }: { item: EmojiItem }) => {
            const price = getItemSellValue(item);
            const inBank = gameState.player.bank.some(i => i.id === item.id);
            return (
              <div className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold leading-tight">
                    {item.name}{inBank ? ' (bank)' : ''}
                    {item.isEquipment && !canEquipItem(item, cls) && <span className="ml-1 text-[9px] text-red-400/80 font-normal">wrong class</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none">{item.description}</div>
                </div>
                <button
                  onClick={() => {
                    setGameState(prev => {
                      if (!prev) return prev;
                      const inventory = prev.player.inventory.filter(i => i.id !== item.id);
                      const bank = prev.player.bank.filter(i => i.id !== item.id);
                      const equipment: Equipment = { ...prev.player.equipment };
                      (Object.keys(equipment) as EquipSlot[]).forEach(slot => {
                        if (equipment[slot]?.id === item.id) delete equipment[slot];
                      });
                      return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: prev.player.stats.gold + price }, inventory, bank, equipment } };
                    });
                    addLog(`💰 Sold ${item.emoji} ${item.name} for ${price}g.`);
                  }}
                  className="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                >
                  +{price}g
                </button>
              </div>
            );
          };

          return (
            <div className="space-y-3">
              {/* Sell All Junk */}
              {junk.length > 0 && (
                <button
                  onClick={() => {
                    setGameState(prev => {
                      if (!prev) return prev;
                      const junkIds = new Set(junk.map(i => i.id));
                      const inventory = prev.player.inventory.filter(i => !junkIds.has(i.id));
                      const bank = prev.player.bank.filter(i => !junkIds.has(i.id));
                      const equipment: Equipment = { ...prev.player.equipment };
                      (Object.keys(equipment) as EquipSlot[]).forEach(slot => {
                        if (equipment[slot] && junkIds.has(equipment[slot]!.id)) delete equipment[slot];
                      });
                      return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: prev.player.stats.gold + junkGold }, inventory, bank, equipment } };
                    });
                    addLog(`🗑️ Sold ${junk.length} junk item${junk.length !== 1 ? 's' : ''} for ${junkGold}g.`);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors text-xs font-bold"
                >
                  <span>🗑️ Sell All Junk ({junk.length} item{junk.length !== 1 ? 's' : ''})</span>
                  <span className="text-emerald-300">+{junkGold}g</span>
                </button>
              )}

              {/* Emojis & Equipment */}
              {souls.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Emojis &amp; Equipment</div>
                  <div className="flex flex-col gap-1.5">
                    {souls.map(item => <SellRow key={item.id} item={item} />)}
                  </div>
                </div>
              )}

              {/* Food & Healing — capped at 5 per visit */}
              {food.length > 0 && (
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Food &amp; Healing</div>
                    <div className="text-[9px] text-amber-400/70">{Math.min(food.length, 5)}/{food.length} sellable (5 max/visit)</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {food.slice(0, 5).map(item => <SellRow key={item.id} item={item} />)}
                  </div>
                </div>
              )}

              {allSellable.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-3">Nothing to sell.</div>
              )}
            </div>
          );
        })()}

        <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground text-center">
          Esc or B to close
        </div>
      </div>
    </div>
  );
}
