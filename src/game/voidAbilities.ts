import type { EmojiItem, GameState, Player } from './types';
import { EMOJI_POWERS, getAmmoDrop, getRandomActiveDrop, getRandomEmojiPower, getRandomEquipmentDrop, getRandomFloorDrop } from './emojis';
import { buildHotbarSlots, countVoidPressureSlots, grantGhostStack } from './inventory';
import { hasLOSBetween } from './pathfinding';
import { applyLevelUp } from './playerTurn';
import { levelFromXP } from './progression';
import { applyNullMomentum, creditVoidBoss } from './voidDamage';
import { handleGodBlessedImmunity } from './flashSignals';
import { markEnemyKilled } from './discoveries';
import { restoreStolenEmojis, stolenEmojiSummary } from './monkeyLoot';
import {
  VOID_RANGER_UNLOCK_N,
  VOID_WIZARD_UNLOCK_N,
  recordHotbarSoulConsume,
  recordVoidModeConsume,
  voidModeUnlocked,
  type VoidModeProgress,
} from './voidMeta';

export type VoidAttackMode = 'melee' | 'ranger' | 'wizard';
export type GhostKillEffect = 'lightningBolt' | 'thorns' | 'burningOnHit';

const RANGED_EMOJI = new Set(['🏹', '🎯', '🔫', '💥', '🪃', '🪙']);
const MAGIC_EMOJI = new Set(['🧪', '🔮', '🌟', '💊', '🪄', '🔱', '🌂', '📖', '📜', '✨', '⚡', '🧊', '❄️', '🌙', '🧿', '💫']);

const UNMAKE_TERRAIN = new Set([
  'wall', 'door-closed', 'door-open', 'water', 'grass', 'tree', 'bush', 'crop', 'lava', 'obsidian', 'volcano',
]);

export function voidEmojiTheme(item: {
  emoji: string;
  name?: string;
  description?: string;
  weaponKind?: string;
  activeKind?: string;
  specialAmmoKind?: string;
}): 'ranger' | 'wizard' | null {
  if (item.weaponKind === 'bow' || item.weaponKind === 'gun' || item.specialAmmoKind) return 'ranger';
  if (item.activeKind === 'gun' || item.activeKind === 'boomerang') return 'ranger';
  if (item.weaponKind === 'staff') return 'wizard';
  if (RANGED_EMOJI.has(item.emoji)) return 'ranger';
  if (MAGIC_EMOJI.has(item.emoji)) return 'wizard';
  const blob = `${item.name ?? ''} ${item.description ?? ''}`.toLowerCase();
  if (/bow|arrow|gun|bullet|boomerang/.test(blob)) return 'ranger';
  if (/potion|crystal|star|spellbook|wand|magic/.test(blob)) return 'wizard';
  return null;
}

/** Active (non-dormant) ghost emojis whose bag passive supplies this effect. */
export function activeGhostEmojisFor(player: Player, effect: GhostKillEffect): string[] {
  if (player.characterClass !== '👤') return [];
  const out: string[] = [];
  for (const slot of buildHotbarSlots(player)) {
    if (!slot?.isVoidGhost || slot.isVoidGhostDormant) continue;
    const passive = slot.bagPassive ?? EMOJI_POWERS.find(e => e.emoji === slot.emoji)?.bagPassive;
    if (!passive) continue;
    const hit = effect === 'lightningBolt' ? !!passive.lightningBolt
      : effect === 'thorns' ? !!passive.thorns
      : !!passive.burningOnHit;
    if (hit) out.push(slot.emoji);
  }
  return out;
}

/**
 * A ghost-passive kill: no loot is added here, and each matching ghost emoji
 * gains one consume toward its next unlock.
 */
export function applyEntropicTithe(state: GameState, effect: GhostKillEffect): GameState {
  const emojis = activeGhostEmojisFor(state.player, effect);
  if (emojis.length === 0) return state;
  let player = state.player;
  const lines: GameState['logs'] = [];
  emojis.forEach((emoji, i) => {
    const rec = recordHotbarSoulConsume(emoji);
    if (rec.crossed) {
      player = grantGhostStack(player, emoji, rec.unlocks);
      lines.push({
        id: `tithe-unlock-${state.turn}-${i}-${emoji}`,
        text: rec.unlocks <= 1
          ? `👤 Ghost unlocked: ${emoji}`
          : `👤 Ghost unlocked: ${emoji} (stack ×${rec.unlocks})`,
        turn: state.turn,
      });
    }
    lines.push({
      id: `tithe-${state.turn}-${i}-${emoji}`,
      text: `👤 Entropic Tithe — ${emoji} +1 consume (${rec.consumes}). No loot.`,
      turn: state.turn,
    });
  });
  return { ...state, player, logs: [...lines, ...state.logs].slice(0, 24) };
}

