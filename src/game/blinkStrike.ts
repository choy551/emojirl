import type { BlinkStrikeMark, BlinkTalentId, Player } from './types';

/**
 * Blink Strike damage and Ninja talent rules.
 *
 * Damage (before defense):
 *   effectiveCrit = clamp(5 + LCK, 0, CRIT_STAT_SOFT_CAP)
 *   M             = min(4, 2 + 0.02 × effectiveCrit)     // 200% at 0 CRIT, +2% per CRIT, cap 400%
 *   raw           = round(ATK × M)
 *   if the target is unaware, raw = round(raw × 1.6)     // existing Shadow Strike
 *   hit           = max(1, round(raw × moodMult × (crit ? 2 : 1)) − DEF)
 * Crit chance is the normal combat roll (5 + LCK + mood crit bonus, plus Skull
 * when that passive is active). The multiplier uses the soft-capped CRIT stat;
 * the roll itself is not soft-capped.
 *
 * Talent credits (per run):
 *   instakill (full-HP target slain by the Blink) = 2
 *   any other Blink (fizzle or a non-instakill hit) = 1 if that target dies
 *   while 0 ≤ deathTurn − blinkTurn ≤ BLINK_TALENT_DELAYED_KILL_TURNS
 * Every BLINK_TALENT_CREDITS_PER_TIER credits opens one permanent pick.
 */

/** HUD / combat CRIT display cap. Effective CRIT for Blink scaling never exceeds this. */
export const CRIT_STAT_SOFT_CAP = 99;

export const BLINK_MULTIPLIER_MIN_PERCENT = 200;
export const BLINK_MULTIPLIER_MAX_PERCENT = 400;
export const BLINK_MULTIPLIER_PER_CRIT = 2;

export const BLINK_BASE_COOLDOWN = 8;
export const BLINK_KILL_COOLDOWN = 7;
export const BLINK_CHAIN_CAPPED_COOLDOWN = 3;
export const BLINK_INSTAKILL_CHAIN_LIMIT = 3;

/** Credits required to unlock each talent offer. */
export const BLINK_TALENT_CREDITS_PER_TIER = 44;
export const BLINK_TALENT_INSTAKILL_CREDITS = 2;
export const BLINK_TALENT_DELAYED_CREDITS = 1;
/** Inclusive window: a marked target still pays out on deathTurn = blinkTurn + this. */
export const BLINK_TALENT_DELAYED_KILL_TURNS = 3;

export const BLINK_TALENT_COOLDOWN_REDUCTION = 1;
export const BLINK_TALENT_LIFESTEAL_PERCENT = 10;
export const BLINK_TALENT_POST_BLINK_MELEE_HITS = 3;
export const BLINK_TALENT_POST_BLINK_CD_PER_HIT = 1;
export const BLINK_TALENT_CHAIN_BONUS = 1;
/** Extra targets beyond the primary. 1 → Blink hits 2 targets. */
export const BLINK_TALENT_EXTRA_TARGETS = 1;

export type { BlinkTalentId, BlinkStrikeMark };

export interface BlinkTalentDef {
  id: BlinkTalentId;
  tier: 1 | 2 | 3;
  name: string;
  detail: string;
}

export const BLINK_TALENTS: readonly BlinkTalentDef[] = [
  {
    id: 'shorter-cd',
    tier: 1,
    name: 'Shorter Cooldown',
    detail: `Blink Strike cooldowns are ${BLINK_TALENT_COOLDOWN_REDUCTION} turn shorter.`,
  },
  {
    id: 'lifesteal',
    tier: 1,
    name: 'Blink Lifesteal',
    detail: `Heal for ${BLINK_TALENT_LIFESTEAL_PERCENT}% of Blink Strike damage.`,
  },
  {
    id: 'flowing-strikes',
    tier: 2,
    name: 'Flowing Strikes',
    detail: `Each of the next ${BLINK_TALENT_POST_BLINK_MELEE_HITS} melee attacks after Blink Strike reduces its cooldown by ${BLINK_TALENT_POST_BLINK_CD_PER_HIT}.`,
  },
  {
    id: 'longer-chain',
    tier: 2,
    name: 'Longer Chain',
    detail: `Instakill chain limit +${BLINK_TALENT_CHAIN_BONUS} (one extra instant reset).`,
  },
  {
    id: 'twin-strike',
    tier: 3,
    name: 'Twin Strike',
    detail: `Blink Strike hits ${1 + BLINK_TALENT_EXTRA_TARGETS} targets in one cast.`,
  },
  {
    id: 'endless-chain',
    tier: 3,
    name: 'Endless Chain',
    detail: 'Instakill chain has no limit — every instakill resets the cooldown.',
  },
];

