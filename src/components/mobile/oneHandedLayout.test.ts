import { describe, it, expect } from 'vitest';
import { DEFAULT_CONTROL_SETTINGS } from '../../game/types';
import { actionSide, controlSide, overlayHand, overlayFlexClass } from './oneHandedLayout';

describe('one-handed layout sides', () => {
  it('keeps actions opposite the d-pad in two-handed mode', () => {
    const right = { ...DEFAULT_CONTROL_SETTINGS, dpadSide: 'right' as const, oneHanded: false };
    const left = { ...DEFAULT_CONTROL_SETTINGS, dpadSide: 'left' as const, oneHanded: false };
    expect(controlSide(right)).toBe('right');
    expect(actionSide(right)).toBe('left');
    expect(actionSide(left)).toBe('right');
    expect(overlayHand(right, true)).toBeNull();
  });

  it('parks d-pad, actions, and overlays on the same thumb side when one-handed', () => {
    const right = { ...DEFAULT_CONTROL_SETTINGS, dpadSide: 'right' as const, oneHanded: true };
    const left = { ...DEFAULT_CONTROL_SETTINGS, dpadSide: 'left' as const, oneHanded: true };
    expect(controlSide(right)).toBe('right');
    expect(actionSide(right)).toBe('right');
    expect(actionSide(left)).toBe('left');
    expect(overlayHand(right, true)).toBe('right');
    expect(overlayHand(left, true)).toBe('left');
    expect(overlayHand(right, false)).toBeNull();
    expect(overlayFlexClass('right')).toContain('justify-end');
    expect(overlayFlexClass('left')).toContain('justify-start');
  });
});
