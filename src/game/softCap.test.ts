import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Enemy, Player } from './types';
import {
  CRIT_SOFT_CAP,
  DEF_SOFT_CAP,
  EVA_SOFT_CAP,
  LCK_SOFT_CAP,
  SPD_SOFT_CAP,
  effectiveCrit,
  goldWithLuck,
  resolveSoftCap,
  softCapBonusLines,
  softCapRulesBlurb,
  softCapTitles,
  type SoftCapInput,
} from './softCap';
import { applyEquipmentAndPassives, livingMaxHp } from './inventory';
import { resolveCombat } from './combat';
import { applyOverhealDecay } from './playerTurn';
import { notePrestigeKill, contractGold } from './prestige';
import { HITMAN, HITMAN_CONTRACT_KILLS } from './prestigeConstants';

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
  it('leaves stats inside the caps unchanged', () => {
    const result = resolveSoftCap(stats({ attack: 6, defense: 20, speed: 8, evasion: 50, luck: 20, maxHp: 12 }));
    expect(result.attack).toBe(6);
    expect(result.defense).toBe(20);
    expect(result.speed).toBe(8);
    expect(result.evasion).toBe(50);
    expect(result.luck).toBe(20);
    expect(result.maxHp).toBe(12);
    expect(result.crit).toBe(25);
    expect(result.goldBonusPct).toBe(0);
    expect(result.bonuses).toEqual({ atkFromCrit: 0, spdFromEva: 0, evaFromSpd: 0, maxHpFromDef: 0 });
  });

  it('converts each overflow at the stated rate and floors partial steps', () => {
    const result = resolveSoftCap(stats({
      defense: DEF_SOFT_CAP + 3,
      evasion: EVA_SOFT_CAP + 12,
      speed: SPD_SOFT_CAP + 4,
      luck: LCK_SOFT_CAP + 5,
      maxHp: 15,
      attack: 7,
    }));
    expect(result.defense).toBe(DEF_SOFT_CAP);
    expect(result.bonuses.maxHpFromDef).toBe(6);
    expect(result.maxHp).toBe(21);
    expect(result.bonuses.spdFromEva).toBe(2);
    expect(result.bonuses.evaFromSpd).toBe(8);
    expect(result.speed).toBe(SPD_SOFT_CAP + 2);
    expect(result.evasion).toBe(EVA_SOFT_CAP + 8);
    expect(result.luck).toBe(LCK_SOFT_CAP);
    expect(result.goldBonusPct).toBe(10);
    expect(result.rawCrit).toBe(5 + 25);
    expect(result.crit).toBe(30);
    expect(result.attack).toBe(7);

    const partial = resolveSoftCap(stats({ evasion: 54, luck: 21, defense: 20 }));
    expect(partial.bonuses.spdFromEva).toBe(0);
    expect(partial.speed).toBe(2);
    expect(partial.goldBonusPct).toBe(0);
    expect(partial.luck).toBe(20);
  });

  it('turns CRIT above 100 into attack and caps the crit stat', () => {
    const luck = 110;
    const result = resolveSoftCap(stats({ luck, attack: 9 }));
    expect(result.rawCrit).toBe(115);
    expect(result.crit).toBe(CRIT_SOFT_CAP);
    expect(effectiveCrit(luck)).toBe(CRIT_SOFT_CAP);
    expect(result.bonuses.atkFromCrit).toBe(3);
    expect(result.attack).toBe(12);
    expect(result.luck).toBe(LCK_SOFT_CAP);
  });

  it('evaluates SPD→EVA before EVA→SPD and does not convert the results back', () => {
    const looped = resolveSoftCap(stats({ speed: 100, evasion: 100, attack: 1 }));
    // Raw SPD 100 → +184 EVA, then raw EVA 100 → +10 SPD. Neither bonus feeds the other side.
    expect(looped.bonuses.evaFromSpd).toBe(184);
    expect(looped.bonuses.spdFromEva).toBe(10);
    expect(looped.speed).toBe(SPD_SOFT_CAP + 10);
    expect(looped.evasion).toBe(EVA_SOFT_CAP + 184);

    const speedOnly = resolveSoftCap(stats({ speed: 13, evasion: 0 }));
    expect(speedOnly.speed).toBe(SPD_SOFT_CAP);
    expect(speedOnly.evasion).toBe(10);

    const evaOnly = resolveSoftCap(stats({ speed: 0, evasion: 60 }));
    expect(evaOnly.evasion).toBe(EVA_SOFT_CAP);
    expect(evaOnly.speed).toBe(2);
  });

  it('scales gold gains and leaves non-gains alone', () => {
    expect(goldWithLuck(100, 20)).toBe(100);
    expect(goldWithLuck(100, 21)).toBe(100);
    expect(goldWithLuck(100, 22)).toBe(105);
    expect(goldWithLuck(40, 26)).toBe(46);
    expect(goldWithLuck(0, 40)).toBe(0);
    expect(goldWithLuck(-5, 40)).toBe(-5);
  });

  it('describes converted bonuses for the HUD and RTFM', () => {
    const result = resolveSoftCap(stats({ speed: 10, evasion: 60, defense: 22, luck: 24, attack: 3, maxHp: 8 }));
    const lines = softCapBonusLines(result);
    expect(lines).toContain('+4 EVA from SPD above 8');
    expect(lines).toContain('+2 SPD from EVA above 50');
    expect(lines).toContain('+4 max HP from DEF above 20');
    expect(lines).toContain('+10% gold from LCK above 20');
    const titles = softCapTitles(result);
    expect(titles.SPD).toContain('raw 10');
    expect(titles.EVA).toContain('+4 from SPD');
    expect(titles.HP).toContain('4 from DEF');
    expect(titles.LCK).toContain('+10% gold');
    const blurb = softCapRulesBlurb();
    expect(blurb).toContain('before');
    expect(blurb).toContain('do not convert back');
    expect(blurb).toContain('SPD above 8');
    expect(blurb).toContain('EVA above 50');
    expect(blurb).toContain('CRIT (5 + raw LCK) above 100');
    expect(blurb).toContain('LCK above 20');
    expect(blurb).toContain('DEF above 20');
  });
});

