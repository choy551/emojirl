import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Enemy, Player } from './types';
import {
  CRIT_SOFT_CAP,
  DEF_SOFT_CAP,
  EVA_SOFT_CAP,
  LCK_SOFT_CAP,
  SPD_SOFT_CAP,
  accuracyScore,
  applyGearAttack,
  applyGearReduction,
  effectiveCrit,
  gearAttackPercent,
  gearDamageReduction,
  goldWithLuck,
  hitChance,
  resolveSoftCap,
  softCapBonusLines,
  softCapRulesBlurb,
  type SoftCapInput,
} from './softCap';
import { applyEquipmentAndPassives, diminishStatPiles, gearStatPoints, livingMaxHp } from './inventory';
import { resolveCombat } from './combat';
import { applyOverhealDecay, levelUpEmojiCount } from './playerTurn';
import { notePrestigeKill, contractGold } from './prestige';
import { HITMAN, HITMAN_CONTRACT_KILLS } from './prestigeConstants';
import { floorAttackBonus, floorHpMultiplier, mobEvasion } from './spawning';

function stats(over: Partial<SoftCapInput> = {}): SoftCapInput {
  return { attack: 4, defense: 0, speed: 2, evasion: 0, luck: 0, maxHp: 10, ...over };
}

function hero(over: Partial<Player['stats']> = {}, extra: Partial<Player> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '⚔️',
    characterClass: '⚔️',
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: {},
    stats: {
      hp: 40, maxHp: 40, attack: 10, defense: 0, speed: 4, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
      ...over,
    },
    ...extra,
  };
}

function rat(over: Partial<Enemy> = {}): Enemy {
  return {
    id: 'rat', pos: { x: 1, y: 0 }, emoji: '🐀', name: 'Rat',
    hp: 400, maxHp: 400, attack: 1, defense: 0, speed: 1, engaged: true,
    ...over,
  };
}

function scriptedRandom(values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)] ?? 0);
}

describe('resolveSoftCap', () => {
  it('leaves stats inside the caps unchanged and does not convert them', () => {
    const result = resolveSoftCap(stats({ attack: 6, defense: 50, speed: 8, evasion: 50, luck: 50, maxHp: 12 }));
    expect(result.attack).toBe(6);
    expect(result.defense).toBe(50);
    expect(result.speed).toBe(8);
    expect(result.evasion).toBe(50);
    expect(result.luck).toBe(50);
    expect(result.maxHp).toBe(12);
    expect(result.crit).toBe(55);
    expect(result.critDamagePct).toBe(0);
    expect(result.magicFindPct).toBe(0);
    expect(result.accuracyFromSpeed).toBe(0);
    expect(result.goldBonusPct).toBe(0);
    expect(result.bonuses.atkFromCrit).toBe(0);
    expect(result.bonuses.evaFromSpd).toBe(0);
    expect(result.bonuses.spdFromEva).toBe(0);
  });

  it('converts overflow into crit damage, max HP, magic find, and accuracy', () => {
    const result = resolveSoftCap(stats({
      defense: DEF_SOFT_CAP + 45,
      evasion: EVA_SOFT_CAP + 41,
      speed: SPD_SOFT_CAP + 12,
      luck: LCK_SOFT_CAP + 61,
      maxHp: 15,
      attack: 7,
    }));
    expect(result.defense).toBe(DEF_SOFT_CAP);
    expect(result.bonuses.maxHpFromDef).toBe(2);
    expect(result.maxHp).toBe(17);
    expect(result.speed).toBe(SPD_SOFT_CAP + 12);
    expect(result.accuracyFromSpeed).toBe(2);
    expect(result.evasion).toBe(EVA_SOFT_CAP + 41);
    expect(result.bonuses.critDamageFromEva).toBe(2);
    expect(result.luck).toBe(LCK_SOFT_CAP);
    expect(result.magicFindPct).toBe(2);
    expect(result.rawCrit).toBe(5 + LCK_SOFT_CAP + 61);
    expect(result.crit).toBe(CRIT_SOFT_CAP);
    expect(result.bonuses.critDamageFromCrit).toBe(Math.floor((result.rawCrit - CRIT_SOFT_CAP) / 10));
    expect(result.attack).toBe(7);
    expect(result.bonuses.evaFromSpd).toBe(0);
    expect(result.bonuses.atkFromCrit).toBe(0);

    const partial = resolveSoftCap(stats({ evasion: 69, luck: 79, defense: 69, speed: 12 }));
    expect(partial.bonuses.critDamageFromEva).toBe(0);
    expect(partial.magicFindPct).toBe(0);
    expect(partial.bonuses.maxHpFromDef).toBe(0);
    expect(partial.accuracyFromSpeed).toBe(0);
  });

  it('does not turn speed into evasion or crit into attack', () => {
    const fast = resolveSoftCap(stats({ speed: 100, evasion: 0, luck: 200, attack: 4 }));
    expect(fast.speed).toBe(100);
    expect(fast.evasion).toBe(0);
    expect(fast.attack).toBe(4);
    expect(fast.crit).toBe(CRIT_SOFT_CAP);
    expect(effectiveCrit(200)).toBe(CRIT_SOFT_CAP);
    expect(fast.bonuses.atkFromCrit).toBe(0);
  });

  it('does not scale gold with luck', () => {
    expect(goldWithLuck(100, 80)).toBe(100);
    expect(goldWithLuck(0, 80)).toBe(0);
    expect(goldWithLuck(-5, 80)).toBe(-5);
  });

  it('describes the new overflow for the HUD and RTFM', () => {
    const result = resolveSoftCap(stats({ speed: 18, evasion: 90, defense: 90, luck: 110, attack: 3, maxHp: 8 }));
    const lines = softCapBonusLines(result);
    expect(lines).toContain('+2 ACC from SPD above 8');
    expect(lines).toContain('+2% crit damage from EVA above 50');
    expect(lines).toContain('+2 max HP from DEF above 50');
    expect(lines).toContain('+2% magic find from LCK above 50');
    const blurb = softCapRulesBlurb();
    expect(blurb).toContain('+2% damage');
    expect(blurb).toContain('does not add EVA');
    expect(blurb).toContain('magic find');
    expect(blurb).not.toContain('gold');
  });
});

