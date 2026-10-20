import { describe, expect, it, vi } from 'vitest';
import type { EmojiItem, Player } from './types';
import { isHealJunk, getItemSellValue } from './economy';
import { addToBag, sortBagSlots, countVoidPressureSlots } from './inventory';
import { getRandomFloorDrop } from './emojis';
import { getMood } from './moods';
import {
  DRINK_DROPS,
  DRINK_TIER_MP,
  DRINK_COWBOY_FLOOR_BONUS,
  DRINK_COWBOY_TURNS,
  DRINK_NINJA_STEALTH_TURNS,
  DRINK_RANGER_SURVIVALIST_BONUS,
  DRINK_RANGER_RECLAIM_CHANCE,
  DRINK_RANGER_TURNS,
  DRINK_VOID_IGNORED_SLOTS,
  DRINK_VOID_TURNS,
  DRINK_GENERIC_MOOD,
  DRINK_GENERIC_EVASION,
  DRINK_GENERIC_TURNS,
  RANGER_SURVIVALIST_SAVE_CHANCE,
  classDrinkEffects,
  applyDrinkToPlayer,
  pickDrink,
  advanceDrinkBuff,
  resolveRangedAmmoSpend,
  playerMood,
  cowboyCombatMoodValue,
  isDrinkStealthActive,
  rangerDrinkBonuses,
  effectiveVoidPressureSlots,
  getRandomDrinkDrop,
} from './drinks';

function player(over: Partial<Player> = {}, stats: Partial<Player['stats']> = {}): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 4,
    stats: {
      hp: 6, maxHp: 10, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
      mana: 1, maxMana: 8,
      ...stats,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  };
}

function drink(tier: 1 | 2 | 3 | 4, id = 'd'): EmojiItem {
  const src = DRINK_DROPS.find(d => d.drinkTier === tier)!;
  return { ...src, id, consumed: false };
}

describe('drink catalog', () => {
  it('includes juice, bubble tea, and beer, and never heals', () => {
    const emojis = DRINK_DROPS.map(d => d.emoji);
    expect(emojis).toEqual(expect.arrayContaining(['🧃', '🧋', '🍺']));
    for (const d of DRINK_DROPS) {
      expect(d.healAmount).toBeUndefined();
      expect(d.drinkTier).toBeGreaterThanOrEqual(1);
      expect(d.description).toMatch(/Never restores HP/);
    }
  });

  it('is not sell-junk', () => {
    for (const d of DRINK_DROPS) {
      const item = { ...d, id: d.emoji, consumed: false };
      expect(isHealJunk(item, false)).toBe(false);
      expect(isHealJunk(item, true)).toBe(false);
    }
  });

  it('sells on the food tier curve', () => {
    expect(getItemSellValue(drink(1))).toBe(DRINK_TIER_MP[1]);
    expect(getItemSellValue(drink(4))).toBe(DRINK_TIER_MP[4]);
  });

  it('can drop on the floor', () => {
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0.5).mockReturnValueOnce(0).mockReturnValue(0);
    const drop = getRandomFloorDrop();
    expect(drop.emoji).toBe('🧃');
    expect(drop.drinkTier).toBe(1);
    expect(drop.healAmount).toBeUndefined();
    expect(getRandomDrinkDrop().drinkTier).toBe(1);
    random.mockRestore();
  });
});

