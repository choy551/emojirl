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

/**
 * Side panels line up with the section row. Sheets still hang from the whole menu,
 * which is the phone behavior.
 */
export function flyoutStyle(
  section: FlyoutRect,
  menu: FlyoutRect,
  viewport: FlyoutViewport,
): { layout: 'side' | 'sheet'; style: CSSProperties } {
  const gap = 8;
  const margin = 8;
  const want = 384;
  const spaceRight = viewport.width - menu.right - gap;
  const spaceLeft = menu.left - gap;
  const narrow = viewport.width < 640 || (spaceRight < 240 && spaceLeft < 240);
  if (narrow) {
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
  const placeRight = spaceRight >= spaceLeft;
  const width = Math.min(want, placeRight ? spaceRight : spaceLeft);
  const minHeight = 180;
  let top = section.top;
  if (viewport.height - margin - top < minHeight) {
    top = Math.max(margin, viewport.height - margin - minHeight);
  }
  if (top < margin) top = margin;
  return {
    layout: 'side',
    style: {
      position: 'fixed',
      top,
      width,
      maxHeight: Math.max(minHeight, viewport.height - top - margin),
      zIndex: 50,
      left: placeRight ? menu.right + gap : Math.max(margin, menu.left - gap - width),
    },
  };
}
