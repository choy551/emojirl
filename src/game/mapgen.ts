import { MapGrid, Position, RoomTheme } from './types';
import { BUSH_EMOJI, LAVA_EMOJI, VOLCANO_EMOJI } from './lava';

const MAP_WIDTH = 50;
const MAP_HEIGHT = 28;

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  theme: RoomTheme;
}

function roomCenter(r: Room): Position {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

function roomsOverlap(a: Room, b: Omit<Room, 'theme'>): boolean {
  return (
    a.x - 1 <= b.x + b.w &&
    a.x + a.w >= b.x - 1 &&
    a.y - 1 <= b.y + b.h &&
    a.y + a.h >= b.y - 1
  );
}

function carveHCorridor(map: MapGrid, x1: number, x2: number, y: number) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  for (let x = minX; x <= maxX; x++) {
    if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) {
      if (map[y][x].type === 'wall') {
        map[y][x] = { type: 'floor', emoji: '⬜', seen: false, visible: false };
      }
    }
  }
}

function carveVCorridor(map: MapGrid, y1: number, y2: number, x: number) {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (let y = minY; y <= maxY; y++) {
    if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) {
      if (map[y][x].type === 'wall') {
        map[y][x] = { type: 'floor', emoji: '⬜', seen: false, visible: false };
      }
    }
  }
}

function placeBossRoom(map: MapGrid, room: Room) {
  for (let ry = room.y; ry < room.y + room.h; ry++) {
    for (let rx = room.x; rx < room.x + room.w; rx++) {
      if (map[ry][rx].type === 'floor') {
        map[ry][rx] = { type: 'boss-floor', emoji: '🟥', seen: false, visible: false };
      }
    }
  }
}

function placeDoors(map: MapGrid, rooms: Room[]) {
  for (const room of rooms) {
    if (room.theme === 'shop') continue;
    for (let rx = room.x; rx < room.x + room.w; rx++) {
      for (let ry = room.y; ry < room.y + room.h; ry++) {
        const isPerimeter =
          rx === room.x || rx === room.x + room.w - 1 ||
          ry === room.y || ry === room.y + room.h - 1;
        if (!isPerimeter) continue;
        if (map[ry][rx].type !== 'floor') continue;

        const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dx, dy] of dirs) {
          const nx = rx + dx;
          const ny = ry + dy;
          const outsideRoom =
            nx < room.x || nx >= room.x + room.w ||
            ny < room.y || ny >= room.y + room.h;
          if (!outsideRoom) continue;
          if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
          if (map[ny][nx].type === 'floor') {
            // Only place a door when the two perpendicular neighbours are walls —
            // this ensures the door sits in a one-tile-wide corridor/hallway
            // entry rather than floating along an open room wall.
            const tile1 = map[ry + dx]?.[rx + dy];
            const tile2 = map[ry - dx]?.[rx - dy];
            const side1Wall = !tile1 || tile1.type === 'wall';
            const side2Wall = !tile2 || tile2.type === 'wall';
            if (side1Wall && side2Wall) {
              map[ry][rx] = { type: 'door-closed', emoji: '🚪', seen: false, visible: false };
            }
            break;
          }
        }
      }
    }
  }
}

/** Market vault: safe floor with a shrine + shop stalls arranged around it. */
function placeMarketVault(map: MapGrid, room: Room) {
  for (let ry = room.y; ry < room.y + room.h; ry++) {
    for (let rx = room.x; rx < room.x + room.w; rx++) {
      if (map[ry][rx].type === 'floor') {
        map[ry][rx] = { type: 'safe-floor', emoji: '⬜', seen: false, visible: false };
      }
    }
  }
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  map[cy][cx] = { type: 'shrine', emoji: '🛕', seen: false, visible: false };
  // Shop stalls at cardinal offsets — bounds-checked so any room size works
  const stalls: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dx, dy] of stalls) {
    const sx = cx + dx, sy = cy + dy;
    if (sx > room.x && sx < room.x + room.w - 1 && sy > room.y && sy < room.y + room.h - 1) {
      map[sy][sx] = { type: 'shop-item', emoji: '🍺', seen: false, visible: false };
    }
  }
}