describe('applyDrinkToPlayer', () => {
  it('wizard MP follows food tiers and never changes HP', () => {
    const wiz = player({}, { hp: 4, mana: 0, maxMana: 20 });
    for (const tier of [1, 2, 3, 4] as const) {
      const out = applyDrinkToPlayer(wiz, drink(tier));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.player.stats.hp).toBe(4);
      expect(out.player.stats.mana).toBe(DRINK_TIER_MP[tier]);
    }
  });

  it('wizard caps at max MP and refuses a full bar', () => {
    const almost = applyDrinkToPlayer(player({}, { mana: 7, maxMana: 8, hp: 3 }), drink(4));
    expect(almost.ok).toBe(true);
    if (!almost.ok) return;
    expect(almost.player.stats.mana).toBe(8);
    expect(almost.player.stats.hp).toBe(3);
    expect(almost.log).toContain('+1 MP');

    const full = applyDrinkToPlayer(player({}, { mana: 8, maxMana: 8 }), drink(1));
    expect(full.ok).toBe(false);
    if (full.ok) return;
    expect(full.log).toBe('Already at full MP.');
  });

  it('ignores a healAmount stuck on a drink', () => {
    const poisoned = { ...drink(4), healAmount: 50 };
    const out = applyDrinkToPlayer(player({ characterClass: '🥷' }, { hp: 2 }), poisoned);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.player.stats.hp).toBe(2);
  });

  it('cowboy raises the mood floor without touching HP or mood value', () => {
    const cow = player({ characterClass: '🤠' }, { hp: 5, moodValue: 10 });
    const out = applyDrinkToPlayer(cow, drink(4));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.player.stats.hp).toBe(5);
    expect(out.player.stats.moodValue).toBe(10);
    expect(out.player.drinkBuff?.moodFloorBonus).toBe(DRINK_COWBOY_FLOOR_BONUS[4]);
    expect(out.player.drinkBuff?.turnsLeft).toBe(DRINK_COWBOY_TURNS[4]);
    expect(playerMood(out.player)).toBe('very_happy');
    expect(cowboyCombatMoodValue(out.player)).toBe(40 + DRINK_COWBOY_FLOOR_BONUS[4]);
  });

  it('ninja stealth is timed and does not heal', () => {
    const nin = player({ characterClass: '🥷' }, { hp: 7 });
    const out = applyDrinkToPlayer(nin, drink(2));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.player.stats.hp).toBe(7);
    expect(out.player.drinkBuff?.stealth).toBe(true);
    expect(out.player.drinkBuff?.turnsLeft).toBe(DRINK_NINJA_STEALTH_TURNS[2]);
    expect(isDrinkStealthActive(out.player)).toBe(true);
  });

  it('prestige classes drink like their base class and never heal', () => {
    const genie = applyDrinkToPlayer(player({ characterClass: '🧞‍♀️' }, { hp: 6, mana: 1, maxMana: 6 }), drink(1));
    expect(genie.ok).toBe(true);
    if (!genie.ok) return;
    expect(genie.player.stats.hp).toBe(6);
    expect(genie.player.stats.mana).toBe(1 + DRINK_TIER_MP[1]);
    expect(genie.player.drinkBuff).toBeUndefined();
    const genieFull = applyDrinkToPlayer(player({ characterClass: '🧞‍♀️' }, { hp: 6, mana: 6, maxMana: 6 }), drink(2));
    expect(genieFull.ok).toBe(false);

    const hitman = applyDrinkToPlayer(player({ characterClass: '🕴️' }, { hp: 5, moodValue: 0 }), drink(2));
    expect(hitman.ok).toBe(true);
    if (!hitman.ok) return;
    expect(hitman.player.stats.hp).toBe(5);
    expect(hitman.player.stats.moodValue).toBe(0);
    expect(hitman.player.drinkBuff?.moodFloorBonus).toBe(DRINK_COWBOY_FLOOR_BONUS[2]);
    expect(playerMood(hitman.player)).toBe('very_happy');
    expect(cowboyCombatMoodValue(hitman.player)).toBeUndefined();
    expect(playerMood(player({ characterClass: '🕴️' }, { hp: 5, moodValue: 0 }))).not.toBe('very_happy');

    const fencer = applyDrinkToPlayer(player({ characterClass: '🤺' }, { hp: 8 }), drink(1));
    expect(fencer.ok).toBe(true);
    if (!fencer.ok) return;
    expect(fencer.player.stats.hp).toBe(8);
    expect(isDrinkStealthActive(fencer.player)).toBe(true);
    expect(fencer.player.drinkBuff?.turnsLeft).toBe(DRINK_NINJA_STEALTH_TURNS[1]);

    const guard = applyDrinkToPlayer(player({ characterClass: '💂' }, { hp: 9 }), drink(3));
    expect(guard.ok).toBe(true);
    if (!guard.ok) return;
    expect(guard.player.stats.hp).toBe(9);
    expect(rangerDrinkBonuses(guard.player)).toEqual({
      survivalistBonus: DRINK_RANGER_SURVIVALIST_BONUS[3],
      arrowReclaimChance: DRINK_RANGER_RECLAIM_CHANCE[3],
    });
    expect(rangerDrinkBonuses(player({ characterClass: '💂' }, { hp: 9 }))).toEqual({
      survivalistBonus: 0,
      arrowReclaimChance: 0,
    });
  });

  it('ranger gets survivalist and reclaim numbers from the constants', () => {
    const ranger = player({ characterClass: '🧝' }, { hp: 9 });
    const out = applyDrinkToPlayer(ranger, drink(3));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.player.stats.hp).toBe(9);
    expect(out.player.drinkBuff?.survivalistBonus).toBe(DRINK_RANGER_SURVIVALIST_BONUS[3]);
    expect(out.player.drinkBuff?.arrowReclaimChance).toBe(DRINK_RANGER_RECLAIM_CHANCE[3]);
    expect(out.player.drinkBuff?.turnsLeft).toBe(DRINK_RANGER_TURNS[3]);
  });

  it('void ignores filled slots and does not heal', () => {
    const v = player({ characterClass: '👤' }, { hp: 8 });
    const out = applyDrinkToPlayer(v, drink(2));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.player.stats.hp).toBe(8);
    expect(out.player.drinkBuff?.voidSlotsIgnored).toBe(DRINK_VOID_IGNORED_SLOTS[2]);
    expect(out.player.drinkBuff?.turnsLeft).toBe(DRINK_VOID_TURNS[2]);
    expect(effectiveVoidPressureSlots(5, DRINK_VOID_IGNORED_SLOTS[2])).toBe(3);
    expect(effectiveVoidPressureSlots(1, 4)).toBe(0);
  });

  it('any other class gets a small mood and evasion buff', () => {
    const other = player({ characterClass: '🛡️' }, { hp: 4, moodValue: 0 });
    const out = applyDrinkToPlayer(other, drink(1));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.player.stats.hp).toBe(4);
    expect(out.player.stats.moodValue).toBe(DRINK_GENERIC_MOOD[1]);
    expect(out.player.drinkBuff?.evasionBonus).toBe(DRINK_GENERIC_EVASION[1]);
    expect(out.player.drinkBuff?.turnsLeft).toBe(DRINK_GENERIC_TURNS[1]);
  });

  it('replaces an older drink buff', () => {
    const cow = player({
      characterClass: '🤠',
      drinkBuff: { turnsLeft: 2, moodFloorBonus: 15, label: 'old' },
    });
    const out = applyDrinkToPlayer(cow, drink(2));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.player.drinkBuff?.moodFloorBonus).toBe(DRINK_COWBOY_FLOOR_BONUS[2]);
    expect(out.player.drinkBuff?.turnsLeft).toBe(DRINK_COWBOY_TURNS[2]);
  });
});

