import type { BountyQuest, BountyReward, EmojiItem, Enemy, GameState, Player, VanityLoadout, VanityTitleId, VanityTrailId } from './types';
import { getEmojiPowerByEmoji } from './emojis';
import { chebyshev } from './geo';
import { addToPlayerBag } from './inventory';

/** Ante for a floor contract. D:1 is the floor. D:26 reaches the cap. */
export const BOUNTY_ANTE_BASE = 100;
export const BOUNTY_ANTE_PER_FLOOR = 32;
export const BOUNTY_ANTE_CAP = 900;
export const BOUNTY_MIN_FLOOR = 1;
export const BOUNTY_CHANCE = 0.30;

export const KILL_BASE = 2;
export const KILL_EVERY = 8;
export const KILL_CAP = 5;

export const SURVIVE_BASE = 6;
export const SURVIVE_EVERY = 5;
export const SURVIVE_CAP = 12;

/** Chance the posted reward is rare. The rest are uncommon named souls. */
export const RARE_CHANCE_BASE = 0.25;
export const RARE_CHANCE_PER_FLOOR = 0.02;
export const RARE_CHANCE_CAP = 0.70;

/** Same floors Dungeon Pressure starts: D:16 and deeper. */
export const VANITY_MIN_FLOOR = 16;
export const VANITY_CHANCE = 0.40;

export const AUCTION_GOLD_BASE = 1000;
export const AUCTION_GOLD_PER_FLOOR = 120;
export const AUCTION_GOLD_CAP = 4000;
export const AUCTION_MIN_FLOOR = 1;
export const AUCTION_CHANCE = 0.22;

export const AUCTION_SWEETENERS = [
  { pct: 10 as const, chance: 0.35 },
  { pct: 20 as const, chance: 0.55 },
  { pct: 30 as const, chance: 0.75 },
] as const;

export type AuctionSweetener = (typeof AUCTION_SWEETENERS)[number]['pct'];

export const UNCOMMON_REWARDS: BountyReward[] = [
  { emoji: '🧲', name: 'Magnet', tier: 'uncommon' },
  { emoji: '🎯', name: 'Target', tier: 'uncommon' },
  { emoji: '🌙', name: 'Moon', tier: 'uncommon' },
  { emoji: '🧊', name: 'Ice', tier: 'uncommon' },
  { emoji: '🦋', name: 'Butterfly', tier: 'uncommon' },
  { emoji: '🔮', name: 'Crystal Ball', tier: 'uncommon' },
];

export const RARE_REWARDS: BountyReward[] = [
  { emoji: '👑', name: 'Crown', tier: 'rare' },
  { emoji: '💀', name: 'Skull', tier: 'rare' },
  { emoji: '🗡️', name: 'Dagger', tier: 'rare' },
  { emoji: '⛵', name: 'Boat', tier: 'rare' },
  { emoji: '🛡️', name: 'Shield', tier: 'rare' },
  { emoji: '🌟', name: 'Star', tier: 'rare' },
];

export const VANITY_TRAILS: { id: VanityTrailId; emoji: string; name: string; price: number }[] = [
  { id: 'glitter', emoji: '✨', name: 'Glitter', price: 5000 },
  { id: 'petals', emoji: '🌸', name: 'Petals', price: 7500 },
  { id: 'prisms', emoji: '💠', name: 'Prisms', price: 10000 },
];

export const VANITY_TITLES: { id: VanityTitleId; name: string; price: number }[] = [
  { id: 'gaudy', name: 'the Gaudy', price: 5000 },
  { id: 'pilgrim', name: 'Pressure Pilgrim', price: 8000 },
  { id: 'receipt', name: 'the Unbroken Receipt', price: 12000 },
];

const TRAIL_IDS = new Set<string>(VANITY_TRAILS.map(t => t.id));
const TITLE_IDS = new Set<string>(VANITY_TITLES.map(t => t.id));

function depth(floor: number): number {
  return Math.max(0, Math.floor(floor) - 1);
}

