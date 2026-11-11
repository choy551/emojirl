import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutoConsumeButton } from '../components/AutoConsumeButton';
import { EMOJI_POWERS } from './emojis';
import { consumeBankExtras, noteAutoConsume, stowFoundItems, toggleAutoConsume } from './autoConsume';
import { addToPlayerBag } from './inventory';
import { loadMeta, setMetaStore, type KeyValueStore } from './meta';
import { SAVE_KEY, loadGame } from './save';
import type { EmojiItem, GameState, Player } from './types';

function memoryStore(): KeyValueStore {
  const mem = new Map<string, string>();
  return {
    getItem: key => mem.get(key) ?? null,
    setItem: (key, value) => { mem.set(key, value); },
    removeItem: key => { mem.delete(key); },
  };
}

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

beforeEach(() => {
  localStorage.clear();
  setMetaStore(memoryStore());
});

function player(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 6, defense: 1, speed: 2, evasion: 5,
      luck: 1, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    autoConsumeBank: true,
    ...over,
  };
}

function soul(emoji: string, id: string, stackCount?: number): EmojiItem {
  const power = EMOJI_POWERS.find(entry => entry.emoji === emoji);
  if (!power) throw new Error(`missing ${emoji}`);
  return { ...power, id, consumed: false, ...(stackCount ? { stackCount } : {}) };
}

