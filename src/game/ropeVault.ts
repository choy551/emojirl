import type { GameState, Position } from './types';
import { PLAYER_PASSABLE_TILES } from './tiles';

export const ROPE_VAULT_W = 6;
export const ROPE_VAULT_H = 5;
export const HOLE_EMOJI = '🕳️';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/** Passable tiles that already belonged to the floor, before the rope carved anything. */
export function priorPassableKeys(map: GameState['map']): Set<string> {
  const keys = new Set<string>();
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[0].length; x++) {
      if (PLAYER_PASSABLE_TILES.has(map[y][x].type)) keys.add(`${x},${y}`);
    }
  }
  return keys;
}

/**
 * True when a walk from `from` can step onto a tile that was already passable
 * before the vault was carved. Eight directions, same as player movement.
 */
export function reachesPriorFloor(
  map: GameState['map'],
  from: Position,
  prior: Set<string>,
): boolean {
  const startKey = `${from.x},${from.y}`;
  if (prior.has(startKey)) return true;
  const seen = new Set<string>([startKey]);
  const queue: Position[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of DIRS) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (y < 0 || x < 0 || y >= map.length || x >= map[0].length) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      if (!PLAYER_PASSABLE_TILES.has(map[y][x].type)) continue;
      if (prior.has(key)) return true;
      seen.add(key);
      queue.push({ x, y });
    }
  }
  return false;
}

/** Drop a downstairs on a vault floor tile other than the tile the player will stand on. */
export function placeSealedVaultStairs(
  map: GameState['map'],
  vaultX: number,
  vaultY: number,
  center: Position,
): void {
  const stamp = (x: number, y: number) => {
    map[y][x] = { type: 'stairs', emoji: HOLE_EMOJI, seen: true, visible: true };
  };
  for (let y = vaultY; y < vaultY + ROPE_VAULT_H; y++) {
    for (let x = vaultX; x < vaultX + ROPE_VAULT_W; x++) {
      if (x === center.x && y === center.y) continue;
      if (map[y]?.[x]?.type === 'floor') {
        stamp(x, y);
        return;
      }
    }
  }
  stamp(center.x, center.y);
}
