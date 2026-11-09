import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveContextAction, resolveMobileContext } from './contextAction';
import type { GameState, Player, Tile } from './types';

const floor: Tile = { type: 'floor', emoji: '⬜', seen: true, visible: true };

function stubState(over: Partial<GameState> = {}): GameState {
  const player = {
    pos: { x: 1, y: 1 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: { hp: 8, maxHp: 8, attack: 1, defense: 0, speed: 1, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0 },
    inventory: [],
    bank: [],
    equipment: {},
  } as Player;
  return {
    schemaVersion: 1,
    player,
    currentFloor: 1,
    map: [
      [floor, floor, floor],
      [floor, floor, floor],
      [floor, floor, floor],
    ],
    enemies: [],
    items: [],
    turn: 1,
    logs: [],
    floatingTexts: [],
    gameOver: false,
    victory: false,
    levelUpPending: false,
    cameraOffset: { x: 0, y: 0 },
    placedBombs: [],
    activeProjectile: null,
    killCounts: {},
    difficultyTier: 0,
    highestPressureTierWarned: 0,
    ...over,
  };
}

describe('resolveContextAction idle fallback', () => {
  it('defaults to wait (keyboard Space)', () => {
    const d = resolveContextAction(stubState());
    expect(d.kind).toBe('wait');
    expect(d.label).toBe('Wait');
  });

  it('idles as auto-explore for the mobile context button', () => {
    const d = resolveContextAction(stubState(), 'explore');
    expect(d.kind).toBe('explore');
    expect(d.label).toBe('Explore');
    expect(d.icon).toBe('🔭');
  });

  it('trades with an adjacent farmer and does not attack livestock', () => {
    const npc = {
      id: 'n', pos: { x: 2, y: 1 }, emoji: '🧑‍🌾', name: 'Farmer',
      hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 3, engaged: false,
    };
    const farmer = resolveContextAction(stubState({
      enemies: [{ ...npc, tag: 'Friendly' as const, isFarmer: true }],
    }));
    expect(farmer.kind).toBe('trade');
    expect(farmer.label).toBe('Trade');
    const dog = resolveContextAction(stubState({
      enemies: [{ ...npc, emoji: '🐕', name: 'Farm Dog', tag: 'Friendly' as const, isFarmAnimal: true }],
    }));
    expect(dog.kind).not.toBe('attack');
    expect(dog.kind).not.toBe('fairy');
  });

  it('shows Attack on mobile when a foe is in sight and keeps Explore otherwise', () => {
    const wide = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ ...floor })));
    const goblin = {
      id: 'g', pos: { x: 2, y: 0 }, emoji: '👺', name: 'Goblin',
      hp: 6, maxHp: 6, attack: 1, defense: 0, speed: 1, engaged: true,
    };
    const seen = resolveMobileContext(stubState({
      player: { ...stubState().player, pos: { x: 2, y: 2 } },
      map: wide,
      enemies: [goblin],
    }));
    expect(seen).toEqual({ kind: 'autofight', label: 'Attack', icon: '⚔️' });
    const hurt = stubState().player;
    hurt.stats = { ...hurt.stats, hp: 1, maxHp: 8 };
    const low = resolveMobileContext(stubState({
      player: { ...hurt, pos: { x: 2, y: 2 } },
      map: wide,
      enemies: [goblin],
    }));
    expect(low.label).toBe('Attack');
    const farmer = resolveMobileContext(stubState({
      enemies: [{
        id: 'n', pos: { x: 2, y: 1 }, emoji: '🧑‍🌾', name: 'Farmer',
        hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 3, engaged: false,
        tag: 'Friendly' as const, isFarmer: true,
      }],
    }));
    expect(farmer.kind).toBe('trade');
    const dark = wide.map(row => row.map(tile => ({ ...tile })));
    dark[0][2] = { ...floor, visible: false };
    const unseen = resolveMobileContext(stubState({
      player: { ...stubState().player, pos: { x: 2, y: 2 } },
      map: dark,
      enemies: [goblin],
    }), true);
    expect(unseen.kind).toBe('explore');
    expect(unseen.label).toBe('Stop');
    const idle = resolveMobileContext(stubState());
    expect(idle.kind).toBe('explore');
    expect(idle.label).toBe('Explore');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('shows Attack');
    expect(manual).toContain('same step as Tab');
    const page = readFileSync(new URL('../pages/game.tsx', import.meta.url), 'utf8');
    expect(page).not.toContain('mobile-autofight');
    expect(page).toContain("label: 'Autofight'");
  });

  it('still prefers a nearby relevant action over explore', () => {
    const shrine = { type: 'shrine' as const, emoji: '🛕', seen: true, visible: true };
    const state = stubState({
      map: [
        [floor, shrine, floor],
        [floor, floor, floor],
        [floor, floor, floor],
      ],
    });
    const d = resolveContextAction(state, 'explore');
    expect(d.kind).toBe('shrine');
    expect(d.label).toBe('Pray');
  });
});
