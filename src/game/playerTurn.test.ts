import { describe, it, expect, vi } from 'vitest';
import { applyOverhealDecay, tickBlinkChainOutOfCombat, applyLevelUp } from './playerTurn';
import type { Player, PlayerStats } from './types';

function makePlayer(stats: Partial<PlayerStats>, characterClass = '🥷'): Player {
  const baseStats: PlayerStats = {
    hp: 10, maxHp: 10, attack: 1, defense: 1, speed: 1, evasion: 0,
    luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
  };
  return {
    pos: { x: 3, y: 4 },
    emoji: '🥷',
    characterClass,
    ammo: 0,
    stats: { ...baseStats, ...stats },
    inventory: [],
    bank: [],
    equipment: {},
  } as Player;
}

describe('applyOverhealDecay', () => {
  it('leaves player unchanged and emits no float when hp <= maxHp', () => {
    const p = makePlayer({ hp: 10, maxHp: 10, overhealDecayTick: 3 });
    const { player, float } = applyOverhealDecay(p, 5, p.pos, 'oh-decay');
    expect(float).toBeNull();
    expect(player).toBe(p); // same reference, no work done
  });

  it('increments the decay tick without shedding hp before the 5-turn threshold', () => {
    const p = makePlayer({ hp: 15, maxHp: 10, overhealDecayTick: 2 });
    const { player, float } = applyOverhealDecay(p, 7, p.pos, 'oh-decay');
    expect(float).toBeNull();
    expect(player.stats.hp).toBe(15);
    expect(player.stats.overhealDecayTick).toBe(3);
  });

  it('sheds 1 hp and resets the tick when the threshold is reached, emitting a float', () => {
    const p = makePlayer({ hp: 15, maxHp: 10, overhealDecayTick: 4 });
    const { player, float } = applyOverhealDecay(p, 9, p.pos, 'oh-decay');
    expect(player.stats.hp).toBe(14);
    expect(player.stats.overhealDecayTick).toBe(0);
    expect(float).not.toBeNull();
    expect(float!.id).toBe('oh-decay-9');
    expect(float!.text).toBe('-1 ✨');
    expect(float!.pos).toEqual({ x: 3, y: 4 });
  });

  it('does not overshoot below maxHp and emits no float on the final decay step', () => {
    const p = makePlayer({ hp: 11, maxHp: 10, overhealDecayTick: 4 });
    const { player, float } = applyOverhealDecay(p, 2, p.pos, 'oh-decay');
    expect(player.stats.hp).toBe(10);
    expect(player.stats.overhealDecayTick).toBe(0);
    expect(float).toBeNull(); // decayedHp is not > maxHp, so no float
  });

  it('uses the provided float id prefix (wait variant)', () => {
    const p = makePlayer({ hp: 20, maxHp: 10, overhealDecayTick: 4 });
    const { float } = applyOverhealDecay(p, 42, p.pos, 'oh-decay-wait');
    expect(float!.id).toBe('oh-decay-wait-42');
  });

  it('does not mutate the input player', () => {
    const p = makePlayer({ hp: 15, maxHp: 10, overhealDecayTick: 4 });
    applyOverhealDecay(p, 1, p.pos, 'oh-decay');
    expect(p.stats.hp).toBe(15);
    expect(p.stats.overhealDecayTick).toBe(4);
  });
});

