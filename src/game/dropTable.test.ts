import { describe, expect, it } from 'vitest';
import {
  ACTIVE_DROPS,
  AMMO_DROP,
  BULLET_DROP,
  EMOJI_POWERS,
  EQUIPMENT_DROPS,
  HEAL_DROPS,
  MONEY_BAG,
  RAW_TO_COOKED,
} from './emojis';
import {
  BASE_TIER_WEIGHTS,
  CLOVER_TIER_STEP,
  COWBOY_BULLET_WEIGHT,
  COWBOY_DUAL_BULLET_WEIGHT,
  DROP_RARITIES,
  DROP_TABLE,
  QUIVER_WEIGHT,
  RANGER_QUIVER_WEIGHT,
  classModFor,
  cloverLootSummary,
  dropKindOf,
  enemyDropChance,
  entriesForRoll,
  entryDropWeight,
  rarityOfItem,
  rarityTooltipSuffix,
  rollFromDropTable,
  rollKillDrop,
  tierIndex,
  tierProbabilities,
  type DropEntry,
  type DropRarity,
  type DropRollContext,
} from './dropTable';

function key(entry: { kind: string; emoji: string }) {
  return `${entry.kind}:${entry.emoji}`;
}

/** Independent copy of the documented mass formula, so the roller cannot drift silently. */
function expectedMasses(clover: number, ctx: DropRollContext): Record<DropRarity, number> {
  const pool = entriesForRoll(ctx);
  const masses = Object.fromEntries(DROP_RARITIES.map(r => [r, 0])) as Record<DropRarity, number>;
  for (const rarity of DROP_RARITIES) {
    const peers = pool.filter(e => e.rarity === rarity);
    if (peers.length === 0) continue;
    const meanMod = peers.reduce((sum, entry) => sum + classModFor(entry, ctx), 0) / peers.length;
    const i = tierIndex(rarity);
    masses[rarity] = BASE_TIER_WEIGHTS[rarity] * CLOVER_TIER_STEP ** (i * clover) * meanMod;
  }
  return masses;
}

function expectedTierOdds(clover: number, ctx: DropRollContext): Record<DropRarity, number> {
  const masses = expectedMasses(clover, ctx);
  const total = DROP_RARITIES.reduce((sum, rarity) => sum + masses[rarity], 0);
  return Object.fromEntries(DROP_RARITIES.map(r => [r, masses[r] / total])) as Record<DropRarity, number>;
}

const neutral: DropRollContext = { playerClass: '🧙' };