const TALENT_BY_ID = new Map(BLINK_TALENTS.map(t => [t.id, t]));

export function blinkTalentById(id: BlinkTalentId): BlinkTalentDef {
  const found = TALENT_BY_ID.get(id);
  if (!found) throw new Error(`unknown blink talent ${id}`);
  return found;
}

/** CRIT stat shown in the HUD: 5 + LCK, soft-capped at 99. May be negative if LCK < −5. */
export function critStat(luck: number): number {
  return Math.min(CRIT_STAT_SOFT_CAP, 5 + luck);
}

/** CRIT used to scale Blink Strike. Floors at 0 and respects the CRIT soft cap. */
export function effectiveCritForBlink(crit: number): number {
  return Math.min(CRIT_STAT_SOFT_CAP, Math.max(0, crit));
}

/** Blink Strike damage percent. 200 at 0 CRIT, +2 per CRIT, never above 400, and never above the soft-capped CRIT. */
export function blinkStrikeMultiplierPercent(crit: number): number {
  const effective = effectiveCritForBlink(crit);
  const scaled = BLINK_MULTIPLIER_MIN_PERCENT + BLINK_MULTIPLIER_PER_CRIT * effective;
  return Math.min(BLINK_MULTIPLIER_MAX_PERCENT, Math.max(BLINK_MULTIPLIER_MIN_PERCENT, scaled));
}

export function blinkStrikeDamageMultiplier(crit: number): number {
  return blinkStrikeMultiplierPercent(crit) / 100;
}

export function blinkStrikeDamagePhrase(luck: number): string {
  const crit = critStat(luck);
  const pct = blinkStrikeMultiplierPercent(crit);
  return `${pct}% damage (CRIT ${crit}%)`;
}

export function hasBlinkTalent(talents: readonly BlinkTalentId[] | undefined, id: BlinkTalentId): boolean {
  return (talents ?? []).includes(id);
}

export function blinkStrikeTargetCount(talents: readonly BlinkTalentId[] | undefined): number {
  return 1 + (hasBlinkTalent(talents, 'twin-strike') ? BLINK_TALENT_EXTRA_TARGETS : 0);
}

export function blinkLifestealHeal(damage: number, talents: readonly BlinkTalentId[] | undefined): number {
  if (damage <= 0 || !hasBlinkTalent(talents, 'lifesteal')) return 0;
  return Math.floor(damage * BLINK_TALENT_LIFESTEAL_PERCENT / 100);
}

export function blinkMeleeChargesAfterCast(talents: readonly BlinkTalentId[] | undefined): number {
  return hasBlinkTalent(talents, 'flowing-strikes') ? BLINK_TALENT_POST_BLINK_MELEE_HITS : 0;
}

/** null means the instakill chain never caps. */
export function blinkInstakillChainLimit(talents: readonly BlinkTalentId[] | undefined): number | null {
  if (hasBlinkTalent(talents, 'endless-chain')) return null;
  const bonus = hasBlinkTalent(talents, 'longer-chain') ? BLINK_TALENT_CHAIN_BONUS : 0;
  return BLINK_INSTAKILL_CHAIN_LIMIT + bonus;
}

export function applyBlinkCooldownReduction(turns: number, talents: readonly BlinkTalentId[] | undefined): number {
  if (turns <= 0) return 0;
  if (!hasBlinkTalent(talents, 'shorter-cd')) return turns;
  return Math.max(0, turns - BLINK_TALENT_COOLDOWN_REDUCTION);
}

export function resolveBlinkCooldown(opts: {
  talents: readonly BlinkTalentId[] | undefined;
  killed: boolean;
  instakill: boolean;
  chain: number;
}): { cooldown: number; chain: number; log: string } {
  const { talents, killed, instakill } = opts;
  if (instakill) {
    const limit = blinkInstakillChainLimit(talents);
    if (limit == null || opts.chain < limit) {
      const chain = opts.chain + 1;
      const shown = limit == null ? `${chain}` : `${chain}/${limit}`;
      return { cooldown: 0, chain, log: `🥷 Blink Kill! Chain ${shown} — instant reset!` };
    }
    const cooldown = applyBlinkCooldownReduction(BLINK_CHAIN_CAPPED_COOLDOWN, talents);
    return { cooldown, chain: opts.chain, log: `🥷 Blink Kill! Chain maxed — ${cooldown}t cooldown.` };
  }
  if (killed) {
    const cooldown = applyBlinkCooldownReduction(BLINK_KILL_COOLDOWN, talents);
    return { cooldown, chain: 0, log: `🥷 Blink Kill! Cooldown: ${cooldown}t.` };
  }
  const cooldown = applyBlinkCooldownReduction(BLINK_BASE_COOLDOWN, talents);
  return { cooldown, chain: 0, log: `🥷 Blink Strike — ${cooldown} turn cooldown started.` };
}

