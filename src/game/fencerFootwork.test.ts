import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Enemy, Player } from './types';
import { footworkCombo, lungeHitMults, planBackdash } from './prestige';
import { FENCER_LUNGE_MULT, FENCER_RIPOSTE_MULT } from './prestigeConstants';
import { SAVE_KEY, SAVE_SCHEMA_VERSION, loadGame } from './save';

function fencer(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 2, y: 2 },
    emoji: '🤺',
    characterClass: '🤺',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 8, defense: 1, speed: 3, evasion: 8,
      luck: 0, level: 5, xp: 100, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  } as Player;
}

function foe(x: number, y: number): Enemy {
  return { id: 'g', pos: { x, y }, emoji: '👺', name: 'Goblin', hp: 8, maxHp: 8, attack: 2, defense: 0, speed: 1, engaged: true };
}

function openMap() {
  return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ type: 'floor' })));
}

describe('fencer footwork', () => {
  it('backdashes two tiles and stops early when the second tile is blocked', () => {
    const map = openMap();
    expect(planBackdash(fencer(), [foe(2, 3)], map)).toEqual({ x: 2, y: 0 });
    map[0][2] = { type: 'wall' };
    expect(planBackdash(fencer(), [foe(2, 3)], map)).toEqual({ x: 2, y: 1 });
    map[1][2] = { type: 'wall' };
    expect(planBackdash(fencer(), [foe(2, 3)], map)).toBeNull();
  });

  it('doubles a lunge after a backdash, and banks two ripostes the other way', () => {
    const afterDash = fencer({ stats: { ...fencer().stats, fencerLastAct: 'backdash', fencerLastActTurn: 4, riposteCharges: 1 } });
    expect(footworkCombo(afterDash.stats, 5, 'backdash')).toBe(true);
    const swings = lungeHitMults(afterDash.stats, 2, true);
    expect(swings.mults).toEqual([FENCER_RIPOSTE_MULT, FENCER_RIPOSTE_MULT]);
    expect(swings.riposteCharges).toBe(0);

    const afterLunge = fencer({ stats: { ...fencer().stats, fencerLastAct: 'lunge', fencerLastActTurn: 4, riposteCharges: 0 } });
    expect(footworkCombo(afterLunge.stats, 5, 'lunge')).toBe(true);
    expect(footworkCombo(afterLunge.stats, 6, 'lunge')).toBe(false);
    expect(FENCER_LUNGE_MULT).toBeGreaterThan(1);
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('double attack');
    expect(manual).toContain('banks 2 Ripostes');
  });

  it('migrates a ready riposte into one charge', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
      },
    });
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 9,
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
      player: { characterClass: '🤺', ammo: 0, stats: { riposteReady: true }, inventory: [], bank: [], equipment: {} },
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.state.schemaVersion).toBe(10);
    expect(loaded.state.player.stats.riposteCharges).toBe(1);
    expect(loaded.state.player.stats.riposteReady).toBeUndefined();
  });
});