describe('pickDrink', () => {
  it('wizard low on MP takes the biggest drink', () => {
    const wiz = player({}, { mana: 0, maxMana: 8 });
    const inv = [drink(1, 'a'), drink(4, 'b'), drink(2, 'c')];
    expect(pickDrink(inv, wiz)?.it.id).toBe('b');
  });

  it('wizard near full MP takes the smallest drink that fits', () => {
    const wiz = player({}, { mana: 6, maxMana: 8 });
    const inv = [drink(4, 'beer'), drink(1, 'juice')];
    expect(pickDrink(inv, wiz)?.it.id).toBe('juice');
  });

  it('other classes save the strong drinks', () => {
    const cow = player({ characterClass: '🤠' });
    const inv = [drink(4, 'beer'), drink(2, 'soda'), drink(1, 'juice')];
    expect(pickDrink(inv, cow)?.it.id).toBe('juice');
  });
});

describe('drink duration and ammo', () => {
  it('the drink turn does not consume duration; the next turn does', () => {
    const buff = { turnsLeft: DRINK_NINJA_STEALTH_TURNS[1], justApplied: true, stealth: true, label: '🥷 Drink stealth' };
    const first = advanceDrinkBuff(buff);
    expect(first.expiredLabel).toBeUndefined();
    expect(first.buff?.turnsLeft).toBe(DRINK_NINJA_STEALTH_TURNS[1]);
    expect(first.buff?.justApplied).toBeUndefined();
    const second = advanceDrinkBuff(first.buff);
    expect(second.buff?.turnsLeft).toBe(DRINK_NINJA_STEALTH_TURNS[1] - 1);
  });

  it('expires when the last turn ends', () => {
    const done = advanceDrinkBuff({ turnsLeft: 1, label: 'gone', stealth: true });
    expect(done.buff).toBeUndefined();
    expect(done.expiredLabel).toBe('gone');
  });

  it('saves, reclaims, or spends an arrow', () => {
    const saved = resolveRangedAmmoSpend(RANGER_SURVIVALIST_SAVE_CHANCE, 0, 0.2, () => 0.1);
    expect(saved).toEqual({ saved: true, reclaimed: false, ammoDelta: 0 });

    let n = 0;
    const rolls = [0.9, 0.1];
    const reclaimed = resolveRangedAmmoSpend(RANGER_SURVIVALIST_SAVE_CHANCE, 0, 0.2, () => rolls[n++]);
    expect(reclaimed).toEqual({ saved: false, reclaimed: true, ammoDelta: 0 });

    n = 0;
    const spentRolls = [0.99, 0.99];
    const spent = resolveRangedAmmoSpend(0.5, 0.5, 0.2, () => spentRolls[n++]);
    expect(spent).toEqual({ saved: false, reclaimed: false, ammoDelta: -1 });

    const capped = resolveRangedAmmoSpend(0.5, 0.5, 0.2, () => 0.9);
    expect(capped.saved).toBe(true);
    expect(capped.ammoDelta).toBe(0);
  });
});