describe('drop rarity catalog', () => {
  it('puts no item id in more than one tier', () => {
    const tierOf = new Map<string, string>();
    for (const row of DROP_TABLE) {
      const prev = tierOf.get(row.itemId);
      expect(prev, row.itemId).toBeUndefined();
      tierOf.set(row.itemId, row.rarity);
    }
    expect(tierOf.size).toBe(DROP_TABLE.length);
    for (const row of DROP_TABLE) {
      const tiers = new Set(DROP_TABLE.filter(e => e.itemId === row.itemId).map(e => e.rarity));
      expect(tiers.size).toBe(1);
      expect(tiers.has(row.rarity)).toBe(true);
    }
  });

  it('disambiguates shared emoji by item id', () => {
    const shared = ['🍄', '🔥', '🧊', '🏹', '🎯', '🔫', '🗡️'] as const;
    for (const emoji of shared) {
      const rows = DROP_TABLE.filter(e => e.emoji === emoji);
      expect(rows.length).toBeGreaterThan(1);
      expect(new Set(rows.map(e => e.itemId)).size).toBe(rows.length);
      for (const row of rows) {
        expect(DROP_TABLE.filter(e => e.itemId === row.itemId)).toHaveLength(1);
      }
    }
    expect(DROP_TABLE.find(e => e.itemId === 'heal:mushroom')?.rarity).toBe('common');
    expect(DROP_TABLE.find(e => e.itemId === 'soul:mushroom')?.rarity).toBe('uncommon');
    expect(DROP_TABLE.find(e => e.itemId === 'gear:fire-arrows')?.rarity).toBe('uncommon');
    expect(DROP_TABLE.find(e => e.itemId === 'soul:fire')?.rarity).toBe('rare');
    expect(DROP_TABLE.find(e => e.itemId === 'soul:ice')?.rarity).toBe('uncommon');
    expect(DROP_TABLE.find(e => e.itemId === 'gear:ice-arrows')?.rarity).toBe('uncommon');
    expect(DROP_TABLE.find(e => e.itemId === 'ammo:quiver')?.rarity).toBe('uncommon');
    expect(DROP_TABLE.find(e => e.itemId === 'gear:bow')?.rarity).toBe('rare');
    expect(DROP_TABLE.find(e => e.itemId === 'soul:target')?.rarity).toBe('rare');
    expect(DROP_TABLE.find(e => e.itemId === 'gear:aim-bow')?.rarity).toBe('rare');
    expect(DROP_TABLE.find(e => e.itemId === 'active:gun')?.rarity).toBe('rare');
    expect(DROP_TABLE.find(e => e.itemId === 'gear:revolver')?.rarity).toBe('rare');
    expect(DROP_TABLE.find(e => e.itemId === 'gear:dagger')?.rarity).toBe('rare');
    expect(DROP_TABLE.find(e => e.itemId === 'soul:dagger')?.rarity).toBe('legendary');
  });

  it('classifies every droppable emoji exactly once', () => {
    const expected = new Set<string>();
    for (const item of HEAL_DROPS) expected.add(`heal:${item.emoji}`);
    expected.add(`money:${MONEY_BAG.emoji}`);
    expected.add(`ammo:${AMMO_DROP.emoji}`);
    expected.add(`ammo:${BULLET_DROP.emoji}`);
    for (const item of ACTIVE_DROPS) expected.add(`active:${item.emoji}`);
    for (const item of EMOJI_POWERS) expected.add(`soul:${item.emoji}`);
    for (const emoji of new Set(EQUIPMENT_DROPS.map(item => item.emoji))) expected.add(`equipment:${emoji}`);
    for (const item of Object.values(RAW_TO_COOKED)) expected.add(`cooked:${item.emoji}`);

    const actual = DROP_TABLE.map(key);
    expect(new Set(actual).size).toBe(actual.length);
    expect(new Set(actual)).toEqual(expected);
  });

  it('puts the requested emoji on the low and high tiers', () => {
    expect(rarityOfItem({ emoji: '🧅', healAmount: 1 })).toBe('common');
    expect(rarityOfItem({ emoji: '🧪', healAmount: 6 })).toBe('common');
    expect(rarityOfItem({ emoji: '🫀', healAmount: 8 })).toBe('common');
    expect(rarityOfItem({ emoji: '💀', bagPassive: { execBlow: true } })).toBe('legendary');
    expect(rarityOfItem({ emoji: '💰', isMoneyBag: true })).toBe('legendary');
    expect(rarityOfItem({ emoji: '🍀', bagPassive: { bonusLoot: true } })).toBe('legendary');
  });

  it('does not let a shared emoji inherit the wrong kind', () => {
    expect(rarityOfItem({ emoji: '🍄', healAmount: 3 })).toBe('common');
    expect(rarityOfItem({ emoji: '🍄', bagPassive: { healOnKill: true } })).toBe('uncommon');
    expect(rarityOfItem({ emoji: '🏹', ammoAmount: 5 })).toBe('uncommon');
    expect(rarityOfItem({ emoji: '🏹', isEquipment: true })).toBe('rare');
    expect(rarityOfItem({ emoji: '🔫', activeKind: 'gun' })).toBe('rare');
    expect(rarityOfItem({ emoji: '🔫', isEquipment: true })).toBe('rare');
    expect(rarityOfItem({ emoji: '🗡️', bagPassive: { ninjaCombo: true } })).toBe('legendary');
    expect(rarityOfItem({ emoji: '🗡️', isEquipment: true })).toBe('rare');
    expect(rarityOfItem({ emoji: '🍏', healAmount: 4, isCooked: true })).toBe('uncommon');
    expect(dropKindOf({ emoji: '🍏', healAmount: 4, isCooked: true })).toBe('cooked');
  });

  it('shows rarity on tooltip text', () => {
    expect(rarityTooltipSuffix({ emoji: '🧅', healAmount: 1 })).toBe(' · Common');
    expect(rarityTooltipSuffix({ emoji: '🍀', bagPassive: {} })).toBe(' · Legendary');
    expect(rarityTooltipSuffix({ emoji: '❓' })).toBe('');
  });
});

