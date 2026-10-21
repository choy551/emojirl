import type { EmojiItem, Enemy, GameState, MapGrid, Player, Position } from './types';
import { FOOD_EMOJI_SET } from './emojis';
import { isCookedDish, RESTAURANT_COOKED_SELL_LIMIT } from './economy';
import { livingMaxHp } from './inventory';
import { applyCompanionLevelUp, levelFromXP } from './progression';

/** If a floor has no campfire after biomes are placed, this chance adds one. */
export const LONE_CAMPFIRE_CHANCE = 0.22;

export const BANQUET_MIN_DISHES = 3;
export const BANQUET_MOOD_FLOOR_BASE = 12;
export const BANQUET_MOOD_FLOOR_PER_EXTRA = 4;
export const BANQUET_MOOD_FLOOR_CAP = 28;
export const BANQUET_TURNS_BASE = 8;
export const BANQUET_TURNS_PER_EXTRA = 2;
export const BANQUET_TURNS_CAP = 16;

/** Heal bands shared by feast and shrine offering. */
export const FOOD_TIER_SQUARE = 6;
export const FOOD_TIER_HEARTY = 10;

export type FoodTierId = 'bite' | 'square' | 'hearty';

export const FEAST_BY_TIER = {
  bite:   { attack: 1, defense: 0, turns: 6,  xp: 3, loyalty: 1 },
  square: { attack: 1, defense: 1, turns: 8,  xp: 5, loyalty: 1 },
  hearty: { attack: 2, defense: 1, turns: 10, xp: 8, loyalty: 1 },
} as const;

/** Floor-long. Same ATK/DEF tiers as a feast, with no extra duration. */
export const SHRINE_BY_TIER = {
  bite:   { attack: 1, defense: 0 },
  square: { attack: 1, defense: 1 },
  hearty: { attack: 2, defense: 1 },
} as const;

export function foodTierId(healAmount: number): FoodTierId {
  if (healAmount >= FOOD_TIER_HEARTY) return 'hearty';
  if (healAmount >= FOOD_TIER_SQUARE) return 'square';
  return 'bite';
}

export function isSinkFood(item: EmojiItem): boolean {
  return !item.consumed && item.healAmount !== undefined && item.drinkTier === undefined && FOOD_EMOJI_SET.has(item.emoji);
}

export function banquetPlan(dishCount: number): { floor: number; turns: number } {
  const extra = Math.max(0, dishCount - BANQUET_MIN_DISHES);
  return {
    floor: Math.min(BANQUET_MOOD_FLOOR_CAP, BANQUET_MOOD_FLOOR_BASE + BANQUET_MOOD_FLOOR_PER_EXTRA * extra),
    turns: Math.min(BANQUET_TURNS_CAP, BANQUET_TURNS_BASE + BANQUET_TURNS_PER_EXTRA * extra),
  };
}

export function shouldPlaceLoneCampfire(hasCampfire: boolean, roll: number): boolean {
  return !hasCampfire && roll < LONE_CAMPFIRE_CHANCE;
}

export function mapHasCampfire(map: MapGrid): boolean {
  return map.some(row => row.some(tile => tile.type === 'campfire'));
}

export function nearCampfire(map: MapGrid, pos: Position): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (map[pos.y + dy]?.[pos.x + dx]?.type === 'campfire') return true;
    }
  }
  return false;
}

const OFFER_TILES = new Set(['shrine', 'shrine-used', 'slot-shrine']);

export function nearShrineOffer(map: MapGrid, pos: Position): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const kind = map[pos.y + dy]?.[pos.x + dx]?.type;
      if (kind && OFFER_TILES.has(kind)) return true;
    }
  }
  return false;
}

export function cookedDishCount(player: Player): number {
  return [...player.inventory, ...player.bank].filter(isCookedDish).length;
}

export function sinkFoods(player: Player): EmojiItem[] {
  return [...player.inventory, ...player.bank].filter(isSinkFood);
}

export function feastDefense(enemy: { defense?: number; feastBuff?: { defense: number; turnsLeft: number } }): number {
  const bonus = enemy.feastBuff && enemy.feastBuff.turnsLeft > 0 ? enemy.feastBuff.defense : 0;
  return (enemy.defense ?? 0) + bonus;
}

export function feastAttackBonus(enemy: { feastBuff?: { attack: number; turnsLeft: number } }): number {
  if (!enemy.feastBuff || enemy.feastBuff.turnsLeft <= 0) return 0;
  return enemy.feastBuff.attack;
}

