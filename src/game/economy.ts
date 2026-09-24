import { EmojiItem, MapGrid, Position } from './types';
import { getRandomEmojiPower, getRandomHealDrop, getAmmoDrop, getBulletDrop, getRandomActiveDrop, getRandomEquipmentDrop, cookFood, HEAL_DROPS, COOKABLE_EMOJIS } from './emojis';
import { addToBag } from './inventory';

/** Gold stolen by a 🐦‍⬛ Crow on a successful hit. Scales with dungeon floor. */
export function crowGoldSteal(floor: number, playerGold: number): number {
  if (playerGold <= 0) return 0;
  const flat = floor;
  const pct = 0.10 + (floor - 1) * 0.015; // D:1 → 10%, +1.5% per floor
  const stolen = Math.floor(flat + playerGold * pct);
  return Math.min(playerGold, Math.max(1, stolen));
}

/** D:1 → 100–200g, then +50g to the band per floor. */
export function moneyBagSellValue(floor: number): number {
  const f = Math.max(1, floor);
  return 100 + (f - 1) * 50 + Math.floor(Math.random() * 101);
}

export function getItemSellValue(item: EmojiItem, multiplier = 1, floor = 1): number {
  if (item.isMoneyBag || item.emoji === '💰') return moneyBagSellValue(floor);
  if (item.isEquipment) return 15 * multiplier;
  if (item.activeKind) return 10 * multiplier;
  if (item.healAmount !== undefined) {
    const base = Math.max(2, item.healAmount);
    const cookedMul = (item.isCooked || item.cookedBuff) ? 2 : 1;
    return Math.round(base * cookedMul * multiplier);
  }
  if (item.emoji === '⛵') return Math.round(50 * multiplier);
  if (item.bagPassive) return Math.round(12 * multiplier);
  return Math.round(5 * multiplier);
}

export const COOKED_OVERFLOW_THRESHOLD = 12;

export function isCookedHeal(i: EmojiItem): boolean {
  return i.healAmount !== undefined && !i.consumed && (!!i.isCooked || !!i.cookedBuff);
}

export function cookedHealCount(items: EmojiItem[]): number {
  return items.filter(isCookedHeal).length;
}

/** Weak dedicated heals (onion) plus, when overflow, potions/hearts. Never cooked or raw cookables. */
export function isHealJunk(i: EmojiItem, overflowHeals: boolean): boolean {
  if (i.healAmount === undefined || i.consumed) return false;
  if (i.isCooked || i.cookedBuff) return false;
  if (COOKABLE_EMOJIS.has(i.emoji)) return false;
  if (i.healAmount <= 4) return true;
  return overflowHeals;
}

export const RESTAURANT_COOKED_SELL_LIMIT = 5;

export function isCookedDish(i: EmojiItem): boolean {
  return i.healAmount !== undefined && !i.consumed && (!!i.isCooked || !!i.cookedBuff);
}

export function restaurantCookedPrice(i: EmojiItem, lessons = 0): number {
  return restaurantCookedSellPrice(i, lessons);
}

export const MAX_CHEF_LESSONS = 5;

export function chefLessonCost(floor: number): number {
  const f = Math.max(1, floor);
  return Math.max(1000 + (f - 1) * 250, f * 350);
}

export function cookedHealBonus(n: number, maxHp: number): number {
  if (n <= 0) return 0;
  return Math.floor(maxHp * 0.05 * n) + 3 * n;
}

export function cookedSellBonus(n: number, baseCookedSellPrice: number): number {
  if (n <= 0) return 0;
  return 10 * n + Math.floor(baseCookedSellPrice * 0.10 * n);
}

export function restaurantCookedSellPrice(item: EmojiItem, lessons: number): number {
  const base = getItemSellValue(item, 2.5);
  return base + cookedSellBonus(lessons, base);
}

export function cookedEatHeal(item: EmojiItem, lessons: number, maxHp: number): number {
  let amount = item.healAmount ?? 2;
  if (item.isCooked || item.cookedBuff) {
    amount += cookedHealBonus(lessons, maxHp);
  }
  return amount;
}

