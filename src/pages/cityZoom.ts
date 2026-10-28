/** Smallest scale that still shows a max city on a phone. */
export const ZOOM_MIN = 0.15;
/** Largest magnification of the city grid. */
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 1.25;

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

export function stepZoom(scale: number, direction: 'in' | 'out'): number {
  return clampZoom(direction === 'in' ? scale * ZOOM_STEP : scale / ZOOM_STEP);
}

/** Scale that shows the whole grid in the viewport, without enlarging a city that already fits. */
export function fitZoom(viewW: number, viewH: number, gridW: number, gridH: number): number {
  if (viewW <= 0 || viewH <= 0 || gridW <= 0 || gridH <= 0) return 1;
  return clampZoom(Math.min(viewW / gridW, viewH / gridH, 1));
}
