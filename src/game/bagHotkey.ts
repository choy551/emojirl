export type BagHotkey = 'close' | 'equipment' | 'bank';

/**
 * Lowercase b opens Equipment, or closes the bag when it is already open.
 * Shift+B opens the Bank tab. Overlay screens still use both keys to dismiss.
 */
export function bagHotkey(key: string, bagOpen: boolean): BagHotkey | null {
  if (key === 'b') return bagOpen ? 'close' : 'equipment';
  if (key === 'B') return 'bank';
  return null;
}
