import { describe, it, expect } from 'vitest';
import { addToBag } from './inventory';
import { stealOneSoulEmoji, applySoulThefts, restoreStolenEmojis } from './monkeyLoot';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import type { EmojiItem, Enemy, GameState, Player, Tile } from './types';

function heart(id: string, stackCount = 1): EmojiItem {
  return {
    id,
    emoji: '❤️',
    name: 'Heart',
    description: 'life steal',
    consumed: false,
    stackCount,
    bagPassive: { description: 'Each hit restores 1 HP', vampiricStrike: true },
  };
}

function crystal(id: string): EmojiItem {
  return {
    id,
    emoji: '🔮',
    name: 'Crystal Ball',
    description: 'true vision',
    consumed: false,
    bagPassive: { description: 'See all enemies', trueVision: true, nonStackable: true },
  };
}

describe('addToBag stack restore', () => {
  it('merges a stolen stackCount onto an existing stack instead of adding 1', () => {
    const { inventory } = addToBag([heart('a', 1)], [], heart('stolen', 3));
    expect(inventory).toHaveLength(1);
    expect(inventory[0].stackCount).toBe(4);
  });
});

describe('stealOneSoulEmoji', () => {
  it('takes one copy from a stack, leaving the rest', () => {
    const taken: Record<string, number> = {};
    const bag = [heart('h1', 3)];
    const theft = stealOneSoulEmoji(bag, taken);
    expect(theft).not.toBeNull();
    expect(theft!.stolen.emoji).toBe('❤️');
    expect(theft!.stolen.stackCount).toBe(1);
    expect(theft!.sourceId).toBe('h1');
    const after = applySoulThefts(bag, [theft!.sourceId]);
    expect(after).toHaveLength(1);
    expect(after[0].stackCount).toBe(2);
  });

  it('removes a unique soul emoji entirely', () => {
    const taken: Record<string, number> = {};
    const bag = [crystal('c1')];
    const theft = stealOneSoulEmoji(bag, taken);
    expect(theft!.sourceId).toBe('c1');
    const after = applySoulThefts(bag, [theft!.sourceId]);
    expect(after).toHaveLength(0);
  });

  it('allows two steals from the same stack in one turn', () => {
    const taken: Record<string, number> = {};
    const bag = [heart('h1', 3)];
    const a = stealOneSoulEmoji(bag, taken);
    const b = stealOneSoulEmoji(bag, taken);
    expect(a && b).toBeTruthy();
    const after = applySoulThefts(bag, [a!.sourceId, b!.sourceId]);
    expect(after[0].stackCount).toBe(1);
  });
});

describe('restoreStolenEmojis', () => {
  it('returns every stolen copy to the bag', () => {
    const stolen = [heart('s1', 1), heart('s2', 1), crystal('s3')];
    const restored = restoreStolenEmojis({ inventory: [], bank: [] }, stolen);
    const hearts = restored.inventory.find(i => i.emoji === '❤️');
    expect(hearts?.stackCount).toBe(2);
    expect(restored.inventory.some(i => i.emoji === '🔮')).toBe(true);
  });

  it('restores a leftover stack plus stolen copies to the original count', () => {
    const stolen = [heart('s1', 1), heart('s2', 1)];
    const restored = restoreStolenEmojis({ inventory: [heart('remain', 1)], bank: [] }, stolen);
    expect(restored.inventory).toHaveLength(1);
    expect(restored.inventory[0].stackCount).toBe(3);
  });
});

describe('companion kill returns monkey loot', () => {
  it('puts every stolen copy back when a companion finishes the monkey', () => {
    const floor: Tile = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    const map = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ ...floor })));
    const stolen = [heart('s1', 1), heart('s2', 1)];
    const player = {
      pos: { x: 2, y: 2 },
      emoji: '🧙',
      characterClass: '🧙',
      ammo: 0,
      stats: { hp: 10, maxHp: 10, attack: 3, defense: 0, speed: 4, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0 },
      inventory: [heart('remain', 1)],
      bank: [],
      equipment: {},
    } as Player;
    const companion: Enemy = {
      id: 'comp', emoji: '🧝', name: 'Ally', hp: 12, maxHp: 12, attack: 10, defense: 0, speed: 5,
      engaged: false, pos: { x: 3, y: 1 }, tag: 'Friendly', isAdventurer: true, isRecruited: true,
    };
    const monkey: Enemy = {
      id: 'monk', emoji: '🐒', name: 'Monkey', hp: 1, maxHp: 4, attack: 2, defense: 0, speed: 5,
      engaged: true, pos: { x: 3, y: 2 }, tag: 'Hostile', monkey: true, stolenEmojis: stolen,
    };
    const state = {
      schemaVersion: 1,
      player,
      currentFloor: 1,
      map,
      enemies: [companion, monkey],
      items: [],
      turn: 4,
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
    } as GameState;

    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.enemies.some(e => e.monkey)).toBe(false);
    const hearts = next.player.inventory.find(i => i.emoji === '❤️');
    expect(hearts?.stackCount).toBe(3);
  });
});
