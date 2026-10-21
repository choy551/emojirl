import type { EmojiItem } from './types';
import { normalizeEmojiKey } from './discoveries';
import { normalizeCity, type CityState } from './emojiCity';
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

export function emptyMeta(): MetaSave {
  return { schemaVersion: META_SCHEMA_VERSION, unlockedPrestige: [], insuredCarry: [], emojiConsumes: {} };
}

export function loadMeta(): MetaSave {
  try {
    const raw = store.getItem(META_SAVE_KEY);
    if (!raw) return emptyMeta();
    const parsed = JSON.parse(raw) as Partial<MetaSave>;
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

/** Replace the consume ledger. Zero and negative counts are dropped. */
export function replaceEmojiConsumes(counts: Record<string, number>): Record<string, number> {
  const meta = loadMeta();
  const emojiConsumes = countMap(counts);
  saveMeta({ ...meta, emojiConsumes });
  return emojiConsumes;
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
