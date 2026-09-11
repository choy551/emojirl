import { describe, it, expect } from 'vitest';
import type { MapGrid, Tile } from './types';
import {
  canFloodTile, placeWaterBlob, placeRiver, placeBushAmbush, placeVolcanoVault,
  generateMap, placeDoors, placeRoomVault,
} from './mapgen';
import { hasLOSBetween } from './pathfinding';
import { OPAQUE_TILES } from './vision';
import { BED_EMOJI, BED_MAX_USES, PLAYER_PASSABLE_TILES, ENEMY_PASSABLE_TILES } from './tiles';
import { rollAmbushCount } from './enemies';
import { BUSH_EMOJI, LAVA_EMOJI, VOLCANO_EMOJI, WATER_EMOJI } from './lava';

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
        if (map[y][x].type === 'water') {
          expect(map[y][x].emoji).toBe(WATER_EMOJI);
          waterOnFloorBand++;
        }
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
          expect(map[y][x].emoji).toBe(WATER_EMOJI);
          const nearWalk = [
            [0, 1], [0, -1], [1, 0], [-1, 0],
          ].some(([dx, dy]) => {
            const t = map[y + dy][x + dx].type;
            return t === 'floor' || t === 'grass' || t === 'door-open' || t === 'door-closed' || t === 'stairs' || t === 'obsidian';
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

describe('corridor doors', () => {
  function twoRoomsWithHallway(): { map: MapGrid; rooms: ReturnType<typeof generateMap>['rooms'] } {
    // Two 3x3 rooms stacked, joined by a 1-tile-wide vertical corridor.
    const map = blank(9, 7);
    carveRoom(map, 2, 1, 3, 3);
    carveRoom(map, 2, 5, 3, 3);
    map[4][3] = tile('floor', '⬜');
    const rooms = [
      { x: 2, y: 1, w: 3, h: 3, theme: 'normal' as const },
      { x: 2, y: 5, w: 3, h: 3, theme: 'normal' as const },
    ];
    return { map, rooms };
  }

  it('places a door on the corridor mouth, not the room perimeter', () => {
    const { map, rooms } = twoRoomsWithHallway();
    placeDoors(map, rooms, 1);
    expect(map[4][3].type).toBe('door-closed');
    expect(map[4][3].emoji).toBe('🚪');
    expect(map[3][3].type).toBe('floor');
    expect(map[5][3].type).toBe('floor');
  });

  it('leaves the hallway open when chance is 0', () => {
    const { map, rooms } = twoRoomsWithHallway();
    placeDoors(map, rooms, 0);
    expect(map[4][3].type).toBe('floor');
  });

  it('does not door shop-room corridor mouths', () => {
    const { map, rooms } = twoRoomsWithHallway();
    rooms[0] = { ...rooms[0], theme: 'shop' };
    rooms[1] = { ...rooms[1], theme: 'shop' };
    placeDoors(map, rooms, 1);
    expect(map[4][3].type).toBe('floor');
  });

  it('does not door wide openings — only 1-tile corridors', () => {
    const map = blank(9, 8);
    carveRoom(map, 1, 1, 5, 3);
    carveRoom(map, 1, 5, 5, 3);
    map[4][2] = tile('floor', '⬜');
    map[4][3] = tile('floor', '⬜');
    map[4][4] = tile('floor', '⬜');
    const rooms = [
      { x: 1, y: 1, w: 5, h: 3, theme: 'normal' as const },
      { x: 1, y: 5, w: 5, h: 3, theme: 'normal' as const },
    ];
    placeDoors(map, rooms, 1);
    expect(map[4][2].type).toBe('floor');
    expect(map[4][3].type).toBe('floor');
    expect(map[4][4].type).toBe('floor');
  });

  it('generated floors mix doors with open 1-tile hallways', () => {
    let doors = 0;
    let openMouths = 0;
    for (let i = 0; i < 20; i++) {
      const { map, rooms } = generateMap(2);
      for (const room of rooms) {
        if (room.theme === 'shop') continue;
        for (let rx = room.x; rx < room.x + room.w; rx++) {
          for (let ry = room.y; ry < room.y + room.h; ry++) {
            const onEdge =
              rx === room.x || rx === room.x + room.w - 1 ||
              ry === room.y || ry === room.y + room.h - 1;
            if (!onEdge) continue;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
              const nx = rx + dx, ny = ry + dy;
              if (nx >= room.x && nx < room.x + room.w && ny >= room.y && ny < room.y + room.h) continue;
              const t = map[ny]?.[nx];
              if (!t) continue;
              const a = map[ny + dx]?.[nx + dy];
              const b = map[ny - dx]?.[nx - dy];
              const oneWide = (!a || a.type === 'wall') && (!b || b.type === 'wall');
              if (!oneWide) continue;
              if (t.type === 'door-closed' || t.type === 'door-open') doors++;
              else if (t.type === 'floor') openMouths++;
            }
          }
        }
      }
    }
    expect(doors).toBeGreaterThan(0);
    expect(openMouths).toBeGreaterThan(0);
  });
});

describe('room vault', () => {
  function vaultBox(map: Tile[][], room: { x: number; y: number; w: number; h: number }) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let beds = 0, doors = 0;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const t = map[y][x];
        if (t.type === 'bed') {
          beds++;
          expect(t.emoji).toBe(BED_EMOJI);
          expect(t.usesLeft).toBe(BED_MAX_USES);
        }
        if (t.type === 'door-closed') doors++;
        if (t.type === 'wall' || t.type === 'bed' || t.type === 'door-closed') {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    return { beds, doors, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  it('nests a 2×2 to 4×4 walled room with one door and a bed', () => {
    const map = blank(12, 14);
    const room = { x: 1, y: 1, w: 10, h: 8, theme: 'room-vault' as const };
    carveRoom(map, room.x, room.y, room.w, room.h);
    expect(placeRoomVault(map, room)).toBe(true);
    const box = vaultBox(map, room);
    expect(box.beds).toBe(1);
    expect(box.doors).toBe(1);
    expect(box.w).toBeGreaterThanOrEqual(2);
    expect(box.w).toBeLessThanOrEqual(4);
    expect(box.h).toBe(box.w);
  });

  it.each([2, 3, 4] as const)('places a %i×%i bedroom', (size) => {
    const map = blank(12, 14);
    const room = { x: 1, y: 1, w: 10, h: 8, theme: 'room-vault' as const };
    carveRoom(map, room.x, room.y, room.w, room.h);
    expect(placeRoomVault(map, room, size)).toBe(true);
    const box = vaultBox(map, room);
    expect(box.beds).toBe(1);
    expect(box.doors).toBe(1);
    expect(box.w).toBe(size);
    expect(box.h).toBe(size);
  });

  it('refuses rooms too small to wrap a 2×2 closet', () => {
    const map = blank(8, 8);
    const room = { x: 1, y: 1, w: 4, h: 3, theme: 'normal' as const };
    carveRoom(map, room.x, room.y, room.w, room.h);
    expect(placeRoomVault(map, room)).toBe(false);
  });

  it('fits a 2×2 closet in a minimum 4×4 outer room', () => {
    const map = blank(8, 8);
    const room = { x: 1, y: 1, w: 4, h: 4, theme: 'room-vault' as const };
    carveRoom(map, room.x, room.y, room.w, room.h);
    expect(placeRoomVault(map, room, 2)).toBe(true);
    expect(map.flat().some(t => t.type === 'bed')).toBe(true);
    expect(placeRoomVault(map, room, 3)).toBe(false);
  });

  it('generateMap places a bedroom on a substantial fraction of floors', () => {
    const N = 80;
    let beds = 0;
    let themed = 0;
    for (let i = 0; i < N; i++) {
      const { map, rooms } = generateMap(1 + (i % 4));
      if (rooms.some(r => r.theme === 'room-vault')) themed++;
      if (map.some(row => row.some(t => t.type === 'bed'))) beds++;
    }
    expect(themed).toBe(beds);
    expect(beds).toBeGreaterThanOrEqual(15);
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
