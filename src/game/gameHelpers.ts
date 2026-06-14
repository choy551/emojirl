import { Room as MapRoom, generateMap } from './mapgen';
import { Player, Enemy, EmojiItem, GameState, MapGrid, Position, FloatingText, PlacedBomb, ActiveProjectile } from './types';
import { getRandomEnemy, getForestEnemy, getBossForFloor, getEchoEnemy, getRandomAdventurer, adventurerSpawnChance, ADVENTURER_FAVORITE_EMOJIS } from './enemies';
import { resolveCombat, getCowboyUnarmedBonus } from './combat';
import { getRandomEmojiPower, getRandomHealDrop, getAmmoDrop, getBulletDrop, getRandomActiveDrop, getRandomEquipmentDrop, cookFood, HEAL_DROPS } from './emojis';
import { getMood } from './moods';
import { markEnemySeen, markEmojiSeen, markEnemyKilled } from './discoveries';
import { STACKABLE_BAG_CAPS, isStackableBagPassive } from './passives';

export type Room = MapRoom;

export function moodMax(characterClass: string): number {
  return characterClass === '🤠' ? Infinity : 100;
}

export function roomCenter(r: Room): Position {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

// Floor-depth scaling: enemies grow with every floor, not just after bosses.
// At floor F, HP grows by 40% per floor beyond floor 1 (×1.4^(F-1) capped to prevent overflow),
// attack grows by 0.9 per floor, defense by 0.4 per floor.
function floorScale<T extends { hp: number; attack: number; defense: number }>(type: T, floor: number): T {
  if (floor <= 1) return type;
  const depth = floor - 1;
  const hpMult = Math.min(20, 1 + 0.4 * depth);
  return {
    ...type,
    hp:      Math.max(type.hp, Math.round(type.hp * hpMult)),
    attack:  type.attack + Math.floor(depth * 0.9),
    defense: type.defense + Math.floor(depth * 0.4),
  };
}

// Boss-kill tier scaling stacks on top of floor depth.
// Each tier: +50% HP, +2 ATK, +1 DEF for regular enemies; +60% HP, +3 ATK for bosses.
function scaleEnemy<T extends { hp: number; attack: number; defense: number }>(type: T, tier: number): T {
  if (tier <= 0) return type;
  return {
    ...type,
    hp:      Math.round(type.hp * (1 + 0.5 * tier)),
    attack:  type.attack + tier * 2,
    defense: type.defense + tier,
  };
}

function scaleBoss<T extends { hp: number; attack: number; defense: number }>(type: T, tier: number): T {
  if (tier <= 0) return type;
  return {
    ...type,
    hp:     Math.round(type.hp * (1 + 0.6 * tier)),
    attack: type.attack + tier * 3,
  };
}

export function spawnEnemies(floor: number, rooms: Room[], _playerPos: Position, difficultyTier = 0, map?: MapGrid): Enemy[] {
  const enemies: Enemy[] = [];
  const pressure = getDungeonPressure(floor);
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    if (room.theme === 'shop' || room.theme === 'market' || room.theme === 'restaurant') continue;
    if (room.theme === 'treasure-vault') continue;
    if (room.theme === 'boss') {
      const rawBoss = getBossForFloor(floor);
      const bossBase = scaleBoss(floorScale(rawBoss, floor), difficultyTier);
      const bossType = pressure.atk > 0
        ? { ...bossBase, attack: bossBase.attack + pressure.atk, defense: bossBase.defense + pressure.def }
        : bossBase;
      const cx = room.x + Math.floor(room.w / 2);
      const cy = room.y + Math.floor(room.h / 2);
      enemies.push({
        ...bossType,
        id: `boss-${i}-${Math.random()}`,
        pos: { x: cx, y: cy },
        maxHp: bossType.hp,
        engaged: false,
        isBoss: true,
        spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
      });
      continue;
    }
    if (room.theme === 'monster-den') {
      for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
        for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
          if ((rx + ry) % 2 !== 0) continue;
          const base = scaleEnemy(floorScale(getRandomEnemy(floor), floor), difficultyTier);
          const type = pressure.atk > 0
            ? { ...base, attack: base.attack + pressure.atk, defense: base.defense + pressure.def }
            : base;
          enemies.push({
            ...type,
            id: `den-${i}-${ry}-${rx}-${Math.random()}`,
            pos: { x: rx, y: ry },
            maxHp: type.hp,
            engaged: false,
            spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
          });
        }
      }
      continue;
    }
    const densityBonus = Math.floor(floor / 5);
    const baseCount = 1 + Math.floor(Math.random() * Math.min(3, 1 + Math.floor(floor / 2))) + densityBonus;
    const count = Math.min(6, baseCount + Math.floor(difficultyTier / 2));
    const roomEnemyStart = enemies.length;
    for (let j = 0; j < count; j++) {
      const rawType = room.theme === 'forest' ? getForestEnemy(floor) : getRandomEnemy(floor);
      const base = scaleEnemy(floorScale(rawType, floor), difficultyTier);
      const type = pressure.atk > 0
        ? { ...base, attack: base.attack + pressure.atk, defense: base.defense + pressure.def }
        : base;
      const ex = room.x + 1 + Math.floor(Math.random() * (room.w - 2 || 1));
      const ey = room.y + 1 + Math.floor(Math.random() * (room.h - 2 || 1));
      let spawnPos: Position = { x: ex, y: ey };
      let spawnBounds: { x: number; y: number; w: number; h: number } | undefined =
        { x: room.x, y: room.y, w: room.w, h: room.h };
      if ('waterAggro' in type && type.waterAggro && map) {
        const waterTiles: Position[] = [];
        for (let wy = 1; wy < map.length - 1; wy++) {
          for (let wx = 1; wx < map[0].length - 1; wx++) {
            if (map[wy][wx].type === 'water') waterTiles.push({ x: wx, y: wy });
          }
        }
        if (waterTiles.length > 0) {
          spawnPos = waterTiles[Math.floor(Math.random() * waterTiles.length)];
          spawnBounds = undefined;
        }
      }
      enemies.push({
        ...type,
        id: `e${i}-${j}-${Math.random()}`,
        pos: spawnPos,
        maxHp: type.hp,
        engaged: false,
        spawnRoomBounds: spawnBounds,
      });
    }
    if (floor >= 6 && enemies.length > roomEnemyStart) {
      const echoChance = 0.08 + Math.random() * 0.04;
      if (Math.random() < echoChance) {
        const echoBoss = getBossForFloor(floor - 5);
        const rawEcho = getEchoEnemy(echoBoss);
        const echoBase = scaleEnemy(floorScale(rawEcho, floor), difficultyTier);
        const echoType = pressure.atk > 0
          ? { ...echoBase, attack: echoBase.attack + pressure.atk, defense: echoBase.defense + pressure.def }
          : echoBase;
        const replaceIdx = roomEnemyStart + Math.floor(Math.random() * (enemies.length - roomEnemyStart));
        const replacePos = enemies[replaceIdx].pos;
        enemies[replaceIdx] = {
          ...echoType,
          id: `echo-${i}-${Math.random()}`,
          pos: replacePos,
          maxHp: echoType.hp,
          engaged: false,
          isEcho: true,
          spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
        };
      }
    }
    if (Math.random() < adventurerSpawnChance(floor)) {
      const advType = getRandomAdventurer();
      const isAlreadyFriendly = Math.random() < 0.15;
      const favoriteEmoji = ADVENTURER_FAVORITE_EMOJIS[Math.floor(Math.random() * ADVENTURER_FAVORITE_EMOJIS.length)];
      const ax = room.x + 1 + Math.floor(Math.random() * Math.max(1, room.w - 2));
      const ay = room.y + 1 + Math.floor(Math.random() * Math.max(1, room.h - 2));
      enemies.push({
        ...advType,
        tag: isAlreadyFriendly ? 'Friendly' as const : 'Neutral' as const,
        id: `adv-${i}-${Math.random()}`,
        pos: { x: ax, y: ay },
        maxHp: advType.hp,
        engaged: false,
        favoriteEmoji,
        spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
      });
    }
  }
  return enemies;
}

export function spawnVaultItems(rooms: Room[], playerClass?: string, floor = 1): (EmojiItem & { pos: Position })[] {
  const items: (EmojiItem & { pos: Position })[] = [];
  for (const room of rooms) {
    if (room.theme !== 'treasure-vault') continue;
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      let drop: Omit<EmojiItem, 'id' | 'consumed'>;
      if (playerClass === '🤠' && Math.random() < 0.13) {
        drop = getBulletDrop();
      } else {
        drop = Math.random() < 0.45 ? getRandomEquipmentDrop(floor) : getRandomEmojiPower();
      }
      const ox = i - Math.floor(count / 2);
      items.push({
        ...drop,
        id: `vault-${room.x}-${room.y}-${i}-${Math.random()}`,
        consumed: false,
        pos: { x: cx + ox, y: cy },
      });
    }
  }
  return items;
}

export function xpThresholdForLevel(level: number): number {
  return (level - 1) * (level - 1) * 5;
}

