import type { EmojiItem } from './types';
import { CITY_NAME_DEFAULT, generateAnonymousName, isAnonymousName, normalizeCityName } from './cityIdentity';
import type { GridRect, PaintBrush, Stamp } from './cityPaint';
import { normalizeEmojiKey } from './discoveries';
import { fullGridTokensPerConsume, type DropIdentity } from './dropTable';
import {
  CITY_COLS,
  CITY_ROWS,
  DEFAULT_BLOCKED_TYPES,
  cityGridIsFull,
  fullCityConsumeNotice,
  normalizeCity,
  tokensGrantedForRunConsume,
  type CityState,
} from './emojiCity';
import {
  META_SAVE_KEY,
  META_SCHEMA_VERSION,
  PRESTIGE_OF,
  VOID_UNLOCK_KEY,
} from './prestigeConstants';

export interface MetaSave {
  schemaVersion: number;
  unlockedPrestige: string[];
  /** Hotbar copies waiting for the next run. Cleared when that run starts. */
  insuredCarry?: EmojiItem[];
  /** Lifetime consumes per emoji. One consume is one EmojiCB placement token. */
  emojiConsumes?: Record<string, number>;
  /** EmojiCB grid. Absent until the player opens the city. */
  city?: CityState;
  /** Roguelike turns waiting to be simulated the next time EmojiCB opens. */
  pendingCityTurns?: number;
  /** City turns toward the next auto-built lot, kept across visits. */
  cityGrowthRemainder?: number;
  /** Player-facing city name. Missing until the city screen fills the default. */
  cityName?: string;
  /** Reddit-style visitor name, generated once on this device. */
  anonymousName?: string;
  /** Tool, brush, marquee, and clipboard. Missing on older saves. */
  cityDesk?: CityDesk;
}

export interface CityDesk {
  tool: 'place' | 'select' | 'paste' | 'delete' | 'eyedropper' | 'pass' | 'zoom';
  brush: PaintBrush | null;
  selection: GridRect | null;
  clipboard: Stamp | null;
  passMode: 'type' | 'square';
  passSquare: boolean | null;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();

const memoryStore: KeyValueStore = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, value); },
  removeItem: (key) => { memory.delete(key); },
};

function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

let store: KeyValueStore = browserStore() ?? memoryStore;

/** Tests inject a store. Pass nothing to restore the default (localStorage when present). */
export function setMetaStore(next?: KeyValueStore): void {
  store = next ?? browserStore() ?? memoryStore;
}

function carryItems(raw: unknown): EmojiItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is EmojiItem => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Partial<EmojiItem>;
    return typeof row.id === 'string' && typeof row.emoji === 'string' && typeof row.name === 'string';
  });
}

function nonNegInt(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function countMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.floor(Number(value));
    if (!key || n <= 0) continue;
    out[normalizeEmojiKey(key)] = n;
  }
  return out;
}

/**
 * Versions this build knows how to read. A newer file still loads the known fields
 * instead of wiping prestige or the city. A missing version is treated as v1.
 *
 * v1 → v2: the single-lead district was never stored. Any leftover `activeDistrict`
 * key is dropped. The grid, consume ledger, citizens, pending turns, insured carry,
 * and prestige unlocks are kept, and every built style now scores on its own.
 * v2 → v3: a city without cols and rows is the original 8×8. Stored dimensions are kept.
 * v3 → v4: a city without passability rules blocks orange and blue squares and
 * leaves every square on the type rule. A saved list, including an empty one, is kept.
 * v4 → v5: the saved grid is the origin neighborhood. Extra neighborhoods are a
 * separate list. A missing list means the city is only the origin.
 * City name, visitor name, and the city desk (tool, brush, marquee, clipboard)
 * are optional. A missing desk restores as the place tool. Invalid values are
 * dropped and filled later by ensureCityProfile, without a schema bump.
 */
export function migrateMetaRaw(raw: Record<string, unknown>): void {
  const version = typeof raw.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion)
    ? Math.floor(raw.schemaVersion)
    : 1;
  if (version < 2) delete raw.activeDistrict;
  if (version < 3 && raw.city && typeof raw.city === 'object') {
    const city = raw.city as Record<string, unknown>;
    if (typeof city.cols !== 'number') city.cols = CITY_COLS;
    if (typeof city.rows !== 'number') city.rows = CITY_ROWS;
  }
  if (version < 4 && raw.city && typeof raw.city === 'object') {
    const city = raw.city as Record<string, unknown>;
    if (!Array.isArray(city.blockedTypes)) city.blockedTypes = [...DEFAULT_BLOCKED_TYPES];
    if (!Array.isArray(city.passOverride)) city.passOverride = [];
  }
  raw.schemaVersion = META_SCHEMA_VERSION;
}

