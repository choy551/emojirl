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
      { label: 'Arcane Barrage', detail: 'Auto-fires a spell bolt every turn (move or wait), costing 1 Mana. Starts at 4 MP max; gains +1 max MP every 3 levels and from Shrines. +1 MP per Wait turn — but only if no enemy has line of sight on you. No bolt when empty.' },
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
    active: { label: 'Blink Strike', detail: 'Teleport to the nearest visible enemy within 6 tiles and strike for double damage. Cooldown: 8 turns. Each melee kill reduces cooldown by 1; instakills reduce it by 2.' },
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
};

export function getClassDef(emoji: string): ClassDefinition {
  return CHARACTER_CLASSES[emoji] ?? CHARACTER_CLASSES['🧙'];
}
