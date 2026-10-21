import { normalizeEmojiKey } from './discoveries';
import { BUILDING_EXCHANGE_COST, BUILDINGS, STRUCTURE_FLOOR_CHANCE, STRUCTURE_SELL_VALUE, STRUCTURE_SURVEY_MOOD, buildingOf } from './cityBuildings';
import { COWBOY, FENCER, GENIE, HITMAN, NINJA, RANGER, ROYAL_GUARD, VOID, WIZARD } from './prestigeConstants';

/** One placement token per lifetime consume of that emoji. */
export const TOKENS_PER_CONSUME = 1;
/** Starting lot grid. 8 columns fit a phone without pinching. Edges grow from here. */
export const CITY_COLS = 8;
export const CITY_ROWS = 8;
/** Unspent placement tokens charged to add one row or one column. */
export const CITY_EXPAND_COST = 10;
/** Largest side length a save or an expansion may reach. */
export const CITY_DIM_MAX = 32;
/** One wandering citizen per this many placed tiles. */
export const CITIZEN_TILES = 5;
/** Citizens attempt one step on this interval while the city screen is open. */
export const CITY_TICK_MS = 1000;
/** One roguelike turn is one city turn. Every this many city turns, one unspent token builds itself. */
export const GROWTH_TURNS = 10;
/** Catch-up wanders at most this many steps. A longer absence scatters citizens instead of simulating every step. */
export const WANDER_CATCHUP_CAP = 200;
/** Minimum district weight for the first bonus tier. */
export const DISTRICT_THRESHOLD = 4;
/**
 * Bonus tier rises by one each time district weight doubles past the threshold,
 * and stops here. Threshold 4 means tiers at weights 4, 8, 16, and 32.
 */
export const DISTRICT_BONUS_TIER_CAP = 4;

export const CITY_SIZE = CITY_COLS * CITY_ROWS;

/**
 * Free cosmetic lots. Always available. They do not spend tokens and do not
 * score districts, bonuses, or citizen housing. Some glyphs also exist as real
 * token placements (🌲🌳🌵⛲); only a decor flag makes that copy cosmetic.
 */
export const DECOR = [
  '🛣️',
  '🌲', '🌳', '🌴', '🌵', '🌷', '🌻',
  '🚗', '🚓', '🚕', '🛺',
  '🟢', '🟠', '🟥', '🟧', '🟦', '🟩', '🟨',
  '◽', '◾', '⬜', '⬛',
  '🔷', '🔶', '🔳', '🔲',
  '🪨', '⛲',
] as const;

export function decorKey(emoji: string): string {
  return normalizeEmojiKey(emoji).replace(/\uFE0F/g, '');
}

const DECOR_KEYS = new Set<string>(DECOR.map(emoji => decorKey(emoji)));

export function isDecorEmoji(emoji: string): boolean {
  return DECOR_KEYS.has(decorKey(emoji));
}

export interface CityCitizen {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

export type CityEdge = 'north' | 'south' | 'east' | 'west';

export interface CityState {
  tiles: (string | null)[];
  citizens: CityCitizen[];
  nextId: number;
  /** Row-major width. Missing on saves from before the grid could grow. */
  cols: number;
  /** Row-major height. Missing on saves from before the grid could grow. */
  rows: number;
  /** True when that lot is free decor. Missing entries are real placements. */
  decor: boolean[];
}

export interface CityEdit {
  ok: boolean;
  city: CityState;
  reason?: string;
}

const STEPS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function emptyCity(): CityState {
  return {
    tiles: Array.from({ length: CITY_SIZE }, () => null),
    citizens: [],
    nextId: 1,
    cols: CITY_COLS,
    rows: CITY_ROWS,
    decor: Array.from({ length: CITY_SIZE }, () => false),
  };
}

function storedDim(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.min(CITY_DIM_MAX, Math.max(CITY_COLS, Math.floor(raw)));
}

function gridOf(city: CityState): { cols: number; rows: number; size: number } {
  const cols = storedDim(city.cols) ?? CITY_COLS;
  const rows = storedDim(city.rows) ?? CITY_ROWS;
  return { cols, rows, size: cols * rows };
}

/**
 * Saves from before expansion omit cols and rows. Those grids are the original
 * 8×8 in row-major order, so existing lots keep their indexes. A stored side is
 * kept, clamped to the starting size and CITY_DIM_MAX.
 */
export function normalizeCity(raw: unknown): CityState {
  const blank = emptyCity();
  if (!raw || typeof raw !== 'object') return blank;
  const src = raw as Partial<CityState>;
  const cols = storedDim(src.cols) ?? CITY_COLS;
  const rows = storedDim(src.rows) ?? CITY_ROWS;
  const size = cols * rows;
  const tiles = Array.from({ length: size }, () => null as string | null);
  if (Array.isArray(src.tiles)) {
    const limit = Math.min(size, src.tiles.length);
    for (let i = 0; i < limit; i++) {
      const cell = src.tiles[i];
      tiles[i] = typeof cell === 'string' && cell.length > 0 ? normalizeEmojiKey(cell) : null;
    }
  }
  const decor = Array.from({ length: size }, () => false);
  if (Array.isArray(src.decor)) {
    const limit = Math.min(size, src.decor.length);
    for (let i = 0; i < limit; i++) {
      decor[i] = src.decor[i] === true && !!tiles[i] && isDecorEmoji(tiles[i]!);
    }
  }
  const citizens: CityCitizen[] = [];
  if (Array.isArray(src.citizens)) {
    for (const entry of src.citizens) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Partial<CityCitizen>;
      if (typeof row.emoji !== 'string' || typeof row.x !== 'number' || typeof row.y !== 'number') continue;
      const x = Math.floor(row.x);
      const y = Math.floor(row.y);
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      citizens.push({
        id: typeof row.id === 'string' && row.id ? row.id : `c-${citizens.length + 1}`,
        emoji: normalizeEmojiKey(row.emoji),
        x,
        y,
      });
    }
  }
  const nextId = typeof src.nextId === 'number' && src.nextId > 0 ? Math.floor(src.nextId) : citizens.length + 1;
  return { tiles, citizens, nextId, cols, rows, decor };
}

