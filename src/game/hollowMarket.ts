import type { EmojiItem, Player, VoidGhost } from './types';
import { EMOJI_POWERS } from './emojis';
import { grantGhostStack } from './inventory';
import { isVoidSoulSpend } from './voidDamage';
import { addVoidConsumes, readGhostCatalog, spareConsumes, spendSpareConsumes } from './voidMeta';

/** About 22% of Void-run floors, from D:1. Other classes never roll the tile. */
export const HOLLOW_CHANCE = 0.22;
export const HOLLOW_MIN_FLOOR = 1;
export const HOLLOW_EMOJI = '🌑';

/** Destroy one real hotbar soul. That emoji gains this many consumes. */
export const HOLLOW_UNMAKE_CONSUMES = 3;
/** Spare consumes (above the current stack floor) moved onto a different soul. */
export const HOLLOW_REROLL_SPARE = 5;
/** HP paid for a blood offering. The player must remain at 1 HP or more. */
export const HOLLOW_HP_COST = 5;
/** Consumes granted to one held ghost by a blood offering. */
export const HOLLOW_HP_CONSUMES = 2;

export function shouldPlaceHollow(floor: number, roll: number, voidRun: boolean): boolean {
  return voidRun && floor >= HOLLOW_MIN_FLOOR && roll < HOLLOW_CHANCE;
}

export interface HollowResult {
  ok: boolean;
  player?: Player;
  reason?: string;
  log?: string;
  hollowUsedFloor?: number;
}

export interface CatalogSpareRow {
  emoji: string;
  spare: number;
  consumes: number;
  unlocks: number;
}

function refuse(player: Player, floor: number, used?: number): string | null {
  if (player.characterClass !== '👤') return 'The Hollow Market is closed. Only the Void may unmake here.';
  if (used === floor) return 'The market already took its due this floor.';
  return null;
}

function withGhost(player: Player, emoji: string, unlocks: number, crossed: boolean): Player {
  if (!crossed) return player;
  return grantGhostStack(player, emoji, unlocks);
}

export function hollowSoulChoices(player: Player): EmojiItem[] {
  return player.inventory.filter(isVoidSoulSpend);
}

export function catalogSpareRows(): CatalogSpareRow[] {
  return Object.entries(readGhostCatalog())
    .map(([emoji, entry]) => ({
      emoji,
      spare: spareConsumes(entry),
      consumes: entry.consumes,
      unlocks: entry.unlocks,
    }))
    .filter(row => row.consumes > 0)
    .sort((a, b) => b.spare - a.spare || a.emoji.localeCompare(b.emoji));
}

export function hollowRerollTargets(source: string): string[] {
  return EMOJI_POWERS.filter(entry => entry.bagPassive && entry.emoji !== source).map(entry => entry.emoji);
}

export function heldGhostEmojis(player: Player): string[] {
  const hot = (player.ghostHotbar ?? []).filter((g): g is VoidGhost => !!g).map(g => g.emoji);
  const bank = (player.ghostBank ?? []).map(g => g.emoji);
  return [...new Set([...hot, ...bank])];
}

/** Unmake one hotbar soul for consume progress. Gold is never read or written. */
export function unmakeAtMarket(player: Player, itemId: string, floor: number, used?: number): HollowResult {
  const block = refuse(player, floor, used);
  if (block) return { ok: false, reason: block };
  const item = player.inventory.find(i => i.id === itemId);
  if (!item || !isVoidSoulSpend(item)) return { ok: false, reason: 'That is not a soul the Void can unmake.' };
  const gold = player.stats.gold;
  let next: Player = {
    ...player,
    inventory: player.inventory.filter(i => i.id !== itemId),
  };
  const gained = addVoidConsumes(item.emoji, HOLLOW_UNMAKE_CONSUMES);
  next = withGhost(next, item.emoji, gained.unlocks, gained.crossed);
  if (next.stats.gold !== gold) next = { ...next, stats: { ...next.stats, gold } };
  const stackNote = gained.crossed ? ` Ghost stack ×${gained.unlocks}.` : '';
  return {
    ok: true,
    player: next,
    hollowUsedFloor: floor,
    log: `🌑 Unmade ${item.emoji}. ${item.emoji} +${HOLLOW_UNMAKE_CONSUMES} consumes (${gained.consumes}).${stackNote}`,
  };
}

