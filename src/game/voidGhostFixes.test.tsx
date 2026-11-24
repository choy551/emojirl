import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { HotbarPanel } from '../components/HotbarPanel';
import { buildHotbarSlots, playerBagPassives, voidExplorePressureLog, voidHotbarPressureGain } from './inventory';
import { digCardinalLine } from './pickaxe';
import { SAVE_KEY, loadGame } from './save';
import type { EmojiItem, MapGrid, Player } from './types';
import { activeGhostPickaxe, spendGhostPickaxeUses } from './voidCharge';
import { voidGhostCapacity } from './voidDamage';
import { creditVoidGhostConsume, ghostProgressLabel, recordHotbarSoulConsume } from './voidMeta';

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

function voidPlayer(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: '👤',
    characterClass: '👤',
    ammo: 0,
    stats: {
      hp: 12, maxHp: 12, attack: 2, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    voidBossesCleared: 0,
    ghostHotbar: [null, null, null, null, null, null, null, null, null],
    ...over,
  };
}

describe('void ghost slots follow depth and swaps', () => {
  it('opens slot 2 by D:13 even with no recorded boss kills, including after load', () => {
    expect(voidGhostCapacity(1, 0)).toBe(1);
    expect(voidGhostCapacity(4, 0)).toBe(1);
    expect(voidGhostCapacity(13, 0)).toBe(3);
    expect(voidGhostCapacity(13, 4)).toBe(5);

    const onFloor = voidPlayer({
      voidRosterFloor: 13,
      ghostHotbar: [
        { emoji: '❤️', stacks: 1 },
        { emoji: '⛏️', stacks: 2, uses: 5, maxUses: 5 },
        { emoji: '🌙', stacks: 1 },
        null, null, null, null, null, null,
      ],
    });
    const slots = buildHotbarSlots(onFloor);
    expect(slots[1]?.isVoidGhostDormant).toBeFalsy();
    expect(slots[2]?.isVoidGhostDormant).toBeFalsy();
    expect(playerBagPassives(onFloor).losBonus).toBe(-1);

    const early = voidPlayer({
      voidRosterFloor: 4,
      ghostHotbar: [
        { emoji: '❤️', stacks: 1 },
        { emoji: '🌙', stacks: 1 },
        null, null, null, null, null, null, null,
      ],
    });
    expect(buildHotbarSlots(early)[1]?.isVoidGhostDormant).toBe(true);
    expect(playerBagPassives(early).losBonus).toBe(0);
    const swapped = voidPlayer({
      ...early,
      ghostHotbar: [
        null,
        { emoji: '🌙', stacks: 1 },
        null, null, null, null, null, null, null,
      ],
    });
    expect(buildHotbarSlots(swapped)[1]?.isVoidGhostDormant).toBeFalsy();
    expect(playerBagPassives(swapped).losBonus).toBe(-1);

    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 13,
      currentFloor: 13,
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
      player: {
        ...onFloor,
        voidRosterFloor: undefined,
        voidBossesCleared: 0,
      },
      turn: 3,
      enemies: [],
      items: [],
      logs: [],
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.player.voidRosterFloor).toBe(13);
    expect(buildHotbarSlots(loaded.state.player)[1]?.isVoidGhostDormant).toBeFalsy();
    expect(playerBagPassives(loaded.state.player).losBonus).toBe(-1);
  });
});

describe('ghost pickaxe', () => {
  it('counts an active ghost as a charged pickaxe and spends one use per dug tile', () => {
    const dormant = voidPlayer({
      voidRosterFloor: 4,
      ghostHotbar: [
        { emoji: '❤️', stacks: 1 },
        { emoji: '⛏️', stacks: 2, uses: 5, maxUses: 5 },
        null, null, null, null, null, null, null,
      ],
    });
    expect(activeGhostPickaxe(dormant)).toBeNull();

    const miner = voidPlayer({
      voidRosterFloor: 13,
      ghostHotbar: [null, { emoji: '⛏️', stacks: 2, uses: 5, maxUses: 5 }, null, null, null, null, null, null, null],
    });
    expect(activeGhostPickaxe(miner)).toMatchObject({ emoji: '⛏️', uses: 5, maxUses: 5 });
    const floor = { type: 'floor' as const, emoji: '⬜', seen: true, visible: true };
    const wall = { type: 'wall' as const, emoji: '⬛', seen: true, visible: true };
    const map: MapGrid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ ...floor })));
    map[2][3] = { ...wall };
    map[2][4] = { ...wall };
    const dug = digCardinalLine(map, { x: 2, y: 2 }, 1, 0, activeGhostPickaxe(miner)!.uses);
    expect(dug.dug).toBe(1);
    const spent = spendGhostPickaxeUses(miner, '⛏️', dug.dug);
    expect(activeGhostPickaxe(spent)?.uses).toBe(4);
    const empty = spendGhostPickaxeUses(spent, '⛏️', 4);
    expect(activeGhostPickaxe(empty)).toBeNull();
  });
});

