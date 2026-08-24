import { EmojiItem, Player } from './types';
import { addToBag } from './inventory';
import { isStackableBagPassive } from './passives';

export function isSoulEmoji(i: EmojiItem): boolean {
  return !i.consumed && !i.isEquipment && !!i.bagPassive && !i.activeKind &&
    i.healAmount == null && i.ammoAmount == null;
}

/** Copies of `id` already taken this turn, so two monkeys can share one stack. */
function remainingInStack(item: EmojiItem, takenFrom: Record<string, number>): number {
  return (item.stackCount ?? 1) - (takenFrom[item.id] ?? 0);
}

/**
 * Steal one soul emoji copy (one stack unit). Stacks lose a single copy per steal
 * rather than the whole pile, matching "snatches one emoji per adjacent turn".
 */
export function stealOneSoulEmoji(
  inventory: EmojiItem[],
  takenFrom: Record<string, number>,
): { stolen: EmojiItem; sourceId: string } | null {
  const stealable = inventory.filter(i => isSoulEmoji(i) && remainingInStack(i, takenFrom) > 0);
  if (stealable.length === 0) return null;
  const src = stealable[Math.floor(Math.random() * stealable.length)];
  takenFrom[src.id] = (takenFrom[src.id] ?? 0) + 1;
  const stolen: EmojiItem = {
    ...src,
    id: `${src.id}-stolen-${Math.random().toString(36).slice(2, 9)}`,
    stackCount: isStackableBagPassive(src) ? 1 : src.stackCount,
  };
  return { stolen, sourceId: src.id };
}

/** Apply one-copy-per-entry thefts to a bag. Source ids may repeat for stacked items. */
export function applySoulThefts(inventory: EmojiItem[], sourceIds: string[]): EmojiItem[] {
  let next = inventory;
  for (const id of sourceIds) {
    next = next.flatMap(i => {
      if (i.id !== id) return [i];
      const c = i.stackCount ?? 1;
      if (isStackableBagPassive(i) && c > 1) return [{ ...i, stackCount: c - 1 }];
      return [];
    });
  }
  return next;
}

export function restoreStolenEmojis(
  player: Pick<Player, 'inventory' | 'bank'>,
  stolen: EmojiItem[],
): { inventory: EmojiItem[]; bank: EmojiItem[]; banked: number } {
  if (stolen.length === 0) {
    return { inventory: player.inventory, bank: player.bank, banked: 0 };
  }
  const before = player.bank.length;
  const added = addToBag(player.inventory, player.bank, ...stolen);
  return { inventory: added.inventory, bank: added.bank, banked: added.bank.length - before };
}

export function stolenEmojiSummary(stolen: EmojiItem[]): string {
  return stolen.map(s => {
    const n = s.stackCount ?? 1;
    return n > 1 ? `${s.emoji}×${n}` : s.emoji;
  }).join('');
}
