import { EmojiItem } from './types';

export const HEAL_DROPS: Omit<EmojiItem, 'id' | 'consumed'>[] = [
  { emoji: '🍎', name: 'Apple',    description: 'Restores 2 HP · cook on 🔥 for more',  healAmount: 2 },
  { emoji: '🍖', name: 'Meat',     description: 'Restores 3 HP · cook on 🔥 for more',  healAmount: 3 },
  { emoji: '🧪', name: 'Potion',   description: 'Restores 6 HP',                         healAmount: 6 },
  { emoji: '🍇', name: 'Grapes',   description: 'Restores 2 HP · cook on 🔥 for more',  healAmount: 2 },
  { emoji: '🫀', name: 'Heart',    description: 'Restores 8 HP — emergency heal!',       healAmount: 8 },
  { emoji: '🍞', name: 'Bread',    description: 'Restores 2 HP · cook on 🔥 for more',  healAmount: 2 },
  { emoji: '🧅', name: 'Onion',    description: 'Restores 1 HP',                         healAmount: 1 },
  { emoji: '🍄', name: 'Mushroom', description: 'Restores 3 HP · cook on 🔥 for more',  healAmount: 3 },
];

export function getRandomHealDrop(): Omit<EmojiItem, 'id' | 'consumed'> {
  return HEAL_DROPS[Math.floor(Math.random() * HEAL_DROPS.length)];
}

/** Raw-food emoji → cooked version. Only emojis in this map can be cooked at a campfire. */
export const RAW_TO_COOKED: Record<string, Omit<EmojiItem, 'id' | 'consumed'>> = {
  '🍎': { emoji: '🍏', name: 'Baked Apple',   description: '+4 HP & mood boost',              healAmount: 4,  isCooked: true },
  '🍞': { emoji: '🥪', name: 'Toast',          description: '+8 HP & +1 DEF for 8 turns',     healAmount: 8,  isCooked: true, cookedBuff: { stat: 'defense', amount: 1, turns: 8  } },
  '🍖': { emoji: '🥩', name: 'Grilled Steak',  description: '+12 HP & +2 ATK for 10 turns',   healAmount: 12, isCooked: true, cookedBuff: { stat: 'attack',  amount: 2, turns: 10 } },
  '🍄': { emoji: '🍲', name: 'Mushroom Stew',  description: '+9 HP & lifts bad mood',          healAmount: 9,  isCooked: true },
  '🍇': { emoji: '🍓', name: 'Cooked Berries', description: '+5 HP & mood boost',              healAmount: 5,  isCooked: true },
};

export const COOKABLE_EMOJIS = new Set(Object.keys(RAW_TO_COOKED));

export function cookFood(item: Omit<EmojiItem, 'id' | 'consumed'>): Omit<EmojiItem, 'id' | 'consumed'> | null {
  return RAW_TO_COOKED[item.emoji] ?? null;
}

export const AMMO_DROP: Omit<EmojiItem, 'id' | 'consumed'> = {
  emoji: '🏹',
  name: 'Quiver',
  description: '+5 arrows',
  ammoAmount: 5,
};

export function getAmmoDrop(): Omit<EmojiItem, 'id' | 'consumed'> {
  return AMMO_DROP;
}

export const BULLET_DROP: Omit<EmojiItem, 'id' | 'consumed'> = {
  emoji: '🪙',
  name: 'Bullets',
  description: '+5 bullets',
  ammoAmount: 5,
};

export function getBulletDrop(): Omit<EmojiItem, 'id' | 'consumed'> {
  return BULLET_DROP;
}