export function levelFromXP(xp: number): number {
  return 1 + Math.floor(Math.sqrt(xp / 5));
}

export function hpBonusForLevel(level: number): number {
  return Math.floor(Math.pow(level - 1, 1.3) * 3);
}

export function mpBonusForLevel(level: number): number {
  return Math.floor((level - 1) / 3);
}

export function computeNinjaEvasion(player: Player): number {
  const hpPct = player.stats.hp / player.stats.maxHp;
  const base = hpPct < 0.4 ? 45 : 20;
  const levelBonus = Math.min(35, (player.stats.level - 1) * 0.8);
  const itemBonus = player.stats.evasion ?? 0;
  return Math.min(75, base + levelBonus + itemBonus);
}

export function getDungeonPressure(floor: number): { atk: number; def: number } {
  if (floor <= 15) return { atk: 0, def: 0 };
  const levels = Math.floor((floor - 16) / 5) + 1;
  return { atk: levels, def: levels };
}

export function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

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

export const VISION_RADIUS = 4;

export function visionRadiusFor(characterClass: string, level: number): number {
  return VISION_RADIUS + (characterClass === '🧝' ? Math.floor((level - 1) / 3) : 0);
}

export function eagleEyeRange(level: number): number {
  return 4 + Math.floor((level - 1) / 3);
}

export const OPAQUE_TILES = new Set(['wall', 'tree', 'door-closed']);

export function hasLineOfSight(map: MapGrid, from: Position, to: Position): boolean {
  if (from.x === to.x && from.y === to.y) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy) * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = Math.round(from.x + dx * t);
    const cy = Math.round(from.y + dy * t);
    if (cx === to.x && cy === to.y) break;
    const tile = map[cy]?.[cx];
    if (!tile || OPAQUE_TILES.has(tile.type)) return false;
  }
  return true;
}

export function computeVisibility(map: MapGrid, playerPos: Position, radius = VISION_RADIUS): MapGrid {
  const { x: px, y: py } = playerPos;
  const visible = new Set<string>();
  const rows = map.length, cols = map[0]?.length ?? 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      const x = px + dx, y = py + dy;
      if (y < 0 || y >= rows || x < 0 || x >= cols) continue;
      if (hasLineOfSight(map, playerPos, { x, y })) visible.add(`${x},${y}`);
    }
  }
  return map.map((row, y) =>
    row.map((tile, x) => {
      const isVis = visible.has(`${x},${y}`);
      if (isVis) return { ...tile, visible: true, seen: true };
      if (tile.visible) return { ...tile, visible: false };
      return tile;
    })
  );
}

export function withVisibility(state: GameState): GameState {
  const baseRadius = visionRadiusFor(state.player.characterClass, state.player.stats.level);
  const passives = computeBagPassives(state.player.inventory);
  const radius = Math.max(1, baseRadius + passives.losBonus);
  let newMap = computeVisibility(state.map, state.player.pos, radius);
  if (passives.trueVision) {
    for (const enemy of state.enemies) {
      const { x, y } = enemy.pos;
      if (newMap[y]?.[x]) {
        newMap = newMap.map((row, ry) =>
          ry === y ? row.map((tile, rx) => rx === x ? { ...tile, visible: true, seen: true } : tile) : row
        );
      }
    }
  }
  return { ...state, map: newMap };
}

export const PLAYER_PASSABLE_TILES = new Set(['floor', 'stairs', 'door-open', 'grass', 'shrine', 'shrine-used', 'safe-floor', 'shop-item', 'restaurant', 'boss-floor', 'campfire']);
export const ENEMY_PASSABLE_TILES = new Set(['floor', 'stairs', 'door-open', 'grass', 'boss-floor']);
export const MERMAN_PASSABLE_TILES = new Set(['water']);
export const PASSABLE_TILES = PLAYER_PASSABLE_TILES;

export function bfsNextStep(
  map: GameState['map'],
  from: Position,
  canSwim = false,
  blocked?: Set<string>,
): [number, number] | null {
  const passable = canSwim
    ? new Set([...PASSABLE_TILES, 'water'])
    : PASSABLE_TILES;
  const key = (p: Position) => `${p.x},${p.y}`;
  const DIRS: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  const queue: { pos: Position; first: [number, number] }[] = [];
  const queued = new Set<string>([key(from)]);

  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx, ny = from.y + dy;
    if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (!passable.has(map[ny][nx].type)) continue;
    const p = { x: nx, y: ny };
    const k = key(p);
    if (blocked?.has(k)) continue;
    if (!queued.has(k)) { queued.add(k); queue.push({ pos: p, first: [dx, dy] }); }
  }

  while (queue.length > 0) {
    const { pos, first } = queue.shift()!;
    if (!map[pos.y][pos.x].seen) return first;
    for (const [dx, dy] of DIRS) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (!passable.has(map[ny][nx].type)) continue;
      const p = { x: nx, y: ny };
      const k = key(p);
      if (blocked?.has(k)) continue;
      if (!queued.has(k)) { queued.add(k); queue.push({ pos: p, first }); }
    }
  }
  return null;
}

export function bfsNextStepWallHug(
  map: GameState['map'],
  from: Position,
  canSwim = false,
  blocked?: Set<string>,
): [number, number] | null {
  const passable = canSwim
    ? new Set([...PASSABLE_TILES, 'water'])
    : PASSABLE_TILES;
  const DIRS: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  const isNearWall = (x: number, y: number) =>
    DIRS.some(([dy, dx]) => {
      const ny = y + dy, nx = x + dx;
      return ny >= 0 && ny < map.length && nx >= 0 && nx < map[0].length
        && map[ny][nx].type === 'wall';
    });
  const key = (p: Position) => `${p.x},${p.y}`;
  const dist = new Map<string, number>();
  const heap: { pos: Position; first: [number, number]; cost: number }[] = [];

  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx, ny = from.y + dy;
    if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (!passable.has(map[ny][nx].type)) continue;
    const k = key({ x: nx, y: ny });
    if (blocked?.has(k)) continue;
    const cost = isNearWall(nx, ny) ? 1 : 3;
    if (!dist.has(k) || cost < dist.get(k)!) {
      dist.set(k, cost);
      heap.push({ pos: { x: nx, y: ny }, first: [dx, dy], cost });
    }
  }
  heap.sort((a, b) => a.cost - b.cost);

  while (heap.length > 0) {
    const { pos, first: f, cost } = heap.shift()!;
    const pk = key(pos);
    if (dist.get(pk) !== cost) continue;
    if (!map[pos.y][pos.x].seen) return f;
    for (const [dx, dy] of DIRS) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (!passable.has(map[ny][nx].type)) continue;
      const nk = key({ x: nx, y: ny });
      if (blocked?.has(nk)) continue;
      const moveCost = isNearWall(nx, ny) ? 1 : 3;
      const newCost = cost + moveCost;
      if (!dist.has(nk) || newCost < dist.get(nk)!) {
        dist.set(nk, newCost);
        heap.push({ pos: { x: nx, y: ny }, first: f, cost: newCost });
        heap.sort((a, b) => a.cost - b.cost);
      }
    }
  }
  return null;
}

export function hasLOS(map: GameState['map'], from: Position, dx: number, dy: number, range: number): boolean {
  for (let n = 1; n < range; n++) {
    const tx = from.x + dx * n;
    const ty = from.y + dy * n;
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return false;
    if (map[ty][tx].type === 'wall') return false;
  }
  return true;
}

export function hasLOSBetween(map: GameState['map'], from: Position, to: Position): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let n = 1; n < steps; n++) {
    const tx = Math.round(from.x + (dx * n) / steps);
    const ty = Math.round(from.y + (dy * n) / steps);
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return false;
    if (map[ty][tx].type === 'wall') return false;
  }
  return true;
}

export function detectionRadius(speed: number): number {
  return 3 + Math.floor(speed / 3);
}

export function bfsStepToward(
  map: GameState['map'],
  from: Position,
  target: Position,
  occupied: Set<string>,
  passable: Set<string> = ENEMY_PASSABLE_TILES,
): Position | null {
  const key = (p: Position) => `${p.x},${p.y}`;
  const targetKey = key(target);
  const DIRS: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  const queue: { pos: Position; first: Position }[] = [];
  const seen = new Set<string>([key(from)]);

  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx, ny = from.y + dy;
    if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (!passable.has(map[ny][nx].type)) continue;
    const p = { x: nx, y: ny };
    const k = key(p);
    if (seen.has(k)) continue;
    if (occupied.has(k) && k !== targetKey) continue;
    seen.add(k);
    queue.push({ pos: p, first: p });
  }

  while (queue.length > 0) {
    const { pos, first } = queue.shift()!;
    if (key(pos) === targetKey) return first;
    for (const [dx, dy] of DIRS) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (!passable.has(map[ny][nx].type)) continue;
      const p = { x: nx, y: ny };
      const k = key(p);
      if (seen.has(k)) continue;
      if (occupied.has(k) && k !== targetKey) continue;
      seen.add(k);
      queue.push({ pos: p, first });
    }
  }
  return null;
}

