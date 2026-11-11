import type { EmojiItem, GameState, Player } from './types';
import type { SoulEffect } from './emojis';
import { EMOJI_POWERS } from './emojis';
import { applyStarConsume, pillOverhealHp } from './emojiBalance';
import { addToPlayerBag, applySoulHp, livingMaxHp, playerSoftCap } from './inventory';
import { STACKABLE_BAG_CAPS, isStackableBagPassive } from './passives';
import { moodMax, levelFromXP } from './progression';
import { recordRunEmojiConsume } from './meta';
import { goldWithLuck } from './softCap';

/** Aimed gear and other items whose use is not a stat grant. */
export function autoConsumeExcluded(item: EmojiItem): boolean {
  if (item.consumed || item.isEquipment || item.isStructure || item.isVoidGhost) return true;
  if (item.isMoneyBag || item.emoji === '💰') return true;
  if (item.activeKind) return true;
  if (item.healAmount !== undefined || item.drinkTier !== undefined || item.ammoAmount !== undefined) return true;
  return false;
}

function soulEffect(item: EmojiItem): SoulEffect | undefined {
  const onItem = (item as { effect?: SoulEffect }).effect;
  if (onItem) return onItem;
  return EMOJI_POWERS.find(entry => entry.emoji === item.emoji)?.effect;
}

function applyOne(player: Player, item: EmojiItem, logs: string[]): Player | null {
  if (item.emoji === '🌟') return applyStarConsume(player, text => logs.push(text));
  if (item.emoji === '💊') {
    const pool = livingMaxHp(player);
    const hp = pillOverhealHp(pool);
    logs.push(`💊 The pill mends you — full heal and +${hp - pool} overheal.`);
    return { ...player, stats: { ...player.stats, hp } };
  }
  const effect = soulEffect(item);
  if (!effect) return null;
  const stats = { ...player.stats };
  const souled = applySoulHp({ ...player, stats }, effect);
  stats.hp = souled.stats.hp;
  stats.maxHp = souled.stats.maxHp;
  stats.defense = souled.stats.defense;
  if (effect.attackBonus) stats.attack += effect.attackBonus;
  if (effect.speedBonus) stats.speed = (stats.speed ?? 0) + effect.speedBonus;
  if (effect.evasionBonus) stats.evasion = (stats.evasion ?? 0) + effect.evasionBonus;
  if (effect.luckBonus) stats.luck = (stats.luck ?? 0) + effect.luckBonus;
  if (effect.moodBonus) stats.moodValue = Math.min(moodMax(player.characterClass), stats.moodValue + effect.moodBonus);
  if (effect.xpBonus) {
    const xp = stats.xp + effect.xpBonus;
    const level = levelFromXP(xp);
    if (level > stats.level) logs.push(`✨ Level up! You are now level ${level}!`);
    stats.xp = xp;
    stats.level = level;
  }
  if (item.emoji === '⛵') {
    const gained = goldWithLuck(50, playerSoftCap(player).raw.luck);
    stats.gold = (stats.gold ?? 0) + gained;
    logs.push(`${item.emoji} ${effect.label} +${gained}g from the voyage!`);
  }
  return { ...player, stats };
}

/**
 * Use passive and stat emoji that were routed to the Bank.
 * On-demand items stay. A stacking emoji fills its hotbar stack first;
 * only copies past that cap are used.
 */
export function consumeBankExtras(player: Player): { player: Player; logs: string[] } {
  if (!player.autoConsumeBank) return { player, logs: [] };
  const logs: string[] = [];
  let next = player;
  let inventory = [...player.inventory];
  let folded = false;
  const keep: EmojiItem[] = [];
  for (const item of player.bank) {
    if (autoConsumeExcluded(item)) {
      keep.push(item);
      continue;
    }
    const copies = Math.max(1, item.stackCount ?? 1);
    let pending = copies;
    if (isStackableBagPassive(item)) {
      const cap = STACKABLE_BAG_CAPS[item.emoji] ?? 9;
      const idx = inventory.findIndex(entry => !entry.consumed && entry.emoji === item.emoji && isStackableBagPassive(entry));
      if (idx !== -1) {
        const hot = inventory[idx];
        const room = Math.max(0, cap - (hot.stackCount ?? 1));
        if (room > 0) {
          const toStack = Math.min(room, pending);
          inventory[idx] = { ...hot, stackCount: (hot.stackCount ?? 1) + toStack };
          pending -= toStack;
          folded = true;
        }
      }
      const hotNow = inventory.find(entry => !entry.consumed && entry.emoji === item.emoji && isStackableBagPassive(entry));
      if (!hotNow || (hotNow.stackCount ?? 1) < cap) {
        if (pending > 0) keep.push(pending === copies ? item : { ...item, stackCount: pending });
        continue;
      }
    }
    if (pending <= 0) continue;
    let applied = { ...next, inventory };
    const gained: string[] = [];
    let spent = 0;
    for (let n = 0; n < pending; n++) {
      const step = applyOne(applied, item, gained);
      if (!step) break;
      applied = step;
      inventory = step.inventory;
      recordRunEmojiConsume(item.emoji, 1, item);
      spent += 1;
    }
    if (spent === 0) {
      keep.push(pending === copies ? item : { ...item, stackCount: pending });
      continue;
    }
    if (spent < pending) keep.push({ ...item, stackCount: pending - spent });
    logs.push(`🫳 Auto-consumed ${item.emoji} ${item.name}${spent > 1 ? ` ×${spent}` : ''}.`);
    logs.push(...gained);
    next = applied;
    inventory = applied.inventory;
  }
  if (logs.length === 0 && !folded) return { player, logs };
  return { player: { ...next, inventory, bank: keep }, logs };
}

/** Park a find, then use anything the Bank sweep would use. */
export function stowFoundItems(player: Player, ...items: EmojiItem[]): { player: Player; logs: string[] } {
  const added = addToPlayerBag(player, ...items);
  const packed: Player = { ...player, inventory: added.inventory, bank: added.bank, food: added.food };
  if (!packed.autoConsumeBank) return { player: packed, logs: [] };
  return consumeBankExtras(packed);
}

export function noteAutoConsume(state: GameState): GameState {
  const drained = consumeBankExtras(state.player);
  if (drained.player === state.player && drained.logs.length === 0) return state;
  const entries = drained.logs.map((text, i) => ({ id: `auto-consume-${state.turn}-${i}`, text, turn: state.turn }));
  return {
    ...state,
    player: drained.player,
    logs: entries.length > 0 ? [...entries, ...state.logs].slice(0, 24) : state.logs,
  };
}

export function toggleAutoConsume(player: Player): { player: Player; log: string } {
  const autoConsumeBank = !player.autoConsumeBank;
  return {
    player: { ...player, autoConsumeBank },
    log: autoConsumeBank
      ? '🫳 Auto-consume on. Excess Bank emoji are used for their effect.'
      : '🫳 Auto-consume off.',
  };
}