export const ACTIVE_DROPS: Omit<EmojiItem, 'id' | 'consumed'>[] = [
  {
    emoji: '💣',
    name: 'Bomb',
    description: 'Throw in a direction. Explodes on first enemy hit for 200% ATK in a 3×3 area. You take damage too if caught in the blast!',
    activeKind: 'bomb',
    charges: 1,
  },
  {
    emoji: '🔫',
    name: 'Gun',
    description: 'Fire in a direction. Travels tile-by-tile, deals ATK damage. 3 shots.',
    activeKind: 'gun',
    charges: 3,
  },
  {
    emoji: '🪃',
    name: 'Boomerang',
    description: 'Throw in a direction. Deals 100% ATK (+ 25% per extra 🪃 in Bank, max 200%). Stops on first hit and returns. Infinite uses.',
    activeKind: 'boomerang',
    charges: -1,
  },
  {
    emoji: '🪢',
    name: 'Rope',
    description: 'Access a hidden vault room. May hold treasure or traps.',
    activeKind: 'rope',
    charges: 1,
  },
  {
    emoji: '❄️',
    name: 'Freeze',
    description: 'Fire a freeze shot. Freezes enemy for 3 turns, then slows.',
    activeKind: 'freeze',
    charges: 1,
  },
];

export function getRandomActiveDrop(): Omit<EmojiItem, 'id' | 'consumed'> {
  return ACTIVE_DROPS[Math.floor(Math.random() * ACTIVE_DROPS.length)];
}

export interface SoulEffect {
  hpBonus?: number;
  maxHpBonus?: number;
  attackBonus?: number;
  defenseBonus?: number;
  speedBonus?: number;
  evasionBonus?: number;
  luckBonus?: number;
  moodBonus?: number;
  xpBonus?: number;
  instakillNearest?: boolean;
  label: string;
}

