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
  const width = Math.min(want, spaceRight);
  const minHeight = 180;
  let top = section.top;
  if (top < margin) top = margin;
  if (viewport.height - margin - top < minHeight) {
    top = Math.max(margin, viewport.height - margin - minHeight);
  }
  // If the clamp lifted the panel off the …, drop it back onto that button.
  if (top > anchor.bottom) {
    top = Math.max(margin, Math.min(anchor.top, viewport.height - margin - minHeight));
  }
  return {
    layout: 'side',
    style: {
      position: 'fixed',
      top,
      left,
      width,
      maxHeight: Math.max(minHeight, viewport.height - margin - top),
      zIndex: 50,
    },
  };
}