describe('soft caps in combat', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds CRIT overflow to the attack that actually lands', () => {
    scriptedRandom([0, 0, 0.99]);
    const geared = applyEquipmentAndPassives(hero({ attack: 10, luck: 105 }));
    expect(geared.stats.attack).toBe(12);
    expect(geared.stats.luck).toBe(105);
    const hit = resolveCombat(geared, rat(), () => {}, { mood: 'neutral' });
    expect(400 - hit.enemyHp).toBe(24);
  });

  it('mitigates with capped DEF and keeps the HP from the excess', () => {
    scriptedRandom([0, 0.99, 0.99]);
    const player = hero({ defense: 30, maxHp: 20, hp: 40, attack: 4 });
    const geared = applyEquipmentAndPassives(player);
    expect(geared.stats.defense).toBe(20);
    expect(geared.stats.maxHp).toBe(40);
    expect(livingMaxHp(player)).toBe(40);
    const hit = resolveCombat(geared, rat({ attack: 21 }), () => {}, { mood: 'neutral' });
    expect(40 - hit.playerHp).toBe(11);
  });

  it('lets Speed overflow raise dodge, and Evasion overflow slow a faster foe', () => {
    scriptedRandom([0, 0.99, 0.05]);
    const dodgy = applyEquipmentAndPassives(hero({ speed: 13, evasion: 0 }));
    expect(dodgy.stats.speed).toBe(8);
    expect(dodgy.stats.evasion).toBe(10);
    const logs: string[] = [];
    resolveCombat(dodgy, rat({ attack: 5 }), m => logs.push(m), { mood: 'neutral' });
    expect(logs.some(l => l.includes('dodge'))).toBe(true);

    logs.length = 0;
    scriptedRandom([0, 0.99, 0.99, 0]);
    const slow = applyEquipmentAndPassives(hero({ speed: 12, evasion: 0, hp: 40 }));
    expect(slow.stats.speed).toBe(8);
    resolveCombat(slow, rat({ speed: 9, attack: 1 }), m => logs.push(m), { mood: 'neutral' });
    expect(logs.some(l => l.startsWith('Fast!'))).toBe(true);
  });

  it('counts gear and drink EVA in the raw total before converting', () => {
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
    expect(caps.stats.evasion).toBe(50);
    expect(caps.stats.speed).toBe(4 + 3);
    expect(caps.stats.defense).toBe(20);
    expect(caps.stats.maxHp).toBe(44);
    expect(caps.stats.luck).toBe(4);
  });

  it('does not decay HP that exists only because of DEF overflow', () => {
    const player = hero({ defense: 25, maxHp: 10, hp: 16, overhealDecayTick: 4 });
    expect(livingMaxHp(player)).toBe(20);
    const held = applyOverhealDecay(player, 3, player.pos, 'oh');
    expect(held.player).toBe(player);
    expect(held.float).toBeNull();

    const over = hero({ defense: 25, maxHp: 10, hp: 22, overhealDecayTick: 4 });
    const shed = applyOverhealDecay(over, 4, over.pos, 'oh');
    expect(shed.player.stats.hp).toBe(21);
    expect(shed.player.stats.maxHp).toBe(10);
  });

  it('pays contract gold with the luck bonus', () => {
    const player = hero({
      luck: 0,
      gold: 5,
      contractKills: HITMAN_CONTRACT_KILLS - 1,
      contractGoal: HITMAN_CONTRACT_KILLS,
      contractDone: false,
    }, { characterClass: HITMAN, emoji: HITMAN });
    const base = contractGold(1);
    const paid = notePrestigeKill(player, 1, 24);
    expect(paid.player.stats.gold).toBe(5 + goldWithLuck(base, 24));
    expect(paid.logs[0]).toContain(`+${goldWithLuck(base, 24)} gold`);
  });
});
