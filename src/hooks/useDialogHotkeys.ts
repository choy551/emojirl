import { useEffect, useRef } from 'react';

export function dialogKeyAction(e: Pick<KeyboardEvent, 'key' | 'code'>): 'confirm' | 'cancel' | null {
  if (e.key === 'Escape') return 'cancel';
  if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.code === 'NumpadEnter') return 'confirm';
  return null;
}

/**
 * While a dialogue is mounted, Esc cancels and Enter/Space confirms.
 * Capture-phase so the game keyboard handler does not wait/move underneath.
 */
export function useDialogHotkeys(
  onConfirm: (() => void) | undefined,
  onCancel: () => void,
  confirmEnabled = true,
): void {
  const confirmRef = useRef(onConfirm);
  const cancelRef = useRef(onCancel);
  const enabledRef = useRef(confirmEnabled);
  confirmRef.current = onConfirm;
  cancelRef.current = onCancel;
  enabledRef.current = confirmEnabled;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const action = dialogKeyAction(e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      if (action === 'cancel') cancelRef.current();
      else if (enabledRef.current) confirmRef.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