export function nextVoidAttackMode(
  current: VoidAttackMode,
  progress: VoidModeProgress,
): { mode: VoidAttackMode; hints: string[] } {
  const order: VoidAttackMode[] = ['melee', 'ranger', 'wizard'];
  const start = Math.max(0, order.indexOf(current));
  const hints: string[] = [];
  for (let step = 1; step <= order.length; step++) {
    const mode = order[(start + step) % order.length];
    if (mode === 'melee' || voidModeUnlocked(mode, progress)) return { mode, hints };
    if (mode === 'ranger') hints.push(`Ranger autos: ${progress.ranger}/${VOID_RANGER_UNLOCK_N} ranged emoji`);
    if (mode === 'wizard') hints.push(`Wizard autos: ${progress.wizard}/${VOID_WIZARD_UNLOCK_N} magic emoji`);
  }
  return { mode: 'melee', hints };
}

export function voidAttackModeLabel(mode: VoidAttackMode): string {
  if (mode === 'ranger') return '🏹 Ranger autos';
  if (mode === 'wizard') return '🎯 Wizard autos';
  return '⚔️ Melee';
}

function pushLog(state: GameState, text: string): GameState {
  return {
    ...state,
    logs: [{ id: `unmake-${state.turn}-${text.slice(0, 12)}`, text, turn: state.turn }, ...state.logs].slice(0, 24),
  };
}

function deleteTerrain(map: GameState['map'], x: number, y: number): GameState['map'] {
  return map.map((row, ry) => row.map((t, rx) => (
    rx === x && ry === y ? { ...t, type: 'floor' as const, emoji: '⬜' } : t
  )));
}

/**
 * Unmake a tile or enemy in line of sight.
 * Enemy damage = empty hotbar slots × floor. Terrain in the deletable set is removed.
 * HP cost = filled hotbar slots. Once per floor.
 */
