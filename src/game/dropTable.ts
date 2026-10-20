import type { EmojiItem } from './types';
import {
  ACTIVE_DROPS,
  AMMO_DROP,
  BULLET_DROP,
  EMOJI_POWERS,
  HEAL_DROPS,
  MONEY_BAG,
  equipmentVariantForEmoji,
} from './emojis';

/**
 * Kill-loot rarity.
 *
 * Audit of 🍀 Clover (`bonusLoot`) before this table:
 * - Only the melee kill path consulted it. Ranger shots, cowboy dual guns,
 *   wizard bolts, and lightning zaps used a flat 50% or 55% and ignored clover.
 * - The melee check was only a drop/no-drop roll:
 *     P(drop) = min(0.95, 0.55 + 0.15 * c)
 *   with c = stacked clover copies. It never changed which emoji dropped.
 *   After the roll, categories were uniform: 10% gear, 12% active, then a
 *   class ammo coin-flip, otherwise food (92%) or a money bag (8%).
 *
 * Clover still raises that drop chance (now on every non-boss kill). It also
 * shifts tier weight upward. Quality is independent of the chance roll.
 *
 * Tier index i = 0 Common, 1 Uncommon, 2 Rare, 3 Legendary.
 * Base masses B = { 64, 22, 11, 3 }. Step R = 3/2.
 *
 *   mass_i(c) = B_i * R^(i * c) * mean(classMod in tier i)
 *   P(tier i | drop) = mass_i / Σ mass
 *
 * classMod is 1 except ammo (see QUIVER_WEIGHT and friends). When every
 * classMod in a tier is 1, mean is 1 and mass_i = B_i * R^(i*c).
 * Dividing the tier mass evenly and then multiplying by classMod is the same as:
 *
 *   weight(entry) = classMod(entry) * B_tier * R^(i*c) / n_tier
 *   P(entry) = weight(entry) / Σ weight
 *
 * So P(entry | tier) = classMod(entry) / Σ classMod in that tier.
 * Bosses skip the chance roll, ignore classMod, and draw only souls and
 * equipment (food, ammo, actives, and money stay off boss corpses).
 * Gear emoji then resolve through the existing floor pool (T1/T2/T3).
 */

export const DROP_RARITIES = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type DropRarity = (typeof DROP_RARITIES)[number];

export const RARITY_LABEL: Record<DropRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

export const RARITY_TEXT_CLASS: Record<DropRarity, string> = {
  common: 'text-zinc-400',
  uncommon: 'text-emerald-400',
  rare: 'text-sky-300',
  legendary: 'text-amber-300',
};

export const BASE_TIER_WEIGHTS: Record<DropRarity, number> = {
  common: 64,
  uncommon: 22,
  rare: 11,
  legendary: 3,
};

/** Each clover multiplies the next-higher tier's weight by this, relative to the tier below. */
export const CLOVER_TIER_STEP = 1.5;

export const DROP_CHANCE_BASE = 0.55;
export const DROP_CHANCE_PER_CLOVER = 0.15;
export const DROP_CHANCE_CAP = 0.95;

/** Default quiver weight inside Uncommon (arrows stay a normal find for every class). */
export const QUIVER_WEIGHT = 8;
/** Ranger shots lean on arrows. */
export const RANGER_QUIVER_WEIGHT = 28;
export const COWBOY_BULLET_WEIGHT = 6;
export const COWBOY_DUAL_BULLET_WEIGHT = 24;

export type DropKind = 'heal' | 'money' | 'ammo' | 'active' | 'soul' | 'equipment' | 'cooked';

export interface DropEntry {
  emoji: string;
  kind: DropKind;
  rarity: DropRarity;
  /** Cooked food is shown in tooltips but is not rolled on a kill. */
  droppable: boolean;
}

export interface DropIdentity {
  emoji: string;
  isEquipment?: boolean;
  healAmount?: number;
  ammoAmount?: number;
  activeKind?: string;
  bagPassive?: unknown;
  isMoneyBag?: boolean;
  isCooked?: boolean;
}

export interface DropRollContext {
  clover?: number;
  floor?: number;
  playerClass?: string;
  cowboyDualGuns?: boolean;
  boss?: boolean;
  rng?: () => number;
}

/**
 * Every emoji that can drop, plus cooked food (tooltip only).
 * High tier is Legendary: 💀 💰 🍀 and the other run-defining souls.
 * Low tier is Common: 🧅 🧪 🫀 and the rest of the raw food.
 */