export function tickFeastBuffs<T extends { emoji: string; name: string; hp?: number; feastBuff?: Enemy['feastBuff'] }>(
  enemies: T[],
): { enemies: T[]; logs: string[] } {
  const logs: string[] = [];
  const next = enemies.map(enemy => {
    const buff = enemy.feastBuff;
    if (!buff || (enemy.hp ?? 1) <= 0) return enemy;
    const turnsLeft = buff.turnsLeft - 1;
    if (turnsLeft <= 0) {
      logs.push(`${enemy.emoji} ${enemy.name}'s feast fades.`);
      return { ...enemy, feastBuff: undefined };
    }
    return { ...enemy, feastBuff: { ...buff, turnsLeft } };
  });
  return { enemies: next, logs };
}

export function applyBanquetTick(state: GameState): GameState {
  const ticked = tickBanquet(state.player);
  if (ticked.player === state.player && !ticked.log) return state;
  const logs = ticked.log
    ? [{ id: `banquet-fade-${state.turn}`, text: ticked.log, turn: state.turn }, ...state.logs].slice(0, 24)
    : state.logs;
  return { ...state, player: ticked.player, logs };
}

export function tickBanquet(player: Player): { player: Player; log?: string } {
  const banquet = player.banquet;
  if (!banquet || banquet.turnsLeft <= 0) {
    if (!banquet) return { player };
    return { player: { ...player, banquet: undefined } };
  }
  const turnsLeft = banquet.turnsLeft - 1;
  if (turnsLeft <= 0) {
    return {
      player: { ...player, banquet: undefined },
      log: '🍽️ The banquet warmth fades.',
    };
  }
  return { player: { ...player, banquet: { ...banquet, turnsLeft } } };
}

function dropIds(player: Player, ids: Set<string>): Player {
  return {
    ...player,
    inventory: player.inventory.filter(item => !ids.has(item.id)),
    bank: player.bank.filter(item => !ids.has(item.id)),
  };
}

export interface SinkResult {
  ok: boolean;
  reason?: string;
  player?: Player;
  companion?: Enemy;
  log?: string;
}

export function executeBanquet(player: Player, offerIds: string[]): SinkResult {
  const unique = [...new Set(offerIds)];
  const held = new Map([...player.inventory, ...player.bank].map(item => [item.id, item]));
  const dishes: EmojiItem[] = [];
  for (const id of unique) {
    const item = held.get(id);
    if (!item || !isCookedDish(item)) return { ok: false, reason: 'A banquet takes cooked dishes only.' };
    dishes.push(item);
  }
  if (dishes.length < BANQUET_MIN_DISHES) {
    return { ok: false, reason: `Dump at least ${BANQUET_MIN_DISHES} cooked dishes.` };
  }
  const plan = banquetPlan(dishes.length);
  const spent = dropIds(player, new Set(unique));
  const pool = livingMaxHp(spent);
  const hp = Math.max(spent.stats.hp, pool);
  return {
    ok: true,
    player: {
      ...spent,
      stats: { ...spent.stats, hp },
      banquet: { floor: plan.floor, turnsLeft: plan.turns },
    },
    log: `🍽️ Banquet of ${dishes.length} dishes. Fully healed. Mood floor ${plan.floor} for ${plan.turns} turns.`,
  };
}

export function executeFeast(player: Player, companion: Enemy, itemId: string): SinkResult {
  const item = player.inventory.find(entry => entry.id === itemId && !entry.consumed)
    ?? player.bank.find(entry => entry.id === itemId && !entry.consumed);
  if (!item || !isSinkFood(item)) return { ok: false, reason: 'Companions feast on food, not potions, hearts, or gold.' };
  const tier = FEAST_BY_TIER[foodTierId(item.healAmount ?? 0)];
  const xp = (companion.xp ?? 0) + tier.xp;
  const oldLevel = companion.level ?? levelFromXP(companion.xp ?? 0);
  const newLevel = levelFromXP(xp);
  let next: Enemy = {
    ...companion,
    xp,
    level: oldLevel,
    loyalty: (companion.loyalty ?? 0) + tier.loyalty,
    feastBuff: {
      attack: tier.attack,
      defense: tier.defense,
      turnsLeft: tier.turns,
      label: item.name,
    },
  };
  if (newLevel > oldLevel) next = applyCompanionLevelUp(next, oldLevel, newLevel);
  const defense = tier.defense > 0 ? ` +${tier.defense} DEF` : '';
  const levelNote = newLevel > oldLevel ? ` Level ${newLevel}!` : '';
  return {
    ok: true,
    player: dropIds(player, new Set([item.id])),
    companion: next,
    log: `🍽️ ${companion.emoji} ${companion.name} feasts on ${item.emoji} ${item.name}. +${tier.attack} ATK${defense} for ${tier.turns} turns, +${tier.xp} XP, loyalty ${next.loyalty}.${levelNote}`,
  };
}