/** Tooltip / stat-card HP line, including Chef's Lesson bonus on cooked dishes. */
export function foodHealLabel(item: EmojiItem, lessons: number, maxHp: number): string {
  if (item.healAmount === undefined) return '';
  const total = cookedEatHeal(item, lessons, maxHp);
  const bonus = total - item.healAmount;
  if (bonus > 0) return `+${total} HP (${item.healAmount} + ${bonus} Chef)`;
  return `+${item.healAmount} HP`;
}

/**
 * Catalog food copy with Chef's Lesson HP substituted in.
 * `includeChefNote` appends `(base + bonus Chef)` when the bonus applies.
 */
export function foodHealDescription(
  item: EmojiItem,
  lessons: number,
  maxHp: number,
  includeChefNote = true,
): string {
  if (item.healAmount === undefined) return item.description;
  const total = cookedEatHeal(item, lessons, maxHp);
  const bonus = total - item.healAmount;
  if (bonus <= 0) return item.description;
  const replaced = item.description
    .replace(/\+(\d+)\s*HP/i, `+${total} HP`)
    .replace(/Restores\s+(\d+)\s+HP/i, `Restores ${total} HP`);
  if (replaced === item.description) {
    return includeChefNote
      ? `${item.description} · ${foodHealLabel(item, lessons, maxHp)}`
      : `${item.description} · +${total} HP`;
  }
  return includeChefNote ? `${replaced} (${item.healAmount} + ${bonus} Chef)` : replaced;
}

/** Highest-priced cooked dishes to sell: fill to 4/5, or the last 1 if already at 4. */
export function pickBestDishesToSell(items: EmojiItem[], soldCount: number): EmojiItem[] {
  const remaining = RESTAURANT_COOKED_SELL_LIMIT - soldCount;
  if (remaining <= 0) return [];
  const cookedOwned = [...items]
    .filter(isCookedDish)
    .sort((a, b) => restaurantCookedPrice(b) - restaurantCookedPrice(a));
  const targetCap = soldCount >= 4 ? 5 : 4;
  const sellCount = Math.min(cookedOwned.length, Math.max(0, targetCap - soldCount));
  return cookedOwned.slice(0, sellCount);
}

export function getItemBuyPrice(item: EmojiItem, floor: number): number {
  return getItemSellValue(item) * 2 + Math.floor(floor / 2);
}

/** Slot Shrine spin cost. D1=200, D10=800, D25+=5000. */
export function slotShrineCost(floor: number): number {
  const f = Math.max(1, floor);
  if (f <= 10) return Math.round(200 + (800 - 200) * (f - 1) / 9);
  if (f >= 25) return 5000;
  return Math.round(800 + (5000 - 800) * (f - 10) / 15);
}

export type SlotTier = 'junk' | 'common' | 'uncommon' | 'rare' | 'godtier';

export const SLOT_REEL_FACE: Record<SlotTier, string> = {
  junk: '🥔', common: '🥫', uncommon: '⚡', rare: '🛡️', godtier: '👑',
};

/** r is 1..100. ≤42 junk, ≤70 common, ≤88 uncommon, ≤97 rare, else godtier. */
export function slotTierFromRoll(r: number): SlotTier {
  if (r <= 42) return 'junk';
  if (r <= 70) return 'common';
  if (r <= 88) return 'uncommon';
  if (r <= 97) return 'rare';
  return 'godtier';
}

export function rollSlotTier(rng: () => number = Math.random): SlotTier {
  const r = Math.floor(rng() * 100) + 1;
  return slotTierFromRoll(r);
}

function stampSlotItem(drop: Omit<EmojiItem, 'id' | 'consumed'>, tag: string): EmojiItem {
  return { ...drop, id: `slot-${tag}-${Math.random().toString(36).slice(2)}`, consumed: false };
}

export interface SlotPrize {
  items: EmojiItem[];
  goldGain: number;
  label: string;
}

/**
 * Weighted prize for one spin. Reels are flavor — this is not 3-match payout math.
 * `rng` returns [0, 1) and is only used for the tier's internal coin flips.
 */