export function tokensForEmoji(consumes: number): number {
  return Math.max(0, Math.floor(consumes || 0)) * TOKENS_PER_CONSUME;
}

export function placedCount(city: CityState): number {
  return city.tiles.reduce((n, cell) => n + (cell ? 1 : 0), 0);
}

export function isDecorLot(city: CityState, index: number): boolean {
  return city.decor?.[index] === true && !!city.tiles[index] && isDecorEmoji(city.tiles[index]!);
}

/** Token placements of one emoji. Decor copies do not spend or refund a token. */
export function placedOf(city: CityState, emoji: string): number {
  const key = normalizeEmojiKey(emoji);
  return city.tiles.reduce((n, cell, index) => n + (cell === key && !isDecorLot(city, index) ? 1 : 0), 0);
}

/** Tokens still unspent. Placed copies are the spent tokens; removing a lot refunds one. */
export function availableTokens(consumes: number, placed: number): number {
  return Math.max(0, tokensForEmoji(consumes) - Math.max(0, Math.floor(placed || 0)));
}

export function totalAvailableTokens(consumes: Record<string, number>, city: CityState): number {
  const keys = new Set<string>([
    ...Object.keys(consumes),
    ...city.tiles.filter((cell): cell is string => !!cell),
  ]);
  let total = 0;
  for (const emoji of keys) total += availableTokens(consumes[emoji] ?? 0, placedOf(city, emoji));
  return total;
}

/**
 * Spend spare non-building tokens into the consume ledger as one structure token.
 * Placed copies are not spent. The input map is left unchanged.
 */
export function exchangeForBuilding(
  consumes: Record<string, number>,
  city: CityState,
  buildingEmoji: string,
): { ok: boolean; consumes: Record<string, number>; reason?: string } {
  const building = buildingOf(buildingEmoji);
  if (!building) return { ok: false, consumes, reason: 'That is not a structure.' };
  const next: Record<string, number> = { ...consumes };
  const sources = Object.keys(next)
    .filter(emoji => !buildingOf(emoji))
    .map(emoji => ({ emoji, spare: availableTokens(next[emoji] ?? 0, placedOf(city, emoji)) }))
    .filter(row => row.spare > 0)
    .sort((a, b) => b.spare - a.spare || a.emoji.localeCompare(b.emoji));
  let left = BUILDING_EXCHANGE_COST;
  for (const row of sources) {
    const take = Math.min(left, row.spare);
    next[row.emoji] = (next[row.emoji] ?? 0) - take;
    left -= take;
    if (left === 0) break;
  }
  if (left > 0) {
    return {
      ok: false,
      consumes,
      reason: `Need ${BUILDING_EXCHANGE_COST} spare tokens. Structures do not pay for structures.`,
    };
  }
  const key = normalizeEmojiKey(building.emoji);
  next[key] = (next[key] ?? 0) + 1;
  return { ok: true, consumes: next };
}