describe('gear percents and hit chance', () => {
  it('turns gear points into percents and clamps the hit roll', () => {
    expect(gearAttackPercent(5)).toBe(10);
    expect(gearAttackPercent(1)).toBe(2);
    expect(applyGearAttack(20, 5)).toBe(22);
    expect(gearDamageReduction(60)).toBe(50);
    expect(gearDamageReduction(12)).toBe(12);
    expect(applyGearReduction(40, 60)).toBe(20);
    expect(accuracyScore(0, 8)).toBe(90);
    expect(accuracyScore(5, 18)).toBe(97);
    expect(hitChance(90, 0)).toBe(90);
    expect(hitChance(90, 100)).toBe(5);
    expect(hitChance(200, 0)).toBe(99);
  });

  it('applies gear attack after the hit is totaled, not by raising ATK', () => {
    const player = hero({ attack: 10 }, {
      equipment: {
        mainHand: {
          id: 'sword', emoji: '⚔️', name: 'Sword', description: '', consumed: false,
          equipBonus: { attack: 5 },
        },
      },
    });
    const geared = applyEquipmentAndPassives(player);
    expect(geared.stats.attack).toBe(10);
    expect(gearStatPoints(player).attack).toBe(5);
    scriptedRandom([0, 0.99, 0.99]);
    const hit = resolveCombat(geared, rat(), () => {}, { mood: 'neutral' });
    expect(400 - hit.enemyHp).toBe(applyGearAttack(10, 5));
  });

  it('keeps gear defense off the DEF stat and off the overflow HP pool', () => {
    const player = hero({ defense: 40, maxHp: 20, hp: 20 }, {
      equipment: {
        body: {
          id: 'mail', emoji: '🦺', name: 'Mail', description: '', consumed: false,
          equipBonus: { defense: 30 },
        },
      },
    });
    const geared = applyEquipmentAndPassives(player);
    expect(geared.stats.defense).toBe(40);
    expect(livingMaxHp(player)).toBe(20);
    expect(gearDamageReduction(gearStatPoints(player).defense)).toBe(30);
  });
});

describe('bag passive piles', () => {
  it('stacks the same stat at 100%, then 75%, then 50%', () => {
    expect(diminishStatPiles([4])).toBe(4);
    expect(diminishStatPiles([4, 4])).toBe(7);
    expect(diminishStatPiles([2, 8, 4])).toBe(12);
    expect(diminishStatPiles([])).toBe(0);
  });
});

describe('mob scaling', () => {
  it('grows HP from D:4, attack every floor, and evasion by kind', () => {
    expect(floorHpMultiplier(1)).toBe(1);
    expect(floorHpMultiplier(3)).toBe(1);
    expect(floorHpMultiplier(4)).toBe(1.25);
    expect(floorHpMultiplier(33)).toBe(1 + 0.25 * 30);
    expect(floorHpMultiplier(40)).toBe(floorHpMultiplier(33));
    expect(floorAttackBonus(1)).toBe(0);
    expect(floorAttackBonus(2)).toBeCloseTo(1.3);
    expect(mobEvasion(1, 'normal')).toBe(0);
    expect(mobEvasion(3, 'evasive')).toBe(0);
    expect(mobEvasion(4, 'normal')).toBe(1);
    expect(mobEvasion(30, 'normal')).toBe(25);
    expect(mobEvasion(80, 'evasive')).toBe(90);
    expect(mobEvasion(80, 'boss')).toBe(10);
  });
});