export const EMOJI_POWERS: { emoji: string; name: string; description: string; effect: SoulEffect; bagPassive?: import('./types').BagPassive }[] = [
  { emoji: '❤️', name: 'Heart',        description: '+3 max HP & heals 3 · Bag: life steal (stacks)',       effect: { maxHpBonus: 3, hpBonus: 3, moodBonus: 15, label: 'Your heart swells with life!' },        bagPassive: { description: 'Each hit restores 1 HP 🩸', vampiricStrike: true } },
  { emoji: '🔥', name: 'Fire',         description: '+3 ATK · Bag: +1 ATK, all attacks ignite',     effect: { attackBonus: 3, moodBonus: 10, label: 'Flames ignite your blade!' },                     bagPassive: { description: '+1 ATK · all attacks ignite 🔥', attackBonus: 1, burningOnHit: true, nonStackable: true } },
  { emoji: '⚡', name: 'Lightning',    description: 'Use: instakill nearest visible foe · Bag: melee arcs to 1-3 nearby', effect: { instakillNearest: true, moodBonus: 10, label: 'Lightning strikes!' },   bagPassive: { description: 'Melee hits arc to 1-3 nearby enemies (1 dmg each) ⚡', lightningBolt: true, nonStackable: true } },
  { emoji: '💎', name: 'Diamond',      description: '+3 DEF · Bag: thorns',                        effect: { defenseBonus: 3, moodBonus: 8, label: 'You harden like diamond!' },                       bagPassive: { description: 'Reflect 1 dmg per copy when struck 💎', thorns: true } },
  { emoji: '🍀', name: 'Clover',       description: '+5 LCK, +20 mood · Bag: bonus loot',         effect: { luckBonus: 5, moodBonus: 30, label: 'Luck is on your side!' },                            bagPassive: { description: 'Enemy drop rate increases per copy 🍀', bonusLoot: true } },
  { emoji: '💀', name: 'Skull',        description: '+2 ATK, +2 SPD · Bag: all crits',            effect: { attackBonus: 2, speedBonus: 2, moodBonus: 5, label: 'Death lends you its strength!' },     bagPassive: { description: 'All attacks guaranteed crit 💀', execBlow: true, nonStackable: true } },
  { emoji: '🌟', name: 'Star',         description: '+20 XP & mood boost · Bag: +1 vision, alert',  effect: { xpBonus: 20, moodBonus: 20, label: 'You shine brighter!' },                               bagPassive: { description: '+1 vision · enemies are more alert', losBonus: 1, stealthPenalty: 1, nonStackable: true } },
  { emoji: '🔮', name: 'Crystal Ball', description: '+1 ATK/DEF/SPD/EVA · Bag: true vision',      effect: { attackBonus: 1, defenseBonus: 1, speedBonus: 1, evasionBonus: 1, hpBonus: 2, moodBonus: 15, label: 'The future reveals itself to you!' }, bagPassive: { description: 'See all enemies through walls 🔮', trueVision: true, nonStackable: true } },
  { emoji: '🧲', name: 'Magnet',       description: '+2 DEF, +4 EVA · Bag: item magnet',          effect: { defenseBonus: 2, evasionBonus: 4, moodBonus: 10, label: 'Forces bend to your will!' },    bagPassive: { description: 'All visible dropped items pulled to you 🧲', itemMagnet: true, nonStackable: true } },
  { emoji: '🛡️', name: 'Shield',      description: '+4 DEF, +2 EVA · Bag: shield wall (stacks!)', effect: { defenseBonus: 4, evasionBonus: 2, moodBonus: 8, label: 'You raise an impenetrable shield!' }, bagPassive: { description: '25% block chance + −1 dmg per shield in bag (stacks 1–9) 🛡️', shieldWall: true } },
  { emoji: '🍄', name: 'Mushroom',     description: '+3 HP, +5 SPD · Bag: heal on kill',          effect: { hpBonus: 3, speedBonus: 5, moodBonus: 5, label: 'Strange mushroom energy flows through you!' }, bagPassive: { description: '+1 HP per enemy killed per copy 🍄', healOnKill: true } },
  { emoji: '🎯', name: 'Target',       description: '+2 ATK, +3 LCK · Bag: true aim',            effect: { attackBonus: 2, luckBonus: 3, moodBonus: 12, label: 'Your aim becomes perfect!' },          bagPassive: { description: 'Ranged attacks never miss 🎯', trueAim: true, nonStackable: true } },
  { emoji: '💊', name: 'Pill',         description: '+4 HP, +2 EVA · Bag: regeneration',         effect: { hpBonus: 4, evasionBonus: 2, moodBonus: 10, label: 'The pill mends your wounds!' },          bagPassive: { description: '+1 HP every 5 turns; regen interval decreases per copy 💊', regeneration: true } },
  { emoji: '🗡️', name: 'Dagger',      description: '+4 ATK, +3 SPD · Bag: ninja combo (stacks)',         effect: { attackBonus: 4, speedBonus: 3, moodBonus: 8, label: 'The dagger soul sharpens you!' },      bagPassive: { description: 'Ninja: 25% chance of 1/4-power bonus melee strike 🗡️', ninjaCombo: true } },
  { emoji: '👑', name: 'Crown',        description: '+1 all stats & +15 mood · Bag: royal aura',  effect: { attackBonus: 1, defenseBonus: 1, speedBonus: 1, evasionBonus: 1, luckBonus: 1, hpBonus: 1, moodBonus: 15, label: 'You rule! All stats rise!' }, bagPassive: { description: '20% of enemies flee when they spot you 👑', royalAura: true, nonStackable: true } },
  { emoji: '🌊', name: 'Wave',         description: '+2 HP, +5 EVA · Bag: regen aura (stacks)',           effect: { hpBonus: 2, evasionBonus: 5, moodBonus: 15, label: 'A wave of calm washes over you!' },     bagPassive: { description: '+1 HP every turn, +2 HP when resting 🌊', combatRegen: true } },
  { emoji: '🧊', name: 'Ice',          description: '+2 DEF, +4 EVA · Bag: +1 DEF/EVA, aura slows', effect: { defenseBonus: 2, evasionBonus: 4, moodBonus: 8, label: 'Ice encases you protectively!' },  bagPassive: { description: '+1 DEF/EVA · aura slows adjacent foes ❄️', defenseBonus: 1, evasionBonus: 1, freezeAura: true, nonStackable: true } },
  { emoji: '🌙', name: 'Moon',         description: '+6 EVA, +5 SPD · Bag: −1 vision, +stealth', effect: { evasionBonus: 6, speedBonus: 5, moodBonus: 25, label: 'Moonlight floods your soul!' },       bagPassive: { description: '−1 vision but enemies have halved detection', losBonus: -1, stealthBonus: 1, nonStackable: true } },
  { emoji: '🎲', name: 'Die',          description: 'Random: +1–3 to two stats · Bag: +1 LCK, ADV', effect: { attackBonus: Math.ceil(Math.random() * 3), speedBonus: Math.ceil(Math.random() * 3), moodBonus: 10, label: 'The die is cast!' }, bagPassive: { description: '+1 LCK · advantage on all dice rolls 🎲', luckBonus: 1, advantageDice: true, nonStackable: true } },
  { emoji: '🦋', name: 'Butterfly',    description: '+8 EVA, +20 mood · Bag: dodge heal (stacks)',        effect: { evasionBonus: 8, moodBonus: 20, label: 'You transform — lighter than air!' },               bagPassive: { description: 'Dodging an attack restores 1 HP 🦋', dodgeHeal: true } },
  { emoji: '⛵', name: 'Boat',         description: '+50g, +20 mood · Bag: cross water tiles freely', effect: { moodBonus: 20, label: 'The boat bobs beneath you — water holds no fear!' },             bagPassive: { description: 'Cross water tiles while carried', canSwim: true, nonStackable: true } },
];