/** Water moat: flood the room + a wide border with water, leaving only a tiny 3×3 island at center. */
function placeWaterMoat(map: MapGrid, room: Room) {
  const moat = 2; // tiles of water beyond the room edges
  // Flood everything — room interior and the surrounding moat border
  for (let ry = room.y - moat; ry <= room.y + room.h - 1 + moat; ry++) {
    for (let rx = room.x - moat; rx <= room.x + room.w - 1 + moat; rx++) {
      if (ry < 0 || ry >= MAP_HEIGHT || rx < 0 || rx >= MAP_WIDTH) continue;
      if (map[ry][rx].type === 'boss-floor') continue;
      map[ry][rx] = { type: 'water', emoji: '🌊', seen: false, visible: false };
    }
  }
  // Carve a 3×3 island at the room center (items spawn here, centered ±1 x)
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  for (let ry = cy - 1; ry <= cy + 1; ry++) {
    for (let rx = cx - 1; rx <= cx + 1; rx++) {
      if (ry < 0 || ry >= MAP_HEIGHT || rx < 0 || rx >= MAP_WIDTH) continue;
      map[ry][rx] = { type: 'floor', emoji: '⬜', seen: false, visible: false };
    }
  }
}

function placeTrees(map: MapGrid, room: Room) {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const density = 0.25;

  for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
    for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
      if (rx === cx || ry === cy) continue;
      if (map[ry][rx].type !== 'floor') continue;
      if (Math.random() < density) {
        map[ry][rx] = { type: 'tree', emoji: '🌲', seen: false, visible: false };
      }
    }
  }
}

function placeCampfire(map: MapGrid, room: Room) {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const offsets: [number, number][] = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]];
  for (const [dx, dy] of offsets) {
    const ax = cx + dx, ay = cy + dy;
    if (ay >= room.y + 1 && ay < room.y + room.h - 1 && ax >= room.x + 1 && ax < room.x + room.w - 1) {
      if (map[ay][ax].type === 'floor') {
        map[ay][ax] = { type: 'campfire', emoji: '🔥', seen: false, visible: false };
        return;
      }
    }
  }
}

function placeShrine(map: MapGrid, room: Room) {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  map[cy][cx] = { type: 'shrine', emoji: '🛕', seen: false, visible: false };
}

function placeShop(map: MapGrid, room: Room) {
  for (let ry = room.y; ry < room.y + room.h; ry++) {
    for (let rx = room.x; rx < room.x + room.w; rx++) {
      if (map[ry][rx].type === 'floor') {
        map[ry][rx] = { type: 'safe-floor', emoji: '⬜', seen: false, visible: false };
      }
    }
  }
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  map[cy][cx] = { type: 'shop-item', emoji: '🏪', seen: false, visible: false };
}

function placeRestaurant(map: MapGrid, room: Room) {
  for (let ry = room.y; ry < room.y + room.h; ry++) {
    for (let rx = room.x; rx < room.x + room.w; rx++) {
      if (map[ry][rx].type === 'floor') {
        map[ry][rx] = { type: 'safe-floor', emoji: '⬜', seen: false, visible: false };
      }
    }
  }
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  map[cy][cx] = { type: 'restaurant', emoji: '🏪', seen: false, visible: false };
}

/** Ammo cache crate: placed in the start room on boss floors. Offset from spawn point. */
function placeAmmoCache(map: MapGrid, room: Room) {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  // Try offsets in order — skip the exact spawn point, pick the first floor tile found
  const offsets: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]];
  for (const [dx, dy] of offsets) {
    const ax = cx + dx, ay = cy + dy;
    if (ay >= room.y && ay < room.y + room.h && ax >= room.x && ax < room.x + room.w) {
      if (map[ay][ax].type === 'floor') {
        map[ay][ax] = { type: 'shop-item', emoji: '📦', seen: false, visible: false };
        return;
      }
    }
  }
}

