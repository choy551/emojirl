import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { HotbarLockButton } from '../components/HotbarLockButton';
import { addToPlayerBag, applyBankToHotbarSlot, removeAndRefillBag, toggleHotbarLock } from './inventory';
import { SAVE_KEY, loadGame, saveGame } from './save';
import type { EmojiItem, Player } from './types';

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
    ...over,
  };
}

function soul(id: string, emoji = '💀'): EmojiItem {
  return { id, emoji, name: 'Skull', description: 'Death Crit', consumed: false };
}

describe('hotbar lock', () => {
  it('sends new finds to the Bank and still allows a deliberate swap', () => {
    const open = addToPlayerBag(player(), soul('a'));
    expect(open.inventory.map(item => item.id)).toEqual(['a']);
    expect(open.bank).toHaveLength(0);

    const lockedPlayer = player({ hotbarLocked: true, inventory: [soul('kept')] });
    const parked = addToPlayerBag(lockedPlayer, soul('fresh'));
    expect(parked.inventory.map(item => item.id)).toEqual(['kept']);
    expect(parked.bank.map(item => item.id)).toEqual(['fresh']);

    const swapped = applyBankToHotbarSlot({ ...lockedPlayer, bank: [soul('banked')] }, 'banked', 1);
    expect(swapped.hotbarLocked).toBe(true);
    expect(swapped.inventory.map(item => item.id)).toEqual(['kept', 'banked']);
    expect(swapped.bank).toHaveLength(0);

    const held = removeAndRefillBag([soul('kept')], [soul('spare')], 'kept', true);
    expect(held.inventory).toHaveLength(0);
    expect(held.bank.map(item => item.id)).toEqual(['spare']);
  });

  it('persists the toggle and shows a 44px mobile control', () => {
    const flipped = toggleHotbarLock(player());
    expect(flipped.player.hotbarLocked).toBe(true);
    expect(flipped.log).toContain('Hotbar locked');
    const saved = player({ hotbarLocked: true });
    localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 7, player: saved, map: [] }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind === 'ok') {
      expect(loaded.state.player.hotbarLocked).toBe(true);
      saveGame({ ...loaded.state, player: toggleHotbarLock(loaded.state.player).player });
    }
    const again = loadGame();
    expect(again.kind).toBe('ok');
    if (again.kind === 'ok') expect(again.state.player.hotbarLocked).toBe(false);

    const mobile = renderToStaticMarkup(<HotbarLockButton locked onToggle={() => {}} size="mobile" />);
    expect(mobile).toContain('min-h-11');
    expect(mobile).toContain('min-w-11');
    expect(mobile).toContain('aria-pressed="true"');
    expect(readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8')).toContain('Lock Hotbar');
  });
});
