import { chebyshev } from './geo';
import { isHostileCombatTarget } from './combat';
import { getItemSellValue } from './economy';
import { EMOJI_POWERS, getRandomEquipmentDrop } from './emojis';
import { addToPlayerBag } from './inventory';
import type { EmojiItem, Enemy, MapGrid, Player, Position } from './types';

/** Prairie grassland rooms show up from this depth through D:26. */
export const PRAIRIE_MIN_FLOOR = 3;
export const PRAIRIE_MAX_FLOOR = 26;
/** Chance a floor in that band grows one prairie room. */
export const PRAIRIE_FLOOR_CHANCE = 0.18;

export const GRASS_EMOJI = '🟩';
export const CROP_EMOJIS = ['🌱', '🪴', '🌽', '🌾'] as const;
/** Interior tiles (outside the walkable cross) that become blocking crops. */
export const CROP_DENSITY = 0.22;

export const FARM_DEFEND_RADIUS = 5;
/** Farmers and idle animals often hold still so the wander reads as aimless, not a patrol. */
export const FARM_WANDER_STAY_CHANCE = 0.42;

export const FARMER_VALUE_MULT = { cooked: 1.25, raw: 1.0, potion: 0.75 } as const;
export type FarmerPayKind = keyof typeof FARMER_VALUE_MULT;

const COW_CHANCE = 0.15;

const COMMON_ANIMALS = [
  { emoji: '🐕', name: 'Farm Dog', hp: 8, attack: 3, defense: 1, speed: 5 },
  { emoji: '🐈', name: 'Farm Cat', hp: 5, attack: 2, defense: 0, speed: 7 },
  { emoji: '🐔', name: 'Chicken', hp: 4, attack: 2, defense: 0, speed: 4 },
] as const;

const COW = { emoji: '🐄', name: 'Cow', hp: 16, attack: 4, defense: 2, speed: 2 } as const;

const DIRS: [number, number][] = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

export function prairieAppearsOnFloor(floor: number, roll: number): boolean {
  if (floor < PRAIRIE_MIN_FLOOR || floor > PRAIRIE_MAX_FLOOR) return false;
  return roll < PRAIRIE_FLOOR_CHANCE;
}

export function farmerRulesBlurb(): string {
  return 'Prairie grassland rooms appear on D:3–26, about an 18% chance each floor. The ground is green grass 🟩. Crops 🌱🪴🌽🌾 block movement but not sight or shots. A 🧑‍🌾 Farmer wanders the field and generally stays inside it. Bump into the farmer, or use the context action, to trade food and healing items — never gold — for 3–5 emoji goods. Cooked food is worth 1.25× its heal, raw food 1.0×, and potions 0.75×. Friendly animals (🐕🐈🐔, and rarely 🐄) attack hostiles and defend the farmer.';
}

type RoomBox = { x: number; y: number; w: number; h: number };

export function placePrairie(map: MapGrid, room: RoomBox, rng: () => number = Math.random): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  for (let ry = room.y; ry < room.y + room.h; ry++) {
    for (let rx = room.x; rx < room.x + room.w; rx++) {
      const tile = map[ry]?.[rx];
      if (!tile || (tile.type !== 'floor' && tile.type !== 'grass')) continue;
      map[ry][rx] = { type: 'grass', emoji: GRASS_EMOJI, seen: false, visible: false };
    }
  }
  for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
    for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
      if (rx === cx || ry === cy) continue;
      if (map[ry]?.[rx]?.type !== 'grass') continue;
      if (rng() >= CROP_DENSITY) continue;
      const emoji = CROP_EMOJIS[Math.floor(rng() * CROP_EMOJIS.length) % CROP_EMOJIS.length];
      map[ry][rx] = { type: 'crop', emoji, seen: false, visible: false };
    }
  }
}

export function farmerPayKind(item: EmojiItem): FarmerPayKind | null {
  if (item.consumed || item.healAmount === undefined) return null;
  if (item.drinkTier !== undefined || item.isMoneyBag || item.isEquipment) return null;
  if (item.isCooked || item.cookedBuff) return 'cooked';
  if (item.emoji === '🧪') return 'potion';
  return 'raw';
}

/** Heal amount times the cooked / raw / potion multiplier. 0 if the farmer will not take it. */
export function farmerTradeValue(item: EmojiItem): number {
  const kind = farmerPayKind(item);
  if (!kind || item.healAmount === undefined) return 0;
  return item.healAmount * FARMER_VALUE_MULT[kind];
}

export function farmerPayLabel(item: EmojiItem): string {
  const kind = farmerPayKind(item);
  if (kind === 'cooked') return 'Cooked ×1.25';
  if (kind === 'potion') return 'Potion ×0.75';
  if (kind === 'raw') return 'Raw ×1';
  return '';
}

export function formatTradePoints(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
}

/** What the farmer asks for a stocked emoji, in the same points food pays. */
export function farmerAskPrice(item: EmojiItem): number {
  const sell = getItemSellValue(item);
  return Math.max(4, Math.round(sell * 0.75));
}

