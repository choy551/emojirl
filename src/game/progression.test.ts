import { describe, it, expect } from 'vitest';
import { getDungeonPressure, companionBountyShare, companionBountyPercent, tickCompanionBountyOoc, autoRestNeedsBountyWait, applyCompanionLevelUp, COMPANION_BOUNTY_OOC_TURNS } from './progression';
import type { Enemy } from './types';

describe('getDungeonPressure', () => {
  it('is 0/0 through D:15', () => {
    expect(getDungeonPressure(5)).toEqual({ atk: 0, def: 0 });
    expect(getDungeonPressure(15)).toEqual({ atk: 0, def: 0 });
  });

  it('scales linearly from D:16', () => {
    expect(getDungeonPressure(16)).toEqual({ atk: 3, def: 2 });
    expect(getDungeonPressure(18)).toEqual({ atk: 9, def: 6 });
    expect(getDungeonPressure(25)).toEqual({ atk: 30, def: 20 });
    expect(getDungeonPressure(30)).toEqual({ atk: 45, def: 30 });
  });
});

describe('companionBountyShare', () => {
  it('steps down 10% every 5 kills and floors at 10%', () => {
    expect(companionBountyShare(0)).toBe(0.5);
    expect(companionBountyShare(4)).toBe(0.5);
    expect(companionBountyShare(5)).toBe(0.4);
    expect(companionBountyShare(9)).toBe(0.4);
    expect(companionBountyShare(10)).toBe(0.3);
    expect(companionBountyShare(15)).toBe(0.2);
    expect(companionBountyShare(20)).toBe(0.1);
    expect(companionBountyShare(99)).toBe(0.1);
    expect(companionBountyPercent(5)).toBe(40);
  });
});

describe('tickCompanionBountyOoc', () => {
  it('snaps tally to 0 after 20 non-combat turns', () => {
    expect(COMPANION_BOUNTY_OOC_TURNS).toBe(20);
    let tally = 12;
    let ooc = 0;
    for (let i = 0; i < 19; i++) {
      const t = tickCompanionBountyOoc(tally, ooc, false, false);
      tally = t.tally;
      ooc = t.ooc;
      expect(t.refreshed).toBe(false);
    }
    expect(tally).toBe(12);
    const snap = tickCompanionBountyOoc(tally, ooc, false, false);
    expect(snap).toEqual({ tally: 0, ooc: 0, refreshed: true });
  });

  it('combat or a companion kill resets the OOC counter', () => {
    expect(tickCompanionBountyOoc(8, 19, true, false)).toEqual({ tally: 8, ooc: 0, refreshed: false });
    expect(tickCompanionBountyOoc(8, 19, false, true)).toEqual({ tally: 8, ooc: 0, refreshed: false });
  });

  it('auto-rest waits while bounty is below 50%', () => {
    expect(autoRestNeedsBountyWait(0)).toBe(false);
    expect(autoRestNeedsBountyWait(5)).toBe(true);
  });
});

describe('applyCompanionLevelUp', () => {
  it('adds HP from hpBonusForLevel and +1 ATK per level', () => {
    const e: Enemy = {
      id: 'c', pos: { x: 1, y: 1 }, emoji: '🧙', name: 'Mage',
      hp: 10, maxHp: 10, attack: 3, defense: 0, speed: 3, engaged: false, level: 1, xp: 0,
    };
    const up = applyCompanionLevelUp(e, 1, 2);
    expect(up.level).toBe(2);
    expect(up.attack).toBe(4);
    expect(up.maxHp).toBeGreaterThan(10);
    expect(up.hp).toBeGreaterThan(10);
  });
});

