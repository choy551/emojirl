import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutoConsumeButton } from '../components/AutoConsumeButton';
import { EMOJI_POWERS } from './emojis';
import { consumeBankExtras, noteAutoConsume, toggleAutoConsume } from './autoConsume';
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
    expect(room.player.bank.map(item => item.id)).toEqual(['extra']);
    expect(room.logs).toHaveLength(0);
    expect(room.player.stats.attack).toBe(6);
  });

  it('leaves the only copy of a soul, and a lightning bolt, in the Bank', () => {
    const only = consumeBankExtras(player({ bank: [soul('💀', 'lone'), soul('⚡', 'zap')] }));
    expect(only.player.bank.map(item => item.id)).toEqual(['lone', 'zap']);

    const extra = consumeBankExtras(player({
      inventory: [soul('💀', 'hot')],
      bank: [soul('💀', 'spare'), soul('⚡', 'zap')],
    }));
    expect(extra.player.stats.attack).toBe(8);
    expect(extra.player.bank.map(item => item.id)).toEqual(['zap']);
    expect(extra.logs.join('\n')).toContain('Auto-consumed 💀 Skull');

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
});
