import { describe, expect, it } from 'vitest';
import type { Enemy, MapGrid, Player, Tile } from './types';
import { LOW_HP_LOG, NO_ENEMIES_LOG, planAutofight, type AutofightInput } from './autofight';
import { VISION_RADIUS } from './vision';

function floor(w: number, h: number): MapGrid {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, (): Tile => ({ type: 'floor', emoji: '⬜', seen: true, visible: true })),
  );
}

function wallAt(map: MapGrid, x: number, y: number) {
  map[y][x] = { type: 'wall', emoji: '⬛', seen: true, visible: true };
}

function hero(partial: Partial<Player> = {}, stats: Partial<Player['stats']> = {}): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: '🥷',
    characterClass: '🥷',
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: {},
    ...partial,
    stats: {
      hp: 20, maxHp: 20, attack: 4, defense: 0, speed: 2, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0, mana: 4, maxMana: 4,
      ...stats,
    },
  } as Player;
}

function foe(x: number, y: number, id = 'gob'): Enemy {
  return {
    id, pos: { x, y }, emoji: '👺', name: 'Goblin',
    hp: 8, maxHp: 8, attack: 2, defense: 0, speed: 1, engaged: true,
  };
}

function plan(over: Partial<AutofightInput> = {}) {
  const player = over.player ?? hero();
  return planAutofight({
    player,
    map: over.map ?? floor(8, 8),
    enemies: over.enemies ?? [],
    maxHp: over.maxHp ?? player.stats.maxHp,
    rangerMode: over.rangerMode,
    voidAttackMode: over.voidAttackMode,
    voidBossesCleared: over.voidBossesCleared,
    holdFire: over.holdFire,
  });
}

