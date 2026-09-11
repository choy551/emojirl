import { describe, it, expect } from 'vitest';
import type { Enemy, GameState, MapGrid, Player, Tile } from './types';
import { applyBedRest, BED_OVERHEAL_MULT, isSleepThreat, simulateSleep, sneakAttackDamage } from './sleep';

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: true, visible: true };
}

function floorGrid(): MapGrid {
  return Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, () => tile('floor', '⬜')),
  );
}

function playerAt(x: number, y: number, over: Partial<Player['stats']> = {}): Player {
  return {
    pos: { x, y },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0, mana: 0, maxMana: 4,
      blinkStrikeCooldown: 5,
      ...over,
    },
    inventory: [{
      id: 'soul', emoji: '🍀', name: 'Clover', description: 'luck',
      consumed: false, bagPassive: { description: 'lucky' },
    }],
    bank: [],
    equipment: {},
    trailblazerCooldown: 3,
  };
}

function goblin(x: number, y: number): Enemy {
  return {
    id: 'g1',
    pos: { x, y },
    emoji: '👺',
    name: 'Goblin',
    hp: 5,
    maxHp: 5,
    attack: 4,
    defense: 0,
    speed: 3,
    engaged: true,
  };
}

function state(over: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: 1,
    player: playerAt(2, 2),
    currentFloor: 1,
    map: floorGrid(),
    enemies: [],
    items: [],
    turn: 10,
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
    ...over,
  };
}

describe('applyBedRest', () => {
  it('sets HP to 200% of max, fills wizard mana, and zeroes cooldowns', () => {
    const p = applyBedRest(playerAt(1, 1, { hp: 4, mana: 1 }));
    expect(p.stats.hp).toBe(10 * BED_OVERHEAL_MULT);
    expect(p.stats.mana).toBe(4);
    expect(p.stats.blinkStrikeCooldown).toBe(0);
    expect(p.trailblazerCooldown).toBe(0);
    expect(p.stats.overhealDecayTick).toBe(0);
  });
});

describe('sneakAttackDamage', () => {
  it('is double the normal melee hit and ignores dodge', () => {
    expect(sneakAttackDamage(playerAt(0, 0, { defense: 0 }), goblin(1, 0))).toBe(8);
  });
});

describe('isSleepThreat', () => {
  it('ignores recruited companions and unengaged monkeys', () => {
    expect(isSleepThreat(goblin(0, 0))).toBe(true);
    expect(isSleepThreat({ ...goblin(0, 0), isRecruited: true, tag: 'Friendly' })).toBe(false);
    expect(isSleepThreat({ ...goblin(0, 0), monkey: true, engaged: false })).toBe(false);
  });
});

describe('simulateSleep', () => {
  it('advances the requested number of turns when nobody reaches the player', () => {
    const { state: next, wokeBy, turnsSlept } = simulateSleep(state({ enemies: [] }), 4);
    expect(wokeBy).toBeNull();
    expect(turnsSlept).toBe(4);
    expect(next.turn).toBe(14);
    expect(next.player.stats.hp).toBe(10);
  });

  it('wakes with one 200% sneak attack when a hostile is adjacent', () => {
    const { state: next, wokeBy, turnsSlept } = simulateSleep(state({
      enemies: [goblin(2, 3)],
    }), 8);
    expect(wokeBy?.name).toBe('Goblin');
    expect(turnsSlept).toBe(1);
    expect(next.player.stats.hp).toBe(2); // 10 - 8
    expect(next.gameOver).toBe(false);
    expect(next.logs.some(l => l.text.includes('sneak-attacks'))).toBe(true);
  });
});
