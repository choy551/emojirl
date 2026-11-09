import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmojiItem, Enemy, Player } from './types';
import { SAVE_KEY, loadGame } from './save';
import { resolveCombat } from './combat';
import { readFileSync } from 'node:fs';
import {
  crownStunChance,
  crownStuns,
  guardHasRangedWeapon,
  hotbarCrown,
  initialRangerMode,
  royalDualBlades,
  royalOffhandFraction,
} from './royalGuard';

function piece(partial: Partial<EmojiItem> & Pick<EmojiItem, 'id' | 'emoji' | 'name'>): EmojiItem {
  return { description: '', consumed: false, ...partial };
}

describe('royal guard crowns and ranged', () => {
  it('stuns at 5% per crown, capped at 25%, and only for the guard', () => {
    expect(crownStunChance(0)).toBe(0);
    expect(crownStunChance(1)).toBe(0.05);
    expect(crownStunChance(5)).toBe(0.25);
    expect(crownStunChance(9)).toBe(0.25);
    expect(crownStuns(1, 0.049, '💂')).toBe(true);
    expect(crownStuns(1, 0.05, '💂')).toBe(false);
    expect(crownStuns(5, 0.2, '🧙')).toBe(false);
    expect(hotbarCrown().isEquipment).toBeUndefined();
    expect(hotbarCrown().bagPassive?.royalAura).toBe(true);
  });

  it('starts in melee and shoots only with a bow or gun', () => {
    expect(initialRangerMode('💂')).toBe('melee');
    expect(initialRangerMode('🧝')).toBe('ranged');
    const withBow = { equipment: { mainHand: piece({ id: 'bow', emoji: '🏹', name: 'Bow', weaponKind: 'bow' }) } } as Pick<Player, 'equipment'>;
    const withGun = { equipment: { offHand: piece({ id: 'gun', emoji: '🔫', name: 'Gun', weaponKind: 'gun' }) } } as Pick<Player, 'equipment'>;
    const withSword = { equipment: { mainHand: piece({ id: 'sword', emoji: '⚔️', name: 'Sword', weaponKind: 'blade' }) } } as Pick<Player, 'equipment'>;
    expect(guardHasRangedWeapon(withBow)).toBe(true);
    expect(guardHasRangedWeapon(withGun)).toBe(true);
    expect(guardHasRangedWeapon(withSword)).toBe(false);
    expect(guardHasRangedWeapon({ equipment: {} })).toBe(false);
  });

  it('moves an equipped crown onto the hotbar and stacks it', () => {
    const equipped = piece({
      id: 'royal-crown',
      emoji: '👑',
      name: 'Crown',
      isEquipment: true,
      equipSlots: ['accessory'],
      equipBonus: { defense: 2, luck: 1 },
    });
    const carried: EmojiItem = {
      id: 'bag-crown',
      emoji: '👑',
      name: 'Crown',
      description: 'old flee',
      consumed: false,
      bagPassive: { description: 'flee', royalAura: true, nonStackable: true },
    };
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
      schemaVersion: 6,
      turn: 3,
      logs: [],
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
      player: {
        characterClass: '💂',
        stats: { hp: 12, maxHp: 12, attack: 4, defense: 2, speed: 2, evasion: 8, luck: 2, level: 1, xp: 0, moodValue: 0, gold: 10 },
        inventory: [carried],
        bank: [],
        equipment: { accessory: equipped },
      },
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.schemaVersion).toBe(7);
    expect(loaded.state.player.equipment.accessory).toBeUndefined();
    const crown = loaded.state.player.inventory.find(item => item.emoji === '👑');
    expect(crown?.isEquipment).toBeUndefined();
    expect(crown?.stackCount).toBe(2);
    expect(crown?.bagPassive?.nonStackable).toBeUndefined();
    expect(loaded.state.player.bank).toEqual([]);
  });
});

describe('royal guard dual blades', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hits with the main hand at 100% and the off hand at 50% plus 1% per level', () => {
    expect(royalOffhandFraction(1)).toBeCloseTo(0.51);
    expect(royalOffhandFraction(50)).toBe(1);
    expect(royalOffhandFraction(80)).toBe(1);
    const blade = (id: string): EmojiItem => piece({ id, emoji: '⚔️', name: 'Sword', weaponKind: 'blade' });
    const guard = {
      pos: { x: 0, y: 0 },
      emoji: '💂',
      characterClass: '💂',
      ammo: 0,
      inventory: [],
      bank: [],
      equipment: { mainHand: blade('main'), offHand: blade('off') },
      stats: {
        hp: 40, maxHp: 40, attack: 20, defense: 0, speed: 2, evasion: 0,
        luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
      },
    } as Player;
    expect(royalDualBlades(guard)).toBe(true);
    expect(royalDualBlades({ ...guard, equipment: { mainHand: blade('main') } })).toBe(false);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const logs: string[] = [];
    const foe = {
      id: 'rat', pos: { x: 1, y: 0 }, emoji: '🐀', name: 'Rat',
      hp: 80, maxHp: 80, attack: 0, defense: 0, speed: 1, engaged: true,
    } as Enemy;
    resolveCombat(guard, foe, text => logs.push(text), { mood: 'neutral' });
    expect(logs.some(line => line.includes('Main hand hits 🐀 for 20'))).toBe(true);
    expect(logs.some(line => line.includes('Off-hand hits 🐀 for 10') && line.includes('51% ATK'))).toBe(true);
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('blade in each hand');
    expect(manual).toContain('level 50');
  });
});
