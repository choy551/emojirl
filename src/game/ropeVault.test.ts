import { describe, expect, it } from 'vitest';
import type { GameState, Tile, TileType } from './types';
import { applyRopeVault } from '../hooks/actions/useItemActions';
import { HOLE_EMOJI, ROPE_VAULT_H, ROPE_VAULT_W } from './ropeVault';

function cell(type: TileType, emoji: string): Tile {
  return { type, emoji, seen: true, visible: true };
}

/** 9×8 is the smallest map with exactly one legal 6×5 vault origin. */
function grid(fill: Tile): Tile[][] {
  return Array.from({ length: 8 }, () => Array.from({ length: 9 }, () => ({ ...fill })));
}

function stateOn(map: Tile[][]): GameState {
  return {
    schemaVersion: 5,
    player: {
      pos: { x: 0, y: 0 },
      emoji: '🧝',
      characterClass: '🧝',
      ammo: 0,
      stats: {
        hp: 20, maxHp: 20, attack: 2, defense: 0, speed: 1, evasion: 0, luck: 0,
        level: 1, xp: 0, moodValue: 0, gold: 0,
      },
      inventory: [],
      bank: [],
      equipment: {},
    },
    currentFloor: 4,
    map,
    enemies: [],
    items: [],
    turn: 3,
    logs: [],
    floatingTexts: [],
    gameOver: false,
    victory: false,
    levelUpPending: false,
    cameraOffset: { x: 0, y: 0 },
    placedBombs: [],
    activeProjectile: null,
    killCounts: {},
    difficultyTier: 0,
    highestPressureTierWarned: 0,
  };
}

function stairsInVault(map: Tile[][]): Tile[] {
  const found: Tile[] = [];
  for (let y = 1; y < 1 + ROPE_VAULT_H; y++) {
    for (let x = 1; x < 1 + ROPE_VAULT_W; x++) {
      if (map[y][x].type === 'stairs') found.push(map[y][x]);
    }
  }
  return found;
}

describe('rope vault escape stairs', () => {
  it('places a downstairs inside a vault the rest of the floor cannot reach', () => {
    const map = grid(cell('wall', '⬛'));
    map[7][8] = cell('floor', '⬜');
    map[7][7] = cell('stairs', HOLE_EMOJI);
    const next = applyRopeVault(stateOn(map), null, () => {});
    const holes = stairsInVault(next.map);
    expect(holes).toHaveLength(1);
    expect(holes[0].emoji).toBe(HOLE_EMOJI);
    expect(next.map[7][7].type).toBe('stairs');
    expect(next.logs.some(log => log.text.includes('sealed'))).toBe(true);
    expect(next.player.pos).toEqual({ x: 4, y: 3 });
    expect(next.map[next.player.pos.y][next.player.pos.x].type).not.toBe('stairs');
  });

  it('leaves a connected vault without an extra downstairs', () => {
    const map = grid(cell('floor', '⬜'));
    for (let y = 1; y < 1 + ROPE_VAULT_H; y++) {
      for (let x = 1; x < 1 + ROPE_VAULT_W; x++) map[y][x] = cell('wall', '⬛');
    }
    const next = applyRopeVault(stateOn(map), null, () => {});
    expect(stairsInVault(next.map)).toHaveLength(0);
    expect(next.map.flat().some(tile => tile.type === 'stairs')).toBe(false);
  });
});
