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
  it('shows green ×N for every rework stackable, including ×1, and never the blue +N', () => {
    for (const emoji of REWORK_STACKS) {
      const one = hotbarCountBadge(soul(emoji), 4);
      expect(isStackableBagPassive(soul(emoji)), emoji).toBe(true);
      expect(one, emoji).toEqual({ place: 'stack', label: '×1', className: 'text-emerald-400' });
      expect(hotbarCountBadge(soul(emoji, 3), 4)?.label, emoji).toBe('×3');
    }
  });

  it('derives the badge from every stack cap, and keeps +N for a non-stackable', () => {
    for (const emoji of Object.keys(STACKABLE_BAG_CAPS)) {
      const power = EMOJI_POWERS.find(entry => entry.emoji === emoji);
      expect(power, emoji).toBeTruthy();
      expect(hotbarCountBadge(soul(emoji), 2)?.place, emoji).toBe('stack');
    }
    const moon = hotbarCountBadge(soul('🌙'), 2);
    expect(moon).toEqual({ place: 'bank', label: '+2', className: 'text-sky-400' });
    expect(hotbarCountBadge(soul('🌙'), 0)).toBeNull();
  });
});
