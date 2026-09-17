import { chebyshev } from './geo';
import type { Position } from './types';
import { isHostileCombatTarget } from './combat';

type ExploreEntity = {
  isRecruited?: boolean;
  tag?: string;
  engaged?: boolean;
  pos: Position;
  bear?: boolean;
  monkey?: boolean;
  isAdventurer?: boolean;
};

export function isRecruitedCompanion(e: { isRecruited?: boolean }): boolean {
  return !!e.isRecruited;
}

/**
 * Enemies that should halt autoexplore (adjacent / in-sight).
 * Same set wizard barrage will shoot: not companions, not friendlies,
 * not Neutral NPCs (adventurers, monkeys, bears, mermen) until they aggro.
 */
export function isAutoexploreThreat(e: {
  isRecruited?: boolean;
  tag?: string;
  engaged?: boolean;
}): boolean {
  return isHostileCombatTarget(e);
}

/** Occupied tiles for item pickup / stairs routing — walk through (swap with) recruited companions. */
export function autoexploreOccupiedKeys(enemies: ExploreEntity[]): Set<string> {
  return new Set(
    enemies.filter(e => !e.isRecruited).map(e => `${e.pos.x},${e.pos.y}`),
  );
}

/**
 * Unrecruited bump-to-talk NPCs (bears, monkeys, adventurers, fairies).
 * Recruited companions and hostiles/engaged foes are not included.
 */
export function isAutoexploreInteractNpc(e: ExploreEntity): boolean {
  if (e.isRecruited || e.engaged || e.tag === 'Hostile') return false;
  if (e.tag === 'Friendly') return true;
  return !!(e.bear || e.monkey || e.isAdventurer);
}

/**
 * Routing obstacles for unseen-tile BFS so we don't bump-open Talk menus.
 * Recruited companions stay walk-through (swap).
 */
export function autoexploreInteractBlockKeys(enemies: ExploreEntity[]): Set<string> {
  return new Set(
    enemies.filter(isAutoexploreInteractNpc).map(e => `${e.pos.x},${e.pos.y}`),
  );
}

/** @deprecated use autoexploreInteractBlockKeys */
export function autoexploreFriendlyBlockKeys(enemies: ExploreEntity[]): Set<string> {
  return autoexploreInteractBlockKeys(enemies);
}

export type StairsFinish = 'no-stairs' | 'adjacent' | 'blocked' | 'step';

/**
 * After unseen tiles are exhausted, classify how to finish toward the stairs.
 * `nextStep` is bfsStepToward(player → stairs), or null if no path.
 * "adjacent" is the only case that should log "stairs are right here".
 */
export function classifyStairsFinish(
  playerPos: Position,
  stairs: Position | null,
  nextStep: Position | null,
): StairsFinish {
  if (!stairs) return 'no-stairs';
  if (chebyshev(playerPos, stairs) <= 1) return 'adjacent';
  if (!nextStep) return 'blocked';
  if (nextStep.x === stairs.x && nextStep.y === stairs.y) return 'adjacent';
  return 'step';
}
