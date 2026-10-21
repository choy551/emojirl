import { beforeEach, describe, expect, it } from 'vitest';
import type { Enemy, EmojiItem, GameState, MapGrid, Player, Tile } from './types';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import { countVoidPressureSlots, playerBagPassives } from './inventory';
import { voidClassTurnDamage, voidDamageFor, voidGhostCapacity, VOID_DEATH_TEXT } from './voidDamage';
import { isVoidUnlocked, recordHotbarSoulConsume, unlockVoidClass } from './voidMeta';

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

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: true, visible: true };
}

function openMap(): MapGrid {
  return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => tile('floor', '⬜')));
}

function soul(emoji: string, id: string): EmojiItem {
  return {
    id,
    emoji,
    name: emoji,
    description: 'soul',
    consumed: false,
    bagPassive: { description: 'soul', attackBonus: 1, burningOnHit: emoji === '🔥', vampiricStrike: emoji === '❤️' },
  };
}

function player(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 2, y: 2 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 3, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  };
}

function state(p: Player, floor = 1): GameState {
  return {
    schemaVersion: 1,
    player: p,
    currentFloor: floor,
    map: openMap(),
    enemies: [] as Enemy[],
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
  };
}

function turn(s: GameState) {
  return applyEnemyTurns(s, runEnemyTurns(s));
}

beforeEach(() => {
  localStorage.clear();
});

describe('voidDamageFor', () => {
  it('is zero for no pressure and equal to the floor for one unit', () => {
    expect(voidDamageFor(0, 4)).toBe(0);
    expect(voidDamageFor(0, 9)).toBe(0);
    expect(voidDamageFor(1, 4)).toBe(4);
    expect(voidDamageFor(1, 7)).toBe(7);
  });

  it('scales Void class pressure as floor × filled + filled', () => {
    expect(voidClassTurnDamage(0, 6)).toBe(0);
    expect(voidClassTurnDamage(3, 4)).toBe(4 * 3 + 3);
    expect(voidClassTurnDamage(3, 6)).toBe(6 * 3 + 3);
  });
});

