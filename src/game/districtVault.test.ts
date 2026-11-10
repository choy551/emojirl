import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildingOf } from './cityBuildings';
import {
  applyStructureStep,
  districtStructures,
  placeDistrictVault,
  stepDistrictStructure,
  structureFlavor,
  VAULT_DISTRICTS,
} from './districtVault';
import type { GameState, MapGrid, Player, Tile } from './types';
import { loadMeta, setMetaStore, type KeyValueStore } from './meta';

function memoryStore(): KeyValueStore {
  const mem = new Map<string, string>();
  return {
    getItem: key => mem.get(key) ?? null,
    setItem: (key, value) => { mem.set(key, value); },
    removeItem: key => { mem.delete(key); },
  };
}

function floor(w: number, h: number): MapGrid {
  const tile = (): Tile => ({ type: 'floor', emoji: '⬜', seen: false, visible: false });
  return Array.from({ length: h }, () => Array.from({ length: w }, tile));
}

function cluster(map: MapGrid) {
  const cells: { x: number; y: number; emoji: string }[] = [];
  map.forEach((row, y) => row.forEach((tile, x) => {
    if (tile.emoji !== '⬜') cells.push({ x, y, emoji: tile.emoji });
  }));
  return cells;
}

const player = { characterClass: '🧙', stats: { moodValue: 0 } } as Player;

beforeEach(() => setMetaStore(memoryStore()));

describe('class district vaults', () => {
  it('clusters a district in a 2×2, or a 3×3 when the district is large', () => {
    const thieves = floor(4, 4);
    expect(placeDistrictVault(thieves, { x: 0, y: 0, w: 4, h: 4 }, 'thieves', () => 0)).toBe(true);
    const small = cluster(thieves);
    expect(small).toHaveLength(4);
    expect(small.every(cell => buildingOf(cell.emoji)?.district === 'thieves')).toBe(true);
    expect(Math.max(...small.map(c => c.x)) - Math.min(...small.map(c => c.x))).toBe(1);
    expect(Math.max(...small.map(c => c.y)) - Math.min(...small.map(c => c.y))).toBe(1);

    const saloon = floor(5, 5);
    expect(placeDistrictVault(saloon, { x: 0, y: 0, w: 5, h: 5 }, 'saloon', () => 0)).toBe(true);
    const large = cluster(saloon);
    expect(large).toHaveLength(9);
    expect(large.every(cell => buildingOf(cell.emoji)?.district === 'saloon')).toBe(true);
    expect(new Set(large.map(cell => cell.emoji)).size).toBeGreaterThan(1);

    const forced = floor(5, 5);
    expect(placeDistrictVault(forced, { x: 0, y: 0, w: 5, h: 5 }, 'saloon', () => 0.9)).toBe(true);
    expect(cluster(forced)).toHaveLength(4);
  });

  it('surveys a structure once, then shows its flavor', () => {
    const map = floor(1, 1);
    map[0][0] = { type: 'floor', emoji: '🏦', seen: false, visible: false };
    const first = stepDistrictStructure(map, 0, 0, player);
    expect(first?.logs[0]).toContain('surveyed');
    expect(first?.logs[0]).toContain('EmojiCB gains a token');
    expect(first?.map[0][0]).toMatchObject({ emoji: '🏦', surveyed: true, type: 'floor' });
    expect(loadMeta().emojiConsumes?.['🏦']).toBe(1);
    expect(first!.player.stats.moodValue).toBeGreaterThan(0);

    const again = stepDistrictStructure(first!.map, 0, 0, first!.player);
    expect(again?.logs).toEqual(['🏦 The Bank looks like it was emptied long ago.']);
    expect(loadMeta().emojiConsumes?.['🏦']).toBe(1);
    expect(structureFlavor('🏗️')).toBe('Long-forgotten construction equipment, from when the Dungeon was first built.');
    expect(structureFlavor('❓')).toBe('The old stone has nothing left to say.');

    const direct = floor(2, 1);
    direct[0][1] = { type: 'floor', emoji: '🏦', seen: true, visible: true };
    const stepped = applyStructureStep({
      turn: 4,
      map: direct,
      player: { ...player, pos: { x: 1, y: 0 } },
      logs: [{ id: 'old', text: 'earlier', turn: 3 }],
    } as GameState, 1, 0);
    expect(stepped.map[0][1]).toMatchObject({ emoji: '🏦', surveyed: true, type: 'floor' });
    expect(loadMeta().emojiConsumes?.['🏦']).toBe(2);
    expect(stepped.logs[0]?.text).toContain('surveyed');
    expect(stepped.logs[0]?.text).toContain('EmojiCB gains a token');
    expect(stepped.logs[1]?.text).toBe('earlier');
    const flavorNow = applyStructureStep(stepped, 1, 0);
    expect(flavorNow.logs[0]?.text).toBe('🏦 The Bank looks like it was emptied long ago.');
    expect(loadMeta().emojiConsumes?.['🏦']).toBe(2);
    const move = readFileSync(new URL('../hooks/useGameActions.tsx', import.meta.url), 'utf8');
    expect(move).toContain('applyStructureStep');
    expect(move).not.toContain('stepped.logs) addLog');
    for (const district of VAULT_DISTRICTS) {
      for (const building of districtStructures(district)) {
        expect(structureFlavor(building.emoji), building.emoji).not.toBe('The old stone has nothing left to say.');
      }
    }
  });
});