// ── Water / lava feature generators ───────────────────────────────────────

const FLOODABLE_TYPES = new Set(['wall', 'floor', 'grass']);
const FEATURE_PROTECTED_THEMES = new Set([
  'shop', 'market', 'restaurant', 'treasure-vault', 'volcano', 'boss',
]);

function inRoom(r: Room, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function isFeatureProtected(x: number, y: number, rooms: Room[], startRoom?: Room): boolean {
  if (startRoom && inRoom(startRoom, x, y)) return true;
  for (const r of rooms) {
    if (FEATURE_PROTECTED_THEMES.has(r.theme) && inRoom(r, x, y)) return true;
  }
  return false;
}

export function canFloodTile(map: MapGrid, x: number, y: number, rooms: Room[] = [], startRoom?: Room): boolean {
  const H = map.length, W = map[0]?.length ?? 0;
  if (y <= 0 || y >= H - 1 || x <= 0 || x >= W - 1) return false;
  if (isFeatureProtected(x, y, rooms, startRoom)) return false;
  return FLOODABLE_TYPES.has(map[y][x].type);
}

function paintLiquid(
  map: MapGrid, x: number, y: number,
  kind: 'water' | 'lava',
  rooms: Room[], startRoom?: Room,
): boolean {
  if (!canFloodTile(map, x, y, rooms, startRoom)) return false;
  map[y][x] = {
    type: kind,
    emoji: kind === 'lava' ? LAVA_EMOJI : '🌊',
    seen: false,
    visible: false,
  };
  return true;
}

/** Organic blob — grows into walls AND walkable floor so ponds actually show up. */
export function placeWaterBlob(
  map: MapGrid, startY: number, startX: number, targetSize: number,
  rooms: Room[] = [], startRoom?: Room,
  kind: 'water' | 'lava' = 'water',
): number {
  const H = map.length, W = map[0]?.length ?? 0;
  const frontier: [number, number][] = [[startY, startX]];
  const seen = new Set<string>([`${startY},${startX}`]);
  let placed = 0;

  while (frontier.length > 0 && placed < targetSize) {
    const idx = Math.floor(Math.random() * frontier.length);
    const [y, x] = frontier.splice(idx, 1)[0];
    if (y <= 0 || y >= H - 1 || x <= 0 || x >= W - 1) continue;
    if (!paintLiquid(map, x, y, kind, rooms, startRoom)) continue;
    placed++;

    const dirs: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dy, dx] of dirs) {
      const ny = y + dy, nx = x + dx;
      const key = `${ny},${nx}`;
      if (!seen.has(key) && Math.random() < 0.72) {
        seen.add(key);
        frontier.push([ny, nx]);
      }
    }
  }
  return placed;
}

function pickShorelineSeed(map: MapGrid, rooms: Room[], startRoom?: Room): [number, number] | null {
  const H = map.length, W = map[0]?.length ?? 0;
  const seeds: [number, number][] = [];
  const n4: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!canFloodTile(map, x, y, rooms, startRoom)) continue;
      const t = map[y][x].type;
      let nearFloor = false, nearWall = false;
      for (const [dy, dx] of n4) {
        const nt = map[y + dy]?.[x + dx]?.type;
        if (nt === 'floor' || nt === 'grass' || nt === 'door-open' || nt === 'door-closed') nearFloor = true;
        if (nt === 'wall') nearWall = true;
      }
      // Prefer the dungeon shoreline: floor next to rock, or rock next to floor.
      if ((t === 'floor' && nearWall) || (t === 'wall' && nearFloor)) seeds.push([y, x]);
    }
  }
  if (seeds.length === 0) return null;
  return seeds[Math.floor(Math.random() * seeds.length)];
}

