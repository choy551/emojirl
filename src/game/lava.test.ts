import { describe, it, expect } from 'vitest';
import type { EmojiItem, GameState, MapGrid, Player, Tile } from './types';
import {
  lavaFlatDamage, lavaDamageForFloor, spreadVolcanoLava, tickVolcanoAndLava,
  LAVA_EMOJI, VOLCANO_EMOJI,
} from './lava';

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: false, visible: false };
}

function grid(spec: string[]): MapGrid {
  return spec.map(row =>
    [...row].map(ch => {
      if (ch === '#') return tile('wall', '⬛');
      if (ch === 'V') return tile('volcano', VOLCANO_EMOJI);
      if (ch === 'L') return tile('lava', LAVA_EMOJI);
      if (ch === '~') return tile('water', '🌊');
      if (ch === 'B') return tile('bush', '🌿');
      return tile('floor', '⬜');
    })
  );
}

function playerAt(x: number, y: number, maxHp = 20, hp = 20): Player {
  return {
    pos: { x, y },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: { hp, maxHp, attack: 1, defense: 0, speed: 1, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0 },
    inventory: [],
    bank: [],
    equipment: {},
  };
}

function baseState(map: MapGrid, overrides: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: 1,
    player: playerAt(1, 1),
    currentFloor: 1,
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
    ...overrides,
  };
}

describe('lava damage', () => {
  it('is 50% max HP plus 10 on D:1, then +5 flat per floor descended', () => {
    expect(lavaFlatDamage(1)).toBe(10);
    expect(lavaFlatDamage(2)).toBe(15);
    expect(lavaFlatDamage(6)).toBe(35);
    expect(lavaDamageForFloor(1, 20)).toBe(20);
    expect(lavaDamageForFloor(3, 20)).toBe(30);
  });
});

describe('spreadVolcanoLava', () => {
  it('converts floor tiles adjacent to the volcano/lava, biased inward', () => {
    const map = grid([
      '#####',
      '#.V.#',
      '#...#',
      '#####',
    ]);
    const { converted, map: next } = spreadVolcanoLava(map, { x: 2, y: 1 }, 8);
    expect(converted.length).toBeGreaterThan(0);
    expect(next[1][2].type).toBe('volcano');
    for (const p of converted) {
      expect(next[p.y][p.x].type).toBe('lava');
      expect(next[p.y][p.x].emoji).toBe(LAVA_EMOJI);
    }
  });

  it('does not convert stairs or the volcano itself', () => {
    const map = grid([
      '#####',
      '#.V.#',
      '#####',
    ]);
    map[1][1] = tile('stairs', '🕳️');
    const { converted } = spreadVolcanoLava(map, { x: 2, y: 1 }, 4);
    expect(converted.some(p => p.x === 1 && p.y === 1)).toBe(false);
    expect(converted.some(p => p.x === 2 && p.y === 1)).toBe(false);
  });
});

describe('tickVolcanoAndLava', () => {
  it('burns ground items sitting on lava', () => {
    const map = grid([
      '#####',
      '#.L.#',
      '#####',
    ]);
    const loot: EmojiItem & { pos: { x: number; y: number } } = {
      id: 'skull-1',
      emoji: '💀',
      name: 'Skull',
      description: 'all crits',
      consumed: false,
      pos: { x: 2, y: 1 },
    };
    const next = tickVolcanoAndLava(baseState(map, { items: [loot], player: playerAt(1, 1) }));
    expect(next.items).toHaveLength(0);
    expect(next.logs.some(l => l.text.includes('burns away'))).toBe(true);
  });

  it('deals extreme damage when the player stands in lava', () => {
    const map = grid([
      '#####',
      '#.L.#',
      '#####',
    ]);
    const next = tickVolcanoAndLava(baseState(map, {
      player: playerAt(2, 1, 20, 20),
      currentFloor: 1,
    }));
    expect(next.player.stats.hp).toBe(0);
    expect(next.gameOver).toBe(true);
    expect(next.killer?.name).toBe('Lava');
  });

  it('does not damage a player standing on floor next to lava', () => {
    const map = grid([
      '#####',
      '#.L.#',
      '#####',
    ]);
    const next = tickVolcanoAndLava(baseState(map, { player: playerAt(1, 1, 20, 20) }));
    expect(next.player.stats.hp).toBe(20);
    expect(next.gameOver).toBe(false);
  });
});
