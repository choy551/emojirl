import { describe, expect, it, vi } from 'vitest';
import type { EmojiItem, Player, PlayerStats } from './types';
import {
  applyPlayerHeal,
  applyShrineBlessing,
  applySoulHp,
  healHp,
  livingMaxHp,
} from './inventory';
import { applyLevelUp } from './playerTurn';
import { applyBedRest, BED_OVERHEAL_MULT } from './sleep';
import { reclaimVoidSlotPressure } from './voidSlotBurden';

/** Alex (Ranger LV27, Floor 26): raw DEF 137, base max 585, overflow +234, pool 819. */
const ALEX_DEF = 137;
const ALEX_BASE = 585;
const ALEX_POOL = 819;

function makePlayer(stats: Partial<PlayerStats>, characterClass = '🏹'): Player {
  const baseStats: PlayerStats = {
    hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 1, evasion: 0,
    luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
  };
  return {
    pos: { x: 1, y: 1 },
    emoji: characterClass,
    characterClass,
    ammo: 0,
    stats: { ...baseStats, ...stats },
    inventory: [],
    bank: [],
    equipment: {},
  } as Player;
}

function alex(hp: number): Player {
  return makePlayer({ hp, maxHp: ALEX_BASE, defense: ALEX_DEF, level: 27 }, '🏹');
}

function bolt(): EmojiItem {
  return { id: 'bolt', emoji: '⚡', name: 'Bolt', description: 'soul', consumed: false };
}

describe('living pool', () => {
  it('counts DEF overflow in the effective max and leaves the stored max as the base', () => {
    const player = alex(ALEX_POOL);
    expect(livingMaxHp(player)).toBe(ALEX_POOL);
    expect(player.stats.maxHp).toBe(ALEX_BASE);
    expect(ALEX_POOL - ALEX_BASE).toBe(234);
  });
});

describe('healHp', () => {
  it('fills to the pool and never lowers current HP', () => {
    expect(healHp(100, ALEX_POOL)).toBe(ALEX_POOL);
    expect(healHp(ALEX_POOL, ALEX_POOL)).toBe(ALEX_POOL);
    expect(healHp(900, ALEX_POOL)).toBe(900);
  });

  it('adds a partial heal up to the pool and leaves overheal alone', () => {
    expect(healHp(800, ALEX_POOL, 50)).toBe(ALEX_POOL);
    expect(healHp(700, ALEX_POOL, 10)).toBe(710);
    expect(healHp(ALEX_POOL, ALEX_POOL, 50)).toBe(ALEX_POOL);
    expect(healHp(900, ALEX_POOL, 50)).toBe(900);
    expect(healHp(100, ALEX_POOL, 0)).toBe(100);
    expect(healHp(100, ALEX_POOL, -5)).toBe(100);
  });
});

describe('Cute Fairy full heal', () => {
  it('keeps 819/819 when DEF overflow is the gap between base max and the pool', () => {
    const healed = applyPlayerHeal(alex(ALEX_POOL));
    expect(healed.stats.hp).toBe(ALEX_POOL);
    expect(healed.stats.maxHp).toBe(ALEX_BASE);
  });

  it('fills a wounded player to the living pool, not the base max', () => {
    expect(applyPlayerHeal(alex(100)).stats.hp).toBe(ALEX_POOL);
  });

  it('does not wipe true overheal above the living pool', () => {
    expect(applyPlayerHeal(alex(900)).stats.hp).toBe(900);
  });
});

describe('applyLevelUp full heal', () => {
  it('fills to the new living pool after the base max HP bump', () => {
    const log = vi.fn();
    const full = applyLevelUp(alex(ALEX_POOL), 1, 2, log);
    expect(full.stats.maxHp).toBe(588);
    expect(livingMaxHp(full)).toBe(822);
    expect(full.stats.hp).toBe(822);

    const wounded = applyLevelUp(alex(400), 1, 2, log);
    expect(wounded.stats.hp).toBe(822);

    const over = applyLevelUp(alex(900), 1, 2, log);
    expect(over.stats.hp).toBe(900);
  });
});