describe('clover drop math', () => {
  it('keeps the audited drop chance, including the 95% cap', () => {
    expect(enemyDropChance(0)).toBeCloseTo(0.55);
    expect(enemyDropChance(1)).toBeCloseTo(0.70);
    expect(enemyDropChance(2)).toBeCloseTo(0.85);
    expect(enemyDropChance(3)).toBeCloseTo(0.95);
    expect(enemyDropChance(4)).toBeCloseTo(0.95);
    expect(cloverLootSummary(2)).toBe('85% drop chance · higher tiers ×2.25 per step');
  });

  it('matches mass_i = B_i * (3/2)^(i*c) * mean(classMod)', () => {
    for (const clover of [0, 1, 2, 3]) {
      const odds = tierProbabilities(clover, neutral);
      const expected = expectedTierOdds(clover, neutral);
      for (const rarity of DROP_RARITIES) {
        expect(odds[rarity]).toBeCloseTo(expected[rarity], 12);
      }
    }
  });

  it('shifts weight toward rarer tiers instead of only raising drop count', () => {
    const base = tierProbabilities(0, neutral);
    const one = tierProbabilities(1, neutral);
    const three = tierProbabilities(3, neutral);
    expect(base.common).toBeGreaterThan(base.uncommon);
    expect(base.uncommon).toBeGreaterThan(base.rare);
    expect(base.rare).toBeGreaterThan(base.legendary);

    expect(one.legendary).toBeGreaterThan(base.legendary);
    expect(one.common).toBeLessThan(base.common);
    expect(three.legendary).toBeGreaterThan(one.legendary);
    expect(three.rare).toBeGreaterThan(base.rare);
    expect(three.common).toBeLessThan(one.common);

    const chanceRatio = enemyDropChance(3) / enemyDropChance(0);
    const legendaryRatio = three.legendary / base.legendary;
    expect(legendaryRatio).toBeGreaterThan(chanceRatio);

    const perKill = (c: number) => enemyDropChance(c) * tierProbabilities(c, neutral).legendary;
    expect(perKill(3)).toBeGreaterThan(perKill(0) * chanceRatio);
  });

  it('rolls the documented tier distribution', () => {
    const samples = 8000;
    const counts: Record<DropRarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    for (let i = 0; i < samples; i++) {
      const item = rollFromDropTable({ clover: 2, playerClass: '🥷', floor: 1, rng: Math.random });
      const rarity = rarityOfItem(item);
      expect(rarity).toBeTruthy();
      counts[rarity!] += 1;
    }
    const expected = expectedTierOdds(2, { playerClass: '🥷' });
    for (const rarity of DROP_RARITIES) {
      expect(counts[rarity] / samples).toBeCloseTo(expected[rarity], 1);
    }
  });

  it('gives rangers and cowboys more of their ammo without leaving the table', () => {
    const pool = entriesForRoll({});
    const quiver = pool.find(e => e.kind === 'ammo' && e.emoji === '🏹') as DropEntry;
    const bullets = pool.find(e => e.kind === 'ammo' && e.emoji === '🪙') as DropEntry;
    expect(classModFor(quiver, { playerClass: '🧙' })).toBe(QUIVER_WEIGHT);
    expect(classModFor(quiver, { playerClass: '🧝' })).toBe(RANGER_QUIVER_WEIGHT);
    expect(classModFor(bullets, { playerClass: '🤠' })).toBe(COWBOY_BULLET_WEIGHT);
    expect(classModFor(bullets, { playerClass: '🤠', cowboyDualGuns: true })).toBe(COWBOY_DUAL_BULLET_WEIGHT);

    const weight = (entry: DropEntry, ctx: DropRollContext) => entryDropWeight(entry, 0, ctx, pool);
    expect(weight(quiver, { playerClass: '🧝' })).toBeGreaterThan(weight(quiver, { playerClass: '🧙' }));
    expect(weight(bullets, { playerClass: '🤠', cowboyDualGuns: true })).toBeGreaterThan(weight(bullets, { playerClass: '🥷' }));
  });

  it('bosses always drop a soul or a weapon, still shifted by clover', () => {
    const boss = { boss: true as const, playerClass: '🧝', cowboyDualGuns: true };
    const pool = entriesForRoll(boss);
    expect(pool.every(e => e.kind === 'soul' || e.kind === 'equipment')).toBe(true);
    expect(pool.some(e => e.emoji === '🧅')).toBe(false);
    expect(pool.some(e => e.emoji === '💰')).toBe(false);
    expect(classModFor(pool.find(e => e.emoji === '🏹' && e.kind === 'equipment')!, boss)).toBe(1);

    const base = tierProbabilities(0, boss);
    const stacked = tierProbabilities(3, boss);
    expect(base.common).toBe(0);
    expect(stacked.legendary).toBeGreaterThan(base.legendary);
    expect(stacked.common).toBe(0);

    for (let i = 0; i < 40; i++) {
      const item = rollKillDrop({ ...boss, clover: 1, floor: 12, rng: Math.random });
      expect(item).not.toBeNull();
      const kind = dropKindOf(item!);
      expect(kind === 'soul' || kind === 'equipment').toBe(true);
    }
  });

  it('can miss a non-boss drop, and a forced hit stays inside the table', () => {
    const miss = rollKillDrop({
      clover: 0,
      rng: () => 0.55,
    });
    expect(miss).toBeNull();
    const hit = rollKillDrop({
      clover: 0,
      floor: 1,
      playerClass: '🧙',
      rng: () => 0,
    });
    expect(hit).not.toBeNull();
    expect(rarityOfItem(hit!)).toBe('common');
  });
});
