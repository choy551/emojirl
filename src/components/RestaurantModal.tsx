import { useRef, useState } from 'react';
import { GameState, EmojiItem, EquipSlot, Equipment } from '../game/types';
import { getItemBuyPrice, getItemSellValue, addToPlayerBag, pickBestDishesToSell, restaurantCookedPrice, chefLessonPrice, chefLessonPriceLabel, chefLessonTooltip, MAX_CHEF_LESSONS, cookedHealBonus, foodHealDescription, tryDualGunsFanfare, PEACEMAKERS_LOG, playerSoftCap } from '../game/gameHelpers';
import { goldWithLuck } from '../game/softCap';
import { canEquipItem } from './itemUtils';
import { RarityLabel } from './RarityLabel';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface RestaurantModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  restaurantItems: EmojiItem[];
  setRestaurantItems: React.Dispatch<React.SetStateAction<EmojiItem[]>>;
  restaurantSoldCount: number;
  setRestaurantSoldCount: React.Dispatch<React.SetStateAction<number>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function RestaurantModal({
  gameState, setGameState, restaurantItems, setRestaurantItems,
  restaurantSoldCount, setRestaurantSoldCount, addLog, onClose,
}: RestaurantModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const sellLuck = playerSoftCap(gameState.player).raw.luck;
  const [lessonPinned, setLessonPinned] = useState(false);
  const lessonTouch = useRef(false);
  return (
    <div
      className={`fixed inset-0 z-[70] flex bg-black/60 backdrop-blur-sm ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-red-500/30 p-5 shadow-2xl w-96 max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-red-300">🔥 Restaurant</h2>
            <div className="text-[10px] text-muted-foreground mt-0.5">Food, rest & cooking — food smell draws enemies...</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1">
              <span className="text-base leading-none">💰</span>
              <span className="text-sm font-bold text-yellow-300 tabular-nums">{gameState.player.stats.gold}g</span>
            </div>
            <button onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">ESC</button>
          </div>
        </div>

        {/* For Sale — food only */}
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Chef's Menu</div>
          {restaurantItems.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">Sold out!</div>}
          <div className="flex flex-col gap-1.5">
            {restaurantItems.map(item => {
              const price = getItemBuyPrice(item, gameState.currentFloor);
              const canAfford = gameState.player.stats.gold >= price;
              return (
                <div key={item.id} className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                  <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold leading-tight flex items-center gap-1.5">{item.name}{item.isCooked ? ' ✨' : ''} <RarityLabel item={item} className="text-[9px]" /></div>
                    <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none">{foodHealDescription(item, gameState.chefLessonCount ?? 0, gameState.player.stats.maxHp)}</div>
                  </div>
                  <button
                    disabled={!canAfford}
                    onClick={() => {
                      let restAutoEquippedSlot: EquipSlot | null = null;
                      let peacemakers = false;
                      setGameState(prev => {
                        if (!prev) return prev;
                        if (prev.player.stats.gold < price) return prev;
                        const boughtItem = { ...item, id: `rest-bought-${Math.random().toString(36).slice(2)}` };
                        const newGold = prev.player.stats.gold - price;
                        if (boughtItem.ammoAmount) {
                          return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, ammo: (prev.player.ammo ?? 0) + boughtItem.ammoAmount } };
                        }
                        const isUnequippable = boughtItem.isEquipment && !canEquipItem(boughtItem, prev.player.characterClass);
                        if (isUnequippable) {
                          return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, bank: [...prev.player.bank, boughtItem] } };
                        }
                        if (boughtItem.isEquipment) {
                          const slots = (boughtItem.equipSlots ?? []) as EquipSlot[];
                          const emptySlot = slots.find(s => !prev.player.equipment[s]);
                          if (emptySlot) {
                            restAutoEquippedSlot = emptySlot;
                            const nextEquipment = { ...prev.player.equipment, [emptySlot]: boughtItem };
                            const fan = tryDualGunsFanfare({
                              characterClass: prev.player.characterClass,
                              prevEquipment: prev.player.equipment,
                              nextEquipment,
                              alreadyDone: prev.dualGunsFanfareDone,
                            });
                            if (fan.fired) peacemakers = true;
                            return {
                              ...prev,
                              ...(fan.done ? { dualGunsFanfareDone: true } : {}),
                              player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, equipment: nextEquipment },
                            };
                          }
                        }
                        const { inventory, bank } = addToPlayerBag(prev.player, boughtItem);
                        return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, inventory, bank } };
                      });
                      if (peacemakers) addLog(PEACEMAKERS_LOG);
                      addLog(restAutoEquippedSlot
                        ? `🔥 Bought ${item.emoji} ${item.name} for ${price}g — auto-equipped to ${restAutoEquippedSlot} slot!`
                        : `🔥 Bought ${item.emoji} ${item.name} for ${price}g!`);
                      setRestaurantItems(prev => prev.filter(i => i.id !== item.id));
                    }}
                    className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                      canAfford
                        ? 'bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30'
                        : 'bg-secondary/10 border-border/30 text-red-400/60 cursor-not-allowed'
                    }`}
                  >
                    {price}g
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {(() => {
          const n = gameState.chefLessonCount ?? 0;
          const cost = chefLessonPrice(n, gameState.currentFloor);
          const priceLabel = chefLessonPriceLabel(n, gameState.currentFloor);
          const master = n >= MAX_CHEF_LESSONS;
          const canAfford = gameState.player.stats.gold >= cost;
          const maxHp = gameState.player.stats.maxHp;
          const tip = chefLessonTooltip(n, maxHp);
          const purchase = () => {
            const owned = gameState.chefLessonCount ?? 0;
            if (owned >= MAX_CHEF_LESSONS) return;
            const lessonCost = chefLessonPrice(owned, gameState.currentFloor);
            if (gameState.player.stats.gold < lessonCost) return;
            setGameState(prev => {
              if (!prev) return prev;
              const now = prev.chefLessonCount ?? 0;
              if (now >= MAX_CHEF_LESSONS) return prev;
              const price = chefLessonPrice(now, prev.currentFloor);
              if (prev.player.stats.gold < price) return prev;
              return {
                ...prev,
                chefLessonCount: now + 1,
                player: {
                  ...prev.player,
                  stats: { ...prev.player.stats, gold: prev.player.stats.gold - price },
                },
              };
            });
            addLog(`🧑‍🍳 Chef's Lesson ${owned + 1}/5! Cooked dishes heal & sell better run-wide.`);
            setLessonPinned(false);
          };
          return (
            <div className="group relative mb-4">
              <button
                type="button"
                data-testid="chef-lesson"
                aria-expanded={lessonPinned}
                aria-describedby="chef-lesson-tip"
                onPointerDown={(e) => { lessonTouch.current = e.pointerType === 'touch' || e.pointerType === 'pen'; }}
                onClick={() => {
                  const tapPin = lessonTouch.current || (typeof window !== 'undefined' && (
                    window.matchMedia('(hover: none)').matches
                    || window.matchMedia('(pointer: coarse)').matches
                    || window.matchMedia('(max-width: 767px)').matches
                  ));
                  lessonTouch.current = false;
                  if (tapPin) {
                    setLessonPinned(true);
                    return;
                  }
                  purchase();
                }}
                className={`w-full text-left text-xs font-bold px-3 py-2 rounded-lg border transition-colors ${
                  master
                    ? 'bg-secondary/10 border-border/30 text-muted-foreground/70'
                    : canAfford
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25'
                      : 'bg-secondary/10 border-border/30 text-red-400/70'
                }`}
              >
                {master
                  ? "🧑‍🍳 You're already a Master Chef!"
                  : `🧑‍🍳 Chef's Lesson (${n}/5) — ${priceLabel}`}
              </button>
              <div
                id="chef-lesson-tip"
                role="tooltip"
                data-testid="chef-lesson-tip"
                className={`mt-1 rounded-md border border-border bg-popover px-2.5 py-2 text-left text-[11px] font-normal normal-case leading-snug text-popover-foreground shadow-lg ${
                  lessonPinned ? 'block' : 'hidden group-hover:block'
                }`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <p>{tip.summary}</p>
                <p className="mt-1 font-semibold text-foreground">Lessons {tip.current.lessons}/{tip.current.maxLessons}</p>
                {tip.current.lessons === 0 ? (
                  <p>No cooking bonus yet.</p>
                ) : (
                  <p>Cooked eat +{tip.current.eatBonusHp} HP · cooked sell +{tip.current.sellFlatGold}g and +{tip.current.sellPercent}%</p>
                )}
                {tip.next ? (
                  <p className="mt-1">Next lesson adds +{tip.nextEatDelta} HP eaten, +{tip.nextSellFlat}g and +{tip.nextSellPercent}% sold.</p>
                ) : (
                  <p className="mt-1">No further lessons.</p>
                )}
                {lessonPinned && (
                  <div className="mt-1.5 flex gap-2">
                    {!master && (
                      <button
                        type="button"
                        data-testid="chef-lesson-buy"
                        disabled={!canAfford}
                        onClick={(e) => { e.stopPropagation(); purchase(); }}
                        className="text-[10px] font-semibold text-amber-200 disabled:text-red-400/80"
                      >
                        {canAfford ? `Learn — ${priceLabel}` : `Need ${cost}g`}
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="chef-lesson-dismiss"
                      className="text-[10px] font-semibold text-primary"
                      onClick={(e) => { e.stopPropagation(); setLessonPinned(false); }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
              {n > 0 && (
                <div className="text-[10px] text-muted-foreground mt-1 px-1">
                  Cooked eat +{cookedHealBonus(n, maxHp)} HP · cooked sell +{10 * n}g and +{10 * n}%
                </div>
              )}
            </div>
          );
        })()}

        {/* Sell — 250% for cooked food, 5-item limit */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Sell Your Food <span className="text-red-400">(250% for cooked!)</span>
            {restaurantSoldCount > 0 && restaurantSoldCount < 5 && (
              <span className="ml-2 text-amber-400/80 normal-case font-normal">{restaurantSoldCount}/5 cooked sold</span>
            )}
          </div>
          {restaurantSoldCount >= 5 ? (
            <div className="text-center py-4 px-3 bg-secondary/20 border border-border/40 rounded-lg">
              <div className="text-lg mb-1">🍽️</div>
              <div className="text-xs font-semibold text-amber-300">Thank you for cooking for us — we're closed now!</div>
              <div className="text-[10px] text-muted-foreground mt-1">The kitchen is full. Rest here for +2 HP/turn.</div>
            </div>
          ) : (() => {
            const sellable = [
              ...gameState.player.inventory.filter(i => !i.consumed && i.healAmount !== undefined),
              ...gameState.player.bank.filter(i => !i.consumed && i.healAmount !== undefined),
            ];
            if (sellable.length === 0) return <div className="text-xs text-muted-foreground text-center py-3">Nothing to sell.</div>;
            const isLastCooked = restaurantSoldCount === 4;
            const lessons = gameState.chefLessonCount ?? 0;
            const bestBatch = pickBestDishesToSell(sellable, restaurantSoldCount);
            const bestGold = goldWithLuck(bestBatch.reduce((s, i) => s + restaurantCookedPrice(i, lessons), 0), sellLuck);
            const sellBestDishes = () => {
              if (bestBatch.length === 0) {
                addLog('🍽️ No cooked dishes to sell.');
                return;
              }
              const soldIds = new Set(bestBatch.map(i => i.id));
              const gold = bestGold;
              const newCount = restaurantSoldCount + bestBatch.length;
              setGameState(prev => {
                if (!prev) return prev;
                const inventory = prev.player.inventory.filter(i => !soldIds.has(i.id));
                const bank = prev.player.bank.filter(i => !soldIds.has(i.id));
                return {
                  ...prev,
                  player: {
                    ...prev.player,
                    stats: { ...prev.player.stats, gold: prev.player.stats.gold + gold },
                    inventory,
                    bank,
                  },
                };
              });
              setRestaurantSoldCount(newCount);
              if (newCount >= 5) {
                addLog(`🍽️ Sold ${bestBatch.length} best dish${bestBatch.length !== 1 ? 'es' : ''} for ${gold}g ✨ — kitchen is now closed, thank you!`);
              } else {
                addLog(`🍽️ Sold ${bestBatch.length} best dish${bestBatch.length !== 1 ? 'es' : ''} for ${gold}g (${newCount}/5 cooked).`);
              }
            };
            return (
              <div className="flex flex-col gap-1.5">
                {bestBatch.length > 0 && (
                  <button
                    type="button"
                    onClick={sellBestDishes}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 transition-colors text-xs font-bold"
                  >
                    <span>
                      {restaurantSoldCount >= 4
                        ? '🍽️ Sell Best Dish (close kitchen)'
                        : '🍽️ Sell Best Dishes (to 4/5)'}
                    </span>
                    <span className="text-emerald-300">+{bestGold}g ✨</span>
                  </button>
                )}
                {isLastCooked && (
                  <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 leading-snug">
                    ⚠️ Selling one more cooked dish will close the kitchen!
                  </div>
                )}
                {sellable.map(item => {
                  const isCooked = item.isCooked || !!item.cookedBuff;
                  const sellMul = isCooked ? 2.5 : 1;
                  const price = goldWithLuck(isCooked
                    ? restaurantCookedPrice(item, gameState.chefLessonCount ?? 0)
                    : getItemSellValue(item, sellMul), sellLuck);
                  const inBank = gameState.player.bank.some(i => i.id === item.id);
                  return (
                    <div key={item.id} className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                      <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold leading-tight flex items-center gap-1.5">{item.name}{inBank ? ' (bank)' : ''}{item.isCooked ? ' ✨' : ''} <RarityLabel item={item} className="text-[9px]" /></div>
                        <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none">{foodHealDescription(item, gameState.chefLessonCount ?? 0, gameState.player.stats.maxHp)}</div>
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
                          if (isCooked) {
                            const newCount = restaurantSoldCount + 1;
                            setRestaurantSoldCount(newCount);
                            if (newCount >= 5) {
                              addLog(`🏪 Sold ${item.emoji} ${item.name} for ${price}g ✨ — kitchen is now closed, thank you!`);
                            } else {
                              addLog(`🔥 Sold ${item.emoji} ${item.name} for ${price}g (cooked bonus!)${newCount === 4 ? ' — 1 more until kitchen closes!' : ''}`);
                            }
                          } else {
                            addLog(`🔥 Sold ${item.emoji} ${item.name} for ${price}g!`);
                          }
                        }}
                        className="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                      >
                        +{price}g {sellMul > 1 && <span className="text-red-400">✨</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <CloseHintButton onClose={dismiss} />
      </div>
    </div>
  );
}