/** Drunkard's walk that carves through walls *and* rooms so the river is visible. */
export function placeRiver(
  map: MapGrid,
  rooms: Room[] = [],
  startRoom?: Room,
  kind: 'water' | 'lava' = 'water',
): void {
  const H = map.length, W = map[0]?.length ?? 0;
  const horizontal = Math.random() < 0.5;
  const width = Math.random() < 0.45 ? 2 : 1;

  let curY: number, curX: number, targetX: number, targetY: number;
  if (horizontal) {
    curY = 2 + Math.floor(Math.random() * (H - 4));
    curX = 1;
    targetY = 2 + Math.floor(Math.random() * (H - 4));
    targetX = W - 2;
  } else {
    curX = 2 + Math.floor(Math.random() * (W - 4));
    curY = 1;
    targetX = 2 + Math.floor(Math.random() * (W - 4));
    targetY = H - 2;
  }

  const maxSteps = W + H + 20;
  for (let step = 0; step < maxSteps; step++) {
    for (let w = 0; w < width; w++) {
      const wy = horizontal ? curY + w : curY;
      const wx = horizontal ? curX : curX + w;
      paintLiquid(map, wx, wy, kind, rooms, startRoom);
    }

    if (horizontal) {
      if (curX >= targetX) break;
      curX++;
      if (Math.random() < 0.28) {
        curY += Math.sign(targetY - curY) || (Math.random() < 0.5 ? 1 : -1);
        curY = Math.max(1, Math.min(H - 2 - width, curY));
      }
    } else {
      if (curY >= targetY) break;
      curY++;
      if (Math.random() < 0.28) {
        curX += Math.sign(targetX - curX) || (Math.random() < 0.5 ? 1 : -1);
        curX = Math.max(1, Math.min(W - 2 - width, curX));
      }
    }
  }
}

/** Hedge of bushes: blocks walking, does not block sight or ranged attacks. */
export function placeBushAmbush(map: MapGrid, room: Room): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const horizontal = room.w >= room.h;
  const bushTile = { type: 'bush' as const, emoji: BUSH_EMOJI, seen: false, visible: false };

  if (horizontal) {
    for (let rx = room.x + 2; rx < room.x + room.w - 2; rx++) {
      if (map[cy]?.[rx]?.type === 'floor') map[cy][rx] = { ...bushTile };
    }
  } else {
    for (let ry = room.y + 2; ry < room.y + room.h - 2; ry++) {
      if (map[ry]?.[cx]?.type === 'floor') map[ry][cx] = { ...bushTile };
    }
  }
}

/** Volcano at room center, lava ring, floor around it for loot. */
export function placeVolcanoVault(map: MapGrid, room: Room): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
    for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
      if (!map[ry]?.[rx]) continue;
      const dist = Math.max(Math.abs(rx - cx), Math.abs(ry - cy));
      if (dist === 0) {
        map[ry][rx] = { type: 'volcano', emoji: VOLCANO_EMOJI, seen: false, visible: false };
      } else if (dist === 1) {
        map[ry][rx] = { type: 'lava', emoji: LAVA_EMOJI, seen: false, visible: false };
      } else if (dist === 2 && Math.random() < 0.35) {
        map[ry][rx] = { type: 'lava', emoji: LAVA_EMOJI, seen: false, visible: false };
      }
    }
  }
}

// ── Connectivity helpers ──────────────────────────────────────────────────

const MAPGEN_DIRS: [number, number][] = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
const posKey = (p: Position) => `${p.x},${p.y}`;

/** Returns true if `to` is BFS-reachable from `from` using only `passable` tile types. */
function reach(map: MapGrid, from: Position, to: Position, passable: Set<string>): boolean {
  const visited = new Set<string>([posKey(from)]);
  const queue = [from];
  while (queue.length) {
    const pos = queue.shift()!;
    if (pos.x === to.x && pos.y === to.y) return true;
    for (const [dx, dy] of MAPGEN_DIRS) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (!passable.has(map[ny][nx].type)) continue;
      const k = posKey({ x: nx, y: ny });
      if (!visited.has(k)) { visited.add(k); queue.push({ x: nx, y: ny }); }
    }
  }
  return false;
}

