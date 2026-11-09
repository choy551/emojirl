import type { Enemy, EmojiItem, Player, Position } from './types';
import { markEnemyKilled } from './discoveries';
import { rollKillDrop } from './dropTable';
import { starXpGain } from './emojiBalance';
import { playerBagPassives, playerSoftCap } from './inventory';
import { restoreStolenEmojis, stolenEmojiSummary } from './monkeyLoot';
import { applyLevelUp } from './playerTurn';
import { notePrestigeKill } from './prestige';
import { levelFromXP, moodMax } from './progression';

type GroundItem = EmojiItem & { pos: Position };

export interface LungeStrikeResult {
  player: Player;
  enemies: Enemy[];
  items: GroundItem[];
  killCounts: Record<string, number>;
  logs: string[];
  difficultyTier: number;
}

/**
 * Lunge used to delete a dead foe inside setState and report the line with addLog.
 * The returned state rebuilt the log from the previous lines, so the kill vanished.
 * This is the same bookkeeping as a normal death, written onto the state that removes the foe.
 */
export function applyLungeStrike(input: {
  player: Player;
  enemies: Enemy[];
  items: GroundItem[];
  killCounts: Record<string, number>;
  targetId: string;
  enemyHp: number;
  enemyDied: boolean;
  floor: number;
  difficultyTier?: number;
  rng?: () => number;
}): LungeStrikeResult {
  const logs: string[] = ['🤺 Lunge!'];
  const enemies = input.enemies.map(e => ({ ...e }));
  const idx = enemies.findIndex(e => e.id === input.targetId);
  let player = input.player;
  const base: LungeStrikeResult = {
    player,
    enemies,
    items: input.items,
    killCounts: input.killCounts,
    logs,
    difficultyTier: input.difficultyTier ?? 0,
  };
  if (idx < 0) return base;
  const target = enemies[idx];
  if (!input.enemyDied) {
    enemies[idx] = { ...target, hp: input.enemyHp, engaged: true };
    return { ...base, enemies };
  }

  if (target.monkey && target.stolenEmojis?.length) {
    const restored = restoreStolenEmojis(player, target.stolenEmojis);
    const bankNote = restored.banked > 0 ? ` (${restored.banked} overflowed to bank)` : '';
    logs.push(`🐒 ${target.emoji} Monkey dropped your ${stolenEmojiSummary(target.stolenEmojis)}! Soul restored.${bankNote}`);
    player = { ...player, inventory: restored.inventory, bank: restored.bank };
  }

  markEnemyKilled(target.emoji);
  const killCounts = { ...input.killCounts, [target.emoji]: (input.killCounts[target.emoji] ?? 0) + 1 };
  const xpGain = starXpGain(target.isBoss ? 25 : 5, player.stats.xpBoostTurns);
  const newXP = player.stats.xp + xpGain;
  const oldLevel = player.stats.level;
  const newLevel = levelFromXP(newXP);
  player = { ...player, stats: { ...player.stats, xp: newXP } };
  if (target.isBoss) {
    logs.push(`🏆 You defeated ${target.name}! +${xpGain} XP!`);
    logs.push('⬆️ Darkness stirs — enemies grow stronger from here on!');
  }
  if (newLevel > oldLevel) player = applyLevelUp(player, oldLevel, newLevel, (text) => logs.push(text));
  player = {
    ...player,
    stats: { ...player.stats, moodValue: Math.min(moodMax(player.characterClass), player.stats.moodValue + 10) },
  };
  logs.push(`🤺 Lunge kills ${target.emoji} ${target.name}!`);
  const paid = notePrestigeKill(player, input.floor, playerSoftCap(player).raw.luck);
  player = paid.player;
  logs.push(...paid.logs);
  enemies.splice(idx, 1);
  const drop = rollKillDrop({
    boss: !!target.isBoss,
    clover: playerBagPassives(player).bonusLoot,
    floor: input.floor,
    playerClass: player.characterClass,
    rng: input.rng,
  });
  const items = drop
    ? [...input.items, { ...drop, id: `drop-lunge-${target.id}`, consumed: false, pos: target.pos }]
    : input.items;
  return {
    player,
    enemies,
    items,
    killCounts,
    logs,
    difficultyTier: target.isBoss ? (input.difficultyTier ?? 0) + 1 : (input.difficultyTier ?? 0),
  };
}
