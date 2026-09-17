import { describe, it, expect } from 'vitest';
import type { Enemy, GameState, MapGrid, Player, Tile } from './types';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: true, visible: true };
}

function corridorMap(): MapGrid {
  const map: MapGrid = Array.from({ length: 3 }, (_, y) =>
    Array.from({ length: 7 }, (_, x) =>
      y === 1 && x >= 1 && x <= 5 ? tile('floor', '⬜') : tile('wall', '⬛'),
    ),
  );
  map[1][2] = tile('door-closed', '🚪');
  return map;
}

function playerAt(x: number, y: number): Player {
  return {
    pos: { x, y },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [{
      id: 'soul', emoji: '🍀', name: 'Clover', description: 'luck',
      consumed: false, bagPassive: { description: 'lucky' },
    }],
    bank: [],
    equipment: {},
  };
}

function foe(over: Partial<Enemy> & Pick<Enemy, 'emoji' | 'name'>): Enemy {
  return {
    id: 'e1',
    pos: { x: 1, y: 1 },
    hp: 8,
    maxHp: 8,
    attack: 1,
    defense: 0,
    speed: 4,
    engaged: true,
    huntTurns: 5,
    ...over,
  };
}

function base(enemies: Enemy[]): GameState {
  return {
    schemaVersion: 1,
    player: playerAt(5, 1),
    currentFloor: 1,
    map: corridorMap(),
    enemies,
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

describe('humanoid enemies open doors', () => {
  it('a zombie opens a closed door and steps through', () => {
    const state = base([foe({ emoji: '🧟', name: 'Zombie' })]);
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.map[1][2].type).toBe('door-open');
    expect(next.map[1][2].emoji).toBe('🔓');
    expect(next.enemies[0].pos).toEqual({ x: 2, y: 1 });
    expect(next.logs.some(l => l.text.includes('opens the door'))).toBe(true);
  });

  it('a snake stays blocked and leaves the door closed', () => {
    const state = base([foe({ emoji: '🐍', name: 'Snake' })]);
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.map[1][2].type).toBe('door-closed');
    expect(next.map[1][2].emoji).toBe('🚪');
    expect(next.enemies[0].pos).toEqual({ x: 1, y: 1 });
  });

  it('a recruited adventurer can open doors; a recruited bear cannot', () => {
    const adventurer = foe({
      emoji: '🧙', name: 'Wandering Mage', tag: 'Friendly', isAdventurer: true, isRecruited: true,
    });
    const opened = applyEnemyTurns(base([adventurer]), runEnemyTurns(base([adventurer])));
    expect(opened.map[1][2].type).toBe('door-open');
    expect(opened.enemies[0].pos).toEqual({ x: 2, y: 1 });

    const bear = foe({
      emoji: '🐻', name: 'Bear', tag: 'Friendly', bear: true, isRecruited: true,
    });
    const blocked = applyEnemyTurns(base([bear]), runEnemyTurns(base([bear])));
    expect(blocked.map[1][2].type).toBe('door-closed');
    expect(blocked.enemies[0].pos).toEqual({ x: 1, y: 1 });
  });
});

describe('companion kill XP and bounty', () => {
  function openFloor(): MapGrid {
    return Array.from({ length: 6 }, () =>
      Array.from({ length: 6 }, () => tile('floor', '⬜')),
    );
  }

  it('grants full XP to the companion and 50% to the player', () => {
    const companion = foe({
      id: 'c1', emoji: '🥷', name: 'Lost Ninja', tag: 'Friendly',
      isAdventurer: true, isRecruited: true, pos: { x: 2, y: 2 },
      attack: 8, hp: 12, maxHp: 12, xp: 0, level: 1,
    });
    const goblin = foe({
      id: 'g1', emoji: '👺', name: 'Goblin', tag: 'Hostile',
      pos: { x: 2, y: 3 }, hp: 1, maxHp: 1, engaged: true, attack: 1,
    });
    const state = {
      ...base([companion, goblin]),
      map: openFloor(),
      player: { ...playerAt(1, 1), stats: { ...playerAt(1, 1).stats, xp: 0, level: 1 } },
      companionKillTally: 0,
    };
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.enemies.some(e => e.id === 'g1')).toBe(false);
    const c = next.enemies.find(e => e.id === 'c1')!;
    expect(c.xp).toBe(5);
    expect(next.player.stats.xp).toBe(3);
    expect(next.companionKillTally).toBe(1);
    expect(next.logs.some(l => l.text.includes('Companion bounty'))).toBe(false);
  });

  it('logs bounty only when the share tier drops', () => {
    const companion = foe({
      id: 'c1', emoji: '🥷', name: 'Lost Ninja', tag: 'Friendly',
      isAdventurer: true, isRecruited: true, pos: { x: 2, y: 2 },
      attack: 8, hp: 12, maxHp: 12, xp: 0, level: 1,
    });
    const goblin = foe({
      id: 'g1', emoji: '👺', name: 'Goblin', tag: 'Hostile',
      pos: { x: 2, y: 3 }, hp: 1, maxHp: 1, engaged: true, attack: 1,
    });
    const state = {
      ...base([companion, goblin]),
      map: openFloor(),
      player: playerAt(1, 1),
      companionKillTally: 4,
    };
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.companionKillTally).toBe(5);
    expect(next.player.stats.xp).toBe(3);
    expect(next.logs.some(l => l.text === 'Companion bounty: 40% XP')).toBe(true);
  });
});
