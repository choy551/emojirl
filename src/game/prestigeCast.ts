import type { Enemy, FloatingText, Player, Position } from './types';
import { isHostileCombatTarget, resolveCombat } from './combat';
import { applyLevelUp } from './playerTurn';
import { levelFromXP } from './progression';
import { chebyshev } from './geo';
import { hasLOSBetween } from './pathfinding';
import { VISION_RADIUS } from './vision';
import type { MapGrid } from './types';
import { getRandomActiveDrop, getRandomEquipmentDrop, getRandomFloorDrop } from './emojis';
import { markEnemyKilled, markEnemySeen } from './discoveries';
import {
  fireballBlastDamage,
  genieSafeFireballEnabled,
  notePrestigeKill,
  planGenieCast,
  selfSplashDamage,
  tilesInRadius,
} from './prestige';
import { GENIE_FIREBALL_RADIUS } from './prestigeConstants';
import { applyEquipmentAndPassives, playerSoftCap } from './inventory';
import { playerMood } from './drinks';

export interface GenieVolley {
  player: Player;
  enemies: Enemy[];
  items: (import('./types').EmojiItem & { pos: Position })[];
  floats: FloatingText[];
  beam?: { positions: Position[]; color: string };
  killCountAdds: string[];
  difficultyBump: number;
  playerDied: boolean;
  killer?: { name: string; emoji: string };
  cast: boolean;
  /** True when Safe fireballs replaced the blast with a melee swing. */
  meleeFallback?: boolean;
}

function pickTarget(
  player: Player,
  enemies: Enemy[],
  map: MapGrid,
  mode: 'nearest' | 'furthest' | 'manual' | 'holdfire',
  manualTargetId: string | null,
): Enemy | undefined {
  if (mode === 'holdfire') return undefined;
  const radius = VISION_RADIUS;
  const candidates = enemies.filter(e => {
    const dist = chebyshev(player.pos, e.pos);
    return dist <= radius && e.hp > 0 && hasLOSBetween(map, player.pos, e.pos) && isHostileCombatTarget(e);
  });
  if (candidates.length === 0) return undefined;
  if (mode === 'furthest') {
    return [...candidates].sort((a, b) => chebyshev(player.pos, b.pos) - chebyshev(player.pos, a.pos))[0];
  }
  if (mode === 'manual') {
    return candidates.find(e => e.id === manualTargetId)
      ?? [...candidates].sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos))[0];
  }
  return [...candidates].sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos))[0];
}

/**
 * True when `tile` sits in the 3×3 centered on the fireball impact.
 * A caster two or more tiles away is outside that square.
 */
export function tileInFireball(impact: Position, tile: Position): boolean {
  return Math.max(Math.abs(impact.x - tile.x), Math.abs(impact.y - tile.y)) <= GENIE_FIREBALL_RADIUS;
}

/** Safe fireballs: melee an adjacent foe, otherwise hold the cast. */
export function safeFireballResponse(caster: Position, impact: Position, safeOn: boolean): 'cast' | 'melee' | 'block' {
  if (!safeOn || !tileInFireball(impact, caster)) return 'cast';
  return chebyshev(caster, impact) === 1 ? 'melee' : 'block';
}

export function safeFireballLog(melee: boolean): string {
  return melee
    ? '🧞‍♀️ Safe fireball — the splash would hit you. Melee instead.'
    : '🧞‍♀️ Safe fireball — the splash would hit you.';
}

