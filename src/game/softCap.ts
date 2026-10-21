/**
 * Overflow soft caps.
 *
 * effective = min(raw, cap). Excess converts one way into another stat.
 * Speed overflow is converted into Evasion first; Evasion overflow is then
 * converted into Speed from the original Evasion only. Points added by a
 * conversion are not run through a cap again, so the two directions cannot loop.
 *
 * CRIT is 5 + raw LCK (gear included), independent of the LCK display cap.
 * LCK above 20 still feeds that CRIT value until CRIT itself hits 100.
 */

export const SPD_SOFT_CAP = 8;
export const EVA_SOFT_CAP = 50;
export const CRIT_SOFT_CAP = 100;
export const LCK_SOFT_CAP = 20;
export const DEF_SOFT_CAP = 20;

/** +EVA granted for each point of Speed above the cap. */
export const SPD_TO_EVA = 2;
/** Evasion excess required for +1 Speed. */
export const EVA_TO_SPD = 5;
/** CRIT excess required for +1 Attack. */
export const CRIT_TO_ATK = 5;
/** Luck excess required for +5% gold. */
export const LCK_TO_GOLD = 2;
export const LCK_GOLD_PERCENT = 5;
/** Max HP granted for each point of Defense above the cap. */
export const DEF_TO_HP = 2;

/** Absolute dodge ceiling already used by melee counterattacks. */
export const DODGE_CHANCE_CAP = 95;

export interface SoftCapInput {
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
  luck: number;
  maxHp: number;
}

export interface SoftCapBonuses {
  atkFromCrit: number;
  spdFromEva: number;
  evaFromSpd: number;
  maxHpFromDef: number;
}

export interface SoftCapResult {
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
  /** Displayed LCK: min(raw, cap). Crit still uses raw luck. */
  luck: number;
  maxHp: number;
  /** min(5 + raw luck, CRIT_SOFT_CAP). */
  crit: number;
  rawCrit: number;
  /** Percent added to gold gains. 0 when luck is within the cap. */
  goldBonusPct: number;
  bonuses: SoftCapBonuses;
  raw: SoftCapInput;
}

export function critFromLuck(luck: number): number {
  return 5 + luck;
}

export function effectiveCrit(luck: number): number {
  return Math.min(CRIT_SOFT_CAP, critFromLuck(luck));
}

function wholeExcess(raw: number, cap: number): number {
  return Math.max(0, Math.floor(raw - cap));
}

export function resolveSoftCap(input: SoftCapInput): SoftCapResult {
  const rawSpd = input.speed;
  const rawEva = input.evasion;
  const rawDef = input.defense;
  const rawLck = input.luck;
  const rawAtk = input.attack;
  const rawMax = input.maxHp;

  // Speed → Evasion first, from raw Speed only.
  const spdExcess = wholeExcess(rawSpd, SPD_SOFT_CAP);
  const evaFromSpd = spdExcess * SPD_TO_EVA;

  // Evasion → Speed from raw Evasion only. evaFromSpd is not eligible.
  const evaExcess = wholeExcess(rawEva, EVA_SOFT_CAP);
  const spdFromEva = Math.floor(evaExcess / EVA_TO_SPD);

  const speed = Math.min(rawSpd, SPD_SOFT_CAP) + spdFromEva;
  const evasion = Math.min(rawEva, EVA_SOFT_CAP) + evaFromSpd;

  const rawCrit = critFromLuck(rawLck);
  const critExcess = wholeExcess(rawCrit, CRIT_SOFT_CAP);
  const atkFromCrit = Math.floor(critExcess / CRIT_TO_ATK);
  const crit = Math.min(rawCrit, CRIT_SOFT_CAP);
  const attack = rawAtk + atkFromCrit;

  const lckExcess = wholeExcess(rawLck, LCK_SOFT_CAP);
  const goldBonusPct = Math.floor(lckExcess / LCK_TO_GOLD) * LCK_GOLD_PERCENT;
  const luck = Math.min(rawLck, LCK_SOFT_CAP);

  const defExcess = wholeExcess(rawDef, DEF_SOFT_CAP);
  const maxHpFromDef = defExcess * DEF_TO_HP;
  const defense = Math.min(rawDef, DEF_SOFT_CAP);
  const maxHp = rawMax + maxHpFromDef;

  return {
    attack,
    defense,
    speed,
    evasion,
    luck,
    maxHp,
    crit,
    rawCrit,
    goldBonusPct,
    bonuses: { atkFromCrit, spdFromEva, evaFromSpd, maxHpFromDef },
    raw: { attack: rawAtk, defense: rawDef, speed: rawSpd, evasion: rawEva, luck: rawLck, maxHp: rawMax },
  };
}

