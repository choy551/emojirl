import { describe, it, expect } from 'vitest';
import { isAnimalEnemy, enemyCanOpenDoors, passableTilesForEnemy } from './enemies';
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