export function getRandomEmojiPower(): Omit<EmojiItem, 'id' | 'consumed'> {
  return EMOJI_POWERS[Math.floor(Math.random() * EMOJI_POWERS.length)];
}

// ── Tier 1: floors 1–9 ────────────────────────────────────────────────────
export const EQUIPMENT_DROPS_T1: Omit<EmojiItem, 'id' | 'consumed'>[] = [
  // Staves & Wands (Wizard mainHand)
  { emoji: '🪄', name: 'Magic Wand',       description: 'Wizard main hand: +3 ATK, +1 SPD. Amplifies spell power.',              isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'staff', equipBonus: { attack: 3, speed: 1 } },
  { emoji: '🔱', name: 'Trident Staff',    description: 'Wizard main hand: +5 ATK. Raw arcane force.',                           isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'staff', equipBonus: { attack: 5 } },
  { emoji: '🌂', name: 'Arcane Parasol',   description: 'Wizard main/off-hand: +2 ATK, +2 EVA. Stylish protection.',             isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'staff', equipBonus: { attack: 2, evasion: 2 } },
  // Blades (Ninja mainHand / offHand)
  { emoji: '⚔️', name: 'Sword',            description: 'Ninja main/off-hand: +5 ATK. Dual wield for 4 total strikes.',          isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 5 } },
  { emoji: '🔪', name: 'Combat Knife',     description: 'Ninja main/off-hand: +3 ATK, +2 SPD. Fast and lethal.',                 isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 3, speed: 2 } },
  { emoji: '🗡️', name: 'Assassin Blade',  description: 'Ninja main/off-hand: +4 ATK, +1 SPD. Balanced for dual wield.',         isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 4, speed: 1 } },
  // Bows (Ranger mainHand)
  { emoji: '🏹', name: 'Longbow',          description: 'Ranger main hand: +4 ATK to ranged attacks.',                           isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'bow',   equipBonus: { attack: 4 } },
  { emoji: '🎯', name: 'Precision Bow',    description: 'Ranger main hand: +3 ATK, +3 LCK. Better crits at range.',              isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'bow',   equipBonus: { attack: 3, luck: 3 } },
  // Guns (Cowboy / Ranger mainHand & offHand)
  { emoji: '🔫', name: 'Revolver',         description: 'Cowboy/Ranger: +4 ATK. Cowboy dual-wield = ranged auto-attack (costs 1 🪙 bullet/shot).',      isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'gun',   equipBonus: { attack: 4 } },
  { emoji: '💥', name: 'Hand Cannon',      description: 'Cowboy/Ranger: +6 ATK, -1 SPD. Heavy stopping power (costs 1 🪙 bullet/shot in dual-gun mode).', isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'gun',   equipBonus: { attack: 6, speed: -1 } },
  // Ranger offHand melee
  { emoji: '🔰', name: 'Hunting Blade',    description: 'Ranger off-hand: +3 ATK to melee. Separate from ranged damage.',        isEquipment: true, equipSlots: ['offHand'],              weaponKind: 'blade', equipBonus: { attack: 3 } },
  // Special Ammo (Ranger offHand)
  { emoji: '🔥', name: 'Fire Arrows',      description: 'Ranger off-hand: ranged hits ignite enemies (1 dmg/turn, 3 turns).',    isEquipment: true, equipSlots: ['offHand'],              specialAmmoKind: 'fire',   equipBonus: {} },
  { emoji: '🧊', name: 'Ice Arrows',       description: 'Ranger off-hand: ranged hits slow enemies for 3 turns.',                isEquipment: true, equipSlots: ['offHand'],              specialAmmoKind: 'freeze', equipBonus: {} },
  // Body Armor
  { emoji: '⛑️', name: 'Combat Helmet',    description: 'Body: +3 DEF. Battle-worn headgear.',                                   isEquipment: true, equipSlots: ['body'],                 armorKind: 'armor', equipBonus: { defense: 3 } },
  { emoji: '🦺', name: 'Chain Vest',       description: 'Body: +4 DEF. Woven metal rings protect vital organs.',                 isEquipment: true, equipSlots: ['body'],                 armorKind: 'armor', equipBonus: { defense: 4 } },
  { emoji: '🧥', name: "Traveler's Cloak", description: 'Body: +2 DEF, +1 SPD. Light and flexible.',                            isEquipment: true, equipSlots: ['body'],                 armorKind: 'light', equipBonus: { defense: 2, speed: 1 } },
  { emoji: '🥋', name: 'Ninja Gi',         description: 'Body: +1 DEF, +2 EVA, +1 SPD. Lightweight combat suit.',               isEquipment: true, equipSlots: ['body'],                 armorKind: 'light', equipBonus: { defense: 1, evasion: 2, speed: 1 } },
  // Off-hand Shield
  { emoji: '🪬', name: 'Ward Shield',      description: 'Off-hand: +3 DEF, +3 EVA. Mystical ward.',                              isEquipment: true, equipSlots: ['offHand'],              armorKind: 'shield', equipBonus: { defense: 3, evasion: 3 } },
  // Accessories
  { emoji: '💍', name: 'Power Ring',       description: 'Accessory: +2 ATK, +2 LCK. Ancient enchantment.',                      isEquipment: true, equipSlots: ['accessory'],            equipBonus: { attack: 2, luck: 2 } },
  { emoji: '📿', name: 'Lucky Amulet',     description: 'Accessory: +3 LCK, +2 EVA. Ward off misfortune.',                      isEquipment: true, equipSlots: ['accessory'],            equipBonus: { luck: 3, evasion: 2 } },
  { emoji: '🏅', name: 'Battle Medal',     description: 'Accessory: +3 ATK, +1 DEF. For the decorated warrior.',                isEquipment: true, equipSlots: ['accessory'],            equipBonus: { attack: 3, defense: 1 } },
  { emoji: '🧿', name: 'Mystic Orb',       description: 'Accessory: +4 EVA, +1 SPD. They never see you coming.',                isEquipment: true, equipSlots: ['accessory'],            equipBonus: { evasion: 4, speed: 1 } },
];

