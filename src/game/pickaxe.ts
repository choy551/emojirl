import type { EmojiItem, MapGrid, Position } from './types';

export const PICKAXE_EMOJI = '⛏️';
export const PICKAXE_START = 5;
export const PICKAXE_CLAMP = 10;
export const PICKAXE_CAP = 20;

/** Next charge total after one extra pickup. 7 becomes 10. At 10 or more, +1, never past 20. */
export function addPickaxeCharges(current: number): number {
  const have = Math.max(0, Math.floor(current));
  if (have >= PICKAXE_CAP) return PICKAXE_CAP;
  if (have >= PICKAXE_CLAMP) return Math.min(PICKAXE_CAP, have + 1);
  return Math.min(PICKAXE_CLAMP, have + PICKAXE_START);
}

export function shouldAutoMine(autoMine: boolean | undefined, hasPickaxe: boolean, mineable: boolean): boolean {
  return autoMine === true && hasPickaxe && mineable;
}

export function isPickaxe(item: EmojiItem | null | undefined): boolean {
  return !!item && !item.consumed && item.activeKind === 'pickaxe';
}

export function findHotbarPickaxe(inventory: EmojiItem[]): EmojiItem | undefined {
  return inventory.find(item => isPickaxe(item) && (item.charges ?? 0) > 0);
}

const PROTECTED_THEMES = new Set([
  'boss', 'shop', 'market', 'shrine', 'treasure-vault', 'room-vault', 'district-vault',
]);

/** Border, vault, shop, temple, and arena walls cannot be mined. */
export function markProtectedWalls(
  map: MapGrid,
  rooms: { x: number; y: number; w: number; h: number; theme: string }[],
  arena: boolean,
): void {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = map[y][x];
      if (tile.type !== 'wall') continue;
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const shell = rooms.some(room =>
        PROTECTED_THEMES.has(room.theme)
        && x >= room.x - 1 && x <= room.x + room.w
        && y >= room.y - 1 && y <= room.y + room.h,
      );
      if (arena || border || shell) map[y][x] = { ...tile, unbreakable: true };
    }
  }
}

export function isMapBorder(map: MapGrid, x: number, y: number): boolean {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  return x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1;
}

/** A ⬛ wall the pickaxe can turn into floor. Borders and flagged rooms stay. */
export function canMineWall(map: MapGrid, x: number, y: number): boolean {
  const tile = map[y]?.[x];
  if (!tile || tile.type !== 'wall') return false;
  if (isMapBorder(map, x, y)) return false;
  if (tile.unbreakable) return false;
  return true;
}

export function digCardinalLine(
  map: MapGrid,
  from: Position,
  dx: number,
  dy: number,
  charges: number,
): { map: MapGrid; dug: number } {
  if (dx !== 0 && dy !== 0) return { map, dug: 0 };
  if (dx === 0 && dy === 0) return { map, dug: 0 };
  const next = map.map(row => row.map(tile => ({ ...tile })));
  let dug = 0;
  const n = Math.max(0, Math.floor(charges));
  for (let step = 1; step <= n; step++) {
    const x = from.x + dx * step;
    const y = from.y + dy * step;
    if (!next[y]?.[x]) break;
    if (!canMineWall(next, x, y)) break;
    next[y][x] = { ...next[y][x], type: 'floor', emoji: '⬜' };
    dug += 1;
  }
  return { map: next, dug };
}

export type GroundPickaxe = EmojiItem & { pos: Position };

/** Extra loot when a monkey dies on D:3 or deeper. Not part of the normal kill table. */
export function monkeyPickaxeDrop(monkey: boolean | undefined, floor: number, pos: Position): GroundPickaxe | null {
  if (!monkey || floor < 3) return null;
  return {
    emoji: PICKAXE_EMOJI,
    name: 'Pickaxe',
    description: 'Dig walls. 5 charges.',
    consumed: false,
    activeKind: 'pickaxe',
    charges: PICKAXE_START,
    id: `monkey-pick-${Math.random().toString(36).slice(2)}`,
    pos,
  };
}

export function appendMonkeyPickaxe<T extends EmojiItem & { pos: Position }>(
  items: T[],
  monkey: boolean | undefined,
  floor: number,
  pos: Position,
): T[] {
  const extra = monkeyPickaxeDrop(monkey, floor, pos);
  return extra ? [...items, extra as T] : items;
}

/** Fold a new pickaxe into the one already carried. Returns the item to keep adding when there is none. */
export function mergePickaxePickup(inventory: EmojiItem[], bank: EmojiItem[], incoming: EmojiItem): {
  inventory: EmojiItem[];
  bank: EmojiItem[];
  absorbed: boolean;
} {
  if (!isPickaxe(incoming)) return { inventory, bank, absorbed: false };
  const hot = inventory.findIndex(isPickaxe);
  if (hot !== -1) {
    const next = inventory.map((item, i) => i === hot ? { ...item, charges: addPickaxeCharges(item.charges ?? 0) } : item);
    return { inventory: next, bank, absorbed: true };
  }
  const stored = bank.findIndex(isPickaxe);
  if (stored !== -1) {
    const next = bank.map((item, i) => i === stored ? { ...item, charges: addPickaxeCharges(item.charges ?? 0) } : item);
    return { inventory, bank: next, absorbed: true };
  }
  return { inventory, bank, absorbed: false };
}
