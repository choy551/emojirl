import { describe, expect, it } from 'vitest';
import { formatHitBreakdown } from './hitLog';

describe('formatHitBreakdown', () => {
  it('sums components on one line and marks each crit', () => {
    expect(formatHitBreakdown([
      { name: 'Claw', damage: 12, crit: true },
      { name: 'Claw', damage: 11 },
      { name: 'Bite', damage: 6 },
    ], 'Orc')).toBe('Claw 12 crit + Claw 11 + Bite 6 = 29 to Orc');
  });

  it('keeps a single hit on its old line', () => {
    expect(formatHitBreakdown([
      { name: 'Hit', damage: 8, solo: 'You hit 👺 for 8 dmg' },
    ], 'Goblin')).toBe('You hit 👺 for 8 dmg');
  });

  it('lists different targets without a false total', () => {
    expect(formatHitBreakdown([
      { name: 'Shot', damage: 10, target: '👺 Goblin' },
      { name: 'Offhand', damage: 7, crit: true, target: '👹 Orc' },
    ])).toBe('Shot 10 to 👺 Goblin + Offhand 7 crit to 👹 Orc');
  });
});
