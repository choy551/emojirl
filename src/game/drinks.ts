import type { DrinkBuff, DrinkTier, EmojiItem, GameState, MoodType, Player } from './types';
import { COWBOY_MOOD_FLOOR, getMood } from './moods';
<<<<<<< HEAD
import { isArcaneCaster, isFencer, isHitman, isRoyalGuard } from './prestige';
=======
>>>>>>> 4c2af06 (fix: import MoodType from game types)
import { moodMax } from './progression';

/**
 * Drink numbers. Food HP tiers this mirrors:
 * apple/bread 2, meat 3, potion 6, heart 8.
 * Drinks never restore HP.
 */

/** Wizard MP restored at each tier. */
export const DRINK_TIER_MP: Record<DrinkTier, number> = {
  1: 2,
  2: 3,
  3: 6,
  4: 8,
};

/** Shop sell base, same curve as food (max(2, healAmount)). */
export const DRINK_TIER_SELL: Record<DrinkTier, number> = {
  1: 2,
  2: 3,
  3: 6,
  4: 8,
};

/** After the money-bag roll, this fraction of floor/kill loot is a drink. */
export const DRINK_FLOOR_DROP_CHANCE = 0.22;

/** Chance a shop stocks one drink. */
export const DRINK_SHOP_CHANCE = 0.75;

/** Wizard picker: at or below this MP fraction, drink the biggest tier. Mirrors food's 40% HP rule. */
export const DRINK_LOW_MP_FRACTION = 0.4;

/** Added to the Cowboy mood floor (40) for the duration. */
export const DRINK_COWBOY_FLOOR_BONUS: Record<DrinkTier, number> = {
  1: 15,
  2: 40,
  3: 60,
  4: 80,
};

export const DRINK_COWBOY_TURNS: Record<DrinkTier, number> = {
  1: 8,
  2: 12,
  3: 16,
  4: 20,
};

export const DRINK_NINJA_STEALTH_TURNS: Record<DrinkTier, number> = {
  1: 3,
  2: 4,
  3: 6,
  4: 8,
};

/** Base Survivalist chance a ranged shot spends no ammo. */
export const RANGER_SURVIVALIST_SAVE_CHANCE = 0.5;

/** Drink bonus plus the base save never exceeds this. */
export const DRINK_SURVIVALIST_SAVE_CAP = 0.95;

export const DRINK_RANGER_SURVIVALIST_BONUS: Record<DrinkTier, number> = {
  1: 0.10,
  2: 0.15,
  3: 0.25,
  4: 0.35,
};

export const DRINK_RANGER_RECLAIM_CHANCE: Record<DrinkTier, number> = {
  1: 0.15,
  2: 0.25,
  3: 0.35,
  4: 0.50,
};

export const DRINK_RANGER_TURNS: Record<DrinkTier, number> = {
  1: 8,
  2: 10,
  3: 14,
  4: 18,
};

/** Filled hotbar slots Inverted Burden ignores while the drink lasts. */
export const DRINK_VOID_IGNORED_SLOTS: Record<DrinkTier, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
};

export const DRINK_VOID_TURNS: Record<DrinkTier, number> = {
  1: 6,
  2: 8,
  3: 10,
  4: 12,
};

/** Classes without a dedicated drink. */
export const DRINK_GENERIC_MOOD: Record<DrinkTier, number> = {
  1: 8,
  2: 12,
  3: 18,
  4: 25,
};

export const DRINK_GENERIC_EVASION: Record<DrinkTier, number> = {
  1: 4,
  2: 6,
  3: 8,
  4: 12,
};

export const DRINK_GENERIC_TURNS: Record<DrinkTier, number> = {
  1: 6,
  2: 8,
  3: 10,
  4: 12,
};

const TIERS: DrinkTier[] = [1, 2, 3, 4];