function genieMeleeVolley(
  args: {
    player: Player;
    enemies: Enemy[];
    turn: number;
    floor: number;
    addLog: (text: string) => void;
  },
  target: Enemy,
): GenieVolley {
  const geared = applyEquipmentAndPassives(args.player);
  const result = resolveCombat(geared, target, args.addLog, {
    mood: playerMood(args.player),
    floor: args.floor,
  });
  markEnemySeen(target.emoji);
  let player: Player = {
    ...args.player,
    stats: {
      ...args.player.stats,
      hp: result.playerHp,
      gold: Math.max(0, args.player.stats.gold - (result.goldStolen ?? 0)),
    },
  };
  const floats: FloatingText[] = [];
  const dealt = target.hp - result.enemyHp;
  if (dealt > 0) {
    floats.push({ id: `melee-e-${target.id}-${args.turn}`, pos: { ...target.pos }, text: `-${dealt}`, color: '#ef4444', life: 2 });
  }
  const taken = args.player.stats.hp - result.playerHp;
  if (taken > 0) {
    floats.push({ id: `melee-p-${args.turn}`, pos: { ...player.pos }, text: `-${taken}`, color: '#f97316', life: 2 });
  }

  let enemies = args.enemies.map(e => ({ ...e }));
  const items: GenieVolley['items'] = [];
  const killCountAdds: string[] = [];
  let difficultyBump = 0;
  if (result.enemyDied) {
    markEnemyKilled(target.emoji);
    killCountAdds.push(target.emoji);
    const paid = notePrestigeKill(player, args.floor, playerSoftCap(player).raw.luck);
    player = paid.player;
    paid.logs.forEach(args.addLog);
    const xpGain = target.isBoss ? 25 : 5;
    const oldLevel = player.stats.level;
    player = { ...player, stats: { ...player.stats, xp: player.stats.xp + xpGain } };
    const newLevel = levelFromXP(player.stats.xp);
    if (target.isBoss) {
      args.addLog(`🏆 You defeated ${target.name}! +${xpGain} XP!`);
      difficultyBump += 1;
    }
    if (newLevel > oldLevel) player = applyLevelUp(player, oldLevel, newLevel, args.addLog);
    if (target.isBoss || Math.random() < 0.55) {
      const roll = Math.random();
      const drop = target.isBoss
        ? (roll < 0.4 ? getRandomEquipmentDrop(args.floor) : getRandomFloorDrop())
        : (roll < 0.10 ? getRandomEquipmentDrop(args.floor) : roll < 0.22 ? getRandomActiveDrop() : getRandomFloorDrop());
      items.push({ ...drop, id: `melee-drop-${target.id}-${args.turn}`, consumed: false, pos: { ...target.pos } });
    }
    enemies = enemies.filter(e => e.id !== target.id);
  } else {
    enemies = enemies.map(e => e.id === target.id ? { ...e, hp: result.enemyHp, engaged: dealt > 0 ? true : e.engaged } : e);
  }

  const playerDied = player.stats.hp <= 0;
  return {
    player,
    enemies,
    items,
    floats,
    killCountAdds,
    difficultyBump,
    playerDied,
    killer: playerDied ? { name: target.name, emoji: target.emoji } : undefined,
    cast: false,
    meleeFallback: true,
  };
}

/**
 * Genie Fireball: 2 MP, 3×3 around the aimed hostile. Splash is 25% of the blast
 * and lands only when the caster's tile is inside that 3×3.
 * Overchannel spends 1 extra MP for more damage at LV5. Bloodcast pays 2 HP per missing MP only.
 */
