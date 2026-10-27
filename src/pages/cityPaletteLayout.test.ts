import { describe, expect, it } from 'vitest';
import { FLYOUT_CLOSE_MS, RAISE_BUTTON_HEIGHT, flyoutStyle, raiseFlyoutFrame, raisePlace, type FlyoutRect } from './cityPaletteLayout';

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

  it('parks Raise beside the menu, and under the row when the menu fills the screen', () => {
    const section: FlyoutRect = { top: 240, right: 900, bottom: 284, left: 520 };
    const wideMenu: FlyoutRect = { top: 120, right: 900, bottom: 860, left: 520 };
    const beside = raisePlace(section, wideMenu, { width: 1440, height: 900 });
    expect(beside.mode).toBe('beside');
    expect(beside.style?.left).toBe(wideMenu.right + 6);
    expect(beside.style?.top).toBe(section.top + (44 - RAISE_BUTTON_HEIGHT) / 2);
    expect((beside.style?.left as number)).toBeGreaterThanOrEqual(wideMenu.right);

    const phoneMenu: FlyoutRect = { top: 400, right: 382, bottom: 1400, left: 8 };
    const phoneSection: FlyoutRect = { top: 720, right: 382, bottom: 764, left: 8 };
    expect(raisePlace(phoneSection, phoneMenu, { width: 390, height: 844 }).mode).toBe('below');
  });

  it('hangs Raise on the flyout top and shifts a sheet down so it clears the menu', () => {
    const side = flyoutStyle(
      { top: 240, right: 900, bottom: 284, left: 520 },
      { top: 120, right: 908, bottom: 860, left: 520 },
      { width: 1440, height: 900 },
      { top: 252, right: 900, bottom: 284, left: 868 },
    );
    const hung = raiseFlyoutFrame(side.style, side.layout, 900, true);
    expect(hung.parkAbove).toBe(true);
    expect(hung.frame.top).toBe(side.style.top);
    expect((hung.frame.top as number)).toBeGreaterThanOrEqual(8 + RAISE_BUTTON_HEIGHT);

    const sheet = flyoutStyle(
      { top: 720, right: 370, bottom: 764, left: 16 },
      { top: 180, right: 374, bottom: 700, left: 16 },
      { width: 390, height: 844 },
      { top: 732, right: 370, bottom: 764, left: 338 },
    );
    const shifted = raiseFlyoutFrame(sheet.style, sheet.layout, 844, true);
    expect(sheet.layout).toBe('sheet');
    expect(shifted.frame.top).toBe((sheet.style.top as number) + RAISE_BUTTON_HEIGHT);
    expect(shifted.parkAbove).toBe(true);
    expect(shifted.frame.left).toBe(8);
  });

  it('waits briefly before closing so the pointer can reach the panel', () => {
    expect(FLYOUT_CLOSE_MS).toBeGreaterThanOrEqual(120);
    expect(FLYOUT_CLOSE_MS).toBeLessThanOrEqual(300);
  });
});