/** BFS shortest path from `from` to `to`; returns the sequence of positions or null. */
function shortestPath(map: MapGrid, from: Position, to: Position, passable: Set<string>): Position[] | null {
  const parent = new Map<string, string | null>();
  const positions = new Map<string, Position>();
  const queue = [from];
  parent.set(posKey(from), null);
  positions.set(posKey(from), from);
  while (queue.length) {
    const pos = queue.shift()!;
    const pk = posKey(pos);
    if (pos.x === to.x && pos.y === to.y) {
      const path: Position[] = [];
      let k: string | null | undefined = pk;
      while (k !== null && k !== undefined) {
        path.push(positions.get(k)!);
        k = parent.get(k);
      }
      return path.reverse();
    }
    for (const [dx, dy] of MAPGEN_DIRS) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (!passable.has(map[ny][nx].type)) continue;
      const nPos = { x: nx, y: ny };
      const nk = posKey(nPos);
      if (!parent.has(nk)) {
        parent.set(nk, pk);
        positions.set(nk, nPos);
        queue.push(nPos);
      }
    }
  }
  return null;
}

/**
 * Guarantees a dry-walkable path from `start` to `stairs`.
 * If water features have cut the corridor, drains the minimum set of water
 * tiles on the shortest water-inclusive path, turning them back to floor.
 */
function ensureStairsReachable(map: MapGrid, start: Position, stairs: Position): void {
  const DRY = new Set([
    'floor', 'stairs', 'boss-floor', 'grass',
    'door-open', 'door-closed',
    'safe-floor', 'shop-item', 'shrine', 'shrine-used',
    'campfire',
  ]);
  if (reach(map, start, stairs, DRY)) return;

  // Path blocked by water/lava — find a route, then drain just those tiles
  const WET = new Set([...DRY, 'water', 'lava']);
  const path = shortestPath(map, start, stairs, WET);
  if (!path) return; // fully disconnected — shouldn't occur in a connected dungeon
  for (const p of path) {
    const t = map[p.y][p.x].type;
    if (t === 'water' || t === 'lava') {
      map[p.y][p.x] = { type: 'floor', emoji: '⬜', seen: false, visible: false };
    }
  }
}

/** Ponds, lakes, rivers (and optional lava rivers) that actually cut the dungeon. */
function placeLiquidFeatures(map: MapGrid, floor: number, rooms: Room[], startRoom: Room): void {
  const numBlobs = 1 + Math.floor(Math.random() * 3);

  for (let i = 0; i < numBlobs; i++) {
    const seed = pickShorelineSeed(map, rooms, startRoom);
    if (!seed) break;
    const [sy, sx] = seed;
    const isLake = Math.random() < 0.28;
    const size = isLake
      ? 28 + Math.floor(Math.random() * 22)
      :  7 + Math.floor(Math.random() * 11);
    placeWaterBlob(map, sy, sx, size, rooms, startRoom, 'water');
  }

  const riverChance = Math.min(0.55, 0.18 + (floor - 1) * 0.08);
  if (Math.random() < riverChance) placeRiver(map, rooms, startRoom, 'water');

  const lavaRiverChance = Math.min(0.32, 0.06 + (floor - 1) * 0.04);
  if (Math.random() < lavaRiverChance) placeRiver(map, rooms, startRoom, 'lava');

  const lavaPondChance = Math.min(0.22, 0.04 + (floor - 1) * 0.03);
  if (Math.random() < lavaPondChance) {
    const lavaSeed = pickShorelineSeed(map, rooms, startRoom);
    if (lavaSeed) {
      const [sy, sx] = lavaSeed;
      const size = 8 + Math.floor(Math.random() * 14);
      placeWaterBlob(map, sy, sx, size, rooms, startRoom, 'lava');
    }
  }
}

