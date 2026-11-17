/**
 * Stat caps and equipment percents.
 *
 * Gear attack is +2% damage per point, applied to the finished hit.
 * Gear defense is +1% damage reduction per point, capped at 50%.
 * Gear luck is +1% crit damage per point and does not raise crit chance.
 * Gear evasion is dodge. It does not grant magic find.
 * Gear speed stays speed. Speed above 8 adds accuracy, not evasion.
 *
 * Overflow does not feed another cap:
 * EVA above 50 adds crit damage. DEF above 50 adds max HP.
 * LCK above 50 adds magic find. CRIT above 75 adds crit damage.
 */

export const SPD_SOFT_CAP = 8;
export const EVA_SOFT_CAP = 50;
export const CRIT_SOFT_CAP = 75;
export const LCK_SOFT_CAP = 50;
export const DEF_SOFT_CAP = 50;

export const GEAR_ATK_PERCENT = 2;
export const GEAR_DEF_PERCENT = 1;
export const GEAR_DEF_CAP = 50;

/** EVA above the dodge cap required for +1% crit damage. */
export const EVA_TO_CRIT_DAMAGE = 20;
/** DEF above the cap required for +1 max HP. */
export const DEF_TO_HP = 20;
/** LCK above the cap required for +1% magic find. */
export const LCK_TO_MAGIC_FIND = 30;
/** CRIT above the cap required for +1% crit damage. */
export const CRIT_TO_CRIT_DAMAGE = 10;
/** SPD above the cap required for +1 accuracy. */
export const SPD_TO_ACC = 5;

export const ACC_BASE = 90;
export const HIT_CHANCE_MIN = 5;
export const HIT_CHANCE_MAX = 99;

/** Dodge roll ceiling for every class except the Ninja (75%) and the Fencer (Poise cap). */
export const DODGE_CAP = EVA_SOFT_CAP;

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
  critDamageFromEva: number;
  critDamageFromCrit: number;
  magicFindFromLuck: number;
  accFromSpeed: number;
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
  /** Kept at 0. Luck overflow is magic find, not gold. */
  goldBonusPct: number;
  /** Extra percent added to a critical hit's damage. */
  critDamagePct: number;
  /** Extra drop chance, in percent, from luck above the cap. */
  magicFindPct: number;
  /** Accuracy before enemy evasion. 90 + mood is added by combat. */
  accuracyFromSpeed: number;
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

export function gearAttackPercent(attackPoints: number): number {
  return Math.max(0, attackPoints) * GEAR_ATK_PERCENT;
}

/** Finished hit. The attack stat itself is not rescaled before other multipliers. */
export function applyGearAttack(damage: number, attackPoints: number): number {
  if (damage <= 0) return damage;
  const pct = gearAttackPercent(attackPoints);
  if (pct <= 0) return damage;
  return Math.max(1, Math.round(damage * (100 + pct) / 100));
}

export function gearDamageReduction(defensePoints: number): number {
  return Math.min(GEAR_DEF_CAP, Math.max(0, defensePoints) * GEAR_DEF_PERCENT);
}

export function applyGearReduction(damage: number, defensePoints: number): number {
  if (damage <= 0) return damage;
  const dr = gearDamageReduction(defensePoints);
  if (dr <= 0) return damage;
  return Math.max(1, Math.round(damage * (100 - dr) / 100));
}

export function resolveSoftCap(input: SoftCapInput): SoftCapResult {
  const rawSpd = input.speed;
  const rawEva = input.evasion;
  const rawDef = input.defense;
  const rawLck = input.luck;
  const rawAtk = input.attack;
  const rawMax = input.maxHp;

  const speed = rawSpd;
  const evasion = rawEva;
  const accFromSpeed = Math.floor(wholeExcess(rawSpd, SPD_SOFT_CAP) / SPD_TO_ACC);
  const critDamageFromEva = Math.floor(wholeExcess(rawEva, EVA_SOFT_CAP) / EVA_TO_CRIT_DAMAGE);

  const rawCrit = critFromLuck(rawLck);
  const crit = Math.min(rawCrit, CRIT_SOFT_CAP);
  const critDamageFromCrit = Math.floor(wholeExcess(rawCrit, CRIT_SOFT_CAP) / CRIT_TO_CRIT_DAMAGE);
  const attack = rawAtk;

  const magicFindPct = Math.floor(wholeExcess(rawLck, LCK_SOFT_CAP) / LCK_TO_MAGIC_FIND);
  const luck = Math.min(rawLck, LCK_SOFT_CAP);

  const defExcess = wholeExcess(rawDef, DEF_SOFT_CAP);
  const maxHpFromDef = Math.floor(defExcess / DEF_TO_HP);
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
    goldBonusPct: 0,
    critDamagePct: critDamageFromEva + critDamageFromCrit,
    magicFindPct,
    accuracyFromSpeed: accFromSpeed,
    bonuses: {
      atkFromCrit: 0,
      spdFromEva: 0,
      evaFromSpd: 0,
      maxHpFromDef,
      critDamageFromEva,
      critDamageFromCrit,
      magicFindFromLuck: magicFindPct,
      accFromSpeed,
    },
    raw: { attack: rawAtk, defense: rawDef, speed: rawSpd, evasion: rawEva, luck: rawLck, maxHp: rawMax },
  };
}

