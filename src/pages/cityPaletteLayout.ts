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