export function applyFlowingStrike(stats: Player['stats']): { stats: Player['stats']; log: string | null } {
  const charges = stats.blinkMeleeCdCharges ?? 0;
  if (charges <= 0 || !hasBlinkTalent(stats.blinkTalents, 'flowing-strikes')) {
    return { stats, log: null };
  }
  const cd = stats.blinkStrikeCooldown ?? 0;
  const nextCd = Math.max(0, cd - BLINK_TALENT_POST_BLINK_CD_PER_HIT);
  const next = { ...stats, blinkStrikeCooldown: nextCd, blinkMeleeCdCharges: charges - 1 };
  const log = nextCd < cd ? `🥷 Flowing Strike — Blink cooldown ${nextCd}t.` : null;
  return { stats: next, log };
}

export function tierLabelForOffer(offerIndex: number): string {
  if (offerIndex <= 0) return 'T1';
  if (offerIndex === 1) return 'T2';
  if (offerIndex === 2) return 'T3';
  return 'T4+';
}

export function blinkTalentOffersEarned(credits: number): number {
  if (credits <= 0) return 0;
  return Math.min(BLINK_TALENTS.length, Math.floor(credits / BLINK_TALENT_CREDITS_PER_TIER));
}

/** Choices for the next unpicked offer. T1–T3 are tier-locked; later offers are any leftover talent. */
export function blinkTalentChoices(picked: readonly BlinkTalentId[] | undefined): BlinkTalentDef[] {
  const owned = picked ?? [];
  if (owned.length >= BLINK_TALENTS.length) return [];
  if (owned.length < 3) {
    const tier = (owned.length + 1) as 1 | 2 | 3;
    return BLINK_TALENTS.filter(t => t.tier === tier);
  }
  return BLINK_TALENTS.filter(t => !owned.includes(t.id));
}

export function pendingBlinkTalentOffer(
  credits: number,
  picked: readonly BlinkTalentId[] | undefined,
): { tierLabel: string; choices: BlinkTalentDef[] } | null {
  const owned = picked ?? [];
  const earned = blinkTalentOffersEarned(credits);
  if (owned.length >= earned || owned.length >= BLINK_TALENTS.length) return null;
  const choices = blinkTalentChoices(owned);
  if (choices.length === 0) return null;
  return { tierLabel: tierLabelForOffer(owned.length), choices };
}

export interface BlinkTalentProgress {
  current: number;
  needed: number;
  ratio: string;
  nextTier: string | null;
  readyToPick: boolean;
  complete: boolean;
  /** HUD / tactics: "⚡ Blink talents 12/44" */
  hudLabel: string;
  /** Stats: "Blink talents: 12/44" */
  statsLabel: string;
  /** "Next: T1" | "Choose T1" | "All talents taken" */
  nextLabel: string;
  /** Compact mobile chip: "⚡12/44" */
  compactLabel: string;
}

export function blinkTalentProgress(
  credits: number,
  picked: readonly BlinkTalentId[] | undefined,
): BlinkTalentProgress {
  const needed = BLINK_TALENT_CREDITS_PER_TIER;
  const safeCredits = Math.max(0, credits);
  const owned = picked ?? [];
  const earned = blinkTalentOffersEarned(safeCredits);
  if (owned.length >= BLINK_TALENTS.length) {
    return {
      current: needed,
      needed,
      ratio: `${needed}/${needed}`,
      nextTier: null,
      readyToPick: false,
      complete: true,
      hudLabel: '⚡ Blink talents complete',
      statsLabel: 'Blink talents: complete',
      nextLabel: 'All talents taken',
      compactLabel: '⚡ done',
    };
  }
  const pending = earned > owned.length;
  const nextTier = tierLabelForOffer(pending ? owned.length : earned);
  const current = pending ? needed : safeCredits % needed;
  const ratio = `${current}/${needed}`;
  const nextLabel = pending ? `Choose ${nextTier}` : `Next: ${nextTier}`;
  return {
    current,
    needed,
    ratio,
    nextTier,
    readyToPick: pending,
    complete: false,
    hudLabel: `⚡ Blink talents ${ratio}`,
    statsLabel: `Blink talents: ${ratio}`,
    nextLabel,
    compactLabel: `⚡${ratio}`,
  };
}