export function emptyMeta(): MetaSave {
  return { schemaVersion: META_SCHEMA_VERSION, unlockedPrestige: [], insuredCarry: [], emojiConsumes: {} };
}

export function loadMeta(): MetaSave {
  try {
    const raw = store.getItem(META_SAVE_KEY);
    if (!raw) return emptyMeta();
    const parsed = JSON.parse(raw) as Partial<MetaSave> & Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return emptyMeta();
    migrateMetaRaw(parsed);
    const unlocked = Array.isArray(parsed.unlockedPrestige)
      ? parsed.unlockedPrestige.filter((e): e is string => typeof e === 'string')
      : [];
    return {
      schemaVersion: META_SCHEMA_VERSION,
      unlockedPrestige: [...new Set(unlocked)],
      insuredCarry: carryItems(parsed.insuredCarry),
      emojiConsumes: countMap(parsed.emojiConsumes),
      city: parsed.city ? normalizeCity(parsed.city) : undefined,
      pendingCityTurns: nonNegInt(parsed.pendingCityTurns),
      cityGrowthRemainder: nonNegInt(parsed.cityGrowthRemainder),
      cityName: readCityName(parsed.cityName),
      anonymousName: isAnonymousName(parsed.anonymousName) ? parsed.anonymousName : undefined,
      cityDesk: normalizeCityDesk(parsed.cityDesk),
    };
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(meta: MetaSave): void {
  try {
    store.setItem(META_SAVE_KEY, JSON.stringify({ ...meta, schemaVersion: META_SCHEMA_VERSION }));
  } catch {
    /* quota or private mode */
  }
}

export function isPrestigeUnlocked(emoji: string, meta: MetaSave = loadMeta()): boolean {
  return meta.unlockedPrestige.includes(emoji);
}

export function isVoidUnlocked(): boolean {
  try { return store.getItem(VOID_UNLOCK_KEY) === '1'; }
  catch { return false; }
}

/** Count one lifetime consume. Spell Echo and unsold items do not call this. */
export function recordEmojiConsume(emoji: string, n = 1): number {
  const add = Math.max(0, Math.floor(n));
  const key = normalizeEmojiKey(emoji);
  const meta = loadMeta();
  const counts = { ...(meta.emojiConsumes ?? {}) };
  if (!key || add === 0) return counts[key] ?? 0;
  counts[key] = (counts[key] ?? 0) + add;
  saveMeta({ ...meta, emojiConsumes: counts });
  return counts[key];
}

export interface RunEmojiConsume {
  count: number;
  granted: number;
  /** Set when a full city converted this consume into tokens. */
  notice: string | null;
}

/**
 * Count a consume from a run. An open lot grants one placement token.
 * A city with no empty tile grants that emoji's drop-rarity value instead,
 * and `notice` is the line the run log should show.
 */
export function recordRunEmojiConsume(emoji: string, n = 1, item?: DropIdentity): RunEmojiConsume {
  const copies = Math.max(0, Math.floor(n));
  const key = normalizeEmojiKey(emoji);
  const meta = loadMeta();
  if (!key || copies === 0) {
    return { count: meta.emojiConsumes?.[key] ?? 0, granted: 0, notice: null };
  }
  const full = cityGridIsFull(meta.city);
  const each = fullGridTokensPerConsume(item ?? { emoji: key });
  const granted = tokensGrantedForRunConsume(meta.city, copies, each);
  const count = recordEmojiConsume(emoji, granted);
  return {
    count,
    granted,
    notice: full ? fullCityConsumeNotice(key, copies, granted) : null,
  };
}

/** Replace the consume ledger. Zero and negative counts are dropped. */
export function replaceEmojiConsumes(counts: Record<string, number>): Record<string, number> {
  const meta = loadMeta();
  const emojiConsumes = countMap(counts);
  saveMeta({ ...meta, emojiConsumes });
  return emojiConsumes;
}

const CITY_DESK_TOOLS = new Set<CityDesk['tool']>(['place', 'select', 'paste', 'delete', 'eyedropper', 'pass', 'zoom']);

export function emptyCityDesk(): CityDesk {
  return { tool: 'place', brush: null, selection: null, clipboard: null, passMode: 'type', passSquare: true };
}

function readDeskRect(raw: unknown): GridRect | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const nums = [row.x0, row.y0, row.x1, row.y1].map(value => (
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : Number.NaN
  ));
  if (nums.some(value => !Number.isInteger(value) || value < 0 || value > 64)) return null;
  const [x0, y0, x1, y1] = nums as [number, number, number, number];
  if (x0 > x1 || y0 > y1) return null;
  return { x0, y0, x1, y1 };
}

/** Older saves omit the desk. A bad tool or stamp is dropped instead of failing the load. */
export function normalizeCityDesk(raw: unknown): CityDesk {
  const desk = emptyCityDesk();
  if (!raw || typeof raw !== 'object') return desk;
  const src = raw as Record<string, unknown>;
  if (typeof src.tool === 'string' && CITY_DESK_TOOLS.has(src.tool as CityDesk['tool'])) desk.tool = src.tool as CityDesk['tool'];
  if (src.brush && typeof src.brush === 'object') {
    const brush = src.brush as Record<string, unknown>;
    if ((brush.kind === 'token' || brush.kind === 'decor') && typeof brush.emoji === 'string' && brush.emoji.length > 0 && brush.emoji.length <= 32) {
      desk.brush = { kind: brush.kind, emoji: brush.emoji };
    }
  }
  desk.selection = readDeskRect(src.selection);
  if (src.clipboard && typeof src.clipboard === 'object') {
    const clip = src.clipboard as Record<string, unknown>;
    const cols = typeof clip.cols === 'number' ? Math.floor(clip.cols) : 0;
    const rows = typeof clip.rows === 'number' ? Math.floor(clip.rows) : 0;
    if (cols >= 1 && rows >= 1 && cols <= 32 && rows <= 32 && Array.isArray(clip.cells) && clip.cells.length === cols * rows) {
      desk.clipboard = {
        cols,
        rows,
        cells: clip.cells.map(cell => {
          if (!cell || typeof cell !== 'object') return { emoji: null, decor: false };
          const row = cell as Record<string, unknown>;
          const emoji = typeof row.emoji === 'string' && row.emoji.length > 0 && row.emoji.length <= 32 ? row.emoji : null;
          return { emoji, decor: row.decor === true && !!emoji };
        }),
      };
    }
  }
  if (src.passMode === 'square') desk.passMode = 'square';
  if (src.passSquare === true || src.passSquare === false || src.passSquare === null) desk.passSquare = src.passSquare;
  return desk;
}

function readCityName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const parsed = normalizeCityName(raw);
  return parsed.ok ? parsed.name : undefined;
}

