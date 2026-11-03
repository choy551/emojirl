import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Enemy, Player } from './types';
import { playerDodgeChance, resolveCombat } from './combat';
import { applyEquipmentAndPassives } from './inventory';
import { NINJA_DODGE_CAP } from './progression';
import { DODGE_CAP } from './softCap';
import { FENCER_EVA_CAP } from './prestigeConstants';

function hero(over: Partial<Player['stats']> = {}, extra: Partial<Player> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🧝',
    characterClass: '🧝',
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: {},
    stats: {
      hp: 40, maxHp: 40, attack: 4, defense: 0, speed: 4, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
      ...over,
    },
    ...extra,
  } as Player;
}

function rat(): Enemy {
  return {
    id: 'rat', pos: { x: 1, y: 0 }, emoji: '🐀', name: 'Rat',
    hp: 400, maxHp: 400, attack: 5, defense: 0, speed: 1, engaged: true,
  };
}

function scriptedRandom(values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)] ?? 0);
}

afterEach(() => vi.restoreAllMocks());

describe('playerDodgeChance', () => {
  it('caps a normal dodge at 50% when EVA is inflated by Speed overflow', () => {
    const player = hero({ speed: 31, evasion: 72 });
    const geared = applyEquipmentAndPassives(player);
    expect(geared.stats.evasion).toBe(96);
    expect(playerDodgeChance(geared)).toBe(DODGE_CAP);
    expect(playerDodgeChance(geared)).toBe(50);
    expect(playerDodgeChance(geared, 20)).toBe(50);
  });

  it('adds mood dodge without copying EVA when both sit under the cap', () => {
    const geared = applyEquipmentAndPassives(hero({ evasion: 10 }));
    expect(geared.stats.evasion).toBe(10);
    expect(playerDodgeChance(geared)).toBe(10);
    expect(playerDodgeChance(geared, 10)).toBe(20);
  });

  it('caps Ninja dodge at 75% instead of the EVA number', () => {
    const ninja = hero({ evasion: 96, hp: 40, maxHp: 40 }, { characterClass: '🥷', emoji: '🥷' });
    expect(ninja.stats.evasion).toBeGreaterThan(NINJA_DODGE_CAP);
    expect(playerDodgeChance(ninja)).toBe(NINJA_DODGE_CAP);
    expect(playerDodgeChance(ninja, 20)).toBe(75);
    const fresh = hero({ evasion: 0 }, { characterClass: '🥷', emoji: '🥷' });
    expect(playerDodgeChance(fresh)).toBe(20);
  });

  it('uses Fencer Poise, not the raw EVA stat, and caps at 60%', () => {
    const fencer = hero({ evasion: 96, hp: 40, maxHp: 40 }, { characterClass: '🤺', emoji: '🤺' });
    expect(fencer.stats.evasion).toBeGreaterThan(FENCER_EVA_CAP);
    expect(playerDodgeChance(fencer)).toBe(FENCER_EVA_CAP);
    expect(playerDodgeChance(fencer)).not.toBe(fencer.stats.evasion);
  });

  it('rolls the same chance the stat bar shows', () => {
    const geared = applyEquipmentAndPassives(hero({ speed: 31, evasion: 72, hp: 40, maxHp: 40 }));
    expect(playerDodgeChance(geared)).toBe(50);

    const logs: string[] = [];
    scriptedRandom([0, 0.99, 0.6]);
    const miss = resolveCombat(geared, rat(), m => logs.push(m), { mood: 'neutral' });
    expect(logs.some(l => l.includes('dodge'))).toBe(false);
    expect(miss.dodged).toBe(false);

    logs.length = 0;
    scriptedRandom([0, 0.99, 0.49]);
    const hit = resolveCombat(geared, rat(), m => logs.push(m), { mood: 'neutral' });
    expect(hit.dodged).toBe(true);
    expect(logs.some(l => l.includes('dodge'))).toBe(true);
  });
});