export function isDrinkTier(n: number | undefined): n is DrinkTier {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

function catalogDescription(tier: DrinkTier): string {
  return `Tier ${tier} drink. Never restores HP. Wizard: +${DRINK_TIER_MP[tier]} MP.`;
}

export const DRINK_DROPS: Omit<EmojiItem, 'id' | 'consumed'>[] = [
  { emoji: '🧃', name: 'Juice Box',  description: catalogDescription(1), drinkTier: 1 },
  { emoji: '🥛', name: 'Milk',       description: catalogDescription(1), drinkTier: 1 },
  { emoji: '🥤', name: 'Soda',       description: catalogDescription(2), drinkTier: 2 },
  { emoji: '☕', name: 'Coffee',     description: catalogDescription(2), drinkTier: 2 },
  { emoji: '🧋', name: 'Bubble Tea', description: catalogDescription(3), drinkTier: 3 },
  { emoji: '🍷', name: 'Wine',       description: catalogDescription(3), drinkTier: 3 },
  { emoji: '🍺', name: 'Beer',       description: catalogDescription(4), drinkTier: 4 },
  { emoji: '🥃', name: 'Whiskey',    description: catalogDescription(4), drinkTier: 4 },
];

export function getRandomDrinkDrop(): Omit<EmojiItem, 'id' | 'consumed'> {
  return DRINK_DROPS[Math.floor(Math.random() * DRINK_DROPS.length)];
}

function wizardDrink(cls: string): boolean { return isArcaneCaster(cls); }
function cowboyDrink(cls: string): boolean { return cls === '🤠' || isHitman(cls); }
function ninjaDrink(cls: string): boolean { return cls === '🥷' || isFencer(cls); }
function rangerDrink(cls: string): boolean { return cls === '🧝' || isRoyalGuard(cls); }

/** Per-class lines for one tier. The last row is every class without its own drink. */
export function drinkEffectLines(tier: DrinkTier): { emoji: string; name: string; line: string }[] {
  return [
    { emoji: '🧙', name: 'Wizard', line: drinkEffectForClass(tier, '🧙') },
    { emoji: '🧞‍♀️', name: 'Genie', line: drinkEffectForClass(tier, '🧞‍♀️') },
    { emoji: '🤠', name: 'Cowboy', line: drinkEffectForClass(tier, '🤠') },
    { emoji: '🕴️', name: 'Levitating Hitman', line: drinkEffectForClass(tier, '🕴️') },
    { emoji: '🥷', name: 'Ninja', line: drinkEffectForClass(tier, '🥷') },
    { emoji: '🤺', name: 'Fencer', line: drinkEffectForClass(tier, '🤺') },
    { emoji: '🧝', name: 'Ranger', line: drinkEffectForClass(tier, '🧝') },
    { emoji: '💂', name: 'Royal Guard', line: drinkEffectForClass(tier, '💂') },
    { emoji: '👤', name: 'The Void', line: drinkEffectForClass(tier, '👤') },
    { emoji: '✦', name: 'Any other class', line: drinkEffectForClass(tier, '') },
  ];
}

export function drinkEffectForClass(tier: DrinkTier, characterClass: string): string {
  if (wizardDrink(characterClass)) return `+${DRINK_TIER_MP[tier]} MP`;
  if (cowboyDrink(characterClass)) {
    const floor = COWBOY_MOOD_FLOOR + DRINK_COWBOY_FLOOR_BONUS[tier];
    return `mood floor ${floor} for ${DRINK_COWBOY_TURNS[tier]} turns`;
  }
  if (ninjaDrink(characterClass)) return `stealth for ${DRINK_NINJA_STEALTH_TURNS[tier]} turns`;
  if (rangerDrink(characterClass)) {
    const save = Math.round(DRINK_RANGER_SURVIVALIST_BONUS[tier] * 100);
    const reclaim = Math.round(DRINK_RANGER_RECLAIM_CHANCE[tier] * 100);
    return `Survivalist +${save}% and ${reclaim}% arrow reclaim for ${DRINK_RANGER_TURNS[tier]} turns`;
  }
  if (characterClass === '👤') {
    const n = DRINK_VOID_IGNORED_SLOTS[tier];
    return `Inverted Burden ignores ${n} filled slot${n === 1 ? '' : 's'} for ${DRINK_VOID_TURNS[tier]} turns`;
  }
  return `+${DRINK_GENERIC_MOOD[tier]} mood and +${DRINK_GENERIC_EVASION[tier]} EVA for ${DRINK_GENERIC_TURNS[tier]} turns`;
}

export interface ClassDrinkEffect {
  emoji: string;
  name: string;
  summary: string;
}

function joinTiers(values: number[]): string {
  return values.join('/');
}

/** Effect table for the manual. Numbers come from the constants above. */
export function classDrinkEffects(): ClassDrinkEffect[] {
  const mp = TIERS.map(t => DRINK_TIER_MP[t]);
  const floors = TIERS.map(t => COWBOY_MOOD_FLOOR + DRINK_COWBOY_FLOOR_BONUS[t]);
  const cowboyBonus = TIERS.map(t => DRINK_COWBOY_FLOOR_BONUS[t]);
  const cowboyTurns = TIERS.map(t => DRINK_COWBOY_TURNS[t]);
  const ninjaTurns = TIERS.map(t => DRINK_NINJA_STEALTH_TURNS[t]);
  const save = TIERS.map(t => Math.round(DRINK_RANGER_SURVIVALIST_BONUS[t] * 100));
  const reclaim = TIERS.map(t => Math.round(DRINK_RANGER_RECLAIM_CHANCE[t] * 100));
  const rangerTurns = TIERS.map(t => DRINK_RANGER_TURNS[t]);
  const voidSlots = TIERS.map(t => DRINK_VOID_IGNORED_SLOTS[t]);
  const voidTurns = TIERS.map(t => DRINK_VOID_TURNS[t]);
  const mood = TIERS.map(t => DRINK_GENERIC_MOOD[t]);
  const eva = TIERS.map(t => DRINK_GENERIC_EVASION[t]);
  const genericTurns = TIERS.map(t => DRINK_GENERIC_TURNS[t]);
  return [
    {
      emoji: '🧙',
      name: 'Wizard',
      summary: `Restores ${joinTiers(mp)} MP by tier (apple / meat / potion / heart). Caps at max MP. No HP.`,
    },
    {
      emoji: '🧞‍♀️',
      name: 'Genie',
      summary: `Matches Wizard: restores ${joinTiers(mp)} MP by tier. Caps at max MP. No HP.`,
    },
    {
      emoji: '🤠',
      name: 'Cowboy',
      summary: `Mood floor +${joinTiers(cowboyBonus)} (floors ${joinTiers(floors)}) for ${joinTiers(cowboyTurns)} turns. No HP.`,
    },
    {
      emoji: '🕴️',
      name: 'Levitating Hitman',
      summary: `Matches Cowboy: mood floor ${joinTiers(floors)} for ${joinTiers(cowboyTurns)} turns. No HP.`,
    },
    {
      emoji: '🥷',
      name: 'Ninja',
      summary: `Stealth for ${joinTiers(ninjaTurns)} turns, even in the open. Does not change the stealth toggle. No HP.`,
    },
    {
      emoji: '🤺',
      name: 'Fencer',
      summary: `Matches Ninja: stealth for ${joinTiers(ninjaTurns)} turns, even in the open. No HP.`,
    },
    {
      emoji: '🧝',
      name: 'Ranger',
      summary: `Survivalist ammo-save +${joinTiers(save)}% (base ${Math.round(RANGER_SURVIVALIST_SAVE_CHANCE * 100)}%, cap ${Math.round(DRINK_SURVIVALIST_SAVE_CAP * 100)}%) and ${joinTiers(reclaim)}% chance to reclaim a spent arrow, for ${joinTiers(rangerTurns)} turns. No HP.`,
    },
    {
      emoji: '💂',
      name: 'Royal Guard',
      summary: `Matches Ranger while the drink lasts: Survivalist save ${Math.round(RANGER_SURVIVALIST_SAVE_CHANCE * 100)}% +${joinTiers(save)}% (cap ${Math.round(DRINK_SURVIVALIST_SAVE_CAP * 100)}%) and ${joinTiers(reclaim)}% reclaim for ${joinTiers(rangerTurns)} turns. No HP.`,
    },
    {
      emoji: '👤',
      name: 'The Void',
      summary: `Inverted Burden ignores ${joinTiers(voidSlots)} filled hotbar slots for ${joinTiers(voidTurns)} turns. No HP.`,
    },
    {
      emoji: '✦',
      name: 'Any other class',
      summary: `+${joinTiers(mood)} mood and +${joinTiers(eva)} EVA for ${joinTiers(genericTurns)} turns. No HP.`,
    },
  ];
}

export function listDrinkCandidates(inventory: EmojiItem[]): { it: EmojiItem; idx: number }[] {
  return inventory
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => !it.consumed && isDrinkTier(it.drinkTier));
}