export function resolveSlotPrize(
  tier: SlotTier,
  floor: number,
  cost: number,
  playerClass?: string,
  rng: () => number = Math.random,
): SlotPrize {
  const face = SLOT_REEL_FACE[tier];
  if (tier === 'junk') {
    if (rng() < 0.5) {
      const item = stampSlotItem(getRandomHealDrop(), 'heal');
      return { items: [item], goldGain: 0, label: `Junk ${face} — ${item.emoji} ${item.name}` };
    }
    const goldGain = Math.max(15, 15 + floor * 2);
    return { items: [], goldGain, label: `Junk ${face} — 🪙${goldGain}` };
  }
  if (tier === 'common') {
    const drop = playerClass === '🤠'
      ? getBulletDrop()
      : playerClass === '🧝'
        ? getAmmoDrop()
        : getRandomHealDrop();
    const item = stampSlotItem(drop, 'common');
    return { items: [item], goldGain: 0, label: `Common ${face} — ${item.emoji} ${item.name}` };
  }
  if (tier === 'uncommon') {
    const drop = rng() < 0.5 ? getRandomActiveDrop() : getRandomEmojiPower();
    const item = stampSlotItem(drop, 'unc');
    return { items: [item], goldGain: 0, label: `Uncommon ${face} — ${item.emoji} ${item.name}` };
  }
  if (tier === 'rare') {
    const item = stampSlotItem(getRandomEquipmentDrop(floor), 'eq');
    return { items: [item], goldGain: 0, label: `Rare ${face} — ${item.emoji} ${item.name}` };
  }
  const pick = rng();
  if (pick < 1 / 3) {
    const a = stampSlotItem(getRandomEquipmentDrop(floor), 'god-eq');
    const b = stampSlotItem(getRandomEquipmentDrop(floor), 'god-eq');
    const keep = getItemBuyPrice(a, floor) >= getItemBuyPrice(b, floor) ? a : b;
    return { items: [keep], goldGain: 0, label: `Godtier ${face} — ${keep.emoji} ${keep.name}` };
  }
  if (pick < 2 / 3) {
    const power = stampSlotItem(getRandomEmojiPower(), 'god-soul');
    const active = stampSlotItem(getRandomActiveDrop(), 'god-act');
    return {
      items: [power, active],
      goldGain: 0,
      label: `Godtier ${face} — ${power.emoji} ${power.name} and ${active.emoji} ${active.name}`,
    };
  }
  const goldGain = Math.round(cost * 2.5);
  return { items: [], goldGain, label: `Godtier ${face} — JACKPOT 🪙${goldGain}` };
}

/** Put prize items in the bag. Non-equipment that will not fit is cashed out. */
export function grantSlotPrizeItems(
  inventory: EmojiItem[],
  bank: EmojiItem[],
  items: EmojiItem[],
  floor: number,
): { inventory: EmojiItem[]; bank: EmojiItem[]; gold: number; logs: string[] } {
  let inv = inventory;
  let bnk = bank;
  let gold = 0;
  const logs: string[] = [];
  for (const item of items) {
    const before = bnk.length;
    const next = addToBag(inv, bnk, item);
    const added = next.bank.slice(before);
    const cashed = added.filter(it => !it.isEquipment);
    const keptEquip = added.filter(it => it.isEquipment);
    if (cashed.length > 0) {
      for (const c of cashed) {
        const copies = Math.max(1, c.stackCount ?? 1);
        const n = getItemSellValue(c, 1, floor) * copies;
        gold += n;
        logs.push(`Bag full — cashed out for 🪙${n}`);
      }
      inv = next.inventory;
      bnk = [...next.bank.slice(0, before), ...keptEquip];
    } else {
      inv = next.inventory;
      bnk = next.bank;
    }
  }
  return { inventory: inv, bank: bnk, gold, logs };
}

