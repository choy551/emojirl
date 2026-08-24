import { describe, it, expect } from 'vitest';
import { resolveProjectileFlight } from './projectiles';
import type { ActiveProjectile, Enemy, Player, Tile } from './types';

const floor: Tile = { type: 'floor', emoji: '⬜', seen: true, visible: true };
const wall: Tile = { type: 'wall', emoji: '⬛', seen: true, visible: true };

function mapWithWalls(w: number, h: number, walls: [number, number][] = []): Tile[][] {
  const m = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ...floor })));
  for (const [x, y] of walls) m[y][x] = { ...wall };
  return m;
}

function goblin(id: string, x: number, y: number, extra: Partial<Enemy> = {}): Enemy {
  return {
    id, emoji: '👺', name: 'Goblin', hp: 8, maxHp: 8, attack: 3, defense: 0, speed: 4,
    engaged: true, pos: { x, y }, tag: 'Hostile', ...extra,
  };
}

const player = {
  pos: { x: 1, y: 2 },
  emoji: '🧙',
  characterClass: '🧙',
  ammo: 0,
  stats: { hp: 10, maxHp: 10, attack: 4, defense: 0, speed: 4, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0 },
  inventory: [],
  bank: [],
  equipment: {},
} as Player;

function gunAtPlayer(): ActiveProjectile {
  return {
    id: 'g1', kind: 'gun', pos: { ...player.pos }, dir: { x: 1, y: 0 },
    phase: 'outgoing', maxRange: 8, traveled: 0,
  };
}

describe('resolveProjectileFlight', () => {
  it('hits an enemy several tiles down the line in a single action', () => {
    const map = mapWithWalls(10, 5);
    const enemies = [goblin('g', 5, 2, { hp: 3, maxHp: 8 })];
    const res = resolveProjectileFlight(gunAtPlayer(), map, enemies, player, 1);
    expect(res.projectile).toBeNull();
    expect(res.enemies).toHaveLength(0);
    expect(res.logs.some(l => l.text.includes('Bullet hits'))).toBe(true);
    expect(res.beam?.positions.length).toBe(4);
  });

  it('hits an adjacent enemy', () => {
    const map = mapWithWalls(6, 5);
    const enemies = [goblin('g', 2, 2, { hp: 3, maxHp: 8 })];
    const res = resolveProjectileFlight(gunAtPlayer(), map, enemies, player, 1);
    expect(res.enemies).toHaveLength(0);
  });

  it('is stopped by a wall and does not hit behind it', () => {
    const map = mapWithWalls(10, 5, [[3, 2]]);
    const enemies = [goblin('g', 5, 2)];
    const res = resolveProjectileFlight(gunAtPlayer(), map, enemies, player, 1);
    expect(res.enemies).toHaveLength(1);
    expect(res.enemies[0].hp).toBe(8);
    expect(res.logs.some(l => l.text.includes('Bullet hits'))).toBe(false);
  });

  it('passes through a friendly companion and hits the hostile beyond', () => {
    const map = mapWithWalls(10, 5);
    const ally: Enemy = {
      id: 'ally', emoji: '🧝', name: 'Ally', hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 4,
      engaged: false, pos: { x: 3, y: 2 }, tag: 'Friendly', isAdventurer: true, isRecruited: true,
    };
    const enemies = [ally, goblin('g', 6, 2, { hp: 3, maxHp: 8 })];
    const res = resolveProjectileFlight(gunAtPlayer(), map, enemies, player, 1);
    expect(res.enemies.some(e => e.id === 'ally' && e.hp === 10)).toBe(true);
    expect(res.enemies.some(e => e.id === 'g')).toBe(false);
  });

  it('boomerang hits the first enemy and returns the same action', () => {
    const map = mapWithWalls(10, 5);
    const enemies = [goblin('g', 4, 2, { hp: 20, maxHp: 20 })];
    const proj: ActiveProjectile = {
      id: 'b1', kind: 'boomerang', pos: { ...player.pos }, dir: { x: 1, y: 0 },
      phase: 'outgoing', maxRange: 5, traveled: 0,
    };
    const res = resolveProjectileFlight(proj, map, enemies, player, 1);
    expect(res.projectile).toBeNull();
    expect(res.enemies[0].hp).toBeLessThan(20);
    expect(res.logs.some(l => l.text.includes('Boomerang hits'))).toBe(true);
    expect(res.logs.some(l => l.text.includes('returns to your hand'))).toBe(true);
  });
});
