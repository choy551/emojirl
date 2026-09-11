import { describe, it, expect } from 'vitest';
import { isHostileCombatTarget } from './combat';

describe('isHostileCombatTarget', () => {
  it('treats untagged regular enemies as foes', () => {
    expect(isHostileCombatTarget({ engaged: false })).toBe(true);
    expect(isHostileCombatTarget({ tag: 'Hostile', engaged: false })).toBe(true);
  });

  it('skips companions, fairies, and unengaged neutrals', () => {
    expect(isHostileCombatTarget({ isRecruited: true, tag: 'Friendly' })).toBe(false);
    expect(isHostileCombatTarget({ isRecruited: true, tag: 'Hostile' })).toBe(false);
    expect(isHostileCombatTarget({ tag: 'Friendly' })).toBe(false);
    expect(isHostileCombatTarget({ tag: 'Neutral', engaged: false })).toBe(false);
  });

  it('allows neutrals only after they aggro', () => {
    expect(isHostileCombatTarget({ tag: 'Neutral', engaged: true })).toBe(true);
  });
});
