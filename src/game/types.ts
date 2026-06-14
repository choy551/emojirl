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
  | 'shrine'
  | 'shrine-used'
  | 'safe-floor'
  | 'shop-item'
  | 'restaurant'
  | 'boss-floor'
  | 'campfire';

export interface Tile {
  type: TileType;
  emoji: string;
  seen: boolean;
  visible: boolean;
}

export type MapGrid = Tile[][];

export type RoomTheme = 'normal' | 'shrine' | 'shop' | 'restaurant' | 'forest' | 'boss' | 'market' | 'monster-den' | 'treasure-vault';

export type MoodType = 
  | 'happy' | 'very_happy' | 'sad' | 'crying' 
  | 'angry' | 'scared' | 'confident' | 'desperate' 
  | 'neutral' | 'excited' | 'confused' | 'in_love';

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
}

export type ActiveKind = 'bomb' | 'gun' | 'boomerang' | 'rope' | 'freeze';

export interface EmojiItem {
  id: string;
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
  ghostly?: boolean;
  madScientist?: boolean;
  waterAggro?: boolean;
  monkey?: boolean;
  healCooldown?: number;
  stolenEmojis?: EmojiItem[];
  patrolTarget?: Position;
  spawnRoomBounds?: { x: number; y: number; w: number; h: number };
  isEcho?: boolean;
  isAdventurer?: boolean;
  isRecruited?: boolean;
  favoriteEmoji?: string;
  ranged?: boolean;
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
}

export interface Settings {
  permadeath: boolean;
  showMoodEffects: boolean;
  controls: 'arrows' | 'wasd' | 'both';
}

export type BagPassiveSummary = {
  attack: number; defense: number; speed: number; evasion: number; luck: number;
  losBonus: number; stealthBonus: number; stealthPenalty: number;
  canSwim: boolean; burningOnHit: boolean; freezeAura: boolean; advantageDice: boolean;
  vampiricStrike: number; lightningBolt: boolean; thorns: number; bonusLoot: number;
  execBlow: boolean; trueVision: boolean; itemMagnet: boolean; shieldWall: number;
  healOnKill: number; trueAim: boolean; regeneration: number; ninjaCombo: number;
  royalAura: boolean; combatRegen: number; dodgeHeal: number;
};