export function payableFarmerItems(player: Player): EmojiItem[] {
  return [...player.inventory, ...player.bank].filter(i => farmerTradeValue(i) > 0);
}

export function rollFarmerStock(rng: () => number = Math.random): EmojiItem[] {
  const count = 3 + Math.floor(rng() * 3);
  const items: EmojiItem[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (items.length < count && guard++ < 80) {
    const raw = rng() < 0.35
      ? getRandomEquipmentDrop(8, rng)
      : EMOJI_POWERS[Math.floor(rng() * EMOJI_POWERS.length)];
    if (!raw || used.has(raw.emoji)) continue;
    used.add(raw.emoji);
    items.push({
      ...raw,
      id: `farmer-stock-${items.length}-${Math.floor(rng() * 1e9).toString(36)}`,
      consumed: false,
    });
  }
  return items;
}

export function rollFarmAnimal(rng: () => number = Math.random) {
  if (rng() < COW_CHANCE) return { ...COW };
  return { ...COMMON_ANIMALS[Math.floor(rng() * COMMON_ANIMALS.length)] };
}

function grassTiles(room: RoomBox, map: MapGrid | undefined): Position[] {
  const tiles: Position[] = [];
  const y0 = room.y + 1;
  const y1 = room.y + room.h - 1;
  const x0 = room.x + 1;
  const x1 = room.x + room.w - 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (map) {
        const kind = map[y]?.[x]?.type;
        if (kind !== 'grass' && kind !== 'floor') continue;
      }
      tiles.push({ x, y });
    }
  }
  if (tiles.length > 0 || !map) return tiles;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const kind = map[y]?.[x]?.type;
      if (kind === 'grass' || kind === 'floor') tiles.push({ x, y });
    }
  }
  return tiles;
}

function takeTile(tiles: Position[], rng: () => number): Position | null {
  if (tiles.length === 0) return null;
  const i = Math.floor(rng() * tiles.length);
  return tiles.splice(i, 1)[0];
}

export function spawnPrairieDenizens(
  room: RoomBox,
  map?: MapGrid,
  rng: () => number = Math.random,
): Enemy[] {
  const tiles = grassTiles(room, map);
  const farmerPos = takeTile(tiles, rng);
  if (!farmerPos) return [];
  const bounds = { x: room.x, y: room.y, w: room.w, h: room.h };
  const farmerId = `farmer-${room.x}-${room.y}-${Math.floor(rng() * 1e9).toString(36)}`;
  const farmer: Enemy = {
    id: farmerId,
    emoji: '🧑‍🌾',
    name: 'Farmer',
    pos: farmerPos,
    hp: 14,
    maxHp: 14,
    attack: 1,
    defense: 1,
    speed: 3,
    engaged: false,
    tag: 'Friendly',
    isFarmer: true,
    spawnRoomBounds: bounds,
    tradeStock: rollFarmerStock(rng),
  };
  const herd: Enemy[] = [];
  const count = 1 + Math.floor(rng() * 3);
  for (let n = 0; n < count; n++) {
    const pos = takeTile(tiles, rng);
    if (!pos) break;
    const kind = rollFarmAnimal(rng);
    herd.push({
      id: `farm-animal-${room.x}-${room.y}-${n}-${Math.floor(rng() * 1e9).toString(36)}`,
      emoji: kind.emoji,
      name: kind.name,
      pos,
      hp: kind.hp,
      maxHp: kind.hp,
      attack: kind.attack,
      defense: kind.defense,
      speed: kind.speed,
      engaged: false,
      tag: 'Friendly',
      isFarmAnimal: true,
      guardsFarmerId: farmerId,
      spawnRoomBounds: bounds,
    });
  }
  return [farmer, ...herd];
}

export interface FarmerTradeResult {
  ok: boolean;
  reason?: string;
  player?: Player;
  stock?: EmojiItem[];
  log?: string;
}

