import { EmojiItem } from './types';
import { sortBagSlots } from './inventory';

const QUICK_KINDS = new Set(['gun', 'boomerang', 'rope', 'freeze', 'bomb']);

/** Hotbar items the player fires or zaps, not passive souls or heals. */
export function isMobileQuickUseItem(item: EmojiItem | null | undefined): boolean {
  if (!item || item.consumed || item.isEquipment) return false;
  if (item.activeKind && QUICK_KINDS.has(item.activeKind)) return true;
  if (item.emoji === '⚡') return true;
  return false;
}

export function listMobileQuickUseSlots(inventory: EmojiItem[]): { slot: number; item: EmojiItem }[] {
  const bag = sortBagSlots(inventory);
  const out: { slot: number; item: EmojiItem }[] = [];
  for (let i = 0; i < 9; i++) {
    const item = bag[i];
    if (item && isMobileQuickUseItem(item)) out.push({ slot: i, item });
  }
  return out;
}

export function mobileQuickUseLabel(item: EmojiItem): string {
  if (item.emoji === '⚡' && !item.activeKind) return 'Zap';
  switch (item.activeKind) {
    case 'gun': return 'Gun';
    case 'bomb': return 'Bomb';
    case 'rope': return 'Rope';
    case 'freeze': return 'Freeze';
    case 'boomerang': return 'Rang';
    default: return 'Use';
  }
}
