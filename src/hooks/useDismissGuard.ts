import { useCallback, useRef } from 'react';

/** True when a dismiss event is leftover from the tap that just opened the overlay. */
export function shouldIgnoreDismiss(openedAt: number, now = Date.now(), ms = 400): boolean {
  return now - openedAt < ms;
}

/**
 * Eat the trailing `click` after a `pointerdown` handler unmounts an overlay.
 * Otherwise the event retargets onto whatever is now under the finger (combat log, tiles, etc.).
 */
export function swallowGhostClick(ms = 400): void {
  if (typeof document === 'undefined') return;
  const until = Date.now() + ms;
  const swallow = (e: Event) => {
    if (Date.now() > until) {
      document.removeEventListener('click', swallow, true);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    document.removeEventListener('click', swallow, true);
  };
  document.addEventListener('click', swallow, true);
}

/**
 * Ignore overlay-dismiss events that are leftover from the tap that opened it.
 * On mobile, pointerdown on a d-pad / context button opens a centered modal, then
 * the trailing `click` hits the full-screen backdrop (the card doesn't cover the
 * tap point) and would close the modal instantly.
 */
export function useDismissGuard(onClose: () => void, ms = 400): () => void {
  const openedAt = useRef(Date.now());
  return useCallback(() => {
    if (shouldIgnoreDismiss(openedAt.current, Date.now(), ms)) return;
    onClose();
  }, [onClose, ms]);
}
