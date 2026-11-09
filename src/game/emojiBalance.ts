import type { Player } from './types';
import { applyEquipmentAndPassives, playerBagPassives } from './inventory';
import { applyLevelUp } from './playerTurn';
import { xpThresholdForLevel } from './progression';

/** Fire bag stacks, and Star sight stacks. */
export const FIRE_STACK_CAP = 5;
export const STAR_STACK_CAP = 5;
export const PILL_STACK_CAP = 5;
export const IGNITE_TURNS = 3;
export const STAR_XP_TURNS = 20;
export const STAR_XP_MULT = 1.5;
export const PILL_REGEN_TURNS = 5;
export const PILL_OVERHEAL = 0.1;

/**
 * Ignite per turn, before the ATK cap:
 *   z × (depth + depth × 10% × ATK)
 * which is `z × depth` flat plus `z × depth × 0.10 × ATK`.
 *
 * The ATK term is capped at a fraction of ATK that rises from 100% at 1 stack
 * to 200% at 5 stacks (25 percentage points per extra stack).
 *
 * z = min(5, fire bag stacks + 1 when Fire Arrows or Incendiary Rounds are paired).
 * The sources share one ignite and add before that cap.
 */
export function igniteAtkCapFraction(stacks: number): number {
  const z = Math.max(1, Math.min(FIRE_STACK_CAP, Math.floor(stacks)));
  return 1 + (z - 1) * 0.25;
}

export function combinedIgniteStacks(fireStacks: number, fireArrows: boolean): number {
  return Math.min(FIRE_STACK_CAP, Math.max(0, Math.floor(fireStacks)) + (fireArrows ? 1 : 0));
}

export function igniteDamagePerTurn(stacks: number, depth: number, attack: number): number {
  const z = Math.max(0, Math.min(FIRE_STACK_CAP, Math.floor(stacks)));
  if (z <= 0) return 0;
  const d = Math.max(1, Math.floor(depth));
  const atk = Math.max(0, attack);
  const flat = z * d;
  const atkTerm = z * d * 0.1 * atk;
  const capped = Math.min(atkTerm, igniteAtkCapFraction(z) * atk);
  return Math.max(1, Math.floor(flat + capped));
}

export function igniteFields(
  player: Player,
  depth: number,
  fireArrows: boolean,
): { burningTurns: number; burnDamage: number } | null {
  const z = combinedIgniteStacks(playerBagPassives(player).fireStacks, fireArrows);
  if (z <= 0) return null;
  const attack = applyEquipmentAndPassives(player).stats.attack;
  return { burningTurns: IGNITE_TURNS, burnDamage: igniteDamagePerTurn(z, depth, attack) };
}

/**
 * Shared shape for Heart, Mushroom, Butterfly, Diamond, and Shield:
 *   floor(z × flat + z × depth × rate × stat)
 * Depth is at least 1. A zero stat leaves the old flat `z`.
 */
export function flatPlusDepthStat(stacks: number, depth: number, stat: number, flat: number, rate: number): number {
  const z = Math.max(0, Math.floor(stacks));
  if (z <= 0) return 0;
  const d = Math.max(1, Math.floor(depth));
  const s = Math.max(0, stat);
  return Math.floor(z * flat + z * d * rate * s);
}

/** +1 HP per stack, plus 1% of ATK × depth × stacks. */
export function heartHeal(stacks: number, depth: number, attack: number): number {
  return flatPlusDepthStat(stacks, depth, attack, 1, 0.01);
}

/** +1 HP per stack, plus 0.1% of max HP × depth × stacks. */
export function mushroomHeal(stacks: number, depth: number, maxHp: number): number {
  return flatPlusDepthStat(stacks, depth, maxHp, 1, 0.001);
}

/** Same curve as Mushroom: +1, plus 0.1% of max HP × depth × stacks. */
export function butterflyHeal(stacks: number, depth: number, maxHp: number): number {
  return flatPlusDepthStat(stacks, depth, maxHp, 1, 0.001);
}

/** +1 damage per stack, plus 1% of ATK × depth × stacks. */
export function diamondThorns(stacks: number, depth: number, attack: number): number {
  return flatPlusDepthStat(stacks, depth, attack, 1, 0.01);
}

/** −1 per stack, plus 0.2% of DEF × depth × stacks. Block chance stays 25%. */
export function shieldReduction(stacks: number, depth: number, defense: number): number {
  return flatPlusDepthStat(stacks, depth, defense, 1, 0.002);
}

/** 5% of max HP at 1 stack, 10% at 5, linear in between. Every 5 turns. */
export function pillRegenFraction(stacks: number): number {
  const z = Math.max(1, Math.min(PILL_STACK_CAP, Math.floor(stacks)));
  return 0.05 + (z - 1) * 0.0125;
}

export function pillRegenAmount(stacks: number, maxHp: number): number {
  if (stacks <= 0 || maxHp <= 0) return 0;
  return Math.max(1, Math.floor(maxHp * pillRegenFraction(stacks)));
}

export function pillOverhealHp(maxHp: number): number {
  const pool = Math.max(0, Math.floor(maxHp));
  return pool + Math.floor(pool * PILL_OVERHEAL);
}

export function starXpGain(base: number, turns: number | undefined): number {
  if (base <= 0) return 0;
  if ((turns ?? 0) <= 0) return base;
  return Math.round(base * STAR_XP_MULT);
}

export function tickStarXpBoost(turns: number | undefined): number | undefined {
  if (!turns || turns <= 0) return undefined;
  const next = turns - 1;
  return next > 0 ? next : undefined;
}

/** +1 level via the normal level-up, and +50% XP for 20 turns. XP is raised to the new level if it lagged. */
export function applyStarConsume(player: Player, log: (text: string) => void): Player {
  const newLevel = player.stats.level + 1;
  const xp = Math.max(player.stats.xp, xpThresholdForLevel(newLevel));
  const primed: Player = {
    ...player,
    stats: { ...player.stats, xp, xpBoostTurns: STAR_XP_TURNS },
  };
  const leveled = applyLevelUp(primed, player.stats.level, newLevel, log);
  log(`🌟 +50% XP for ${STAR_XP_TURNS} turns.`);
  return leveled;
}

/**
 * Detection radius. Each Star stack adds that many tiles.
 * At 5 stacks stealth is ignored and foes path from the whole map.
 */
export function foeDetectionRadius(
  base: number,
  opts: { stealthy: boolean; starStacks: number; restaurant: boolean },
): number {
  const stars = Math.max(0, opts.starStacks);
  if (stars >= STAR_STACK_CAP) return 9999;
  const stealthy = opts.stealthy;
  if (opts.restaurant && !stealthy) return 9999;
  const radius = stealthy ? Math.max(1, Math.ceil(base / 2)) : base;
  return radius + stars;
}
