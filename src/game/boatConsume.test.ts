import { describe, expect, it } from 'vitest';
import { FLYING_BOAT_LOG, boatConsumeGate } from './boatConsume';

describe('flying vessels consume a boat freely', () => {
  it('skips the drown prompt over water and does not die', () => {
    expect(boatConsumeGate({ flies: true, overWater: true, boatCount: 1, confirmed: false })).toEqual({
      action: 'consume',
      log: FLYING_BOAT_LOG,
    });
    expect(boatConsumeGate({ flies: true, overWater: true, boatCount: 3, confirmed: false }).action).toBe('consume');
  });

  it('skips the last-boat prompt on dry land', () => {
    expect(boatConsumeGate({ flies: true, overWater: false, boatCount: 1, confirmed: false })).toEqual({
      action: 'consume',
      log: FLYING_BOAT_LOG,
    });
  });

  it('stays quiet when a spare boat is spent on land', () => {
    expect(boatConsumeGate({ flies: true, overWater: false, boatCount: 2, confirmed: false })).toEqual({
      action: 'consume',
    });
  });

  it('still warns a grounded sailor, including the drown on water', () => {
    expect(boatConsumeGate({ flies: false, overWater: true, boatCount: 3, confirmed: false }).action).toBe('drown-warn');
    expect(boatConsumeGate({ flies: false, overWater: true, boatCount: 1, confirmed: true }).action).toBe('drown-warn');
    expect(boatConsumeGate({ flies: false, overWater: false, boatCount: 1, confirmed: false }).action).toBe('last-boat-warn');
    expect(boatConsumeGate({ flies: false, overWater: false, boatCount: 1, confirmed: true })).toEqual({ action: 'consume' });
    expect(boatConsumeGate({ flies: false, overWater: false, boatCount: 2, confirmed: false })).toEqual({ action: 'consume' });
  });
});
