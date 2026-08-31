import { GameState, Position } from './types';
import { chebyshev } from './geo';
import { PASSABLE_TILES, ENEMY_PASSABLE_TILES } from './tiles';

export function bfsNextStep(
  map: GameState['map'],
  from: Position,
  canSwim = false,
  blocked?: Set<string>,
): [number, number] | null {
  const passable = canSwim
    ? new Set([...PASSABLE_TILES, 'water'])
    : PASSABLE_TILES;
  const key = (p: Position) => `${p.x},${p.y}`;
  const DIRS: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  const queue: { pos: Position; first: [number, number] }[] = [];
  const queued = new Set<string>([key(from)]);

  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx, ny = from.y + dy;
    if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (!passable.has(map[ny][nx].type)) continue;
    const p = { x: nx, y: ny };
    const k = key(p);
    if (blocked?.has(k)) continue;
    if (!queued.has(k)) { queued.add(k); queue.push({ pos: p, first: [dx, dy] }); }
  }

  while (queue.length > 0) {
    const { pos, first } = queue.shift()!;
    if (!map[pos.y][pos.x].seen) return first;
    for (const [dx, dy] of DIRS) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (!passable.has(map[ny][nx].type)) continue;
      const p = { x: nx, y: ny };
      const k = key(p);
      if (blocked?.has(k)) continue;
      if (!queued.has(k)) { queued.add(k); queue.push({ pos: p, first }); }
    }
  }
  return null;
}

export function bfsNextStepWallHug(
  map: GameState['map'],
  from: Position,
  canSwim = false,
  blocked?: Set<string>,
): [number, number] | null {
  const passable = canSwim
    ? new Set([...PASSABLE_TILES, 'water'])
    : PASSABLE_TILES;
  const DIRS: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  const isNearWall = (x: number, y: number) =>
    DIRS.some(([dy, dx]) => {
      const ny = y + dy, nx = x + dx;
      return ny >= 0 && ny < map.length && nx >= 0 && nx < map[0].length
        && map[ny][nx].type === 'wall';
    });
  const key = (p: Position) => `${p.x},${p.y}`;
  const dist = new Map<string, number>();
  const heap: { pos: Position; first: [number, number]; cost: number }[] = [];

  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx, ny = from.y + dy;
    if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (!passable.has(map[ny][nx].type)) continue;
    const k = key({ x: nx, y: ny });
    if (blocked?.has(k)) continue;
    const cost = isNearWall(nx, ny) ? 1 : 3;
    if (!dist.has(k) || cost < dist.get(k)!) {
      dist.set(k, cost);
      heap.push({ pos: { x: nx, y: ny }, first: [dx, dy], cost });
    }
  }
  heap.sort((a, b) => a.cost - b.cost);

  while (heap.length > 0) {
    const { pos, first: f, cost } = heap.shift()!;
    const pk = key(pos);
    if (dist.get(pk) !== cost) continue;
    if (!map[pos.y][pos.x].seen) return f;
    for (const [dx, dy] of DIRS) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (!passable.has(map[ny][nx].type)) continue;
      const nk = key({ x: nx, y: ny });
      if (blocked?.has(nk)) continue;
      const moveCost = isNearWall(nx, ny) ? 1 : 3;
      const newCost = cost + moveCost;
      if (!dist.has(nk) || newCost < dist.get(nk)!) {
        dist.set(nk, newCost);
        heap.push({ pos: { x: nx, y: ny }, first: f, cost: newCost });
        heap.sort((a, b) => a.cost - b.cost);
      }
    }
  }
  return null;
}

export function hasLOS(map: GameState['map'], from: Position, dx: number, dy: number, range: number): boolean {
  for (let n = 1; n < range; n++) {
    const tx = from.x + dx * n;
    const ty = from.y + dy * n;
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return false;
    if (map[ty][tx].type === 'wall' || map[ty][tx].type === 'volcano') return false;
  }
  return true;
}

export function hasLOSBetween(map: GameState['map'], from: Position, to: Position): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let n = 1; n < steps; n++) {
    const tx = Math.round(from.x + (dx * n) / steps);
    const ty = Math.round(from.y + (dy * n) / steps);
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return false;
    if (map[ty][tx].type === 'wall' || map[ty][tx].type === 'volcano') return false;
  }
  return true;
}

export function detectionRadius(speed: number): number {
  return 3 + Math.floor(speed / 3);
}

export function bfsStepToward(
  map: GameState['map'],
  from: Position,
  target: Position,
  occupied: Set<string>,
  passable: Set<string> = ENEMY_PASSABLE_TILES,
): Position | null {
  const key = (p: Position) => `${p.x},${p.y}`;
  const targetKey = key(target);
  const DIRS: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  const queue: { pos: Position; first: Position }[] = [];
  const seen = new Set<string>([key(from)]);

  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx, ny = from.y + dy;
    if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (!passable.has(map[ny][nx].type)) continue;
    const p = { x: nx, y: ny };
    const k = key(p);
    if (seen.has(k)) continue;
    if (occupied.has(k) && k !== targetKey) continue;
    seen.add(k);
    queue.push({ pos: p, first: p });
  }

  while (queue.length > 0) {
    const { pos, first } = queue.shift()!;
    if (key(pos) === targetKey) return first;
    for (const [dx, dy] of DIRS) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (!passable.has(map[ny][nx].type)) continue;
      const p = { x: nx, y: ny };
      const k = key(p);
      if (seen.has(k)) continue;
      if (occupied.has(k) && k !== targetKey) continue;
      seen.add(k);
      queue.push({ pos: p, first });
    }
  }
  return null;
}

export function fleeStep(
  map: GameState['map'],
  from: Position,
  threat: Position,
  occupied: Set<string>,
  passable: Set<string> = ENEMY_PASSABLE_TILES,
): Position | null {
  const DIRS: [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  let best: Position | null = null;
  let bestDist = chebyshev(from, threat);
  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx;
    const ny = from.y + dy;
    if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (!passable.has(map[ny][nx].type)) continue;
    if (occupied.has(`${nx},${ny}`)) continue;
    const d = chebyshev({ x: nx, y: ny }, threat);
    if (d > bestDist) {
      bestDist = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}
