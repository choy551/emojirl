import { describe, it, expect } from 'vitest';
import type { MapGrid, Tile } from './types';
import {
  canFloodTile, placeWaterBlob, placeRiver, placeBushAmbush, placeVolcanoVault,
  generateMap,
} from './mapgen';
import { hasLOSBetween } from './pathfinding';
import { OPAQUE_TILES } from './vision';
import { PLAYER_PASSABLE_TILES, ENEMY_PASSABLE_TILES } from './tiles';
import { rollAmbushCount } from './enemies';
import { BUSH_EMOJI, LAVA_EMOJI, VOLCANO_EMOJI } from './lava';

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: false, visible: false };
}

function blank(h: number, w: number): MapGrid {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => tile('wall', '⬛'))
  );
}

function carveRoom(map: MapGrid, x: number, y: number, w: number, h: number) {
  for (let ry = y; ry < y + h; ry++) {
    for (let rx = x; rx < x + w; rx++) {
      map[ry][rx] = tile('floor', '⬜');
    }
  }
}

describe('water features paint walkable dungeon, not just hidden rock', () => {
  it('canFloodTile allows floor and wall, not stairs or shops', () => {
    const map = blank(8, 8);
    map[3][3] = tile('floor', '⬜');
    map[3][4] = tile('stairs', '🕳️');
    map[3][5] = tile('shop-item', '🏪');
    expect(canFloodTile(map, 3, 3)).toBe(true);
    expect(canFloodTile(map, 4, 3)).toBe(false);
    expect(canFloodTile(map, 5, 3)).toBe(false);
  });

  it('placeWaterBlob converts floor tiles, not only walls', () => {
    const map = blank(12, 12);
    carveRoom(map, 2, 2, 8, 8);
    const placed = placeWaterBlob(map, 5, 5, 20, [], undefined, 'water');
    expect(placed).toBeGreaterThan(0);
    let waterOnFloorBand = 0;
    for (let y = 2; y < 10; y++) {
      for (let x = 2; x < 10; x++) {
        if (map[y][x].type === 'water') waterOnFloorBand++;
      }
    }
    expect(waterOnFloorBand).toBeGreaterThan(0);
  });

  it('placeRiver carves water across a floor corridor', () => {
    const map = blank(10, 20);
    for (let y = 1; y < 9; y++) {
      for (let x = 1; x < 19; x++) map[y][x] = tile('floor', '⬜');
    }
    placeRiver(map, [], undefined, 'water');
    let water = 0;
    for (const row of map) for (const t of row) if (t.type === 'water') water++;
    expect(water).toBeGreaterThan(0);
  });

  it('placeRiver can carve lava rivers with the same geometry', () => {
    const map = blank(10, 20);
    for (let y = 1; y < 9; y++) {
      for (let x = 1; x < 19; x++) map[y][x] = tile('floor', '⬜');
    }
    placeRiver(map, [], undefined, 'lava');
    let lava = 0;
    for (const row of map) for (const t of row) if (t.type === 'lava') lava++;
    expect(lava).toBeGreaterThan(0);
  });

  it('generated maps usually have water touching walkable floor (not trapped in rock)', () => {
    let visibleWaterFloors = 0;
    for (let i = 0; i < 12; i++) {
      const { map } = generateMap(3);
      for (let y = 1; y < map.length - 1; y++) {
        for (let x = 1; x < map[0].length - 1; x++) {
          if (map[y][x].type !== 'water') continue;
          const nearWalk = [
            [0, 1], [0, -1], [1, 0], [-1, 0],
          ].some(([dx, dy]) => {
            const t = map[y + dy][x + dx].type;
            return t === 'floor' || t === 'grass' || t === 'door-open' || t === 'door-closed' || t === 'stairs';
          });
          if (nearWalk) visibleWaterFloors++;
        }
      }
    }
    expect(visibleWaterFloors).toBeGreaterThan(0);
  });
});

describe('bush ambush vault', () => {
  it('places bushes that block movement but not line of sight', () => {
    const map = blank(10, 12);
    const room = { x: 1, y: 1, w: 10, h: 8, theme: 'bush-ambush' as const };
    carveRoom(map, room.x, room.y, room.w, room.h);
    placeBushAmbush(map, room);
    const bushes: { x: number; y: number }[] = [];
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        if (map[y][x].type === 'bush') {
          bushes.push({ x, y });
          expect(map[y][x].emoji).toBe(BUSH_EMOJI);
          expect(PLAYER_PASSABLE_TILES.has('bush')).toBe(false);
          expect(ENEMY_PASSABLE_TILES.has('bush')).toBe(false);
          expect(OPAQUE_TILES.has('bush')).toBe(false);
        }
      }
    }
    expect(bushes.length).toBeGreaterThan(0);
    const b = bushes[Math.floor(bushes.length / 2)];
    expect(hasLOSBetween(map, { x: b.x, y: b.y - 1 }, { x: b.x, y: b.y + 1 })).toBe(true);
  });

  it('rollAmbushCount is 1–5 with 1 most common', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 2000; i++) counts[rollAmbushCount()]++;
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[5]);
    expect(counts[5]).toBeGreaterThan(0);
    expect(counts[1] + counts[2] + counts[3] + counts[4] + counts[5]).toBe(2000);
  });
});

describe('volcano vault', () => {
  it('places a volcano core surrounded by lava', () => {
    const map = blank(11, 11);
    const room = { x: 1, y: 1, w: 9, h: 9, theme: 'volcano' as const };
    carveRoom(map, room.x, room.y, room.w, room.h);
    placeVolcanoVault(map, room);
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    expect(map[cy][cx].type).toBe('volcano');
    expect(map[cy][cx].emoji).toBe(VOLCANO_EMOJI);
    const ring = [map[cy][cx + 1], map[cy][cx - 1], map[cy + 1][cx], map[cy - 1][cx]];
    expect(ring.every(t => t.type === 'lava' && t.emoji === LAVA_EMOJI)).toBe(true);
    expect(map[room.y][room.x].type).toBe('floor');
  });
});