describe('emoji-less and inverted Void ticks', () => {
  it('a normal class with no soul still takes floor damage', () => {
    const next = turn(state(player(), 4));
    expect(next.player.stats.hp).toBe(16);
    expect(next.logs.some(l => l.text.includes('💀 You are emoji-less! Taking 4 dmg/turn'))).toBe(true);
    expect(next.gameOver).toBe(false);
  });

  it('a normal class holding a soul takes no Void damage', () => {
    const next = turn(state(player({ inventory: [soul('🍀', 'clover')] }), 4));
    expect(next.player.stats.hp).toBe(20);
    expect(next.logs.some(l => l.text.includes('emoji-less'))).toBe(false);
  });

  it('The Void takes floor×filled+filled from real hotbar souls and nothing from an empty bar', () => {
    const empty = turn(state(player({ emoji: '👤', characterClass: '👤' }), 4));
    expect(empty.player.stats.hp).toBe(20);
    expect(empty.logs.some(l => l.text.includes('Void pressure'))).toBe(false);

    const held = player({
      emoji: '👤',
      characterClass: '👤',
      inventory: [soul('🔥', 'a'), soul('🌟', 'b'), soul('🌙', 'c')],
      bank: [soul('💎', 'banked')],
      equipment: { body: { ...soul('🛡️', 'eq'), isEquipment: true } },
    });
    expect(countVoidPressureSlots(held)).toBe(3);
    const next = turn(state(held, 4));
    expect(next.player.stats.hp).toBe(20 - (4 * 3 + 3));
    expect(next.logs.some(l => l.text.includes('👤 Void pressure (3 held) — 15 dmg'))).toBe(true);
  });

  it('ghosts do not count as held items', () => {
    const p = player({
      emoji: '👤',
      characterClass: '👤',
      voidBossesCleared: 0,
      ghostHotbar: [{ emoji: '❤️', stacks: 1 }, null, null, null, null, null, null, null, null],
    });
    expect(countVoidPressureSlots(p)).toBe(0);
    const next = turn(state(p, 5));
    expect(next.player.stats.hp).toBe(20);
  });

  it('dying to the Void sets the unlock flag and the Void death line', () => {
    const wizard = turn(state(player({ stats: { ...player().stats, hp: 1 } }), 1));
    expect(wizard.gameOver).toBe(true);
    expect(wizard.killer).toEqual({ name: 'the void', emoji: '💀' });
    expect(isVoidUnlocked()).toBe(true);
    expect(wizard.logs.some(l => l.text.includes('👤 The Void unlocked'))).toBe(true);
    expect(unlockVoidClass()).toBe(false);

    localStorage.clear();
    const voidFirst = turn(state(player({
      emoji: '👤',
      characterClass: '👤',
      inventory: [soul('🔥', 'a')],
      stats: { ...player().stats, hp: 1 },
    }), 1));
    expect(voidFirst.gameOver).toBe(false);
    expect(voidFirst.player.stats.hp).toBe(1);
    expect(voidFirst.voidGraceFloor).toBe(1);
    expect(voidFirst.logs.some(l => l.text.includes('The Void hesitates'))).toBe(true);
    expect(voidFirst.logs.some(l => l.text.includes('Grace leaves 1 HP'))).toBe(true);
    expect(voidFirst.floatingTexts.some(f => f.text === 'GRACE')).toBe(true);
    expect(isVoidUnlocked()).toBe(false);

    const voidDeath = turn(voidFirst);
    expect(voidDeath.gameOver).toBe(true);
    expect(voidDeath.killer).toEqual({ name: 'the void', emoji: '👤' });
    expect(voidDeath.logs.some(l => l.text === VOID_DEATH_TEXT)).toBe(true);
    expect(isVoidUnlocked()).toBe(true);
  });

  it('spends grace only on a lethal burden and refreshes it on the next floor', () => {
    const hardy = player({
      emoji: '👤',
      characterClass: '👤',
      stats: { ...player().stats, hp: 20, level: 40 },
      inventory: [soul('🔥', 'a')],
    });
    const scratched = turn(state(hardy, 4));
    expect(scratched.player.stats.hp).toBe(20 - voidClassTurnDamage(1, 4));
    expect(scratched.voidGraceFloor).toBeUndefined();
    expect(scratched.gameOver).toBe(false);

    const wounded = turn(state({
      ...hardy,
      stats: { ...hardy.stats, hp: 3 },
    }, 4));
    expect(wounded.gameOver).toBe(false);
    expect(wounded.player.stats.hp).toBe(1);
    expect(wounded.voidGraceFloor).toBe(4);
    expect(wounded.floatingTexts.some(f => f.text === 'GRACE')).toBe(true);

    const finished = turn(wounded);
    expect(finished.gameOver).toBe(true);
    expect(finished.killer).toEqual({ name: 'the void', emoji: '👤' });

    const nextFloor = turn({ ...wounded, gameOver: false, currentFloor: 5, voidGraceFloor: 4, player: { ...wounded.player, stats: { ...wounded.player.stats, hp: 3 } } });
    expect(nextFloor.gameOver).toBe(false);
    expect(nextFloor.player.stats.hp).toBe(1);
    expect(nextFloor.voidGraceFloor).toBe(5);
  });
});

describe('ghost unlocks and depth capacity', () => {
  it('unlocks a stack every 10 hotbar consumes', () => {
    for (let i = 0; i < 9; i++) {
      const rec = recordHotbarSoulConsume('⚡');
      expect(rec.crossed).toBe(false);
      expect(rec.unlocks).toBe(0);
    }
    const tenth = recordHotbarSoulConsume('⚡');
    expect(tenth.crossed).toBe(true);
    expect(tenth.unlocks).toBe(1);
    expect(tenth.consumes).toBe(10);
    for (let i = 0; i < 9; i++) recordHotbarSoulConsume('⚡');
    const twentieth = recordHotbarSoulConsume('⚡');
    expect(twentieth.unlocks).toBe(2);
    expect(twentieth.crossed).toBe(true);
  });

  it('only the first N hotbar ghosts apply passives at the current capacity', () => {
    expect(voidGhostCapacity(1, 0)).toBe(1);
    expect(voidGhostCapacity(4, 0)).toBe(1);
    expect(voidGhostCapacity(5, 1)).toBe(2);
    expect(voidGhostCapacity(15, 3)).toBe(4);
    expect(voidGhostCapacity(99, 20)).toBe(9);

    const p = player({
      emoji: '👤',
      characterClass: '👤',
      voidBossesCleared: 0,
      ghostHotbar: [
        { emoji: '❤️', stacks: 2 },
        { emoji: '🔥', stacks: 1 },
        null, null, null, null, null, null, null,
      ],
    });
    const capped = playerBagPassives(p);
    expect(capped.vampiricStrike).toBe(2);
    expect(capped.burningOnHit).toBe(false);

    const opened = playerBagPassives({ ...p, voidBossesCleared: 1 });
    expect(opened.vampiricStrike).toBe(2);
    expect(opened.burningOnHit).toBe(true);
    expect(opened.attack).toBeGreaterThan(0);
  });
});