export function citizenCapacity(placed: number): number {
  return Math.floor(Math.max(0, Math.floor(placed || 0)) / CITIZEN_TILES);
}

/** Housing weight of one lot. Plain emoji and ordinary houses count as 1. */
export function lotHousing(emoji: string | null): number {
  if (!emoji) return 0;
  return buildingOf(emoji)?.housing ?? 1;
}

/** Citizens from housing weight, still one arrival per CITIZEN_TILES lots. */
export function citizenCapacityOf(city: CityState): number {
  const weight = city.tiles.reduce((sum, cell, index) => sum + (isDecorLot(city, index) ? 0 : lotHousing(cell)), 0);
  return Math.floor(weight / CITIZEN_TILES);
}

export function supplyPalette(consumes: Record<string, number>, city: CityState): string[] {
  return paletteEmojis(consumes, city).filter(emoji => !buildingOf(emoji));
}

export function paletteEmojis(consumes: Record<string, number>, city: CityState): string[] {
  const keys = new Set<string>();
  for (const [emoji, n] of Object.entries(consumes)) if (n > 0) keys.add(normalizeEmojiKey(emoji));
  city.tiles.forEach((cell, index) => {
    if (cell && !isDecorLot(city, index)) keys.add(cell);
  });
  return [...keys].sort((a, b) => (consumes[b] ?? 0) - (consumes[a] ?? 0) || a.localeCompare(b));
}

/** Lifetime kill counts weight who shows up. A roll of 0 picks the first mob with kills. */
export function pickWeightedCitizen(kills: Record<string, number>, rng: () => number): string | null {
  const entries = Object.entries(kills).filter(([, n]) => Math.floor(n) > 0);
  const total = entries.reduce((sum, [, n]) => sum + Math.floor(n), 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const [emoji, n] of entries) {
    roll -= Math.floor(n);
    if (roll < 0) return normalizeEmojiKey(emoji);
  }
  return normalizeEmojiKey(entries[entries.length - 1][0]);
}

function cellIndex(cols: number, x: number, y: number): number {
  return y * cols + x;
}

/** Keep citizens up to capacity. Newcomers are weighted by lifetime kills and stand on open lots. */
export function syncCitizens(city: CityState, kills: Record<string, number>, rng: () => number = Math.random): CityState {
  const { cols, rows, size } = gridOf(city);
  const cap = citizenCapacityOf(city);
  const citizens = city.citizens.slice(0, cap);
  const occupied = new Set(citizens.map(c => cellIndex(cols, c.x, c.y)));
  let nextId = city.nextId;
  while (citizens.length < cap) {
    const emoji = pickWeightedCitizen(kills, rng);
    if (!emoji) break;
    const open: number[] = [];
    for (let i = 0; i < size; i++) if (!occupied.has(i)) open.push(i);
    if (open.length === 0) break;
    const index = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
    occupied.add(index);
    citizens.push({
      id: `c-${nextId}`,
      emoji,
      x: index % cols,
      y: Math.floor(index / cols),
    });
    nextId += 1;
  }
  return { ...city, cols, rows, citizens, nextId };
}

export function placeAt(
  city: CityState,
  index: number,
  emoji: string,
  consumes: Record<string, number>,
  kills: Record<string, number>,
  rng: () => number = Math.random,
): CityEdit {
  const { size } = gridOf(city);
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    return { ok: false, city, reason: 'That lot is outside the city.' };
  }
  if (city.tiles[index]) return { ok: false, city, reason: 'That lot is already built.' };
  const key = normalizeEmojiKey(emoji);
  if (availableTokens(consumes[key] ?? 0, placedOf(city, key)) <= 0) {
    return { ok: false, city, reason: 'No tokens for that emoji.' };
  }
  const tiles = city.tiles.slice();
  tiles[index] = key;
  const decor = decorFlags(city);
  decor[index] = false;
  return { ok: true, city: syncCitizens({ ...city, tiles, decor }, kills, rng) };
}

export function removeAt(
  city: CityState,
  index: number,
  kills: Record<string, number>,
  rng: () => number = Math.random,
): CityEdit {
  const { size } = gridOf(city);
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    return { ok: false, city, reason: 'That lot is outside the city.' };
  }
  if (!city.tiles[index]) return { ok: false, city, reason: 'That lot is empty.' };
  const tiles = city.tiles.slice();
  tiles[index] = null;
  const decor = decorFlags(city);
  decor[index] = false;
  return { ok: true, city: syncCitizens({ ...city, tiles, decor }, kills, rng) };
}