function mpOf(item: EmojiItem): number {
  return isDrinkTier(item.drinkTier) ? DRINK_TIER_MP[item.drinkTier] : 0;
}

/**
 * Wizard mirrors food: biggest drink when MP is low, otherwise the smallest
 * that covers the gap. Every other class drinks the lowest tier first.
 */
export function pickDrink(inventory: EmojiItem[], player: Player): { it: EmojiItem; idx: number } | null {
  const drinks = listDrinkCandidates(inventory);
  if (drinks.length === 0) return null;
  if (wizardDrink(player.characterClass)) {
    const maxMana = player.stats.maxMana ?? 4;
    const mana = player.stats.mana ?? 0;
    const mpPct = maxMana > 0 ? mana / maxMana : 1;
    const missing = Math.max(0, maxMana - mana);
    if (mpPct <= DRINK_LOW_MP_FRACTION) {
      return drinks.reduce((a, b) => (mpOf(b.it) > mpOf(a.it) ? b : a));
    }
    const fits = drinks.filter(({ it }) => mpOf(it) <= missing);
    const pool = fits.length > 0 ? fits : drinks;
    return pool.reduce((a, b) => (mpOf(b.it) < mpOf(a.it) ? b : a));
  }
  return drinks.reduce((a, b) => ((b.it.drinkTier ?? 99) < (a.it.drinkTier ?? 99) ? b : a));
}

