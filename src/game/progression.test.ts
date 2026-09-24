import { describe, it, expect } from 'vitest';
import { getDungeonPressure, companionBountyShare, companionBountyPercent, tickCompanionBountyOoc, autoRestNeedsBountyWait, applyCompanionLevelUp, COMPANION_BOUNTY_OOC_TURNS } from './progression';
import { applySpawnPressure, spawnEnemies } from './spawning';
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

describe('spawn pressure HP', () => {
  const base = { hp: 14, attack: 5, defense: 1 };

  it('adds pressure.atk to HP and leaves pressure-off stats unchanged', () => {
    expect(applySpawnPressure(base, getDungeonPressure(15))).toEqual(base);
    expect(applySpawnPressure(base, getDungeonPressure(16))).toEqual({ hp: 17, attack: 8, defense: 3 });
    expect(applySpawnPressure({ hp: 17, attack: 1, defense: 0 }, getDungeonPressure(20)).hp).toBe(32);
    expect(applySpawnPressure({ hp: 22, attack: 1, defense: 0 }, getDungeonPressure(25)).hp).toBe(52);
  });

  it('spawns spiders at floor-scaled HP plus the pressure bonus', () => {
    const room = { x: 1, y: 1, w: 10, h: 8, theme: 'normal' as const };
    const rooms = [{ x: 0, y: 0, w: 3, h: 3, theme: 'normal' as const }, room];
    const spiders = (floor: number) => {
      const found: number[] = [];
      for (let i = 0; i < 40; i++) {
        for (const e of spawnEnemies(floor, rooms, { x: 0, y: 0 }, 0)) {
          if (e.name === 'Spider') found.push(e.maxHp);
        }
      }
      return found;
    };
    const at = (floor: number) => {
      const hp = spiders(floor);
      expect(hp.length).toBeGreaterThan(0);
      expect(new Set(hp)).toEqual(new Set([hp[0]]));
      return hp[0];
    };
    // Spider base hp 2. floorScale then +pressure.atk. D15 has no pressure.
    expect(at(15)).toBe(13);
    expect(at(16)).toBe(17);
    expect(at(20)).toBe(32);
    expect(at(25)).toBe(51);
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

