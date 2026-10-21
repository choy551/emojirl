import { describe, it, expect, vi, afterEach } from 'vitest';
import { isHostileCombatTarget, skullCritBonus, resolveCombat } from './combat';
import { blinkStrikeMultiplierPercent, critStat } from './blinkStrike';
import type { Enemy, Player } from './types';

describe('isHostileCombatTarget', () => {
  it('treats untagged regular enemies as foes', () => {
    expect(isHostileCombatTarget({ engaged: false })).toBe(true);
    expect(isHostileCombatTarget({ tag: 'Hostile', engaged: false })).toBe(true);
  });

  it('skips companions, fairies, and unengaged neutrals', () => {
    expect(isHostileCombatTarget({ isRecruited: true, tag: 'Friendly' })).toBe(false);
    expect(isHostileCombatTarget({ isRecruited: true, tag: 'Hostile' })).toBe(false);
    expect(isHostileCombatTarget({ isRecruited: true, tag: 'Friendly', engaged: true })).toBe(false);
    expect(isHostileCombatTarget({ tag: 'Friendly' })).toBe(false);
    expect(isHostileCombatTarget({ tag: 'Neutral', engaged: false })).toBe(false);
  });

  it('allows neutrals only after they aggro', () => {
    expect(isHostileCombatTarget({ tag: 'Neutral', engaged: true })).toBe(true);
  });

  it('never targets arena spectators, even if flagged engaged', () => {
    expect(isHostileCombatTarget({ isSpectator: true, tag: 'Neutral', engaged: true })).toBe(false);
    expect(isHostileCombatTarget({ isSpectator: true })).toBe(false);
  });
});

function ninja(stats: Partial<Player['stats']> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🥷',
    characterClass: '🥷',
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: {},
    stats: {
      hp: 40, maxHp: 40, attack: 10, defense: 0, speed: 8, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
      ...stats,
    },
  };
}

function rat(stats: Partial<Enemy> = {}): Enemy {
  return {
    id: 'rat', pos: { x: 1, y: 0 }, emoji: '🐀', name: 'Rat',
    hp: 400, maxHp: 400, attack: 0, defense: 0, speed: 1, engaged: true,
    ...stats,
  };
}

function scriptedRandom(values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)] ?? 0);
}

describe('Blink Strike damage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('scales the hit with the soft-capped CRIT stat and doubles that on a crit', () => {
    expect(critStat(0)).toBe(5);
    expect(blinkStrikeMultiplierPercent(critStat(0))).toBe(210);
    const logs: string[] = [];
    scriptedRandom([0, 0.5, 0.99]);
    const plain = resolveCombat(ninja(), rat(), m => logs.push(m), { blinkStrike: true, mood: 'neutral' });
    expect(400 - plain.enemyHp).toBe(21);
    expect(logs.some(l => l.includes('CRITICAL'))).toBe(false);

    logs.length = 0;
    scriptedRandom([0, 0, 0.99]);
    const crit = resolveCombat(ninja(), rat(), m => logs.push(m), { blinkStrike: true, mood: 'neutral' });
    expect(400 - crit.enemyHp).toBe(42);
    expect(logs.some(l => l.includes('CRITICAL'))).toBe(true);
  });

  it('is 200% at 0 CRIT and 400% at the 99 CRIT soft cap', () => {
    expect(blinkStrikeMultiplierPercent(0)).toBe(200);
    expect(blinkStrikeMultiplierPercent(99)).toBe(400);
    expect(blinkStrikeMultiplierPercent(100)).toBe(400);
    expect(critStat(200)).toBe(99);
    scriptedRandom([0, 0.99, 0.99]);
    const capped = resolveCombat(ninja({ attack: 51, luck: 94 }), rat(), () => {}, { blinkStrike: true, mood: 'neutral' });
    const base = Math.round(51 * 400 / 100);
    expect(400 - capped.enemyHp).toBe(base);
    expect(base).toBe(51 * 4);
    scriptedRandom([0, 0, 0.99]);
    const crit = resolveCombat(ninja({ attack: 51, luck: 94 }), rat(), () => {}, { blinkStrike: true, mood: 'neutral' });
    expect(400 - crit.enemyHp).toBe(base * 2);
  });

  it('adds Heavier Blink as a +100 shift and keeps banked Overkill flat through a crit', () => {
    expect(blinkStrikeMultiplierPercent(critStat(0), ['heavier-blink'])).toBe(310);
    scriptedRandom([0, 0.99, 0.99]);
    const heavy = resolveCombat(ninja({ blinkTalents: ['heavier-blink'] }), rat(), () => {}, { blinkStrike: true, mood: 'neutral' });
    expect(400 - heavy.enemyHp).toBe(Math.round(10 * 310 / 100));

    scriptedRandom([0, 0.99, 0.99]);
    const bonus = resolveCombat(ninja(), rat(), () => {}, { blinkStrike: true, mood: 'neutral', bonusDamage: 20 });
    expect(400 - bonus.enemyHp).toBe(21 + 20);
    scriptedRandom([0, 0, 0.99]);
    const critBonus = resolveCombat(ninja(), rat(), () => {}, { blinkStrike: true, mood: 'neutral', bonusDamage: 20 });
    expect(400 - critBonus.enemyHp).toBe(42 + 20);
  });

  it('always hits with Blink Truestrike and leaves a miss untouched by banked damage', () => {
    const logs: string[] = [];
    scriptedRandom([0.99]);
    const miss = resolveCombat(ninja(), rat(), m => logs.push(m), { blinkStrike: true, mood: 'neutral', bonusDamage: 20 });
    expect(miss.enemyHp).toBe(400);
    expect(logs.some(l => l.includes('miss'))).toBe(true);

    logs.length = 0;
    scriptedRandom([0.99]);
    const sure = resolveCombat(
      ninja({ blinkTalents: ['blink-truestrike'] }),
      rat(),
      m => logs.push(m),
      { blinkStrike: true, mood: 'neutral' },
    );
    expect(400 - sure.enemyHp).toBe(21);
    expect(logs.some(l => l.includes('miss'))).toBe(false);
  });

  it('still applies the unaware Shadow Strike multiplier under the Blink multiplier', () => {
    scriptedRandom([0, 0.99, 0.99]);
    const hit = resolveCombat(ninja(), rat({ engaged: false }), () => {}, { blinkStrike: true, mood: 'neutral' });
    expect(400 - hit.enemyHp).toBe(Math.round(Math.round(10 * 2.1) * 1.6));
  });
});

describe('skullCritBonus', () => {
  it('is +25 at full HP, +50 at ≤25% HP, and interpolates in between', () => {
    expect(skullCritBonus(20, 20)).toBe(25);
    expect(skullCritBonus(5, 20)).toBe(50);
    expect(skullCritBonus(4, 20)).toBe(50);
    expect(skullCritBonus(0, 20)).toBe(50);
    expect(skullCritBonus(12.5, 20)).toBeCloseTo(37.5);
  });
});
