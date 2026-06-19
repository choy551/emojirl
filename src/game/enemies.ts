export const ENEMY_TYPES = [
  { emoji: '👿', name: 'Demon',          hp: 6,  attack: 3, defense: 1, speed: 4,  weight: 1, berserker: true },
  { emoji: '🧟', name: 'Zombie',         hp: 4,  attack: 2, defense: 0, speed: 2,  weight: 3, silent: true },
  { emoji: '🐍', name: 'Snake',          hp: 3,  attack: 2, defense: 0, speed: 8,  weight: 2 },
  { emoji: '🕷️', name: 'Spider',        hp: 2,  attack: 1, defense: 0, speed: 6,  weight: 3, packHunter: true },
  { emoji: '💀', name: 'Skeleton',       hp: 5,  attack: 3, defense: 2, speed: 3,  weight: 2, silent: true },
  { emoji: '🧙‍♂️', name: 'Dark Mage',  hp: 8,  attack: 4, defense: 1, speed: 5,  weight: 1, godBlessed: true },
  { emoji: '👁️', name: 'Eye',           hp: 3,  attack: 2, defense: 0, speed: 4,  weight: 2, godBlessed: true },
  { emoji: '🤡', name: 'Jester',         hp: 4,  attack: 1, defense: 0, speed: 9,  weight: 1, cowardly: true },
  { emoji: '👻', name: 'Ghost',          hp: 3,  attack: 2, defense: 0, speed: 5,  weight: 2, ghostly: true },
  { emoji: '🧑‍🔬', name: 'Mad Scientist', hp: 2, attack: 0, defense: 0, speed: 7, weight: 1, cowardly: true, madScientist: true, healCooldown: 0 },
  { emoji: '🧜‍♂️', name: 'Merman',     hp: 8,  attack: 4, defense: 2, speed: 6,  weight: 1, tag: 'Neutral' as const, waterAggro: true },
  { emoji: '🧚‍♀️', name: 'Cute Fairy', hp: 1,  attack: 0, defense: 0, speed: 3,  weight: 1, tag: 'Friendly' as const },
  { emoji: '🐒', name: 'Monkey',         hp: 4,  attack: 2, defense: 0, speed: 5,  weight: 2, tag: 'Neutral' as const, monkey: true },
  { emoji: '🐦‍⬛', name: 'Crow',          hp: 3,  attack: 1, defense: 0, speed: 8,  weight: 2, cowardly: true, crow: true },
  { emoji: '🧝‍♀️', name: 'Elf Archer',    hp: 7,  attack: 3, defense: 1, speed: 5,  weight: 2, ranged: true },
];

export const FOREST_ENEMY_TYPES = [
  { emoji: '🐺', name: 'Wolf',  hp: 7,  attack: 3, defense: 1, speed: 7,  weight: 2, packHunter: true },
  { emoji: '🦊', name: 'Fox',   hp: 4,  attack: 2, defense: 0, speed: 9,  weight: 3, cowardly: true },
  { emoji: '🐗', name: 'Boar',  hp: 9,  attack: 4, defense: 2, speed: 5,  weight: 2, berserker: true },
];

export const BOSS_TYPES = [
  { emoji: '🐉', name: 'Dragon',       hp: 30, attack: 8,  defense: 4, speed: 5, berserker: true, godBlessed: true },
  { emoji: '👿', name: 'Arch-Demon',   hp: 28, attack: 9,  defense: 3, speed: 6, berserker: true },
  { emoji: '🧟', name: 'Lich',         hp: 25, attack: 7,  defense: 5, speed: 4, godBlessed: true },
  { emoji: '🦑', name: 'Kraken',       hp: 32, attack: 8,  defense: 4, speed: 3, packHunter: true },
  { emoji: '🕷️', name: 'Spider Queen', hp: 26, attack: 7,  defense: 3, speed: 8, packHunter: true },
];

export const BOSS_TYPE = BOSS_TYPES[0];

