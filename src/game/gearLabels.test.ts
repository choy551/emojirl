import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Enemy, Player } from './types';
import { EQUIPMENT_DROPS } from './emojis';
import { formatGearBadgeList, formatGearCompact, formatGearProse } from './gearLabels';
import { applyEquippedAttack, applyEquippedReduction, applyEquipmentAndPassives } from './inventory';
import { applyGearAttack, applyGearReduction, GEAR_ATK_PERCENT, GEAR_DEF_PERCENT } from './softCap';
import { resolveCombat } from './combat';

function piece(name: string) {
  const found = EQUIPMENT_DROPS.find(item => item.name === name);
  if (!found?.equipBonus) throw new Error(`missing ${name}`);
  return found;
}

function hero(gear: Player['equipment']): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: gear,
    stats: {
      hp: 40, maxHp: 40, attack: 10, defense: 0, speed: 4, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
  };
}

function rat(over: Partial<Enemy> = {}): Enemy {
  return {
    id: 'rat', pos: { x: 1, y: 0 }, emoji: '🐀', name: 'Rat',
    hp: 400, maxHp: 400, attack: 100, defense: 0, speed: 1, engaged: true,
    ...over,
  };
}

function asItem(drop: ReturnType<typeof piece>, id: string) {
  return { ...drop, id, consumed: false };
}

describe('gear labels match combat math', () => {
  afterEach(() => vi.restoreAllMocks());

  it('labels Ward Shield as damage reduction and dodge, and combat uses those percents', () => {
    const ward = piece('Ward Shield');
    expect(ward.equipBonus).toEqual({ defense: 3, evasion: 3 });
    expect(formatGearCompact(ward.equipBonus)).toBe('+3%DR +3%dodge');
    expect(formatGearBadgeList(ward.equipBonus)).toEqual(['+3% DR', '+3% dodge']);
    expect(formatGearProse(ward.equipBonus)).toBe('+3% DR, +3% dodge');
    expect(ward.description).toContain('+3% DR, +3% dodge');
    expect(ward.equipBonus!.defense! * GEAR_DEF_PERCENT).toBe(3);
    expect(applyGearReduction(100, ward.equipBonus!.defense!)).toBe(97);

    const player = hero({ offHand: asItem(ward, 'ward') });
    const geared = applyEquipmentAndPassives(player);
    expect(geared.stats.evasion).toBe(3);
    expect(geared.stats.defense).toBe(0);
    expect(applyEquippedReduction(player, 100)).toBe(97);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const hit = resolveCombat(geared, rat(), () => {}, { mood: 'neutral' });
    expect(40 - hit.playerHp).toBe(applyGearReduction(100, 3));
  });

  it('labels Battle Medal as attack percent and damage reduction, and the hit uses both', () => {
    const medal = piece('Battle Medal');
    expect(medal.equipBonus).toEqual({ attack: 3, defense: 1 });
    expect(formatGearCompact(medal.equipBonus)).toBe('+6%ATK +1%DR');
    expect(formatGearBadgeList(medal.equipBonus)).toEqual(['+6% ATK', '+1% DR']);
    expect(medal.description).toContain('+6% ATK, +1% DR');
    expect(medal.equipBonus!.attack! * GEAR_ATK_PERCENT).toBe(6);
    expect(applyGearAttack(10, medal.equipBonus!.attack!)).toBe(11);
    expect(applyGearReduction(100, medal.equipBonus!.defense!)).toBe(99);

    const player = hero({ accessory: asItem(medal, 'medal') });
    const geared = applyEquipmentAndPassives(player);
    expect(geared.stats.attack).toBe(10);
    expect(geared.stats.defense).toBe(0);
    expect(applyEquippedAttack(player, 10)).toBe(11);
    let roll = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const value = roll === 0 ? 0 : 0.99;
      roll += 1;
      return value;
    });
    const hit = resolveCombat(geared, rat({ attack: 100, hp: 50, maxHp: 50 }), () => {}, { mood: 'neutral', noCounter: true });
    expect(50 - hit.enemyHp).toBe(applyGearAttack(10, 3));
  });
});
