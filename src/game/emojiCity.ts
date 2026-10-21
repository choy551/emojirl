import { normalizeEmojiKey } from './discoveries';
import { COWBOY, FENCER, GENIE, HITMAN, NINJA, RANGER, ROYAL_GUARD, VOID, WIZARD } from './prestigeConstants';

/** One placement token per lifetime consume of that emoji. */
export const TOKENS_PER_CONSUME = 1;
/** Fixed lot grid. 8 columns fit a phone without pinching. */
export const CITY_COLS = 8;
export const CITY_ROWS = 8;
/** One wandering citizen per this many placed tiles. */
export const CITIZEN_TILES = 5;
/** Citizens attempt one step on this interval while the city screen is open. */
export const CITY_TICK_MS = 1000;
/** One roguelike turn is one city turn. Every this many city turns, one unspent token builds itself. */
export const GROWTH_TURNS = 10;
/** Catch-up wanders at most this many steps. A longer absence scatters citizens instead of simulating every step. */
export const WANDER_CATCHUP_CAP = 200;
/** A style must have at least this many placed tiles, and strictly more than every other style. */
export const DISTRICT_THRESHOLD = 4;

export const CITY_SIZE = CITY_COLS * CITY_ROWS;

export interface CityCitizen {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

export interface CityState {
  tiles: (string | null)[];
  citizens: CityCitizen[];
  nextId: number;
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
  return { tiles: Array.from({ length: CITY_SIZE }, () => null), citizens: [], nextId: 1 };
}

export function normalizeCity(raw: unknown): CityState {
  const tiles = Array.from({ length: CITY_SIZE }, () => null as string | null);
  const blank = emptyCity();
  if (!raw || typeof raw !== 'object') return blank;
  const src = raw as Partial<CityState>;
  if (Array.isArray(src.tiles)) {
    for (let i = 0; i < CITY_SIZE && i < src.tiles.length; i++) {
      const cell = src.tiles[i];
      tiles[i] = typeof cell === 'string' && cell.length > 0 ? normalizeEmojiKey(cell) : null;
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
      if (x < 0 || y < 0 || x >= CITY_COLS || y >= CITY_ROWS) continue;
      citizens.push({
        id: typeof row.id === 'string' && row.id ? row.id : `c-${citizens.length + 1}`,
        emoji: normalizeEmojiKey(row.emoji),
        x,
        y,
      });
    }
  }
  const nextId = typeof src.nextId === 'number' && src.nextId > 0 ? Math.floor(src.nextId) : citizens.length + 1;
  return { tiles, citizens, nextId };
}

export function tokensForEmoji(consumes: number): number {
  return Math.max(0, Math.floor(consumes || 0)) * TOKENS_PER_CONSUME;
}

export function placedCount(city: CityState): number {
  return city.tiles.reduce((n, cell) => n + (cell ? 1 : 0), 0);
}

export function placedOf(city: CityState, emoji: string): number {
  const key = normalizeEmojiKey(emoji);
  return city.tiles.reduce((n, cell) => n + (cell === key ? 1 : 0), 0);
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

export function citizenCapacity(placed: number): number {
  return Math.floor(Math.max(0, Math.floor(placed || 0)) / CITIZEN_TILES);
}

export function paletteEmojis(consumes: Record<string, number>, city: CityState): string[] {
  const keys = new Set<string>();
  for (const [emoji, n] of Object.entries(consumes)) if (n > 0) keys.add(normalizeEmojiKey(emoji));
  for (const cell of city.tiles) if (cell) keys.add(cell);
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

function cellIndex(x: number, y: number): number {
  return y * CITY_COLS + x;
}

/** Keep citizens up to capacity. Newcomers are weighted by lifetime kills and stand on open lots. */
export function syncCitizens(city: CityState, kills: Record<string, number>, rng: () => number = Math.random): CityState {
  const cap = citizenCapacity(placedCount(city));
  const citizens = city.citizens.slice(0, cap);
  const occupied = new Set(citizens.map(c => cellIndex(c.x, c.y)));
  let nextId = city.nextId;
  while (citizens.length < cap) {
    const emoji = pickWeightedCitizen(kills, rng);
    if (!emoji) break;
    const open: number[] = [];
    for (let i = 0; i < CITY_SIZE; i++) if (!occupied.has(i)) open.push(i);
    if (open.length === 0) break;
    const index = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
    occupied.add(index);
    citizens.push({
      id: `c-${nextId}`,
      emoji,
      x: index % CITY_COLS,
      y: Math.floor(index / CITY_COLS),
    });
    nextId += 1;
  }
  return { ...city, citizens, nextId };
}

export function placeAt(
  city: CityState,
  index: number,
  emoji: string,
  consumes: Record<string, number>,
  kills: Record<string, number>,
  rng: () => number = Math.random,
): CityEdit {
  if (!Number.isInteger(index) || index < 0 || index >= CITY_SIZE) {
    return { ok: false, city, reason: 'That lot is outside the city.' };
  }
  if (city.tiles[index]) return { ok: false, city, reason: 'That lot is already built.' };
  const key = normalizeEmojiKey(emoji);
  if (availableTokens(consumes[key] ?? 0, placedOf(city, key)) <= 0) {
    return { ok: false, city, reason: 'No tokens for that emoji.' };
  }
  const tiles = city.tiles.slice();
  tiles[index] = key;
  return { ok: true, city: syncCitizens({ ...city, tiles }, kills, rng) };
}

export function removeAt(
  city: CityState,
  index: number,
  kills: Record<string, number>,
  rng: () => number = Math.random,
): CityEdit {
  if (!Number.isInteger(index) || index < 0 || index >= CITY_SIZE) {
    return { ok: false, city, reason: 'That lot is outside the city.' };
  }
  if (!city.tiles[index]) return { ok: false, city, reason: 'That lot is empty.' };
  const tiles = city.tiles.slice();
  tiles[index] = null;
  return { ok: true, city: syncCitizens({ ...city, tiles }, kills, rng) };
}

/** One orthogonal step per citizen. They stay put at the map edge or on another citizen. */
export function tickCitizens(city: CityState, rng: () => number = Math.random): CityState {
  const occupied = new Set(city.citizens.map(c => cellIndex(c.x, c.y)));
  const citizens = city.citizens.map(citizen => {
    const step = STEPS[Math.min(STEPS.length - 1, Math.floor(rng() * STEPS.length))]!;
    const x = citizen.x + step.x;
    const y = citizen.y + step.y;
    if (x < 0 || y < 0 || x >= CITY_COLS || y >= CITY_ROWS) return citizen;
    const next = cellIndex(x, y);
    const here = cellIndex(citizen.x, citizen.y);
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
  amount: number;
  label: string;
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
    bonus: { stat: 'speed', amount: 1, label: '+1 SPD' },
  },
  {
    id: 'arcane',
    name: 'Arcane Sanctum',
    classEmoji: WIZARD,
    className: 'Wizard',
    emoji: ['🔮', '🪄', '🧪', '💊', '⚡', '❄️', '🧿', '✨', '📜', '💎', '🔱', '🌂', '🪬'],
    bonus: { stat: 'maxMana', amount: 2, label: '+2 max MP' },
  },
  {
    id: 'saloon',
    name: 'Frontier Saloon',
    classEmoji: COWBOY,
    className: 'Cowboy',
    emoji: ['🤠', '🔫', '💥', '🍺', '🥃', '🍻', '🎰', '🐴', '🌵', '👢', '🎩'],
    bonus: { stat: 'attack', amount: 1, label: '+1 ATK' },
  },
  {
    id: 'grove',
    name: 'Grove of Wilds',
    classEmoji: RANGER,
    className: 'Ranger',
    emoji: ['🏹', '🌲', '🌳', '🌿', '🍀', '🍄', '🦅', '🎯', '🍃', '🌾', '🌱', '🦋', '🪵', '🌽', '🪴'],
    bonus: { stat: 'evasion', amount: 1, label: '+1 EVA' },
  },
  {
    id: 'void',
    name: 'Void Hollow',
    classEmoji: VOID,
    className: 'The Void',
    emoji: ['👤', '🌑', '🕳️', '👻', '🖤', '🌀'],
    bonus: { stat: 'maxHp', amount: 2, label: '+2 max HP' },
  },
];

const DISTRICT_BY_EMOJI = new Map<string, DistrictStyle>();
for (const style of DISTRICTS) {
  for (const emoji of style.emoji) DISTRICT_BY_EMOJI.set(normalizeEmojiKey(emoji), style);
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

export function districtCounts(city: CityState): Record<DistrictId, number> {
  const counts: Record<DistrictId, number> = { thieves: 0, arcane: 0, saloon: 0, grove: 0, void: 0 };
  for (const cell of city.tiles) {
    if (!cell) continue;
    const style = classifyEmoji(cell);
    if (style) counts[style.id] += 1;
  }
  return counts;
}

/** The leading style, when it clears the threshold and is not tied. */
export function dominantDistrict(city: CityState): DistrictStyle | null {
  let best: DistrictStyle | null = null;
  let bestN = 0;
  let second = 0;
  for (const style of DISTRICTS) {
    const n = districtCounts(city)[style.id];
    if (n > bestN) {
      second = bestN;
      bestN = n;
      best = style;
    } else if (n > second) {
      second = n;
    }
  }
  if (!best || bestN < DISTRICT_THRESHOLD || bestN <= second) return null;
  return best;
}

export function districtPickerLine(classEmoji: string, city: CityState): string | null {
  const style = dominantDistrict(city);
  if (!style) return null;
  if (districtBaseClass(classEmoji) === style.classEmoji) {
    return `${style.name}: ${style.bonus.label} at run start`;
  }
  return `${style.name} favors ${style.className} (${style.bonus.label})`;
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

/** Bake the dominant district into a new run's starting stats. Other classes are unchanged. */
export function applyDistrictBonus<P extends { characterClass: string; stats: BonusStats }>(
  player: P,
  city: CityState,
): { player: P; log?: string } {
  const style = dominantDistrict(city);
  if (!style || districtBaseClass(player.characterClass) !== style.classEmoji) return { player };
  const stats = { ...player.stats };
  const { stat, amount, label } = style.bonus;
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
    log: `🏙️ ${style.name} — ${style.className} starts with ${label}.`,
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
  const open: number[] = [];
  for (let i = 0; i < CITY_SIZE; i++) if (!city.tiles[i]) open.push(i);
  if (open.length === 0) return null;
  const index = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
  const tiles = city.tiles.slice();
  tiles[index] = emoji;
  return { ...city, tiles };
}

function scatterCitizens(city: CityState, rng: () => number): CityState {
  const occupied = new Set<number>();
  const citizens = city.citizens.map(citizen => {
    const open: number[] = [];
    for (let i = 0; i < CITY_SIZE; i++) if (!occupied.has(i)) open.push(i);
    if (open.length === 0) return citizen;
    const index = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
    occupied.add(index);
    return { ...citizen, x: index % CITY_COLS, y: Math.floor(index / CITY_COLS) };
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
    CITY_SIZE - beforePlaced,
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

export function awaySummary(turns: number, citizensGained: number): string {
  return `While you were away: +${turns} turns, +${citizensGained} citizens`;
}

export function emojiCityRulesBlurb(): string {
  return `EmojiCB is a city on the home screen, kept in the meta save so it survives runs. Each emoji you use from the hotbar, eat, drink, or buy-and-use grants ${TOKENS_PER_CONSUME} placement token for that emoji. Spell Echo does not spend the emoji, so it grants no token. Those consume counts, and the lifetime enemy kill counts, are the only ledgers — the city reads them again every visit. The grid is ${CITY_COLS}×${CITY_ROWS}. Pick an emoji and tap an empty lot to build. Tap a built lot to clear it and refund the token. One citizen arrives per ${CITIZEN_TILES} placed tiles, weighted by kills. No kills means empty streets. Every roguelike turn is a city turn. While you are away, one unspent token builds itself every ${GROWTH_TURNS} city turns, citizens arrive to the new capacity, and they wander. A long absence is caught up in at most ${WANDER_CATCHUP_CAP} wander steps. Placed emoji form districts: Slums of Thieves (Ninja), Arcane Sanctum (Wizard), Frontier Saloon (Cowboy), Grove of Wilds (Ranger), and Void Hollow (The Void). Prestige classes use their base class's district. A style with at least ${DISTRICT_THRESHOLD} tiles and a strict lead grants a small run-start bonus to that class: ${DISTRICTS.map(d => `${d.bonus.label} ${d.className}`).join(', ')}. The vessel picker and the city HUD show the current lead.`;
}
