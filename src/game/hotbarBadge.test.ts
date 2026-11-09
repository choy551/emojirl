import { describe, expect, it } from 'vitest';
import { EMOJI_POWERS } from './emojis';
import { STACKABLE_BAG_CAPS, hotbarCountBadge, isStackableBagPassive } from './passives';
import type { EmojiItem } from './types';

function soul(emoji: string, stackCount?: number): EmojiItem {
  const power = EMOJI_POWERS.find(entry => entry.emoji === emoji);
  if (!power) throw new Error(`missing soul ${emoji}`);
  return { ...power, id: emoji, consumed: false, ...(stackCount ? { stackCount } : {}) };
}

/** Souls the Emoji Rework stacks. Pill was the reported blue +N. */
const REWORK_STACKS = ['💊', '👑', '🌟', '🔥', '❤️', '🍄', '🦋', '💎', '🛡️'] as const;

describe('hotbar count badge', () => {
  it('shows only green ×N below the stack cap, even with bank extras', () => {
    for (const emoji of REWORK_STACKS) {
      const one = hotbarCountBadge(soul(emoji), 4);
      expect(isStackableBagPassive(soul(emoji)), emoji).toBe(true);
      expect(one, emoji).toEqual([{ place: 'stack', label: '×1', className: 'text-emerald-400' }]);
      expect(hotbarCountBadge(soul(emoji, 3), 4).map(b => b.label), emoji).toEqual(['×3']);
    }
  });

  it('shows green ×N and blue +N together once the stack is full', () => {
    for (const emoji of ['🔥', '💊', '❤️', '🌟', '👑'] as const) {
      const cap = STACKABLE_BAG_CAPS[emoji];
      expect(hotbarCountBadge(soul(emoji, cap), 2), emoji).toEqual([
        { place: 'stack', label: `×${cap}`, className: 'text-emerald-400' },
        { place: 'bank', label: '+2', className: 'text-sky-400' },
      ]);
    }
  });

  it('derives the badge from every stack cap, and keeps +N for a non-stackable', () => {
    for (const emoji of Object.keys(STACKABLE_BAG_CAPS)) {
      const power = EMOJI_POWERS.find(entry => entry.emoji === emoji);
      expect(power, emoji).toBeTruthy();
      expect(hotbarCountBadge(soul(emoji), 2).map(b => b.place), emoji).toEqual(['stack']);
    }
    expect(hotbarCountBadge(soul('🌙'), 2)).toEqual([{ place: 'bank', label: '+2', className: 'text-sky-400' }]);
    expect(hotbarCountBadge(soul('🌙'), 0)).toEqual([]);
  });
});