// ── Tier 2: floors 10–19 (70% chance when floor ≥ 10) ────────────────────
export const EQUIPMENT_DROPS_T2: Omit<EmojiItem, 'id' | 'consumed'>[] = [
  // Staves & Wands
  { emoji: '🪄', name: 'Arcane Wand',      description: 'Wizard main hand: +5 ATK, +2 SPD. Amplified runic focus.',             isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'staff', equipBonus: { attack: 5, speed: 2 } },
  { emoji: '🔱', name: 'Void Trident',     description: 'Wizard main hand: +8 ATK. Carved with eldritch runes.',                isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'staff', equipBonus: { attack: 8 } },
  { emoji: '🌂', name: 'Phase Parasol',    description: 'Wizard main/off-hand: +3 ATK, +4 EVA. Bends space slightly.',          isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'staff', equipBonus: { attack: 3, evasion: 4 } },
  // Blades
  { emoji: '⚔️', name: 'War Sword',        description: 'Ninja main/off-hand: +8 ATK. Heavy-forged for deep combat.',           isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 8 } },
  { emoji: '🔪', name: 'Switchblade',      description: 'Ninja main/off-hand: +5 ATK, +3 SPD. Spring-loaded hair-trigger.',     isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 5, speed: 3 } },
  { emoji: '🗡️', name: 'Duelist Blade',   description: 'Ninja main/off-hand: +6 ATK, +2 SPD. Balanced for precise dueling.',   isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 6, speed: 2 } },
  // Bows
  { emoji: '🏹', name: 'War Bow',          description: 'Ranger main hand: +7 ATK. Reinforced limbs for deeper draw.',          isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'bow',   equipBonus: { attack: 7 } },
  { emoji: '🎯', name: 'Eagle Eye Bow',    description: 'Ranger main hand: +5 ATK, +5 LCK. Pinpoint accuracy.',                 isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'bow',   equipBonus: { attack: 5, luck: 5 } },
  // Guns
  { emoji: '🔫', name: 'Six-Shooter',      description: 'Cowboy/Ranger: +7 ATK. Fast cylinder, more stopping power.',           isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'gun',   equipBonus: { attack: 7 } },
  { emoji: '💥', name: 'War Cannon',       description: 'Cowboy/Ranger: +9 ATK, -1 SPD. Devastating bore.',                     isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'gun',   equipBonus: { attack: 9, speed: -1 } },
  // Ranger offHand melee
  { emoji: '🔰', name: 'Hunting Sword',    description: 'Ranger off-hand: +5 ATK to melee. Longer reach, harder hits.',         isEquipment: true, equipSlots: ['offHand'],              weaponKind: 'blade', equipBonus: { attack: 5 } },
  // Special Ammo — unchanged (no tier 2 version)
  { emoji: '🔥', name: 'Fire Arrows',      description: 'Ranger off-hand: ranged hits ignite enemies (1 dmg/turn, 3 turns).',   isEquipment: true, equipSlots: ['offHand'],              specialAmmoKind: 'fire',   equipBonus: {} },
  { emoji: '🧊', name: 'Ice Arrows',       description: 'Ranger off-hand: ranged hits slow enemies for 3 turns.',               isEquipment: true, equipSlots: ['offHand'],              specialAmmoKind: 'freeze', equipBonus: {} },
  // Body Armor
  { emoji: '⛑️', name: 'Steel Helmet',     description: 'Body: +5 DEF. Tempered steel headgear.',                               isEquipment: true, equipSlots: ['body'],                 armorKind: 'armor', equipBonus: { defense: 5 } },
  { emoji: '🦺', name: 'Splint Mail',      description: 'Body: +7 DEF. Interlocked steel plates over chain.',                   isEquipment: true, equipSlots: ['body'],                 armorKind: 'armor', equipBonus: { defense: 7 } },
  { emoji: '🧥', name: 'Battle Cloak',     description: 'Body: +3 DEF, +2 SPD. Reinforced weave, combat-ready.',               isEquipment: true, equipSlots: ['body'],                 armorKind: 'light', equipBonus: { defense: 3, speed: 2 } },
  { emoji: '🥋', name: 'Master Gi',        description: 'Body: +2 DEF, +4 EVA, +2 SPD. Expert-cut combat suit.',               isEquipment: true, equipSlots: ['body'],                 armorKind: 'light', equipBonus: { defense: 2, evasion: 4, speed: 2 } },
  // Shield
  { emoji: '🪬', name: 'Mythic Ward',      description: 'Off-hand: +5 DEF, +5 EVA. Ancient divine ward.',                       isEquipment: true, equipSlots: ['offHand'],              armorKind: 'shield', equipBonus: { defense: 5, evasion: 5 } },
  // Accessories
  { emoji: '💍', name: 'Arcane Ring',      description: 'Accessory: +4 ATK, +3 LCK. Deeply enchanted metal.',                  isEquipment: true, equipSlots: ['accessory'],            equipBonus: { attack: 4, luck: 3 } },
  { emoji: '📿', name: 'Fortune Amulet',   description: 'Accessory: +5 LCK, +3 EVA. Supreme luck charm.',                      isEquipment: true, equipSlots: ['accessory'],            equipBonus: { luck: 5, evasion: 3 } },
  { emoji: '🏅', name: 'Glory Medal',      description: 'Accessory: +5 ATK, +2 DEF. Elite warrior\'s honor.',                  isEquipment: true, equipSlots: ['accessory'],            equipBonus: { attack: 5, defense: 2 } },
  { emoji: '🧿', name: 'Ancient Orb',      description: 'Accessory: +6 EVA, +2 SPD. Unseen as the wind.',                      isEquipment: true, equipSlots: ['accessory'],            equipBonus: { evasion: 6, speed: 2 } },
];