/** Place a free decor emoji. No token is spent, and the lot does not score. */
export function placeDecor(city: CityState, index: number, emoji: string): CityEdit {
  const { size } = gridOf(city);
  if (!isDecorEmoji(emoji)) return { ok: false, city, reason: 'That is not decor.' };
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    return { ok: false, city, reason: 'That lot is outside the city.' };
  }
  if (city.tiles[index]) return { ok: false, city, reason: 'That lot is already built.' };
  const tiles = city.tiles.slice();
  tiles[index] = normalizeEmojiKey(emoji);
  const decor = decorFlags(city);
  decor[index] = true;
  return { ok: true, city: { ...city, tiles, decor } };
}

function decorFlags(city: CityState): boolean[] {
  const { size } = gridOf(city);
  const decor = Array.from({ length: size }, (_, index) => city.decor?.[index] === true);
  return decor;
}

/** One orthogonal step per citizen. They stay put at the map edge or on another citizen. */
export function tickCitizens(city: CityState, rng: () => number = Math.random): CityState {
  const { cols, rows } = gridOf(city);
  const occupied = new Set(city.citizens.map(c => cellIndex(cols, c.x, c.y)));
  const citizens = city.citizens.map(citizen => {
    const step = STEPS[Math.min(STEPS.length - 1, Math.floor(rng() * STEPS.length))]!;
    const x = citizen.x + step.x;
    const y = citizen.y + step.y;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return citizen;
    const next = cellIndex(cols, x, y);
    const here = cellIndex(cols, citizen.x, citizen.y);
    if (occupied.has(next)) return citizen;
    occupied.delete(here);
    occupied.add(next);
    return { ...citizen, x, y };
  });
  return { ...city, citizens };
}

export type DistrictId = 'thieves' | 'arcane' | 'saloon' | 'grove' | 'void';

export interface DistrictBonus {
  stat: 'attack' | 'defense' | 'speed' | 'evasion' | 'luck' | 'maxHp' | 'maxMana';
  /** Bonus granted at tier 1. Higher tiers multiply this. */
  amount: number;
  label: string;
}

const BONUS_STAT_LABEL: Record<DistrictBonus['stat'], string> = {
  attack: 'ATK',
  defense: 'DEF',
  speed: 'SPD',
  evasion: 'EVA',
  luck: 'LCK',
  maxHp: 'max HP',
  maxMana: 'max MP',
};

export function formatDistrictBonus(stat: DistrictBonus['stat'], amount: number): string {
  return `+${Math.max(0, Math.floor(amount))} ${BONUS_STAT_LABEL[stat]}`;
}

export interface DistrictStyle {
  id: DistrictId;
  name: string;
  /** Base class that receives the bonus. Prestige classes inherit this class. */
  classEmoji: string;
  className: string;
  emoji: readonly string[];
  bonus: DistrictBonus;
}

export const DISTRICTS: readonly DistrictStyle[] = [
  {
    id: 'thieves',
    name: 'Slums of Thieves',
    classEmoji: NINJA,
    className: 'Ninja',
    emoji: ['🗡️', '🔪', '⚔️', '🌙', '🥷', '🎭', '💀', '🥋', '🪙', '💰'],
    bonus: { stat: 'speed', amount: 1, label: formatDistrictBonus('speed', 1) },
  },
  {
    id: 'arcane',
    name: 'Arcane Sanctum',
    classEmoji: WIZARD,
    className: 'Wizard',
    emoji: ['🔮', '🪄', '🧪', '💊', '⚡', '❄️', '🧿', '✨', '📜', '💎', '🔱', '🌂', '🪬'],
    bonus: { stat: 'maxMana', amount: 2, label: formatDistrictBonus('maxMana', 2) },
  },
  {
    id: 'saloon',
    name: 'Frontier Saloon',
    classEmoji: COWBOY,
    className: 'Cowboy',
    emoji: ['🤠', '🔫', '💥', '🍺', '🥃', '🍻', '🎰', '🐴', '🌵', '👢', '🎩'],
    bonus: { stat: 'attack', amount: 1, label: formatDistrictBonus('attack', 1) },
  },
  {
    id: 'grove',
    name: 'Grove of Wilds',
    classEmoji: RANGER,
    className: 'Ranger',
    emoji: ['🏹', '🌲', '🌳', '🌿', '🍀', '🍄', '🦅', '🎯', '🍃', '🌾', '🌱', '🦋', '🪵', '🌽', '🪴'],
    bonus: { stat: 'evasion', amount: 1, label: formatDistrictBonus('evasion', 1) },
  },
  {
    id: 'void',
    name: 'Void Hollow',
    classEmoji: VOID,
    className: 'The Void',
    emoji: ['👤', '🌑', '🕳️', '👻', '🖤', '🌀'],
    bonus: { stat: 'maxHp', amount: 2, label: formatDistrictBonus('maxHp', 2) },
  },
];