/** Move spare consume progress onto a different soul. Current stacks of the source stay. */
export function rerollVoidProgress(
  player: Player,
  source: string,
  floor: number,
  used: number | undefined,
  roll: number,
): HollowResult {
  const block = refuse(player, floor, used);
  if (block) return { ok: false, reason: block };
  const entry = readGhostCatalog()[source];
  if (spareConsumes(entry) < HOLLOW_REROLL_SPARE) {
    return { ok: false, reason: `Need ${HOLLOW_REROLL_SPARE} spare consumes above the current ghost stacks.` };
  }
  const targets = hollowRerollTargets(source);
  if (targets.length === 0) return { ok: false, reason: 'No other soul can take the progress.' };
  const dest = targets[Math.min(targets.length - 1, Math.floor(Math.max(0, roll) * targets.length))]!;
  const spent = spendSpareConsumes(source, HOLLOW_REROLL_SPARE);
  if (!spent.ok) return { ok: false, reason: 'Those consumes are already bound into a ghost stack.' };
  const gained = addVoidConsumes(dest, HOLLOW_REROLL_SPARE);
  const next = withGhost(player, dest, gained.unlocks, gained.crossed);
  const stackNote = gained.crossed ? ` ${dest} ghost stack ×${gained.unlocks}.` : '';
  return {
    ok: true,
    player: next,
    hollowUsedFloor: floor,
    log: `🌑 Moved ${HOLLOW_REROLL_SPARE} consumes from ${source} onto ${dest}.${stackNote}`,
  };
}

/** Pay HP for consume progress on a ghost already held. Gold is never read or written. */
export function offerBlood(player: Player, emoji: string, floor: number, used?: number): HollowResult {
  const block = refuse(player, floor, used);
  if (block) return { ok: false, reason: block };
  if (!heldGhostEmojis(player).includes(emoji)) return { ok: false, reason: 'Offer blood only to a ghost you hold.' };
  if (player.stats.hp < HOLLOW_HP_COST + 1) {
    return { ok: false, reason: `Need ${HOLLOW_HP_COST + 1} HP. The offering must leave you alive.` };
  }
  const gold = player.stats.gold;
  const gained = addVoidConsumes(emoji, HOLLOW_HP_CONSUMES);
  let next = withGhost({
    ...player,
    stats: { ...player.stats, hp: player.stats.hp - HOLLOW_HP_COST },
  }, emoji, gained.unlocks, gained.crossed);
  if (next.stats.gold !== gold) next = { ...next, stats: { ...next.stats, gold } };
  const stackNote = gained.crossed ? ` Ghost stack ×${gained.unlocks}.` : '';
  return {
    ok: true,
    player: next,
    hollowUsedFloor: floor,
    log: `🌑 Offered ${HOLLOW_HP_COST} HP. ${emoji} +${HOLLOW_HP_CONSUMES} consumes (${gained.consumes}).${stackNote}`,
  };
}

export function voidExtrasRulesBlurb(): string {
  return `Hollow Market ${HOLLOW_EMOJI}: about ${Math.round(HOLLOW_CHANCE * 100)}% of floors on a Void run, from D:${HOLLOW_MIN_FLOOR}. The Void does not deal in gold. Unmake one hotbar soul for +${HOLLOW_UNMAKE_CONSUMES} consumes of that emoji. Move ${HOLLOW_REROLL_SPARE} spare consumes — progress above the current ghost stacks — onto a different soul. The source stack stays. Offer ${HOLLOW_HP_COST} HP, leaving at least 1, for +${HOLLOW_HP_CONSUMES} consumes on a ghost you hold. Another 10 consumes grants that ghost's next stack. One trade per floor. Autoexplore stops on the tile. Grace: when inverted Void burden damage would kill you, one turn per floor reduces that hit so you keep 1 HP, logs a warning, and flashes GRACE. The next lethal burden on that floor is final. A hit that does not kill does not spend the grace. Ghost stack counts show on the hotbar and in tooltips, including ×1. Stackable ghost effects use that count. Flat bonuses such as Fire's +1 ATK do not grow with ghost stacks.`;
}
