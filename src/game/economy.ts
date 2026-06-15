import { EmojiItem, MapGrid, Position } from './types';
import { getRandomEmojiPower, getRandomHealDrop, getAmmoDrop, getBulletDrop, getRandomActiveDrop, getRandomEquipmentDrop, cookFood, HEAL_DROPS } from './emojis';

export function getItemSellValue(item: EmojiItem, multiplier = 1): number {
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

export function getItemBuyPrice(item: EmojiItem, floor: number): number {
  return getItemSellValue(item) * 2 + Math.floor(floor / 2);
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