export function resolveUnmake(
  state: GameState,
  x: number,
  y: number,
  rng: () => number = Math.random,
): GameState {
  if (state.gameOver || state.player.characterClass !== '👤') return state;
  if (state.unmakeUsedFloor === state.currentFloor) {
    return pushLog(state, '👤 Unmake is spent until you descend.');
  }
  const tile = state.map[y]?.[x];
  if (!tile) return pushLog(state, '👤 Unmake finds nothing there.');
  if (x === state.player.pos.x && y === state.player.pos.y) {
    return pushLog(state, '👤 You cannot Unmake yourself.');
  }
  if (!hasLOSBetween(state.map, state.player.pos, { x, y })) {
    return pushLog(state, '👤 Unmake needs line of sight.');
  }
  const enemyIdx = state.enemies.findIndex(e => e.hp > 0 && e.pos.x === x && e.pos.y === y);
  const enemy = enemyIdx === -1 ? undefined : state.enemies[enemyIdx];
  const deletable = UNMAKE_TERRAIN.has(tile.type);
  if (!enemy && !deletable) return pushLog(state, '👤 Nothing there yields to Unmake.');

  const filled = countVoidPressureSlots(state.player);
  const empty = 9 - filled;
  const cost = filled;
  let player: Player = {
    ...state.player,
    stats: { ...state.player.stats, hp: state.player.stats.hp - cost },
  };
  const lines: string[] = [`👤 Unmake — ${cost} HP (${filled} filled slot${filled === 1 ? '' : 's'}).`];
  let enemies = state.enemies;
  let items = state.items;
  let killCounts = state.killCounts;
  let map = deletable ? deleteTerrain(state.map, x, y) : state.map;
  if (deletable) lines.push(`👤 ${tile.emoji} is unmade.`);

  if (enemy) {
    const dmg = empty * state.currentFloor;
    const nextHp = enemy.hp - dmg;
    lines.push(`👤 Unmake strikes ${enemy.emoji} ${enemy.name} for ${dmg} Void damage.`);
    if (nextHp <= 0 && enemy.godBlessed) {
      const hpAfterCost = player.stats.hp;
      const gb = handleGodBlessedImmunity(enemy, enemies, enemyIdx, hpAfterCost, state.turn, text => lines.push(text), []);
      if (gb.proc) {
        const counter = hpAfterCost - gb.newPlayerHp;
        player = { ...player, stats: { ...player.stats, hp: hpAfterCost - applyNullMomentum(counter, player) } };
        enemies = gb.newEnemies;
      }
    } else if (nextHp <= 0) {
      markEnemyKilled(enemy.emoji);
      enemies = enemies.filter(e => e.id !== enemy.id);
      killCounts = { ...killCounts, [enemy.emoji]: (killCounts[enemy.emoji] ?? 0) + 1 };
      if (enemy.monkey && enemy.stolenEmojis?.length) {
        const restored = restoreStolenEmojis(player, enemy.stolenEmojis);
        player = { ...player, inventory: restored.inventory, bank: restored.bank };
        lines.push(`🐒 ${enemy.emoji} dropped your ${stolenEmojiSummary(enemy.stolenEmojis)}!`);
      }
      const xpGain = enemy.isBoss ? 25 : 5;
      const oldLevel = player.stats.level;
      player = { ...player, stats: { ...player.stats, xp: player.stats.xp + xpGain } };
      const newLevel = levelFromXP(player.stats.xp);
      lines.push(enemy.isBoss
        ? `🏆 You defeated ${enemy.name}! +${xpGain} XP!`
        : `👤 ${enemy.name} is unmade. +${xpGain} XP.`);
      if (newLevel > oldLevel) {
        player = applyLevelUp(player, oldLevel, newLevel, text => lines.push(text));
      }
      if (rng() < 0.55) {
        const roll = rng();
        const drop = enemy.isBoss
          ? (roll < 0.4 ? getRandomEquipmentDrop(state.currentFloor) : getRandomEmojiPower())
          : (roll < 0.10 ? getRandomEquipmentDrop(state.currentFloor) : roll < 0.22 ? getRandomActiveDrop() : roll < 0.40 ? getAmmoDrop() : getRandomFloorDrop());
        items = [...items, { ...drop, id: `unmake-drop-${enemy.id}`, consumed: false, pos: { ...enemy.pos } }];
      }
    } else {
      enemies = enemies.map(e => e.id === enemy.id ? { ...e, hp: nextHp, engaged: true } : e);
    }
  }

  const died = player.stats.hp <= 0;
  let next: GameState = {
    ...state,
    player,
    enemies,
    items,
    map,
    killCounts,
    unmakeUsedFloor: state.currentFloor,
    logs: [
      ...lines.map((text, i) => ({ id: `unmake-${state.turn}-${i}`, text, turn: state.turn })),
      ...state.logs,
    ].slice(0, 24),
    gameOver: state.gameOver || died,
    killer: died ? { name: 'Unmake', emoji: '👤' } : state.killer,
  };
  if (enemy && enemy.hp - (9 - filled) * state.currentFloor <= 0 && !enemy.godBlessed && enemy.isBoss) {
    next = creditVoidBoss(next, enemy);
  }
  return next;
}

export function themedConsumeLog(theme: 'ranger' | 'wizard', count: number, unlocked: boolean): string {
  if (theme === 'ranger') {
    return unlocked
      ? `👤 Ranger autos unlocked (${count}/${VOID_RANGER_UNLOCK_N} ranged emoji).`
      : `👤 Ranger autos: ${count}/${VOID_RANGER_UNLOCK_N} ranged emoji.`;
  }
  return unlocked
    ? `👤 Wizard autos unlocked (${count}/${VOID_WIZARD_UNLOCK_N} magic emoji).`
    : `👤 Wizard autos: ${count}/${VOID_WIZARD_UNLOCK_N} magic emoji.`;
}

export function noteThemedHotbarConsume(item: Pick<EmojiItem, 'emoji' | 'name' | 'description' | 'weaponKind' | 'activeKind' | 'specialAmmoKind'>): { text: string } | null {
  const theme = voidEmojiTheme(item);
  if (!theme) return null;
  const { progress, unlocked } = recordVoidModeConsume(theme);
  const count = theme === 'ranger' ? progress.ranger : progress.wizard;
  return { text: themedConsumeLog(theme, count, unlocked) };
}
