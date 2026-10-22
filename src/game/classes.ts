import { BLINK_TALENT_CREDITS_PER_TIER, blinkStrikeMultiplierPercent, blinkStrikeRulesBlurb, critStat, CRIT_STAT_SOFT_CAP } from './blinkStrike';
import {
  FENCER_BACKDASH_CD,
  FENCER_BASE_EVA,
  FENCER_CRIT_AT_FULL,
  FENCER_EVA_AT_EMPTY,
  FENCER_FLOURISH_EVERY,
  FENCER_LUNGE_CD,
  FENCER_PARRY_CHANCE,
  FENCER_RIPOSTE_MULT,
  GENIE_BASE_MP,
  GENIE_BLOODCAST_HP_PER_MP,
  GENIE_BLOODCAST_MIN_HP_FRACTION,
  GENIE_FIREBALL_MP,
  GENIE_OVERCHANNEL_EXTRA_MP,
  GENIE_OVERCHANNEL_LEVEL,
  GENIE_OVERCHANNEL_MULT,
  GENIE_SELF_SPLASH,
  GENIE_TRANSMUTE_MP,
  GUARDIAN_INCOMING_MULT,
  GUARDIAN_STANCE_CD,
  GUARDIAN_STANCE_TURNS,
  HITMAN_CONTRACT_KILLS,
  HITMAN_DUAL_MULT,
  HITMAN_EXECUTE_CD,
  HITMAN_EXECUTE_HP_PCT,
  HITMAN_SINGLE_MULT,
  HITMAN_START_AMMO,
  ROYAL_AURA_DEF,
  ROYAL_BARE_MELEE_MULT,
  ROYAL_CROWN_DEF,
  ROYAL_SWORD_MELEE_MULT,
  ROYAL_START_AMMO,
} from './prestigeConstants';

export interface ClassDefinition {
  name: string;
  tagline: string;
  baseStats: {
    hp: number;
    maxHp: number;
    attack: number;
    defense: number;
    luck: number;
    speed: number;
    evasion: number;
  };
  startingEmojiSlots: number;
  startingAmmo: number;
  passives: { label: string; detail: string }[];
  active?: { label: string; detail: string };
}