export function bountyAnte(floor: number): number {
  return Math.min(BOUNTY_ANTE_CAP, BOUNTY_ANTE_BASE + BOUNTY_ANTE_PER_FLOOR * depth(floor));
}

export function killNeedForFloor(floor: number): number {
  return Math.min(KILL_CAP, KILL_BASE + Math.floor(depth(floor) / KILL_EVERY));
}

export function surviveTurnsForFloor(floor: number): number {
  return Math.min(SURVIVE_CAP, SURVIVE_BASE + Math.floor(depth(floor) / SURVIVE_EVERY));
}

export function rareChance(floor: number): number {
  return Math.min(RARE_CHANCE_CAP, RARE_CHANCE_BASE + RARE_CHANCE_PER_FLOOR * depth(floor));
}

export function shouldPlaceBounty(floor: number, roll: number): boolean {
  return floor >= BOUNTY_MIN_FLOOR && roll < BOUNTY_CHANCE;
}

export function shouldPlaceVanity(floor: number, roll: number): boolean {
  return floor >= VANITY_MIN_FLOOR && roll < VANITY_CHANCE;
}

export function shouldPlaceAuction(floor: number, roll: number): boolean {
  return floor >= AUCTION_MIN_FLOOR && roll < AUCTION_CHANCE;
}

export function auctionGold(floor: number): number {
  return Math.min(AUCTION_GOLD_CAP, AUCTION_GOLD_BASE + AUCTION_GOLD_PER_FLOOR * depth(floor));
}

export function auctionSweetener(pct: number): { pct: AuctionSweetener; chance: number } | undefined {
  return AUCTION_SWEETENERS.find(row => row.pct === pct);
}

/** HP paid only when the bid wins. Leaves at least 1 HP. */
export function auctionHpCost(hp: number, pct: number): number {
  if (hp <= 1) return 0;
  const raw = Math.max(1, Math.round(hp * pct / 100));
  return Math.min(raw, hp - 1);
}

function isBountyMob(enemy: Enemy): boolean {
  if (enemy.hp <= 0 || enemy.isSpectator || enemy.isFarmer || enemy.isFarmAnimal || enemy.isRecruited) return false;
  if (enemy.tag === 'Friendly' || enemy.tag === 'Neutral') return false;
  return true;
}

function rewardFromRoll(floor: number, tierRoll: number, indexRoll: number): BountyReward {
  const rare = tierRoll < rareChance(floor);
  const pool = rare ? RARE_REWARDS : UNCOMMON_REWARDS;
  return pool[Math.floor(indexRoll * pool.length) % pool.length];
}

