import { describe, it, expect } from 'vitest';
import { soulHelpText, applySoulCatalogCopy } from './emojis';

describe('soul catalog copy skips gear that shares an emoji', () => {
  it('keeps Precision Bow off the Bullseye soul line', () => {
    const bow = {
      emoji: '🎯', name: 'Precision Bow', isEquipment: true,
      description: '+2 ATK, +3 LCK · Bag: true aim',
    };
    expect(soulHelpText(bow).description).toBe('Ranger main hand: +3 ATK, +3 LCK. Better crits at range.');
    expect(applySoulCatalogCopy(bow).description).toBe('Ranger main hand: +3 ATK, +3 LCK. Better crits at range.');
    expect(soulHelpText({ emoji: '🎯', description: 'old', bagPassive: { description: 'old' } }).description)
      .toContain('Bag: true aim');
  });

  it('keeps ninja blades off the Dagger ninja-combo line', () => {
    for (const name of ['Assassin Blade', 'Duelist Blade', 'Shadow Dagger'] as const) {
      const blade = {
        emoji: '🗡️', name, isEquipment: true,
        description: '+4 ATK, +3 SPD · Bag: Ninja-only ninja combo (stacks)',
      };
      const text = soulHelpText(blade).description;
      expect(text).not.toContain('ninja combo');
      expect(text).toContain(name === 'Assassin Blade' ? '+4 ATK, +1 SPD' : 'Ninja main/off-hand');
      expect(applySoulCatalogCopy(blade).description).toBe(text);
    }
    expect(soulHelpText({ emoji: '🗡️', description: 'old' }).description).toContain('ninja combo');
  });

  it('keeps fire and ice arrows off the soul lines', () => {
    expect(soulHelpText({
      emoji: '🔥', name: 'Fire Arrows', isEquipment: true, description: 'wrong',
    }).description).toContain('ranged hits ignite');
    expect(soulHelpText({
      emoji: '🧊', name: 'Ice Arrows', isEquipment: true, description: 'wrong',
    }).description).toContain('ranged hits slow');
  });
});
