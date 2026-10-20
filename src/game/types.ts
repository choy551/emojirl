export type Position = {
  x: number;
  y: number;
};

export type TileType =
  | 'wall'
  | 'floor'
  | 'stairs'
  | 'door-closed'
  | 'door-open'
  | 'water'
  | 'grass'
  | 'tree'
  | 'bush'
  | 'lava'
  | 'obsidian'
  | 'volcano'
  | 'shrine'
  | 'shrine-used'
  | 'slot-shrine'
  | 'safe-floor'
  | 'shop-item'
  | 'restaurant'
  | 'boss-floor'
  | 'campfire'
  | 'bed';

export interface Tile {
  type: TileType;
  emoji: string;
  seen: boolean;
  visible: boolean;
  /** Remaining bed sleeps; only meaningful for type === 'bed'. */
  usesLeft?: number;
}

export type MapGrid = Tile[][];

export type RoomTheme = 'normal' | 'shrine' | 'shop' | 'restaurant' | 'forest' | 'boss' | 'market' | 'monster-den' | 'treasure-vault' | 'bush-ambush' | 'volcano' | 'room-vault';

export type MoodType = 
  | 'happy' | 'very_happy' | 'sad' | 'crying' 
  | 'angry' | 'scared' | 'confident' | 'desperate' 
  | 'neutral' | 'excited' | 'confused' | 'in_love';

export type BlinkTalentId =
  | 'shorter-cd'
  | 'lifesteal'
  | 'flowing-strikes'
  | 'longer-chain'
  | 'twin-strike'
  | 'endless-chain';

export interface BlinkStrikeMark {
  enemyId: string;
  /** GameState.turn after the Blink action is committed. */
  blinkTurn: number;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
  luck: number;
  level: number;
  xp: number;
  moodValue: number;
  gold: number;
  mana?: number;
  maxMana?: number;
  activeBuffs?: ActiveBuff[];
  blinkStrikeCooldown?: number;
  blinkStrikeInstakillChain?: number;
  blinkStrikeInstakillOutOfCombat?: number;
  /** Run-long Blink Strike talent credits. */
  blinkStrikeCredits?: number;
  /** Talents picked this run, in unlock order. */
  blinkTalents?: BlinkTalentId[];
  /** Non-instakill Blinks waiting on a death within the credit window. */
  blinkStrikeMarks?: BlinkStrikeMark[];
  /** Remaining melee attacks that reduce Blink cooldown (Flowing Strikes). */
  blinkMeleeCdCharges?: number;
  overhealDecayTick?: number;
}

export type EquipSlot = 'body' | 'mainHand' | 'offHand' | 'accessory';
export type WeaponKind = 'staff' | 'blade' | 'bow' | 'gun';
export type ArmorKind = 'armor' | 'light' | 'shield';
export type SpecialAmmoKind = 'fire' | 'freeze';

export interface ActiveBuff {
  stat: 'attack' | 'defense';
  amount: number;
  turnsLeft: number;
  label: string;
}

export interface BagPassive {
  description: string;
  losBonus?: number;
  stealthBonus?: number;
  stealthPenalty?: number;
  attackBonus?: number;
  defenseBonus?: number;
  speedBonus?: number;
  evasionBonus?: number;
  luckBonus?: number;
  canSwim?: boolean;
  burningOnHit?: boolean;
  freezeAura?: boolean;
  advantageDice?: boolean;
  vampiricStrike?: number | boolean;
  lightningBolt?: boolean;
  thorns?: boolean;
  bonusLoot?: boolean;
  execBlow?: boolean;
  trueVision?: boolean;
  itemMagnet?: boolean;
  shieldWall?: boolean;
  nonStackable?: boolean;
  healOnKill?: boolean;
  trueAim?: boolean;
  regeneration?: boolean;
  ninjaCombo?: number | boolean;
  royalAura?: boolean;
  combatRegen?: number | boolean;
  dodgeHeal?: number | boolean;
}

export interface EquipBonus {
  attack?: number;
  defense?: number;
  speed?: number;
  evasion?: number;
  luck?: number;
}

export interface Equipment {
  body?: EmojiItem;
  mainHand?: EmojiItem;
  offHand?: EmojiItem;
  accessory?: EmojiItem;
}

