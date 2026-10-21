import type { EmojiItem, EquipSlot, GameState, Player } from './types';
import { getClassDef } from './classes';
import { classSelectEntries, isClassUnlocked } from './classSelect';
import { RESTAURANT_COOKED_SELL_LIMIT, slotShrineCost } from './economy';
import { buildHotbarSlots } from './inventory';
import { loadMeta, saveMeta } from './meta';
import { isArcaneCaster, startFloorContract } from './prestige';
import { GENIE, GENIE_BASE_MP, HITMAN } from './prestigeConstants';
import { mpBonusForLevel } from './progression';
import { canEquipItem } from '../components/itemUtils';

/** Once per run. D:1 is the minimum; D:26 reaches the cap. Halved from 1500 / +60 / 3000. */
export const REROLL_COST_MIN = 750;
export const REROLL_COST_PER_FLOOR = 30;
export const REROLL_COST_MAX = 1500;

/** Rare mirror shrine. Shops always offer the same reroll. */
export const MIRROR_MIN_FLOOR = 4;
export const MIRROR_CHANCE = 0.12;

export const INSURE_MIN_SLOTS = 1;
export const INSURE_MAX_SLOTS = 3;
/** One hotbar emoji. D:1 is the base; growth stops at the one-emoji cap. Halved from 1000 / +48 / 2200. */
export const INSURE_ONE_BASE = 500;
export const INSURE_ONE_PER_FLOOR = 24;
export const INSURE_ONE_CAP = 1100;
/** Added once per emoji after the first. Halved from 700 / +28. */
export const INSURE_EXTRA_BASE = 350;
export const INSURE_EXTRA_PER_FLOOR = 14;
/** Halved from 5000. */
export const INSURE_BILL_CAP = 2500;

/** Halved from 500 / +60 / 2000. */
export const ROUND_COST_BASE = 250;
export const ROUND_COST_PER_FLOOR = 30;
export const ROUND_COST_CAP = 1000;
export const ROUND_MOOD_BASE = 16;
export const ROUND_MOOD_STEP = 2;
export const ROUND_MOOD_EVERY = 5;
export const ROUND_MOOD_CAP = 24;
export const ROUND_TURNS_BASE = 8;
export const ROUND_TURNS_STEP = 1;
export const ROUND_TURNS_EVERY = 8;
export const ROUND_TURNS_CAP = 12;

const WIZARD_START_MP = 4;

export interface SinkOutcome {
  ok: boolean;
  reason?: string;
  player?: Player;
  soldCount?: number;
  log?: string;
}

function depth(floor: number): number {
  return Math.max(0, Math.floor(floor) - 1);
}

export function rerollCost(floor: number): number {
  return Math.min(REROLL_COST_MAX, REROLL_COST_MIN + REROLL_COST_PER_FLOOR * depth(floor));
}

export function shouldPlaceMirror(floor: number, roll: number): boolean {
  return floor >= MIRROR_MIN_FLOOR && roll < MIRROR_CHANCE;
}

export function rerollTargets(currentClass: string) {
  return classSelectEntries().filter(entry => entry.emoji !== currentClass);
}

export function insuranceCost(floor: number, slots: number): number {
  const count = Math.min(INSURE_MAX_SLOTS, Math.max(INSURE_MIN_SLOTS, Math.floor(slots)));
  const f = depth(floor);
  const one = Math.min(INSURE_ONE_CAP, INSURE_ONE_BASE + INSURE_ONE_PER_FLOOR * f);
  const extra = INSURE_EXTRA_BASE + INSURE_EXTRA_PER_FLOOR * f;
  return Math.min(INSURE_BILL_CAP, one + extra * (count - 1));
}

export function insurableHotbar(player: Player): EmojiItem[] {
  return buildHotbarSlots(player).filter((slot): slot is EmojiItem => !!slot && !slot.isVoidGhost && !slot.consumed);
}

export function roundCost(floor: number): number {
  return Math.min(ROUND_COST_CAP, ROUND_COST_BASE + ROUND_COST_PER_FLOOR * depth(floor));
}

export function roundPlan(floor: number): { floor: number; turns: number } {
  const f = depth(floor);
  return {
    floor: Math.min(ROUND_MOOD_CAP, ROUND_MOOD_BASE + ROUND_MOOD_STEP * Math.floor(f / ROUND_MOOD_EVERY)),
    turns: Math.min(ROUND_TURNS_CAP, ROUND_TURNS_BASE + ROUND_TURNS_STEP * Math.floor(f / ROUND_TURNS_EVERY)),
  };
}

