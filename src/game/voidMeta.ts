import type { VoidGhost } from './types';
import { ACTIVE_DROPS } from './emojis';
import { voidGhostCapacity } from './voidDamage';

const UNLOCK_KEY = 'emojirl_unlocked_void';
const PENDING_KEY = 'emojirl_void_unlock_pending';
const GHOST_KEY = 'emojirl_void_ghosts';
const MODE_KEY = 'emojirl_void_attack_modes';

/** Hotbar consumes of ranged-themed emoji required to unlock Ranger autos. */
export const VOID_RANGER_UNLOCK_N = 10;
/** Hotbar consumes of magic-flavored emoji required to unlock Wizard autos. */
export const VOID_WIZARD_UNLOCK_N = 10;

export interface VoidModeProgress {
  ranger: number;
  wizard: number;
}

export interface GhostCatalogEntry {
  unlocks: number;
  consumes: number;
  /** First time this emoji crossed 10 consumes. 0 until then. */
  order: number;
}

export type GhostCatalog = Record<string, GhostCatalogEntry>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isVoidUnlocked(): boolean {
  try { return localStorage.getItem(UNLOCK_KEY) === '1'; }
  catch { return false; }
}

/** Persist the unlock. Returns true only the first time. */
export function unlockVoidClass(): boolean {
  try {
    if (localStorage.getItem(UNLOCK_KEY) === '1') return false;
    localStorage.setItem(UNLOCK_KEY, '1');
    localStorage.setItem(PENDING_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function voidUnlockPending(): boolean {
  try { return localStorage.getItem(PENDING_KEY) === '1'; }
  catch { return false; }
}

export function acknowledgeVoidUnlock(): void {
  try { localStorage.removeItem(PENDING_KEY); }
  catch { /* ignore */ }
}

export function readGhostCatalog(): GhostCatalog {
  const raw = readJson<GhostCatalog>(GHOST_KEY, {});
  const next: GhostCatalog = {};
  for (const [emoji, entry] of Object.entries(raw ?? {})) {
    if (!entry || typeof entry !== 'object') continue;
    next[emoji] = {
      unlocks: Math.max(0, Math.floor(entry.unlocks ?? 0)),
      consumes: Math.max(0, Math.floor(entry.consumes ?? 0)),
      order: Math.max(0, Math.floor(entry.order ?? 0)),
    };
  }
  return next;
}

function writeGhostCatalog(cat: GhostCatalog): void {
  try { localStorage.setItem(GHOST_KEY, JSON.stringify(cat)); }
  catch { /* ignore quota */ }
}

/**
 * Count one hotbar consume of a soul emoji on a Void run.
 * Unlocks (stacks) = floor(consumes / 10). `crossed` is true when a new stack is earned.
 */
function writeConsumeEntry(
  emoji: string,
  consumes: number,
  prev: GhostCatalogEntry,
  cat: GhostCatalog,
): { unlocks: number; consumes: number; crossed: boolean } {
  const unlocks = Math.floor(consumes / 10);
  const crossed = unlocks > prev.unlocks;
  let order = prev.order;
  if (crossed && order === 0) {
    const maxOrder = Object.values(cat).reduce((m, e) => Math.max(m, e.order), 0);
    order = maxOrder + 1;
  }
  cat[emoji] = { unlocks, consumes, order };
  writeGhostCatalog(cat);
  return { unlocks, consumes, crossed };
}

export function recordHotbarSoulConsume(emoji: string): { unlocks: number; consumes: number; crossed: boolean } {
  const cat = readGhostCatalog();
  const cur = cat[emoji] ?? { unlocks: 0, consumes: 0, order: 0 };
  return writeConsumeEntry(emoji, cur.consumes + 1, cur, cat);
}

/** Add several consumes at once. Same unlock rule as a hotbar spend: floor(consumes / 10). */
export function addVoidConsumes(emoji: string, n: number): { unlocks: number; consumes: number; crossed: boolean } {
  const add = Math.max(0, Math.floor(n));
  const cat = readGhostCatalog();
  const cur = cat[emoji] ?? { unlocks: 0, consumes: 0, order: 0 };
  return writeConsumeEntry(emoji, cur.consumes + add, cur, cat);
}

/** Consumes above the current ghost-stack floor. Spending these does not drop a stack. */
export function spareConsumes(entry?: GhostCatalogEntry): number {
  if (!entry) return 0;
  return Math.max(0, entry.consumes - entry.unlocks * 10);
}

export function spendSpareConsumes(emoji: string, n: number): {
  ok: boolean;
  consumes: number;
  spare: number;
  unlocks: number;
} {
  const need = Math.max(0, Math.floor(n));
  const cat = readGhostCatalog();
  const cur = cat[emoji] ?? { unlocks: 0, consumes: 0, order: 0 };
  const spare = spareConsumes(cur);
  if (spare < need) return { ok: false, consumes: cur.consumes, spare, unlocks: cur.unlocks };
  const consumes = cur.consumes - need;
  const unlocks = Math.floor(consumes / 10);
  cat[emoji] = { ...cur, consumes, unlocks };
  writeGhostCatalog(cat);
  return { ok: true, consumes, spare: spare - need, unlocks };
}

export function readVoidModeProgress(): VoidModeProgress {
  const raw = readJson<Partial<VoidModeProgress>>(MODE_KEY, {});
  return {
    ranger: Math.max(0, Math.floor(raw?.ranger ?? 0)),
    wizard: Math.max(0, Math.floor(raw?.wizard ?? 0)),
  };
}

function writeVoidModeProgress(progress: VoidModeProgress): void {
  try { localStorage.setItem(MODE_KEY, JSON.stringify(progress)); }
  catch { /* ignore quota */ }
}

/** Count one themed hotbar consume toward Ranger or Wizard autos. */
export function recordVoidModeConsume(theme: 'ranger' | 'wizard' | null): {
  progress: VoidModeProgress;
  unlocked: boolean;
} {
  const progress = readVoidModeProgress();
  if (!theme) return { progress, unlocked: false };
  const before = progress[theme];
  const need = theme === 'ranger' ? VOID_RANGER_UNLOCK_N : VOID_WIZARD_UNLOCK_N;
  progress[theme] = before + 1;
  writeVoidModeProgress(progress);
  return { progress, unlocked: before < need && progress[theme] >= need };
}

export function voidModeUnlocked(theme: 'ranger' | 'wizard', progress = readVoidModeProgress()): boolean {
  const need = theme === 'ranger' ? VOID_RANGER_UNLOCK_N : VOID_WIZARD_UNLOCK_N;
  return progress[theme] >= need;
}

/** Permanent ghosts for a new Void run. Auto-fill the hotbar up to depth capacity; the rest stay banked. */
export function startingVoidLoadout(bossesCleared = 0): { ghostHotbar: (VoidGhost | null)[]; ghostBank: VoidGhost[] } {
  const cap = voidGhostCapacity(1, bossesCleared);
  const entries = Object.entries(readGhostCatalog())
    .filter(([, v]) => v.unlocks > 0)
    .sort((a, b) => (a[1].order - b[1].order) || a[0].localeCompare(b[0]));
  const ghostHotbar: (VoidGhost | null)[] = Array.from({ length: 9 }, () => null);
  const ghostBank: VoidGhost[] = [];
  let placed = 0;
  for (const [emoji, v] of entries) {
    const drop = ACTIVE_DROPS.find(d => d.emoji === emoji);
    const ghost: VoidGhost = { emoji, stacks: v.unlocks };
    if (drop && typeof drop.charges === 'number') {
      ghost.uses = drop.charges;
      ghost.maxUses = drop.charges;
    }
    if (placed < cap) {
      ghostHotbar[placed] = ghost;
      placed++;
    } else {
      ghostBank.push(ghost);
    }
  }
  return { ghostHotbar, ghostBank };
}
