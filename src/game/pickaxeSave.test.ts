import { beforeEach, describe, expect, it } from 'vitest';
import { SAVE_KEY, loadGame, saveGame, getRawSave } from './save';
import { canMineWall, stampLegacyProtectedWalls } from './pickaxe';
import type { MapGrid, Tile, TileType } from './types';

/**
 * Schema 13 is the save written before #103 stamped unbreakable walls.
 * The in-progress floor is still that map: no flags, rooms not stored.
 */
const PRE_103_SCHEMA = 13;

function installStorage() {
  const mem = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
}

installStorage();
beforeEach(() => localStorage.clear());

function wall(): Tile {
  return { type: 'wall', emoji: '⬛', seen: true, visible: true };
}

function paint(map: MapGrid, x: number, y: number, w: number, h: number, type: TileType, emoji: string) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) map[yy][xx] = { type, emoji, seen: true, visible: true };
  }
}

/** A floor saved before pickaxes existed. No tile has `unbreakable`. */
function pre103Floor(): MapGrid {
  const map: MapGrid = Array.from({ length: 16 }, () => Array.from({ length: 22 }, wall));
  paint(map, 2, 2, 4, 3, 'safe-floor', '⬜');
  map[3][3] = { type: 'shop-item', emoji: '🏪', seen: true, visible: true };
  paint(map, 6, 3, 2, 1, 'floor', '⬜');

  paint(map, 8, 2, 4, 3, 'floor', '⬜');
  map[3][9] = { type: 'shrine', emoji: '🛕', seen: true, visible: true };
  paint(map, 9, 5, 1, 3, 'floor', '⬜');

  paint(map, 14, 2, 4, 3, 'safe-floor', '⬜');
  map[3][15] = { type: 'shrine', emoji: '🛕', seen: true, visible: true };
  map[3][16] = { type: 'shop-item', emoji: '🍺', seen: true, visible: true };

  paint(map, 2, 8, 4, 3, 'floor', '⬜');
  paint(map, 8, 8, 4, 3, 'boss-floor', '🟥');

  paint(map, 14, 8, 5, 4, 'floor', '⬜');
  map[9][15] = wall();
  map[9][16] = wall();
  map[10][15] = { type: 'door-closed', emoji: '🚪', seen: true, visible: true };
  map[10][16] = { type: 'bed', emoji: '🛏️', seen: true, visible: true, usesLeft: 3 };

  paint(map, 2, 12, 4, 3, 'safe-floor', '⬜');
  map[13][3] = { type: 'restaurant', emoji: '🏪', seen: true, visible: true };
  return map;
}

function pre103Save(floor: number, map: MapGrid) {
  return {
    schemaVersion: PRE_103_SCHEMA,
    currentFloor: floor,
    map,
    player: {
      characterClass: '🧙',
      ammo: 0,
      stats: { hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 1, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0 },
      inventory: [],
      bank: [],
      equipment: {},
      pos: { x: 3, y: 9 },
    },
    turn: 12,
    enemies: [],
    items: [],
    logs: [],
  };
}

describe('old autoMine saves', () => {
  it('loads a save that still has autoMine and does not keep the setting', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ...pre103Save(1, [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]]),
      player: {
        ...pre103Save(1, []).player,
        autoMine: true,
      },
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.player).not.toHaveProperty('autoMine');
    saveGame(loaded.state);
    const raw = JSON.parse(getRawSave() ?? '{}') as { player?: { autoMine?: boolean } };
    expect(raw.player?.autoMine).toBeUndefined();
  });
});

describe('pre-#103 save fixture', () => {
  it('stamps protected walls when an in-progress floor is loaded', () => {
    const rawMap = pre103Floor();
    expect(rawMap.some(row => row.some(tile => tile.unbreakable))).toBe(false);
    localStorage.setItem(SAVE_KEY, JSON.stringify(pre103Save(4, rawMap)));

    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    const map = loaded.state.map;

    expect(canMineWall(map, 0, 5)).toBe(false);
    expect(canMineWall(map, 3, 1)).toBe(false);
    expect(canMineWall(map, 9, 1)).toBe(false);
    expect(canMineWall(map, 15, 1)).toBe(false);
    expect(canMineWall(map, 8, 7)).toBe(false);
    expect(canMineWall(map, 15, 9)).toBe(false);
    expect(canMineWall(map, 13, 8)).toBe(false);

    expect(canMineWall(map, 3, 7)).toBe(true);
    expect(canMineWall(map, 1, 13)).toBe(true);

    const again = stampLegacyProtectedWalls(map, { arena: false });
    expect(again.map(row => row.map(tile => !!tile.unbreakable))).toEqual(
      map.map(row => row.map(tile => !!tile.unbreakable)),
    );

    saveGame(loaded.state);
    const reloaded = loadGame();
    expect(reloaded.kind).toBe('ok');
    if (reloaded.kind !== 'ok') return;
    expect(reloaded.state.map.map(row => row.map(tile => !!tile.unbreakable))).toEqual(
      map.map(row => row.map(tile => !!tile.unbreakable)),
    );
  });

  it('stamps every arena wall from a pre-#103 finale save', () => {
    const map: MapGrid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, wall));
    map[4][4] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    localStorage.setItem(SAVE_KEY, JSON.stringify(pre103Save(27, map)));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(canMineWall(loaded.state.map, 3, 3)).toBe(false);
    expect(canMineWall(loaded.state.map, 0, 0)).toBe(false);
    const plain = stampLegacyProtectedWalls(map, { arena: false });
    expect(canMineWall(plain, 3, 3)).toBe(true);
  });
});