export function fleeStep(
  map: GameState['map'],
  from: Position,
  threat: Position,
  occupied: Set<string>,
  passable: Set<string> = ENEMY_PASSABLE_TILES,
): Position | null {
  const DIRS: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  let best: Position | null = null;
  let bestDist = chebyshev(from, threat);
  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx;
    const ny = from.y + dy;
    if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (!passable.has(map[ny][nx].type)) continue;
    if (occupied.has(`${nx},${ny}`)) continue;
    const d = chebyshev({ x: nx, y: ny }, threat);
    if (d > bestDist) {
      bestDist = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

export interface EnemyTurnResult {
  enemies: Enemy[];
  playerHp: number;
  playerDied: boolean;
  killer?: { name: string; emoji: string };
  newLogs: Array<{ id: string; text: string; turn: number }>;
  newFloatingTexts: FloatingText[];
  placedBombs: PlacedBomb[];
  activeProjectile: ActiveProjectile | null;
  explosionPositions: Position[];
  kitePos?: Position;
  trailblazerCooldown?: number;
  moodDrain: number;
  playerInventoryRemovals: string[];
  playerInventoryAdditions: EmojiItem[];
  enemyBeam?: { positions: Position[]; color: string };
}

export const _flashSignals = {
  berserkFlashPending: null as string | null,
  emojilessFlashPending: false,
  divineFlashPending: null as string | null,
  pendingFairyId: null as string | null,
  pressureFlashPending: false,
};

export const DIVINE_INSPIRE_RADIUS = 4;

export function handleGodBlessedImmunity(
  enemy: Enemy,
  enemies: Enemy[],
  enemyIndex: number,
  playerHp: number,
  turn: number,
  log: (msg: string) => void,
  floats: FloatingText[],
): { proc: boolean; newPlayerHp: number; newEnemies: Enemy[] } {
  if (!enemy.godBlessed) return { proc: false, newPlayerHp: playerHp, newEnemies: enemies };
  _flashSignals.divineFlashPending = enemy.id;
  const counterDmg = Math.round(enemy.attack * 1.5);
  log(`✨ Divine Intervention! ${enemy.emoji} ${enemy.name} is shielded by the gods — clings to 1 HP!`);
  log(`⚡ ${enemy.emoji} ${enemy.name} counter-attacks for ${counterDmg} damage! (auto-hit)`);
  floats.push({ id: `divine-${enemy.id}-${turn}`, pos: { ...enemy.pos }, text: '✨ DIVINE!', color: '#fcd34d', life: 3 });
  const newPlayerHp = Math.max(0, playerHp - counterDmg);
  const newEnemies = enemies.map((e, i) => {
    if (i === enemyIndex) return { ...e, hp: 1, godBlessed: false, engaged: true };
    if (e.id !== enemy.id && chebyshev(e.pos, enemy.pos) <= DIVINE_INSPIRE_RADIUS) {
      log(`✨ ${e.emoji} ${e.name} is divinely inspired! (+25% next attack)`);
      return { ...e, divineBuff: 1.25, engaged: true };
    }
    return e;
  });
  return { proc: true, newPlayerHp, newEnemies };
}

export function runEnemyTurns(state: GameState, skipId?: string): EnemyTurnResult {
  const { player, map } = state;
  const effectivePlayer = applyEquipmentAndPassives(player);
  const newEnemies = [...state.enemies];
  let playerHp = player.stats.hp;
  let playerDied = false;
  let killer: { name: string; emoji: string } | undefined;
  const newLogs: Array<{ id: string; text: string; turn: number }> = [];
  const newFloatingTexts: FloatingText[] = [];
  const explosionPositions: Position[] = [];
  let moodDrain = 0;
  const playerInventoryRemovals: string[] = [];
  const playerInventoryAdditions: EmojiItem[] = [];

  const log = (text: string) =>
    newLogs.push({ id: Math.random().toString(), text, turn: state.turn });

  let newBombs: PlacedBomb[] = [];
  let enemyBeam: { positions: Position[]; color: string } | undefined;
  for (const bomb of state.placedBombs) {
    const newCount = bomb.countdown - 1;
    if (newCount <= 0) {
      log(`💥 BOOM! The bomb explodes!`);
      newFloatingTexts.push({
        id: `bomb-exp-${bomb.id}`,
        pos: { ...bomb.pos },
        text: '💥',
        color: '#f97316',
        life: 3,
      });
      for (let fy = bomb.pos.y - bomb.radius; fy <= bomb.pos.y + bomb.radius; fy++) {
        for (let fx = bomb.pos.x - bomb.radius; fx <= bomb.pos.x + bomb.radius; fx++) {
          if (chebyshev({ x: fx, y: fy }, bomb.pos) <= bomb.radius) {
            explosionPositions.push({ x: fx, y: fy });
          }
        }
      }
      for (let ei = newEnemies.length - 1; ei >= 0; ei--) {
        const e = newEnemies[ei];
        if (chebyshev(e.pos, bomb.pos) <= bomb.radius) {
          const dmg = Math.max(1, player.stats.attack * 2 - (e.defense ?? 0));
          const newHp = e.hp - dmg;
          log(`💥 Explosion hits ${e.emoji} ${e.name} for ${dmg} dmg!`);
          newFloatingTexts.push({ id: `bomb-hit-${e.id}`, pos: { ...e.pos }, text: `-${dmg}`, color: '#f97316', life: 2 });
          if (newHp <= 0) {
            if (e.stolenEmojis?.length) {
              playerInventoryAdditions.push(...e.stolenEmojis);
              log(`🐒 ${e.name} dropped your ${e.stolenEmojis.map(s => s.emoji).join('')}!`);
            }
            newEnemies.splice(ei, 1);
          } else {
            newEnemies[ei] = { ...e, hp: newHp, engaged: true };
          }
        }
      }
    } else {
      newBombs.push({ ...bomb, countdown: newCount });
    }
  }

  let newProjectile: ActiveProjectile | null = state.activeProjectile;
  if (newProjectile) {
    const proj = newProjectile;
    const nextX = proj.pos.x + proj.dir.x;
    const nextY = proj.pos.y + proj.dir.y;
    const outOfBounds = nextY < 0 || nextY >= map.length || nextX < 0 || nextX >= map[0].length;
    const hitWall = !outOfBounds && map[nextY][nextX].type === 'wall';

    if (proj.phase === 'outgoing') {
      // Co-location check: an enemy may have stepped onto the boomerang's current tile
      // last turn (both moving 1 tile/turn toward each other — they "swap" positions and
      // the normal nextX/nextY check would miss entirely).
      const colocIdx = proj.traveled > 0
        ? newEnemies.findIndex(e => e.pos.x === proj.pos.x && e.pos.y === proj.pos.y)
        : -1;
      if (colocIdx !== -1) {
        const colocTarget = newEnemies[colocIdx];
        if (proj.kind === 'boomerang') {
          const bankBoomerangs = state.player.bank.filter(it => it.activeKind === 'boomerang' && !it.consumed).length;
          const boomerangMultiplier = Math.min(2.0, 1.0 + 0.25 * bankBoomerangs);
          const dmg = Math.max(1, Math.floor(player.stats.attack * boomerangMultiplier) - (colocTarget.defense ?? 0));
          const pctLabel = Math.round(boomerangMultiplier * 100);
          log(`🪃 Boomerang hits ${colocTarget.emoji} ${colocTarget.name} for ${dmg} dmg! (${pctLabel}% ATK)`);
          newFloatingTexts.push({ id: `boom-coloc-${colocTarget.id}`, pos: { ...colocTarget.pos }, text: `-${dmg}`, color: '#fde68a', life: 2 });
          const colocNewHp = colocTarget.hp - dmg;
          if (colocNewHp <= 0) { newEnemies.splice(colocIdx, 1); }
          else { newEnemies[colocIdx] = { ...colocTarget, hp: colocNewHp, engaged: true }; }
          newProjectile = { ...proj, dir: { x: -proj.dir.x, y: -proj.dir.y }, phase: 'returning', traveled: 0 };
        } else if (proj.kind === 'gun') {
          const dmg = Math.max(1, player.stats.attack - (colocTarget.defense ?? 0));
          log(`🔫 Bullet hits ${colocTarget.emoji} ${colocTarget.name} for ${dmg} dmg!`);
          newFloatingTexts.push({ id: `gun-coloc-${colocTarget.id}`, pos: { ...colocTarget.pos }, text: `-${dmg}`, color: '#ef4444', life: 2 });
          const colocNewHp = colocTarget.hp - dmg;
          if (colocNewHp <= 0) { newEnemies.splice(colocIdx, 1); } else { newEnemies[colocIdx] = { ...colocTarget, hp: colocNewHp, engaged: true }; }
          newProjectile = null;
        } else if (proj.kind === 'freeze') {
          const dmg = Math.max(1, player.stats.attack - (colocTarget.defense ?? 0));
          log(`❄️ Freeze hits ${colocTarget.emoji} ${colocTarget.name} for ${dmg} dmg! Frozen for 3 turns!`);
          newFloatingTexts.push({ id: `freeze-coloc-${colocTarget.id}`, pos: { ...colocTarget.pos }, text: `❄️-${dmg}`, color: '#93c5fd', life: 2 });
          const colocNewHp = colocTarget.hp - dmg;
          if (colocNewHp <= 0) { newEnemies.splice(colocIdx, 1); } else { newEnemies[colocIdx] = { ...colocTarget, hp: colocNewHp, engaged: true, frozenTurns: 3, slowedTurns: 0 }; }
          newProjectile = null;
        }
        // bomb co-location: AOE still triggers below via nextX/nextY on the next tick
      } else if (outOfBounds || hitWall || proj.traveled >= proj.maxRange) {
        if (proj.kind === 'boomerang') {
          newProjectile = {
            ...proj,
            pos: { x: nextX, y: nextY },
            dir: { x: -proj.dir.x, y: -proj.dir.y },
            phase: 'returning',
            traveled: 0,
          };
        } else {
          newProjectile = null;
        }
      } else {
        const hitIdx = newEnemies.findIndex(e => e.pos.x === nextX && e.pos.y === nextY);
        if (hitIdx !== -1) {
          const target = newEnemies[hitIdx];
          if (proj.kind === 'gun') {
            const dmg = Math.max(1, player.stats.attack - (target.defense ?? 0));
            log(`🔫 Bullet hits ${target.emoji} ${target.name} for ${dmg} dmg!`);
            newFloatingTexts.push({ id: `gun-hit-${target.id}`, pos: { ...target.pos }, text: `-${dmg}`, color: '#ef4444', life: 2 });
            const newHp = target.hp - dmg;
            if (newHp <= 0) {
              newEnemies.splice(hitIdx, 1);
            } else {
              newEnemies[hitIdx] = { ...target, hp: newHp, engaged: true };
            }
            newProjectile = null;
          } else if (proj.kind === 'freeze') {
            const dmg = Math.max(1, player.stats.attack - (target.defense ?? 0));
            log(`❄️ Freeze hits ${target.emoji} ${target.name} for ${dmg} dmg! Frozen for 3 turns!`);
            newFloatingTexts.push({ id: `freeze-hit-${target.id}`, pos: { ...target.pos }, text: `❄️-${dmg}`, color: '#93c5fd', life: 2 });
            const newHp = target.hp - dmg;
            if (newHp <= 0) {
              newEnemies.splice(hitIdx, 1);
            } else {
              newEnemies[hitIdx] = { ...target, hp: newHp, engaged: true, frozenTurns: 3, slowedTurns: 0 };
            }
            newProjectile = null;
          } else if (proj.kind === 'boomerang') {
            const bankBoomerangs = state.player.bank.filter(it => it.activeKind === 'boomerang' && !it.consumed).length;
            const boomerangMultiplier = Math.min(2.0, 1.0 + 0.25 * bankBoomerangs);
            const dmg = Math.max(1, Math.floor(player.stats.attack * boomerangMultiplier) - (target.defense ?? 0));
            const pctLabel = Math.round(boomerangMultiplier * 100);
            log(`🪃 Boomerang hits ${target.emoji} ${target.name} for ${dmg} dmg! (${pctLabel}% ATK)`);
            newFloatingTexts.push({ id: `boom-hit-${target.id}`, pos: { ...target.pos }, text: `-${dmg}`, color: '#fde68a', life: 2 });
            const newHp = target.hp - dmg;
            if (newHp <= 0) {
              newEnemies.splice(hitIdx, 1);
            } else {
              newEnemies[hitIdx] = { ...target, hp: newHp, engaged: true };
            }
            newProjectile = {
              ...proj,
              pos: { x: nextX, y: nextY },
              dir: { x: -proj.dir.x, y: -proj.dir.y },
              phase: 'returning',
              traveled: 0,
            };
          } else if (proj.kind === 'bomb') {
            // Instant 3×3 AOE explosion on hitting an enemy
            const blastPos = { x: nextX, y: nextY };
            const blastRadius = 1;
            log(`💥 BOOM! Bomb detonates on ${target.emoji} ${target.name}!`);
            newFloatingTexts.push({ id: `bomb-proj-exp-${proj.id}`, pos: { ...blastPos }, text: '💥', color: '#f97316', life: 3 });
            for (let fy = blastPos.y - blastRadius; fy <= blastPos.y + blastRadius; fy++) {
              for (let fx = blastPos.x - blastRadius; fx <= blastPos.x + blastRadius; fx++) {
                if (chebyshev({ x: fx, y: fy }, blastPos) <= blastRadius) {
                  explosionPositions.push({ x: fx, y: fy });
                }
              }
            }
            const bombAtk = player.stats.attack * 2;
            for (let ei = newEnemies.length - 1; ei >= 0; ei--) {
              const e = newEnemies[ei];
              if (chebyshev(e.pos, blastPos) <= blastRadius) {
                const dmg = Math.max(1, bombAtk - (e.defense ?? 0));
                log(`💥 Explosion hits ${e.emoji} ${e.name} for ${dmg} dmg!`);
                newFloatingTexts.push({ id: `bomb-proj-hit-${e.id}`, pos: { ...e.pos }, text: `-${dmg}`, color: '#f97316', life: 2 });
                const newHp = e.hp - dmg;
                if (newHp <= 0) {
                  if (e.stolenEmojis?.length) {
                    playerInventoryAdditions.push(...e.stolenEmojis);
                    log(`🐒 ${e.name} dropped your ${e.stolenEmojis.map(s => s.emoji).join('')}!`);
                  }
                  newEnemies.splice(ei, 1);
                } else {
                  newEnemies[ei] = { ...e, hp: newHp, engaged: true };
                }
              }
            }
            // Player caught in blast?
            if (chebyshev(player.pos, blastPos) <= blastRadius) {
              const selfDmg = Math.max(1, bombAtk);
              playerHp = Math.max(0, playerHp - selfDmg);
              log(`💥 You're caught in your own explosion! -${selfDmg} HP!`);
              newFloatingTexts.push({ id: `bomb-self-${proj.id}`, pos: { ...player.pos }, text: `-${selfDmg}`, color: '#f97316', life: 2 });
              if (playerHp <= 0) { playerDied = true; killer = { name: 'your own bomb', emoji: '💣' }; }
            }
            newProjectile = null;
          }
        } else {
          newProjectile = { ...proj, pos: { x: nextX, y: nextY }, traveled: proj.traveled + 1 };
        }
      }
    } else {
      if (outOfBounds || hitWall) {
        newProjectile = null;
      } else if (nextX === player.pos.x && nextY === player.pos.y) {
        log('🪃 The boomerang returns to your hand!');
        newProjectile = null;
      } else {
        newProjectile = { ...proj, pos: { x: nextX, y: nextY }, traveled: proj.traveled + 1 };
        if (proj.traveled >= proj.maxRange * 2) newProjectile = null;
      }
    }
  }

  const occupied = new Set<string>(state.enemies.map(e => `${e.pos.x},${e.pos.y}`));

  const playerOnWater = map[player.pos.y]?.[player.pos.x]?.type === 'water';
  const playerNearWater = playerOnWater || [[-1,0],[1,0],[0,-1],[0,1]].some(
    ([dx, dy]: [number,number]) => map[player.pos.y + dy]?.[player.pos.x + dx]?.type === 'water'
  );

  const _freezePassives = computeBagPassives(state.player.inventory);
  if (_freezePassives.freezeAura) {
    for (let i = 0; i < newEnemies.length; i++) {
      if (chebyshev(newEnemies[i].pos, state.player.pos) <= 1 && (newEnemies[i].slowedTurns ?? 0) < 2) {
        newEnemies[i] = { ...newEnemies[i], slowedTurns: 2, slowSkipNext: false };
      }
    }
  }
  const regen = _freezePassives.combatRegen || 0;
  if (regen > 0 && playerHp < player.stats.maxHp) {
    playerHp = Math.min(player.stats.maxHp, playerHp + regen);
  }
  if (_freezePassives.regeneration > 0 && state.turn % Math.max(1, 6 - _freezePassives.regeneration) === 0 && playerHp < player.stats.maxHp) {
    playerHp = Math.min(player.stats.maxHp, playerHp + 1);
    log('💊 You regenerate! (+1 HP)');
  }
  const _soulCount = player.inventory.filter(i => !i.consumed && !i.isEquipment && i.bagPassive && !i.activeKind && i.healAmount == null && i.ammoAmount == null).length;
  if (_soulCount === 0) {
    const _emojilessDmg = state.currentFloor;
    playerHp -= _emojilessDmg;
    log(`💀 You are emoji-less! Taking ${_emojilessDmg} dmg/turn (floor ${state.currentFloor}). Find an emoji or die!`);
    _flashSignals.emojilessFlashPending = true;
    if (playerHp <= 0) { playerDied = true; killer = { name: 'the void', emoji: '💀' }; }
  }

  for (let i = 0; i < newEnemies.length; i++) {
    const enemy = newEnemies[i];

    if (enemy.id === skipId) continue;

    if ((enemy.burningTurns ?? 0) > 0) {
      const newBurning = enemy.burningTurns! - 1;
      const newHp = enemy.hp - 1;
      if (newHp <= 0) {
        if (enemy.stolenEmojis?.length) {
          playerInventoryAdditions.push(...enemy.stolenEmojis);
          log(`🐒 ${enemy.name} dropped your ${enemy.stolenEmojis.map(s => s.emoji).join('')}!`);
        }
        newEnemies[i] = { ...enemy, hp: 0, burningTurns: 0 };
        log(`🔥 ${enemy.name} burns to ash!`);
        continue;
      }
      newEnemies[i] = { ...enemy, hp: newHp, burningTurns: newBurning };
      if (newBurning === 0) log(`🔥 ${enemy.name} stops burning.`);
      else log(`🔥 ${enemy.name} burns! (−1 hp)`);
    }

    if ((enemy.frozenTurns ?? 0) > 0) {
      const newFrozen = (enemy.frozenTurns ?? 1) - 1;
      const gains = newFrozen === 0 ? { slowedTurns: 3, slowSkipNext: false } : {};
      if (newFrozen === 0) log(`${enemy.emoji} ${enemy.name} thaws — but is slowed!`);
      newEnemies[i] = { ...enemy, frozenTurns: newFrozen, ...gains };
      continue;
    }
    if ((enemy.webbedTurns ?? 0) > 0) {
      newEnemies[i] = { ...enemy, webbedTurns: (enemy.webbedTurns ?? 1) - 1 };
      continue;
    }
    if ((enemy.paralyzedTurns ?? 0) > 0) {
      newEnemies[i] = { ...enemy, paralyzedTurns: (enemy.paralyzedTurns ?? 1) - 1 };
      continue;
    }

    if ((enemy.slowedTurns ?? 0) > 0) {
      const newSlowed = (enemy.slowedTurns ?? 1) - 1;
      if (enemy.slowSkipNext) {
        newEnemies[i] = { ...enemy, slowedTurns: newSlowed, slowSkipNext: false };
        continue;
      } else {
        newEnemies[i] = { ...enemy, slowedTurns: newSlowed, slowSkipNext: true };
      }
    }

    occupied.delete(`${enemy.pos.x},${enemy.pos.y}`);

    const dist = chebyshev(enemy.pos, player.pos);
    const playerKey = `${player.pos.x},${player.pos.y}`;

    if (enemy.tag === 'Friendly') {
      if (enemy.isAdventurer) {
        const hostileTargets = newEnemies.filter((e, ei) =>
          ei !== i && e.hp > 0 && e.tag !== 'Friendly' && e.tag !== 'Neutral' &&
          e.engaged && chebyshev(e.pos, player.pos) <= 6
        );
        hostileTargets.sort((a, b) => chebyshev(a.pos, enemy.pos) - chebyshev(b.pos, enemy.pos));
        const advTarget = hostileTargets[0];
        if (advTarget) {
          const distToTarget = chebyshev(enemy.pos, advTarget.pos);
          if (distToTarget <= 1) {
            const ti = newEnemies.findIndex(e => e.id === advTarget.id);
            const dmg = Math.max(1, enemy.attack - Math.floor((advTarget.defense ?? 0) / 2));
            const newTargetHp = advTarget.hp - dmg;
            newFloatingTexts.push({ id: `adv-${enemy.id}-${state.turn}`, pos: { ...advTarget.pos }, text: `-${dmg}`, color: '#22d3ee', life: 2 });
            if (newTargetHp <= 0) {
              newEnemies[ti] = { ...advTarget, hp: 0 };
              log(`🤝 ${enemy.emoji} ${enemy.name} takes down ${advTarget.emoji} ${advTarget.name}!`);
            } else {
              newEnemies[ti] = { ...advTarget, hp: newTargetHp };
            }
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          } else {
            const nextPos = bfsStepToward(map, enemy.pos, advTarget.pos, occupied);
            if (nextPos) {
              newEnemies[i] = { ...newEnemies[i], pos: nextPos };
              occupied.add(`${nextPos.x},${nextPos.y}`);
            } else {
              occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
            }
          }
        } else if (dist > 3) {
          const nextPos = bfsStepToward(map, enemy.pos, player.pos, occupied);
          if (nextPos && !(nextPos.x === player.pos.x && nextPos.y === player.pos.y)) {
            newEnemies[i] = { ...newEnemies[i], pos: nextPos };
            occupied.add(`${nextPos.x},${nextPos.y}`);
          } else {
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      } else {
        occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
      }
      continue;
    }

    if (enemy.waterAggro && !enemy.engaged && playerNearWater && dist <= 6) {
      newEnemies[i] = { ...newEnemies[i], engaged: true };
      log(`🧜‍♂️ ${enemy.emoji} ${enemy.name} senses your presence — turns hostile!`);
    }

    if (enemy.monkey && dist <= 1 && !playerDied) {
      const stealable = player.inventory.filter(i =>
        !i.consumed && !i.isEquipment && i.bagPassive && !i.activeKind &&
        i.healAmount == null && i.ammoAmount == null &&
        !playerInventoryRemovals.includes(i.id)
      );
      if (stealable.length > 0) {
        const stolen = stealable[Math.floor(Math.random() * stealable.length)];
        playerInventoryRemovals.push(stolen.id);
        const currentStolen = [...(newEnemies[i].stolenEmojis ?? []), stolen];
        newEnemies[i] = { ...newEnemies[i], stolenEmojis: currentStolen };
        log(`🐒 ${enemy.emoji} ${enemy.name} snatched your ${stolen.emoji}! (${currentStolen.length} stolen)`);
        newFloatingTexts.push({ id: `monkey-steal-${enemy.id}-${state.turn}-${Math.random()}`, pos: { ...enemy.pos }, text: '🐒💨', color: '#f59e0b', life: 2 });
      }
    }

    const baseDetectionRadius = detectionRadius(enemy.speed);
    const _bagPassivesDetect = computeBagPassives(state.player.inventory);
    const isStealthy = (state.stealthMode && state.player.characterClass === '🥷') || _bagPassivesDetect.stealthBonus > 0;
    // When player lingers in the restaurant 3×3 safe zone, every mob on the map aggroes —
    // the smell of food and activity draws everything in. They lose track once the player leaves.
    const playerNearRestaurant = nearRestaurant(map, player.pos) && !isStealthy;
    const enemyDetectionRadius = playerNearRestaurant
      ? 9999
      : isStealthy
        ? Math.max(1, Math.ceil(baseDetectionRadius / 2))
        : baseDetectionRadius + (_bagPassivesDetect.stealthPenalty > 0 ? 2 : 0);
    const HUNT_TURNS_BASE = 5;

    if (enemy.engaged && dist > enemyDetectionRadius) {
      const remaining = (enemy.huntTurns ?? HUNT_TURNS_BASE) - 1;
      if (remaining <= 0) {
        log(`💨 ${enemy.name} lost sight of you!`);
        newEnemies[i] = { ...newEnemies[i], engaged: false, alertedBlind: undefined, huntTurns: undefined, patrolTarget: undefined };
        occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        continue;
      }
    }

    const engagedAfterUpdate = newEnemies[i].engaged;
    const entersCombat = enemy.tag === 'Neutral'
      ? engagedAfterUpdate
      : (dist <= enemyDetectionRadius || enemy.engaged);
    if (entersCombat) {
      if (!enemy.engaged && dist <= enemyDetectionRadius && enemy.tag !== 'Neutral') {
        if (_freezePassives.royalAura && Math.random() < 0.20) {
          log(`👑 ${enemy.emoji} ${enemy.name} cowers before your royal aura!`);
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          continue;
        }
        const traitHint = enemy.cowardly
          ? ' ...it looks ready to bolt!'
          : enemy.berserker
            ? ' ...it looks enraged!'
            : enemy.packHunter
              ? ' ...it calls to its allies!'
              : '';
        log(`${enemy.emoji} ${enemy.name} spotted you!${traitHint}${enemy.silent ? ' 🔇 (lone hunter — won\'t call for help)' : ''}`);
        if (enemy.isEcho) {
          log('✨ A boss echo — tread carefully.');
        }
        newFloatingTexts.push({
          id: `spot-${enemy.id}-${state.turn}`,
          pos: { x: enemy.pos.x, y: enemy.pos.y },
          text: '❗',
          color: '#facc15',
          life: 2,
        });

        if (enemy.silent) {
        } else {
          const ALERT_RADIUS = state.currentFloor >= 3 ? 2 : 3;
          const MAX_ALERT_HOPS = state.currentFloor >= 6 ? 1 : 2;
          const alertQueue: Array<{ idx: number; hop: number }> = [{ idx: i, hop: 0 }];
          const alertedIndices = new Set<number>([i]);

          while (alertQueue.length > 0) {
            const { idx: alerterIdx, hop } = alertQueue.shift()!;
            if (hop >= MAX_ALERT_HOPS) continue;
            const alerterPos = newEnemies[alerterIdx].pos;

            for (let j = 0; j < newEnemies.length; j++) {
              if (alertedIndices.has(j)) continue;
              const ally = newEnemies[j];
              if (ally.engaged) continue;
              if (ally.silent) continue;
              if (chebyshev(ally.pos, alerterPos) <= ALERT_RADIUS) {
                newEnemies[j] = { ...ally, engaged: true, alertedBlind: true, huntTurns: HUNT_TURNS_BASE };
                alertedIndices.add(j);
                log(`🔊 ${ally.name} heard the commotion!`);
                newFloatingTexts.push({
                  id: `alert-${ally.id}-${state.turn}-${hop}`,
                  pos: { x: ally.pos.x, y: ally.pos.y },
                  text: '❗',
                  color: '#facc15',
                  life: 2,
                });
                alertQueue.push({ idx: j, hop: hop + 1 });
              }
            }
          }
        }
      }

      const huntTurns = dist <= enemyDetectionRadius
        ? HUNT_TURNS_BASE
        : Math.max(0, (enemy.huntTurns ?? HUNT_TURNS_BASE) - 1);
      const alertedBlind = enemy.alertedBlind && dist > enemyDetectionRadius ? true : undefined;
      let updated: Enemy = { ...newEnemies[i], engaged: true, huntTurns, alertedBlind };

      if (enemy.cowardly && enemy.hp / enemy.maxHp < 0.3) {
        const fleePos = fleeStep(map, updated.pos, player.pos, occupied);
        if (fleePos) {
          updated = { ...updated, pos: fleePos, patrolTarget: undefined };
          occupied.add(`${fleePos.x},${fleePos.y}`);
          log(`💨 ${enemy.emoji} ${enemy.name} is terrified and flees!`);
        } else {
          occupied.add(`${updated.pos.x},${updated.pos.y}`);
        }
        newEnemies[i] = updated;
        continue;
      }

      if (enemy.madScientist) {
        const newCd = Math.max(0, (newEnemies[i].healCooldown ?? 3) - 1);
        let msUpdated: Enemy = { ...updated, healCooldown: newCd };
        if (newCd <= 0) {
          const healTarget = newEnemies.find((a, ai) => ai !== i && a.hp < a.maxHp && hasLOSBetween(map, enemy.pos, a.pos));
          if (healTarget) {
            const healAmt = Math.max(1, Math.ceil(healTarget.maxHp * 0.3));
            const ti = newEnemies.findIndex(a => a.id === healTarget.id);
            newEnemies[ti] = { ...healTarget, hp: Math.min(healTarget.maxHp, healTarget.hp + healAmt) };
            log(`🧑‍🔬 ${enemy.emoji} ${enemy.name} injects ${healTarget.emoji} ${healTarget.name}! (+${healAmt} HP)`);
            newFloatingTexts.push({ id: `madsci-${enemy.id}-${state.turn}`, pos: { ...healTarget.pos }, text: `+${healAmt}`, color: '#34d399', life: 2 });
            msUpdated = { ...msUpdated, healCooldown: 3 };
          }
        }
        const fleeP = fleeStep(map, msUpdated.pos, player.pos, occupied);
        if (fleeP) { msUpdated = { ...msUpdated, pos: fleeP, patrolTarget: undefined }; occupied.add(`${fleeP.x},${fleeP.y}`); }
        else { occupied.add(`${msUpdated.pos.x},${msUpdated.pos.y}`); }
        newEnemies[i] = msUpdated;
        continue;
      }

      const packBonus = enemy.packHunter
        ? Math.min(3, newEnemies.filter((a, ai) => ai !== i && chebyshev(a.pos, enemy.pos) <= 2).length)
        : 0;
      if (packBonus > 0 && !newLogs.some(l => l.text.includes(`${enemy.name} hunts`))) {
        log(`🐾 ${enemy.emoji} ${enemy.name} hunts in a pack! (+${packBonus} ATK)`);
      }

      const divineMult = (updated.divineBuff ?? 0) > 0 ? updated.divineBuff! : 1;
      if (divineMult > 1) {
        log(`✨ ${enemy.emoji} ${enemy.name} strikes with divine fury! (+25% damage)`);
        updated = { ...updated, divineBuff: 0 };
      }
      const monkeyBonus = (enemy.monkey && newEnemies[i].engaged) ? (newEnemies[i].stolenEmojis?.length ?? 0) : 0;
      if (monkeyBonus > 0) log(`🐒 ${enemy.emoji} ${enemy.name} fights with your stolen emojis! (+${monkeyBonus} ATK)`);
      const effectiveAttack = Math.round((enemy.attack + packBonus + monkeyBonus) * divineMult);

      if (enemy.ranged && hasLOSBetween(map, enemy.pos, player.pos) && !playerDied) {
        // Simple visual line/flash for the arrow shot (reuses the pendingBeam system used by player ranger/wizard attacks)
        const dx = player.pos.x - enemy.pos.x;
        const dy = player.pos.y - enemy.pos.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
        const _aBeam: Position[] = [];
        for (let n = 1; n <= steps; n++) {
          _aBeam.push({
            x: Math.round(enemy.pos.x + (dx * n) / steps),
            y: Math.round(enemy.pos.y + (dy * n) / steps),
          });
        }
        enemyBeam = { positions: _aBeam, color: '#f59e0b' }; // warm elven arrow color

        if (enemy.ghostly) {
          moodDrain += 1;
          log(`👻 ${enemy.name}'s ethereal arrow chills your soul! (mood −1)`);
        }
        const dodgeChance = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
        if (Math.random() * 100 < dodgeChance) {
          log(`The ${enemy.name} shoots an arrow — you dodge!`);
        } else {
          const dmg = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
          playerHp -= dmg;
          log(`The ${enemy.name} shoots an arrow at you for ${dmg} damage!`);
          if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
          newFloatingTexts.push({
            id: `hit-p-${enemy.id}-ranged-${state.turn}-${Math.random()}`,
            pos: { ...player.pos },
            text: `-${dmg}`,
            color: '#f97316',
            life: 2,
          });
          if (enemy.berserker && !playerDied) {
            const dodgeChance2 = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
            if (Math.random() * 100 < dodgeChance2) {
              log(`🔥 The ${enemy.name} shoots an arrow again — you dodge!`);
            } else {
              const dmg2 = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
              playerHp -= dmg2;
              log(`🔥 The ${enemy.name} shoots an arrow again for ${dmg2} damage! (Berserk!)`);
              if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
              newFloatingTexts.push({
                id: `hit-p-${enemy.id}-ranged-berserk-${state.turn}-${Math.random()}`,
                pos: { ...player.pos },
                text: `-${dmg2}`,
                color: '#dc2626',
                life: 2,
              });
            }
            _flashSignals.berserkFlashPending = enemy.id;
          }
        }
        occupied.add(`${updated.pos.x},${updated.pos.y}`);
        newEnemies[i] = updated;
        continue;
      }

      if (dist <= 1) {
        if (enemy.ghostly) {
          moodDrain += 1;
          log(`👻 ${enemy.name}'s ethereal touch chills your soul! (mood −1)`);
        }
        const dodgeChance = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
        if (Math.random() * 100 < dodgeChance) {
          log(`${enemy.emoji} ${enemy.name} attacks — you dodge!`);
        } else {
          const dmg = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
          playerHp -= dmg;
          log(`${enemy.emoji} ${enemy.name} hits you for ${dmg} dmg!`);
          if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
          newFloatingTexts.push({
            id: `hit-p-${enemy.id}-adj-${state.turn}-${Math.random()}`,
            pos: { ...player.pos },
            text: `-${dmg}`,
            color: '#f97316',
            life: 2,
          });
          if (enemy.berserker && !playerDied) {
            const dodgeChance2 = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
            if (Math.random() * 100 < dodgeChance2) {
              log(`🔥 ${enemy.emoji} ${enemy.name} attacks again — you dodge!`);
            } else {
              const dmg2 = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
              playerHp -= dmg2;
              log(`🔥 ${enemy.emoji} ${enemy.name} attacks again for ${dmg2} dmg! (Berserk!)`);
              if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
              newFloatingTexts.push({
                id: `hit-p-${enemy.id}-berserk-${state.turn}-${Math.random()}`,
                pos: { ...player.pos },
                text: `-${dmg2}`,
                color: '#dc2626',
                life: 2,
              });
            }
            _flashSignals.berserkFlashPending = enemy.id;
          }
        }
        occupied.add(`${updated.pos.x},${updated.pos.y}`);
      } else {
        const nextPos = enemy.waterAggro
          ? bfsStepToward(map, enemy.pos, player.pos, occupied, MERMAN_PASSABLE_TILES)
          : bfsStepToward(map, enemy.pos, player.pos, occupied);
        if (nextPos && !(nextPos.x === player.pos.x && nextPos.y === player.pos.y)) {
          updated = { ...updated, pos: nextPos, patrolTarget: undefined };
          occupied.add(`${nextPos.x},${nextPos.y}`);

          if (chebyshev(nextPos, player.pos) <= 1) {
            if (enemy.ghostly) {
              moodDrain += 1;
              log(`👻 ${enemy.name}'s ethereal touch chills your soul! (mood −1)`);
            }
            const dodgeChance = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
            if (Math.random() * 100 < dodgeChance) {
              log(`${enemy.emoji} ${enemy.name} lunges — you dodge!`);
            } else {
              const dmg = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
              playerHp -= dmg;
              log(`${enemy.emoji} ${enemy.name} lunges at you for ${dmg} dmg!`);
              if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
              newFloatingTexts.push({
                id: `hit-p-${enemy.id}-lunge-${state.turn}-${Math.random()}`,
                pos: { ...player.pos },
                text: `-${dmg}`,
                color: '#f97316',
                life: 2,
              });
              if (enemy.berserker && !playerDied) {
                const dodgeChance2 = player.characterClass === '🥷' ? computeNinjaEvasion(effectivePlayer) : Math.min(50, effectivePlayer.stats.evasion ?? 0);
                if (Math.random() * 100 < dodgeChance2) {
                  log(`🔥 ${enemy.emoji} ${enemy.name} attacks again — you dodge!`);
                } else {
                  const dmg2 = Math.max(1, effectiveAttack - Math.floor((effectivePlayer.stats.defense ?? 0) / 2));
                  playerHp -= dmg2;
                  log(`🔥 ${enemy.emoji} ${enemy.name} attacks again for ${dmg2} dmg! (Berserk!)`);
                  if (playerHp <= 0) { playerDied = true; killer ??= { name: enemy.name, emoji: enemy.emoji }; }
                  newFloatingTexts.push({
                    id: `hit-p-${enemy.id}-lunge-berserk-${state.turn}-${Math.random()}`,
                    pos: { ...player.pos },
                    text: `-${dmg2}`,
                    color: '#dc2626',
                    life: 2,
                  });
                }
                _flashSignals.berserkFlashPending = enemy.id;
              }
            }
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      }
      newEnemies[i] = updated;
    } else {
      let updated: Enemy = { ...newEnemies[i] };

      if (enemy.waterAggro) {
        let target = enemy.patrolTarget;
        const atTarget = target && target.x === enemy.pos.x && target.y === enemy.pos.y;
        if (!target || atTarget) {
          const waterTiles: Position[] = [];
          for (let wy = 1; wy < map.length - 1; wy++) {
            for (let wx = 1; wx < map[0].length - 1; wx++) {
              if (map[wy][wx].type === 'water') waterTiles.push({ x: wx, y: wy });
            }
          }
          if (waterTiles.length > 0) {
            target = waterTiles[Math.floor(Math.random() * waterTiles.length)];
            updated = { ...updated, patrolTarget: target };
          }
        }
        if (target) {
          const nextPos = bfsStepToward(map, enemy.pos, target, occupied, MERMAN_PASSABLE_TILES);
          if (nextPos && `${nextPos.x},${nextPos.y}` !== playerKey) {
            updated = { ...updated, pos: nextPos };
            occupied.add(`${nextPos.x},${nextPos.y}`);
          } else {
            updated = { ...updated, patrolTarget: undefined };
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      } else {
        const bounds = enemy.spawnRoomBounds;

        if (bounds) {
          let target = enemy.patrolTarget;
          const atTarget = target && target.x === enemy.pos.x && target.y === enemy.pos.y;
          if (!target || atTarget) {
            const rx = bounds.x + 1 + Math.floor(Math.random() * Math.max(1, bounds.w - 2));
            const ry = bounds.y + 1 + Math.floor(Math.random() * Math.max(1, bounds.h - 2));
            target = { x: rx, y: ry };
            updated = { ...updated, patrolTarget: target };
          }

          const nextPos = bfsStepToward(map, enemy.pos, target, occupied);
          if (nextPos && `${nextPos.x},${nextPos.y}` !== playerKey) {
            updated = { ...updated, pos: nextPos };
            occupied.add(`${nextPos.x},${nextPos.y}`);
          } else {
            updated = { ...updated, patrolTarget: undefined };
            occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
          }
        } else {
          occupied.add(`${enemy.pos.x},${enemy.pos.y}`);
        }
      }

      newEnemies[i] = updated;
    }
  }

  let kitePos: Position | undefined;
  let trailblazerCooldown = Math.max(0, (player.trailblazerCooldown ?? 0) - 1);
  if (!playerDied && player.characterClass === '🧝') {
    const wasAdjacent = new Set(state.enemies.filter(e => chebyshev(e.pos, player.pos) <= 1).map(e => e.id));
    const trigger = newEnemies.find(e => chebyshev(e.pos, player.pos) <= 1 && !wasAdjacent.has(e.id));
    if (trigger) {
      if (trailblazerCooldown > 0) {
        log(`🧝 Trailblazer on cooldown (${trailblazerCooldown} turns)!`);
      } else {
        const kiteOccupied = new Set(newEnemies.map(e => `${e.pos.x},${e.pos.y}`));
        const kp = fleeStep(map, player.pos, trigger.pos, kiteOccupied, PLAYER_PASSABLE_TILES);
        if (kp) {
          kitePos = kp;
          trailblazerCooldown = 3;
          log(`🧝 Trailblazer — you spring away from ${trigger.emoji}!`);
        }
      }
    }
  }

  return { enemies: newEnemies.filter(e => e.hp > 0), playerHp, playerDied, killer, newLogs, newFloatingTexts, placedBombs: newBombs, activeProjectile: newProjectile, explosionPositions, kitePos, trailblazerCooldown, moodDrain, playerInventoryRemovals, playerInventoryAdditions, enemyBeam };
}

export function applyEnemyTurns(state: GameState, result: EnemyTurnResult): GameState {
  const tickedTexts = state.floatingTexts
    .map(ft => ({ ...ft, life: ft.life - 1 }))
    .filter(ft => ft.life > 0);
  const mergedFloating = [...result.newFloatingTexts, ...tickedTexts];

  let newInventory = state.player.inventory;
  let newBank = state.player.bank;
  if (result.playerInventoryRemovals.length > 0) {
    newInventory = newInventory.filter(i => !result.playerInventoryRemovals.includes(i.id));
  }
  if (result.playerInventoryAdditions.length > 0) {
    const added = addToBag(newInventory, newBank, ...result.playerInventoryAdditions);
    newInventory = added.inventory;
    newBank = added.bank;
  }
  const newMoodValue = result.moodDrain > 0
    ? Math.max(-100, state.player.stats.moodValue - result.moodDrain)
    : state.player.stats.moodValue;
  const hasExtraChanges = result.playerInventoryRemovals.length > 0 || result.playerInventoryAdditions.length > 0 || result.moodDrain > 0;

  if (result.newLogs.length === 0 && result.playerHp === state.player.stats.hp && mergedFloating.length === 0 && state.floatingTexts.length === 0 && !hasExtraChanges) {
    return withVisibility({ ...state, enemies: result.enemies, floatingTexts: mergedFloating, placedBombs: result.placedBombs, activeProjectile: result.activeProjectile, pendingExplosion: result.explosionPositions.length > 0 ? result.explosionPositions : undefined, pendingBeam: result.enemyBeam ?? state.pendingBeam, player: { ...state.player, trailblazerCooldown: result.trailblazerCooldown } });
  }
  const mergedLogs = [...result.newLogs, ...state.logs].slice(0, 24);
  return withVisibility({
    ...state,
    enemies: result.enemies,
    player: {
      ...state.player,
      pos: result.kitePos ?? state.player.pos,
      stats: { ...state.player.stats, hp: result.playerHp, moodValue: newMoodValue },
      inventory: newInventory,
      bank: newBank,
      trailblazerCooldown: result.trailblazerCooldown,
    },
    logs: mergedLogs,
    floatingTexts: mergedFloating,
    gameOver: state.gameOver || result.playerDied,
    killer: state.killer ?? result.killer,
    placedBombs: result.placedBombs,
    activeProjectile: result.activeProjectile,
    pendingExplosion: result.explosionPositions.length > 0 ? result.explosionPositions : undefined,
    pendingBeam: result.enemyBeam ?? state.pendingBeam,
  });
}

export function isNonStackableBagPassiveDuplicate(item: EmojiItem, inv: EmojiItem[]): boolean {
  if (!item.bagPassive?.nonStackable) return false;
  return inv.some(i => !i.consumed && !i.isEquipment && i.emoji === item.emoji && !!i.bagPassive);
}

export function isActiveKindDuplicate(item: EmojiItem, inv: EmojiItem[]): boolean {
  if (!item.activeKind) return false;
  return inv.some(i => !i.consumed && i.emoji === item.emoji && i.activeKind);
}

export function addToBag(
  inv: EmojiItem[],
  bank: EmojiItem[],
  ...items: EmojiItem[]
): { inventory: EmojiItem[]; bank: EmojiItem[]; nonStackableBanked: EmojiItem[]; duplicateActiveBanked: EmojiItem[] } {
  const newInv = [...inv];
  const newBank = [...bank];
  const nonStackableBanked: EmojiItem[] = [];
  const duplicateActiveBanked: EmojiItem[] = [];
  for (const item of items) {
    if (item.isEquipment) { newBank.push(item); continue; }
    if (item.bagPassive?.nonStackable) {
      if (isNonStackableBagPassiveDuplicate(item, newInv)) { newBank.push(item); nonStackableBanked.push(item); continue; }
    }
    if (item.activeKind) {
      if (isActiveKindDuplicate(item, newInv)) { newBank.push(item); duplicateActiveBanked.push(item); continue; }
    }
    if (isStackableBagPassive(item)) {
      const cap = STACKABLE_BAG_CAPS[item.emoji] ?? 9;
      const existingIdx = newInv.findIndex(i => i.emoji === item.emoji && isStackableBagPassive(i));
      if (existingIdx !== -1) {
        const existing = newInv[existingIdx];
        const cur = existing.stackCount ?? 1;
        if (cur < cap) { newInv[existingIdx] = { ...existing, stackCount: cur + 1 }; continue; }
        else { newBank.push(item); continue; }
      }
    }
    const bagCount = newInv.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment).length;
    if (item.healAmount !== undefined || item.ammoAmount !== undefined || bagCount < 9) {
      newInv.push(item);
    } else {
      newBank.push(item);
    }
  }
  return { inventory: newInv, bank: newBank, nonStackableBanked, duplicateActiveBanked };
}

export function activeKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    gun: 'Gun', boomerang: 'Boomerang', rope: 'Rope', bomb: 'Bomb', freeze: 'Freeze Ray',
  };
  return labels[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function sortBagSlots(inv: EmojiItem[]): EmojiItem[] {
  const items = inv.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment);
  return [...items].sort((a, b) => {
    const score = (i: EmojiItem) => {
      if (i.consumed) return 3;
      if (i.activeKind) return 0;
      if ((i as any).effect || i.bagPassive?.nonStackable) return 1;
      if (isStackableBagPassive(i)) return 2;
      return 1;
    };
    return score(a) - score(b);
  });
}

export function refillBagFromBank(inventory: EmojiItem[], bank: EmojiItem[]): { inventory: EmojiItem[]; bank: EmojiItem[] } {
  if (bank.length === 0) return { inventory, bank };

  // First pass: try to merge any stackable at the front of the bank
  const [frontItem, ...rest] = bank;
  if (isStackableBagPassive(frontItem)) {
    const cap = STACKABLE_BAG_CAPS[frontItem.emoji] ?? 9;
    const existingIdx = inventory.findIndex(i => i.emoji === frontItem.emoji && isStackableBagPassive(i) && (i.stackCount ?? 1) < cap);
    if (existingIdx !== -1) {
      const newInv = inventory.map((it, i) => i === existingIdx ? { ...it, stackCount: (it.stackCount ?? 1) + 1 } : it);
      return { inventory: newInv, bank: rest };
    }
  }

  // Find first *safe* non-equipment item in bank to pull into bag.
  // Skip duplicates of nonStackable bag passives or activeKind items (only one allowed in hotbar/inventory).
  const bagCount = inventory.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment).length;
  if (bagCount >= 9) return { inventory, bank };
  const pullIdx = bank.findIndex(i =>
    !i.isEquipment &&
    !isNonStackableBagPassiveDuplicate(i, inventory) &&
    !isActiveKindDuplicate(i, inventory)
  );
  if (pullIdx === -1) return { inventory, bank };
  const pulled = bank[pullIdx];
  const newBank = [...bank.slice(0, pullIdx), ...bank.slice(pullIdx + 1)];
  return { inventory: [...inventory, pulled], bank: newBank };
}

export type BagPassiveSummary = {
  attack: number; defense: number; speed: number; evasion: number; luck: number;
  losBonus: number; stealthBonus: number; stealthPenalty: number;
  canSwim: boolean; burningOnHit: boolean; freezeAura: boolean; advantageDice: boolean;
  vampiricStrike: number; lightningBolt: boolean; thorns: number; bonusLoot: number;
  execBlow: boolean; trueVision: boolean; itemMagnet: boolean; shieldWall: number;
  healOnKill: number; trueAim: boolean; regeneration: number; ninjaCombo: number;
  royalAura: boolean; combatRegen: number; dodgeHeal: number;
};

export function computeBagPassives(inventory: EmojiItem[]): BagPassiveSummary {
  const acc = {
    attack: 0, defense: 0, speed: 0, evasion: 0, luck: 0,
    losBonus: 0, stealthBonus: 0, stealthPenalty: 0,
    canSwim: false, burningOnHit: false, freezeAura: false, advantageDice: false,
    vampiricStrike: 0, lightningBolt: false, thorns: 0, bonusLoot: 0,
    execBlow: false, trueVision: false, itemMagnet: false, shieldWall: 0,
    healOnKill: 0, trueAim: false, regeneration: 0, ninjaCombo: 0,
    royalAura: false, combatRegen: 0, dodgeHeal: 0,
  };
  for (const item of inventory) {
    if (item.consumed || item.isEquipment || !item.bagPassive || item.activeKind || item.healAmount != null || item.ammoAmount != null) continue;
    const p = item.bagPassive;
    acc.attack         += p.attackBonus    ?? 0;
    acc.defense        += p.defenseBonus   ?? 0;
    acc.speed          += p.speedBonus     ?? 0;
    acc.evasion        += p.evasionBonus   ?? 0;
    acc.luck           += p.luckBonus      ?? 0;
    acc.losBonus       += p.losBonus       ?? 0;
    acc.stealthBonus   += p.stealthBonus   ?? 0;
    acc.stealthPenalty += p.stealthPenalty ?? 0;
    const sc = isStackableBagPassive(item) ? (item.stackCount ?? 1) : 1;
    if (p.canSwim)        acc.canSwim        = true;
    if (p.burningOnHit)   acc.burningOnHit   = true;
    if (p.freezeAura)     acc.freezeAura     = true;
    if (p.advantageDice)  acc.advantageDice  = true;
    if (p.vampiricStrike) acc.vampiricStrike += sc;
    if (p.lightningBolt)  acc.lightningBolt  = true;
    if (p.thorns)         acc.thorns        += sc;
    if (p.bonusLoot)      acc.bonusLoot     += sc;
    if (p.execBlow)       acc.execBlow       = true;
    if (p.trueVision)     acc.trueVision     = true;
    if (p.itemMagnet)     acc.itemMagnet     = true;
    if (p.shieldWall)     acc.shieldWall    += sc;
    if (p.healOnKill)     acc.healOnKill    += sc;
    if (p.trueAim)        acc.trueAim        = true;
    if (p.regeneration)   acc.regeneration  += sc;
    if (p.ninjaCombo)     acc.ninjaCombo    += sc;
    if (p.royalAura)      acc.royalAura      = true;
    if (p.combatRegen)    acc.combatRegen   += sc;
    if (p.dodgeHeal)      acc.dodgeHeal     += sc;
  }
  return acc;
}

export function tickActiveBuffs(stats: import('./types').PlayerStats): import('./types').PlayerStats {
  if (!stats.activeBuffs?.length) return stats;
  const updated = stats.activeBuffs
    .map(b => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
    .filter(b => b.turnsLeft > 0);
  return { ...stats, activeBuffs: updated.length ? updated : undefined };
}

export function applyEquipmentAndPassives(player: Player): Player {
  const passives = computeBagPassives(player.inventory);
  const eq = player.equipment;
  const slots = [eq.body, eq.mainHand, eq.offHand, eq.accessory].filter(Boolean) as EmojiItem[];
  let eqAtk = 0, eqDef = 0, eqSpd = 0, eqEva = 0, eqLck = 0;
  for (const item of slots) {
    const b = item.equipBonus ?? {};
    eqAtk += b.attack  ?? 0;
    eqDef += b.defense ?? 0;
    eqSpd += b.speed   ?? 0;
    eqEva += b.evasion ?? 0;
    eqLck += b.luck    ?? 0;
    if (player.characterClass === '🤠' && item.bagPassive && !item.weaponKind && !item.armorKind) {
      eqAtk += item.bagPassive.attackBonus  ?? 0;
      eqDef += item.bagPassive.defenseBonus ?? 0;
      eqSpd += item.bagPassive.speedBonus   ?? 0;
      eqEva += item.bagPassive.evasionBonus ?? 0;
      eqLck += item.bagPassive.luckBonus    ?? 0;
    }
  }
  const buffAtk = (player.stats.activeBuffs ?? []).filter(b => b.stat === 'attack').reduce((s, b) => s + b.amount, 0);
  const buffDef = (player.stats.activeBuffs ?? []).filter(b => b.stat === 'defense').reduce((s, b) => s + b.amount, 0);
  return {
    ...player,
    stats: {
      ...player.stats,
      attack:  player.stats.attack  + passives.attack  + eqAtk + buffAtk,
      defense: player.stats.defense + passives.defense + eqDef + buffDef,
      speed:   player.stats.speed   + passives.speed   + eqSpd,
      evasion: player.stats.evasion + passives.evasion + eqEva,
      luck:    player.stats.luck    + passives.luck    + eqLck,
    },
  };
}

export { generateMap };
