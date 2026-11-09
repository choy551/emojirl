import { describe, expect, it } from 'vitest';
import type { Enemy, Player } from './types';
import { applyLungeStrike } from './lunge';

function fencer(): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: '🤺',
    characterClass: '🤺',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 8, defense: 1, speed: 3, evasion: 8,
      luck: 0, level: 5, xp: 100, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
  } as Player;
}

function goblin(): Enemy {
  return {
    id: 'gob', pos: { x: 1, y: 2 }, emoji: '👺', name: 'Goblin',
    hp: 0, maxHp: 8, attack: 2, defense: 0, speed: 1, engaged: true,
  };
}

describe('applyLungeStrike', () => {
  it('logs the kill and grants XP, a drop, and a kill count', () => {
    const result = applyLungeStrike({
      player: fencer(),
      enemies: [goblin()],
      items: [],
      killCounts: {},
      targetId: 'gob',
      enemyHp: 0,
      enemyDied: true,
      floor: 3,
      rng: () => 0,
    });
    expect(result.enemies).toHaveLength(0);
    expect(result.player.stats.xp).toBeGreaterThan(100);
    expect(result.killCounts['👺']).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].pos).toEqual({ x: 1, y: 2 });
    const text = result.logs.join('\n');
    expect(text).toContain('Lunge!');
    expect(text).toContain('Lunge kills 👺 Goblin!');
  });
});