export function resolveGenieFireball(args: {
  player: Player;
  enemies: Enemy[];
  map: MapGrid;
  mode: 'nearest' | 'furthest' | 'manual' | 'holdfire';
  manualTargetId: string | null;
  turn: number;
  floor: number;
  addLog: (text: string) => void;
}): GenieVolley {
  const idle: GenieVolley = {
    player: args.player,
    enemies: args.enemies,
    items: [],
    floats: [],
    killCountAdds: [],
    difficultyBump: 0,
    playerDied: false,
    cast: false,
  };
  const target = pickTarget(args.player, args.enemies, args.map, args.mode, args.manualTargetId);
  if (!target) return idle;
  const pay = planGenieCast(args.player);
  if (!pay.canCast) {
    if (pay.blockReason) args.addLog(pay.blockReason);
    return idle;
  }

  const safe = safeFireballResponse(args.player.pos, target.pos, genieSafeFireballEnabled(args.player));
  if (safe === 'block') {
    args.addLog(safeFireballLog(false));
    return idle;
  }
  if (safe === 'melee') {
    args.addLog(safeFireballLog(true));
    return genieMeleeVolley(args, target);
  }

  const geared = applyEquipmentAndPassives(args.player);
  const blast = fireballBlastDamage(geared.stats.attack, 0, pay.damageMult);
  const splash = tileInFireball(target.pos, args.player.pos) ? selfSplashDamage(blast) : 0;
  let player: Player = {
    ...args.player,
    stats: {
      ...args.player.stats,
      mana: Math.max(0, (args.player.stats.mana ?? 0) - pay.mpSpent),
      hp: args.player.stats.hp - pay.hpSpent - splash,
    },
  };
  const floats: FloatingText[] = [];
  if (pay.hpSpent > 0) {
    args.addLog(`🧞‍♀️ Bloodcast — ${pay.hpSpent} HP for the missing mana.`);
    floats.push({ id: `blood-${args.turn}`, pos: { ...player.pos }, text: `-${pay.hpSpent}`, color: '#ef4444', life: 2 });
  }
  if (pay.kind === 'overchannel') args.addLog(`🧞‍♀️ Overchannel — fireball surges.`);
  args.addLog(splash > 0
    ? `🧞‍♀️ Fireball! ${blast} damage in a 3×3. Splash ${splash}.`
    : `🧞‍♀️ Fireball! ${blast} damage in a 3×3.`);
  if (splash > 0) {
    floats.push({ id: `splash-${args.turn}`, pos: { ...player.pos }, text: `-${splash}`, color: '#fb923c', life: 2 });
  }

  const area = new Set(tilesInRadius(target.pos, GENIE_FIREBALL_RADIUS).map(p => `${p.x},${p.y}`));
  let enemies = args.enemies.map(e => ({ ...e }));
  const items: GenieVolley['items'] = [];
  const killCountAdds: string[] = [];
  let difficultyBump = 0;
  const doomed: Enemy[] = [];

  for (const e of enemies) {
    if (!area.has(`${e.pos.x},${e.pos.y}`)) continue;
    if (!isHostileCombatTarget(e) || e.hp <= 0) continue;
    markEnemySeen(e.emoji);
    const dmg = fireballBlastDamage(geared.stats.attack, e.defense ?? 0, pay.damageMult);
    e.hp -= dmg;
    floats.push({ id: `fb-${e.id}-${args.turn}`, pos: { ...e.pos }, text: `-${dmg}`, color: '#f97316', life: 2 });
    if (e.hp <= 0) doomed.push(e);
    else e.engaged = true;
  }

  for (const dead of doomed) {
    markEnemyKilled(dead.emoji);
    killCountAdds.push(dead.emoji);
    const paid = notePrestigeKill(player, args.floor, playerSoftCap(player).raw.luck);
    player = paid.player;
    paid.logs.forEach(args.addLog);
    const xpGain = dead.isBoss ? 25 : 5;
    const oldLevel = player.stats.level;
    player = { ...player, stats: { ...player.stats, xp: player.stats.xp + xpGain } };
    const newLevel = levelFromXP(player.stats.xp);
    if (dead.isBoss) {
      args.addLog(`🏆 You defeated ${dead.name}! +${xpGain} XP!`);
      difficultyBump += 1;
    }
    if (newLevel > oldLevel) player = applyLevelUp(player, oldLevel, newLevel, args.addLog);
    if (dead.isBoss || Math.random() < 0.55) {
      const roll = Math.random();
      const drop = dead.isBoss
        ? (roll < 0.4 ? getRandomEquipmentDrop(args.floor) : getRandomFloorDrop())
        : (roll < 0.10 ? getRandomEquipmentDrop(args.floor) : roll < 0.22 ? getRandomActiveDrop() : getRandomFloorDrop());
      items.push({ ...drop, id: `fb-drop-${dead.id}-${args.turn}`, consumed: false, pos: { ...dead.pos } });
    }
  }

  const alive = enemies.filter(e => e.hp > 0);
  const dx = target.pos.x - args.player.pos.x;
  const dy = target.pos.y - args.player.pos.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const beamPos: Position[] = [];
  for (let n = 1; n <= steps; n++) {
    beamPos.push({
      x: Math.round(args.player.pos.x + (dx * n) / steps),
      y: Math.round(args.player.pos.y + (dy * n) / steps),
    });
  }

  const playerDied = player.stats.hp <= 0;
  return {
    player,
    enemies: alive,
    items,
    floats,
    beam: { positions: beamPos, color: '#f97316' },
    killCountAdds,
    difficultyBump,
    playerDied,
    killer: playerDied ? { name: target.name, emoji: target.emoji } : undefined,
    cast: true,
  };
}
