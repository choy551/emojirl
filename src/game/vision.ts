import { GameState, MapGrid, Position } from './types';
import { playerBagPassives } from './inventory';
import { isHitman, isTrailblazer } from './prestige';
import { markEnemySeen } from './discoveries';

export const VISION_RADIUS = 4;

export function visionRadiusFor(characterClass: string, level: number): number {
  return VISION_RADIUS + (isTrailblazer(characterClass) ? Math.floor((level - 1) / 3) : 0);
}

export function eagleEyeRange(level: number): number {
  return 4 + Math.floor((level - 1) / 3);
}

export const OPAQUE_TILES = new Set(['wall', 'tree', 'door-closed', 'volcano']);

/** Orthogonal or diagonal, not the origin tile. */
export function onStraightLine(from: Position, to: Position): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return false;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}

/** Grid line of sight. Walls and other solid terrain block. Open doors do not. */
export function sharpshooterSees(map: MapGrid, from: Position, to: Position): boolean {
  if (!onStraightLine(from, to)) return false;
  const sx = Math.sign(to.x - from.x);
  const sy = Math.sign(to.y - from.y);
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let n = 1; n < steps; n++) {
    const tile = map[from.y + sy * n]?.[from.x + sx * n];
    if (!tile || OPAQUE_TILES.has(tile.type)) return false;
  }
  return true;
}

/** Hitman sees enemies on the eight lines at any range. The tile itself stays hidden. */
export function hitmanRevealsEnemy(player: { characterClass: string; pos: Position }, map: MapGrid, enemyPos: Position): boolean {
  return isHitman(player.characterClass) && sharpshooterSees(map, player.pos, enemyPos);
}

export function hasLineOfSight(map: MapGrid, from: Position, to: Position): boolean {
  if (from.x === to.x && from.y === to.y) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy) * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = Math.round(from.x + dx * t);
    const cy = Math.round(from.y + dy * t);
    if (cx === to.x && cy === to.y) break;
    const tile = map[cy]?.[cx];
    if (!tile || OPAQUE_TILES.has(tile.type)) return false;
  }
  return true;
}

/** Mark any enemy currently in the player's vision as encountered (bestiary). */
export function markVisibleEnemiesSeen(state: GameState): void {
  for (const enemy of state.enemies) {
    if (state.map[enemy.pos.y]?.[enemy.pos.x]?.visible) {
      markEnemySeen(enemy.emoji);
    }
  }
}

export function computeVisibility(map: MapGrid, playerPos: Position, radius = VISION_RADIUS): MapGrid {
  const { x: px, y: py } = playerPos;
  const visible = new Set<string>();
  const rows = map.length, cols = map[0]?.length ?? 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      const x = px + dx, y = py + dy;
      if (y < 0 || y >= rows || x < 0 || x >= cols) continue;
      if (hasLineOfSight(map, playerPos, { x, y })) visible.add(`${x},${y}`);
    }
  }
  return map.map((row, y) =>
    row.map((tile, x) => {
      const isVis = visible.has(`${x},${y}`);
      if (isVis) return { ...tile, visible: true, seen: true };
      if (tile.visible) return { ...tile, visible: false };
      return tile;
    })
  );
}

export function withVisibility(state: GameState): GameState {
  const baseRadius = visionRadiusFor(state.player.characterClass, state.player.stats.level);
  const passives = playerBagPassives(state.player);
  const radius = Math.max(1, baseRadius + passives.losBonus);
  let newMap = computeVisibility(state.map, state.player.pos, radius);
  if (passives.trueVision) {
    for (const enemy of state.enemies) {
      const { x, y } = enemy.pos;
      if (newMap[y]?.[x]) {
        newMap = newMap.map((row, ry) =>
          ry === y ? row.map((tile, rx) => rx === x ? { ...tile, visible: true, seen: true } : tile) : row
        );
      }
    }
  }
  const nextState = { ...state, map: newMap };
  markVisibleEnemiesSeen(nextState);
  if (isHitman(state.player.characterClass)) {
    for (const enemy of state.enemies) {
      if (enemy.hp > 0 && hitmanRevealsEnemy(state.player, state.map, enemy.pos)) markEnemySeen(enemy.emoji);
    }
  }
  return nextState;
}
