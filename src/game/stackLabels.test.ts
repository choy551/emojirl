import { describe, expect, it } from 'vitest';
import { EMOJI_POWERS } from './emojis';
import { getStackableCumulativeLabel } from './passives';
import type { EmojiItem } from './types';

function stacked(emoji: string, n: number): EmojiItem {
  const power = EMOJI_POWERS.find(entry => entry.emoji === emoji);
  if (!power) throw new Error(emoji);
  return { ...power, id: emoji, consumed: false, stackCount: n };
}

describe('stacking passive labels', () => {
  it('names the flat heal and the percent term at the current stack', () => {
    expect(getStackableCumulativeLabel(stacked('🍄', 3))).toBe('+3 HP per kill + (0.1% max HP × depth × 3)');
    expect(getStackableCumulativeLabel(stacked('❤️', 2))).toBe('+2 HP per hit + (1% ATK × depth × 2)');
    expect(getStackableCumulativeLabel(stacked('🦋', 4))).toBe('+4 HP on dodge + (0.1% max HP × depth × 4)');
    expect(getStackableCumulativeLabel(stacked('💎', 2))).toBe('+2 reflect + (1% ATK × depth × 2)');
    expect(getStackableCumulativeLabel(stacked('🛡️', 3))).toBe('25% block, −3 dmg + (0.2% DEF × depth × 3)');
    expect(getStackableCumulativeLabel(stacked('💊', 5))).toBe('10% max HP every 5 turns');
    expect(getStackableCumulativeLabel(stacked('🔥', 3))).toContain('3×depth');
    expect(getStackableCumulativeLabel(stacked('⚡', 2))).toBe('100% / 75% / 50% ATK arcs');
    expect(getStackableCumulativeLabel(stacked('🍀', 2))).toContain('% drop chance');
  });
});
