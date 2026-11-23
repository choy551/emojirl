import { describe, expect, it } from 'vitest';
import { manaAfterQuietWait } from './genieMana';
import { restUntilFullDone, type RestPool } from './restHeal';

function tick(pool: RestPool): RestPool {
  const mana = pool.mana ?? 0;
  const maxMana = pool.maxMana ?? 4;
  return { ...pool, mana: manaAfterQuietWait(pool.characterClass, mana, maxMana) };
}

/** How many quiet waits happen before rest decides it is done. Caps so a bug cannot hang the test. */
function waitsUntilRestStops(start: RestPool): number {
  let pool = start;
  let waits = 0;
  while (!restUntilFullDone(pool) && waits < 12) {
    waits += 1;
    pool = tick(pool);
  }
  return waits;
}

describe('rest until full', () => {
  it('stops a full-HP genie with partial MP immediately and does not loop', () => {
    const genie: RestPool = { characterClass: '🧞‍♀️', hp: 20, maxHp: 20, mana: 2, maxMana: 6 };
    expect(restUntilFullDone(genie)).toBe(true);
    expect(waitsUntilRestStops(genie)).toBe(0);
    expect(restUntilFullDone({ ...genie, hp: 8 })).toBe(false);
  });

  it('still waits for wizard MP, and ignores stocks a wait cannot refill', () => {
    const wizard: RestPool = { characterClass: '🧙', hp: 20, maxHp: 20, mana: 2, maxMana: 6 };
    expect(restUntilFullDone(wizard)).toBe(false);
    expect(waitsUntilRestStops(wizard)).toBe(4);
    expect(restUntilFullDone({ ...wizard, mana: 6 })).toBe(true);

    const cowboy: RestPool = { characterClass: '🤠', hp: 10, maxHp: 10 };
    expect(restUntilFullDone(cowboy)).toBe(true);
    expect(waitsUntilRestStops(cowboy)).toBe(0);

    const genie: RestPool = { characterClass: '🧞‍♀️', hp: 20, maxHp: 20, mana: 6, maxMana: 6 };
    expect(restUntilFullDone(genie, true)).toBe(false);
  });
});