export function executeFarmerTrade(
  player: Player,
  stock: EmojiItem[],
  stockId: string,
  offerIds: string[],
): FarmerTradeResult {
  const goods = stock.find(s => s.id === stockId && !s.consumed);
  if (!goods) return { ok: false, reason: 'The farmer already traded that away.' };
  const unique = [...new Set(offerIds)];
  const held = new Map([...player.inventory, ...player.bank].map(i => [i.id, i]));
  const offers: EmojiItem[] = [];
  for (const id of unique) {
    const item = held.get(id);
    if (!item) return { ok: false, reason: 'Those items are not in your bag.' };
    if (farmerTradeValue(item) <= 0) return { ok: false, reason: 'The farmer only takes food and healing items — not gold.' };
    offers.push(item);
  }
  if (offers.length === 0) return { ok: false, reason: 'Offer some food.' };
  const price = farmerAskPrice(goods);
  const paid = offers.reduce((sum, item) => sum + farmerTradeValue(item), 0);
  if (paid + 1e-9 < price) return { ok: false, reason: `Need ${formatTradePoints(price)} food. Offered ${formatTradePoints(paid)}.` };
  const spent = new Set(unique);
  const inventory = player.inventory.filter(i => !spent.has(i.id));
  const bank = player.bank.filter(i => !spent.has(i.id));
  const gained: EmojiItem = {
    ...goods,
    id: `bartered-${goods.id}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    consumed: false,
  };
  const packed = addToPlayerBag({ ...player, inventory, bank }, gained);
  const gold = player.stats.gold;
  return {
    ok: true,
    player: {
      ...player,
      inventory: packed.inventory,
      bank: packed.bank,
      stats: { ...player.stats, gold },
    },
    stock: stock.filter(s => s.id !== goods.id),
    log: `🧑‍🌾 Traded ${offers.map(o => o.emoji).join('')} for ${gained.emoji} ${gained.name}.`,
  };
}

export interface FarmActor {
  id: string;
  pos: Position;
  hp: number;
  isFarmer?: boolean;
  isFarmAnimal?: boolean;
  guardsFarmerId?: string;
  spawnRoomBounds?: RoomBox;
}

export interface FarmFoe {
  id: string;
  pos: Position;
  hp: number;
  tag?: string;
  isRecruited?: boolean;
  engaged?: boolean;
  isSpectator?: boolean;
}

export type FarmIntent =
  | { kind: 'stay' }
  | { kind: 'step'; pos: Position }
  | { kind: 'attack'; targetId: string };

function inside(bounds: RoomBox, p: Position): boolean {
  return p.x >= bounds.x && p.x < bounds.x + bounds.w && p.y >= bounds.y && p.y < bounds.y + bounds.h;
}

function boxCenter(bounds: RoomBox): Position {
  return { x: bounds.x + Math.floor(bounds.w / 2), y: bounds.y + Math.floor(bounds.h / 2) };
}

function legalSteps(
  map: MapGrid,
  from: Position,
  occupied: Set<string>,
  passable: Set<string>,
  bounds: RoomBox | undefined,
  allowOutside: boolean,
): Position[] {
  const steps: Position[] = [];
  for (const [dx, dy] of DIRS) {
    const p = { x: from.x + dx, y: from.y + dy };
    if (p.y < 0 || p.y >= map.length || p.x < 0 || p.x >= (map[0]?.length ?? 0)) continue;
    if (!passable.has(map[p.y][p.x].type)) continue;
    if (occupied.has(`${p.x},${p.y}`)) continue;
    if (!allowOutside && bounds && !inside(bounds, p)) continue;
    steps.push(p);
  }
  return steps;
}

function closestStep(steps: Position[], target: Position, rng: () => number): Position | null {
  if (steps.length === 0) return null;
  let best = Infinity;
  for (const step of steps) best = Math.min(best, chebyshev(step, target));
  const ties = steps.filter(step => chebyshev(step, target) === best);
  return ties[Math.floor(rng() * ties.length)] ?? null;
}

export function farmDenizenIntent(
  actor: FarmActor,
  crowd: FarmActor[],
  candidates: FarmFoe[],
  map: MapGrid,
  occupied: Set<string>,
  passable: Set<string>,
  rng: () => number = Math.random,
): FarmIntent {
  const bounds = actor.spawnRoomBounds;
  if (actor.isFarmAnimal) {
    const farmer = crowd.find(e => e.isFarmer && e.hp > 0 && (!actor.guardsFarmerId || e.id === actor.guardsFarmerId));
    const anchor = farmer?.pos ?? actor.pos;
    const foes = candidates
      .filter(foe => foe.hp > 0 && foe.id !== actor.id && isHostileCombatTarget(foe) && chebyshev(foe.pos, anchor) <= FARM_DEFEND_RADIUS)
      .sort((a, b) => chebyshev(a.pos, actor.pos) - chebyshev(b.pos, actor.pos) || a.id.localeCompare(b.id));
    const foe = foes[0];
    if (foe && chebyshev(foe.pos, actor.pos) <= 1) return { kind: 'attack', targetId: foe.id };
    if (foe) {
      const toward = closestStep(legalSteps(map, actor.pos, occupied, passable, bounds, true), foe.pos, rng);
      if (toward && chebyshev(toward, foe.pos) < chebyshev(actor.pos, foe.pos)) return { kind: 'step', pos: toward };
      return { kind: 'stay' };
    }
  }

  const outside = bounds ? !inside(bounds, actor.pos) : false;
  if (outside && bounds) {
    const toward = closestStep(legalSteps(map, actor.pos, occupied, passable, bounds, true), boxCenter(bounds), rng);
    if (toward && chebyshev(toward, boxCenter(bounds)) < chebyshev(actor.pos, boxCenter(bounds))) {
      return { kind: 'step', pos: toward };
    }
    return { kind: 'stay' };
  }
  if (rng() < FARM_WANDER_STAY_CHANCE) return { kind: 'stay' };
  const steps = legalSteps(map, actor.pos, occupied, passable, bounds, false);
  if (steps.length === 0) return { kind: 'stay' };
  return { kind: 'step', pos: steps[Math.floor(rng() * steps.length)] };
}
