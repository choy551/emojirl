import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { resolveProjectileFlight } from './projectiles';
import { applyMeteorBlast } from './meteor';
import { resolveGenieFireball } from './prestigeCast';
import { resolveExecuteContract } from './hitman';
import { applyInstantItemUse } from './shopUse';
import { handleGodBlessedImmunity, spareLethalHit } from './flashSignals';
import type { ActiveProjectile, EmojiItem, Enemy, GameState, MapGrid, Player } from './types';

function foe(partial: Partial<Enemy> = {}): Enemy {
  return {
    id: 'eye', pos: { x: 4, y: 2 }, emoji: '👁️', name: 'Eye',
    hp: 1, maxHp: 8, attack: 0, defense: 0, speed: 1, engaged: true, godBlessed: true,
    ...partial,
  };
}

function hero(attack = 8): Player {
  return {
    pos: { x: 1, y: 2 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0, mana: 6, maxMana: 6,
    },
    inventory: [],
    bank: [],
    equipment: {},
  };
}

function row(): MapGrid {
  return [Array.from({ length: 8 }, () => ({ type: 'floor' as const, emoji: '⬜', seen: true, visible: true }))];
}

function shot(kind: ActiveProjectile['kind']): ActiveProjectile {
  return {
    id: kind, kind, pos: { x: 1, y: 2 }, dir: { x: 1, y: 0 },
    phase: 'outgoing', maxRange: 6, traveled: 0,
  };
}

function alive(enemies: Enemy[]) {
  return enemies.find(e => e.id === 'eye');
}

describe('God-Blessed ranged immunity', () => {
  it('uses the same cling-to-1-HP rule as melee, and a weak hit does not spend it', () => {
    const blessed = foe({ hp: 8, maxHp: 8 });
    const melee = handleGodBlessedImmunity(blessed, [blessed], 0, 20, 1, () => {}, []);
    const ranged = spareLethalHit({
      enemy: blessed, lethal: true, enemies: [blessed], index: 0, playerHp: 20, turn: 1, log: () => {},
    });
    expect(melee.newEnemies[0]).toMatchObject({ hp: 1, godBlessed: false });
    expect(ranged.enemies[0]).toMatchObject({ hp: 1, godBlessed: false });
    const grazed = spareLethalHit({
      enemy: blessed, lethal: false, enemies: [blessed], index: 0, playerHp: 20, turn: 1, log: () => {},
    });
    expect(grazed.spared).toBe(false);
    expect(grazed.enemies[0].godBlessed).toBe(true);
    expect(grazed.enemies[0].hp).toBe(8);
  });

  it('does not instakill a God-Blessed foe with a gun, freeze ray, boomerang, or bomb', () => {
    const map = Array.from({ length: 5 }, () =>
      Array.from({ length: 10 }, () => ({ type: 'floor' as const, emoji: '⬜', seen: true, visible: true })),
    );
    for (const kind of ['gun', 'freeze', 'boomerang', 'bomb'] as const) {
      const res = resolveProjectileFlight(shot(kind), map, [foe()], hero(6), 2);
      const eye = alive(res.enemies);
      expect(eye, kind).toBeTruthy();
      expect(eye).toMatchObject({ hp: 1, godBlessed: false });
      expect(res.logs.some(l => l.text.includes('Divine Intervention'))).toBe(true);
    }
    const grazed = resolveProjectileFlight(shot('gun'), map, [foe({ hp: 40, maxHp: 40 })], hero(4), 3);
    expect(alive(grazed.enemies)).toMatchObject({ godBlessed: true });
    expect(alive(grazed.enemies)!.hp).toBeLessThan(40);
    expect(alive(grazed.enemies)!.hp).toBeGreaterThan(1);
  });

  it('does not instakill with a fireball, a Safe melee, or a Meteor', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const map = row();
    const genie = { ...hero(30), characterClass: '🧞‍♀️', emoji: '🧞‍♀️', pos: { x: 0, y: 0 } };
    const auto = resolveGenieFireball({
      player: genie,
      enemies: [foe({ pos: { x: 3, y: 0 } })],
      map,
      mode: 'nearest',
      manualTargetId: null,
      turn: 1,
      floor: 1,
      addLog: () => {},
    });
    expect(auto.enemies.find(e => e.id === 'eye')).toMatchObject({ hp: 1, godBlessed: false });

    const safe = resolveGenieFireball({
      player: { ...genie, pos: { x: 2, y: 0 }, genieSafeFireball: true },
      enemies: [foe({ pos: { x: 3, y: 0 } })],
      map,
      mode: 'nearest',
      manualTargetId: null,
      turn: 2,
      floor: 1,
      addLog: () => {},
    });
    expect(safe.cast).toBe(false);
    expect(safe.enemies.find(e => e.id === 'eye')).toMatchObject({ hp: 1, godBlessed: false });

    const meteor = applyMeteorBlast({
      player: genie,
      enemies: [foe({ pos: { x: 2, y: 2 } }), foe({ id: 'rat', pos: { x: 7, y: 2 }, hp: 9, maxHp: 9, godBlessed: false, emoji: '🐀', name: 'Rat' })],
      center: { x: 2, y: 2 },
      floor: 1,
      turn: 4,
    });
    expect(meteor.enemies.find(e => e.id === 'eye')).toMatchObject({ hp: 1, godBlessed: false });
    expect(meteor.enemies.find(e => e.id === 'rat')!.hp).toBe(9);
    random.mockRestore();
  });

  it('does not instakill with Execute or a lightning zap', () => {
    const hitman = { ...hero(4), characterClass: '🕴️', emoji: '🕴️' };
    const target = foe({ hp: 4, maxHp: 4 });
    const executed = resolveExecuteContract({
      player: hitman,
      enemies: [target],
      items: [],
      killCounts: {},
      target,
      floor: 1,
      attack: 80,
      rng: () => 0,
    });
    expect(executed.enemies.find(e => e.id === 'eye')).toMatchObject({ hp: 1, godBlessed: false });
    expect(executed.logs.some(l => l.includes('Divine Intervention'))).toBe(true);

    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = {
      schemaVersion: 13,
      player: hero(),
      currentFloor: 1,
      map: Array.from({ length: 5 }, () =>
        Array.from({ length: 8 }, () => ({ type: 'floor' as const, emoji: '⬜', seen: true, visible: true })),
      ),
      enemies: [foe()],
      items: [],
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
    } as GameState;
    const zapped = applyInstantItemUse(state, {
      id: 'zap', emoji: '⚡', name: 'Lightning', description: 'zap', consumed: false,
      effect: { instakillNearest: true, moodBonus: 10, label: 'Lightning strikes!' },
    } as EmojiItem, { source: 'bag', addLog: () => {}, applyMonkeyDropOnKill: (_k, p) => p });
    expect(zapped!.enemies.find(e => e.id === 'eye')).toMatchObject({ hp: 1, godBlessed: false });
    random.mockRestore();
  });

  it('routes wizard bolts, ranger and guard shots, cowboy and hitman guns, and lightning arcs through the same spare', () => {
    const actions = readFileSync(new URL('../hooks/useGameActions.tsx', import.meta.url), 'utf8');
    for (const site of ['shotSpare', 'offSpare', 'rangerSpare', 'pierceSpare', 'arcSpare', 'boltSpare', 'waitBoltSpare']) {
      expect(actions).toContain(site);
    }
    expect(actions).toContain('handleGodBlessedImmunity');
  });
});