export type DrinkOutcome =
  | { ok: true; player: Player; log: string }
  | { ok: false; log: string };

function withBuff(player: Player, buff: DrinkBuff, log: string, moodValue = player.stats.moodValue, mana = player.stats.mana): DrinkOutcome {
  return {
    ok: true,
    log,
    player: {
      ...player,
      stats: { ...player.stats, hp: player.stats.hp, moodValue, mana },
      drinkBuff: buff,
    },
  };
}

/** Apply one drink. HP is copied through unchanged. */
export function applyDrinkToPlayer(player: Player, item: EmojiItem): DrinkOutcome {
  if (!isDrinkTier(item.drinkTier)) return { ok: false, log: 'That is not a drink.' };
  const tier = item.drinkTier;
  const cls = player.characterClass;
  const tag = `${item.emoji} ${item.name}`;

  if (wizardDrink(cls)) {
    const maxMana = player.stats.maxMana ?? 4;
    const mana = player.stats.mana ?? 0;
    if (mana >= maxMana) return { ok: false, log: 'Already at full MP.' };
    const gain = Math.min(DRINK_TIER_MP[tier], maxMana - mana);
    const next = mana + gain;
    return {
      ok: true,
      log: `${tag}: +${gain} MP (${next}/${maxMana}).`,
      player: {
        ...player,
        stats: { ...player.stats, hp: player.stats.hp, mana: next },
      },
    };
  }

  if (cowboyDrink(cls)) {
    const bonus = DRINK_COWBOY_FLOOR_BONUS[tier];
    const turns = DRINK_COWBOY_TURNS[tier];
    const floor = COWBOY_MOOD_FLOOR + bonus;
    return withBuff(player, {
      turnsLeft: turns,
      justApplied: true,
      moodFloorBonus: bonus,
      label: `${cls === '🤠' ? '🤠' : '🕴️'} Mood floor ${floor}`,
    }, `${tag}: mood floor ${floor} for ${turns} turns.`);
  }

  if (ninjaDrink(cls)) {
    const turns = DRINK_NINJA_STEALTH_TURNS[tier];
    return withBuff(player, {
      turnsLeft: turns,
      justApplied: true,
      stealth: true,
      label: `${cls === '🥷' ? '🥷' : '🤺'} Drink stealth`,
    }, `${tag}: stealth for ${turns} turns.`);
  }

  if (rangerDrink(cls)) {
    const turns = DRINK_RANGER_TURNS[tier];
    const bonus = DRINK_RANGER_SURVIVALIST_BONUS[tier];
    const reclaim = DRINK_RANGER_RECLAIM_CHANCE[tier];
    return withBuff(player, {
      turnsLeft: turns,
      justApplied: true,
      survivalistBonus: bonus,
      arrowReclaimChance: reclaim,
      label: `${cls === '🧝' ? '🧝' : '💂'} Survivalist brew`,
    }, `${tag}: Survivalist +${Math.round(bonus * 100)}% and ${Math.round(reclaim * 100)}% arrow reclaim for ${turns} turns.`);
  }

  if (cls === '👤') {
    const slots = DRINK_VOID_IGNORED_SLOTS[tier];
    const turns = DRINK_VOID_TURNS[tier];
    return withBuff(player, {
      turnsLeft: turns,
      justApplied: true,
      voidSlotsIgnored: slots,
      label: `👤 Hollow sip (−${slots})`,
    }, `${tag}: Inverted Burden ignores ${slots} filled slot${slots === 1 ? '' : 's'} for ${turns} turns.`);
  }

  const moodGain = DRINK_GENERIC_MOOD[tier];
  const eva = DRINK_GENERIC_EVASION[tier];
  const turns = DRINK_GENERIC_TURNS[tier];
  const moodValue = Math.min(moodMax(cls), player.stats.moodValue + moodGain);
  return withBuff(player, {
    turnsLeft: turns,
    justApplied: true,
    evasionBonus: eva,
    label: `+${eva} EVA`,
  }, `${tag}: +${moodGain} mood and +${eva} EVA for ${turns} turns.`, moodValue);
}