/** A remembered soul. Not an item — hotbar XOR with real loot, bank holds the rest. */
export interface VoidGhost {
  emoji: string;
  stacks: number;
}

export interface Player {
  pos: Position;
  emoji: string;
  characterClass: string;
  ammo: number;
  stats: PlayerStats;
  inventory: EmojiItem[];
  bank: EmojiItem[];
  equipment: Equipment;
  trailblazerCooldown?: number;
  /** Void 👤 only. Index = hotbar slot 0–8. A slot holds a ghost or a real item, never both. */
  ghostHotbar?: (VoidGhost | null)[];
  /** Unlocked ghosts that are not currently in the hotbar. Unlimited. */
  ghostBank?: VoidGhost[];
  /** Depth bosses cleared this run (D:5/10/15…). Mirrors GameState.voidBossesCleared. */
  voidBossesCleared?: number;
}

export type ActiveKind = 'bomb' | 'gun' | 'boomerang' | 'rope' | 'freeze';

export interface EmojiItem {
  id: string;
  /** Stable catalog id. Distinct items that share an emoji (food 🍄 vs soul 🍄) use different itemIds. */
  itemId?: string;
  emoji: string;
  name: string;
  description: string;
  consumed: boolean;
  healAmount?: number;
  ammoAmount?: number;
  activeKind?: ActiveKind;
  charges?: number;
  isEquipment?: boolean;
  equipSlots?: EquipSlot[];
  weaponKind?: WeaponKind;
  armorKind?: ArmorKind;
  specialAmmoKind?: SpecialAmmoKind;
  equipBonus?: EquipBonus;
  bagPassive?: BagPassive;
  stackCount?: number; // for stackable bag passives — how many copies are collapsed into this slot
  isCooked?: boolean;
  cookedBuff?: { stat: 'attack' | 'defense'; amount: number; turns: number };
  isMoneyBag?: boolean;
  /** Synthetic hotbar cell for a Void ghost. Not stored in inventory. */
  isVoidGhost?: boolean;
  /** In the hotbar, but past Hollow Roster capacity — no bag passive this depth. */
  isVoidGhostDormant?: boolean;
}

export interface PlacedBomb {
  id: string;
  pos: Position;
  countdown: number;
  radius: number;
}

export interface ActiveProjectile {
  id: string;
  kind: 'gun' | 'freeze' | 'boomerang' | 'bomb';
  pos: Position;
  dir: Position;
  phase: 'outgoing' | 'returning';
  maxRange: number;
  traveled: number;
}

export interface Enemy {
  id: string;
  pos: Position;
  emoji: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  engaged: boolean;
  alertedBlind?: boolean;
  isBoss?: boolean;
  huntTurns?: number;
  frozenTurns?: number;
  webbedTurns?: number;
  paralyzedTurns?: number;
  slowedTurns?: number;
  slowSkipNext?: boolean;
  burningTurns?: number;
  silent?: boolean;
  cowardly?: boolean;
  berserker?: boolean;
  packHunter?: boolean;
  godBlessed?: boolean;
  divineBuff?: number;
  tag?: 'Hostile' | 'Neutral' | 'Friendly';
  /** Cross and stand on water and lava; immune to lava damage. */
  flying?: boolean;
  /** Final-arena crowd. Blocks movement. Does not fight, and grants no XP. */
  isSpectator?: boolean;
  ghostly?: boolean;
  madScientist?: boolean;
  waterAggro?: boolean;
  monkey?: boolean;
  bear?: boolean;
  crow?: boolean;
  healCooldown?: number;
  stolenEmojis?: EmojiItem[];
  patrolTarget?: Position;
  spawnRoomBounds?: { x: number; y: number; w: number; h: number };
  isEcho?: boolean;
  isAdventurer?: boolean;
  isRecruited?: boolean;
  xp?: number;
  level?: number;
  favoriteEmoji?: string;
  ranged?: boolean;
  /** Player-designated favorite companion — descends with the player; others stay behind. */
  isFavoriteCompanion?: boolean;
  /** Combat AI mode set by the player via the companion talk dialog. */
  companionBehavior?: 'close' | 'far' | 'flee' | 'aggressive';
  /** One soul emoji gifted by the player — grants its bagPassive benefit in combat. */
  companionSoulEmoji?: EmojiItem;
}