export function getBossForFloor(floor: number) {
  const idx = Math.floor(floor / 5) % BOSS_TYPES.length;
  return BOSS_TYPES[idx];
}

// Elf Archer (ranged) spawn weight: kept rare until the D:5 boss is beaten
// (difficultyTier becomes >= 1 on the first boss kill), then bumped above its
// base weight so archers become a more common threat in the back half of a run.
function enemySpawnWeight(e: typeof ENEMY_TYPES[number], difficultyTier: number): number {
  if (e.ranged) return difficultyTier >= 1 ? 3.5 : 0.25;
  return e.weight;
}

export function getRandomEnemy(floor: number, difficultyTier = 0) {
  const valid = ENEMY_TYPES.filter(e => floor >= 1 || e.weight >= 2);
  const total = valid.reduce((s, e) => s + enemySpawnWeight(e, difficultyTier), 0);
  let roll = Math.random() * total;
  for (const e of valid) {
    roll -= enemySpawnWeight(e, difficultyTier);
    if (roll <= 0) {
      if (!e.godBlessed && floor > 10) {
        const scaledChance = Math.min(0.30, 0.05 * (1 + 0.15 * Math.max(0, floor - 10) / 5));
        if (Math.random() < scaledChance) return { ...e, godBlessed: true as const };
      }
      return e;
    }
  }
  return valid[0];
}

export function getEchoEnemy(bossType: typeof BOSS_TYPES[number]) {
  const statScale = 0.70 + Math.random() * 0.15;
  return {
    emoji: bossType.emoji,
    name: `${bossType.name} Echo`,
    hp: Math.max(1, Math.round(bossType.hp * statScale)),
    attack: Math.max(1, Math.round(bossType.attack * statScale)),
    defense: Math.max(0, Math.round(bossType.defense * statScale)),
    speed: bossType.speed,
    weight: 1,
    isEcho: true as const,
    berserker: bossType.berserker,
    packHunter: bossType.packHunter,
  };
}

export function getForestEnemy(_floor: number) {
  const total = FOREST_ENEMY_TYPES.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of FOREST_ENEMY_TYPES) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return FOREST_ENEMY_TYPES[0];
}

export const ADVENTURER_TYPES = [
  { emoji: '🧙', name: 'Wandering Mage',   hp: 10, attack: 4, defense: 2, speed: 4, weight: 1, tag: 'Neutral' as const, isAdventurer: true as const },
  { emoji: '🥷', name: 'Lost Ninja',        hp: 8,  attack: 5, defense: 1, speed: 6, weight: 1, tag: 'Neutral' as const, isAdventurer: true as const },
  { emoji: '🧝', name: 'Stray Ranger',      hp: 9,  attack: 4, defense: 2, speed: 5, weight: 1, tag: 'Neutral' as const, isAdventurer: true as const },
  { emoji: '🤠', name: 'Lonesome Cowpoke',  hp: 11, attack: 5, defense: 2, speed: 4, weight: 1, tag: 'Neutral' as const, isAdventurer: true as const },
  { emoji: '🧑‍🎤', name: 'Wandering Bard', hp: 7,  attack: 3, defense: 1, speed: 5, weight: 1, tag: 'Neutral' as const, isAdventurer: true as const },
];

export const ADVENTURER_FAVORITE_EMOJIS = [
  '❤️', '🔥', '⚡', '💎', '🍀', '🌟', '🔮', '🛡️', '🍄', '🌙', '🌊', '🎲',
  '🗡️', '💀', '🦋', '🧊', '🎯', '💊', '👑', '🧲',
];

export function getRandomAdventurer() {
  return ADVENTURER_TYPES[Math.floor(Math.random() * ADVENTURER_TYPES.length)];
}

export function adventurerSpawnChance(floor: number): number {
  // Upper floors: ~30%. Dwindles as depth increases. Floor 10: ~7.5%. Floor 15+: ~3% min.
  return Math.max(0.03, 0.30 - (floor - 1) * 0.025);
}