describe('level-up emoji', () => {
  it('grants an emoji every 3rd level, and a Wizard echo is the Spell Echo chance', () => {
    expect(levelUpEmojiCount('🧝', 2, () => 0)).toBe(0);
    expect(levelUpEmojiCount('🧝', 3, () => 0)).toBe(1);
    expect(levelUpEmojiCount('🧙', 3, () => 0.24)).toBe(2);
    expect(levelUpEmojiCount('🧙', 3, () => 0.25)).toBe(1);
    expect(levelUpEmojiCount('🧞‍♀️', 6, () => 0)).toBe(1);
  });
});

describe('soft caps in combat', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps crit overflow off the attack stat and on the crit multiplier', () => {
    scriptedRandom([0, 0, 0.99]);
    const geared = applyEquipmentAndPassives(hero({ attack: 10, luck: 105 }));
    expect(geared.stats.attack).toBe(10);
    const hit = resolveCombat(geared, rat(), () => {}, { mood: 'neutral' });
    expect(400 - hit.enemyHp).toBe(20);
  });

  it('mitigates with DEF up to 50 and adds HP only past that', () => {
    scriptedRandom([0, 0.99, 0.99]);
    const player = hero({ defense: 30, maxHp: 20, hp: 40, attack: 4 });
    const geared = applyEquipmentAndPassives(player);
    expect(geared.stats.defense).toBe(30);
    expect(livingMaxHp(player)).toBe(20);
    const hit = resolveCombat(geared, rat({ attack: 21 }), () => {}, { mood: 'neutral' });
    expect(40 - hit.playerHp).toBe(6);
  });

  it('does not let speed raise dodge', () => {
    scriptedRandom([0, 0.99, 0.05]);
    const fast = applyEquipmentAndPassives(hero({ speed: 13, evasion: 0 }));
    expect(fast.stats.speed).toBe(13);
    expect(fast.stats.evasion).toBe(0);
    const logs: string[] = [];
    resolveCombat(fast, rat({ attack: 5 }), m => logs.push(m), { mood: 'neutral' });
    expect(logs.some(l => l.includes('dodge'))).toBe(false);
  });

  it('counts gear EVA as dodge and not as defense or luck', () => {
    const player = hero({ evasion: 40, speed: 4 }, {
      drinkBuff: { turnsLeft: 3, evasionBonus: 15, label: 'test' },
      equipment: {
        accessory: {
          id: 'cloak', emoji: '🧥', name: 'Cloak', description: '', consumed: false,
          equipBonus: { evasion: 10, defense: 22, luck: 4 },
        },
      },
    });
    const caps = applyEquipmentAndPassives(player);
    expect(caps.stats.evasion).toBe(65);
    expect(caps.stats.speed).toBe(4);
    expect(caps.stats.defense).toBe(0);
    expect(caps.stats.maxHp).toBe(40);
    expect(caps.stats.luck).toBe(0);
    expect(gearStatPoints(player)).toMatchObject({ defense: 22, luck: 4, evasion: 10 });
  });

  it('does not decay HP that exists only because of DEF overflow', () => {
    const player = hero({ defense: 90, maxHp: 10, hp: 11, overhealDecayTick: 4 });
    expect(livingMaxHp(player)).toBe(12);
    const held = applyOverhealDecay(player, 3, player.pos, 'oh');
    expect(held.player).toBe(player);
    expect(held.float).toBeNull();

    const over = hero({ defense: 90, maxHp: 10, hp: 14, overhealDecayTick: 4 });
    const shed = applyOverhealDecay(over, 4, over.pos, 'oh');
    expect(shed.player.stats.hp).toBe(13);
    expect(shed.player.stats.maxHp).toBe(10);
  });

  it('pays contract gold without a luck bonus', () => {
    const player = hero({
      luck: 0,
      gold: 5,
      contractKills: HITMAN_CONTRACT_KILLS - 1,
      contractGoal: HITMAN_CONTRACT_KILLS,
      contractDone: false,
    }, { characterClass: HITMAN, emoji: HITMAN });
    const base = contractGold(1);
    const paid = notePrestigeKill(player, 1, 24);
    expect(paid.player.stats.gold).toBe(5 + base);
    expect(paid.logs[0]).toContain(`+${base} gold`);
  });
});