export interface FloatingText {
  id: string;
  pos: Position;
  text: string;
  color?: string;
  life: number;
}

export interface LogMessage {
  id: string;
  text: string;
  turn: number;
}

export interface GameState {
  schemaVersion: number;
  player: Player;
  currentFloor: number;
  map: MapGrid;
  enemies: Enemy[];
  items: (EmojiItem & { pos: Position })[];
  turn: number;
  logs: LogMessage[];
  floatingTexts: FloatingText[];
  gameOver: boolean;
  killer?: { name: string; emoji: string };
  victory: boolean;
  levelUpPending: boolean;
  cameraOffset: Position;
  stealthMode?: boolean;
  placedBombs: PlacedBomb[];
  activeProjectile: ActiveProjectile | null;
  pendingExplosion?: Position[];
  pendingBeam?: { positions: Position[]; color: string };
  killCounts: Record<string, number>;
  difficultyTier: number;
  ninjaFreeMoves?: number;
  highestPressureTierWarned: number;
  /** DCSS-style full-screen floor announcement (volcano, etc.). Cleared when dismissed. */
  floorAnnouncement?: { kind: 'volcano'; title: string; body: string } | null;
  /** Turn number when a floor volcano next spews lava (every 10–20 turns). */
  volcanoNextSpewTurn?: number;
  /** Vendor stock for this floor. null/undefined = not generated yet; [] = sold out. */
  shopStock?: EmojiItem[] | null;
  restaurantStock?: EmojiItem[] | null;
  ammoCacheStock?: EmojiItem[] | null;
  restaurantSoldCount?: number;
  /** Companion kills since last bounty refresh. */
  companionKillTally?: number;
  /** Consecutive non-combat turns toward bounty snap-reset. */
  companionBountyOocTurns?: number;
  /** Run-wide restaurant lessons (0–5). Cooked food heals and sells better. */
  chefLessonCount?: number;
  /** Cowboy already saw the first Dual Guns fanfare this run. */
  dualGunsFanfareDone?: boolean;
  /** D:27 boss rush. Absent on every other floor. */
  bossrush?: BossrushState;
  /** Set when the player dives past D:27. Doubles pressure on each deeper floor. */
  deepDive?: boolean;
  /** Depth bosses (floor % 5 === 0) killed this run. Drives Void ghost capacity. */
  voidBossesCleared?: number;
  /** Already logged that the hotbar holds more ghosts than the current depth allows. */
  voidGhostOverCapLogged?: boolean;
  /** Void 👤 attack style. Ranged modes stay locked until the meta consume counts say otherwise. */
  voidAttackMode?: 'melee' | 'ranger' | 'wizard';
  /** Floor number on which Unmake was already spent. Resets when this no longer matches currentFloor. */
  unmakeUsedFloor?: number;
}

export interface BossrushState {
  /** Wave currently in the ring (1-based). */
  wave: number;
  /** Turns left before the next wave. 0 while a wave is active. */
  graceTurns: number;
  /** Final wave cleared and the north stairway is on the map. */
  revealed: boolean;
  stairs: Position;
}

export interface ControlSettings {
  swipeToMove: boolean;
  tapTileToMove: boolean;
  edgeTap: boolean;
  showDpad: boolean;
  showContextButtons: boolean;
  showAbilityButtons: boolean;
  dpadSide: 'left' | 'right';
  /** Park d-pad, actions, hotbar, and sheets on `dpadSide` for thumb reach. */
  oneHanded: boolean;
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  swipeToMove: true,
  tapTileToMove: true,
  edgeTap: true,
  showDpad: true,
  showContextButtons: true,
  showAbilityButtons: true,
  dpadSide: 'right',
  oneHanded: false,
};

export type BagPassiveSummary = {
  attack: number; defense: number; speed: number; evasion: number; luck: number;
  losBonus: number; stealthBonus: number; stealthPenalty: number;
  canSwim: boolean; burningOnHit: boolean; freezeAura: boolean; advantageDice: boolean;
  vampiricStrike: number; lightningBolt: number; thorns: number; bonusLoot: number;
  execBlow: boolean; trueVision: boolean; itemMagnet: boolean; shieldWall: number;
  healOnKill: number; trueAim: boolean; regeneration: number; ninjaCombo: number;
  royalAura: boolean; combatRegen: number; dodgeHeal: number;
};