export function advanceDrinkBuff(buff: DrinkBuff | undefined): { buff?: DrinkBuff; expiredLabel?: string } {
  if (!buff || buff.turnsLeft <= 0) return {};
  if (buff.justApplied) {
    const { justApplied: _drop, ...rest } = buff;
    return { buff: rest };
  }
  const turnsLeft = buff.turnsLeft - 1;
  if (turnsLeft <= 0) return { expiredLabel: buff.label };
  return { buff: { ...buff, turnsLeft } };
}

export function applyDrinkBuffTick(state: GameState): GameState {
  if (!state.player.drinkBuff || state.player.drinkBuff.turnsLeft <= 0) {
    if (!state.player.drinkBuff) return state;
    return { ...state, player: { ...state.player, drinkBuff: undefined } };
  }
  const { buff, expiredLabel } = advanceDrinkBuff(state.player.drinkBuff);
  const logs = expiredLabel
    ? [{ id: `drink-fade-${state.turn}`, text: `${expiredLabel} wears off.`, turn: state.turn }, ...state.logs].slice(0, 24)
    : state.logs;
  return { ...state, player: { ...state.player, drinkBuff: buff }, logs };
}

export function moodBagSize(inventory: EmojiItem[]): number {
  return inventory.filter(i =>
    !i.consumed && i.healAmount === undefined && i.ammoAmount === undefined && i.drinkTier === undefined,
  ).length;
}

export function moodFloorBonus(player: Player): number {
  const b = player.drinkBuff;
  if (!b || b.turnsLeft <= 0 || !cowboyDrink(player.characterClass)) return 0;
  return b.moodFloorBonus ?? 0;
}

export function playerMood(player: Player): MoodType {
  const floorActive = player.characterClass === '🤠' || (isHitman(player.characterClass) && moodFloorBonus(player) > 0);
  return getMood(
    player.stats.moodValue,
    player.stats.hp,
    player.stats.maxHp,
    moodBagSize(player.inventory),
    floorActive,
    moodFloorBonus(player),
  );
}

/** Mood value fed to Boundless Spirit. High drink floors count while they last. */
export function cowboyCombatMoodValue(player: Player): number | undefined {
  if (player.characterClass !== '🤠') return undefined;
  return Math.max(player.stats.moodValue, COWBOY_MOOD_FLOOR + moodFloorBonus(player));
}

export function isDrinkStealthActive(player: Player): boolean {
  const b = player.drinkBuff;
  return ninjaDrink(player.characterClass) && !!b?.stealth && b.turnsLeft > 0;
}

export function drinkEvasionBonus(player: Player): number {
  const b = player.drinkBuff;
  if (!b || b.turnsLeft <= 0) return 0;
  return b.evasionBonus ?? 0;
}

export function rangerDrinkBonuses(player: Player): { survivalistBonus: number; arrowReclaimChance: number } {
  const b = player.drinkBuff;
  if (!b || b.turnsLeft <= 0 || !rangerDrink(player.characterClass)) {
    return { survivalistBonus: 0, arrowReclaimChance: 0 };
  }
  return {
    survivalistBonus: b.survivalistBonus ?? 0,
    arrowReclaimChance: b.arrowReclaimChance ?? 0,
  };
}

export function voidPressureIgnoredSlots(player: Player): number {
  if (player.characterClass !== '👤') return 0;
  const b = player.drinkBuff;
  if (!b || b.turnsLeft <= 0) return 0;
  return b.voidSlotsIgnored ?? 0;
}

export function effectiveVoidPressureSlots(filled: number, ignored: number): number {
  return Math.max(0, filled - Math.max(0, ignored));
}

export interface AmmoSpend {
  saved: boolean;
  reclaimed: boolean;
  ammoDelta: number;
}

/** Survivalist save first; a spent arrow can still be reclaimed. Never refunds extra ammo. */
export function resolveRangedAmmoSpend(
  baseSaveChance: number,
  survivalistBonus: number,
  reclaimChance: number,
  roll: () => number,
): AmmoSpend {
  const saveChance = Math.min(DRINK_SURVIVALIST_SAVE_CAP, baseSaveChance + Math.max(0, survivalistBonus));
  if (roll() < saveChance) return { saved: true, reclaimed: false, ammoDelta: 0 };
  if (roll() < reclaimChance) return { saved: false, reclaimed: true, ammoDelta: 0 };
  return { saved: false, reclaimed: false, ammoDelta: -1 };
}