describe('autofight', () => {
  it('steps toward a visible enemy and bumps when adjacent', () => {
    const step = plan({ player: hero({ pos: { x: 1, y: 1 } }), enemies: [foe(1, 4)] });
    expect(step).toEqual({ kind: 'move', dx: 0, dy: 1 });
    const bump = plan({ player: hero({ pos: { x: 1, y: 1 } }), enemies: [foe(2, 2)] });
    expect(bump).toEqual({ kind: 'move', dx: 1, dy: 1 });
    const meleeRanger = plan({
      player: hero({ pos: { x: 1, y: 1 }, emoji: '🧝', characterClass: '🧝', ammo: 6 }),
      enemies: [foe(1, 2)],
      rangerMode: 'melee',
    });
    expect(meleeRanger).toEqual({ kind: 'move', dx: 0, dy: 1 });
  });

  it('fires a lined shot and otherwise steps onto a firing tile', () => {
    const ranger = hero({ pos: { x: 1, y: 1 }, emoji: '🧝', characterClass: '🧝', ammo: 6 });
    const fire = plan({ player: ranger, enemies: [foe(1, 4)], rangerMode: 'ranged' });
    expect(fire).toEqual({ kind: 'move', dx: 0, dy: 1 });

    const map = floor(6, 6);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) wallAt(map, x, y);
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [3, 2]] as const) {
      map[y][x] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    }
    const reposition = plan({
      player: hero({ pos: { x: 1, y: 1 }, emoji: '🧝', characterClass: '🧝', ammo: 6 }),
      map,
      enemies: [foe(3, 2)],
      rangerMode: 'ranged',
    });
    expect(reposition).toEqual({ kind: 'idle', log: NO_ENEMIES_LOG });
  });

  it('closes to melee with a bow and sword when the enemy is within 2 tiles', () => {
    const hybrid = hero({
      pos: { x: 1, y: 1 },
      emoji: '💂',
      characterClass: '💂',
      ammo: 6,
      equipment: {
        mainHand: { id: 'bow', emoji: '🏹', name: 'Bow', description: '', consumed: false, weaponKind: 'bow' },
        offHand: { id: 'sword', emoji: '⚔️', name: 'Sword', description: '', consumed: false, weaponKind: 'blade' },
      },
    });
    const adjacent = plan({ player: hybrid, enemies: [foe(1, 2)], rangerMode: 'ranged' });
    expect(adjacent).toEqual({ kind: 'move', dx: 0, dy: 1 });
    const twoAway = plan({
      player: { ...hybrid, pos: { x: 1, y: 1 } },
      enemies: [foe(3, 2)],
      rangerMode: 'ranged',
    });
    expect(twoAway).toEqual({ kind: 'move', dx: 1, dy: 0 });
    const far = plan({ player: hybrid, enemies: [foe(1, 5)], rangerMode: 'ranged' });
    expect(far).toEqual({ kind: 'move', dx: 0, dy: 1 });
  });

  it('kites a wizard toward the edge of sight and waits to cast when already there', () => {
    const closer = plan({
      player: hero({ pos: { x: 2, y: 3 }, emoji: '🧙', characterClass: '🧙' }, { mana: 4 }),
      enemies: [foe(2, 3 + 3)],
    });
    expect(closer).toEqual({ kind: 'move', dx: 0, dy: -1 });

    const edge = plan({
      player: hero({ pos: { x: 2, y: 2 }, emoji: '🧙', characterClass: '🧙' }, { mana: 4 }),
      enemies: [foe(2, 2 + VISION_RADIUS)],
    });
    expect(edge).toEqual({ kind: 'wait' });

    const far = plan({
      player: hero({ pos: { x: 2, y: 1 }, emoji: '🧙', characterClass: '🧙' }, { mana: 4 }),
      map: floor(5, 14),
      enemies: [foe(2, 12)],
    });
    expect(far).toEqual({ kind: 'idle', log: NO_ENEMIES_LOG });
  });

  it('logs and spends nothing when no enemy is visible', () => {
    expect(plan({ enemies: [] })).toEqual({ kind: 'idle', log: NO_ENEMIES_LOG });
  });

  it('ignores telepathy and foes outside sight, and still shoots inside LOS', () => {
    const blocked = floor(8, 8);
    wallAt(blocked, 1, 2);
    blocked[3][1] = { ...blocked[3][1], visible: true };
    const telepathy = plan({ map: blocked, enemies: [foe(1, 3)] });
    expect(telepathy).toEqual({ kind: 'idle', log: NO_ENEMIES_LOG });

    const seen = plan({ map: floor(8, 8), enemies: [foe(1, 3)] });
    expect(seen).toEqual({ kind: 'move', dx: 0, dy: 1 });

    const outside = plan({ map: floor(3, VISION_RADIUS + 4), enemies: [foe(1, 1 + VISION_RADIUS + 1)] });
    expect(outside).toEqual({ kind: 'idle', log: NO_ENEMIES_LOG });

    const ranger = hero({ pos: { x: 1, y: 1 }, emoji: '🧝', characterClass: '🧝', ammo: 6 });
    const shot = plan({ player: ranger, enemies: [foe(1, 4)], rangerMode: 'ranged' });
    expect(shot).toEqual({ kind: 'move', dx: 0, dy: 1 });
    const noShot = plan({ player: ranger, map: blocked, enemies: [foe(1, 3)], rangerMode: 'ranged' });
    expect(noShot).toEqual({ kind: 'idle', log: NO_ENEMIES_LOG });
  });

  it('prices a void shot in HP and melees when that price would kill', () => {
    const wizard = hero({ pos: { x: 2, y: 2 }, emoji: '👤', characterClass: '👤', ammo: 0, voidBossesCleared: 0 }, { hp: 16, maxHp: 20 });
    const cast = plan({
      player: wizard,
      map: floor(5, 14),
      enemies: [foe(2, 2 + VISION_RADIUS)],
      voidAttackMode: 'wizard',
      voidBossesCleared: 0,
    });
    expect(cast).toEqual({ kind: 'wait' });

    const lethal = plan({
      player: hero({ pos: { x: 2, y: 2 }, emoji: '👤', characterClass: '👤', ammo: 0 }, { hp: 12, maxHp: 20 }),
      map: floor(5, 14),
      enemies: [foe(2, 2 + VISION_RADIUS)],
      voidAttackMode: 'wizard',
      voidBossesCleared: 11,
    });
    expect(lethal.kind).toBe('move');

    const ranger = plan({
      player: hero({ pos: { x: 1, y: 1 }, emoji: '👤', characterClass: '👤', ammo: 0 }, { hp: 16, maxHp: 20 }),
      enemies: [foe(1, 4)],
      voidAttackMode: 'ranger',
    });
    expect(ranger).toEqual({ kind: 'move', dx: 0, dy: 1 });

    const spent = plan({
      player: hero({ pos: { x: 1, y: 1 }, emoji: '👤', characterClass: '👤', ammo: 0 }, { hp: 12, maxHp: 20 }),
      enemies: [foe(4, 2)],
      voidAttackMode: 'ranger',
      voidBossesCleared: 11,
    });
    expect(spent.kind).toBe('move');
    expect(spent).toMatchObject({ log: expect.stringContaining('lethal') });

    const quiver = plan({
      player: hero({ pos: { x: 1, y: 1 }, emoji: '👤', characterClass: '👤', ammo: 2 }, { hp: 12, maxHp: 20 }),
      enemies: [foe(1, 4)],
      voidAttackMode: 'ranger',
      voidBossesCleared: 11,
    });
    expect(quiver).toEqual({ kind: 'move', dx: 0, dy: 1 });
  });

  it('refuses below half HP and still acts at exactly half', () => {
    const wounded = plan({
      player: hero({}, { hp: 9, maxHp: 20 }),
      maxHp: 20,
      enemies: [foe(1, 2)],
    });
    expect(wounded).toEqual({ kind: 'idle', log: LOW_HP_LOG });
    const half = plan({
      player: hero({ pos: { x: 1, y: 1 } }, { hp: 10, maxHp: 20 }),
      maxHp: 20,
      enemies: [foe(1, 2)],
    });
    expect(half).toEqual({ kind: 'move', dx: 0, dy: 1 });
  });
});