export function houseRoundFloor(player: Player): number {
  const round = player.houseRound;
  if (!round || round.turnsLeft <= 0) return 0;
  return round.floor;
}

function shiftStat(current: number, oldBase: number, newBase: number, min = 0): number {
  return Math.max(min, current - oldBase + newBase);
}

export function executeIdentityReroll(player: Player, floor: number, nextClass: string): SinkOutcome {
  if (player.identityRerolled) return { ok: false, reason: 'The mirror already knows you this run.' };
  if (nextClass === player.characterClass) return { ok: false, reason: 'You already wear that face.' };
  const known = classSelectEntries().some(entry => entry.emoji === nextClass);
  if (!known || !isClassUnlocked(nextClass)) return { ok: false, reason: 'That class is still locked.' };
  const cost = rerollCost(floor);
  if (player.stats.gold < cost) return { ok: false, reason: `Need ${cost} gold.` };

  const old = getClassDef(player.characterClass);
  const next = getClassDef(nextClass);
  const over = player.stats.hp - player.stats.maxHp;
  const maxHp = Math.max(1, player.stats.maxHp - old.baseStats.maxHp + next.baseStats.maxHp);
  let stats: Player['stats'] = {
    ...player.stats,
    gold: player.stats.gold - cost,
    hp: Math.max(1, maxHp + over),
    maxHp,
    attack: shiftStat(player.stats.attack, old.baseStats.attack, next.baseStats.attack),
    defense: shiftStat(player.stats.defense, old.baseStats.defense, next.baseStats.defense),
    luck: shiftStat(player.stats.luck, old.baseStats.luck, next.baseStats.luck),
    speed: shiftStat(player.stats.speed, old.baseStats.speed, next.baseStats.speed, 1),
    evasion: shiftStat(player.stats.evasion, old.baseStats.evasion, next.baseStats.evasion),
    blinkStrikeCooldown: 0,
    blinkOverkillCooldown: 0,
    blinkOverkillBank: undefined,
    backdashCooldown: 0,
    lungeCooldown: 0,
    executeCooldown: 0,
    guardianStanceTurns: 0,
    guardianStanceCooldown: 0,
    flourishCount: 0,
    riposteReady: false,
  };
  if (player.characterClass === HITMAN) {
    stats = { ...stats, contractKills: undefined, contractGoal: undefined, contractDone: undefined };
  }
  if (isArcaneCaster(nextClass)) {
    const start = nextClass === GENIE ? GENIE_BASE_MP : WIZARD_START_MP;
    const grown = start + mpBonusForLevel(player.stats.level) - mpBonusForLevel(1);
    const kept = isArcaneCaster(player.characterClass) ? (player.stats.maxMana ?? 0) : 0;
    const maxMana = Math.max(grown, kept);
    stats = { ...stats, maxMana, mana: maxMana };
  } else {
    stats = { ...stats, mana: 0, maxMana: 0 };
  }

  const bank = [...player.bank];
  const equipment = { ...player.equipment };
  (Object.keys(equipment) as EquipSlot[]).forEach(slot => {
    const item = equipment[slot];
    if (item && !canEquipItem(item, nextClass)) {
      bank.push(item);
      delete equipment[slot];
    }
  });

  let nextPlayer: Player = {
    ...player,
    emoji: nextClass,
    characterClass: nextClass,
    stats,
    equipment,
    bank,
    identityRerolled: true,
  };
  const contract = startFloorContract(nextPlayer);
  nextPlayer = contract.player;
  const contractNote = contract.log ? ` ${contract.log}` : '';
  return {
    ok: true,
    player: nextPlayer,
    log: `🪞 You become ${nextClass} ${next.name}. Bag, hotbar, and bank stay. −${cost}g.${contractNote}`,
  };
}