export const CHARACTER_CLASSES: Record<string, ClassDefinition> = {
  '🧙': {
    name: 'Wizard',
    tagline: 'Arcane sniper — auto-fires spells, but frail in melee',
    baseStats: { hp: 8, maxHp: 8, attack: 3, defense: 0, luck: 3, speed: 1, evasion: 5 },
    startingEmojiSlots: 5,
    startingAmmo: 0,
    passives: [
      { label: 'Arcane Barrage', detail: 'Auto-fires a spell bolt every turn (move or wait), costing 1 Mana. Starts at 4 MP max; gains +1 max MP every 3 levels and from Shrines. +1 MP per Wait turn — but only if no hostile has line of sight on you (companions and unengaged neutrals do not block regen). No bolt when empty.' },
      { label: 'Frail Melee', detail: 'Melee hits deal only 25% of base attack — but killing an enemy in melee restores 3+ MP (scales with level, same as max MP growth). High risk, real reward.' },
      { label: 'Spell Echo', detail: '25% chance any emoji power you use is not consumed — it stays in your inventory and can be used again.' },
    ],
  },
  '🥷': {
    name: 'Ninja',
    tagline: 'Shadow Striker — high mobility, punishes unaware enemies',
    baseStats: { hp: 8, maxHp: 8, attack: 3, defense: 0, luck: 2, speed: 3, evasion: 20 },
    startingEmojiSlots: 3,
    startingAmmo: 0,
    passives: [
      { label: 'Phantom', detail: '20% base evasion — attacks simply miss. Spikes to 45% when below 40% HP.' },
      { label: 'Shadow Walker', detail: '+0.8% evasion per level (cap: ~55% total). First strike on any unaware enemy deals +60% damage.' },
      { label: 'Assassin\'s Edge', detail: 'Every melee kill grants 1 free movement turn (enemies don\'t act). Killing while Unseen grants 2 free moves.' },
    ],
    active: {
      label: 'Blink Strike',
      detail: `Teleport to the nearest visible enemy within 6 tiles and strike for ${blinkStrikeMultiplierPercent(critStat(2))}% damage at base CRIT ${critStat(2)} (soft cap ${CRIT_STAT_SOFT_CAP}). ${blinkStrikeRulesBlurb()} Cooldown: 8 turns. Each melee kill reduces cooldown by 1; instakills reduce it by 2. Talents unlock every ${BLINK_TALENT_CREDITS_PER_TIER} Blink credits.`,
    },
  },
  '🧝': {
    name: 'Ranger',
    tagline: 'Survivalist — range, kiting, and ammo efficiency',
    baseStats: { hp: 9, maxHp: 9, attack: 4, defense: 0, luck: 2, speed: 2, evasion: 10 },
    startingEmojiSlots: 3,
    startingAmmo: 8,
    passives: [
      { label: 'Sharpshooter', detail: 'Shoot from range (costs 1 ammo). First shot on a fresh enemy deals +50% damage. Without ammo, melee falls back to 70% damage instead of full.' },
      { label: 'Trailblazer', detail: 'Ranged range starts at 4 and grows +1 every 3 levels. Vision radius also grows +1 every 3 levels. When an enemy steps into melee range, you instantly spring one tile away for free.' },
      { label: 'Survivalist', detail: '50% chance each ranged attack saves your ammo (no consumption). Enemies are ~35% more likely to drop ammo from all sources.' },
    ],
  },
  '🤠': {
    name: 'Cowboy',
    tagline: 'Brawler — fights unarmed, upgrades to dual guns',
    baseStats: { hp: 15, maxHp: 15, attack: 5, defense: 0, luck: 1, speed: 2, evasion: 5 },
    startingEmojiSlots: 3,
    startingAmmo: 0,
    passives: [
      { label: 'Iron Fist', detail: '20% melee stun chance — enemy skips their counterattack. Unarmed ATK scales with level: +1/lvl (1–5), +2/lvl (6–10), +3/lvl (11+). Bonus also applies when pistol-whipping.' },
      { label: 'Real American Hero', detail: 'Can only equip guns (🔫/💥) in hand slots — "Only real Cowboys fight with their fists!" While unarmed: fights in melee with scaling Iron Fist bonus. Dual-gun mode (both hands = guns): 1 🪙 bullet per shot, 2 bullets per attack (4-tile range). Need 2 bullets to shoot; with 0–1 bullet, pistol-whip in melee (+120% dmg).' },
      { label: 'Cowboy Happy', detail: 'Mood can never drop below Happy — immune to Neutral, Angry, Sad, Crying, Scared, and Desperate states. On big hits, stuns, or every 4–6 turns, randomly shouts patriotic nonsense into the combat log.' },
      { label: 'Boundless Spirit', detail: 'Mood-boosting emoji items stack with no upper limit. Every 20 points above 100 adds +5% damage, +2 dodge, +3 crit, and +2% double-strike chance.' },
    ],
  },
  '🧞‍♀️': {
    name: 'Genie',
    tagline: 'Prestige Wizard — flying fireball artillery',
    baseStats: { hp: 8, maxHp: 8, attack: 4, defense: 0, luck: 3, speed: 1, evasion: 8 },
    startingEmojiSlots: 5,
    startingAmmo: 0,
    passives: [
      { label: 'Fireball', detail: `Auto-casts a 3×3 fireball for ${GENIE_FIREBALL_MP} MP (aim with the same tactics as Arcane Barrage). You take ${Math.round(GENIE_SELF_SPLASH * 100)}% of the blast as splash, even at range.` },
      { label: 'Overchannel / Bloodcast', detail: `From level ${GENIE_OVERCHANNEL_LEVEL}: spend ${GENIE_OVERCHANNEL_EXTRA_MP} extra MP to cast at ${Math.round(GENIE_OVERCHANNEL_MULT * 100)}% damage. Bloodcast pays ${GENIE_BLOODCAST_HP_PER_MP} HP per missing MP, and only for MP the spell still needs — if MP covers the spell, the HP cost is 0. A ${GENIE_FIREBALL_MP} MP fireball at 0 MP costs ${GENIE_FIREBALL_MP * GENIE_BLOODCAST_HP_PER_MP} HP. An overchanneled ${GENIE_FIREBALL_MP + GENIE_OVERCHANNEL_EXTRA_MP} MP fireball at 0 MP costs ${(GENIE_FIREBALL_MP + GENIE_OVERCHANNEL_EXTRA_MP) * GENIE_BLOODCAST_HP_PER_MP} HP. Bloodcast is unavailable below ${Math.round(GENIE_BLOODCAST_MIN_HP_FRACTION * 100)}% HP, and it will not cast if that HP cost would drop you to 0. The tactics menu (t) can turn Bloodcast or Overchannel off. Off Bloodcast refuses a cast that MP does not cover and spends no HP. Off Overchannel casts the 2 MP fireball at 100%. Both start on.` },
      { label: 'Transmute', detail: `Each kill restores ${GENIE_TRANSMUTE_MP} MP. Flying — you cross water and lava and lava does not burn you. Starts at ${GENIE_BASE_MP} MP.` },
    ],
    active: { label: 'Blink', detail: 'Phase through gaps and enemies for 3 turns (then 5 turns of cooldown), same control as the Wizard blink. Fireball holds while you are phasing.' },
  },
  '🤺': {
    name: 'Fencer',
    tagline: 'Prestige Ninja — a duelist who lives on the edge of the blade',
    baseStats: { hp: 10, maxHp: 10, attack: 4, defense: 1, luck: 2, speed: 3, evasion: FENCER_BASE_EVA },
    startingEmojiSlots: 3,
    startingAmmo: 0,
    passives: [
      { label: 'Poise', detail: `Crit and evasion scale with HP. Full HP is +${FENCER_CRIT_AT_FULL} crit. Empty HP is ${FENCER_EVA_AT_EMPTY}% evasion (before gear).` },
      { label: 'Parry', detail: `${Math.round(FENCER_PARRY_CHANCE * 100)}% chance to fully negate an enemy counterattack.` },
      { label: 'Riposte', detail: `After a parry, your next melee hit deals ${Math.round(FENCER_RIPOSTE_MULT * 100)}% damage.` },
      { label: 'Blade Flourish', detail: `Every ${FENCER_FLOURISH_EVERY}rd melee hit is a flourish and deals extra damage.` },
    ],
    active: { label: 'Footwork', detail: `Backdash steps one tile away from the nearest foe (${FENCER_BACKDASH_CD} turn cooldown). Lunge closes and strikes (${FENCER_LUNGE_CD} turn cooldown).` },
  },
  '🕴️': {
    name: 'Levitating Hitman',
    tagline: 'Prestige Cowboy — one gun is a sentence, two guns is a whisper',
    baseStats: { hp: 12, maxHp: 12, attack: 4, defense: 0, luck: 2, speed: 2, evasion: 8 },
    startingEmojiSlots: 3,
    startingAmmo: HITMAN_START_AMMO,
    passives: [
      { label: 'Contracts', detail: `Each floor posts a contract: ${HITMAN_CONTRACT_KILLS} kills pay bullets and gold.` },
      { label: 'Levitate', detail: 'Flying — cross water and lava, and lava does not burn you. Stealth (T) hides you in the open; you do not need a wall.' },
      { label: 'Sharpshooter', detail: `Two guns deal ${Math.round(HITMAN_DUAL_MULT * 100)}% damage (−25%). One gun deals ${Math.round(HITMAN_SINGLE_MULT * 100)}% (+150%). Muskets count as one gun.` },
    ],
    active: { label: 'Execute Contract', detail: `Shot at a foe within range (${HITMAN_EXECUTE_CD} turn cooldown). A target at or below ${Math.round(HITMAN_EXECUTE_HP_PCT * 100)}% HP is executed for bonus gold and bullets. Healthier targets take a heavy hit.` },
  },
  '💂': {
    name: 'Royal Guard',
    tagline: 'Prestige Ranger — bow, blade, and the long gun of the crown',
    baseStats: { hp: 12, maxHp: 12, attack: 4, defense: 2, luck: 2, speed: 2, evasion: 8 },
    startingEmojiSlots: 3,
    startingAmmo: ROYAL_START_AMMO,
    passives: [
      { label: 'Versatile Armory', detail: `Bow and sword together: melee deals ${Math.round(ROYAL_SWORD_MELEE_MULT * 100)}% ATK. Guns, bullets, bows, and arrows all fit — main and off hand may both be ranged (gun and bow). With no sword, melee is ${Math.round(ROYAL_BARE_MELEE_MULT * 100)}% ATK, including when you are out of ammo. Muskets are yours.` },
      { label: 'Royal Aura', detail: `+${ROYAL_AURA_DEF} DEF while you stand your post. You begin wearing a Crown (+${ROYAL_CROWN_DEF} DEF).` },
      { label: 'Piercing', detail: 'Shots and slashes pierce into the tile behind the target for half the damage dealt.' },
    ],
    active: { label: 'Guardian Stance', detail: `For ${GUARDIAN_STANCE_TURNS} turns, incoming damage is reduced to ${Math.round(GUARDIAN_INCOMING_MULT * 100)}% and your guard hardens. Cooldown ${GUARDIAN_STANCE_CD} turns.` },
  },
  '👤': {
    name: 'The Void',
    tagline: 'Absence made flesh — filled souls burn; emptiness is peace',
    baseStats: { hp: 10, maxHp: 10, attack: 3, defense: 0, luck: 2, speed: 2, evasion: 10 },
    startingEmojiSlots: 0,
    startingAmmo: 0,
    passives: [
      { label: 'Inverted Burden', detail: 'Each filled hotbar slot (1–9) deals Void damage every turn. Bank and equipment are safe. Empty hotbar = no Void pressure. Consuming the item in a slot reclaims half the pressure that slot dealt while it was held (rounded down, not above max HP).' },
      { label: 'Mnemonic Hunger', detail: 'Every 10 hotbar consumes of the same soul emoji permanently unlock its bag passive as a ghost (Void runs only). Each further 10 adds one stack. Charge items (Gun, Boomerang, Rope, Bomb, Freeze) are unmade instead of fired: each unmake counts toward that emoji\'s ghost the same way. The ghost\'s uses equal the item\'s normal charges (a Boomerang ghost is endless). Further unmakes recharge those uses up to that maximum. Spending a ghost use does not add Void pressure. A Money Bag is unmade for gold equal to its sell value and does not become a ghost.' },
      { label: 'Hollow Roster', detail: 'Active ghosts: 1 on D:1–4, +1 after each depth boss (D:5/10/15…), cap 9. Extra unlocks live in the Bank. Ghosts do not cause Inverted Burden.' },
      { label: 'Null Momentum', detail: 'Incoming damage is reduced by 1% + 1% per level, hard cap 44% (level 1 is 2%). Rounded down, and a hit still deals at least 1. Shown as DR in Stats. Does not reduce Void pressure.' },
      { label: 'Entropic Tithe', detail: 'An enemy killed by a ghost passive (chain arc, thorns, or burn) drops no loot. That ghost emoji instead gains +1 consume toward its next unlock, as if you had spent it once.' },
    ],
    active: { label: 'Unmake', detail: 'Once per floor (U, or the mobile button): target a tile or enemy in line of sight. An enemy takes Void damage equal to empty hotbar slots × floor. Walls and terrain are deleted. Costs HP equal to the number of filled hotbar slots. Resets when you descend.' },
  },
};

export function getClassDef(emoji: string): ClassDefinition {
  return CHARACTER_CLASSES[emoji] ?? CHARACTER_CLASSES['🧙'];
}