const DISTRICT_BY_EMOJI = new Map<string, DistrictStyle>();
for (const style of DISTRICTS) {
  for (const emoji of style.emoji) DISTRICT_BY_EMOJI.set(normalizeEmojiKey(emoji), style);
}
for (const building of BUILDINGS) {
  if (!building.district) continue;
  const style = DISTRICTS.find(row => row.id === building.district);
  if (style) DISTRICT_BY_EMOJI.set(normalizeEmojiKey(building.emoji), style);
}

/** Prestige vessels use their base class's district. */
const PRESTIGE_BASE: Record<string, string> = {
  [GENIE]: WIZARD,
  [FENCER]: NINJA,
  [ROYAL_GUARD]: RANGER,
  [HITMAN]: COWBOY,
};

export function districtBaseClass(classEmoji: string): string {
  return PRESTIGE_BASE[classEmoji] ?? classEmoji;
}

export function classifyEmoji(emoji: string): DistrictStyle | null {
  return DISTRICT_BY_EMOJI.get(normalizeEmojiKey(emoji)) ?? null;
}

export interface DistrictStanding {
  id: DistrictId;
  name: string;
  classEmoji: string;
  className: string;
  stat: DistrictBonus['stat'];
  /** Placed tiles of this style, including plain emoji and structures. */
  count: number;
  /** Housing-weighted score. A plain themed emoji is 1. A structure uses its housing. */
  weight: number;
  tier: number;
  /** Scaled run-start bonus. 0 below the threshold. */
  amount: number;
  label: string;
}

export interface DistrictPickerEntry {
  id: DistrictId;
  yours: boolean;
  text: string;
}

/**
 * Several districts may be active together. Each one scores only its own tiles.
 *
 *   tile weight = structure housing, or 1 for a plain themed emoji
 *   weight      = sum of tile weights in that district
 *   tier        = 0 when weight < 4
 *               = 1 at weight 4, then +1 each time weight doubles (8, 16, 32)
 *               = at most DISTRICT_BONUS_TIER_CAP
 *   bonus       = base amount × tier
 *
 * Bases: Slums +1 SPD, Sanctum +2 max MP, Saloon +1 ATK, Grove +1 EVA, Hollow +2 max HP.
 */
export function districtBonusTier(weight: number): number {
  const w = Math.max(0, Math.floor(weight));
  if (!Number.isFinite(w) || w < DISTRICT_THRESHOLD) return 0;
  let tier = 1;
  let band = DISTRICT_THRESHOLD;
  while (tier < DISTRICT_BONUS_TIER_CAP && w >= band * 2) {
    band *= 2;
    tier += 1;
  }
  return tier;
}

export function scaledBonusAmount(base: number, weight: number): number {
  return Math.max(0, Math.floor(base)) * districtBonusTier(weight);
}

/** Weight of one placed tile toward its district. Neutral tiles and food weigh 0. */
export function districtTileWeight(emoji: string): number {
  if (!classifyEmoji(emoji)) return 0;
  return buildingOf(emoji)?.housing ?? 1;
}

export function districtCounts(city: CityState): Record<DistrictId, number> {
  const counts: Record<DistrictId, number> = { thieves: 0, arcane: 0, saloon: 0, grove: 0, void: 0 };
  for (const row of districtStandings(city)) counts[row.id] = row.count;
  return counts;
}

export function districtStandings(city: CityState): DistrictStanding[] {
  const counts: Record<DistrictId, number> = { thieves: 0, arcane: 0, saloon: 0, grove: 0, void: 0 };
  const weights: Record<DistrictId, number> = { thieves: 0, arcane: 0, saloon: 0, grove: 0, void: 0 };
  for (let index = 0; index < city.tiles.length; index++) {
    const cell = city.tiles[index];
    if (!cell || isDecorLot(city, index)) continue;
    const style = classifyEmoji(cell);
    if (!style) continue;
    counts[style.id] += 1;
    weights[style.id] += buildingOf(cell)?.housing ?? 1;
  }
  return DISTRICTS.map(style => {
    const count = counts[style.id];
    const weight = weights[style.id];
    const tier = districtBonusTier(weight);
    const amount = scaledBonusAmount(style.bonus.amount, weight);
    return {
      id: style.id,
      name: style.name,
      classEmoji: style.classEmoji,
      className: style.className,
      stat: style.bonus.stat,
      count,
      weight,
      tier,
      amount,
      label: formatDistrictBonus(style.bonus.stat, amount),
    };
  });
}

