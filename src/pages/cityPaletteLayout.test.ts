import { describe, expect, it } from 'vitest';
import { flyoutStyle, type FlyoutRect } from './cityPaletteLayout';

const menu: FlyoutRect = { top: 120, right: 540, bottom: 980, left: 48 };
const desktop = { width: 1280, height: 800 };

describe('flyoutStyle', () => {
  it('lines a side panel up with the clicked section row', () => {
    const slums: FlyoutRect = { top: 120, right: 540, bottom: 168, left: 48 };
    const neutral: FlyoutRect = { top: 520, right: 540, bottom: 568, left: 48 };
    const besideSlums = flyoutStyle(slums, menu, desktop);
    const besideNeutral = flyoutStyle(neutral, menu, desktop);
    expect(besideSlums.layout).toBe('side');
    expect(besideNeutral.layout).toBe('side');
    expect(besideSlums.style.top).toBe(slums.top);
    expect(besideNeutral.style.top).toBe(neutral.top);
    expect(besideNeutral.style.top).not.toBe(menu.top);
    expect(besideNeutral.style.left).toBe(menu.right + 8);
  });

  it('shifts a side panel up when the row sits too close to the bottom', () => {
    const section: FlyoutRect = { top: 760, right: 540, bottom: 808, left: 48 };
    const placed = flyoutStyle(section, menu, desktop);
    const top = placed.style.top as number;
    const maxHeight = placed.style.maxHeight as number;
    expect(placed.layout).toBe('side');
    expect(top).toBe(desktop.height - 8 - 180);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + maxHeight).toBeLessThanOrEqual(desktop.height - 8);
  });

  it('pins a side panel to the top margin when the row has scrolled off', () => {
    const section: FlyoutRect = { top: -40, right: 540, bottom: 8, left: 48 };
    const placed = flyoutStyle(section, menu, desktop);
    expect(placed.style.top).toBe(8);
  });

  it('keeps the phone sheet hanging from the whole menu', () => {
    const phone = { width: 390, height: 844 };
    const phoneMenu: FlyoutRect = { top: 180, right: 374, bottom: 1100, left: 16 };
    const section: FlyoutRect = { top: 720, right: 374, bottom: 768, left: 16 };
    const placed = flyoutStyle(section, phoneMenu, phone);
    expect(placed.layout).toBe('sheet');
    expect(placed.style.left).toBe(8);
    expect(placed.style.right).toBe(8);
    expect(placed.style.top).toBe(Math.min(phoneMenu.bottom + 8, Math.max(8, phone.height - 220)));
    expect(placed.style.top).not.toBe(section.top);
  });
});
