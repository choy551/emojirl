import { describe, expect, it } from 'vitest';
import { FLYOUT_CLOSE_MS, flyoutStyle, type FlyoutRect } from './cityPaletteLayout';

const menu: FlyoutRect = { top: 120, right: 540, bottom: 980, left: 48 };
const desktop = { width: 1280, height: 800 };

describe('flyoutStyle', () => {
  it('opens flush on the right of the … even when the left side has more room', () => {
    const menu: FlyoutRect = { top: 181, right: 876, bottom: 719, left: 486 };
    const slums: FlyoutRect = { top: 188, right: 869, bottom: 232, left: 493 };
    const neutral: FlyoutRect = { top: 428, right: 869, bottom: 472, left: 493 };
    const dots: FlyoutRect = { top: 440, right: 869, bottom: 472, left: 837 };
    const besideSlums = flyoutStyle(slums, menu, { width: 1280, height: 900 }, { ...dots, top: 200, bottom: 232 });
    const besideNeutral = flyoutStyle(neutral, menu, { width: 1280, height: 900 }, dots);
    expect(besideSlums.layout).toBe('side');
    expect(besideNeutral.layout).toBe('side');
    expect(besideSlums.style.left).toBe(869);
    expect(besideNeutral.style.left).toBe(dots.right);
    expect(besideNeutral.style.top).toBe(neutral.top);
    expect(besideSlums.style.top).toBe(slums.top);
    expect(besideNeutral.style.top).not.toBe(menu.top);
    expect((besideNeutral.style.left as number)).toBeGreaterThan(menu.left);
    const rightEdge = (besideNeutral.style.left as number) + (besideNeutral.style.width as number);
    expect(rightEdge).toBeLessThanOrEqual(1280 - 8);
  });

  it('shifts a side panel up when the row sits too close to the bottom', () => {
    const section: FlyoutRect = { top: 760, right: 540, bottom: 808, left: 48 };
    const placed = flyoutStyle(section, menu, desktop);
    const top = placed.style.top as number;
    const minHeight = placed.style.minHeight as number;
    const maxHeight = placed.style.maxHeight as number;
    const mid = (section.top + section.bottom) / 2;
    expect(placed.layout).toBe('side');
    expect(placed.style.left).toBe(section.right);
    expect(top).toBeLessThanOrEqual(section.top);
    expect(top + minHeight).toBeGreaterThanOrEqual(Math.min(desktop.height, mid));
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + maxHeight).toBeLessThanOrEqual(desktop.height);
  });

  it('still meets the … when that row is at the bottom of the viewport', () => {
    const section: FlyoutRect = { top: 868, right: 869, bottom: 912, left: 395 };
    const dots: FlyoutRect = { top: 880, right: 869, bottom: 912, left: 837 };
    const tallMenu: FlyoutRect = { top: 621, right: 876, bottom: 1159, left: 388 };
    const placed = flyoutStyle(section, tallMenu, { width: 1280, height: 900 }, dots);
    const top = placed.style.top as number;
    const minHeight = placed.style.minHeight as number;
    const mid = (dots.top + dots.bottom) / 2;
    expect(placed.layout).toBe('side');
    expect(placed.style.left).toBe(dots.right);
    expect(top).toBeLessThanOrEqual(dots.top);
    expect(top + minHeight).toBeGreaterThanOrEqual(Math.min(900, mid));
    expect(top + minHeight).toBeLessThanOrEqual(900);
  });

  it('pins a side panel to the top margin when the row has scrolled off', () => {
    const section: FlyoutRect = { top: -40, right: 540, bottom: 8, left: 48 };
    const placed = flyoutStyle(section, menu, desktop);
    expect(placed.style.top).toBe(8);
    expect(placed.style.left).toBe(section.right);
  });

  it('uses the sheet when the right side cannot hold a panel', () => {
    const section: FlyoutRect = { top: 200, right: 760, bottom: 244, left: 400 };
    const wideMenu: FlyoutRect = { top: 120, right: 768, bottom: 700, left: 392 };
    const placed = flyoutStyle(section, wideMenu, { width: 800, height: 800 }, section);
    expect(placed.layout).toBe('sheet');
    expect(placed.style.left).toBe(8);
    expect(placed.style.right).toBe(8);
  });

  it('keeps the phone sheet hanging from the whole menu', () => {
    const phone = { width: 390, height: 844 };
    const phoneMenu: FlyoutRect = { top: 180, right: 374, bottom: 1100, left: 16 };
    const section: FlyoutRect = { top: 720, right: 370, bottom: 768, left: 16 };
    const dots: FlyoutRect = { top: 736, right: 370, bottom: 768, left: 338 };
    const placed = flyoutStyle(section, phoneMenu, phone, dots);
    expect(placed.layout).toBe('sheet');
    expect(placed.style.left).toBe(8);
    expect(placed.style.right).toBe(8);
    expect(placed.style.top).toBe(Math.min(phoneMenu.bottom + 8, Math.max(8, phone.height - 220)));
    expect(placed.style.top).not.toBe(section.top);
  });

  it('waits briefly before closing so the pointer can reach the panel', () => {
    expect(FLYOUT_CLOSE_MS).toBeGreaterThanOrEqual(120);
    expect(FLYOUT_CLOSE_MS).toBeLessThanOrEqual(300);
  });
});
