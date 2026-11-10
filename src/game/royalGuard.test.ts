import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmojiItem, Enemy, GameState, MapGrid, Player, Tile } from './types';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import { SAVE_KEY, SAVE_SCHEMA_VERSION, loadGame } from './save';
import { resolveCombat } from './combat';
import { readFileSync } from 'node:fs';
import {
  afterGuardShot,
  chooseGuardShot,
  crownFlees,
  crownStunChance,
  crownStuns,
  gainCarriedAmmo,
  guardHasRangedWeapon,
  hotbarCrown,
  initialRangerMode,
  royalDualBlades,
  royalOffhandFraction,
  splitPooledGuardAmmo,
} from './royalGuard';
import { specialAmmoForShot } from './weaponCombo';

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
    expect(crownFlees(1, 0, '🧙')).toBe(true);
    expect(crownFlees(1, 0.2, '🧙')).toBe(false);
    expect(crownFlees(0, 0, '🧙')).toBe(false);
    expect(crownFlees(3, 0, '💂')).toBe(false);
    expect(hotbarCrown().isEquipment).toBeUndefined();
    expect(hotbarCrown().bagPassive?.royalAura).toBe(true);
  });

  it('sends a spotted enemy fleeing for other classes and stuns for the Royal Guard', () => {
    const floor = (): Tile => ({ type: 'floor', emoji: '⬜', seen: true, visible: true });
    const map: MapGrid = Array.from({ length: 3 }, () => Array.from({ length: 5 }, floor));
    const crown: EmojiItem = {
      id: 'crown', emoji: '👑', name: 'Crown', description: '', consumed: false,
      bagPassive: { description: 'aura', royalAura: true },
    };
    const enemy: Enemy = {
      id: 'gob', emoji: '👺', name: 'Goblin', pos: { x: 2, y: 1 },
      hp: 8, maxHp: 8, attack: 1, defense: 0, speed: 1, engaged: false,
    };
    const state = (cls: string): GameState => ({
      schemaVersion: 1,
      player: {
        pos: { x: 1, y: 1 }, emoji: cls, characterClass: cls, ammo: 0,
        stats: { hp: 20, maxHp: 20, attack: 2, defense: 0, speed: 1, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0 },
        inventory: [crown], bank: [], equipment: {},
      },
      currentFloor: 1,
      map,
      enemies: [{ ...enemy }],
      items: [],
      turn: 2,
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
    });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const fled = applyEnemyTurns(state('🧙'), runEnemyTurns(state('🧙')));
      expect(fled.logs.some(line => line.text.includes('flees from the crown'))).toBe(true);
      expect(fled.enemies[0]?.pos).toEqual({ x: 3, y: 1 });
      expect(fled.logs.some(line => line.text.includes('stunned'))).toBe(false);
      const stunned = applyEnemyTurns(state('💂'), runEnemyTurns(state('💂')));
      expect(stunned.logs.some(line => line.text.includes('stunned by the crown'))).toBe(true);
      expect(stunned.enemies[0]?.pos).toEqual({ x: 2, y: 1 });
      expect(stunned.logs.some(line => line.text.includes('flees from the crown'))).toBe(false);
    } finally {
      random.mockRestore();
    }
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('20% chance an enemy flees');
    expect(manual).toContain('Royal Guard gets stun instead');
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
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
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

describe('royal guard split ammo', () => {
  it('splits a shared pool in half and keeps the odd arrow', () => {
    expect(splitPooledGuardAmmo(8)).toEqual({ arrowAmmo: 4, bulletAmmo: 4 });
    expect(splitPooledGuardAmmo(7)).toEqual({ arrowAmmo: 4, bulletAmmo: 3 });
    expect(splitPooledGuardAmmo(1)).toEqual({ arrowAmmo: 1, bulletAmmo: 0 });
    expect(splitPooledGuardAmmo(0)).toEqual({ arrowAmmo: 0, bulletAmmo: 0 });
  });

  it('alternates bow and gun, and spends the matching pool', () => {
    const bow = piece({ id: 'bow', emoji: '🏹', name: 'Bow', weaponKind: 'bow' });
    const gun = piece({ id: 'gun', emoji: '🔫', name: 'Gun', weaponKind: 'gun' });
    const both = {
      characterClass: '💂',
      equipment: { mainHand: bow, offHand: gun },
      arrowAmmo: 2,
      bulletAmmo: 2,
      guardNextShot: 'bow' as const,
    };
    expect(chooseGuardShot(both)?.shot).toBe('bow');
    const afterBow = afterGuardShot(both, 'bow', -1);
    expect(afterBow.arrowAmmo).toBe(1);
    expect(afterBow.bulletAmmo).toBe(2);
    expect(afterBow.guardNextShot).toBe('gun');
    expect(chooseGuardShot(afterBow)?.shot).toBe('gun');
    const afterGun = afterGuardShot(afterBow, 'gun', -1);
    expect(afterGun.bulletAmmo).toBe(1);
    expect(afterGun.guardNextShot).toBe('bow');

    const arrows = piece({ id: 'arrows', emoji: '🔥', name: 'Fire Arrows', specialAmmoKind: 'fire', ammoCarrier: 'arrow' });
    const rounds = piece({ id: 'rounds', emoji: '🧨', name: 'Incendiary Rounds', specialAmmoKind: 'fire', ammoCarrier: 'bullet' });
    expect(specialAmmoForShot({ equipment: { mainHand: bow, offHand: arrows } }, 'bow')?.carrier).toBe('arrow');
    expect(specialAmmoForShot({ equipment: { mainHand: bow, offHand: arrows } }, 'gun')).toBeNull();
    expect(specialAmmoForShot({ equipment: { mainHand: gun, offHand: rounds } }, 'gun')?.carrier).toBe('bullet');
    expect(specialAmmoForShot({ equipment: { mainHand: gun, offHand: rounds } }, 'bow')).toBeNull();

    const picked = gainCarriedAmmo({ characterClass: '💂', ammo: 0, arrowAmmo: 1, bulletAmmo: 0 }, { emoji: '🪙', ammoAmount: 5 });
    expect(picked.player.bulletAmmo).toBe(5);
    expect(picked.player.arrowAmmo).toBe(1);
    expect(picked.word).toBe('bullets');
  });

  it('migrates a schema 7 Royal Guard save into separate pools', () => {
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
      schemaVersion: 7,
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
      player: { characterClass: '💂', ammo: 7, stats: {}, inventory: [], bank: [], equipment: {} },
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.state.player.ammo).toBe(0);
    expect(loaded.state.player.arrowAmmo).toBe(4);
    expect(loaded.state.player.bulletAmmo).toBe(3);
    expect(loaded.state.player.guardNextShot).toBe('bow');

    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 7,
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
      player: { characterClass: '🧝', ammo: 7, stats: {}, inventory: [], bank: [], equipment: {} },
    }));
    const ranger = loadGame();
    expect(ranger.kind).toBe('ok');
    if (ranger.kind !== 'ok') return;
    expect(ranger.state.player.ammo).toBe(7);
    expect(ranger.state.player.arrowAmmo).toBeUndefined();
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('alternates');
    expect(manual).toContain('separate pools');
  });
});
