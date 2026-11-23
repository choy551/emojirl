import { describe, expect, it } from 'vitest';
import { generateMap } from './mapgen';
import type { MapGrid, Tile } from './types';
import { addPickaxeCharges, canMineWall, digCardinalLine, markProtectedWalls, monkeyPickaxeDrop, PICKAXE_CAP, PICKAXE_CLAMP, PICKAXE_PROTECTED_LINE, shouldAutoMine, stampLegacyProtectedWalls } from './pickaxe';
import { ACTIVE_DROPS } from './emojis';
import { FINALE_FLOOR } from './finaleConstants';

function grid(): MapGrid {
  const wall = (): Tile => ({ type: 'wall', emoji: '⬛', seen: true, visible: true });
  const map = Array.from({ length: 6 }, () => Array.from({ length: 6 }, wall));
  return map;
}

describe('pickaxe charges', () => {
  it('starts at 5, clamps a +5 pickup at 10, then adds 1 up to 20', () => {
    expect(addPickaxeCharges(0)).toBe(5);
    expect(addPickaxeCharges(5)).toBe(10);
    expect(addPickaxeCharges(7)).toBe(10);
    expect(addPickaxeCharges(9)).toBe(10);
    expect(addPickaxeCharges(PICKAXE_CLAMP)).toBe(11);
    expect(addPickaxeCharges(19)).toBe(PICKAXE_CAP);
    expect(addPickaxeCharges(20)).toBe(20);
    expect(addPickaxeCharges(30)).toBe(20);
  });
});

describe('pickaxe mining', () => {
  it('refuses the border and unbreakable walls, and stops a consume line there', () => {
    const map = grid();
    map[2][2] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    map[2][3] = { type: 'wall', emoji: '⬛', seen: true, visible: true, unbreakable: true };
    expect(canMineWall(map, 0, 2)).toBe(false);
    expect(canMineWall(map, 3, 2)).toBe(false);
    expect(canMineWall(map, 2, 1)).toBe(true);

    const dug = digCardinalLine(map, { x: 2, y: 2 }, 0, -1, 5);
    expect(dug.dug).toBe(1);
    expect(dug.map[1][2].type).toBe('floor');
    expect(dug.map[0][2].type).toBe('wall');

    const stopped = digCardinalLine(map, { x: 2, y: 2 }, 1, 0, 5);
    expect(stopped.dug).toBe(0);
    expect(stopped.map[2][3].type).toBe('wall');
  });

  it('tells the player which walls cannot be mined', () => {
    const pick = ACTIVE_DROPS.find(drop => drop.activeKind === 'pickaxe');
    expect(pick?.description).toContain(PICKAXE_PROTECTED_LINE);
  });

  it('mines a bump whenever a charged pickaxe can break the wall', () => {
    expect(shouldAutoMine(false, true)).toBe(false);
    expect(shouldAutoMine(true, false)).toBe(false);
    expect(shouldAutoMine(true, true)).toBe(true);
  });

  it('does not mine diagonally', () => {
    const map = grid();
    expect(digCardinalLine(map, { x: 2, y: 2 }, 1, 1, 3).dug).toBe(0);
  });

  it('marks boss, vault, shop, city, temple, and arena walls, and leaves a plain wall', () => {
    const map = grid();
    markProtectedWalls(map, [
      { x: 2, y: 2, w: 2, h: 2, theme: 'shop' },
      { x: 2, y: 2, w: 2, h: 2, theme: 'boss' },
      { x: 2, y: 2, w: 2, h: 2, theme: 'treasure-vault' },
      { x: 2, y: 2, w: 2, h: 2, theme: 'market' },
      { x: 2, y: 2, w: 2, h: 2, theme: 'shrine' },
    ], false);
    expect(map[1][2].unbreakable).toBe(true);
    expect(canMineWall(map, 2, 1)).toBe(false);

    const open = grid();
    markProtectedWalls(open, [{ x: 2, y: 2, w: 1, h: 1, theme: 'normal' }], false);
    expect(canMineWall(open, 2, 2)).toBe(true);

    const arena = grid();
    markProtectedWalls(arena, [], true);
    expect(canMineWall(arena, 2, 2)).toBe(false);
  });
});

function wallFlags(map: MapGrid): string[] {
  const flags: string[] = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x].type === 'wall' && map[y][x].unbreakable) flags.push(`${x},${y}`);
    }
  }
  return flags;
}

function stripUnbreakable(map: MapGrid): MapGrid {
  return map.map(row => row.map(tile => {
    const next = { ...tile };
    delete next.unbreakable;
    return next;
  }));
}

describe('legacy protected walls', () => {
  it('leaves a floor that already has flags untouched, and stamps a stripped floor once', () => {
    const generated = generateMap(6);
    expect(wallFlags(stampLegacyProtectedWalls(generated.map, { arena: false }))).toEqual(wallFlags(generated.map));
    const stripped = stripUnbreakable(generated.map);
    const once = stampLegacyProtectedWalls(stripped, { arena: false });
    const twice = stampLegacyProtectedWalls(once, { arena: false });
    expect(wallFlags(twice)).toEqual(wallFlags(once));
    expect(once[0].every(tile => tile.type !== 'wall' || tile.unbreakable)).toBe(true);
    expect(wallFlags(once).length).toBeGreaterThan(wallFlags(generated.map).filter(key => key.endsWith(',0') || key.startsWith('0,')).length);
  });

  it('stamps the arena when the finale floor has no flags yet', () => {
    const generated = generateMap(FINALE_FLOOR);
    const stripped = stripUnbreakable(generated.map);
    const stamped = stampLegacyProtectedWalls(stripped, { arena: true });
    expect(wallFlags(stamped)).toEqual(wallFlags(generated.map));
  });
});

describe('pickaxe monkey loot', () => {
  it('drops a 5-charge pickaxe from D:3 and nothing earlier', () => {
    expect(monkeyPickaxeDrop(true, 2, { x: 1, y: 1 })).toBeNull();
    expect(monkeyPickaxeDrop(false, 5, { x: 1, y: 1 })).toBeNull();
    const drop = monkeyPickaxeDrop(true, 3, { x: 4, y: 5 });
    expect(drop?.activeKind).toBe('pickaxe');
    expect(drop?.charges).toBe(5);
    expect(drop?.pos).toEqual({ x: 4, y: 5 });
  });
});