describe('drinks stay off the hotbar', () => {
  it('a full hotbar still accepts a drink, and Void pressure ignores it', () => {
    const souls = ['❤️', '🔥', '⚡', '💎', '🍀', '💀', '🌟', '🔮', '🧲'].map((emoji, i) => ({
      id: `s${i}`, emoji, name: emoji, description: 'soul', consumed: false,
      bagPassive: { description: 'x', nonStackable: true },
    }));
    const added = addToBag(souls, [], drink(1, 'juice'));
    expect(added.inventory.some(i => i.id === 'juice')).toBe(true);
    expect(added.bank.some(i => i.id === 'juice')).toBe(false);
    expect(sortBagSlots(added.inventory).some(i => i.drinkTier !== undefined)).toBe(false);
    const held = countVoidPressureSlots(player({ characterClass: '👤', inventory: added.inventory }));
    expect(held).toBe(9);
  });
});

describe('manual effect table', () => {
  it('names every class and says drinks do not restore HP', () => {
    const rows = classDrinkEffects();
    expect(rows.map(r => r.name)).toEqual([
      'Wizard', 'Genie', 'Cowboy', 'Levitating Hitman', 'Ninja', 'Fencer', 'Ranger', 'Royal Guard', 'The Void', 'Any other class',
    ]);
    for (const row of rows) expect(row.summary).toMatch(/No HP/);
    expect(rows[0].summary).toContain('2/3/6/8 MP');
  });
});

describe('cowboy mood floor', () => {
  it('a drink floor bonus can lift Happy to Very Happy', () => {
    expect(getMood(0, 10, 10, 0, true, 0)).toBe('happy');
    expect(getMood(0, 10, 10, 0, true, 40)).toBe('very_happy');
  });
});