/** Every style whose weight has reached tier 1. Order follows DISTRICTS. */
export function activeDistricts(city: CityState): DistrictStanding[] {
  return districtStandings(city).filter(row => row.tier > 0);
}

export function districtHudLine(row: DistrictStanding): string {
  return `${row.name}: ${row.count} placed, weight ${row.weight}, ${row.label}`;
}

/**
 * Lines for the vessel card and its tooltip.
 * An empty city returns nothing. Otherwise every built district is listed,
 * and the viewed class's own district is included even at zero so its bonus is visible.
 */
export function districtPickerEntries(classEmoji: string, city: CityState): DistrictPickerEntry[] {
  const rows = districtStandings(city);
  if (rows.every(row => row.count === 0)) return [];
  const base = districtBaseClass(classEmoji);
  return rows.filter(row => row.count > 0 || row.classEmoji === base).map(row => {
    const yours = row.classEmoji === base;
    const who = yours ? 'at run start' : `for ${row.className}`;
    return { id: row.id, yours, text: `${districtHudLine(row)} ${who}` };
  });
}

export function districtPickerLine(classEmoji: string, city: CityState): string | null {
  const entries = districtPickerEntries(classEmoji, city);
  if (entries.length === 0) return null;
  return entries.map(entry => entry.text).join(' · ');
}

type BonusStats = {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
  luck: number;
  mana?: number;
  maxMana?: number;
};

/** Bake this class's district into a new run. Other districts do not change this class. */
export function applyDistrictBonus<P extends { characterClass: string; stats: BonusStats }>(
  player: P,
  city: CityState,
): { player: P; log?: string } {
  const base = districtBaseClass(player.characterClass);
  const standing = districtStandings(city).find(row => row.classEmoji === base);
  if (!standing || standing.amount <= 0) return { player };
  const stats = { ...player.stats };
  const { stat, amount, label } = standing;
  if (stat === 'maxHp') {
    stats.maxHp += amount;
    stats.hp += amount;
  } else if (stat === 'maxMana') {
    stats.maxMana = (stats.maxMana ?? 0) + amount;
    stats.mana = (stats.mana ?? 0) + amount;
  } else {
    stats[stat] += amount;
  }
  return {
    player: { ...player, stats },
    log: `🏙️ ${standing.name} — ${standing.className} starts with ${label} (${standing.count} placed, weight ${standing.weight}).`,
  };
}

export interface CityCatchUp {
  city: CityState;
  turns: number;
  citizensGained: number;
  buildingsGained: number;
  growthRemainder: number;
}

function tokenWeights(consumes: Record<string, number>, city: CityState): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const [emoji, n] of Object.entries(consumes)) {
    const left = availableTokens(n, placedOf(city, emoji));
    if (left > 0) weights[emoji] = left;
  }
  return weights;
}

/** Spend one unspent token from the consume ledger onto an empty lot. The ledger itself is not copied or reduced. */
function growOne(city: CityState, consumes: Record<string, number>, rng: () => number): CityState | null {
  const emoji = pickWeightedCitizen(tokenWeights(consumes, city), rng);
  if (!emoji) return null;
  const { size } = gridOf(city);
  const open: number[] = [];
  for (let i = 0; i < size; i++) if (!city.tiles[i]) open.push(i);
  if (open.length === 0) return null;
  const index = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
  const tiles = city.tiles.slice();
  tiles[index] = emoji;
  return { ...city, tiles };
}

function scatterCitizens(city: CityState, rng: () => number): CityState {
  const { cols, size } = gridOf(city);
  const occupied = new Set<number>();
  const citizens = city.citizens.map(citizen => {
    const open: number[] = [];
    for (let i = 0; i < size; i++) if (!occupied.has(i)) open.push(i);
    if (open.length === 0) return citizen;
    const index = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
    occupied.add(index);
    return { ...citizen, x: index % cols, y: Math.floor(index / cols) };
  });
  return { ...city, citizens };
}

/**
 * Apply roguelike turns that elapsed while the city was closed.
 * Growth and newcomers read the live consume and kill ledgers.
 * Wandering is capped so a long run does not simulate every step.
 */