// ── Tier 3: floors 20+ (50% chance when floor ≥ 20, 80% when floor ≥ 30) ─
export const EQUIPMENT_DROPS_T3: Omit<EmojiItem, 'id' | 'consumed'>[] = [
  // Staves & Wands
  { emoji: '🪄', name: 'Starfire Wand',    description: 'Wizard main hand: +8 ATK, +3 SPD. Star-aligned power.',               isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'staff', equipBonus: { attack: 8, speed: 3 } },
  { emoji: '🔱', name: 'Abyssal Trident',  description: 'Wizard main hand: +12 ATK. Forged in the void.',                      isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'staff', equipBonus: { attack: 12 } },
  { emoji: '🌂', name: 'Null Parasol',     description: 'Wizard main/off-hand: +5 ATK, +6 EVA. Bends probability.',            isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'staff', equipBonus: { attack: 5, evasion: 6 } },
  // Blades
  { emoji: '⚔️', name: 'Mythic Sword',     description: 'Ninja main/off-hand: +12 ATK. Legend-forged steel.',                  isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 12 } },
  { emoji: '🔪', name: 'Void Blade',       description: 'Ninja main/off-hand: +8 ATK, +4 SPD. Cuts through reality.',          isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 8, speed: 4 } },
  { emoji: '🗡️', name: 'Shadow Dagger',   description: 'Ninja main/off-hand: +9 ATK, +3 SPD. Strikes from the dark.',         isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'blade', equipBonus: { attack: 9, speed: 3 } },
  // Bows
  { emoji: '🏹', name: 'Celestial Bow',    description: 'Ranger main hand: +11 ATK. Strung with starlight.',                   isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'bow',   equipBonus: { attack: 11 } },
  { emoji: '🎯', name: 'Perfect Aim',      description: 'Ranger main hand: +8 ATK, +8 LCK. Never misses.',                     isEquipment: true, equipSlots: ['mainHand'],             weaponKind: 'bow',   equipBonus: { attack: 8, luck: 8 } },
  // Guns
  { emoji: '🔫', name: 'Magnum',           description: 'Cowboy/Ranger: +10 ATK. One shot, one kill.',                         isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'gun',   equipBonus: { attack: 10 } },
  { emoji: '💥', name: 'Siege Cannon',     description: 'Cowboy/Ranger: +14 ATK, -2 SPD. Apocalyptic stopping power.',         isEquipment: true, equipSlots: ['mainHand', 'offHand'],  weaponKind: 'gun',   equipBonus: { attack: 14, speed: -2 } },
  // Ranger offHand melee
  { emoji: '🔰', name: 'Battle Blade',     description: 'Ranger off-hand: +8 ATK to melee. Deep-dungeon forged.',              isEquipment: true, equipSlots: ['offHand'],              weaponKind: 'blade', equipBonus: { attack: 8 } },
  // Special Ammo — unchanged
  { emoji: '🔥', name: 'Fire Arrows',      description: 'Ranger off-hand: ranged hits ignite enemies (1 dmg/turn, 3 turns).',  isEquipment: true, equipSlots: ['offHand'],              specialAmmoKind: 'fire',   equipBonus: {} },
  { emoji: '🧊', name: 'Ice Arrows',       description: 'Ranger off-hand: ranged hits slow enemies for 3 turns.',              isEquipment: true, equipSlots: ['offHand'],              specialAmmoKind: 'freeze', equipBonus: {} },
  // Body Armor
  { emoji: '⛑️', name: 'Adamant Helm',     description: 'Body: +8 DEF. Near-indestructible alloy.',                            isEquipment: true, equipSlots: ['body'],                 armorKind: 'armor', equipBonus: { defense: 8 } },
  { emoji: '🦺', name: 'Dragon Mail',      description: 'Body: +11 DEF. Scales of an ancient drake.',                          isEquipment: true, equipSlots: ['body'],                 armorKind: 'armor', equipBonus: { defense: 11 } },
  { emoji: '🧥', name: 'Shadow Mantle',    description: 'Body: +5 DEF, +3 SPD. Woven from shadow essence.',                    isEquipment: true, equipSlots: ['body'],                 armorKind: 'light', equipBonus: { defense: 5, speed: 3 } },
  { emoji: '🥋', name: 'Void Gi',          description: 'Body: +3 DEF, +6 EVA, +3 SPD. Exists between moments.',              isEquipment: true, equipSlots: ['body'],                 armorKind: 'light', equipBonus: { defense: 3, evasion: 6, speed: 3 } },
  // Shield
  { emoji: '🪬', name: 'Divine Ward',      description: 'Off-hand: +8 DEF, +8 EVA. Blessed by something ancient.',             isEquipment: true, equipSlots: ['offHand'],              armorKind: 'shield', equipBonus: { defense: 8, evasion: 8 } },
  // Accessories
  { emoji: '💍', name: 'God Ring',         description: 'Accessory: +6 ATK, +5 LCK. Power beyond reckoning.',                  isEquipment: true, equipSlots: ['accessory'],            equipBonus: { attack: 6, luck: 5 } },
  { emoji: '📿', name: 'Destiny Amulet',   description: 'Accessory: +8 LCK, +5 EVA. Fate bends around you.',                  isEquipment: true, equipSlots: ['accessory'],            equipBonus: { luck: 8, evasion: 5 } },
  { emoji: '🏅', name: 'Champion Medal',   description: 'Accessory: +8 ATK, +4 DEF. The deepest dungeon\'s mark.',             isEquipment: true, equipSlots: ['accessory'],            equipBonus: { attack: 8, defense: 4 } },
  { emoji: '🧿', name: 'Void Orb',         description: 'Accessory: +9 EVA, +3 SPD. Perceivable only as absence.',             isEquipment: true, equipSlots: ['accessory'],            equipBonus: { evasion: 9, speed: 3 } },
];

// Combined pool for any direct array access
export const EQUIPMENT_DROPS = [...EQUIPMENT_DROPS_T1, ...EQUIPMENT_DROPS_T2, ...EQUIPMENT_DROPS_T3];

// Floor-scaled drop: T1 only on floors 1-9, T2 mixes in at floor 10, T3 at floor 20.
export function getRandomEquipmentDrop(floor = 1): Omit<EmojiItem, 'id' | 'consumed'> {
  let pool: typeof EQUIPMENT_DROPS_T1;
  if (floor >= 30) {
    pool = Math.random() < 0.20 ? EQUIPMENT_DROPS_T2 : EQUIPMENT_DROPS_T3;
  } else if (floor >= 20) {
    const r = Math.random();
    pool = r < 0.10 ? EQUIPMENT_DROPS_T1 : r < 0.50 ? EQUIPMENT_DROPS_T2 : EQUIPMENT_DROPS_T3;
  } else if (floor >= 10) {
    pool = Math.random() < 0.30 ? EQUIPMENT_DROPS_T1 : EQUIPMENT_DROPS_T2;
  } else {
    pool = EQUIPMENT_DROPS_T1;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
