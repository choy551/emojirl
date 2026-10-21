import type { ActiveKind, EmojiItem, Player, VoidGhost } from './types';
import { ACTIVE_DROPS } from './emojis';
import { getItemSellValue } from './economy';
import { buildHotbarSlots, grantGhostStack, removeAndRefillBag } from './inventory';
import { recordEmojiConsume } from './meta';
import { GHOST_LINGER_TEXT, padGhostHotbar } from './voidDamage';
import { recordHotbarSoulConsume } from './voidMeta';
import { noteThemedHotbarConsume } from './voidAbilities';

const CHARGE_KINDS = new Set<ActiveKind>(['bomb', 'gun', 'boomerang', 'rope', 'freeze']);

const KIND_EMOJI: Record<ActiveKind, string> = {
  bomb: '💣',
  gun: '🔫',
  boomerang: '🪃',
  rope: '🪢',
  freeze: '❄️',
};

export function chargeKindForEmoji(emoji: string): ActiveKind | null {
  const drop = ACTIVE_DROPS.find(d => d.emoji === emoji);
  return drop?.activeKind ?? null;
}

export function isMoneyBagItem(item: Pick<EmojiItem, 'emoji' | 'isMoneyBag'> | null | undefined): boolean {
  return !!item && (!!item.isMoneyBag || item.emoji === '💰');
}

/** Actives and money bags that occupy a Void hotbar slot and cannot be fired or sold away. */
export function isVoidBurdenActive(item: EmojiItem | null | undefined): boolean {
  if (!item || item.consumed || item.isVoidGhost || item.isEquipment) return false;
  if (item.ammoAmount !== undefined) return false;
  if (isMoneyBagItem(item)) return true;
  return !!item.activeKind && CHARGE_KINDS.has(item.activeKind);
}

/** Catalog charge count for this pickup. Boomerang is -1 (endless). */
export function normalChargeCount(item: Pick<EmojiItem, 'emoji' | 'activeKind' | 'charges'>): number {
  const drop = ACTIVE_DROPS.find(d => d.emoji === item.emoji)
    ?? ACTIVE_DROPS.find(d => item.activeKind && d.activeKind === item.activeKind);
  if (drop && typeof drop.charges === 'number') return drop.charges;
  if (typeof item.charges === 'number') return item.charges;
  return 1;
}

export function locateVoidGhost(player: Player, emoji: string): {
  where: 'hotbar' | 'bank';
  index: number;
  ghost: VoidGhost;
} | null {
  const hot = padGhostHotbar(player.ghostHotbar);
  const hi = hot.findIndex(g => g?.emoji === emoji);
  if (hi !== -1 && hot[hi]) return { where: 'hotbar', index: hi, ghost: hot[hi]! };
  const bank = player.ghostBank ?? [];
  const bi = bank.findIndex(g => g.emoji === emoji);
  if (bi !== -1) return { where: 'bank', index: bi, ghost: bank[bi] };
  return null;
}

/** Uses stored on the ghost, or the catalog charge count when an older save omitted them. */
export function resolvedChargeUses(ghost: VoidGhost): { uses: number; maxUses: number } | null {
  const drop = ACTIVE_DROPS.find(d => d.emoji === ghost.emoji);
  if (!drop || typeof drop.charges !== 'number') return null;
  const maxUses = typeof ghost.maxUses === 'number' ? ghost.maxUses : drop.charges;
  const uses = typeof ghost.uses === 'number' ? ghost.uses : maxUses;
  return { uses, maxUses };
}

export function writeGhostCharge(player: Player, emoji: string, uses: number, maxUses: number): Player {
  const loc = locateVoidGhost(player, emoji);
  if (!loc) return player;
  const ghost: VoidGhost = { ...loc.ghost, uses, maxUses };
  if (loc.where === 'hotbar') {
    const hot = padGhostHotbar(player.ghostHotbar);
    hot[loc.index] = ghost;
    return { ...player, ghostHotbar: hot };
  }
  const bank = [...(player.ghostBank ?? [])];
  bank[loc.index] = ghost;
  return { ...player, ghostBank: bank };
}

export function chargeGhostUseRefusal(
  display: Pick<EmojiItem, 'isVoidGhost' | 'isVoidGhostDormant' | 'emoji'>,
  ghost: VoidGhost | null | undefined,
): string | null {
  if (!display.isVoidGhost) return null;
  if (!chargeKindForEmoji(display.emoji)) return GHOST_LINGER_TEXT;
  if (display.isVoidGhostDormant) return '👤 That ghost is dormant on this depth.';
  if (!ghost) return `👤 ${display.emoji} ghost is gone.`;
  const resolved = resolvedChargeUses(ghost);
  if (!resolved) return GHOST_LINGER_TEXT;
  if (resolved.uses === -1 || resolved.maxUses === -1) return null;
  if (resolved.uses <= 0) return `👤 ${display.emoji} ghost has no uses left. Consume another to recharge it.`;
  return null;
}

export function spendChargeGhostUse(player: Player, emoji: string): { ok: boolean; player: Player; uses: number } {
  const loc = locateVoidGhost(player, emoji);
  if (!loc) return { ok: false, player, uses: 0 };
  const resolved = resolvedChargeUses(loc.ghost);
  if (!resolved) return { ok: false, player, uses: 0 };
  if (resolved.maxUses === -1 || resolved.uses === -1) {
    return { ok: true, player: writeGhostCharge(player, emoji, -1, -1), uses: -1 };
  }
  if (resolved.uses <= 0) return { ok: false, player, uses: 0 };
  const uses = resolved.uses - 1;
  return { ok: true, player: writeGhostCharge(player, emoji, uses, resolved.maxUses), uses };
}