export function executeInsurance(player: Player, floor: number, ids: string[]): SinkOutcome {
  const unique = [...new Set(ids)];
  if (unique.length < INSURE_MIN_SLOTS || unique.length > INSURE_MAX_SLOTS) {
    return { ok: false, reason: `Insure ${INSURE_MIN_SLOTS} to ${INSURE_MAX_SLOTS} hotbar emojis.` };
  }
  const hot = insurableHotbar(player);
  const picked: EmojiItem[] = [];
  for (const id of unique) {
    const item = hot.find(entry => entry.id === id);
    if (!item) return { ok: false, reason: 'Only hotbar emojis can be insured.' };
    picked.push({ ...item });
  }
  const cost = insuranceCost(floor, picked.length);
  if (player.stats.gold < cost) return { ok: false, reason: `Need ${cost} gold.` };
  return {
    ok: true,
    player: {
      ...player,
      stats: { ...player.stats, gold: player.stats.gold - cost },
      insurance: { items: picked },
    },
    log: `🏦 Insured ${picked.map(item => item.emoji).join('')} for ${cost}g. They return once if you die.`,
  };
}

/** Copy the run's policy into the meta save. A later call replaces the same set. */
export function stashInsuranceOnDeath(player: Player): void {
  const items = player.insurance?.items ?? [];
  if (items.length === 0) return;
  const meta = loadMeta();
  saveMeta({ ...meta, insuredCarry: items.map(item => ({ ...item })) });
}

/** Take the carried emojis for a new run and clear the policy. */
export function takeInsuredStartItems(): EmojiItem[] {
  const meta = loadMeta();
  const items = meta.insuredCarry ?? [];
  if (items.length === 0) return [];
  saveMeta({ ...meta, insuredCarry: [] });
  return items.map((item, index) => ({ ...item, id: `insured-${index}-${item.id}`, consumed: false }));
}

export function executeHouseRound(player: Player, floor: number): SinkOutcome {
  const cost = roundCost(floor);
  if (player.stats.gold < cost) return { ok: false, reason: `Need ${cost} gold.` };
  const plan = roundPlan(floor);
  return {
    ok: true,
    soldCount: 0,
    player: {
      ...player,
      stats: { ...player.stats, gold: player.stats.gold - cost },
      houseRound: { floor: plan.floor, turnsLeft: plan.turns },
    },
    log: `🍻 Round for the house. Mood floor ${plan.floor} for ${plan.turns} turns. The kitchen opens again — still ${RESTAURANT_COOKED_SELL_LIMIT} cooked dishes. −${cost}g.`,
  };
}

export function applyHouseRoundTick(state: GameState): GameState {
  const round = state.player.houseRound;
  if (!round) return state;
  const turnsLeft = round.turnsLeft - 1;
  if (turnsLeft <= 0) {
    return {
      ...state,
      player: { ...state.player, houseRound: undefined },
      logs: [{ id: `round-fade-${state.turn}`, text: '🍻 The round wears off.', turn: state.turn }, ...state.logs].slice(0, 24),
    };
  }
  return { ...state, player: { ...state.player, houseRound: { ...round, turnsLeft } } };
}

export function goldSinkRulesBlurb(): string {
  const deep = 26;
  const early = roundPlan(1);
  const late = roundPlan(deep);
  return `Gold sinks. Identity Reroll 🪞: once per run, at a shop or a rare mirror (about ${Math.round(MIRROR_CHANCE * 100)}% of floors from D:${MIRROR_MIN_FLOOR}), become another unlocked class. Locked classes stay locked. Bag, hotbar, and bank stay. Cost ${rerollCost(1)} gold on D:1, plus ${REROLL_COST_PER_FLOOR} per floor after that, capped at ${rerollCost(deep)}. Vault insurance 🏦: insure ${INSURE_MIN_SLOTS}–${INSURE_MAX_SLOTS} hotbar emojis. One emoji is ${insuranceCost(1, 1)} on D:1 and ${insuranceCost(deep, 1)} on D:${deep}. Each extra emoji adds ${INSURE_EXTRA_BASE} on D:1. Three emojis on D:${deep} cost ${insuranceCost(deep, 3)}. The bill never passes ${INSURE_BILL_CAP}. If you die, those copies start the next run, once. Round for the House 🍻: at a restaurant, pay ${roundCost(1)}–${roundCost(deep)} gold. D:1 holds mood at ${early.floor} for ${early.turns} turns. D:${deep} holds mood at ${late.floor} for ${late.turns} turns. Buying a round resets the kitchen's sell count. The cooked sell cap stays ${RESTAURANT_COOKED_SELL_LIMIT}. Slot Shrine 🎰: ${slotShrineCost(1)} gold on D:1, ${slotShrineCost(10)} on D:10, and ${slotShrineCost(25)} from D:25.`;
}
