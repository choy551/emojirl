import { describe, expect, it } from 'vitest';
import type { EmojiItem, Enemy, GameState, MapGrid, Player, Tile } from './types';
import { consumeBankItem } from './shopUse';
import { STAR_XP_TURNS } from './emojiBalance';
import { xpThresholdForLevel } from './progression';

function tile(type: Tile['type'], visible = true): Tile {
  return { type, emoji: '⬜', seen: true, visible };
}

function floorGrid(): MapGrid {
  return Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => tile('floor')));
}

function player(bank: EmojiItem[], stats: Partial<Player['stats']> = {}): Player {
  return {
    pos: { x: 2, y: 2 },
    emoji: '🤠',
    characterClass: '🤠',
    ammo: 0,
    stats: {
      hp: 6, maxHp: 10, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 10,
      ...stats,
    },
    inventory: [{
      id: 'carried', emoji: '🍀', name: 'Clover', description: 'luck', consumed: false,
      bagPassive: { description: 'loot', bonusLoot: true },
    }],
    bank,
    equipment: {},
  };
}

function state(bank: EmojiItem[], stats: Partial<Player['stats']> = {}, enemies: Enemy[] = []): GameState {
  return {
    schemaVersion: 1,
    player: player(bank, stats),
    currentFloor: 1,
    map: floorGrid(),
    enemies,
    items: [],
    turn: 3,
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

function soul(over: Partial<EmojiItem> & Pick<EmojiItem, 'id' | 'emoji' | 'name'>): EmojiItem {
  return { description: over.name, consumed: false, ...over };
}

const keep = soul({ id: 'keep', emoji: '🍀', name: 'Clover' });

function use(bankItem: EmojiItem, stats?: Partial<Player['stats']>, enemies: Enemy[] = []) {
  const logs: string[] = [];
  const next = consumeBankItem(state([bankItem, keep], stats, enemies), bankItem.id, {
    addLog: text => logs.push(text),
    applyMonkeyDropOnKill: (_killed, p) => p,
    rng: () => 1,
  });
  return { next, logs };
}

describe('consumeBankItem', () => {
  it('levels up from a Bank Star the same way the hotbar does', () => {
    const star = soul({ id: 'star', emoji: '🌟', name: 'Star' });
    const { next } = use(star, { hp: 3, maxHp: 10, level: 1, xp: 0 });
    expect(next).not.toBeNull();
    expect(next!.player.stats.level).toBe(2);
    expect(next!.player.stats.hp).toBeGreaterThanOrEqual(next!.player.stats.maxHp);
    expect(next!.player.stats.xp).toBeGreaterThanOrEqual(xpThresholdForLevel(2));
    expect(next!.player.stats.xpBoostTurns).toBe(STAR_XP_TURNS - 1);
    expect(next!.logs.some(line => line.text === `🌟 +50% XP for ${STAR_XP_TURNS} turns.`)).toBe(true);
    expect(next!.player.bank.map(item => item.id)).toEqual(['keep']);
    expect(next!.logs.some(line => line.text.includes('Level 2'))).toBe(true);
  });

  it('overheals a Bank Pill and pays the Bank Boat its gold', () => {
    const pill = soul({ id: 'pill', emoji: '💊', name: 'Pill' });
    const pillUse = use(pill, { hp: 4, maxHp: 20 });
    expect(pillUse.next!.player.stats.hp).toBe(22);
    expect(pillUse.next!.player.bank.some(item => item.id === 'pill')).toBe(false);
    expect(pillUse.next!.logs.some(line => line.text.includes('overheal'))).toBe(true);

    const boat = soul({ id: 'boat', emoji: '⛵', name: 'Boat' });
    const boatUse = use(boat, { gold: 10, luck: 0, moodValue: 0 });
    expect(boatUse.next!.player.stats.gold).toBe(60);
    expect(boatUse.next!.player.stats.moodValue).toBeGreaterThan(0);
    expect(boatUse.next!.player.bank.some(item => item.id === 'boat')).toBe(false);
    expect(boatUse.next!.logs.some(line => line.text.includes('+50g'))).toBe(true);
  });

  it('still grants a normal soul bonus, and spends one stack', () => {
    const fire = soul({
      id: 'fire', emoji: '🔥', name: 'Fire', stackCount: 2,
      bagPassive: { description: 'ignite', burningOnHit: true },
    });
    const { next } = use(fire, { attack: 1 });
    expect(next!.player.stats.attack).toBe(4);
    expect(next!.player.bank.find(item => item.id === 'fire')?.stackCount).toBe(1);
    expect(next!.logs.some(line => line.text.includes('Flames ignite'))).toBe(true);
  });

  it('zaps from the Bank when a foe is visible, and keeps Lightning when none is', () => {
    const bolt = soul({ id: 'zap', emoji: '⚡', name: 'Lightning' });
    const goblin: Enemy = {
      id: 'g1', pos: { x: 4, y: 2 }, emoji: '👺', name: 'Goblin',
      hp: 5, maxHp: 5, attack: 1, defense: 0, speed: 1, engaged: true,
    };
    const hit = use(bolt, {}, [goblin]);
    expect(hit.next!.enemies).toHaveLength(0);
    expect(hit.next!.player.bank.some(item => item.id === 'zap')).toBe(false);
    expect(hit.next!.logs.some(line => line.text.includes('ZAP!'))).toBe(true);

    const logs: string[] = [];
    const missed = consumeBankItem(state([bolt, keep]), bolt.id, {
      addLog: text => logs.push(text),
      applyMonkeyDropOnKill: (_killed, p) => p,
    });
    expect(missed).toBeNull();
    expect(logs.some(line => line.includes('No visible enemies'))).toBe(true);
  });

  it('does not eat food that cannot heal', () => {
    const apple = soul({ id: 'apple', emoji: '🍎', name: 'Apple', healAmount: 4 });
    const logs: string[] = [];
    const next = consumeBankItem(state([apple, keep], { hp: 10, maxHp: 10 }), apple.id, {
      addLog: text => logs.push(text),
      applyMonkeyDropOnKill: (_killed, p) => p,
    });
    expect(next).toBeNull();
    expect(logs).toContain('Already at full HP.');
  });
});
