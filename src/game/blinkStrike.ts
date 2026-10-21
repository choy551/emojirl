import type { BlinkStrikeMark, BlinkTalentId, Player } from './types';

/**
 * Blink Strike damage and Ninja talent rules.
 *
 * Damage (before defense):
 *   effectiveCrit = clamp(5 + LCK, 0, CRIT_STAT_SOFT_CAP)
 *   percent       = 200 + round(200 × effectiveCrit / 99) // 200% at 0 CRIT, 400% at 99 CRIT
 *   Heavier Blink shifts that line by +100: 300% at 0 CRIT, 500% at 99 CRIT
 *   M             = percent / 100
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
/** Approximate slope. The exact line is 200 points across the 0–99 CRIT cap, so a step is 2 or 3. */
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
/** Extra targets beyond the primary. 1 → Blink hits 2 targets. */
export const BLINK_TALENT_EXTRA_TARGETS = 1;
/** Heavier Blink shifts both ends of the 200%→400% line by this many points. */
export const BLINK_TALENT_DAMAGE_BONUS_PERCENT = 100;
/** Turns before Overkill can bank another instakill. Same base as Blink Strike. */
export const BLINK_OVERKILL_COOLDOWN = BLINK_BASE_COOLDOWN;
/** Blink Strike targeting radius, in Chebyshev tiles. */
export const BLINK_RANGE = 6;
/** First N offers are locked to that tier. Later offers are any skipped talent. */
export const BLINK_TALENT_LOCKED_TIERS = 4;

export type { BlinkTalentId, BlinkStrikeMark };

