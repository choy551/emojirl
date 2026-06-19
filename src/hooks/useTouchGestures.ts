import { useRef, useCallback } from 'react';

interface TouchGestureOptions {
  enableSwipe: boolean;
  enableEdgeTap: boolean;
  /** Move one step in a direction (sign of dx/dy, each in {-1,0,1}). */
  onSwipeMove: (dx: number, dy: number) => void;
  /** Minimum pointer travel (px) to count as a swipe rather than a tap. */
  swipeThreshold?: number;
  /** A tap within this fraction of the element's half-size near an edge triggers edge-tap. */
  edgeZoneFraction?: number;
}

/**
 * Pointer-based swipe + edge-tap movement for the game board.
 *
 * - A swipe of at least `swipeThreshold` px resolves to one of 8 directions and
 *   fires `onSwipeMove(dx, dy)` once (a short swipe = a single step / bump).
 * - A tap (movement below the threshold) near an edge of the board fires a step
 *   toward that edge, when `enableEdgeTap` is on.
 *
 * Tile taps are handled separately by per-tile onClick; this hook only acts on
 * gestures that are not consumed as a deliberate tile tap. To avoid double-acting
 * with tile onClick, edge-tap only fires for taps in the outer edge zone.
 */
export function useTouchGestures({
  enableSwipe,
  enableEdgeTap,
  onSwipeMove,
  swipeThreshold = 28,
  edgeZoneFraction = 0.18,
}: TouchGestureOptions) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const movedRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return; // touch / pen only
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    movedRef.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.hypot(dx, dy) > swipeThreshold) movedRef.current = true;
  }, [swipeThreshold]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || e.pointerType === 'mouse') return;

    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dist = Math.hypot(dx, dy);

    // Swipe: resolve to 8-way direction and step once. Either axis that exceeds
    // ~40% of the threshold contributes, so diagonal swipes map to diagonal steps.
    if (enableSwipe && dist >= swipeThreshold) {
      const stepX = Math.abs(dx) > swipeThreshold * 0.4 ? Math.sign(dx) : 0;
      const stepY = Math.abs(dy) > swipeThreshold * 0.4 ? Math.sign(dy) : 0;
      if (stepX !== 0 || stepY !== 0) {
        onSwipeMove(stepX, stepY);
        return;
      }
    }

    // Edge tap: a near-stationary touch in the outer edge zone steps toward it.
    if (enableEdgeTap && dist < swipeThreshold) {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;  // 0..1
      const relY = (e.clientY - rect.top) / rect.height;  // 0..1
      let stepX = 0;
      let stepY = 0;
      if (relX <= edgeZoneFraction) stepX = -1;
      else if (relX >= 1 - edgeZoneFraction) stepX = 1;
      if (relY <= edgeZoneFraction) stepY = -1;
      else if (relY >= 1 - edgeZoneFraction) stepY = 1;
      if (stepX !== 0 || stepY !== 0) onSwipeMove(stepX, stepY);
    }
  }, [enableSwipe, enableEdgeTap, swipeThreshold, edgeZoneFraction, onSwipeMove]);

  return { onPointerDown, onPointerMove, onPointerUp };
}
