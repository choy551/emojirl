import { EmojiItem } from './types';
import { soulConsumeEffect } from './shopUse';
import { GHOST_LINGER_TEXT } from './voidDamage';
import { isVoidBurdenActive } from './voidCharge';

export interface BagActOpts {
  /** Void unmakes charge items and money bags instead of aiming or selling them. */
  asVoid?: boolean;
}

/** Aimed actives are used from the field, not spent by the Consume button. */
const AIMED_KINDS = new Set(['gun', 'boomerang', 'freeze', 'bomb']);

export const BAG_DOUBLE_TAP_MS = 500;
export const BAG_LONG_PRESS_MS = 500;

export interface BagTapMemory {
  slot: number;
  at: number;
  /** True when that tap only selected or deselected — not a swap/move. */
  selectOnly: boolean;
}

export type BagSlotAction = 'select' | 'use' | 'refuse';

function isMoneyBag(item: EmojiItem): boolean {
  return !!item.isMoneyBag || item.emoji === '💰';
}

function isAimed(item: EmojiItem): boolean {
  return !!item.activeKind && AIMED_KINDS.has(item.activeKind);
}

/**
 * Items the bag Consume button can spend through the hotbar use path.
 * Aimed weapons, gear, ammo, and money bags are not consumed here.
 */
export function canConsumeBagItem(item: EmojiItem | null | undefined, opts?: BagActOpts): boolean {
  if (!item || item.consumed || item.isVoidGhost) return false;
  if (item.isEquipment || item.ammoAmount !== undefined) return false;
  if (opts?.asVoid && isVoidBurdenActive(item)) return true;
  if (isMoneyBag(item)) return false;
  if (isAimed(item)) return false;
  if (item.activeKind === 'rope') return true;
  if (item.healAmount !== undefined) return true;
  if (soulConsumeEffect(item) || item.bagPassive) return true;
  return false;
}

/** Double-tap: hotbar use when that path is safe; otherwise a log hint. */
export function bagDoubleTapDisposition(item: EmojiItem | null | undefined, opts?: BagActOpts): 'use' | 'refuse' {
  if (!item || item.consumed) return 'refuse';
  if (canConsumeBagItem(item, opts)) return 'use';
  if (isAimed(item)) return 'use';
  return 'refuse';
}

export function bagConsumeRefusal(item: EmojiItem, opts?: BagActOpts): string {
  if (item.consumed) return `${item.emoji} ${item.name} is already used.`;
  if (item.isVoidGhost) return GHOST_LINGER_TEXT;
  if (item.isEquipment) return `${item.emoji} ${item.name} is equipment — equip it from the Equip tab.`;
  if (item.ammoAmount !== undefined) return `${item.emoji} ${item.name} is ammo — it can't be consumed.`;
  if (opts?.asVoid && isVoidBurdenActive(item)) return `${item.emoji} ${item.name} can be unmade from the hotbar.`;
  if (isMoneyBag(item)) return "💰 It's full of coins — sell it at a shop.";
  if (isAimed(item)) return `${item.emoji} ${item.name} needs a direction — double-tap the slot to aim.`;
  return `${item.emoji} ${item.name} can't be consumed.`;
}

/** Aiming and the boat warning need the map, so the bag has to close first. */
export function mobileBagUseClosesBag(item: EmojiItem, opts?: BagActOpts): boolean {
  if (opts?.asVoid && isVoidBurdenActive(item)) return false;
  return item.emoji === '⛵' || isAimed(item);
}

export type ConsumeButtonMode = 'hidden' | 'enabled' | 'disabled';

export function consumeButtonMode(offerConsume: boolean, item: EmojiItem, opts?: BagActOpts): ConsumeButtonMode {
  if (!offerConsume) return 'hidden';
  return canConsumeBagItem(item, opts) ? 'enabled' : 'disabled';
}

/**
 * Mobile bag Items tap. Non-mobile clicks always select, so the desktop bag
 * stays on the existing select / swap path.
 * A second tap on the same slot consumes only when the first tap did not
 * start a move (another item was already selected).
 */
export function resolveBagSlotClick(args: {
  mobile: boolean;
  slot: number;
  item: EmojiItem | null;
  selectedItemId: string | null;
  now: number;
  last: BagTapMemory | null;
  thresholdMs?: number;
  asVoid?: boolean;
}): { action: BagSlotAction; last: BagTapMemory | null } {
  if (!args.mobile || !args.item) {
    return { action: 'select', last: null };
  }

  const threshold = args.thresholdMs ?? BAG_DOUBLE_TAP_MS;
  const willMove = args.selectedItemId != null && args.selectedItemId !== args.item.id;
  const last = args.last;
  const isDouble =
    !!last &&
    last.selectOnly &&
    last.slot === args.slot &&
    args.now - last.at >= 0 &&
    args.now - last.at <= threshold &&
    !willMove;

  if (isDouble) {
    return { action: bagDoubleTapDisposition(args.item, { asVoid: args.asVoid }), last: null };
  }

  return {
    action: 'select',
    last: { slot: args.slot, at: args.now, selectOnly: !willMove },
  };
}
