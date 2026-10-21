import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAMPFIRE_REST_BONUS,
  REST_CRITICAL_MULT,
  REST_CRITICAL_RATIO,
  REST_HALVES_MULT,
  REST_HALVES_RATIO,
  WAIT_HEAL,
  restHealAmount,
  restHealMultiplier,
  turnsToFullRest,
} from './restHeal';

const SAMPLE_MAX_HP = 40;
const SAMPLE_START_HP = SAMPLE_MAX_HP * 0.1;

describe('low-HP rest healing', () => {
  it('triples at 25% or below, doubles at 50% or below, and stays flat above that', () => {
    expect(WAIT_HEAL).toBe(1);
    expect(CAMPFIRE_REST_BONUS).toBe(2);
    expect(REST_CRITICAL_RATIO).toBe(0.25);
    expect(REST_HALVES_RATIO).toBe(0.5);
    expect(REST_CRITICAL_MULT).toBe(3);
    expect(REST_HALVES_MULT).toBe(2);

    expect(restHealMultiplier(10, 40)).toBe(3);
    expect(restHealMultiplier(11, 40)).toBe(2);
    expect(restHealMultiplier(20, 40)).toBe(2);
    expect(restHealMultiplier(21, 40)).toBe(1);
    expect(restHealMultiplier(0, 40)).toBe(3);
    expect(restHealMultiplier(40, 40)).toBe(1);

    expect(restHealAmount({ hp: 4, maxHp: 40 })).toBe(3);
    expect(restHealAmount({ hp: 30, maxHp: 40 })).toBe(1);
    expect(restHealAmount({ hp: 4, maxHp: 40, campfire: true })).toBe(9);
    expect(restHealAmount({ hp: 30, maxHp: 40, campfire: true })).toBe(3);
    expect(restHealAmount({ hp: 20, maxHp: 40, waveRegen: 2 })).toBe(6);
    expect(restHealAmount({ hp: 30, maxHp: 40, waveRegen: 2 })).toBe(3);
  });

  it('reaches full from 10% HP in fewer rest turns', () => {
    const before = SAMPLE_MAX_HP - SAMPLE_START_HP;
    const after = turnsToFullRest(SAMPLE_START_HP, SAMPLE_MAX_HP);
    expect(before).toBe(36);
    expect(after).toBe(26);
    expect(after).toBeLessThan(before);

    const beforeCamp = before / (WAIT_HEAL + CAMPFIRE_REST_BONUS);
    const afterCamp = turnsToFullRest(SAMPLE_START_HP, SAMPLE_MAX_HP, { campfire: true });
    expect(beforeCamp).toBe(12);
    expect(afterCamp).toBe(8);

    expect(turnsToFullRest(2, 20)).toBe(12);
    expect(20 - 2).toBe(18);
    expect(turnsToFullRest(SAMPLE_MAX_HP, SAMPLE_MAX_HP)).toBe(0);
  });

  it('leaves combat interruption and in-combat wave regen alone', () => {
    const game = readFileSync(new URL('../pages/game.tsx', import.meta.url), 'utf8');
    const enemyTurns = readFileSync(new URL('./enemyTurns.ts', import.meta.url), 'utf8');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(game).toContain('Auto-rest interrupted — danger nearby!');
    expect(enemyTurns).not.toContain('restHealMultiplier');
    expect(manual).toContain('×3 at 25%');
    expect(manual).toContain('visible hostile still cancels it');
  });
});
