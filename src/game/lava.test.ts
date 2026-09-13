import { describe, it, expect } from 'vitest';
import type { EmojiItem, GameState, MapGrid, Player, Tile } from './types';
import { PLAYER_PASSABLE_TILES, ENEMY_PASSABLE_TILES } from './tiles';
import {
  lavaFlatDamage, lavaDamageForFloor, shouldConfirmLavaStep, spreadVolcanoLava, tickVolcanoAndLava,
  volcanoSpewInterval, volcanoMaxLava, countLavaTiles, coolLavaWaterContacts,
  canConvertToLava, VOLCANO_MAX_RADIUS, LAVA_EMOJI, VOLCANO_EMOJI, WATER_EMOJI, OBSIDIAN_EMOJI,
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
      if (ch === '~') return tile('water', WATER_EMOJI);
      if (ch === 'O') return tile('obsidian', OBSIDIAN_EMOJI);
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
  it('is 25% max HP plus 10 on D:1, then +5 flat per floor descended', () => {
    expect(lavaFlatDamage(1)).toBe(10);
    expect(lavaFlatDamage(2)).toBe(15);
    expect(lavaFlatDamage(6)).toBe(35);
    expect(lavaDamageForFloor(1, 20)).toBe(15);
    expect(lavaDamageForFloor(3, 20)).toBe(25);
  });

  it('asks once when stepping from safe ground onto lava, not while already in it', () => {
    expect(shouldConfirmLavaStep('floor', 'lava')).toBe(true);
    expect(shouldConfirmLavaStep('obsidian', 'lava')).toBe(true);
    expect(shouldConfirmLavaStep('lava', 'lava')).toBe(false);
    expect(shouldConfirmLavaStep('floor', 'floor')).toBe(false);
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

  it('deals 25% max HP plus flat when the player stands in lava', () => {
    const map = grid([
      '#####',
      '#.L.#',
      '#####',
    ]);
    const next = tickVolcanoAndLava(baseState(map, {
      player: playerAt(2, 1, 20, 20),
      currentFloor: 1,
    }));
    expect(next.player.stats.hp).toBe(5);
    expect(next.gameOver).toBe(false);
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

  it('does not spew lava every turn — waits 5–10 turns between eruptions', () => {
    const map = grid([
      '#####',
      '#.V.#',
      '#...#',
      '#####',
    ]);
    const floorCount = (m: MapGrid) => m.flat().filter(t => t.type === 'floor').length;

    const scheduled = tickVolcanoAndLava(baseState(map, {
      player: playerAt(1, 1),
      turn: 3,
    }));
    expect(floorCount(scheduled.map)).toBe(floorCount(map));
    expect(scheduled.volcanoNextSpewTurn).toBeGreaterThanOrEqual(8);
    expect(scheduled.volcanoNextSpewTurn).toBeLessThanOrEqual(13);
    expect(scheduled.logs.some(l => l.text.includes('spews'))).toBe(false);

    const quiet = tickVolcanoAndLava(baseState(map, {
      player: playerAt(1, 1),
      turn: 4,
      volcanoNextSpewTurn: 10,
    }));
    expect(floorCount(quiet.map)).toBe(floorCount(map));
    expect(quiet.volcanoNextSpewTurn).toBe(10);

    const erupted = tickVolcanoAndLava(baseState(map, {
      player: playerAt(1, 1),
      turn: 10,
      volcanoNextSpewTurn: 10,
    }));
    expect(floorCount(erupted.map)).toBeLessThan(floorCount(map));
    expect(erupted.volcanoNextSpewTurn).toBeGreaterThanOrEqual(15);
    expect(erupted.volcanoNextSpewTurn).toBeLessThanOrEqual(20);
    expect(erupted.logs.some(l => l.text.includes('spews'))).toBe(true);
  });
});

describe('volcanoSpewInterval', () => {
  it('is always 5–10 inclusive', () => {
    for (let i = 0; i < 40; i++) {
      const n = volcanoSpewInterval();
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
    }
  });
});

describe('volcano lava cap', () => {
  it('volcanoMaxLava is 16 + floor (at least 17)', () => {
    expect(volcanoMaxLava(1)).toBe(17);
    expect(volcanoMaxLava(5)).toBe(21);
  });

  it('countLavaTiles ignores the volcano itself', () => {
    const map = grid([
      '#####',
      '#LVL#',
      '#####',
    ]);
    expect(countLavaTiles(map)).toBe(2);
  });

  it('does not convert water or obsidian into lava', () => {
    expect(canConvertToLava('water')).toBe(false);
    expect(canConvertToLava('obsidian')).toBe(false);
    const map = grid([
      '#####',
      '#~VO#',
      '#####',
    ]);
    const { converted, map: next } = spreadVolcanoLava(map, { x: 2, y: 1 }, 8, 1);
    expect(converted).toHaveLength(0);
    expect(next[1][1].type).toBe('water');
    expect(next[1][3].type).toBe('obsidian');
  });

  it('refuses candidates beyond VOLCANO_MAX_RADIUS', () => {
    const size = VOLCANO_MAX_RADIUS + 6;
    const spec = Array.from({ length: size }, () => '#'.repeat(size));
    const map = grid(spec);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) map[y][x] = tile('floor', '⬜');
    }
    const vx = 2, vy = 2;
    map[vy][vx] = tile('volcano', VOLCANO_EMOJI);
    const { converted } = spreadVolcanoLava(map, { x: vx, y: vy }, 40, 1);
    expect(converted.length).toBeGreaterThan(0);
    for (const p of converted) {
      const d = Math.max(Math.abs(p.x - vx), Math.abs(p.y - vy));
      expect(d).toBeLessThanOrEqual(VOLCANO_MAX_RADIUS);
    }
  });

  it('will not grow past volcanoMaxLava', () => {
    const map = grid([
      '###########',
      '#.........#',
      '#....V....#',
      '#.........#',
      '###########',
    ]);
    const volcano = { x: 5, y: 2 };
    // Fill almost to the cap with existing lava (still in-radius).
    let placed = 0;
    const cap = volcanoMaxLava(1);
    for (let y = 1; y <= 3 && placed < cap; y++) {
      for (let x = 1; x <= 9 && placed < cap; x++) {
        if (x === volcano.x && y === volcano.y) continue;
        map[y][x] = tile('lava', LAVA_EMOJI);
        placed++;
      }
    }
    expect(countLavaTiles(map)).toBe(cap);
    const { converted } = spreadVolcanoLava(map, volcano, 8, 1);
    expect(converted).toHaveLength(0);
  });
});

describe('coolLavaWaterContacts', () => {
  it('turns orthogonally adjacent water into obsidian', () => {
    const map = grid([
      '#####',
      '#~L.#',
      '#####',
    ]);
    const { map: next, cooled } = coolLavaWaterContacts(map);
    expect(cooled).toEqual([{ x: 1, y: 1 }]);
    expect(next[1][1].type).toBe('obsidian');
    expect(next[1][1].emoji).toBe(OBSIDIAN_EMOJI);
    expect(next[1][2].type).toBe('lava');
  });

  it('does not cool diagonally adjacent water', () => {
    const map = grid([
      '#####',
      '#~..#',
      '#.L.#',
      '#####',
    ]);
    const { cooled, map: next } = coolLavaWaterContacts(map);
    expect(cooled).toHaveLength(0);
    expect(next[1][1].type).toBe('water');
  });

  it('obsidian is walkable like floor', () => {
    expect(PLAYER_PASSABLE_TILES.has('obsidian')).toBe(true);
    expect(ENEMY_PASSABLE_TILES.has('obsidian')).toBe(true);
  });

  it('tick cools lava×water even when the volcano does not spew', () => {
    const map = grid([
      '#####',
      '#~L.#',
      '#.V.#',
      '#####',
    ]);
    const next = tickVolcanoAndLava(baseState(map, {
      player: playerAt(1, 2),
      turn: 4,
      volcanoNextSpewTurn: 10,
    }));
    expect(next.map[1][1].type).toBe('obsidian');
    expect(next.map[1][1].emoji).toBe(OBSIDIAN_EMOJI);
    expect(next.volcanoNextSpewTurn).toBe(10);
  });
});
