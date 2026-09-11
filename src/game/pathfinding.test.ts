import { describe, it, expect } from 'vitest';
import type { Tile } from './types';
import { hasLOS, hasLOSBetween } from './pathfinding';
import { RANGED_BLOCKING_TILES } from './tiles';

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: false, visible: false };
}

function hall(blocker?: Tile): Tile[][] {
  const map: Tile[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 8 }, () => tile('floor', '⬜')),
  );
  if (blocker) map[2][3] = blocker;
  return map;
}

describe('ranged line of sight', () => {
  it('is clear down an empty hallway', () => {
    const map = hall();
    expect(hasLOSBetween(map, { x: 1, y: 2 }, { x: 6, y: 2 })).toBe(true);
    expect(hasLOS(map, { x: 1, y: 2 }, 1, 0, 5)).toBe(true);
  });

  it('is blocked by a closed door', () => {
    const map = hall(tile('door-closed', '🚪'));
    expect(hasLOSBetween(map, { x: 1, y: 2 }, { x: 6, y: 2 })).toBe(false);
    expect(hasLOS(map, { x: 1, y: 2 }, 1, 0, 5)).toBe(false);
  });

  it('is blocked by an open door', () => {
    const map = hall(tile('door-open', '🔓'));
    expect(hasLOSBetween(map, { x: 1, y: 2 }, { x: 6, y: 2 })).toBe(false);
    expect(hasLOS(map, { x: 1, y: 2 }, 1, 0, 5)).toBe(false);
  });

  it('still allows shooting from the doorway itself', () => {
    const map = hall(tile('door-open', '🔓'));
    expect(hasLOSBetween(map, { x: 3, y: 2 }, { x: 6, y: 2 })).toBe(true);
    expect(hasLOS(map, { x: 3, y: 2 }, 1, 0, 3)).toBe(true);
  });

  it('does not treat bushes as ranged blockers', () => {
    expect(RANGED_BLOCKING_TILES.has('bush')).toBe(false);
    const map = hall(tile('bush', '🌿'));
    expect(hasLOSBetween(map, { x: 1, y: 2 }, { x: 6, y: 2 })).toBe(true);
  });
});