export function creditLogLines(prevCredits: number, gained: number, picked: readonly BlinkTalentId[] | undefined): string[] {
  if (gained <= 0) return [];
  const next = prevCredits + gained;
  const progress = blinkTalentProgress(next, picked);
  const lines = [`🥷 Blink talent +${gained} (${progress.ratio}).`];
  const prevOffers = blinkTalentOffersEarned(prevCredits);
  const nextOffers = blinkTalentOffersEarned(next);
  if (nextOffers > prevOffers && (picked ?? []).length < nextOffers) {
    lines.push(`🥷 Blink talent ready — choose ${tierLabelForOffer((picked ?? []).length)}.`);
  }
  return lines;
}

export function grantBlinkCredits(player: Player, amount: number): { player: Player; logs: string[] } {
  if (amount <= 0) return { player, logs: [] };
  const prev = player.stats.blinkStrikeCredits ?? 0;
  const logs = creditLogLines(prev, amount, player.stats.blinkTalents);
  return {
    player: {
      ...player,
      stats: { ...player.stats, blinkStrikeCredits: prev + amount },
    },
    logs,
  };
}

/**
 * Credits for one Blink target.
 * Instakill pays 2 immediately. A non-instakill kill pays 1 immediately
 * (death is on the Blink turn). Anything else is marked for a later death.
 */
export function creditsForBlinkTarget(instakill: boolean, killedNow: boolean): { immediate: number; mark: boolean } {
  if (instakill && killedNow) return { immediate: BLINK_TALENT_INSTAKILL_CREDITS, mark: false };
  if (killedNow) return { immediate: BLINK_TALENT_DELAYED_CREDITS, mark: false };
  return { immediate: 0, mark: true };
}

export function addBlinkMarks(
  existing: readonly BlinkStrikeMark[] | undefined,
  enemyIds: readonly string[],
  blinkTurn: number,
): BlinkStrikeMark[] {
  const next = [...(existing ?? [])];
  for (const enemyId of enemyIds) next.push({ enemyId, blinkTurn });
  return next;
}

/**
 * Pay delayed credits for marked enemies who are no longer among the living,
 * and drop marks that expired without a kill. No log lines when nothing is gained.
 */
export function settleBlinkStrikeMarks(
  player: Player,
  livingEnemies: readonly { id: string }[],
  turn: number,
): { player: Player; logs: string[] } {
  const marks = player.stats.blinkStrikeMarks;
  if (!marks?.length) return { player, logs: [] };
  const living = new Set(livingEnemies.map(e => e.id));
  const kept: BlinkStrikeMark[] = [];
  let gained = 0;
  let changed = false;
  for (const mark of marks) {
    const elapsed = turn - mark.blinkTurn;
    const expired = elapsed > BLINK_TALENT_DELAYED_KILL_TURNS;
    const dead = !living.has(mark.enemyId);
    if (dead && elapsed >= 0 && !expired) {
      gained += BLINK_TALENT_DELAYED_CREDITS;
      changed = true;
      continue;
    }
    if (dead || expired) {
      changed = true;
      continue;
    }
    kept.push(mark);
  }
  if (!changed && gained === 0) return { player, logs: [] };
  const prev = player.stats.blinkStrikeCredits ?? 0;
  const logs = creditLogLines(prev, gained, player.stats.blinkTalents);
  return {
    player: {
      ...player,
      stats: {
        ...player.stats,
        blinkStrikeCredits: prev + gained,
        blinkStrikeMarks: kept.length ? kept : undefined,
      },
    },
    logs,
  };
}

export function blinkStrikeRulesBlurb(luck?: number): string {
  const capPct = blinkStrikeMultiplierPercent(CRIT_STAT_SOFT_CAP);
  const live = luck == null ? '' : `Currently ${blinkStrikeDamagePhrase(luck)}. `;
  return `${live}Damage is ${BLINK_MULTIPLIER_MIN_PERCENT}% at 0 CRIT, +${BLINK_MULTIPLIER_PER_CRIT}% per CRIT, capped at ${BLINK_MULTIPLIER_MAX_PERCENT}% (CRIT is soft-capped at ${CRIT_STAT_SOFT_CAP}, so the strike tops out at ${capPct}%). Critical hits use normal crit chance and double that damage.`;
}