describe('shop buy and use ghost progress', () => {
  it('counts a shop soul the same way as a hotbar consume', () => {
    const soul: EmojiItem = {
      id: 'zap', emoji: '⚡', name: 'Lightning', description: 'zap', consumed: false,
      bagPassive: { description: 'arc', lightningBolt: true },
    };
    let player = voidPlayer();
    for (let i = 0; i < 9; i++) {
      const step = creditVoidGhostConsume(player, soul);
      expect(step.log).toBeNull();
      player = step.player;
    }
    const tenth = creditVoidGhostConsume(player, soul);
    expect(tenth.log).toContain('Ghost unlocked');
    expect(tenth.player.ghostHotbar?.some(g => g?.emoji === '⚡' && g.stacks === 1)).toBe(true);
    expect(recordHotbarSoulConsume('🔥').consumes).toBe(1);
    const food: EmojiItem = { id: 'ap', emoji: '🍎', name: 'Apple', description: 'heal', consumed: false, healAmount: 4 };
    expect(creditVoidGhostConsume(player, food).log).toBeNull();
  });

  it('shows Ghost progress on the Items tab', () => {
    recordHotbarSoulConsume('❤️');
    recordHotbarSoulConsume('❤️');
    recordHotbarSoulConsume('❤️');
    for (let i = 0; i < 14; i++) recordHotbarSoulConsume('🌙');
    expect(ghostProgressLabel({ unlocks: 0, consumes: 3 })).toBe('Ghost 3/10');
    expect(ghostProgressLabel({ unlocks: 2, consumes: 24 })).toBe('×2, next 4/10');
    const slots = buildHotbarSlots(voidPlayer({
      inventory: [{
        id: 'heart', emoji: '❤️', name: 'Heart', description: 'heal', consumed: false,
        bagPassive: { description: 'vamp', vampiricStrike: true },
      }],
    }));
    const html = renderToStaticMarkup(createElement(HotbarPanel, {
      bagSlots: slots,
      bank: [],
      selectedItemId: null,
      focusedBagIdx: 0,
      onSelect: () => {},
      onMove: () => {},
      onShowStatCard: () => {},
      asVoid: true,
    }));
    expect(html).toContain('data-testid="ghost-progress"');
    expect(html).toContain('Ghost 3/10');
    const desktop = html;
    const mobile = renderToStaticMarkup(createElement(HotbarPanel, {
      bagSlots: slots,
      bank: [],
      selectedItemId: null,
      focusedBagIdx: 0,
      onSelect: () => {},
      onMove: () => {},
      onShowStatCard: () => {},
      mobileConsume: true,
      asVoid: true,
    }));
    expect(mobile).toContain('Ghost 3/10');
    expect(desktop).toContain('Ghost 3/10');
  });
});

describe('void autoexplore pressure', () => {
  it('flags a hotbar pickup that increases Void damage and ignores a banked one', () => {
    const before = voidPlayer();
    const after = voidPlayer({
      inventory: [{
        id: 'heart', emoji: '❤️', name: 'Heart', description: 'hp', consumed: false,
        bagPassive: { description: 'vamp', vampiricStrike: true },
      }],
    });
    expect(voidHotbarPressureGain(before, after)).toBe(1);
    expect(voidExplorePressureLog('❤️', 'Heart')).toContain('damaging you');
    const banked = voidPlayer({
      bank: [{
        id: 'heart', emoji: '❤️', name: 'Heart', description: 'hp', consumed: false,
        bagPassive: { description: 'vamp', vampiricStrike: true },
      }],
    });
    expect(voidHotbarPressureGain(before, banked)).toBe(0);
  });
});
