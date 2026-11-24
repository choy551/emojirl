import type { MapGrid, Position } from './types';
import { PLAYER_PASSABLE_TILES } from './tiles';

/** A connecting Elephant hit shoves the player this often. */
export const ELEPHANT_KNOCK_CHANCE = 0.3;
/** Neutral unless the roll is in the top quarter. */
export const ELEPHANT_HOSTILE_CHANCE = 0.25;
export const CANDLE_LOS = 3;
export const CANDLE_TURNS = 30;
/** Flat evasion. Accuracy minus this is the hit chance. Not the floor curve. */
export const BAT_EVASION = 50;

export function elephantKnockTiles(floor: number): number {
  return floor >= 15 ? 2 : 1;
}

export function elephantTag(roll: number): 'Neutral' | 'Hostile' {
  return roll < 1 - ELEPHANT_HOSTILE_CHANCE ? 'Neutral' : 'Hostile';
}

export function applyElephantDisposition<T extends { elephant?: boolean }>(type: T, roll?: number): T {
  if (!type.elephant) return type;
  const tag = elephantTag(roll ?? Math.random());
  return { ...type, tag };
}

export function candleSightBonus(turns: number | undefined): number {
  return (turns ?? 0) > 0 ? CANDLE_LOS : 0;
}

/** Sight only. Detection and stealth are unchanged, unlike five Stars. */
export function tickCandleSight(turns: number | undefined): number | undefined {
  if (!turns || turns <= 0) return undefined;
  const next = turns - 1;
  return next > 0 ? next : undefined;
}

export function findStairs(map: MapGrid): Position | null {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < (map[y]?.length ?? 0); x++) {
      if (map[y][x]?.type === 'stairs') return { x, y };
    }
  }
  return null;
}

const WANDER_DIRS: [number, number][] = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/** One legal neighbor. `roll` in [0, 1) picks which. */
export function erraticStep(
  map: MapGrid,
  from: Position,
  occupied: Set<string>,
  passable: Set<string>,
  avoid: Position,
  roll: number,
): Position | null {
  const options: Position[] = [];
  for (const [dx, dy] of WANDER_DIRS) {
    const x = from.x + dx;
    const y = from.y + dy;
    const type = map[y]?.[x]?.type;
    if (!type || !passable.has(type)) continue;
    if (occupied.has(`${x},${y}`)) continue;
    if (x === avoid.x && y === avoid.y) continue;
    options.push({ x, y });
  }
  if (options.length === 0) return null;
  const idx = Math.min(options.length - 1, Math.floor(Math.max(0, roll) * options.length));
  return options[idx] ?? null;
}

function canLand(type: string | undefined, flies: boolean): boolean {
  if (!type) return false;
  if (type === 'lava') return true;
  if (type === 'water') return flies;
  return PLAYER_PASSABLE_TILES.has(type);
}

/**
 * Push `player` away from `elephant` up to `tiles` steps.
 * A blocked step stuns a non-flyer. Landing on lava burns a non-flyer.
 * Flyers move when the tile allows it and are never stunned or burned.
 */
export function resolveKnockback(args: {
  elephant: Position;
  player: Position;
  tiles: number;
  flies: boolean;
  tileAt: (pos: Position) => string | undefined;
  occupied: (pos: Position) => boolean;
}): { pos: Position; stunned: boolean; burned: boolean } {
  const dx = Math.sign(args.player.x - args.elephant.x);
  const dy = Math.sign(args.player.y - args.elephant.y);
  if ((dx === 0 && dy === 0) || args.tiles <= 0) {
    return { pos: { ...args.player }, stunned: false, burned: false };
  }
  let pos = { ...args.player };
  let stunned = false;
  let burned = false;
  for (let step = 0; step < args.tiles; step++) {
    const next = { x: pos.x + dx, y: pos.y + dy };
    const type = args.tileAt(next);
    if (args.occupied(next) || !canLand(type, args.flies)) {
      if (!args.flies) stunned = true;
      break;
    }
    pos = next;
    if (type === 'lava') {
      if (!args.flies) burned = true;
      break;
    }
  }
  return { pos, stunned, burned };
}