export function generateMap(floor: number): { map: MapGrid; startPos: Position; stairsPos: Position; rooms: Room[] } {
  const map: MapGrid = Array(MAP_HEIGHT)
    .fill(null)
    .map(() => Array(MAP_WIDTH).fill(null).map(() => ({ type: 'wall', emoji: '⬛', seen: false, visible: false })));

  const minRooms = 6 + Math.min(floor - 1, 4);
  const maxRooms = 10 + Math.min(floor - 1, 6);
  const targetRooms = minRooms + Math.floor(Math.random() * (maxRooms - minRooms + 1));

  const rooms: Room[] = [];
  let attempts = 0;

  while (rooms.length < targetRooms && attempts < 200) {
    attempts++;
    const w = 4 + Math.floor(Math.random() * 7);
    const h = 3 + Math.floor(Math.random() * 5);
    const x = 1 + Math.floor(Math.random() * (MAP_WIDTH - w - 2));
    const y = 1 + Math.floor(Math.random() * (MAP_HEIGHT - h - 2));
    const candidate = { x, y, w, h };

    if (rooms.some(r => roomsOverlap(r, candidate))) continue;

    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        map[ry][rx] = { type: 'floor', emoji: '⬜', seen: false, visible: false };
      }
    }

    if (rooms.length > 0) {
      const prev = roomCenter(rooms[rooms.length - 1]);
      const curr = { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) };
      if (Math.random() < 0.5) {
        carveHCorridor(map, prev.x, curr.x, prev.y);
        carveVCorridor(map, prev.y, curr.y, curr.x);
      } else {
        carveVCorridor(map, prev.y, curr.y, prev.x);
        carveHCorridor(map, prev.x, curr.x, curr.y);
      }
    }

    rooms.push({ x, y, w, h, theme: 'normal' });
  }

  // Boss floors: designate last room as boss arena
  const isBossFloor = floor % 5 === 0;
  if (isBossFloor && rooms.length > 0) {
    rooms[rooms.length - 1] = { ...rooms[rooms.length - 1], theme: 'boss' };
  }

  // Assign themes — skip first room (start) and last room (boss room or stairs room)
  const lastMiddle = rooms.length - 2;
  const middleIndices = rooms.map((_, i) => i).slice(1, lastMiddle + 1);
  const shuffled = [...middleIndices].sort(() => Math.random() - 0.5);

  const shrineChance      = Math.min(0.9,  0.40 + (floor - 1) * 0.10);
  const shopChance        = Math.min(0.85, 0.35 + (floor - 1) * 0.08);
  const restaurantChance  = Math.min(0.45, 0.15 + (floor - 1) * 0.04);
  const marketChance      = Math.min(0.70, 0.25 + (floor - 1) * 0.06);
  const denChance         = Math.min(0.80, 0.20 + (floor - 1) * 0.08);
  const treasureChance    = Math.min(0.65, 0.20 + (floor - 1) * 0.06);
  const bushAmbushChance  = Math.min(0.50, 0.16 + (floor - 1) * 0.05);
  const volcanoChance     = isBossFloor ? 0 : Math.min(0.32, 0.08 + (floor - 1) * 0.04);

  let shrineAssigned      = false;
  let shopAssigned        = false;
  let restaurantAssigned  = false;
  let marketAssigned      = false;
  let denAssigned         = false;
  let treasureAssigned    = false;
  let bushAmbushAssigned  = false;
  let volcanoAssigned     = false;

  for (const idx of shuffled) {
    const r = rooms[idx];
    if (!shrineAssigned && Math.random() < shrineChance) {
      rooms[idx] = { ...r, theme: 'shrine' };
      shrineAssigned = true;
      continue;
    }
    if (!shopAssigned && Math.random() < shopChance) {
      rooms[idx] = { ...r, theme: 'shop' };
      shopAssigned = true;
      continue;
    }
    if (!restaurantAssigned && r.w >= 4 && r.h >= 4 && Math.random() < restaurantChance) {
      rooms[idx] = { ...r, theme: 'restaurant' };
      restaurantAssigned = true;
      continue;
    }
    // Market vault: shrine + shop stalls in one room; needs w≥5 h≥4
    if (!marketAssigned && r.w >= 5 && r.h >= 4 && Math.random() < marketChance) {
      rooms[idx] = { ...r, theme: 'market' };
      marketAssigned = true;
      continue;
    }
    // Monster den: every interior tile packed with enemies
    if (!denAssigned && r.w >= 4 && r.h >= 3 && Math.random() < denChance) {
      rooms[idx] = { ...r, theme: 'monster-den' };
      denAssigned = true;
      continue;
    }
    // Treasure vault: water-moated island — appears at most once per floor
    if (!treasureAssigned && Math.random() < treasureChance) {
      rooms[idx] = { ...r, theme: 'treasure-vault' };
      treasureAssigned = true;
      continue;
    }
    if (!bushAmbushAssigned && r.w >= 6 && r.h >= 4 && Math.random() < bushAmbushChance) {
      rooms[idx] = { ...r, theme: 'bush-ambush' };
      bushAmbushAssigned = true;
      continue;
    }
    if (!volcanoAssigned && r.w >= 5 && r.h >= 4 && Math.random() < volcanoChance) {
      rooms[idx] = { ...r, theme: 'volcano' };
      volcanoAssigned = true;
      continue;
    }
  }

  // Forest rooms: any remaining normal room with enough space
  const forestDensity = Math.min(0.5, 0.15 + (floor - 1) * 0.07);
  for (let i = 1; i < rooms.length - 1; i++) {
    const room = rooms[i];
    if (room.theme !== 'normal') continue;
    if (room.w >= 5 && room.h >= 4 && Math.random() < forestDensity) {
      rooms[i] = { ...room, theme: 'forest' };
    }
  }

  // Place doors at room entrances (corridor–room junctions)
  placeDoors(map, rooms);

  // Apply theme decorations
  for (const room of rooms) {
    if (room.theme === 'forest')         { placeTrees(map, room); placeCampfire(map, room); }
    else if (room.theme === 'shrine')    placeShrine(map, room);
    else if (room.theme === 'shop')      placeShop(map, room);
    else if (room.theme === 'restaurant') placeRestaurant(map, room);
    else if (room.theme === 'boss')      placeBossRoom(map, room);
    else if (room.theme === 'market')    placeMarketVault(map, room);
    else if (room.theme === 'treasure-vault') placeWaterMoat(map, room);
    else if (room.theme === 'bush-ambush')    placeBushAmbush(map, room);
    else if (room.theme === 'volcano')        placeVolcanoVault(map, room);
    // monster-den: no tile treatment — enemy packing is handled in spawning.ts
  }

  // Boss floors: place an ammo cache crate in the start room so players can resupply
  if (isBossFloor && rooms.length > 0) {
    placeAmmoCache(map, rooms[0]);
  }

  // Place coherent water (and occasional lava) features: ponds, lakes, rivers
  placeLiquidFeatures(map, floor, rooms, rooms[0]);

  const startPos = roomCenter(rooms[0]);
  const lastRoom = rooms[rooms.length - 1];
  const stairsPos = roomCenter(lastRoom);
  map[stairsPos.y][stairsPos.x] = { type: 'stairs', emoji: '🕳️', seen: false, visible: false };

  // Guarantee the stairs are reachable without swimming or walking lava —
  // drain the minimum water/lava tiles on the shortest path.
  ensureStairsReachable(map, startPos, stairsPos);

  return { map, startPos, stairsPos, rooms };
}
