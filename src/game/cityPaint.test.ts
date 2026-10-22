import { describe, expect, it } from 'vitest';
import { availableTokens, emptyCity, isDecorLot, placeAt, placeDecor, placedOf } from './emojiCity';
import {
  applyClear,
  applyPaste,
  applyPlacement,
  brushFromLot,
  copyRect,
  indicesInRect,
  previewPlacement,
  pushUndo,
  rectFromPoints,
} from './cityPaint';

describe('city paint strokes', () => {
  it('fills a row, a column, and a rectangle', () => {
    expect(indicesInRect(8, 8, { x: 1, y: 2 }, { x: 4, y: 2 })).toEqual([17, 18, 19, 20]);
    expect(indicesInRect(8, 8, { x: 3, y: 3 }, { x: 3, y: 0 })).toEqual([3, 11, 19, 27]);
    expect(indicesInRect(8, 8, { x: 1, y: 1 }, { x: 0, y: 2 })).toEqual([8, 9, 16, 17]);
    expect(indicesInRect(8, 8, { x: 0, y: 0 }, { x: 1, y: 2 })).toEqual([0, 1, 8, 9, 16, 17]);
    expect(rectFromPoints({ x: 4, y: 1 }, { x: 2, y: 3 })).toEqual({ x0: 2, y0: 1, x1: 4, y1: 3 });
  });

  it('stops a building stroke when the owned count runs out and skips occupied lots', () => {
    const consumes = { '🏠': 2 };
    const seeded = placeAt(emptyCity(), 1, '🏠', consumes, {}, () => 0).city;
    const indices = [0, 1, 2, 3];
    const preview = previewPlacement(seeded, { kind: 'token', emoji: '🏠' }, consumes, indices);
    expect(preview.map(cell => cell.status)).toEqual(['place', 'skip-occupied', 'skip-cost', 'skip-cost']);
    const result = applyPlacement(seeded, { kind: 'token', emoji: '🏠' }, consumes, indices, {}, () => 0);
    expect(result.placed).toBe(1);
    expect(result.skipped).toBe(3);
    expect(placedOf(result.city, '🏠')).toBe(2);
    expect(availableTokens(consumes['🏠']!, placedOf(result.city, '🏠'))).toBe(0);
    expect(result.city.tiles[0]).toBe('🏠');
    expect(result.city.tiles[2]).toBeNull();
  });

  it('fills every empty lot with free decor', () => {
    const consumes = { '🏠': 1 };
    const blocked = placeAt(emptyCity(), 0, '🏠', consumes, {}, () => 0).city;
    const indices = indicesInRect(8, 8, { x: 0, y: 0 }, { x: 2, y: 0 });
    const result = applyPlacement(blocked, { kind: 'decor', emoji: '🛣️' }, consumes, indices, {}, () => 0);
    expect(result.placed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(isDecorLot(result.city, 1)).toBe(true);
    expect(isDecorLot(result.city, 2)).toBe(true);
    expect(availableTokens(1, placedOf(result.city, '🏠'))).toBe(0);
    expect(placedOf(result.city, '🛣️')).toBe(0);
  });
});

describe('city paint clipboard', () => {
  it('copies, cuts with a refund, and pastes until tokens run out', () => {
    const consumes = { '🏠': 2, '🌳': 1 };
    let city = placeAt(emptyCity(), 0, '🏠', consumes, {}, () => 0).city;
    city = placeAt(city, 1, '🌳', consumes, {}, () => 0).city;
    city = placeDecor(city, 8, '🌲').city;
    const stamp = copyRect(city, { x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(stamp).toMatchObject({ cols: 2, rows: 2 });
    expect(stamp.cells.map(cell => cell.emoji)).toEqual(['🏠', '🌳', '🌲', null]);
    expect(stamp.cells[2]!.decor).toBe(true);
    expect(stamp.cells[0]!.decor).toBe(false);

    const cut = applyClear(city, indicesInRect(8, 8, { x: 0, y: 0 }, { x: 1, y: 1 }), {}, () => 0);
    expect(cut.removed).toBe(3);
    expect(cut.refunded).toBe(2);
    expect(cut.city.tiles[0]).toBeNull();
    expect(cut.city.tiles[8]).toBeNull();
    expect(availableTokens(consumes['🏠']!, placedOf(cut.city, '🏠'))).toBe(2);
    expect(availableTokens(consumes['🌳']!, placedOf(cut.city, '🌳'))).toBe(1);

    const pasted = applyPaste(cut.city, stamp, { x: 3, y: 2 }, consumes, {}, () => 0);
    expect(pasted.placed).toBe(3);
    expect(pasted.skipped).toBe(0);
    expect(pasted.city.tiles[2 * 8 + 3]).toBe('🏠');
    expect(pasted.city.tiles[2 * 8 + 4]).toBe('🌳');
    expect(isDecorLot(pasted.city, 3 * 8 + 3)).toBe(true);
    expect(availableTokens(consumes['🏠']!, placedOf(pasted.city, '🏠'))).toBe(1);

    const again = applyPaste(pasted.city, stamp, { x: 6, y: 6 }, consumes, {}, () => 0);
    expect(again.placed).toBe(2);
    expect(again.skipped).toBe(1);
    expect(again.city.tiles[6 * 8 + 6]).toBe('🏠');
    expect(again.city.tiles[6 * 8 + 7]).toBeNull();
    expect(isDecorLot(again.city, 7 * 8 + 6)).toBe(true);
    expect(availableTokens(consumes['🏠']!, placedOf(again.city, '🏠'))).toBe(0);
  });

  it('leaves occupied lots alone and clips a paste that hangs off the map', () => {
    const consumes = { '🏠': 4 };
    const city = placeAt(emptyCity(), 0, '🏠', consumes, {}, () => 0).city;
    const stamp = copyRect(city, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const over = applyPaste(city, stamp, { x: 0, y: 0 }, consumes, {}, () => 0);
    expect(over.placed).toBe(0);
    expect(over.skipped).toBe(1);
    const wide = applyPaste(city, copyRect(city, { x0: 0, y0: 0, x1: 0, y1: 0 }), { x: 5, y: 0 }, consumes, {}, () => 0).city;
    const pair = copyRect(wide, { x0: 0, y0: 0, x1: 1, y1: 0 });
    pair.cells[1] = { emoji: '🏠', decor: false };
    const edge = applyPaste(wide, pair, { x: 7, y: 7 }, consumes, {}, () => 0);
    expect(edge.placed).toBe(1);
    expect(edge.skipped).toBe(1);
    expect(edge.city.tiles[7 * 8 + 7]).toBe('🏠');
  });

  it('picks a decor brush or a token brush from a lot', () => {
    const consumes = { '🏠': 1 };
    let city = placeDecor(emptyCity(), 2, '🚗').city;
    city = placeAt(city, 3, '🏠', consumes, {}, () => 0).city;
    expect(brushFromLot(city, 2)).toEqual({ kind: 'decor', emoji: '🚗' });
    expect(brushFromLot(city, 3)).toEqual({ kind: 'token', emoji: '🏠' });
    expect(brushFromLot(city, 4)).toBeNull();
  });

  it('keeps an undo snapshot of the city before the edit', () => {
    const city = emptyCity();
    const consumes = { '🏠': 1 };
    const stack = pushUndo([], { city, consumes });
    const edited = placeAt(city, 0, '🏠', consumes, {}, () => 0).city;
    expect(stack[0]!.city.tiles[0]).toBeNull();
    expect(edited.tiles[0]).toBe('🏠');
    expect(stack[0]!.consumes).toEqual({ '🏠': 1 });
  });
});