describe('auto-consume', () => {
  it('uses bank extras only past the stack cap and logs the consume', () => {
    const full = consumeBankExtras(player({
      inventory: [soul('🔥', 'hot', 5)],
      bank: [
        soul('🔥', 'extra', 2),
        { id: 'bomb', emoji: '💣', name: 'Bomb', description: 'boom', consumed: false, activeKind: 'bomb' },
        { id: 'apple', emoji: '🍎', name: 'Apple', description: 'food', consumed: false, healAmount: 4 },
      ],
    }));
    expect(full.player.stats.attack).toBe(12);
    expect(full.player.bank.map(item => item.id)).toEqual(['bomb', 'apple']);
    expect(full.logs[0]).toBe('🫳 Auto-consumed 🔥 Fire ×2.');
    expect(loadMeta().emojiConsumes?.['🔥']).toBe(2);

    const room = consumeBankExtras(player({
      inventory: [soul('🔥', 'hot', 4)],
      bank: [soul('🔥', 'extra')],
    }));
    expect(room.player.inventory.find(item => item.id === 'hot')?.stackCount).toBe(5);
    expect(room.player.bank).toHaveLength(0);
    expect(room.logs).toHaveLength(0);
    expect(room.player.stats.attack).toBe(6);
  });

  it('uses a stat soul that was routed to the Bank, and keeps Lightning until its stack is full', () => {
    const only = consumeBankExtras(player({ bank: [soul('💀', 'lone'), soul('⚡', 'zap')] }));
    expect(only.player.stats.attack).toBe(8);
    expect(only.player.bank.map(item => item.id)).toEqual(['zap']);
    expect(only.logs.join('\n')).toContain('Auto-consumed 💀 Skull');

    const extra = consumeBankExtras(player({
      inventory: [soul('💀', 'hot')],
      bank: [soul('💀', 'spare'), soul('⚡', 'zap')],
    }));
    expect(extra.player.stats.attack).toBe(8);
    expect(extra.player.bank.map(item => item.id)).toEqual(['zap']);
    expect(extra.logs.join('\n')).toContain('Auto-consumed 💀 Skull');

    const full = consumeBankExtras(player({
      inventory: [soul('⚡', 'hot', 4)],
      bank: [soul('⚡', 'extra')],
    }));
    expect(full.player.inventory.find(item => item.id === 'hot')?.stackCount).toBe(4);
    expect(full.player.bank).toHaveLength(0);
    expect(full.logs[0]).toBe('🫳 Auto-consumed ⚡ Lightning.');

    const noted = noteAutoConsume({
      player: player({ inventory: [soul('🔥', 'hot', 5)], bank: [soul('🔥', 'extra')] }),
      turn: 3,
      logs: [],
    } as unknown as GameState);
    expect(noted.logs[0]?.text).toContain('Auto-consumed 🔥 Fire');
    expect(noted.player.bank).toHaveLength(0);
  });

  it('persists the switch and documents what it skips', () => {
    expect(toggleAutoConsume(player({ autoConsumeBank: false })).player.autoConsumeBank).toBe(true);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 7,
      map: [],
      player: player({ autoConsumeBank: true }),
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind === 'ok') expect(loaded.state.player.autoConsumeBank).toBe(true);

    const mobile = renderToStaticMarkup(<AutoConsumeButton enabled onToggle={() => {}} size="mobile" />);
    expect(mobile).toContain('min-h-11');
    expect(mobile).toContain('aria-pressed="true"');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('Auto-consume');
    expect(manual).toContain('bombs, guns, ropes, boomerangs, freeze rays');
  });

  it('leaves Rope and other on-demand items in the Bank', () => {
    const rope: EmojiItem = {
      id: 'rope', emoji: '🪢', name: 'Rope', description: 'vault', consumed: false, activeKind: 'rope', charges: 1,
    };
    const potion: EmojiItem = {
      id: 'pot', emoji: '🧪', name: 'Potion', description: 'heal', consumed: false, healAmount: 6,
    };
    const ammo: EmojiItem = {
      id: 'ammo', emoji: '🪙', name: 'Bullet', description: 'ammo', consumed: false, ammoAmount: 4,
    };
    const swept = consumeBankExtras(player({
      bank: [rope, potion, ammo, soul('💀', 'skull')],
    }));
    expect(swept.player.bank.map(item => item.id)).toEqual(['rope', 'pot', 'ammo']);
    expect(swept.logs.join('\n')).toContain('Auto-consumed 💀 Skull');
  });

  it('consumes a pickup that the hotbar lock sends to the Bank', () => {
    const found = soul('💀', 'fresh');
    const stowed = stowFoundItems(player({
      hotbarLocked: true,
      inventory: [soul('🔥', 'held', 1)],
    }), found);
    expect(stowed.player.inventory.map(item => item.id)).toEqual(['held']);
    expect(stowed.player.bank).toHaveLength(0);
    expect(stowed.player.stats.attack).toBe(8);
    expect(stowed.logs[0]).toBe('🫳 Auto-consumed 💀 Skull.');
  });

  it('sweeps souls already in the Bank when the toggle turns on', () => {
    const off = player({
      autoConsumeBank: false,
      bank: [
        soul('🌙', 'moon'),
        { id: 'rope', emoji: '🪢', name: 'Rope', description: 'vault', consumed: false, activeKind: 'rope' },
      ],
    });
    const on = toggleAutoConsume(off);
    const swept = noteAutoConsume({ player: on.player, turn: 4, logs: [] } as unknown as GameState);
    expect(swept.player.autoConsumeBank).toBe(true);
    expect(swept.player.bank.map(item => item.id)).toEqual(['rope']);
    expect(swept.player.stats.evasion).toBe(11);
    expect(swept.logs.some(line => line.text.startsWith('🫳 Auto-consumed 🌙'))).toBe(true);
  });

  it('tops up a hotbar stack while locked, then consumes or banks the overflow', () => {
    const below = addToPlayerBag(player({
      hotbarLocked: true,
      autoConsumeBank: true,
      inventory: [soul('🔥', 'hot', 3)],
    }), soul('🔥', 'next'));
    expect(below.inventory.find(item => item.id === 'hot')?.stackCount).toBe(4);
    expect(below.bank).toHaveLength(0);

    const capped = player({
      hotbarLocked: true,
      autoConsumeBank: true,
      inventory: [soul('🔥', 'hot', 5)],
    });
    const used = stowFoundItems(capped, soul('🔥', 'extra'));
    expect(used.player.inventory.find(item => item.id === 'hot')?.stackCount).toBe(5);
    expect(used.player.bank).toHaveLength(0);
    expect(used.player.stats.attack).toBe(9);
    expect(used.logs[0]).toBe('🫳 Auto-consumed 🔥 Fire.');

    const parked = addToPlayerBag(player({
      hotbarLocked: true,
      autoConsumeBank: false,
      inventory: [soul('🔥', 'hot', 5)],
    }), soul('🔥', 'extra'));
    expect(parked.inventory.find(item => item.id === 'hot')?.stackCount).toBe(5);
    expect(parked.bank.map(item => item.id)).toEqual(['extra']);
  });
});
