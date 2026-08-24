import { describe, it, expect } from 'vitest';
import { scanGotoDestinations } from './goto';
import type { Tile } from './types';

const unseenFloor: Tile = { type: 'floor', emoji: '⬜', seen: false, visible: false };
const seen = (over: Partial<Tile>): Tile => ({
  type: 'floor', emoji: '⬜', seen: true, visible: true, ...over,
});

function grid(cells: Tile[][]): Tile[][] {
  return cells;
}

describe('scanGotoDestinations', () => {
  it('lists only seen POIs and skips used altars / drunk bartenders', () => {
    const map = grid([
      [seen({ type: 'shrine', emoji: '🛕' }), seen({ type: 'shrine-used', emoji: '🪨' }), { ...unseenFloor, type: 'stairs', emoji: '🕳️' }],
      [seen({ type: 'shop-item', emoji: '🍺' }), seen({ type: 'safe-floor', emoji: '⬜' }), seen({ type: 'stairs', emoji: '🕳️' })],
      [seen({ type: 'shop-item', emoji: '🏪' }), seen({ type: 'campfire', emoji: '🔥' }), seen({ type: 'restaurant', emoji: '🏪' })],
    ]);
    const dests = scanGotoDestinations(map, { x: 0, y: 0 });
    const kinds = dests.map(d => d.kind).sort();
    expect(kinds).toEqual(['bar', 'campfire', 'restaurant', 'shop', 'shrine', 'stairs']);
    expect(dests.every(d => d.key.length === 1)).toBe(true);
    expect(dests[0].dist).toBe(0); // shrine at player
  });

  it('hides a sold-out shop and empty ammo cache', () => {
    const map = grid([
      [seen({ type: 'shop-item', emoji: '🏪' }), seen({ type: 'shop-item', emoji: '📦' }), seen({ type: 'stairs', emoji: '🕳️' })],
    ]);
    const dests = scanGotoDestinations(map, { x: 2, y: 0 }, { shopSoldOut: true, cacheSoldOut: true });
    expect(dests.map(d => d.kind)).toEqual(['stairs']);
  });

  it('does not list unseen downstairs', () => {
    const map = grid([
      [{ type: 'stairs', emoji: '🕳️', seen: false, visible: false }],
    ]);
    expect(scanGotoDestinations(map, { x: 0, y: 0 })).toEqual([]);
  });
});