describe('soul consumes', () => {
  it('heals a Heart toward the new living pool instead of the base max', () => {
    const heart = { maxHpBonus: 3, hpBonus: 3 };
    const full = applySoulHp(alex(ALEX_POOL), heart);
    expect(full.stats.maxHp).toBe(588);
    expect(livingMaxHp(full)).toBe(822);
    expect(full.stats.hp).toBe(822);

    const wounded = applySoulHp(alex(400), heart);
    expect(wounded.stats.hp).toBe(403);
    expect(wounded.stats.maxHp).toBe(588);

    const over = applySoulHp(alex(900), heart);
    expect(over.stats.hp).toBe(900);
  });

  it('applies a DEF bump before the HP heal so overflow is part of the cap', () => {
    const ball = { defenseBonus: 1, hpBonus: 2 };
    const full = applySoulHp(alex(ALEX_POOL), ball);
    expect(full.stats.defense).toBe(ALEX_DEF + 1);
    expect(livingMaxHp(full)).toBe(821);
    expect(full.stats.hp).toBe(821);
  });
});

describe('shrine blessing', () => {
  it('fills to the new living pool and keeps HP that was already above it', () => {
    expect(applyShrineBlessing(alex(ALEX_POOL), 2, false).stats.hp).toBe(821);
    expect(applyShrineBlessing(alex(400), 2, false).stats.hp).toBe(821);
    expect(applyShrineBlessing(alex(700), 2, false).stats.hp).toBe(821);
    const over = applyShrineBlessing(alex(900), 2, false);
    expect(over.stats.maxHp).toBe(587);
    expect(livingMaxHp(over)).toBe(821);
    expect(over.stats.hp).toBe(902);
  });

  it('heals an arcane shrine up to the living pool without raising max HP', () => {
    const full = applyShrineBlessing(alex(ALEX_POOL), 2, true);
    expect(full.stats.hp).toBe(ALEX_POOL);
    expect(full.stats.maxHp).toBe(ALEX_BASE);
    expect(full.stats.maxMana).toBe(5);
    expect(full.stats.mana).toBe(5);

    expect(applyShrineBlessing(alex(400), 2, true).stats.hp).toBe(402);
    expect(applyShrineBlessing(alex(900), 2, true).stats.hp).toBe(900);
  });
});

describe('other heals against the living pool', () => {
  it('does not pull bed overheal down when HP is already above 200%', () => {
    const rested = applyBedRest(makePlayer({ hp: 100, maxHp: 10 }));
    expect(rested.stats.hp).toBe(100);
    const wounded = applyBedRest(makePlayer({ hp: 4, maxHp: 10 }));
    expect(wounded.stats.hp).toBe(10 * BED_OVERHEAL_MULT);
  });

  it('void reclaim heals toward the living pool and does not wipe overheal', () => {
    const burden = [{ itemId: 'bolt', dealt: 40 }, ...Array.from({ length: 8 }, () => ({ itemId: null, dealt: 0 }))];
    const wounded = makePlayer(
      { hp: 800, maxHp: ALEX_BASE, defense: ALEX_DEF },
      '👤',
    );
    wounded.inventory = [bolt()];
    wounded.voidSlotBurden = burden;
    const reclaim = reclaimVoidSlotPressure(wounded, bolt());
    expect(reclaim.heal).toBe(19);
    expect(reclaim.player.stats.hp).toBe(ALEX_POOL);
    expect(reclaim.log).toBe('👤 Released ⚡, reclaimed 19 HP');

    const over = makePlayer({ hp: 900, maxHp: ALEX_BASE, defense: ALEX_DEF }, '👤');
    over.inventory = [bolt()];
    over.voidSlotBurden = burden.map(row => ({ ...row }));
    const kept = reclaimVoidSlotPressure(over, bolt());
    expect(kept.heal).toBe(0);
    expect(kept.player.stats.hp).toBe(900);
    expect(kept.log).toBeNull();
  });
});
