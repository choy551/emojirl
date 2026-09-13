import { describe, it, expect } from 'vitest';
import { isHostileCombatTarget, skullCritBonus } from './combat';

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
