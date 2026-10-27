import type { CSSProperties } from 'react';

export interface FlyoutRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FlyoutViewport {
  width: number;
  height: number;
}

/** Long enough to cross from the … into the panel, short enough to feel snappy. */
export const FLYOUT_CLOSE_MS = 200;

/** Matches the h-8 Raise control. Kept out of the tile row so it can sit above or beside it. */
export const RAISE_BUTTON_HEIGHT = 32;
/** Room the nowrap Raise label needs. Narrower than this, and it drops under the row instead. */
export const RAISE_BUTTON_WIDTH = 108;

/**
 * Side panels sit flush against the right edge of the row's …, lined up with that row.
 * A narrow viewport, or a menu with no room on its right, still uses the phone sheet.
 */
export function flyoutStyle(
  section: FlyoutRect,
  menu: FlyoutRect,
  viewport: FlyoutViewport,
  dots?: FlyoutRect,
): { layout: 'side' | 'sheet'; style: CSSProperties } {
  const margin = 8;
  const want = 384;
  const minSide = 160;
  const anchor = dots ?? section;
  const left = anchor.right;
  const spaceRight = viewport.width - margin - left;
  const narrow = viewport.width < 640 || spaceRight < minSide;
  if (narrow) {
    const gap = 8;
    const top = Math.min(menu.bottom + gap, Math.max(margin, viewport.height - 220));
    return {
      layout: 'sheet',
      style: {
        position: 'fixed',
        left: margin,
        right: margin,
        top,
        maxHeight: Math.max(160, viewport.height - top - margin),
        zIndex: 50,
      },
    };
  }
  const edge = viewport.height - margin;
  let top = section.top;
  if (top < margin) top = margin;
  // Near the bottom of the screen, grow the panel upward so it still meets the ….
  if (edge - anchor.top < 160) {
    top = Math.max(margin, Math.min(top, anchor.top, edge - 180));
  }
  if (top > anchor.top) top = Math.max(margin, anchor.top);
  const dotsMid = (anchor.top + anchor.bottom) / 2;
  const coverBottom = Math.min(viewport.height, dotsMid + 6);
  const minBox = Math.max(48, coverBottom - top);
  const maxBox = Math.max(minBox, edge - top);
  return {
    layout: 'side',
    style: {
      position: 'fixed',
      top,
      left,
      width: Math.min(want, spaceRight),
      minHeight: minBox,
      maxHeight: maxBox,
      zIndex: 50,
    },
  };
}

export interface FlyoutFrame {
  frame: CSSProperties;
  panel: CSSProperties;
  /** True when Raise can hang on the panel's top edge without leaving the screen. */
  parkAbove: boolean;
}

/**
 * Keeps Raise attached to the top of an open flyout.
 * A phone sheet moves down so the button sits in the gap under the menu, not on its tiles.
 */
export function raiseFlyoutFrame(
  style: CSSProperties,
  layout: 'side' | 'sheet',
  viewportHeight: number,
  reserveRaise: boolean,
): FlyoutFrame {
  const margin = 8;
  let top = typeof style.top === 'number' ? style.top : margin;
  let maxHeight = style.maxHeight;
  if (reserveRaise && layout === 'sheet') {
    top += RAISE_BUTTON_HEIGHT;
    maxHeight = Math.max(160, viewportHeight - top - margin);
  }
  return {
    parkAbove: top >= margin + RAISE_BUTTON_HEIGHT,
    frame: {
      position: 'fixed',
      top,
      left: style.left,
      right: style.right,
      width: style.width,
      zIndex: style.zIndex ?? 50,
    },
    panel: {
      minHeight: style.minHeight,
      maxHeight,
    },
  };
}

/**
 * With the flyout closed, Raise sits just past the menu's right edge, lined up with the active row.
 * A phone-width page, or a menu that already fills the viewport, puts it under that row instead.
 */
export function raisePlace(
  section: FlyoutRect,
  menu: FlyoutRect,
  viewport: FlyoutViewport,
): { mode: 'beside' | 'below'; style?: CSSProperties } {
  const margin = 8;
  const gap = 6;
  const left = menu.right + gap;
  const rowVisible = section.bottom > menu.top && section.top < menu.bottom;
  const fits = viewport.width >= 640 && left + RAISE_BUTTON_WIDTH <= viewport.width - margin;
  if (!fits || !rowVisible) return { mode: 'below' };
  const height = RAISE_BUTTON_HEIGHT;
  let top = section.top + (section.bottom - section.top - height) / 2;
  const minTop = Math.max(margin, menu.top);
  const maxTop = Math.min(viewport.height - margin - height, menu.bottom - height);
  if (maxTop >= minTop) top = Math.min(Math.max(top, minTop), maxTop);
  return {
    mode: 'beside',
    style: { position: 'fixed', top, left, zIndex: 40 },
  };
}
