import { describe, expect, it } from 'vitest';
import type { Player } from './types';
import {
  STAR_XP_TURNS,
  applyStarConsume,
  butterflyHeal,
  combinedIgniteStacks,
  diamondThorns,
  foeDetectionRadius,
  heartHeal,
  igniteAtkCapFraction,
  igniteDamagePerTurn,
  mushroomHeal,
  pillOverhealHp,
  pillRegenFraction,
  shieldReduction,
  starXpGain,
} from './emojiBalance';
import { xpThresholdForLevel } from './progression';

describe('fire ignite', () => {
  it('caps the ATK term from 100% at one stack to 200% at five', () => {
    expect(igniteAtkCapFraction(1)).toBe(1);
    expect(igniteAtkCapFraction(2)).toBe(1.25);
    expect(igniteAtkCapFraction(3)).toBe(1.5);
    expect(igniteAtkCapFraction(4)).toBe(1.75);
    expect(igniteAtkCapFraction(5)).toBe(2);
    expect(igniteAtkCapFraction(9)).toBe(2);
  });

  it('uses z × (depth + depth × 10% ATK), then caps the ATK term', () => {
    // z=1, depth=1, ATK=10: flat 1, ATK term 1, under the 100% cap.
    expect(igniteDamagePerTurn(1, 1, 10)).toBe(2);
    // z=1, depth=20, ATK=10: flat 20, uncapped ATK term 20 (200% ATK) capped at 100% = 10.
    expect(igniteDamagePerTurn(1, 20, 10)).toBe(30);
    // z=5, depth=20, ATK=10: flat 100, uncapped ATK term 100 capped at 200% = 20.
    expect(igniteDamagePerTurn(5, 20, 10)).toBe(120);
  });

  it('lets Fire Arrows add one stack and shares the cap of 5', () => {
    expect(combinedIgniteStacks(0, true)).toBe(1);
    expect(combinedIgniteStacks(4, true)).toBe(5);
    expect(combinedIgniteStacks(5, true)).toBe(5);
    expect(combinedIgniteStacks(2, false)).toBe(2);
  });
});

describe('depth-scaled bag passives', () => {
  it('keeps the old flat at low depth and adds the stated percent', () => {
    expect(heartHeal(1, 1, 10)).toBe(1);
    expect(heartHeal(5, 20, 15)).toBe(20);
    expect(mushroomHeal(1, 10, 50)).toBe(1);
    expect(butterflyHeal(5, 27, 100)).toBe(18);
    expect(diamondThorns(2, 10, 20)).toBe(6);
    expect(shieldReduction(3, 10, 8)).toBe(3);
    expect(shieldReduction(9, 27, 20)).toBe(18);
  });
});

describe('pill and star', () => {
  it('heals 5% at one stack and 10% at five, on a 5-turn clock', () => {
    expect(pillRegenFraction(1)).toBeCloseTo(0.05);
    expect(pillRegenFraction(5)).toBeCloseTo(0.1);
    expect(pillRegenFraction(8)).toBeCloseTo(0.1);
    expect(pillOverhealHp(80)).toBe(88);
  });

  it('grants a real level-up and +50% XP for 20 turns', () => {
    expect(starXpGain(5, 0)).toBe(5);
    expect(starXpGain(5, 3)).toBe(8);
    const logs: string[] = [];
    const player = {
      characterClass: '🧙',
      inventory: [],
      bank: [],
      equipment: {},
      ammo: 0,
      pos: { x: 0, y: 0 },
      stats: {
        hp: 3, maxHp: 8, attack: 3, defense: 0, speed: 1, evasion: 5, luck: 0,
        level: 1, xp: 0, moodValue: 0, gold: 0, mana: 4, maxMana: 4,
      },
    } as unknown as Player;
    const next = applyStarConsume(player, text => logs.push(text));
    expect(next.stats.level).toBe(2);
    expect(next.stats.hp).toBeGreaterThanOrEqual(next.stats.maxHp);
    expect(next.stats.xp).toBeGreaterThanOrEqual(xpThresholdForLevel(2));
    expect(next.stats.xpBoostTurns).toBe(STAR_XP_TURNS);
    expect(logs.some(line => line.includes('+50% XP'))).toBe(true);
  });

  it('adds sight per star and pulls the whole map at five', () => {
    expect(foeDetectionRadius(4, { stealthy: false, starStacks: 2, restaurant: false })).toBe(6);
    expect(foeDetectionRadius(4, { stealthy: true, starStacks: 2, restaurant: false })).toBe(4);
    expect(foeDetectionRadius(4, { stealthy: true, starStacks: 5, restaurant: false })).toBe(9999);
  });
});
