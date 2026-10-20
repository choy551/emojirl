import { describe, it, expect } from 'vitest';
import {
  ADVENTURER_TYPES, BOSS_TYPES, ENEMY_TYPES, FOREST_ENEMY_TYPES,
  enemyCanOpenDoors, enemyMaySpawnOnTile, getEchoEnemy, isAnimalEnemy, passableTilesForEnemy,
} from './enemies';
import { spawnEnemies } from './spawning';
import type { MapGrid, Tile } from './types';
import { ENEMY_PASSABLE_TILES, HUMANOID_ENEMY_PASSABLE_TILES, MERMAN_PASSABLE_TILES } from './tiles';

describe('isAnimalEnemy', () => {
  it('is true for snakes, spiders, wolves, bears, monkeys, crows, eyes, and dragons', () => {
    expect(isAnimalEnemy({ emoji: '🐍', name: 'Snake' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🕷️', name: 'Spider' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🐺', name: 'Wolf' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🐻', name: 'Bear', bear: true })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🐒', name: 'Monkey', monkey: true })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🐦‍⬛', name: 'Crow', crow: true })).toBe(true);
    expect(isAnimalEnemy({ emoji: '👁️', name: 'Eye' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🐉', name: 'Dragon' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🦑', name: 'Kraken' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🦊', name: 'Fox' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🐗', name: 'Boar' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '🕷️', name: 'Spider Queen' })).toBe(true);
  });

  it('uses name fallbacks for echoes if emoji is missing', () => {
    expect(isAnimalEnemy({ emoji: '', name: 'Dragon Echo' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '', name: 'Spider Queen Echo' })).toBe(true);
    expect(isAnimalEnemy({ emoji: '', name: 'Kraken Echo' })).toBe(true);
  });

  it('is false for humanoids, ghosts, fairies, mermen, and adventurers', () => {
    expect(isAnimalEnemy({ emoji: '🧟', name: 'Zombie' })).toBe(false);
    expect(isAnimalEnemy({ emoji: '💀', name: 'Skeleton' })).toBe(false);
    expect(isAnimalEnemy({ emoji: '🧝‍♀️', name: 'Elf Archer' })).toBe(false);
    expect(isAnimalEnemy({ emoji: '👻', name: 'Ghost' })).toBe(false);
    expect(isAnimalEnemy({ emoji: '🧚‍♀️', name: 'Cute Fairy' })).toBe(false);
    expect(isAnimalEnemy({ emoji: '🧜‍♂️', name: 'Merman' })).toBe(false);
    expect(isAnimalEnemy({ emoji: '🧙', name: 'Wandering Mage', })).toBe(false);
    expect(isAnimalEnemy({ emoji: '🥷', name: 'Lost Ninja' })).toBe(false);
    expect(enemyCanOpenDoors({ emoji: '🧟', name: 'Zombie' })).toBe(true);
    expect(enemyCanOpenDoors({ emoji: '🐍', name: 'Snake' })).toBe(false);
  });

  it('gives mermen water tiles and humanoids closed-door tiles', () => {
    expect(passableTilesForEnemy({ emoji: '🧜‍♂️', name: 'Merman', waterAggro: true })).toBe(MERMAN_PASSABLE_TILES);
    expect(passableTilesForEnemy({ emoji: '🧟', name: 'Zombie' })).toBe(HUMANOID_ENEMY_PASSABLE_TILES);
    expect(passableTilesForEnemy({ emoji: '🐍', name: 'Snake' })).toBe(ENEMY_PASSABLE_TILES);
    expect(HUMANOID_ENEMY_PASSABLE_TILES.has('door-closed')).toBe(true);
    expect(ENEMY_PASSABLE_TILES.has('door-closed')).toBe(false);
  });
});

describe('flying tag', () => {
  const catalog = [
    ...ENEMY_TYPES,
    ...FOREST_ENEMY_TYPES,
    ...BOSS_TYPES,
    ...ADVENTURER_TYPES,
  ];

  it('is set on airborne creatures and nowhere else', () => {
    const flying = catalog.filter(e => 'flying' in e && e.flying).map(e => `${e.emoji} ${e.name}`);
    expect(flying).toEqual([
      '👁️ Eye',
      '👻 Ghost',
      '🧚‍♀️ Cute Fairy',
      '🐦‍⬛ Crow',
      '🐉 Dragon',
    ]);
  });

  it('lets a dragon echo inherit flying and leaves land bosses grounded', () => {
    const dragon = BOSS_TYPES.find(b => b.name === 'Dragon')!;
    const kraken = BOSS_TYPES.find(b => b.name === 'Kraken')!;
    expect(getEchoEnemy(dragon).flying).toBe(true);
    expect(getEchoEnemy(kraken).flying).toBeUndefined();
  });

  it('adds water and lava without taking away doors or grounding everyone else', () => {
    const ghost = passableTilesForEnemy({ emoji: '👻', name: 'Ghost', flying: true });
    expect(ghost.has('water')).toBe(true);
    expect(ghost.has('lava')).toBe(true);
    expect(ghost.has('door-closed')).toBe(true);
    expect(ghost.has('floor')).toBe(true);

    const crow = passableTilesForEnemy({ emoji: '🐦‍⬛', name: 'Crow', crow: true, flying: true });
    expect(crow.has('water')).toBe(true);
    expect(crow.has('lava')).toBe(true);
    expect(crow.has('door-closed')).toBe(false);

    const snake = passableTilesForEnemy({ emoji: '🐍', name: 'Snake' });
    expect(snake.has('water')).toBe(false);
    expect(snake.has('lava')).toBe(false);
    expect(snake).toBe(ENEMY_PASSABLE_TILES);

    const zombie = passableTilesForEnemy({ emoji: '🧟', name: 'Zombie' });
    expect(zombie.has('water')).toBe(false);
    expect(zombie.has('lava')).toBe(false);
    expect(zombie).toBe(HUMANOID_ENEMY_PASSABLE_TILES);

    const merman = passableTilesForEnemy({ emoji: '🧜‍♂️', name: 'Merman', waterAggro: true, flying: true });
    expect(merman).toBe(MERMAN_PASSABLE_TILES);
    expect(merman.has('lava')).toBe(false);
  });

  it('allows flying spawns on water and lava, and only floor for everyone else', () => {
    expect(enemyMaySpawnOnTile('floor', true)).toBe(true);
    expect(enemyMaySpawnOnTile('water', true)).toBe(true);
    expect(enemyMaySpawnOnTile('lava', true)).toBe(true);
    expect(enemyMaySpawnOnTile('wall', true)).toBe(false);
    expect(enemyMaySpawnOnTile('floor', false)).toBe(true);
    expect(enemyMaySpawnOnTile('water', false)).toBe(false);
    expect(enemyMaySpawnOnTile('lava')).toBe(false);
  });

  it('spawns flying creatures on a water-or-lava room and keeps grounded ones off it', () => {
    const tile = (type: Tile['type']): Tile => ({ type, emoji: '⬜', seen: false, visible: false });
    const map: MapGrid = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => tile('wall')),
    );
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) map[y][x] = tile(x < 4 ? 'water' : 'lava');
    }
    const room = { x: 1, y: 1, w: 5, h: 5, theme: 'normal' as const };
    const rooms = [{ x: 0, y: 0, w: 3, h: 3, theme: 'normal' as const }, room];
    const spawned = [];
    for (let i = 0; i < 40; i++) spawned.push(...spawnEnemies(1, rooms, { x: 0, y: 0 }, 0, map));
    const inRoom = spawned.filter(e =>
      !e.isAdventurer && e.pos.x >= 2 && e.pos.x <= 4 && e.pos.y >= 2 && e.pos.y <= 4,
    );
    expect(inRoom.length).toBeGreaterThan(0);
    expect(inRoom.every(e => e.flying)).toBe(true);
    expect(inRoom.some(e => map[e.pos.y][e.pos.x].type === 'water')).toBe(true);
    expect(inRoom.some(e => map[e.pos.y][e.pos.x].type === 'lava')).toBe(true);
  });
});
