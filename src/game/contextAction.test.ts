import { describe, it, expect } from 'vitest';
import { resolveContextAction } from './contextAction';
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