export const DROP_TABLE: DropEntry[] = [
  // ── Common (low) ──────────────────────────────────────────────────────────
  { emoji: '🍎', kind: 'heal', rarity: 'common', droppable: true },
  { emoji: '🍖', kind: 'heal', rarity: 'common', droppable: true },
  { emoji: '🧪', kind: 'heal', rarity: 'common', droppable: true },
  { emoji: '🍇', kind: 'heal', rarity: 'common', droppable: true },
  { emoji: '🫀', kind: 'heal', rarity: 'common', droppable: true },
  { emoji: '🍞', kind: 'heal', rarity: 'common', droppable: true },
  { emoji: '🧅', kind: 'heal', rarity: 'common', droppable: true },
  { emoji: '🍄', kind: 'heal', rarity: 'common', droppable: true },

  // ── Uncommon ──────────────────────────────────────────────────────────────
  { emoji: '🏹', kind: 'ammo', rarity: 'uncommon', droppable: true },
  { emoji: '🪙', kind: 'ammo', rarity: 'uncommon', droppable: true },
  { emoji: '🪢', kind: 'active', rarity: 'uncommon', droppable: true },
  { emoji: '❄️', kind: 'active', rarity: 'uncommon', droppable: true },
  { emoji: '❤️', kind: 'soul', rarity: 'uncommon', droppable: true },
  { emoji: '🍄', kind: 'soul', rarity: 'uncommon', droppable: true },
  { emoji: '🌊', kind: 'soul', rarity: 'uncommon', droppable: true },
  { emoji: '🧊', kind: 'soul', rarity: 'uncommon', droppable: true },
  { emoji: '🧥', kind: 'equipment', rarity: 'uncommon', droppable: true },
  { emoji: '🥋', kind: 'equipment', rarity: 'uncommon', droppable: true },
  { emoji: '🔰', kind: 'equipment', rarity: 'uncommon', droppable: true },
  { emoji: '⛑️', kind: 'equipment', rarity: 'uncommon', droppable: true },
  { emoji: '🔥', kind: 'equipment', rarity: 'uncommon', droppable: true },
  { emoji: '🧊', kind: 'equipment', rarity: 'uncommon', droppable: true },
  { emoji: '🍏', kind: 'cooked', rarity: 'uncommon', droppable: false },
  { emoji: '🥪', kind: 'cooked', rarity: 'uncommon', droppable: false },
  { emoji: '🥩', kind: 'cooked', rarity: 'uncommon', droppable: false },
  { emoji: '🍲', kind: 'cooked', rarity: 'uncommon', droppable: false },
  { emoji: '🍓', kind: 'cooked', rarity: 'uncommon', droppable: false },

  // ── Rare ──────────────────────────────────────────────────────────────────
  { emoji: '💣', kind: 'active', rarity: 'rare', droppable: true },
  { emoji: '🔫', kind: 'active', rarity: 'rare', droppable: true },
  { emoji: '🪃', kind: 'active', rarity: 'rare', droppable: true },
  { emoji: '🔥', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '💎', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '🌟', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '🧲', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '🛡️', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '🎯', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '💊', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '🌙', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '🦋', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '🎲', kind: 'soul', rarity: 'rare', droppable: true },
  { emoji: '🪄', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🌂', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '⚔️', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🔪', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🗡️', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🏹', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🎯', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🔫', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🦺', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🪬', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '💍', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '📿', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🏅', kind: 'equipment', rarity: 'rare', droppable: true },
  { emoji: '🧿', kind: 'equipment', rarity: 'rare', droppable: true },

  // ── Legendary (high): 💀 💰 🍀 and peers ─────────────────────────────────
  { emoji: '💀', kind: 'soul', rarity: 'legendary', droppable: true },
  { emoji: '💰', kind: 'money', rarity: 'legendary', droppable: true },
  { emoji: '🍀', kind: 'soul', rarity: 'legendary', droppable: true },
  { emoji: '⚡', kind: 'soul', rarity: 'legendary', droppable: true },
  { emoji: '👑', kind: 'soul', rarity: 'legendary', droppable: true },
  { emoji: '⛵', kind: 'soul', rarity: 'legendary', droppable: true },
  { emoji: '🔮', kind: 'soul', rarity: 'legendary', droppable: true },
  { emoji: '🗡️', kind: 'soul', rarity: 'legendary', droppable: true },
  { emoji: '🔱', kind: 'equipment', rarity: 'legendary', droppable: true },
  { emoji: '💥', kind: 'equipment', rarity: 'legendary', droppable: true },
];

export function tierIndex(rarity: DropRarity): number {
  return DROP_RARITIES.indexOf(rarity);
}

export function enemyDropChance(clover: number): number {
  const c = Math.max(0, clover);
  return Math.min(DROP_CHANCE_CAP, DROP_CHANCE_BASE + DROP_CHANCE_PER_CLOVER * c);
}

export function formatWeightMultiplier(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Player-facing clover line: drop chance plus the per-step rarity multiplier. */
export function cloverLootSummary(stacks: number): string {
  const c = Math.max(0, stacks);
  const pct = Math.round(enemyDropChance(c) * 100);
  const step = CLOVER_TIER_STEP ** c;
  return `${pct}% drop chance · higher tiers ×${formatWeightMultiplier(step)} per step`;
}

export function dropKindOf(item: DropIdentity): DropKind | undefined {
  if (item.isCooked) return 'cooked';
  if (item.isEquipment) return 'equipment';
  if (item.isMoneyBag || item.emoji === '💰') return 'money';
  if (item.ammoAmount !== undefined) return 'ammo';
  if (item.activeKind) return 'active';
  if (item.healAmount !== undefined) return 'heal';
  if (item.bagPassive) return 'soul';
  if (EMOJI_POWERS.some(e => e.emoji === item.emoji)) return 'soul';
  return undefined;
}

export function rarityOfItem(item: DropIdentity): DropRarity | undefined {
  const kind = dropKindOf(item);
  if (!kind) return undefined;
  return DROP_TABLE.find(e => e.emoji === item.emoji && e.kind === kind)?.rarity;
}

export function rarityTooltipSuffix(item: DropIdentity): string {
  const rarity = rarityOfItem(item);
  return rarity ? ` · ${RARITY_LABEL[rarity]}` : '';
}

export function entriesForRoll(ctx: DropRollContext = {}): DropEntry[] {
  return DROP_TABLE.filter(entry => {
    if (!entry.droppable) return false;
    if (ctx.boss) return entry.kind === 'soul' || entry.kind === 'equipment';
    return true;
  });
}

/** Bosses ignore class ammo bias so every soul and weapon in a tier is even. */
export function classModFor(entry: DropEntry, ctx: DropRollContext = {}): number {
  if (ctx.boss) return 1;
  if (entry.kind === 'ammo' && entry.emoji === '🏹') {
    return ctx.playerClass === '🧝' ? RANGER_QUIVER_WEIGHT : QUIVER_WEIGHT;
  }
  if (entry.kind === 'ammo' && entry.emoji === '🪙') {
    if (ctx.playerClass === '🤠' && ctx.cowboyDualGuns) return COWBOY_DUAL_BULLET_WEIGHT;
    if (ctx.playerClass === '🤠') return COWBOY_BULLET_WEIGHT;
  }
  return 1;
}

export function entryDropWeight(entry: DropEntry, clover: number, ctx: DropRollContext, pool: DropEntry[]): number {
  const peers = pool.filter(e => e.rarity === entry.rarity);
  const n = peers.length;
  if (n === 0) return 0;
  const i = tierIndex(entry.rarity);
  const mod = classModFor(entry, ctx);
  return (mod * BASE_TIER_WEIGHTS[entry.rarity] * CLOVER_TIER_STEP ** (i * Math.max(0, clover))) / n;
}

export function tierProbabilities(clover: number, ctx: DropRollContext = {}): Record<DropRarity, number> {
  const pool = entriesForRoll(ctx);
  const masses = Object.fromEntries(DROP_RARITIES.map(r => [r, 0])) as Record<DropRarity, number>;
  let total = 0;
  for (const entry of pool) {
    const w = entryDropWeight(entry, clover, ctx, pool);
    masses[entry.rarity] += w;
    total += w;
  }
  for (const rarity of DROP_RARITIES) {
    masses[rarity] = total > 0 ? masses[rarity] / total : 0;
  }
  return masses;
}

function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  let total = 0;
  for (const w of weights) total += w;
  if (items.length === 0 || total <= 0) throw new Error('empty drop table');
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

function materialize(entry: DropEntry, floor: number, rng: () => number): Omit<EmojiItem, 'id' | 'consumed'> {
  switch (entry.kind) {
    case 'heal': {
      const found = HEAL_DROPS.find(e => e.emoji === entry.emoji);
      if (!found) throw new Error(`missing heal drop ${entry.emoji}`);
      return { ...found };
    }
    case 'money':
      return { ...MONEY_BAG };
    case 'ammo':
      return { ...(entry.emoji === '🪙' ? BULLET_DROP : AMMO_DROP) };
    case 'active': {
      const found = ACTIVE_DROPS.find(e => e.emoji === entry.emoji);
      if (!found) throw new Error(`missing active drop ${entry.emoji}`);
      return { ...found };
    }
    case 'soul': {
      const found = EMOJI_POWERS.find(e => e.emoji === entry.emoji);
      if (!found) throw new Error(`missing soul drop ${entry.emoji}`);
      return { ...found };
    }
    case 'equipment':
      return { ...equipmentVariantForEmoji(entry.emoji, floor, rng) };
    default:
      throw new Error(`not rolled on kills: ${entry.kind} ${entry.emoji}`);
  }
}

/** Always returns an item from the weighted table. */
export function rollFromDropTable(ctx: DropRollContext = {}): Omit<EmojiItem, 'id' | 'consumed'> {
  const rng = ctx.rng ?? Math.random;
  const clover = Math.max(0, ctx.clover ?? 0);
  const pool = entriesForRoll(ctx);
  const weights = pool.map(entry => entryDropWeight(entry, clover, ctx, pool));
  const picked = weightedPick(pool, weights, rng);
  return materialize(picked, ctx.floor ?? 1, rng);
}

/**
 * Non-boss kills roll `enemyDropChance(clover)` first, then the tier table.
 * Bosses always drop, from souls and equipment only, with the same clover shift.
 */
export function rollKillDrop(ctx: DropRollContext = {}): Omit<EmojiItem, 'id' | 'consumed'> | null {
  const rng = ctx.rng ?? Math.random;
  if (!ctx.boss && rng() >= enemyDropChance(ctx.clover ?? 0)) return null;
  return rollFromDropTable({ ...ctx, rng });
}
