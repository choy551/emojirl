import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from './classes';
import { resolveExecuteContract } from './hitman';
import { HITMAN_EXECUTE_BULLETS, HITMAN_EXECUTE_GOLD } from './prestigeConstants';
import type { Enemy, MapGrid, Player, Tile } from './types';
import { hitmanRevealsEnemy, sharpshooterSees, withVisibility } from './vision';

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: false, visible: false };
}

function openMap(w: number, h: number): MapGrid {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => tile('floor', '⬜')));
}

function hitman(pos = { x: 1, y: 1 }): Player {
  return {
    pos,
    emoji: '🕴️',
    characterClass: '🕴️',
    ammo: 0,
    stats: {
      hp: 12, maxHp: 12, attack: 8, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 100, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
  } as Player;
}

function rat(partial: Partial<Enemy> = {}): Enemy {
  return {
    id: 'rat', pos: { x: 1, y: 6 }, emoji: '🐀', name: 'Rat',
    hp: 4, maxHp: 20, attack: 2, defense: 0, speed: 1, engaged: true,
    ...partial,
  };
}

describe('Execute Contract', () => {
  it('kills through the normal path and logs the target name', () => {
    const enemy = rat();
    const result = resolveExecuteContract({
      player: hitman(),
      enemies: [enemy],
      items: [],
      killCounts: {},
      target: enemy,
      floor: 3,
      attack: 8,
      rng: () => 0,
    });
    expect(result.enemies).toHaveLength(0);
    expect(result.player.stats.xp).toBe(105);
    expect(result.killCounts['🐀']).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0].pos).toEqual(enemy.pos);
    const text = result.logs.join('\n');
    expect(text).toContain('Contract executed');
    expect(text).toContain('Rat');
    expect(result.player.stats.executeCooldown).toBeGreaterThan(0);
  });

  it('pays the execution bonus when the mark is already low, and still drops loot', () => {
    const enemy = rat({ hp: 2, maxHp: 10 });
    const result = resolveExecuteContract({
      player: hitman(),
      enemies: [enemy],
      items: [],
      killCounts: {},
      target: enemy,
      floor: 1,
      attack: 4,
      rng: () => 0,
    });
    expect(result.enemies).toHaveLength(0);
    expect(result.player.stats.gold).toBe(HITMAN_EXECUTE_GOLD);
    expect(result.player.ammo).toBe(HITMAN_EXECUTE_BULLETS);
    expect(result.logs.some(line => line.includes('Contract executed') && line.includes('Rat') && line.includes('gold'))).toBe(true);
    expect(result.items.length).toBe(1);
  });

  it('leaves a healthy target alive and does not claim a kill', () => {
    const enemy = rat({ hp: 20, maxHp: 20 });
    const result = resolveExecuteContract({
      player: hitman(),
      enemies: [enemy],
      items: [],
      killCounts: {},
      target: enemy,
      floor: 1,
      attack: 4,
      rng: () => 0,
    });
    expect(result.enemies).toHaveLength(1);
    expect(result.enemies[0].hp).toBeLessThan(20);
    expect(result.killCounts['🐀']).toBeUndefined();
    expect(result.items).toHaveLength(0);
    expect(result.player.stats.xp).toBe(100);
    expect(result.logs.join('\n')).not.toContain('Contract executed');
  });
});

describe('Sharpshooter', () => {
  it('describes both guns as 75% each for 150% total, and the line reveal, in the class catalog RTFM uses', () => {
    const detail = CHARACTER_CLASSES['🕴️'].passives.find(p => p.label === 'Sharpshooter')?.detail ?? '';
    expect(detail).toContain('75%');
    expect(detail).toContain('150%');
    expect(detail).toContain('2 bullets');
    expect(detail).toContain('1 bullet');
    expect(detail).toContain('eight straight lines');
    expect(detail).not.toContain('−25%');
    expect(detail).not.toContain('(-25%)');
  });

  it('reveals enemies on the eight lines at any range and stops at solid terrain', () => {
    const map = openMap(12, 12);
    const from = { x: 1, y: 1 };
    expect(sharpshooterSees(map, from, { x: 1, y: 10 })).toBe(true);
    expect(sharpshooterSees(map, from, { x: 8, y: 8 })).toBe(true);
    expect(sharpshooterSees(map, from, { x: 4, y: 2 })).toBe(false);

    map[3][1] = tile('wall', '⬛');
    expect(sharpshooterSees(map, from, { x: 1, y: 6 })).toBe(false);
    map[3][1] = tile('door-open', '🚪');
    expect(sharpshooterSees(map, from, { x: 1, y: 6 })).toBe(true);
    map[3][1] = tile('door-closed', '🚪');
    expect(sharpshooterSees(map, from, { x: 1, y: 6 })).toBe(false);

    const wizard = { ...hitman(), characterClass: '🧙', emoji: '🧙' };
    expect(hitmanRevealsEnemy(wizard, map, { x: 1, y: 2 })).toBe(false);
    expect(hitmanRevealsEnemy(hitman(), openMap(12, 12), { x: 1, y: 10 })).toBe(true);
  });

  it('does not mark terrain beyond normal sight as seen', () => {
    const map = openMap(12, 12);
    const player = hitman();
    const state = withVisibility({
      player,
      map,
      enemies: [rat({ pos: { x: 1, y: 8 } })],
      items: [],
      currentFloor: 1,
      turn: 1,
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
      schemaVersion: 1,
    });
    expect(hitmanRevealsEnemy(player, map, { x: 1, y: 8 })).toBe(true);
    expect(state.map[8][1].seen).toBe(false);
    expect(state.map[8][1].visible).toBe(false);
    expect(state.map[1][1].visible).toBe(true);
  });
});
