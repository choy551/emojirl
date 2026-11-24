import type { Enemy, EmojiItem, Player, Position } from './types';
import { markEnemyKilled } from './discoveries';
import { rollKillDrop } from './dropTable';
import { appendMonkeyPickaxe } from './pickaxe';
import { spareLethalHit } from './flashSignals';
import { applyEquippedAttack, playerBagPassives, playerSoftCap } from './inventory';
import { restoreStolenEmojis, stolenEmojiSummary } from './monkeyLoot';
import { applyLevelUp } from './playerTurn';
import { executeStrike, notePrestigeKill } from './prestige';
import {
  HITMAN_EXECUTE_BULLETS,
  HITMAN_EXECUTE_CD,
  HITMAN_EXECUTE_GOLD,
} from './prestigeConstants';
import { levelFromXP, moodMax } from './progression';
import { starXpGain } from './emojiBalance';
import { goldWithLuck } from './softCap';

type GroundItem = EmojiItem & { pos: Position };

export interface ExecuteContractResult {
  player: Player;
  enemies: Enemy[];
  items: GroundItem[];
  killCounts: Record<string, number>;
  logs: string[];
  difficultyTier: number;
  playerDied: boolean;
  killer?: { name: string; emoji: string };
}

/**
 * Execute Contract used to delete the foe inside the Hitman handler and report
 * the line with a separate setState. That skipped kill tracking, loot, and the
 * log the returned state actually keeps. This is the same kill bookkeeping as a
 * normal death, plus the contract line.
 */
export function resolveExecuteContract(input: {
  player: Player;
  enemies: Enemy[];
  items: GroundItem[];
  killCounts: Record<string, number>;
  target: Enemy;
  floor: number;
  attack: number;
  difficultyTier?: number;
  rng?: () => number;
}): ExecuteContractResult {
  const logs: string[] = [];
  const enemies = input.enemies.map(e => ({ ...e }));
  const idx = enemies.findIndex(e => e.id === input.target.id);
  const spentStill = input.player.stats.stillStacks ?? 0;
  let player: Player = {
    ...input.player,
    stats: { ...input.player.stats, executeCooldown: HITMAN_EXECUTE_CD, stillStacks: 0 },
  };
  const base: ExecuteContractResult = {
    player,
    enemies,
    items: input.items,
    killCounts: input.killCounts,
    logs,
    difficultyTier: input.difficultyTier ?? 0,
    playerDied: false,
  };
  if (idx < 0) return base;

  const target = enemies[idx];
  const rolled = executeStrike(input.attack, target.hp, target.maxHp, target.defense ?? 0, spentStill);
  const strike = { ...rolled, damage: applyEquippedAttack(input.player, rolled.damage) };
  const lethal = target.hp - strike.damage <= 0;

  const spared = spareLethalHit({
    enemy: target,
    lethal,
    enemies,
    index: idx,
    playerHp: player.stats.hp,
    turn: 0,
    log: (msg) => logs.push(msg),
  });
  if (spared.spared) {
    return {
      ...base,
      player: { ...player, stats: { ...player.stats, hp: spared.playerHp } },
      enemies: spared.enemies,
      playerDied: spared.playerDied,
      killer: spared.playerDied ? { name: target.name, emoji: target.emoji } : undefined,
      logs,
    };
  }

  if (!lethal) {
    enemies[idx] = { ...target, hp: target.hp - strike.damage, engaged: true };
    const stillNote = !strike.executed && spentStill > 0 ? ` Still +${spentStill * 25}% ATK, stacks spent.` : '';
    logs.push(strike.executed
      ? `🕴️ The mark survives on a thread.${spentStill > 0 ? ' Still stacks spent.' : ''}`
      : `🕴️ Execute Contract — ${strike.damage} damage.${stillNote}`);
    return { ...base, enemies };
  }

  if ((target.monkey || target.raccoon) && target.stolenEmojis?.length) {
    const restored = restoreStolenEmojis(player, target.stolenEmojis);
    const bankNote = restored.banked > 0 ? ` (${restored.banked} overflowed to bank)` : '';
    logs.push(target.raccoon
      ? `🦝 ${target.emoji} ${target.name} drops your ${stolenEmojiSummary(target.stolenEmojis)}!${bankNote}`
      : `🐒 ${target.emoji} Monkey dropped your ${stolenEmojiSummary(target.stolenEmojis)}! Soul restored.${bankNote}`);
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

  let contractLine = `🕴️ Contract executed — ${target.emoji} ${target.name}.`;
  if (strike.executed) {
    const gained = goldWithLuck(HITMAN_EXECUTE_GOLD, playerSoftCap(player).raw.luck);
    player = {
      ...player,
      ammo: (player.ammo ?? 0) + HITMAN_EXECUTE_BULLETS,
      stats: { ...player.stats, gold: player.stats.gold + gained },
    };
    contractLine += ` +${gained} gold, +${HITMAN_EXECUTE_BULLETS} bullets.`;
  }
  logs.push(contractLine);

  const paid = notePrestigeKill(player, input.floor, playerSoftCap(player).raw.luck, target);
  player = paid.player;
  logs.push(...paid.logs);

  enemies.splice(idx, 1);
  const drop = rollKillDrop({
    boss: !!target.isBoss,
    clover: playerBagPassives(player).bonusLoot,
    magicFindPct: playerSoftCap(player).magicFindPct,
    floor: input.floor,
    playerClass: player.characterClass,
    rng: input.rng,
  });
  const items = appendMonkeyPickaxe(
    drop
      ? [...input.items, { ...drop, id: `drop-execute-${target.id}`, consumed: false, pos: target.pos }]
      : input.items,
    target.monkey,
    input.floor,
    target.pos,
  );

  return {
    player,
    enemies,
    items,
    killCounts,
    logs,
    difficultyTier: target.isBoss ? (input.difficultyTier ?? 0) + 1 : (input.difficultyTier ?? 0),
    playerDied: false,
  };
}