export interface BlinkTalentDef {
  id: BlinkTalentId;
  tier: 1 | 2 | 3 | 4;
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
    id: 'heavier-blink',
    tier: 2,
    name: 'Heavier Blink',
    detail: `Blink Strike damage and its cap are +${BLINK_TALENT_DAMAGE_BONUS_PERCENT}% (${BLINK_MULTIPLIER_MIN_PERCENT + BLINK_TALENT_DAMAGE_BONUS_PERCENT}% at 0 CRIT, ${BLINK_MULTIPLIER_MAX_PERCENT + BLINK_TALENT_DAMAGE_BONUS_PERCENT}% at ${CRIT_STAT_SOFT_CAP} CRIT).`,
  },
  {
    id: 'overkill',
    tier: 3,
    name: 'Overkill',
    detail: `An instakill stores damage past the victim's max HP and adds it to the next Blink that hits (10 HP struck for 30 stores +20). The store does not stack; a new proc replaces it. A miss keeps it. Banking then waits ${BLINK_OVERKILL_COOLDOWN} turns. Shorter Cooldown and Flowing Strikes shorten that wait the same way they shorten Blink's cooldown. The store can be spent during the wait.`,
  },
  {
    id: 'blink-truestrike',
    tier: 3,
    name: 'Blink Truestrike',
    detail: `Blink Strikes always hit and ignore God-blessed instakill immunity. With Telepathy (🔮 Crystal Ball in your bag), Blink can target enemies within ${BLINK_RANGE} tiles through walls.`,
  },
  {
    id: 'twin-strike',
    tier: 4,
    name: 'Twin Strike',
    detail: `Blink Strike hits ${1 + BLINK_TALENT_EXTRA_TARGETS} targets in one cast.`,
  },
  {
    id: 'endless-chain',
    tier: 4,
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

/** Drops removed ids such as the old Longer Chain talent. Empty becomes undefined. */
export function knownBlinkTalents(picked: readonly string[] | null | undefined): BlinkTalentId[] | undefined {
  if (!picked?.length) return undefined;
  const kept = picked.filter((id): id is BlinkTalentId => TALENT_BY_ID.has(id as BlinkTalentId));
  return kept.length ? kept : undefined;
}

function ownedList(picked: readonly string[] | null | undefined): BlinkTalentId[] {
  return knownBlinkTalents(picked) ?? [];
}

/** CRIT stat shown in the HUD: 5 + LCK, soft-capped at 99. May be negative if LCK < −5. */
export function critStat(luck: number): number {
  return Math.min(CRIT_STAT_SOFT_CAP, 5 + luck);
}

/** CRIT used to scale Blink Strike. Floors at 0 and respects the CRIT soft cap. */
export function effectiveCritForBlink(crit: number): number {
  return Math.min(CRIT_STAT_SOFT_CAP, Math.max(0, crit));
}

/** Blink Strike damage percent. 200 at 0 CRIT, 400 at 99 CRIT. Heavier Blink shifts both ends by +100. */
export function blinkStrikeMultiplierPercent(crit: number, talents?: readonly BlinkTalentId[]): number {
  const effective = effectiveCritForBlink(crit);
  const bonus = hasBlinkTalent(talents, 'heavier-blink') ? BLINK_TALENT_DAMAGE_BONUS_PERCENT : 0;
  const min = BLINK_MULTIPLIER_MIN_PERCENT + bonus;
  const max = BLINK_MULTIPLIER_MAX_PERCENT + bonus;
  const span = max - min;
  const scaled = min + Math.round((span * effective) / CRIT_STAT_SOFT_CAP);
  return Math.min(max, Math.max(min, scaled));
}

export function blinkStrikeDamageMultiplier(crit: number, talents?: readonly BlinkTalentId[]): number {
  return blinkStrikeMultiplierPercent(crit, talents) / 100;
}

export function blinkStrikeDamagePhrase(luck: number, talents?: readonly BlinkTalentId[]): string {
  const crit = critStat(luck);
  const pct = blinkStrikeMultiplierPercent(crit, talents);
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
  return BLINK_INSTAKILL_CHAIN_LIMIT;
}

export function blinkIgnoresGodBlessed(talents: readonly BlinkTalentId[] | undefined): boolean {
  return hasBlinkTalent(talents, 'blink-truestrike');
}

export function blinkStrikeAlwaysHits(talents: readonly BlinkTalentId[] | undefined): boolean {
  return hasBlinkTalent(talents, 'blink-truestrike');
}

/** 🔮 Crystal Ball's bag passive. Equipping the ball, or leaving it in the bank, is not Telepathy. */
export function blinkWaivesLineOfSight(
  talents: readonly BlinkTalentId[] | undefined,
  telepathy: boolean,
): boolean {
  return !!telepathy && hasBlinkTalent(talents, 'blink-truestrike');
}

export function isBlinkStrikeTarget(opts: {
  dist: number;
  hasLos: boolean;
  tileVisible: boolean;
  hostile: boolean;
  talents: readonly BlinkTalentId[] | undefined;
  telepathy: boolean;
}): boolean {
  if (!opts.hostile || opts.dist < 1 || opts.dist > BLINK_RANGE) return false;
  if (blinkWaivesLineOfSight(opts.talents, opts.telepathy)) return true;
  return opts.hasLos && opts.tileVisible;
}

export function blinkNoTargetLog(talents: readonly BlinkTalentId[] | undefined, telepathy: boolean): string {
  return blinkWaivesLineOfSight(talents, telepathy)
    ? `🥷 Blink Strike — no targets in range (${BLINK_RANGE} tiles).`
    : `🥷 Blink Strike — no targets in range (${BLINK_RANGE} tiles, requires LOS).`;
}

export function blinkOutOfRangeLog(talents: readonly BlinkTalentId[] | undefined, telepathy: boolean): string {
  return blinkWaivesLineOfSight(talents, telepathy)
    ? '🥷 Blink Strike — target out of range.'
    : '🥷 Blink Strike — target out of range or LOS broken.';
}

/** Damage past max HP. A 10 HP foe struck for 30 banks 20. */
export function overkillExcess(damage: number, maxHp: number): number {
  return Math.max(0, damage - Math.max(0, maxHp));
}

/** The bank is spent only when a Blink deals damage. A miss keeps the whole store. */
export function overkillBankAfterHit(bank: number, damageDealt: number): number {
  const stored = Math.max(0, bank);
  if (stored <= 0 || damageDealt <= 0) return stored;
  return 0;
}

export interface OverkillResolution {
  bank: number;
  cooldown: number;
  log: string | null;
}

/**
 * Banking is gated by the Overkill cooldown. Spending is not.
 * One cast sums every instakill's excess into a single store and replaces
 * whatever was still unspent. A cast that does not bank still spends one
 * turn of an existing cooldown.
 */
export function resolveOverkillAfterBlink(opts: {
  talents: readonly BlinkTalentId[] | undefined;
  cooldown: number;
  carriedBank: number;
  instakillDamages: readonly { damage: number; maxHp: number }[];
}): OverkillResolution {
  const startCd = Math.max(0, opts.cooldown);
  const carried = Math.max(0, opts.carriedBank);
  if (hasBlinkTalent(opts.talents, 'overkill') && startCd === 0) {
    const gained = opts.instakillDamages.reduce((sum, hit) => sum + overkillExcess(hit.damage, hit.maxHp), 0);
    if (gained > 0) {
      const cooldown = applyBlinkCooldownReduction(BLINK_OVERKILL_COOLDOWN, opts.talents);
      return {
        bank: gained,
        cooldown,
        log: `🥷 Overkill — +${gained} damage banked for the next Blink (${cooldown}t).`,
      };
    }
  }
  return { bank: carried, cooldown: startCd > 0 ? startCd - 1 : 0, log: null };
}

export function overkillStatusPhrase(stats: {
  blinkOverkillBank?: number;
  blinkOverkillCooldown?: number;
}): string | null {
  const bank = stats.blinkOverkillBank ?? 0;
  const cd = stats.blinkOverkillCooldown ?? 0;
  if (bank <= 0 && cd <= 0) return null;
  if (bank > 0 && cd > 0) return `Overkill +${bank} banked · ${cd}t`;
  if (bank > 0) return `Overkill +${bank} banked`;
  return `Overkill ${cd}t`;
}

export function blinkStrikeHudTitle(opts: {
  luck: number;
  talents?: readonly BlinkTalentId[];
  overkillBank?: number;
  overkillCooldown?: number;
}): string {
  const status = overkillStatusPhrase({
    blinkOverkillBank: opts.overkillBank,
    blinkOverkillCooldown: opts.overkillCooldown,
  });
  const parts = [`Blink Strike — ${blinkStrikeDamagePhrase(opts.luck, opts.talents)}.`];
  if (status) parts.push(status + '.');
  if (hasBlinkTalent(opts.talents, 'blink-truestrike')) {
    parts.push('Truestrike: always hits, ignores God-blessed. 🔮 targets through walls.');
  }
  parts.push('Kills reduce cooldown by 1 (2 if unseen). Instakills: -2.');
  return parts.join(' ');
}

/** Per-turn tick for Blink Strike and Overkill. A cooldown of 0 stays 0. */
export function tickBlinkCooldowns(stats: Player['stats']): Player['stats'] {
  const blink = stats.blinkStrikeCooldown ?? 0;
  const overkill = stats.blinkOverkillCooldown ?? 0;
  if (blink <= 0 && overkill <= 0) return stats;
  return {
    ...stats,
    ...(blink > 0 ? { blinkStrikeCooldown: blink - 1 } : {}),
    ...(overkill > 0 ? { blinkOverkillCooldown: overkill - 1 } : {}),
  };
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
  const okCd = stats.blinkOverkillCooldown ?? 0;
  const nextOk = okCd > 0 ? Math.max(0, okCd - BLINK_TALENT_POST_BLINK_CD_PER_HIT) : 0;
  const next = {
    ...stats,
    blinkStrikeCooldown: nextCd,
    blinkMeleeCdCharges: charges - 1,
    ...(okCd > 0 ? { blinkOverkillCooldown: nextOk } : {}),
  };
  const parts: string[] = [];
  if (nextCd < cd) parts.push(`Blink cooldown ${nextCd}t`);
  if (okCd > 0 && nextOk < okCd) parts.push(`Overkill ${nextOk}t`);
  const log = parts.length ? `🥷 Flowing Strike — ${parts.join(', ')}.` : null;
  return { stats: next, log };
}

export function tierLabelForOffer(offerIndex: number): string {
  if (offerIndex <= 0) return 'T1';
  if (offerIndex === 1) return 'T2';
  if (offerIndex === 2) return 'T3';
  if (offerIndex === 3) return 'T4';
  return 'T5+';
}

export function blinkTalentOffersEarned(credits: number): number {
  if (credits <= 0) return 0;
  return Math.min(BLINK_TALENTS.length, Math.floor(credits / BLINK_TALENT_CREDITS_PER_TIER));
}

/** Choices for the next unpicked offer. T1–T4 are tier-locked; later offers are any leftover talent. */
export function blinkTalentChoices(picked: readonly string[] | undefined): BlinkTalentDef[] {
  const owned = ownedList(picked);
  if (owned.length >= BLINK_TALENTS.length) return [];
  if (owned.length < BLINK_TALENT_LOCKED_TIERS) {
    const tier = (owned.length + 1) as 1 | 2 | 3 | 4;
    const locked = BLINK_TALENTS.filter(t => t.tier === tier && !owned.includes(t.id));
    if (locked.length > 0) return locked;
  }
  return BLINK_TALENTS.filter(t => !owned.includes(t.id));
}

export function pendingBlinkTalentOffer(
  credits: number,
  picked: readonly string[] | undefined,
): { tierLabel: string; choices: BlinkTalentDef[] } | null {
  const owned = ownedList(picked);
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
  picked: readonly string[] | undefined,
): BlinkTalentProgress {
  const needed = BLINK_TALENT_CREDITS_PER_TIER;
  const safeCredits = Math.max(0, credits);
  const owned = ownedList(picked);
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

export function blinkStrikeRulesBlurb(luck?: number, talents?: readonly BlinkTalentId[]): string {
  const bonus = hasBlinkTalent(talents, 'heavier-blink') ? BLINK_TALENT_DAMAGE_BONUS_PERCENT : 0;
  const min = BLINK_MULTIPLIER_MIN_PERCENT + bonus;
  const max = BLINK_MULTIPLIER_MAX_PERCENT + bonus;
  const live = luck == null ? '' : `Currently ${blinkStrikeDamagePhrase(luck, talents)}. `;
  return `${live}Damage is ${min}% at 0 CRIT and ${max}% at ${CRIT_STAT_SOFT_CAP} CRIT, rising in a straight line (about +${BLINK_MULTIPLIER_PER_CRIT}% per CRIT). Critical hits use normal crit chance and double that damage.`;
}
