/** Tunable prestige-class numbers. Gameplay and the manual both read these. */

export const WIZARD = '🧙';
export const NINJA = '🥷';
export const RANGER = '🧝';
export const COWBOY = '🤠';
export const GENIE = '🧞‍♀️';
export const FENCER = '🤺';
export const HITMAN = '🕴️';
export const ROYAL_GUARD = '💂';
export const VOID = '👤';

/** Base class emoji → prestige class emoji unlocked by winning D:27 as that base. */
export const PRESTIGE_OF: Record<string, string> = {
  [WIZARD]: GENIE,
  [NINJA]: FENCER,
  [RANGER]: ROYAL_GUARD,
  [COWBOY]: HITMAN,
};

export const BASE_CLASSES = [WIZARD, NINJA, RANGER, COWBOY] as const;
/** Genie, Fencer, Hitman, Royal Guard — the intended unlock order. */
export const PRESTIGE_CLASSES = [GENIE, FENCER, HITMAN, ROYAL_GUARD] as const;
export const CLASS_SELECT_ORDER = [...BASE_CLASSES, ...PRESTIGE_CLASSES, VOID] as const;

export const VOID_UNLOCK_HINT = 'Die to Void damage to unlock';
/** Same flag written by the Void class slice. */
export const VOID_UNLOCK_KEY = 'emojirl_unlocked_void';
export const META_SAVE_KEY = 'emojirl_meta_v1';
export const META_SCHEMA_VERSION = 1;

// ── Genie (ranged, 3 passives + Blink) ──────────────────────────────────────
export const GENIE_BASE_MP = 6;
export const GENIE_FIREBALL_MP = 2;
export const GENIE_FIREBALL_RADIUS = 1;
export const GENIE_SELF_SPLASH = 0.25;
export const GENIE_OVERCHANNEL_LEVEL = 5;
export const GENIE_OVERCHANNEL_EXTRA_MP = 1;
export const GENIE_OVERCHANNEL_MULT = 1.5;
export const GENIE_BLOODCAST_HP_PER_MP = 4;
export const GENIE_TRANSMUTE_MP = 2;

// ── Levitating Hitman (ranged, 3 passives + Execute Contract) ───────────────
export const HITMAN_CONTRACT_KILLS = 4;
export const HITMAN_CONTRACT_BULLETS = 4;
export const HITMAN_CONTRACT_GOLD_BASE = 20;
export const HITMAN_CONTRACT_GOLD_PER_FLOOR = 2;
/** Dual guns deal 75% damage (−25%). */
export const HITMAN_DUAL_MULT = 0.75;
/** One gun deals 250% damage (+150%). */
export const HITMAN_SINGLE_MULT = 2.5;
export const HITMAN_DUAL_RANGE = 4;
export const HITMAN_SINGLE_RANGE = 5;
export const HITMAN_START_AMMO = 6;
export const HITMAN_EXECUTE_CD = 8;
export const HITMAN_EXECUTE_RANGE = 5;
export const HITMAN_EXECUTE_HP_PCT = 0.3;
export const HITMAN_EXECUTE_MULT = 2;
export const HITMAN_EXECUTE_GOLD = 15;
export const HITMAN_EXECUTE_BULLETS = 2;

// ── Fencer (melee, 4 passives + Footwork) ───────────────────────────────────
export const FENCER_BASE_EVA = 8;
export const FENCER_EVA_AT_FULL = 10;
export const FENCER_EVA_AT_EMPTY = 40;
export const FENCER_EVA_CAP = 60;
export const FENCER_CRIT_AT_FULL = 25;
export const FENCER_CRIT_AT_EMPTY = 5;
export const FENCER_PARRY_CHANCE = 0.2;
export const FENCER_RIPOSTE_MULT = 1.75;
export const FENCER_FLOURISH_EVERY = 3;
export const FENCER_FLOURISH_MULT = 1.5;
export const FENCER_BACKDASH_CD = 6;
export const FENCER_LUNGE_CD = 6;
export const FENCER_LUNGE_RANGE = 2;
export const FENCER_LUNGE_MULT = 1.6;

// ── Royal Guard (hybrid, 3 passives + Guardian Stance) ──────────────────────
export const ROYAL_SWORD_MELEE_MULT = 1.25;
export const ROYAL_BARE_MELEE_MULT = 1;
export const ROYAL_AURA_DEF = 2;
export const ROYAL_CROWN_DEF = 2;
export const ROYAL_CROWN_LUCK = 1;
export const ROYAL_PIERCE_FRACTION = 0.5;
export const GUARDIAN_STANCE_TURNS = 4;
export const GUARDIAN_STANCE_CD = 8;
export const GUARDIAN_STANCE_DEF = 3;
/** Incoming damage multiplier while Guardian Stance is up. */
export const GUARDIAN_INCOMING_MULT = 0.6;
export const ROYAL_START_AMMO = 8;