export function catchUpCity(input: {
  city: CityState;
  consumes: Record<string, number>;
  kills: Record<string, number>;
  pendingTurns: number;
  growthRemainder?: number;
  rng?: () => number;
}): CityCatchUp {
  const rng = input.rng ?? Math.random;
  const turns = Math.max(0, Math.floor(input.pendingTurns || 0));
  const beforeCitizens = input.city.citizens.length;
  const beforePlaced = placedCount(input.city);
  const progress = Math.max(0, Math.floor(input.growthRemainder || 0)) + turns;
  const wanted = Math.floor(progress / GROWTH_TURNS);
  const growthRemainder = progress % GROWTH_TURNS;
  let next = input.city;
  const room = Math.min(
    wanted,
    totalAvailableTokens(input.consumes, next),
    gridOf(next).size - beforePlaced,
  );
  for (let i = 0; i < room; i++) {
    const grown = growOne(next, input.consumes, rng);
    if (!grown) break;
    next = grown;
  }
  next = syncCitizens(next, input.kills, rng);
  if (turns > WANDER_CATCHUP_CAP) next = scatterCitizens(next, rng);
  const steps = Math.min(turns, WANDER_CATCHUP_CAP);
  for (let i = 0; i < steps; i++) next = tickCitizens(next, rng);
  return {
    city: next,
    turns,
    citizensGained: Math.max(0, next.citizens.length - beforeCitizens),
    buildingsGained: placedCount(next) - beforePlaced,
    growthRemainder,
  };
}

/** Why an edge button is disabled, or null when that expansion can be paid. */
export function expandBlockReason(city: CityState, edge: CityEdge, tokens: number): string | null {
  const { cols, rows } = gridOf(city);
  if ((edge === 'north' || edge === 'south') && rows >= CITY_DIM_MAX) return 'This edge cannot grow further.';
  if ((edge === 'east' || edge === 'west') && cols >= CITY_DIM_MAX) return 'This edge cannot grow further.';
  if (Math.floor(tokens) < CITY_EXPAND_COST) return `Need ${CITY_EXPAND_COST} tokens`;
  return null;
}

function spendSpareTokens(
  consumes: Record<string, number>,
  city: CityState,
  cost: number,
): { ok: boolean; consumes: Record<string, number> } {
  const next: Record<string, number> = { ...consumes };
  const sources = Object.keys(next)
    .map(emoji => ({ emoji, spare: availableTokens(next[emoji] ?? 0, placedOf(city, emoji)) }))
    .filter(row => row.spare > 0)
    .sort((a, b) => b.spare - a.spare || a.emoji.localeCompare(b.emoji));
  let left = cost;
  for (const row of sources) {
    const take = Math.min(left, row.spare);
    const updated = (next[row.emoji] ?? 0) - take;
    if (updated > 0) next[row.emoji] = updated;
    else delete next[row.emoji];
    left -= take;
    if (left === 0) break;
  }
  if (left > 0) return { ok: false, consumes };
  return { ok: true, consumes: next };
}

/** North and west insert a strip at the origin, so lots and citizens move the other way. */
function shiftGrid(city: CityState, edge: CityEdge): CityState {
  const { cols, rows } = gridOf(city);
  if (edge === 'north' || edge === 'south') {
    const nextRows = rows + 1;
    const nextTiles: (string | null)[] = Array.from({ length: cols * nextRows }, () => null);
    const nextDecor = Array.from({ length: cols * nextRows }, () => false);
    const yOffset = edge === 'north' ? 1 : 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const from = y * cols + x;
        const to = (y + yOffset) * cols + x;
        nextTiles[to] = city.tiles[from] ?? null;
        nextDecor[to] = city.decor?.[from] === true && !!nextTiles[to];
      }
    }
    return {
      ...city,
      cols,
      rows: nextRows,
      tiles: nextTiles,
      decor: nextDecor,
      citizens: city.citizens.map(citizen => ({ ...citizen, y: citizen.y + yOffset })),
    };
  }
  const nextCols = cols + 1;
  const nextTiles: (string | null)[] = Array.from({ length: nextCols * rows }, () => null);
  const nextDecor = Array.from({ length: nextCols * rows }, () => false);
  const xOffset = edge === 'west' ? 1 : 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const from = y * cols + x;
      const to = y * nextCols + x + xOffset;
      nextTiles[to] = city.tiles[from] ?? null;
      nextDecor[to] = city.decor?.[from] === true && !!nextTiles[to];
    }
  }
  return {
    ...city,
    cols: nextCols,
    rows,
    tiles: nextTiles,
    decor: nextDecor,
    citizens: city.citizens.map(citizen => ({ ...citizen, x: citizen.x + xOffset })),
  };
}

