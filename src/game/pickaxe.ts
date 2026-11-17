import { buildingOf } from './cityBuildings';
import type { EmojiItem, MapGrid, Position, Tile } from './types';

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

function tileAt(map: MapGrid, x: number, y: number): Tile | undefined {
  return map[y]?.[x];
}

interface RoomBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function isLiquid(tile: Tile | undefined): boolean {
  return tile?.type === 'water' || tile?.type === 'lava';
}

/**
 * Room interior, including ponds. Walls and doors are the shell.
 * A one-tile liquid gap is a breach, not a row of the room.
 */
function stripIsInterior(map: MapGrid, fixed: number, from: number, to: number, horizontal: boolean): boolean {
  if (from > to) return false;
  let liquid = 0;
  let solid = 0;
  for (let i = from; i <= to; i++) {
    const tile = horizontal ? tileAt(map, i, fixed) : tileAt(map, fixed, i);
    if (!tile || tile.type === 'wall' || tile.type === 'door-closed' || tile.type === 'door-open') return false;
    if (isLiquid(tile)) liquid += 1;
    else solid += 1;
  }
  if (solid === 0 && to - from < 2) return false;
  return solid + liquid > 0;
}

/** Grow a rectangle of room interior. A shell of walls, or a corridor mouth, stops it. */
function growRoom(map: MapGrid, box: RoomBox): RoomBox {
  let { x0, y0, x1, y1 } = box;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  for (let guard = 0; guard < 80; guard++) {
    let grew = false;
    if (y0 - 1 > 0 && stripIsInterior(map, y0 - 1, x0, x1, true)) { y0 -= 1; grew = true; }
    if (y1 + 1 < h - 1 && stripIsInterior(map, y1 + 1, x0, x1, true)) { y1 += 1; grew = true; }
    if (x0 - 1 > 0 && stripIsInterior(map, x0 - 1, y0, y1, false)) { x0 -= 1; grew = true; }
    if (x1 + 1 < w - 1 && stripIsInterior(map, x1 + 1, y0, y1, false)) { x1 += 1; grew = true; }
    if (!grew) break;
  }
  return { x0, y0, x1, y1 };
}

function rectHas(map: MapGrid, box: RoomBox, pred: (tile: Tile) => boolean): boolean {
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const tile = tileAt(map, x, y);
      if (tile && pred(tile)) return true;
    }
  }
  return false;
}

function districtTiles(map: MapGrid, box: RoomBox): number {
  let count = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const tile = tileAt(map, x, y);
      if (tile?.type === 'floor' && buildingOf(tile.emoji)?.district) count += 1;
    }
  }
  return count;
}

function closetBox(map: MapGrid, bed: Position): RoomBox {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const seen = new Set<string>();
  const queue: Position[] = [bed];
  seen.add(`${bed.x},${bed.y}`);
  let x0 = bed.x;
  let y0 = bed.y;
  let x1 = bed.x;
  let y1 = bed.y;
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (x < 0 || y < 0 || y >= h || x >= w) continue;
      if (Math.max(Math.abs(x - bed.x), Math.abs(y - bed.y)) > 4) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      const tile = tileAt(map, x, y);
      if (!tile) continue;
      if (tile.type !== 'wall' && tile.type !== 'door-closed' && tile.type !== 'door-open' && tile.type !== 'bed') continue;
      seen.add(key);
      queue.push({ x, y });
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1 };
}

function markRoomShell(map: MapGrid, box: RoomBox): void {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  for (let y = box.y0 - 1; y <= box.y1 + 1; y++) {
    for (let x = box.x0 - 1; x <= box.x1 + 1; x++) {
      if (x < 0 || y < 0 || y >= h || x >= w) continue;
      const tile = map[y][x];
      if (tile?.type === 'wall') map[y][x] = { ...tile, unbreakable: true };
    }
  }
}

/**
 * Old saves were generated before walls were flagged. Stamp the same border,
 * boss, vault, shop, market, shrine, and arena walls `markProtectedWalls`
 * would have written. Running it again does not flag any other wall.
 */
function hasUnbreakableWall(map: MapGrid): boolean {
  for (const row of map) {
    for (const tile of row) {
      if (tile.type === 'wall' && tile.unbreakable) return true;
    }
  }
  return false;
}

export function stampLegacyProtectedWalls(map: MapGrid, opts: { arena: boolean }): MapGrid {
  if (map.length === 0 || (map[0]?.length ?? 0) === 0) return map;
  // Floors generated after #103 already carry the flag. Stamping those again
  // would only reinterpret ponds. An old floor has no flags at all.
  if (hasUnbreakableWall(map)) return map;
  const next = map.map(row => row.map(tile => ({ ...tile })));
  const h = next.length;
  const w = next[0]?.length ?? 0;
  if (opts.arena) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tile = next[y][x];
        if (tile.type === 'wall') next[y][x] = { ...tile, unbreakable: true };
      }
    }
    return next;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const tile = next[y][x];
      if (border && tile.type === 'wall') next[y][x] = { ...tile, unbreakable: true };
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tile = next[y][x];
      const seed = tile.type === 'boss-floor'
        || tile.type === 'shrine'
        || tile.type === 'shrine-used'
        || tile.type === 'bed'
        || (tile.type === 'floor' && !!buildingOf(tile.emoji)?.district);
      if (!seed && tile.type !== 'shop-item') continue;
      const origin = tile.type === 'bed' ? closetBox(next, { x, y }) : { x0: x, y0: y, x1: x, y1: y };
      const room = growRoom(next, origin);
      if (tile.type === 'shop-item' && !rectHas(next, room, cell => cell.type === 'safe-floor')) continue;
      if (tile.type === 'floor' && districtTiles(next, room) < 4) continue;
      markRoomShell(next, room);
    }
  }
  return next;
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
