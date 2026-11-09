/** Wizard autos, and Ranger autos with an empty quiver, spend this much HP. */
export const VOID_RANGED_HP_BASE = 1;
/** Strictly below this fraction of max HP, an HP-priced attack becomes a melee swing. */
export const VOID_RANGED_HP_FLOOR = 0.25;

export type VoidRangedStyle = 'wizard' | 'ranger';

export type VoidRangedSpend =
  | { kind: 'ammo' }
  | { kind: 'hp'; cost: number }
  | { kind: 'melee'; log: string };

/** 1 HP, plus 1 for each D:5/10/15… boss already beaten. Depth alone does not raise it. */
export function voidRangedHpCost(bossesCleared: number): number {
  const beaten = Number.isFinite(bossesCleared) ? Math.max(0, Math.floor(bossesCleared)) : 0;
  return VOID_RANGED_HP_BASE + beaten;
}

export function voidBossesBeaten(source: {
  voidBossesCleared?: number;
  player?: { voidBossesCleared?: number };
}): number {
  return source.voidBossesCleared ?? source.player?.voidBossesCleared ?? 0;
}

function styleLabel(style: VoidRangedStyle): string {
  return style === 'wizard' ? 'Wizard autos' : 'Ranger autos';
}

/** Null when this HP price can be paid and still leave at least 1 HP. */
export function voidRangedHpRefusal(hp: number, maxHp: number, cost: number, style: VoidRangedStyle): string | null {
  const max = Math.max(1, maxHp);
  const label = styleLabel(style);
  if (hp / max < VOID_RANGED_HP_FLOOR) {
    return `👤 Below 25% HP — ${label} switch to melee.`;
  }
  if (hp - cost <= 0) {
    return `👤 Paying ${cost} HP would be lethal — ${label} switch to melee.`;
  }
  return null;
}

/**
 * Ranger spends one carried shot before HP. Wizard always prices the attack in HP.
 * A refused payment is a melee swing, and the HP price is never lethal.
 */
export function voidRangedSpend(args: {
  style: VoidRangedStyle;
  hp: number;
  maxHp: number;
  ammo?: number;
  bossesCleared: number;
}): VoidRangedSpend {
  if (args.style === 'ranger' && (args.ammo ?? 0) > 0) return { kind: 'ammo' };
  const cost = voidRangedHpCost(args.bossesCleared);
  const log = voidRangedHpRefusal(args.hp, args.maxHp, cost, args.style);
  if (log) return { kind: 'melee', log };
  return { kind: 'hp', cost };
}

export function voidHpAttackTooltip(bossesCleared: number): string {
  const cost = voidRangedHpCost(bossesCleared);
  return `Wizard autos cost ${cost} HP per attack. Ranger autos use ammo first, then ${cost} HP. Below 25% HP, or if paying would be lethal, both switch to melee.`;
}

export function voidHpAttackPaidLog(style: VoidRangedStyle, cost: number): string {
  return `👤 ${styleLabel(style)} — ${cost} HP.`;
}