describe('tickBlinkChainOutOfCombat', () => {
  it('returns non-ninjas unchanged', () => {
    const log = vi.fn();
    const p = makePlayer({ blinkStrikeInstakillOutOfCombat: 9, blinkStrikeInstakillChain: 3 }, '🧙');
    const out = tickBlinkChainOutOfCombat(p, false, log);
    expect(out).toBe(p);
    expect(log).not.toHaveBeenCalled();
  });

  it('resets the out-of-combat counter to 0 while in combat', () => {
    const log = vi.fn();
    const p = makePlayer({ blinkStrikeInstakillOutOfCombat: 7, blinkStrikeInstakillChain: 3 });
    const out = tickBlinkChainOutOfCombat(p, true, log);
    expect(out.stats.blinkStrikeInstakillOutOfCombat).toBe(0);
    expect(out.stats.blinkStrikeInstakillChain).toBe(3); // chain preserved in combat
    expect(log).not.toHaveBeenCalled();
  });

  it('counts up while out of combat below the threshold', () => {
    const log = vi.fn();
    const p = makePlayer({ blinkStrikeInstakillOutOfCombat: 3, blinkStrikeInstakillChain: 3 });
    const out = tickBlinkChainOutOfCombat(p, false, log);
    expect(out.stats.blinkStrikeInstakillOutOfCombat).toBe(4);
    expect(out.stats.blinkStrikeInstakillChain).toBe(3);
    expect(log).not.toHaveBeenCalled();
  });

  it('fades a chain of 2+ after 10 turns out of combat and logs', () => {
    const log = vi.fn();
    const p = makePlayer({ blinkStrikeInstakillOutOfCombat: 9, blinkStrikeInstakillChain: 2 });
    const out = tickBlinkChainOutOfCombat(p, false, log);
    expect(out.stats.blinkStrikeInstakillChain).toBe(0);
    expect(out.stats.blinkStrikeInstakillOutOfCombat).toBe(0);
    expect(log).toHaveBeenCalledOnce();
  });

  it('keeps counting past 10 when chain is below 2 (no fade)', () => {
    const log = vi.fn();
    const p = makePlayer({ blinkStrikeInstakillOutOfCombat: 11, blinkStrikeInstakillChain: 1 });
    const out = tickBlinkChainOutOfCombat(p, false, log);
    expect(out.stats.blinkStrikeInstakillOutOfCombat).toBe(12);
    expect(out.stats.blinkStrikeInstakillChain).toBe(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('does not mutate the input player', () => {
    const log = vi.fn();
    const p = makePlayer({ blinkStrikeInstakillOutOfCombat: 9, blinkStrikeInstakillChain: 2 });
    tickBlinkChainOutOfCombat(p, false, log);
    expect(p.stats.blinkStrikeInstakillChain).toBe(2);
    expect(p.stats.blinkStrikeInstakillOutOfCombat).toBe(9);
  });
});

describe('applyLevelUp', () => {
  it('bumps level, grants +maxHp with a full heal, and boosts mood (non-wizard)', () => {
    const log = vi.fn();
    const p = makePlayer({ hp: 4, maxHp: 10, level: 1, xp: 5, moodValue: 0 }, '🧝');
    const out = applyLevelUp(p, 1, 2, log);
    expect(out.stats.level).toBe(2);
    expect(out.stats.maxHp).toBe(13); // +3 from hpBonusForLevel(2)
    expect(out.stats.hp).toBe(13); // full heal to new max
    expect(out.stats.moodValue).toBe(30); // min(100, 0 + 30)
    expect(out.stats.mana).toBeUndefined(); // non-wizard gets no MP
    expect(out.inventory.length).toBe(1); // one random emoji power granted
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Level 2'));
  });

  it('caps mood at 100 for non-cowboys', () => {
    const log = vi.fn();
    const p = makePlayer({ hp: 5, maxHp: 10, level: 1, moodValue: 90 }, '🧝');
    const out = applyLevelUp(p, 1, 2, log);
    expect(out.stats.moodValue).toBe(100);
  });

  it('grants Wizards bonus max MP (and a full mana refill) when the MP tier increases', () => {
    const log = vi.fn();
    const p = makePlayer({ hp: 5, maxHp: 10, level: 1, moodValue: 0 }, '🧙');
    const out = applyLevelUp(p, 1, 4, log);
    expect(out.stats.level).toBe(4);
    expect(out.stats.maxHp).toBe(22); // +12 from hpBonusForLevel(4)
    expect(out.stats.maxMana).toBe(5); // (default 4) + mpBonusForLevel delta of 1
    expect(out.stats.mana).toBe(5);
    expect(out.inventory.length).toBeGreaterThanOrEqual(1); // wizard rolls two emojis
    expect(log).toHaveBeenCalledWith(expect.stringContaining('max MP'));
  });

  it('does not grant MP when the wizard MP tier is unchanged', () => {
    const log = vi.fn();
    const p = makePlayer({ hp: 5, maxHp: 10, level: 1, moodValue: 0 }, '🧙');
    const out = applyLevelUp(p, 1, 2, log); // mpBonusForLevel(2) === mpBonusForLevel(1)
    expect(out.stats.mana).toBeUndefined();
    expect(out.stats.maxMana).toBeUndefined();
  });

  it('does not mutate the input player', () => {
    const log = vi.fn();
    const p = makePlayer({ hp: 4, maxHp: 10, level: 1, moodValue: 0 }, '🧝');
    applyLevelUp(p, 1, 2, log);
    expect(p.stats.level).toBe(1);
    expect(p.stats.maxHp).toBe(10);
    expect(p.stats.hp).toBe(4);
    expect(p.inventory.length).toBe(0);
  });
});