export function executeShrineOffer(player: Player, itemId: string): SinkResult {
  if (player.shrineOffering) return { ok: false, reason: 'This floor already holds your offering.' };
  const item = player.inventory.find(entry => entry.id === itemId && !entry.consumed)
    ?? player.bank.find(entry => entry.id === itemId && !entry.consumed);
  if (!item || !isSinkFood(item)) return { ok: false, reason: 'The shrine wants food, not gold or potions.' };
  const tierId = foodTierId(item.healAmount ?? 0);
  const tier = SHRINE_BY_TIER[tierId];
  const defense = tier.defense > 0 ? ` +${tier.defense} DEF` : '';
  return {
    ok: true,
    player: {
      ...dropIds(player, new Set([item.id])),
      shrineOffering: {
        attack: tier.attack,
        defense: tier.defense,
        turnsNote: 'floor',
        label: item.name,
        foodEmoji: item.emoji,
      },
    },
    log: `🛕 The shrine accepts ${item.emoji} ${item.name}. Floor blessing: +${tier.attack} ATK${defense}.`,
  };
}

export function shrineOfferBonus(player: Player): { attack: number; defense: number } {
  const offer = player.shrineOffering;
  if (!offer) return { attack: 0, defense: 0 };
  return { attack: offer.attack, defense: offer.defense };
}

export function clearShrineOffering(player: Player): Player {
  if (!player.shrineOffering) return player;
  return { ...player, shrineOffering: undefined };
}

export function foodSinkRulesBlurb(): string {
  const three = banquetPlan(BANQUET_MIN_DISHES);
  const four = banquetPlan(BANQUET_MIN_DISHES + 1);
  return `Food sinks spend meals. The restaurant still buys only ${RESTAURANT_COOKED_SELL_LIMIT} cooked dishes. Campfire Banquet: at a campfire (a lone 🔥 is added on about ${Math.round(LONE_CAMPFIRE_CHANCE * 100)}% of floors that have none), dump at least ${BANQUET_MIN_DISHES} cooked dishes for a full heal. Mood is held at ${three.floor} for ${three.turns} turns, plus ${BANQUET_MOOD_FLOOR_PER_EXTRA} mood and ${BANQUET_TURNS_PER_EXTRA} turns per extra dish (4 dishes: floor ${four.floor} for ${four.turns} turns), capped at ${BANQUET_MOOD_FLOOR_CAP} and ${BANQUET_TURNS_CAP} turns. The floor does not override a last-stand mood below 20% HP. Companion Feast: feed one food to an adjacent companion. Heal 1–${FOOD_TIER_SQUARE - 1}: +${FEAST_BY_TIER.bite.attack} ATK for ${FEAST_BY_TIER.bite.turns} turns and +${FEAST_BY_TIER.bite.xp} XP. Heal ${FOOD_TIER_SQUARE}–${FOOD_TIER_HEARTY - 1}: +${FEAST_BY_TIER.square.attack} ATK +${FEAST_BY_TIER.square.defense} DEF for ${FEAST_BY_TIER.square.turns} turns and +${FEAST_BY_TIER.square.xp} XP. Heal ${FOOD_TIER_HEARTY}+: +${FEAST_BY_TIER.hearty.attack} ATK +${FEAST_BY_TIER.hearty.defense} DEF for ${FEAST_BY_TIER.hearty.turns} turns and +${FEAST_BY_TIER.hearty.xp} XP. Each feast adds +1 loyalty. A new feast replaces the buff. Shrine Offering: once per floor, at a shrine or slot shrine, offer one food for a floor-long blessing with the same ATK/DEF tiers. It ends when you descend. Potions, hearts, and gold are not food.`;
}

export function feastBuffLabel(item: EmojiItem): string {
  if (!isSinkFood(item)) return '';
  const tier = FEAST_BY_TIER[foodTierId(item.healAmount ?? 0)];
  const defense = tier.defense > 0 ? ` +${tier.defense} DEF` : '';
  return `+${tier.attack} ATK${defense} · ${tier.turns} turns · +${tier.xp} XP`;
}

export function shrineBuffLabel(item: EmojiItem): string {
  if (!isSinkFood(item)) return '';
  const tier = SHRINE_BY_TIER[foodTierId(item.healAmount ?? 0)];
  const defense = tier.defense > 0 ? ` +${tier.defense} DEF` : '';
  return `+${tier.attack} ATK${defense} this floor`;
}