/**
 * Fill a missing city name with the default and generate a visitor name once.
 * Both stay in the meta save (localStorage). A second call keeps the same visitor name.
 */
export function ensureCityProfile(rng: () => number = Math.random): { cityName: string; anonymousName: string } {
  const meta = loadMeta();
  const cityName = meta.cityName ?? CITY_NAME_DEFAULT;
  let anonymousName = meta.anonymousName;
  if (!anonymousName) anonymousName = generateAnonymousName(rng);
  if (meta.cityName !== cityName || meta.anonymousName !== anonymousName) {
    saveMeta({ ...meta, cityName, anonymousName });
  }
  return { cityName, anonymousName };
}

/** Persist a city name. An empty field saves the default. Invalid text is refused. */
export function saveCityName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const parsed = normalizeCityName(raw);
  if (!parsed.ok) return parsed;
  const meta = loadMeta();
  saveMeta({ ...meta, cityName: parsed.name });
  return { ok: true, name: parsed.name };
}

export function saveCity(city: CityState): void {
  const meta = loadMeta();
  saveMeta({ ...meta, city: normalizeCity(city) });
}

/** Add roguelike turns that should advance the city the next time it opens. */
export function noteCityTurns(turns: number): number {
  const add = Math.max(0, Math.floor(turns));
  const meta = loadMeta();
  const pending = meta.pendingCityTurns ?? 0;
  if (add === 0) return pending;
  const next = pending + add;
  saveMeta({ ...meta, pendingCityTurns: next });
  return next;
}

/** Store the caught-up city and clear the pending turn queue. */
export function settleCityCatchUp(city: CityState, growthRemainder: number): void {
  const meta = loadMeta();
  saveMeta({
    ...meta,
    city: normalizeCity(city),
    pendingCityTurns: 0,
    cityGrowthRemainder: nonNegInt(growthRemainder),
  });
}

/**
 * Remember a D:27 win as a base class. Returns the prestige emoji when that
 * win is the one that unlocks it.
 */
export function recordPrestigeWin(baseClass: string): { prestige: string | null; fresh: boolean } {
  const prestige = PRESTIGE_OF[baseClass] ?? null;
  if (!prestige) return { prestige: null, fresh: false };
  const meta = loadMeta();
  if (meta.unlockedPrestige.includes(prestige)) return { prestige, fresh: false };
  meta.unlockedPrestige = [...meta.unlockedPrestige, prestige];
  saveMeta(meta);
  return { prestige, fresh: true };
}
