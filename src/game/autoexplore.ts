import { chebyshev } from './geo';
import type { Position } from './types';
import { isHostileCombatTarget } from './combat';

type ExploreEntity = {
  isRecruited?: boolean;
  tag?: string;
  engaged?: boolean;
  pos: Position;
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
 * Routing obstacles for unseen-tile BFS. Fairies and other unrecruited friendlies
 * stay blocked so we don't bump-interact them; recruited companions do not —
 * bumping swaps, which is how hallways stay passable.
 */
export function autoexploreFriendlyBlockKeys(enemies: ExploreEntity[]): Set<string> {
  return new Set(
    enemies
      .filter(e => e.tag === 'Friendly' && !e.isRecruited)
      .map(e => `${e.pos.x},${e.pos.y}`),
  );
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