/** Gold is not scaled by luck. Non-gains stay unchanged. */
export function goldWithLuck(amount: number, _rawLuck: number): number {
  return amount;
}

export function accuracyScore(moodHit: number, speed: number): number {
  return ACC_BASE + moodHit + Math.floor(wholeExcess(speed, SPD_SOFT_CAP) / SPD_TO_ACC);
}

export function hitChance(accuracy: number, mobEvasion: number): number {
  return Math.max(HIT_CHANCE_MIN, Math.min(HIT_CHANCE_MAX, accuracy - Math.max(0, mobEvasion)));
}

/** Crit multiplier. 2 is a normal crit; extra percent is gear luck plus overflow. */
export function critDamageMultiplier(extraPercent: number): number {
  return 2 + Math.max(0, extraPercent) / 100;
}

export function softCapBonusLines(result: SoftCapResult): string[] {
  const lines: string[] = [];
  const b = result.bonuses;
  if (b.accFromSpeed > 0) lines.push(`+${b.accFromSpeed} ACC from SPD above ${SPD_SOFT_CAP}`);
  if (b.critDamageFromEva > 0) lines.push(`+${b.critDamageFromEva}% crit damage from EVA above ${EVA_SOFT_CAP}`);
  if (b.maxHpFromDef > 0) lines.push(`+${b.maxHpFromDef} max HP from DEF above ${DEF_SOFT_CAP}`);
  if (b.magicFindFromLuck > 0) lines.push(`+${b.magicFindFromLuck}% magic find from LCK above ${LCK_SOFT_CAP}`);
  if (b.critDamageFromCrit > 0) lines.push(`+${b.critDamageFromCrit}% crit damage from CRIT above ${CRIT_SOFT_CAP}`);
  return lines;
}

export function softCapTitles(result: SoftCapResult): Record<'ATK' | 'DEF' | 'SPD' | 'EVA' | 'LCK' | 'CRIT' | 'HP' | 'ACC', string> {
  const b = result.bonuses;
  return {
    ATK: 'Gear ATK is +2% damage on the finished hit. It is not added to this number.',
    DEF: result.raw.defense > DEF_SOFT_CAP
      ? `DEF mitigates at ${result.defense} (raw ${result.raw.defense}). +${b.maxHpFromDef} max HP`
      : 'Gear DEF is damage reduction, 1% per point, capped at 50%. It is not added here.',
    SPD: b.accFromSpeed > 0
      ? `SPD ${result.speed}. +${b.accFromSpeed} ACC from speed above ${SPD_SOFT_CAP}`
      : '',
    EVA: b.critDamageFromEva > 0
      ? `EVA ${result.evasion}. Dodge caps at ${EVA_SOFT_CAP}% (class caps can be higher). +${b.critDamageFromEva}% crit damage`
      : '',
    LCK: result.raw.luck > LCK_SOFT_CAP
      ? `LCK shown as ${result.luck} (raw ${result.raw.luck}). +${result.magicFindPct}% magic find. Crit uses raw LCK until ${CRIT_SOFT_CAP}`
      : 'Gear LCK is crit damage, not crit chance.',
    CRIT: result.rawCrit > CRIT_SOFT_CAP
      ? `CRIT capped at ${result.crit}% (raw ${result.rawCrit}). +${b.critDamageFromCrit}% crit damage`
      : '',
    HP: b.maxHpFromDef > 0
      ? `Max HP ${result.maxHp} = ${result.raw.maxHp} + ${b.maxHpFromDef} from DEF above ${DEF_SOFT_CAP}`
      : '',
    ACC: b.accFromSpeed > 0 ? `+${b.accFromSpeed} from SPD above ${SPD_SOFT_CAP}` : '',
  };
}

export function softCapRulesBlurb(): string {
  return `Gear is a percent, not a flat stat. Each gear ATK point is +${GEAR_ATK_PERCENT}% damage on the finished hit, after every other multiplier, and it does not raise the ATK stat. Each gear DEF point is ${GEAR_DEF_PERCENT}% damage reduction, capped at ${GEAR_DEF_CAP}%. Each gear LCK point is +1% crit damage and does not raise crit chance. Gear EVA is dodge. Speed stays speed. SPD above ${SPD_SOFT_CAP} adds +1 accuracy per ${SPD_TO_ACC} and does not add EVA. EVA above ${EVA_SOFT_CAP} adds +1% crit damage per ${EVA_TO_CRIT_DAMAGE}; dodge itself stops at ${EVA_SOFT_CAP}% except a Ninja (75%) or a Fencer (Poise). DEF above ${DEF_SOFT_CAP} mitigates at ${DEF_SOFT_CAP} and adds +1 max HP per ${DEF_TO_HP}. LCK above ${LCK_SOFT_CAP} is shown as ${LCK_SOFT_CAP} and adds +1% magic find per ${LCK_TO_MAGIC_FIND}. CRIT (5 + raw LCK) above ${CRIT_SOFT_CAP} adds +1% crit damage per ${CRIT_TO_CRIT_DAMAGE}. Same-stat bag passives count the largest at 100%, the next at 75%, and the rest at 50%.`;
}