/**
 * Void projectile / rope spend. Does not touch inventory, the consume catalog, or pressure.
 * Dormant ghosts and empty uses refuse.
 */
export function spendChargeGhostByKind(player: Player, kind: ActiveKind): {
  ok: boolean;
  player: Player;
  uses: number;
  refusal: string | null;
  emoji: string;
} {
  const emoji = KIND_EMOJI[kind];
  const cell = buildHotbarSlots(player).find(s => s?.isVoidGhost && s.emoji === emoji);
  const ghost = locateVoidGhost(player, emoji)?.ghost;
  if (!cell || !ghost) {
    return { ok: false, player, uses: 0, refusal: `👤 No ${emoji} ghost to spend.`, emoji };
  }
  const refusal = chargeGhostUseRefusal(cell, ghost);
  if (refusal) {
    const resolved = resolvedChargeUses(ghost);
    return { ok: false, player, uses: resolved?.uses ?? 0, refusal, emoji };
  }
  const spent = spendChargeGhostUse(player, emoji);
  if (!spent.ok) {
    return {
      ok: false,
      player,
      uses: 0,
      refusal: `👤 ${emoji} ghost has no uses left. Consume another to recharge it.`,
      emoji,
    };
  }
  return { ok: true, player: spent.player, uses: spent.uses, refusal: null, emoji };
}

/** Hotbar corner for a ghost: finite uses, endless mark, or soul stack. */
export function voidGhostBadge(item: Pick<EmojiItem, 'charges' | 'stackCount'>): string {
  if (item.charges === -1) return '∞';
  if (item.charges !== undefined && item.charges >= 0) return `×${item.charges}`;
  return `×${Math.max(1, item.stackCount ?? 1)}`;
}

export interface VoidBurdenConsumeResult {
  removed: boolean;
  player: Player;
  logs: string[];
  goldGained: number;
}

function formatUses(uses: number, maxUses: number): string {
  if (uses === -1 || maxUses === -1) return 'endless uses';
  return `${uses}/${maxUses} uses`;
}

/**
 * Void-only. Removes a charge item or money bag from the hotbar.
 * Charge items advance Mnemonic Hunger and, once unlocked, refill that ghost's uses.
 * Money bags pay their sell value in gold and do not unlock a ghost.
 */
export function consumeVoidBurdenItem(player: Player, item: EmojiItem, floor: number): VoidBurdenConsumeResult {
  const keep: VoidBurdenConsumeResult = { removed: false, player, logs: [], goldGained: 0 };
  if (player.characterClass !== '👤' || !isVoidBurdenActive(item)) return keep;
  if (!player.inventory.some(i => i.id === item.id)) return keep;

  const { inventory, bank } = removeAndRefillBag(player.inventory, player.bank, item.id);
  let next: Player = { ...player, inventory, bank };
  const logs: string[] = [];

  if (isMoneyBagItem(item)) {
    const gold = getItemSellValue(item, 1, floor);
    next = { ...next, stats: { ...next.stats, gold: next.stats.gold + gold } };
    logs.push(`💰 ${item.name} unmade — +${gold}g. The slot is empty.`);
    recordEmojiConsume(item.emoji);
    return { removed: true, player: next, logs, goldGained: gold };
  }

  const rec = recordHotbarSoulConsume(item.emoji);
  const maxUses = normalChargeCount(item);
  if (rec.unlocks >= 1) {
    if (!locateVoidGhost(next, item.emoji) || rec.crossed) {
      next = grantGhostStack(next, item.emoji, rec.unlocks);
    }
    if (rec.crossed && rec.unlocks === 1) {
      next = writeGhostCharge(next, item.emoji, maxUses, maxUses);
      logs.push(`👤 ${item.emoji} ${item.name} unmade (${rec.consumes}/10). Ghost unlocked — ${formatUses(maxUses, maxUses)}.`);
    } else if (maxUses === -1) {
      next = writeGhostCharge(next, item.emoji, -1, -1);
      logs.push(`👤 ${item.emoji} ${item.name} unmade. ${item.emoji} ghost stays endless.${rec.crossed ? ` Ghost stack ×${rec.unlocks}.` : ''}`);
    } else {
      const before = resolvedChargeUses(locateVoidGhost(next, item.emoji)?.ghost ?? { emoji: item.emoji, stacks: rec.unlocks })?.uses ?? 0;
      const after = Math.min(maxUses, before + 1);
      next = writeGhostCharge(next, item.emoji, after, maxUses);
      const moved = before >= maxUses
        ? `${item.emoji} ghost stays at ${formatUses(maxUses, maxUses)}.`
        : `${item.emoji} ghost uses ${before} → ${after} (max ${maxUses}).`;
      logs.push(`👤 ${item.emoji} ${item.name} unmade. ${moved}${rec.crossed ? ` Ghost stack ×${rec.unlocks}.` : ''}`);
    }
  } else {
    logs.push(`👤 ${item.emoji} ${item.name} unmade (${rec.consumes}/10 toward a ghost). The slot is empty.`);
  }

  recordEmojiConsume(item.emoji);
  const themed = noteThemedHotbarConsume(item);
  if (themed) logs.push(themed.text);
  return { removed: true, player: next, logs, goldGained: 0 };
}