/** Gold actually received. Non-gains are unchanged. */
export function goldWithLuck(amount: number, rawLuck: number): number {
  if (amount <= 0) return amount;
  const pct = resolveSoftCap({
    attack: 0, defense: 0, speed: 0, evasion: 0, luck: rawLuck, maxHp: 0,
  }).goldBonusPct;
  if (pct <= 0) return amount;
  return Math.round(amount * (1 + pct / 100));
}

export function softCapBonusLines(result: SoftCapResult): string[] {
  const lines: string[] = [];
  const b = result.bonuses;
  if (b.evaFromSpd > 0) lines.push(`+${b.evaFromSpd} EVA from SPD above ${SPD_SOFT_CAP}`);
  if (b.spdFromEva > 0) lines.push(`+${b.spdFromEva} SPD from EVA above ${EVA_SOFT_CAP}`);
  if (b.atkFromCrit > 0) lines.push(`+${b.atkFromCrit} ATK from CRIT above ${CRIT_SOFT_CAP}`);
  if (b.maxHpFromDef > 0) lines.push(`+${b.maxHpFromDef} max HP from DEF above ${DEF_SOFT_CAP}`);
  if (result.goldBonusPct > 0) lines.push(`+${result.goldBonusPct}% gold from LCK above ${LCK_SOFT_CAP}`);
  return lines;
}

export function softCapTitles(result: SoftCapResult): Record<'ATK' | 'DEF' | 'SPD' | 'EVA' | 'LCK' | 'CRIT' | 'HP', string> {
  const b = result.bonuses;
  const spdBits: string[] = [];
  if (result.raw.speed > SPD_SOFT_CAP) {
    spdBits.push(`capped at ${SPD_SOFT_CAP} (raw ${result.raw.speed}) → +${b.evaFromSpd} EVA`);
  }
  if (b.spdFromEva > 0) spdBits.push(`+${b.spdFromEva} from EVA above ${EVA_SOFT_CAP}`);

  const evaBits: string[] = [];
  if (result.raw.evasion > EVA_SOFT_CAP) {
    evaBits.push(`capped at ${EVA_SOFT_CAP} (raw ${result.raw.evasion}) → +${b.spdFromEva} SPD`);
  }
  if (b.evaFromSpd > 0) evaBits.push(`+${b.evaFromSpd} from SPD above ${SPD_SOFT_CAP}`);

  return {
    ATK: b.atkFromCrit > 0
      ? `ATK ${result.attack} = ${result.raw.attack} + ${b.atkFromCrit} from CRIT above ${CRIT_SOFT_CAP}`
      : '',
    DEF: result.raw.defense > DEF_SOFT_CAP
      ? `DEF capped at ${result.defense} (raw ${result.raw.defense}). +${b.maxHpFromDef} max HP`
      : '',
    SPD: spdBits.length ? `SPD ${result.speed}: ${spdBits.join('; ')}` : '',
    EVA: evaBits.length ? `EVA ${result.evasion}: ${evaBits.join('; ')}` : '',
    LCK: result.raw.luck > LCK_SOFT_CAP
      ? `LCK capped at ${result.luck} (raw ${result.raw.luck}). +${result.goldBonusPct}% gold. Crit still uses raw LCK until CRIT ${CRIT_SOFT_CAP}`
      : '',
    CRIT: result.rawCrit > CRIT_SOFT_CAP
      ? `CRIT capped at ${result.crit}% (raw ${result.rawCrit}). +${b.atkFromCrit} ATK`
      : '',
    HP: b.maxHpFromDef > 0
      ? `Max HP ${result.maxHp} = ${result.raw.maxHp} + ${b.maxHpFromDef} from DEF above ${DEF_SOFT_CAP}`
      : '',
  };
}

export function softCapRulesBlurb(): string {
  return `Overflow soft caps: a stat above its cap is used at the cap, and the excess converts one way. SPD above ${SPD_SOFT_CAP} becomes +${SPD_TO_EVA} EVA per point, and that conversion is evaluated before EVA above ${EVA_SOFT_CAP} becomes +1 SPD per ${EVA_TO_SPD} excess. Converted stats do not convert back, so the two directions cannot loop. CRIT (5 + raw LCK) above ${CRIT_SOFT_CAP} becomes +1 ATK per ${CRIT_TO_ATK} excess and no longer raises crit chance. LCK above ${LCK_SOFT_CAP} is shown as ${LCK_SOFT_CAP} and becomes +${LCK_GOLD_PERCENT}% gold per ${LCK_TO_GOLD} excess; raw LCK still feeds CRIT until the CRIT cap. DEF above ${DEF_SOFT_CAP} becomes +${DEF_TO_HP} max HP per point and stops reducing damage. Combat, enemy attacks, heals, and gold gains use these effective stats. Hover a stat to see the converted bonus.`;
}
