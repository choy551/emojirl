import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Enemy, Player } from './types';
import { executeStrike } from './prestige';
import { SAVE_SCHEMA_VERSION, loadGame, SAVE_KEY } from './save';
import {
  executeDamageMult,
  longGunRange,
  nextStill,
  pickOffhandTarget,
  stillDamageMult,
  weaponRange,
} from './sharpshooter';

function shooter(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🕴️',
    characterClass: '🕴️',
    ammo: 4,
    stats: {
      hp: 12, maxHp: 12, attack: 4, defense: 0, speed: 2, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0, stillStacks: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  } as Player;
}

const pistol = { id: 'p', emoji: '🔫', name: 'Pistol', description: '', consumed: false, weaponKind: 'gun' as const };
const musket = { id: 'm', emoji: '🔫', name: 'Musket', description: '', consumed: false, weaponKind: 'gun' as const, gunTier: 'musket' as const };

function foe(id: string, x: number, y: number): Enemy {
  return { id, pos: { x, y }, emoji: '👺', name: id, hp: 5, maxHp: 5, attack: 1, defense: 0, speed: 1, engaged: true };
}

describe('sharpshooter still', () => {
  it('ramps single-gun damage to 200% and caps lava at 150%', () => {
    expect(stillDamageMult(0, '🕴️')).toBe(1.25);
    expect(stillDamageMult(1, '🕴️')).toBe(1.5);
    expect(stillDamageMult(2, '🕴️')).toBe(1.75);
    expect(stillDamageMult(3, '🕴️')).toBe(2);
    expect(stillDamageMult(9, '🕴️')).toBe(2);
    expect(stillDamageMult(3, '🕴️', 'lava')).toBe(1.5);
    expect(stillDamageMult(3, '🕴️', 'water')).toBe(1.5);
    expect(stillDamageMult(3, '💂')).toBe(1);
    expect(nextStill(2, false, '🕴️')).toBe(3);
    expect(nextStill(3, false, '🕴️')).toBe(3);
    expect(nextStill(0, false, '🕴️', 'lava')).toBe(1);
    expect(nextStill(1, false, '🕴️', 'water')).toBe(1);
    expect(nextStill(3, true, '🕴️')).toBe(0);
    expect(nextStill(2, false, '💂')).toBe(0);
  });

  it('picks another foe within 3, otherwise the same target costs 2 bullets', () => {
    const from = { x: 0, y: 0 };
    const primary = foe('a', 2, 0);
    const other = foe('b', 0, 2);
    const far = foe('c', 0, 4);
    const los = () => true;
    expect(pickOffhandTarget(from, [primary, other, far], 'a', los)?.id).toBe('b');
    expect(pickOffhandTarget(from, [primary, far], 'a', los)).toBeNull();
    const dual = weaponRange(shooter({
      equipment: { mainHand: pistol, offHand: { ...pistol, id: 'p2' } },
    }));
    expect(dual).toBe(3);
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('2 bullets');
    expect(manual).toContain('+25% per Still stack');
  });

  it('sets ranges per weapon and gives the Guard the long-gun range without the ramp', () => {
    expect(weaponRange(shooter({ equipment: { mainHand: pistol } }))).toBe(5);
    expect(weaponRange(shooter({ characterClass: '🤠', emoji: '🤠', equipment: { mainHand: pistol, offHand: { ...pistol, id: 'p2' } } }))).toBe(4);
    const musketMan = shooter({ stats: { ...shooter().stats, stillStacks: 2 }, equipment: { mainHand: musket } });
    expect(weaponRange(musketMan)).toBe(7);
    expect(longGunRange(0)).toBe(5);
    expect(longGunRange(1)).toBe(6);
    expect(longGunRange(4)).toBe(7);
    const guard = shooter({
      characterClass: '💂',
      emoji: '💂',
      stats: { ...shooter().stats, stillStacks: 2 },
      equipment: { mainHand: musket },
    });
    expect(weaponRange(guard)).toBe(7);
    expect(stillDamageMult(2, '💂')).toBe(1);
    expect(executeDamageMult(0)).toBe(2);
    expect(executeDamageMult(3)).toBe(2.75);
    expect(executeStrike(10, 9, 10, 0, 2).damage).toBe(Math.round(10 * 2.5));
    expect(executeStrike(10, 2, 10, 0, 3).executed).toBe(true);
  });

  it('loads missing Still stacks as 0', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
    });
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 11,
      map: [],
      player: { characterClass: '🕴️', ammo: 0, stats: {}, inventory: [], bank: [], equipment: {} },
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.state.player.stats.stillStacks).toBe(0);
  });
});