export function rollRareReward(rng: () => number = Math.random): BountyReward {
  const pool = RARE_REWARDS;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

export function namedSoulItem(reward: BountyReward, id: string): EmojiItem {
  const power = getEmojiPowerByEmoji(reward.emoji);
  return { ...power, id, emoji: reward.emoji, name: reward.name, consumed: false };
}

export function bountyTaskLine(quest: BountyQuest): string {
  if (quest.kind === 'kill') return `Slay ${quest.need} ${quest.targetEmoji} ${quest.targetName} on this floor.`;
  if (quest.kind === 'reach') return 'Stand on the 📍 mark on this floor.';
  return `Survive ${quest.need} turns on this floor.`;
}

export function rollBountyOffer(state: GameState, rng: () => number = Math.random): BountyQuest {
  const groups = new Map<string, { emoji: string; name: string; count: number }>();
  for (const enemy of state.enemies) {
    if (!isBountyMob(enemy)) continue;
    const cur = groups.get(enemy.emoji);
    if (cur) cur.count += 1;
    else groups.set(enemy.emoji, { emoji: enemy.emoji, name: enemy.name, count: 1 });
  }
  const ranked = [...groups.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  const reachTiles: { x: number; y: number }[] = [];
  for (let y = 0; y < state.map.length; y++) {
    for (let x = 0; x < state.map[y].length; x++) {
      if (state.map[y][x].type !== 'floor') continue;
      if (x === state.player.pos.x && y === state.player.pos.y) continue;
      reachTiles.push({ x, y });
    }
  }
  reachTiles.sort((a, b) => a.y - b.y || a.x - b.x);
  const far = reachTiles.filter(p => chebyshev(state.player.pos, p) >= 4);
  const reachPool = far.length > 0 ? far : reachTiles;

  const kindRoll = rng();
  let kind: BountyQuest['kind'] = 'survive';
  if (kindRoll < 0.4 && ranked.length > 0) kind = 'kill';
  else if (kindRoll < 0.75 && reachPool.length > 0) kind = 'reach';
  else if (ranked.length > 0 && reachPool.length === 0) kind = 'kill';
  else if (reachPool.length > 0 && ranked.length === 0 && kindRoll < 0.4) kind = 'reach';

  const reward = rewardFromRoll(state.currentFloor, rng(), rng());
  const base = {
    id: `bounty-f${state.currentFloor}-${kind}-${reward.emoji}`,
    floor: state.currentFloor,
    ante: bountyAnte(state.currentFloor),
    status: 'offered' as const,
    reward,
  };

  if (kind === 'kill' && ranked[0]) {
    const mob = ranked[0];
    const need = Math.max(1, Math.min(killNeedForFloor(state.currentFloor), mob.count));
    return { ...base, kind, need, targetEmoji: mob.emoji, targetName: mob.name };
  }
  if (kind === 'reach' && reachPool.length > 0) {
    const tile = reachPool[Math.floor(rng() * reachPool.length) % reachPool.length];
    return { ...base, kind: 'reach', need: 1, x: tile.x, y: tile.y };
  }
  return { ...base, kind: 'survive', need: surviveTurnsForFloor(state.currentFloor) };
}

export function acceptBounty(state: GameState): { ok: boolean; state?: GameState; reason?: string; log?: string } {
  const quest = state.bounty;
  if (!quest || quest.status !== 'offered' || quest.floor !== state.currentFloor) {
    return { ok: false, reason: 'The board has no open contract.' };
  }
  if (state.player.stats.gold < quest.ante) return { ok: false, reason: `Need ${quest.ante} gold.` };
  const log = `📜 Bounty accepted. −${quest.ante}g. ${bountyTaskLine(quest)} Reward: ${quest.reward.emoji} ${quest.reward.name}.`;
  const next: BountyQuest = {
    ...quest,
    status: 'active',
    baselineKills: state.killCounts[quest.targetEmoji ?? ''] ?? 0,
    startTurn: state.turn,
  };
  return {
    ok: true,
    log,
    state: {
      ...state,
      bounty: next,
      player: { ...state.player, stats: { ...state.player.stats, gold: state.player.stats.gold - quest.ante } },
      logs: [{ id: `bounty-accept-${state.turn}`, text: log, turn: state.turn }, ...state.logs].slice(0, 24),
    },
  };
}

export function bountyProgress(state: GameState): { done: boolean; label: string } {
  const quest = state.bounty;
  if (!quest || quest.status === 'offered') return { done: false, label: 'No active bounty.' };
  if (quest.status === 'done') return { done: true, label: `Paid: ${quest.reward.emoji} ${quest.reward.name}.` };
  if (quest.kind === 'kill') {
    const have = (state.killCounts[quest.targetEmoji ?? ''] ?? 0) - (quest.baselineKills ?? 0);
    const shown = Math.max(0, Math.min(quest.need, have));
    return { done: have >= quest.need, label: `${quest.targetEmoji} ${shown}/${quest.need}` };
  }
  if (quest.kind === 'reach') {
    const there = state.player.pos.x === quest.x && state.player.pos.y === quest.y;
    return { done: there, label: there ? 'You are on the mark.' : 'Find the 📍 mark.' };
  }
  const elapsed = Math.max(0, state.turn - (quest.startTurn ?? state.turn));
  const shown = Math.min(quest.need, elapsed);
  return { done: elapsed >= quest.need, label: `${shown}/${quest.need} turns` };
}

export function grantBounty(state: GameState): GameState {
  const quest = state.bounty;
  if (!quest || quest.status !== 'active' || state.gameOver) return state;
  if (!bountyProgress(state).done) return state;
  const item = namedSoulItem(quest.reward, `bounty-${quest.floor}-${quest.reward.emoji}`);
  const added = addToPlayerBag(state.player, item);
  const parked = added.bank.some(entry => entry.id === item.id) || added.nonStackableBanked.some(entry => entry.id === item.id);
  const log = `📜 Bounty paid: ${quest.reward.emoji} ${quest.reward.name} (${quest.reward.tier}) goes to your ${parked ? 'bank' : 'bag'}.`;
  return {
    ...state,
    player: { ...state.player, inventory: added.inventory, bank: added.bank },
    bounty: { ...quest, status: 'done' },
    logs: [{ id: `bounty-paid-${state.turn}`, text: log, turn: state.turn }, ...state.logs].slice(0, 24),
  };
}

/** Active contracts die with the floor. An unpaid offer just leaves with you. */
export function expireBountyOnDescend(state: GameState): { state: GameState; log?: string } {
  if (state.bounty?.status !== 'active') return { state: { ...state, bounty: undefined } };
  return {
    state: { ...state, bounty: undefined },
    log: '📜 The bounty expires as you leave the floor. The ante stays spent.',
  };
}

export function vanityTrailById(id: string | undefined) {
  return VANITY_TRAILS.find(trail => trail.id === id);
}

export function vanityTitleById(id: string | undefined) {
  return VANITY_TITLES.find(title => title.id === id);
}

export function vanityTitleName(player: Player): string | undefined {
  return vanityTitleById(player.vanity?.title)?.name;
}

export function buyVanity(
  player: Player,
  slot: 'trail' | 'title',
  id: string,
): { ok: boolean; player?: Player; reason?: string; log?: string } {
  const goods = slot === 'trail' ? vanityTrailById(id) : vanityTitleById(id);
  if (!goods) return { ok: false, reason: 'That cosmetic is not for sale.' };
  const owned = slot === 'trail' ? player.vanity?.trail === id : player.vanity?.title === id;
  if (owned) return { ok: false, reason: 'You already wear that.' };
  if (player.stats.gold < goods.price) return { ok: false, reason: `Need ${goods.price} gold.` };
  const vanity: VanityLoadout = { ...player.vanity };
  if (slot === 'trail') vanity.trail = id as VanityTrailId;
  else vanity.title = id as VanityTitleId;
  const label = 'emoji' in goods ? `${goods.emoji} ${goods.name}` : goods.name;
  const log = `💎 ${label} is yours. Cosmetic only — no combat power. −${goods.price}g.`;
  return {
    ok: true,
    log,
    player: {
      ...player,
      vanity,
      stats: { ...player.stats, gold: player.stats.gold - goods.price },
    },
  };
}

export interface AuctionOutcome {
  ok: boolean;
  won?: boolean;
  reason?: string;
  log?: string;
  player?: Player;
}

/**
 * Gold is spent as soon as the bid is placed.
 * HP is the sweetener: a failed bid keeps every hit point.
 * A winning bid also pays the HP percent (at least 1, never below 1 HP)
 * and grants the named rare emoji that was on the block.
 */
export function executeBloodAuction(
  player: Player,
  floor: number,
  sweetener: number,
  lot: BountyReward,
  rng: () => number = Math.random,
): AuctionOutcome {
  const plan = auctionSweetener(sweetener);
  if (!plan) return { ok: false, reason: 'Choose a 10%, 20%, or 30% blood sweetener.' };
  if (lot.tier !== 'rare') return { ok: false, reason: 'The auction only sells rare emojis.' };
  const gold = auctionGold(floor);
  if (player.stats.gold < gold) return { ok: false, reason: `Need ${gold} gold.` };
  if (player.stats.hp <= 1) return { ok: false, reason: 'You need more than 1 HP to sweeten a bid.' };
  const won = rng() < plan.chance;
  if (!won) {
    const log = `☠️ The bid fails. −${gold}g. Your blood stays in you. The lot was ${lot.emoji} ${lot.name}.`;
    return {
      ok: true,
      won: false,
      log,
      player: { ...player, stats: { ...player.stats, gold: player.stats.gold - gold } },
    };
  }
  const hpCost = auctionHpCost(player.stats.hp, plan.pct);
  const paid: Player = {
    ...player,
    stats: { ...player.stats, gold: player.stats.gold - gold, hp: player.stats.hp - hpCost },
  };
  const item = namedSoulItem(lot, `auction-${floor}-${lot.emoji}`);
  const added = addToPlayerBag(paid, item);
  const parked = added.bank.some(entry => entry.id === item.id);
  const log = `☠️ The lot is yours: ${lot.emoji} ${lot.name}. −${gold}g and −${hpCost} HP. It goes to your ${parked ? 'bank' : 'bag'}.`;
  return {
    ok: true,
    won: true,
    log,
    player: { ...paid, inventory: added.inventory, bank: added.bank },
  };
}

export function normalizeVanity(raw: unknown): VanityLoadout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as { trail?: unknown; title?: unknown };
  const trail = typeof value.trail === 'string' && TRAIL_IDS.has(value.trail) ? value.trail as VanityTrailId : undefined;
  const title = typeof value.title === 'string' && TITLE_IDS.has(value.title) ? value.title as VanityTitleId : undefined;
  if (!trail && !title) return undefined;
  return { trail, title };
}

export function normalizeBounty(raw: unknown): BountyQuest | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const quest = raw as BountyQuest;
  if (quest.kind !== 'kill' && quest.kind !== 'reach' && quest.kind !== 'survive') return undefined;
  if (quest.status !== 'offered' && quest.status !== 'active' && quest.status !== 'done') return undefined;
  if (!quest.reward || typeof quest.reward.emoji !== 'string' || typeof quest.reward.name !== 'string') return undefined;
  if (quest.reward.tier !== 'uncommon' && quest.reward.tier !== 'rare') return undefined;
  if (typeof quest.ante !== 'number' || typeof quest.need !== 'number' || typeof quest.floor !== 'number') return undefined;
  if (typeof quest.id !== 'string') return undefined;
  return quest;
}