/**
 * Add one row or column. Pays CITY_EXPAND_COST unspent placement tokens, the same
 * pool the city HUD labels Tokens. Placed lots are not removed. The input maps
 * are left unchanged.
 */
export function expandCity(
  city: CityState,
  edge: CityEdge,
  consumes: Record<string, number>,
): { ok: boolean; city: CityState; consumes: Record<string, number>; reason?: string } {
  if (edge !== 'north' && edge !== 'south' && edge !== 'east' && edge !== 'west') {
    return { ok: false, city, consumes, reason: 'That edge is not on the city.' };
  }
  const normalized = normalizeCity(city);
  const blocked = expandBlockReason(normalized, edge, totalAvailableTokens(consumes, normalized));
  if (blocked) return { ok: false, city, consumes, reason: blocked };
  if (normalized.tiles.length !== normalized.cols * normalized.rows) {
    return { ok: false, city, consumes, reason: 'That city grid is the wrong size.' };
  }
  const paid = spendSpareTokens(consumes, normalized, CITY_EXPAND_COST);
  if (!paid.ok) return { ok: false, city, consumes, reason: `Need ${CITY_EXPAND_COST} tokens` };
  return { ok: true, city: shiftGrid(normalized, edge), consumes: paid.consumes };
}

export function awaySummary(turns: number, citizensGained: number): string {
  return `While you were away: +${turns} turns, +${citizensGained} citizens`;
}

export function emojiCityRulesBlurb(): string {
  return `EmojiCB is a city on the home screen, kept in the meta save so it survives runs. Each emoji you use from the hotbar, eat, drink, or buy-and-use grants ${TOKENS_PER_CONSUME} placement token for that emoji. Spell Echo does not spend the emoji, so it grants no token. Those consume counts, and the lifetime enemy kill counts, are the only ledgers — the city reads them again every visit. The grid starts at ${CITY_COLS}×${CITY_ROWS}. Each edge grows by one row or column for ${CITY_EXPAND_COST} unspent placement tokens, the Tokens count on the city HUD. North and west shift the blocks already placed. The Decor row is free and always available. Decor does not spend a token, and it does not count toward districts, bonuses, or citizen housing. A copy placed from a token still counts. Pick an emoji and tap an empty lot to build. Tap a built lot to clear it and refund the token. One citizen arrives per ${CITIZEN_TILES} lots of housing, weighted by kills. A plain emoji or an ordinary house counts as 1 lot. Most structures count as 2, 🏘️🏢🏭🏨🏟️🏬 count as 3, and 🏰 counts as 4. No kills means empty streets. Structures are not on the kill-loot table. About ${Math.round(STRUCTURE_FLOOR_CHANCE * 100)}% of floors hide one blueprint. Survey it from the hotbar for +${STRUCTURE_SURVEY_MOOD} mood and 1 token for that building. Selling a blueprint pays ${STRUCTURE_SELL_VALUE}g and grants no token. In the city, ${BUILDING_EXCHANGE_COST} spare tokens from non-building emoji raise 1 structure token. The structures row is separate from the supply palette. Every roguelike turn is a city turn. While you are away, one unspent token builds itself every ${GROWTH_TURNS} city turns, citizens arrive to the new capacity, and they wander. A long absence is caught up in at most ${WANDER_CATCHUP_CAP} wander steps. Placed emoji form districts, and every style can be active at once: Slums of Thieves (Ninja), Arcane Sanctum (Wizard), Frontier Saloon (Cowboy), Grove of Wilds (Ranger), and Void Hollow (The Void). 🛖🏚️ are slums, ⛩️🛕 are the sanctum, ⛺🏕️🏔️ are the grove, 🏤🏦🏟️ are the saloon, and 🌋 is the hollow. 🏰🏭🏢 and ordinary houses are neutral. Prestige classes use their base class's district. A plain themed emoji weighs 1. A structure weighs its housing, so a larger building counts for more. Weight ${DISTRICT_THRESHOLD} is tier 1. The tier rises by 1 each time that weight doubles, through ${DISTRICT_THRESHOLD * 2}, ${DISTRICT_THRESHOLD * 4}, and ${DISTRICT_THRESHOLD * 8}, and ${DISTRICT_BONUS_TIER_CAP} is the cap. The run-start bonus is the tier times the base (${DISTRICTS.map(d => `${d.bonus.label} ${d.className}`).join(', ')}). The city HUD and the vessel picker show each district's placed count, weight, and current bonus. A meta save from before this rule keeps its grid, consumes, and prestige; bonuses are read from the tiles.`;
}
