import { describe, it, expect, beforeEach } from 'vitest';
import { _flashSignals, tryDualGunsFanfare } from './flashSignals';
import type { Player } from './types';

function guns(main: boolean, off: boolean): Player['equipment'] {
  return {
    ...(main ? { mainHand: { id: 'm', emoji: '🔫', name: 'Revolver', description: '', consumed: false, isEquipment: true, weaponKind: 'gun' as const } } : {}),
    ...(off ? { offHand: { id: 'o', emoji: '🔫', name: 'Revolver', description: '', consumed: false, isEquipment: true, weaponKind: 'gun' as const } } : {}),
  };
}

describe('tryDualGunsFanfare', () => {
  beforeEach(() => { _flashSignals.dualGunsFanfarePending = false; });

  it('does not fire for the first gun alone', () => {
    const fan = tryDualGunsFanfare({
      characterClass: '🤠',
      prevEquipment: {},
      nextEquipment: guns(true, false),
      alreadyDone: false,
    });
    expect(fan).toEqual({ done: false, fired: false });
    expect(_flashSignals.dualGunsFanfarePending).toBe(false);
  });

  it('fires once when the second gun completes Dual Guns', () => {
    const fan = tryDualGunsFanfare({
      characterClass: '🤠',
      prevEquipment: guns(true, false),
      nextEquipment: guns(true, true),
      alreadyDone: false,
    });
    expect(fan).toEqual({ done: true, fired: true });
    expect(_flashSignals.dualGunsFanfarePending).toBe(true);
  });

  it('does not fire again after the flag is set', () => {
    _flashSignals.dualGunsFanfarePending = false;
    const fan = tryDualGunsFanfare({
      characterClass: '🤠',
      prevEquipment: {},
      nextEquipment: guns(true, true),
      alreadyDone: true,
    });
    expect(fan).toEqual({ done: true, fired: false });
    expect(_flashSignals.dualGunsFanfarePending).toBe(false);
  });

  it('ignores non-cowboy dual guns', () => {
    const fan = tryDualGunsFanfare({
      characterClass: '🧝',
      prevEquipment: guns(true, false),
      nextEquipment: guns(true, true),
      alreadyDone: false,
    });
    expect(fan).toEqual({ done: false, fired: false });
    expect(_flashSignals.dualGunsFanfarePending).toBe(false);
  });
});
