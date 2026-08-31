import { describe, it, expect, vi } from 'vitest';
import { closeTopOverlay, type OverlayLayer } from './useAndroidBackButton';

describe('closeTopOverlay', () => {
  it('closes the first open layer and stops', () => {
    const a = vi.fn();
    const b = vi.fn();
    const layers: OverlayLayer[] = [
      { id: 'card', isOpen: () => false, close: a },
      { id: 'shop', isOpen: () => true, close: b },
      { id: 'pause', isOpen: () => true, close: vi.fn() },
    ];
    expect(closeTopOverlay(layers)).toBe('shop');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returns null when nothing is open', () => {
    const layers: OverlayLayer[] = [
      { id: 'pause', isOpen: () => false, close: vi.fn() },
    ];
    expect(closeTopOverlay(layers)).toBeNull();
  });
});
