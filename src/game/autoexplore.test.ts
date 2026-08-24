import { describe, it, expect } from 'vitest';
import {
  isAutoexploreThreat,
  isRecruitedCompanion,
  autoexploreOccupiedKeys,
  autoexploreFriendlyBlockKeys,
  classifyStairsFinish,
} from './autoexplore';
import { bfsStepToward } from './pathfinding';
import { PLAYER_PASSABLE_TILES } from './tiles';
import type { GameState } from './types';

const companion = { pos: { x: 5, y: 5 }, isRecruited: true, tag: 'Friendly' as const };
const staleCompanion = { pos: { x: 6, y: 5 }, isRecruited: true, tag: 'Hostile' as const };
const fairy = { pos: { x: 4, y: 5 }, isRecruited: false, tag: 'Friendly' as const };
const adventurer = { pos: { x: 3, y: 5 }, isRecruited: false, tag: 'Neutral' as const };
const goblin = { pos: { x: 7, y: 5 }, tag: 'Hostile' as const };

describe('isAutoexploreThreat', () => {
  it('never treats a recruited companion as a threat', () => {
    expect(isRecruitedCompanion(companion)).toBe(true);
    expect(isAutoexploreThreat(companion)).toBe(false);
    expect(isAutoexploreThreat(staleCompanion)).toBe(false);
  });

  it('does not treat unrecruited friendlies as threats', () => {
    expect(isAutoexploreThreat(fairy)).toBe(false);
  });

  it('still treats hostiles and unrecruited neutrals as threats', () => {
    expect(isAutoexploreThreat(goblin)).toBe(true);
    expect(isAutoexploreThreat(adventurer)).toBe(true);
  });
});

describe('autoexplore occupancy', () => {
  const enemies = [companion, staleCompanion, fairy, adventurer, goblin];

  it('lets routing walk through recruited companions (swap) but not other bodies', () => {
    const occupied = autoexploreOccupiedKeys(enemies);
    expect(occupied.has('5,5')).toBe(false);
    expect(occupied.has('6,5')).toBe(false);
    expect(occupied.has('4,5')).toBe(true);
    expect(occupied.has('3,5')).toBe(true);
    expect(occupied.has('7,5')).toBe(true);
  });

  it('keeps unrecruited friendlies as explore blockers so we do not bump-interact them', () => {
    const blocks = autoexploreFriendlyBlockKeys(enemies);
    expect(blocks.has('4,5')).toBe(true);
    expect(blocks.has('5,5')).toBe(false);
    expect(blocks.has('6,5')).toBe(false);
    expect(blocks.has('7,5')).toBe(false);
  });
});

describe('classifyStairsFinish', () => {
  const stairs = { x: 10, y: 10 };

  it('reports no-stairs when the floor has none', () => {
    expect(classifyStairsFinish({ x: 1, y: 1 }, null, null)).toBe('no-stairs');
  });

  it('reports adjacent when standing next to the stairs (including diagonal)', () => {
    expect(classifyStairsFinish({ x: 10, y: 11 }, stairs, null)).toBe('adjacent');
    expect(classifyStairsFinish({ x: 11, y: 11 }, stairs, { x: 10, y: 10 })).toBe('adjacent');
  });

  it('does not claim stairs are here when the path is blocked far away', () => {
    expect(classifyStairsFinish({ x: 0, y: 0 }, stairs, null)).toBe('blocked');
  });

  it('steps toward stairs when a non-stairs next tile exists', () => {
    expect(classifyStairsFinish({ x: 0, y: 0 }, stairs, { x: 1, y: 0 })).toBe('step');
  });

  it('treats a first step onto the stairs tile as adjacent', () => {
    expect(classifyStairsFinish({ x: 8, y: 10 }, stairs, { x: 10, y: 10 })).toBe('adjacent');
  });
});

describe('companion hallway routing', () => {
  function floorTile() {
    return { type: 'floor' as const, emoji: '⬜', seen: true, visible: true };
  }
  function wallTile() {
    return { type: 'wall' as const, emoji: '⬛', seen: true, visible: true };
  }
  function stairsTile() {
    return { type: 'stairs' as const, emoji: '🕳️', seen: true, visible: true };
  }

  it('paths to stairs through a recruited companion blocking a 1-wide hallway', () => {
    // #####
    // #.@.#  @ = player (1,1), companion (2,1), stairs (3,1)
    // #####
    const map: GameState['map'] = [
      [wallTile(), wallTile(), wallTile(), wallTile(), wallTile()],
      [wallTile(), floorTile(), floorTile(), stairsTile(), wallTile()],
      [wallTile(), wallTile(), wallTile(), wallTile(), wallTile()],
    ];
    const player = { x: 1, y: 1 };
    const stairs = { x: 3, y: 1 };
    const enemies = [{ pos: { x: 2, y: 1 }, isRecruited: true, tag: 'Friendly' as const }];
    const occupied = new Set([...autoexploreOccupiedKeys(enemies)]);
    const passable = new Set([...PLAYER_PASSABLE_TILES, 'stairs']);
    const next = bfsStepToward(map, player, stairs, occupied, passable);
    expect(next).toEqual({ x: 2, y: 1 });
    expect(classifyStairsFinish(player, stairs, next)).toBe('step');
  });

  it('old occupancy (companion blocked) could not reach stairs and falsely looked adjacent', () => {
    const map: GameState['map'] = [
      [wallTile(), wallTile(), wallTile(), wallTile(), wallTile()],
      [wallTile(), floorTile(), floorTile(), stairsTile(), wallTile()],
      [wallTile(), wallTile(), wallTile(), wallTile(), wallTile()],
    ];
    const player = { x: 1, y: 1 };
    const stairs = { x: 3, y: 1 };
    const oldOccupied = new Set(['2,1']);
    const passable = new Set([...PLAYER_PASSABLE_TILES, 'stairs']);
    const next = bfsStepToward(map, player, stairs, oldOccupied, passable);
    expect(next).toBeNull();
    expect(classifyStairsFinish(player, stairs, next)).toBe('blocked');
    expect(classifyStairsFinish(player, stairs, next)).not.toBe('adjacent');
  });
});
