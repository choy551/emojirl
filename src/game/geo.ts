import { Position } from './types';
import type { Room } from './mapgen';

export type { Room } from './mapgen';

export function roomCenter(r: Room): Position {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

export function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
