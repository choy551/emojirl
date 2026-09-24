import { describe, it, expect } from 'vitest';
import {
  createDefaultZodiacState, getZodiacPassives, pledgeRuler, abandonRuler,
  applyPietyDelta, noteBankDeposit, noteSparseConsume, pietyOnPlayerKill,
  grantCappedPiety, normalizeZodiac, ZODIAC_DESCEND_WARN,
} from './zodiac';

describe('zodiac S passives', () => {
  it('is zero until a ruler is pledged', () => {
    expect(getZodiacPassives(createDefaultZodiacState())).toEqual({
      maxHp: 0, attack: 0, defense: 0, speed: 0, evasion: 0, luck: 0, crit: 0,
    });
  });

  it('lerps Taurus and Scorpio with floor', () => {
    const taurus = pledgeRuler(createDefaultZodiacState(), 'taurus');
    expect(getZodiacPassives({ ...taurus, piety: 0 }).maxHp).toBe(0);
    expect(getZodiacPassives({ ...taurus, piety: 100 })).toMatchObject({ maxHp: 5, defense: 3 });
    expect(getZodiacPassives({ ...taurus, piety: 50 })).toMatchObject({ maxHp: 2, defense: 1 });
    const scorpio = pledgeRuler(createDefaultZodiacState(), 'scorpio');
    expect(getZodiacPassives({ ...scorpio, piety: 100 })).toMatchObject({ attack: 3, crit: 5 });
  });

  it('abandon clears ruler and piety with no extra penalty', () => {
    const pledged = { ...pledgeRuler(createDefaultZodiacState(), 'leo'), piety: 40 };
    const gone = abandonRuler(pledged);
    expect(gone.ruler).toBeNull();
    expect(gone.piety).toBe(0);
  });

  it('fires only the pledged ruler and respects the bank cap', () => {
    const taurus = pledgeRuler(createDefaultZodiacState(), 'taurus');
    const gain = applyPietyDelta(taurus, 3, 'taurus_combat_hotbar6');
    expect(gain.log).toBe('♉ +3 piety (taurus_combat_hotbar6)');
    expect(gain.zodiac.piety).toBe(3);
    expect(applyPietyDelta(taurus, 4, 'leo_kill_stronger').log).toBeNull();
    const once = noteBankDeposit(taurus);
    expect(once.zodiac.piety).toBe(2);
    expect(noteBankDeposit(once.zodiac).log).toBeNull();
    expect(noteSparseConsume(taurus, 4).zodiac.piety).toBe(0);
    expect(noteSparseConsume({ ...taurus, piety: 10 }, 5).log).toBeNull();
  });

  it('scores Leo and Scorpio kills', () => {
    const leo = pledgeRuler(createDefaultZodiacState(), 'leo');
    const strong = pietyOnPlayerKill(leo, 10, { maxHp: 20 }, { unaware: false, damageDealt: 4, onWater: false });
    expect(strong.logs[0]).toContain('leo_kill_stronger');
    expect(strong.zodiac.piety).toBe(4);
    const boss = pietyOnPlayerKill(leo, 10, { maxHp: 30, isBoss: true }, { unaware: false, damageDealt: 4, onWater: false });
    expect(boss.zodiac.piety).toBe(8);
    const scorpio = pledgeRuler(createDefaultZodiacState(), 'scorpio');
    const stealth = pietyOnPlayerKill(scorpio, 30, { maxHp: 8 }, { unaware: true, damageDealt: 8, onWater: true });
    expect(stealth.zodiac.piety).toBe(7);
    expect(stealth.logs.map(l => l.includes('scorpio_water') || l.includes('scorpio_stealth')).every(Boolean)).toBe(true);
  });

  it('caps Leo explore piety at +10', () => {
    const leo = pledgeRuler(createDefaultZodiacState(), 'leo');
    const first = grantCappedPiety(leo, 'leo_explore_unseen', 1, 'leo_explore_unseen', 10, 12);
    expect(first.zodiac.piety).toBe(10);
    expect(grantCappedPiety(first.zodiac, 'leo_explore_unseen', 1, 'leo_explore_unseen', 10, 3).log).toBeNull();
  });

  it('fills old saves and keeps the descend warning exact', () => {
    expect(normalizeZodiac(undefined).ruler).toBeNull();
    expect(normalizeZodiac({ ruler: 'aquarius', piety: 140 }).piety).toBe(100);
    expect(ZODIAC_DESCEND_WARN).toBe(
      "You haven't pledged a Zodiac Ruler. After D:7 you won't be able to choose a Ruler to be re-born under. Descend anyway?",
    );
  });
});