export function generateAmmoCacheStock(floor: number, playerClass?: string): EmojiItem[] {
  const stock: EmojiItem[] = [];
  const numStacks = 2 + (Math.random() < 0.5 ? 1 : 0);
  if (playerClass === '🤠') {
    for (let i = 0; i < numStacks; i++) {
      const bullets = getBulletDrop();
      stock.push({ ...bullets, id: `cache-bullets-${i}-${Math.random().toString(36).slice(2)}`, consumed: false });
    }
  } else if (playerClass === '🧝') {
    for (let i = 0; i < numStacks; i++) {
      const arrows = getAmmoDrop();
      stock.push({ ...arrows, id: `cache-arrows-${i}-${Math.random().toString(36).slice(2)}`, consumed: false });
    }
  }
  void floor;
  return stock;
}

export function generateShopStock(floor: number, playerClass?: string): EmojiItem[] {
  const stock: EmojiItem[] = [];
  const numSouls = 1 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < numSouls; i++) {
    const p = getRandomEmojiPower();
    stock.push({ ...p, id: `shop-soul-${i}-${Math.random().toString(36).slice(2)}`, consumed: false });
  }
  const active = getRandomActiveDrop();
  stock.push({ ...active, id: `shop-active-${Math.random().toString(36).slice(2)}`, consumed: false });
  const numHeals = 1 + (Math.random() < 0.4 ? 1 : 0);
  for (let i = 0; i < numHeals; i++) {
    const h = getRandomHealDrop();
    stock.push({ ...h, id: `shop-heal-${i}-${Math.random().toString(36).slice(2)}`, consumed: false });
  }
  if (floor >= 3 && Math.random() < 0.6) {
    const eq = getRandomEquipmentDrop(floor);
    stock.push({ ...eq, id: `shop-eq-${Math.random().toString(36).slice(2)}`, consumed: false });
  }
  if (playerClass === '🤠') {
    const bullets = getBulletDrop();
    stock.push({ ...bullets, id: `shop-bullets-${Math.random().toString(36).slice(2)}`, consumed: false });
  }
  return stock;
}

export function generateRestaurantStock(floor: number): EmojiItem[] {
  const stock: EmojiItem[] = [];
  const numCooked = 1 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < numCooked; i++) {
    const raw = HEAL_DROPS[Math.floor(Math.random() * HEAL_DROPS.length)];
    const cooked = cookFood(raw);
    if (cooked) stock.push({ ...cooked, id: `rest-cooked-${i}-${Math.random().toString(36).slice(2)}`, consumed: false });
  }
  const numRaw = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < numRaw; i++) {
    const h = getRandomHealDrop();
    stock.push({ ...h, id: `rest-raw-${i}-${Math.random().toString(36).slice(2)}`, consumed: false });
  }
  if (floor >= 3 && Math.random() < 0.5) {
    const eq = getRandomEquipmentDrop(floor);
    if (eq.healAmount !== undefined || eq.bagPassive?.regeneration) {
      stock.push({ ...eq, id: `rest-eq-${Math.random().toString(36).slice(2)}`, consumed: false });
    }
  }
  return stock;
}

export function nearRestaurant(map: MapGrid, pos: Position): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = map[pos.y + dy]?.[pos.x + dx];
      if (t?.type === 'restaurant') return true;
    }
  }
  return false;
}

export function nearestRestaurantPos(map: MapGrid, pos: Position): Position | null {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = map[pos.y + dy]?.[pos.x + dx];
      if (t?.type === 'restaurant') return { x: pos.x + dx, y: pos.y + dy };
    }
  }
  return null;
}

export const COWBOY_FLAVOR_LINES = [
  "YEEHAW! These demons ain't ready for freedom!",
  "This is why we can't have nice things in America!",
  "Merica! *cracks knuckles loudly*",
  "I came here to chew bubblegum and kick ass… and I'm all outta gum!",
  "Don't tread on me… or my fists!",
  "These fools never stood a chance against bald eagles and apple pie!",
  "I'm about to liberate this dungeon from tyranny!",
  "One gun ain't enough… but two guns and freedom? Unstoppable!",
  "This ain't my first rodeo with hellspawn!",
  "God bless America… and my right hook!",
];

export function getRandomCowboyFlavor(): string {
  return COWBOY_FLAVOR_LINES[Math.floor(Math.random() * COWBOY_FLAVOR_LINES.length)];
}