export function goldSink2RulesBlurb(): string {
  const earlyRare = Math.round(rareChance(1) * 100);
  const lateRare = Math.round(rareChance(26) * 100);
  const sweets = AUCTION_SWEETENERS.map(row => `${row.pct}% HP → ${Math.round(row.chance * 100)}% chance`).join(', ');
  return `More gold sinks. Bounty board 📜: about ${Math.round(BOUNTY_CHANCE * 100)}% of floors. Pay ${bountyAnte(1)} gold on D:1, plus ${BOUNTY_ANTE_PER_FLOOR} per floor, capped at ${bountyAnte(26)}. The contract is kill a mob already on the floor, stand on a 📍 mark, or survive ${surviveTurnsForFloor(1)} turns on D:1 (${surviveTurnsForFloor(26)} on D:26). The kill count never asks for more of that mob than are already here. Success pays a named emoji: about ${earlyRare}% rare on D:1 and ${lateRare}% on D:26, otherwise uncommon. Leaving the floor expires an accepted bounty and keeps the ante. Vanity flex 💎: D:${VANITY_MIN_FLOOR}+ only, the same floors as Dungeon Pressure, about ${Math.round(VANITY_CHANCE * 100)}% of those floors. Trails and titles cost ${VANITY_TRAILS[0].price}–${VANITY_TITLES[VANITY_TITLES.length - 1].price} gold and change no combat stat. The title shows in the HUD and on the death screen. The choice is saved with the run. Blood auction ☠️: about ${Math.round(AUCTION_CHANCE * 100)}% of floors. The bid is ${auctionGold(1)} gold on D:1 and ${auctionGold(26)} on D:26. Gold is spent win or lose. HP is the sweetener and is paid only if you win (${sweets}). A win never drops you below 1 HP and always hands you the named rare emoji shown before you bid.`;
}
