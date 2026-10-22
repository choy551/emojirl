import {
  availableTokens,
  isDecorLot,
  placeAt,
  placeDecor,
  placedOf,
  removeAt,
  type CityState,
} from './emojiCity';
import { normalizeEmojiKey } from './discoveries';

export interface GridPoint {
  x: number;
  y: number;
}

/** Inclusive rectangle. x0/y0 is the top-left corner. */
export interface GridRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PaintBrush {
  kind: 'token' | 'decor';
  emoji: string;
}

export interface StampCell {
  emoji: string | null;
  decor: boolean;
}

export interface Stamp {
  cols: number;
  rows: number;
  cells: StampCell[];
}

export interface PaintSnapshot {
  city: CityState;
  consumes: Record<string, number>;
}

export type PlaceStatus = 'place' | 'skip-occupied' | 'skip-cost';

export interface PlacePreviewCell {
  index: number;
  status: PlaceStatus;
}

export function pointFromIndex(cols: number, index: number): GridPoint {
  const width = Math.max(1, cols);
  return { x: index % width, y: Math.floor(index / width) };
}

export function rectFromPoints(a: GridPoint, b: GridPoint): GridRect {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

/** Row-major indices inside the rectangle, clipped to the grid. A 1-wide or 1-tall rect is a column or row. */
export function indicesInRect(cols: number, rows: number, a: GridPoint, b: GridPoint): number[] {
  const rect = rectFromPoints(a, b);
  const x0 = Math.max(0, rect.x0);
  const y0 = Math.max(0, rect.y0);
  const x1 = Math.min(cols - 1, rect.x1);
  const y1 = Math.min(rows - 1, rect.y1);
  const indices: number[] = [];
  if (x0 > x1 || y0 > y1) return indices;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) indices.push(y * cols + x);
  }
  return indices;
}

/**
 * Cells a stroke would fill. Occupied lots are skipped. Token brushes stop spending
 * once the owned count runs out. Decor never spends a token.
 */
export function previewPlacement(
  city: CityState,
  brush: PaintBrush,
  consumes: Record<string, number>,
  indices: readonly number[],
): PlacePreviewCell[] {
  const key = normalizeEmojiKey(brush.emoji);
  let budget = brush.kind === 'decor'
    ? Number.POSITIVE_INFINITY
    : availableTokens(consumes[key] ?? 0, placedOf(city, key));
  return indices.map(index => {
    if (city.tiles[index]) return { index, status: 'skip-occupied' as const };
    if (budget <= 0) return { index, status: 'skip-cost' as const };
    budget -= 1;
    return { index, status: 'place' as const };
  });
}

export function applyPlacement(
  city: CityState,
  brush: PaintBrush,
  consumes: Record<string, number>,
  indices: readonly number[],
  kills: Record<string, number>,
  rng: () => number = Math.random,
): { city: CityState; placed: number; skipped: number } {
  const plan = previewPlacement(city, brush, consumes, indices);
  let next = city;
  let placed = 0;
  let skipped = 0;
  for (const cell of plan) {
    if (cell.status !== 'place') {
      skipped += 1;
      continue;
    }
    const result = brush.kind === 'decor'
      ? placeDecor(next, cell.index, brush.emoji)
      : placeAt(next, cell.index, brush.emoji, consumes, kills, rng);
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    next = result.city;
    placed += 1;
  }
  return { city: next, placed, skipped };
}

export function copyRect(city: CityState, rect: GridRect): Stamp {
  const indices = indicesInRect(city.cols, city.rows, { x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y1 });
  const x0 = Math.max(0, Math.min(rect.x0, rect.x1));
  const y0 = Math.max(0, Math.min(rect.y0, rect.y1));
  const x1 = Math.min(city.cols - 1, Math.max(rect.x0, rect.x1));
  const y1 = Math.min(city.rows - 1, Math.max(rect.y0, rect.y1));
  return {
    cols: Math.max(0, x1 - x0 + 1),
    rows: Math.max(0, y1 - y0 + 1),
    cells: indices.map(index => ({
      emoji: city.tiles[index] ?? null,
      decor: isDecorLot(city, index),
    })),
  };
}

/** Remove lots. Building tokens come back because placed copies are what spend them. Decor refunds nothing. */
export function applyClear(
  city: CityState,
  indices: readonly number[],
  kills: Record<string, number>,
  rng: () => number = Math.random,
): { city: CityState; removed: number; refunded: number } {
  let next = city;
  let removed = 0;
  let refunded = 0;
  for (const index of indices) {
    if (!next.tiles[index]) continue;
    const decor = isDecorLot(next, index);
    const result = removeAt(next, index, kills, rng);
    if (!result.ok) continue;
    next = result.city;
    removed += 1;
    if (!decor) refunded += 1;
  }
  return { city: next, removed, refunded };
}

/**
 * Stamp the clipboard with its top-left on `origin`. Empty stamp cells are transparent.
 * Occupied lots are left alone. Buildings spend owned counts; decor is free.
 */
export function applyPaste(
  city: CityState,
  stamp: Stamp,
  origin: GridPoint,
  consumes: Record<string, number>,
  kills: Record<string, number>,
  rng: () => number = Math.random,
): { city: CityState; placed: number; skipped: number } {
  let next = city;
  let placed = 0;
  let skipped = 0;
  stamp.cells.forEach((cell, offset) => {
    if (!cell.emoji) return;
    const col = offset % stamp.cols;
    const row = Math.floor(offset / stamp.cols);
    const x = origin.x + col;
    const y = origin.y + row;
    if (x < 0 || y < 0 || x >= city.cols || y >= city.rows) {
      skipped += 1;
      return;
    }
    const index = y * city.cols + x;
    if (next.tiles[index]) {
      skipped += 1;
      return;
    }
    const result = cell.decor
      ? placeDecor(next, index, cell.emoji)
      : placeAt(next, index, cell.emoji, consumes, kills, rng);
    if (!result.ok) {
      skipped += 1;
      return;
    }
    next = result.city;
    placed += 1;
  });
  return { city: next, placed, skipped };
}

/** Middle-click / eyedropper. Decor lots become a free brush. Token lots spend on the next stroke. */
export function brushFromLot(city: CityState, index: number): PaintBrush | null {
  const emoji = city.tiles[index];
  if (!emoji) return null;
  if (isDecorLot(city, index)) return { kind: 'decor', emoji };
  return { kind: 'token', emoji };
}

export function snapshotPaint(city: CityState, consumes: Record<string, number>): PaintSnapshot {
  return {
    city: {
      tiles: city.tiles.slice(),
      citizens: city.citizens.map(citizen => ({ ...citizen })),
      nextId: city.nextId,
      cols: city.cols,
      rows: city.rows,
      decor: city.decor.slice(),
    },
    consumes: { ...consumes },
  };
}

export function pushUndo(stack: readonly PaintSnapshot[], snap: PaintSnapshot, limit = 40): PaintSnapshot[] {
  const next = stack.concat(snapshotPaint(snap.city, snap.consumes));
  return next.length > limit ? next.slice(next.length - limit) : next;
}
