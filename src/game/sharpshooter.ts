import type { Enemy, EmojiItem, Player, Position } from './types';
import { HITMAN, ROYAL_GUARD } from './prestigeConstants';

function isFoe(e: Enemy): boolean {
  if (e.hp <= 0 || e.isSpectator || e.tag === 'Friendly') return false;
  if (e.tag === 'Neutral' && !e.engaged) return false;
  return true;
}

/** One Still stack. Single-gun damage and Execute's heavy hit both step by this. */
export const STILL_STEP = 0.25;
export const STILL_BASE = 1.25;
export const STILL_MAX_MULT = 2;
export const STILL_MAX_STACKS = 3;
export const STILL_LIQUID_STACKS = 1;
export const PISTOL_RANGE = 5;
export const DUAL_PISTOL_RANGE = 3;
export const LONG_GUN_RANGE = 5;
export const LONG_GUN_RANGE_CAP = 7;
export const COWBOY_DUAL_RANGE = 4;

export function isLongGun(item?: { weaponKind?: string; gunTier?: string } | null): boolean {
  return item?.weaponKind === 'gun' && item.gunTier === 'musket';
}

export function onStillLiquid(tile?: string): boolean {
  return tile === 'lava' || tile === 'water';
}

/** Hitman only. Lava and water cap Still at 1 stack (150%). */
export function stillStackCap(characterClass: string, tile?: string): number {
  if (characterClass !== HITMAN) return 0;
  return onStillLiquid(tile) ? STILL_LIQUID_STACKS : STILL_MAX_STACKS;
}

export function clampStill(stacks: number, cap: number): number {
  return Math.max(0, Math.min(cap, Math.floor(stacks) || 0));
}

/** Moving clears Still. A stationary turn, including a shot, adds one stack up to the cap. */
export function nextStill(stacks: number, moved: boolean, characterClass: string, tile?: string): number {
  if (characterClass !== HITMAN) return 0;
  if (moved) return 0;
  return clampStill((Math.floor(stacks) || 0) + 1, stillStackCap(characterClass, tile));
}

/** Single-gun Hitman damage. Other classes, including the Royal Guard, stay at 100%. */
export function stillDamageMult(stacks: number, characterClass: string, tile?: string): number {
  if (characterClass !== HITMAN) return 1;
  const n = clampStill(stacks, stillStackCap(characterClass, tile));
  return Math.min(STILL_MAX_MULT, STILL_BASE + STILL_STEP * n);
}

/** Long-gun range is an item property: 5, +1 per Still stack, hard cap 7. */
export function longGunRange(stillStacks: number): number {
  const bonus = Math.max(0, Math.min(2, Math.floor(stillStacks) || 0));
  return Math.min(LONG_GUN_RANGE_CAP, LONG_GUN_RANGE + bonus);
}

export function equippedGuns(player: Pick<Player, 'equipment'>): EmojiItem[] {
  return [player.equipment.mainHand, player.equipment.offHand].filter((item): item is EmojiItem => item?.weaponKind === 'gun');
}

export function weaponRange(player: Pick<Player, 'characterClass' | 'equipment' | 'stats'>): number {
  const guns = equippedGuns(player);
  const stacks = player.stats.stillStacks ?? 0;
  const musket = guns.find(isLongGun);
  if (musket) return longGunRange(player.characterClass === HITMAN || player.characterClass === ROYAL_GUARD ? stacks : 0);
  if (player.characterClass === '🤠' && guns.length === 2) return COWBOY_DUAL_RANGE;
  if (guns.length >= 2) return DUAL_PISTOL_RANGE;
  return PISTOL_RANGE;
}

/** Heavy Execute hit gains +25% ATK per Still stack. The instakill threshold is unchanged. */
export function executeDamageMult(stillStacks: number): number {
  const n = Math.max(0, Math.floor(stillStacks) || 0);
  return 2 + STILL_STEP * n;
}

export function pickOffhandTarget(
  from: Position,
  enemies: Enemy[],
  primaryId: string,
  los: (to: Position) => boolean,
  range = DUAL_PISTOL_RANGE,
): Enemy | null {
  const pool = enemies.filter(e => {
    if (e.id === primaryId || !isFoe(e)) return false;
    const dist = Math.max(Math.abs(e.pos.x - from.x), Math.abs(e.pos.y - from.y));
    return dist > 0 && dist <= range && los(e.pos);
  });
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => {
    const da = Math.max(Math.abs(a.pos.x - from.x), Math.abs(a.pos.y - from.y));
    const db = Math.max(Math.abs(b.pos.x - from.x), Math.abs(b.pos.y - from.y));
    return da - db || a.id.localeCompare(b.id);
  })[0];
}
