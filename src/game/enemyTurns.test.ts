import { describe, it, expect } from 'vitest';
import type { Enemy, GameState, MapGrid, Player, Tile } from './types';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import { COMPANION_BOUNTY_OOC_TURNS, COMPANION_BOUNTY_REFRESH_LOG } from './progression';

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: true, visible: true };
}

function corridorMap(): MapGrid {
  const map: MapGrid = Array.from({ length: 3 }, (_, y) =>
    Array.from({ length: 7 }, (_, x) =>
      y === 1 && x >= 1 && x <= 5 ? tile('floor', '⬜') : tile('wall', '⬛'),
    ),
  );
  map[1][2] = tile('door-closed', '🚪');
  return map;
}

function playerAt(x: number, y: number): Player {
  return {
    pos: { x, y },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [{
      id: 'soul', emoji: '🍀', name: 'Clover', description: 'luck',
      consumed: false, bagPassive: { description: 'lucky' },
    }],
    bank: [],
    equipment: {},
  };
}

function foe(over: Partial<Enemy> & Pick<Enemy, 'emoji' | 'name'>): Enemy {
  return {
    id: 'e1',
    pos: { x: 1, y: 1 },
    hp: 8,
    maxHp: 8,
    attack: 1,
    defense: 0,
    speed: 4,
    engaged: true,
    huntTurns: 5,
    ...over,
  };
}

function base(enemies: Enemy[]): GameState {
  return {
    schemaVersion: 1,
    player: playerAt(5, 1),
    currentFloor: 1,
    map: corridorMap(),
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

describe('humanoid enemies open doors', () => {
  it('a zombie opens a closed door and steps through', () => {
    const state = base([foe({ emoji: '🧟', name: 'Zombie' })]);
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.map[1][2].type).toBe('door-open');
    expect(next.map[1][2].emoji).toBe('🔓');
    expect(next.enemies[0].pos).toEqual({ x: 2, y: 1 });
    expect(next.logs.some(l => l.text.includes('opens the door'))).toBe(true);
  });

  it('a snake stays blocked and leaves the door closed', () => {
    const state = base([foe({ emoji: '🐍', name: 'Snake' })]);
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.map[1][2].type).toBe('door-closed');
    expect(next.map[1][2].emoji).toBe('🚪');
    expect(next.enemies[0].pos).toEqual({ x: 1, y: 1 });
  });

  it('a recruited adventurer can open doors; a recruited bear cannot', () => {
    const adventurer = foe({
      emoji: '🧙', name: 'Wandering Mage', tag: 'Friendly', isAdventurer: true, isRecruited: true,
    });
    const opened = applyEnemyTurns(base([adventurer]), runEnemyTurns(base([adventurer])));
    expect(opened.map[1][2].type).toBe('door-open');
    expect(opened.enemies[0].pos).toEqual({ x: 2, y: 1 });

    const bear = foe({
      emoji: '🐻', name: 'Bear', tag: 'Friendly', bear: true, isRecruited: true,
    });
    const blocked = applyEnemyTurns(base([bear]), runEnemyTurns(base([bear])));
    expect(blocked.map[1][2].type).toBe('door-closed');
    expect(blocked.enemies[0].pos).toEqual({ x: 1, y: 1 });
  });
});

describe('flying movement', () => {
  function liquidGap(kind: 'water' | 'lava'): MapGrid {
    const map: MapGrid = Array.from({ length: 3 }, (_, y) =>
      Array.from({ length: 6 }, (_, x) =>
        y === 1 && x >= 1 && x <= 4 ? tile('floor', '⬜') : tile('wall', '⬛'),
      ),
    );
    map[1][2] = tile(kind, kind === 'water' ? '🟦' : '🟧');
    return map;
  }

  it('a crow crosses water and lava toward the player', () => {
    for (const kind of ['water', 'lava'] as const) {
      const state = {
        ...base([foe({ emoji: '🐦‍⬛', name: 'Crow', crow: true, flying: true })]),
        map: liquidGap(kind),
        player: playerAt(4, 1),
      };
      const next = applyEnemyTurns(state, runEnemyTurns(state));
      expect(next.enemies[0].pos).toEqual({ x: 2, y: 1 });
    }
  });

  it('a snake stays on the near side of water and lava', () => {
    for (const kind of ['water', 'lava'] as const) {
      const state = {
        ...base([foe({ emoji: '🐍', name: 'Snake' })]),
        map: liquidGap(kind),
        player: playerAt(4, 1),
      };
      const next = applyEnemyTurns(state, runEnemyTurns(state));
      expect(next.enemies[0].pos).toEqual({ x: 1, y: 1 });
    }
  });

  it('a ghost still opens doors', () => {
    const state = base([foe({ emoji: '👻', name: 'Ghost', ghostly: true, flying: true })]);
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.map[1][2].type).toBe('door-open');
    expect(next.enemies[0].pos).toEqual({ x: 2, y: 1 });
  });
});

describe('companion kill XP and bounty', () => {
  function openFloor(): MapGrid {
    return Array.from({ length: 6 }, () =>
      Array.from({ length: 6 }, () => tile('floor', '⬜')),
    );
  }

  function killAtTally(tally: number, extra: Partial<GameState> = {}): GameState {
    const companion = foe({
      id: 'c1', emoji: '🥷', name: 'Lost Ninja', tag: 'Friendly',
      isAdventurer: true, isRecruited: true, pos: { x: 2, y: 2 },
      attack: 8, hp: 12, maxHp: 12, xp: 0, level: 1,
    });
    const goblin = foe({
      id: 'g1', emoji: '👺', name: 'Goblin', tag: 'Hostile',
      pos: { x: 2, y: 3 }, hp: 1, maxHp: 1, engaged: true, attack: 1,
    });
    const state: GameState = {
      ...base([companion, goblin]),
      map: openFloor(),
      player: { ...playerAt(1, 1), stats: { ...playerAt(1, 1).stats, xp: 0, level: 1 } },
      companionKillTally: tally,
      ...extra,
    };
    return applyEnemyTurns(state, runEnemyTurns(state));
  }

  it('grants full XP to the companion and 50% to the player', () => {
    const next = killAtTally(0);
    expect(next.enemies.some(e => e.id === 'g1')).toBe(false);
    const c = next.enemies.find(e => e.id === 'c1')!;
    expect(c.xp).toBe(5);
    expect(next.player.stats.xp).toBe(3);
    expect(next.companionKillTally).toBe(1);
    expect(next.logs.filter(l => l.text.includes('Companion killed')).map(l => l.text))
      .toEqual(['🥷 Companion killed 👺']);
    expect(next.logs.some(l => l.text.includes('takes down'))).toBe(false);
    expect(next.logs.some(l => l.text.includes('%'))).toBe(false);
    expect(next.logs.some(l => l.text.includes('reached level 2'))).toBe(true);
  });

  it('puts the new XP share on the kill line when the tier drops, and nowhere else', () => {
    const next = killAtTally(4);
    expect(next.companionKillTally).toBe(5);
    expect(next.player.stats.xp).toBe(3);
    expect(next.logs.filter(l => l.text.includes('Companion killed')).map(l => l.text))
      .toEqual(['🥷 Companion killed 👺 (40% XP)']);
    expect(next.logs.filter(l => l.text.includes('40%'))).toHaveLength(1);
    expect(next.logs.some(l => l.text.startsWith('Companion bounty'))).toBe(false);
  });

  it.each([
    [9, 30],
    [14, 20],
    [19, 10],
  ] as const)('tally %i drops the share to %i% inside that one kill line', (tally, pct) => {
    const next = killAtTally(tally);
    expect(next.logs.filter(l => l.text.includes('Companion killed')).map(l => l.text))
      .toEqual([`🥷 Companion killed 👺 (${pct}% XP)`]);
    expect(next.logs.filter(l => l.text.includes(`${pct}%`))).toHaveLength(1);
  });

  it('does not repeat the share on later kills in the same tier, including the 10% floor', () => {
    for (const tally of [5, 6, 20, 24]) {
      const next = killAtTally(tally);
      expect(next.logs.filter(l => l.text.includes('Companion killed')).map(l => l.text))
        .toEqual(['🥷 Companion killed 👺']);
    }
  });

  it('logs 🐕 Companion killed 🐀 and does not log a hit that fails to kill', () => {
    const dog = foe({
      id: 'c1', emoji: '🐕', name: 'Dog', tag: 'Friendly',
      isAdventurer: true, isRecruited: true, pos: { x: 2, y: 2 },
      attack: 8, hp: 12, maxHp: 12, xp: 0, level: 1,
    });
    const rat = foe({
      id: 'r1', emoji: '🐀', name: 'Rat', tag: 'Hostile',
      pos: { x: 2, y: 3 }, hp: 1, maxHp: 1, engaged: true, attack: 1,
    });
    const killedState = {
      ...base([dog, rat]), map: openFloor(), player: playerAt(1, 1), companionKillTally: 0,
    };
    const killed = applyEnemyTurns(killedState, runEnemyTurns(killedState));
    expect(killed.logs.some(l => l.text === '🐕 Companion killed 🐀')).toBe(true);

    const tough = foe({
      id: 'r2', emoji: '🐀', name: 'Rat', tag: 'Hostile',
      pos: { x: 2, y: 3 }, hp: 30, maxHp: 30, engaged: true, attack: 1,
    });
    const grazer = foe({
      id: 'c2', emoji: '🐕', name: 'Dog', tag: 'Friendly',
      isAdventurer: true, isRecruited: true, pos: { x: 2, y: 2 },
      attack: 8, hp: 12, maxHp: 12, xp: 0, level: 1,
    });
    const grazedState = { ...base([grazer, tough]), map: openFloor(), player: playerAt(1, 1) };
    const grazed = applyEnemyTurns(grazedState, runEnemyTurns(grazedState));
    expect(grazed.enemies.some(e => e.id === 'r2')).toBe(true);
    expect(grazed.logs.some(l => l.text.includes('Companion killed'))).toBe(false);
    expect(grazed.companionKillTally ?? 0).toBe(0);
  });

  it('announces a share change once when two companions kill on the same turn', () => {
    const dog = foe({
      id: 'c1', emoji: '🐕', name: 'Dog', tag: 'Friendly',
      isAdventurer: true, isRecruited: true, pos: { x: 2, y: 2 },
      attack: 8, hp: 12, maxHp: 12, xp: 40, level: 3,
    });
    const ninja = foe({
      id: 'c2', emoji: '🥷', name: 'Lost Ninja', tag: 'Friendly',
      isAdventurer: true, isRecruited: true, pos: { x: 4, y: 4 },
      attack: 8, hp: 12, maxHp: 12, xp: 40, level: 3,
    });
    const rat = foe({
      id: 'r1', emoji: '🐀', name: 'Rat', tag: 'Hostile',
      pos: { x: 2, y: 3 }, hp: 1, maxHp: 1, engaged: true, attack: 1,
    });
    const goblin = foe({
      id: 'g1', emoji: '👺', name: 'Goblin', tag: 'Hostile',
      pos: { x: 4, y: 3 }, hp: 1, maxHp: 1, engaged: true, attack: 1,
    });
    const state = {
      ...base([dog, ninja, rat, goblin]),
      map: openFloor(),
      player: playerAt(1, 1),
      companionKillTally: 3,
    };
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    expect(next.companionKillTally).toBe(5);
    expect(next.logs.filter(l => l.text.includes('Companion killed')).map(l => l.text)).toEqual([
      '🐕 Companion killed 🐀',
      '🥷 Companion killed 👺 (40% XP)',
    ]);
    expect(next.logs.filter(l => l.text.includes('%'))).toHaveLength(1);
  });

  it('logs one reset to 50% after 20 out-of-combat turns and does not repeat it', () => {
    let state: GameState = {
      ...base([]),
      map: openFloor(),
      player: playerAt(1, 1),
      companionKillTally: 12,
      companionBountyOocTurns: 0,
    };
    for (let i = 0; i < COMPANION_BOUNTY_OOC_TURNS - 1; i++) {
      state = { ...state, turn: state.turn + 1 };
      state = applyEnemyTurns(state, runEnemyTurns(state));
      expect(state.companionKillTally).toBe(12);
      expect(state.logs.some(l => l.text === COMPANION_BOUNTY_REFRESH_LOG)).toBe(false);
    }
    state = { ...state, turn: state.turn + 1 };
    state = applyEnemyTurns(state, runEnemyTurns(state));
    expect(state.companionKillTally).toBe(0);
    expect(state.companionBountyOocTurns).toBe(0);
    expect(state.logs.filter(l => l.text === COMPANION_BOUNTY_REFRESH_LOG)).toHaveLength(1);

    for (let i = 0; i < 5; i++) {
      state = { ...state, turn: state.turn + 1 };
      state = applyEnemyTurns(state, runEnemyTurns(state));
    }
    expect(state.logs.filter(l => l.text === COMPANION_BOUNTY_REFRESH_LOG)).toHaveLength(1);
  });

  it('does not log a reset when the share is already 50% or a hostile is still engaged', () => {
    let calm: GameState = {
      ...base([]),
      map: openFloor(),
      player: playerAt(1, 1),
      companionKillTally: 0,
      companionBountyOocTurns: 0,
    };
    for (let i = 0; i < COMPANION_BOUNTY_OOC_TURNS; i++) {
      calm = { ...calm, turn: calm.turn + 1 };
      calm = applyEnemyTurns(calm, runEnemyTurns(calm));
    }
    expect(calm.logs.some(l => l.text === COMPANION_BOUNTY_REFRESH_LOG)).toBe(false);

    const goblin = foe({
      id: 'g1', emoji: '👺', name: 'Goblin', tag: 'Hostile',
      pos: { x: 4, y: 4 }, engaged: true, paralyzedTurns: 40,
    });
    let fighting: GameState = {
      ...base([goblin]),
      map: openFloor(),
      player: playerAt(1, 1),
      companionKillTally: 12,
      companionBountyOocTurns: 19,
    };
    for (let i = 0; i < COMPANION_BOUNTY_OOC_TURNS; i++) {
      fighting = { ...fighting, turn: fighting.turn + 1 };
      fighting = applyEnemyTurns(fighting, runEnemyTurns(fighting));
    }
    expect(fighting.companionKillTally).toBe(12);
    expect(fighting.companionBountyOocTurns).toBe(0);
    expect(fighting.logs.some(l => l.text === COMPANION_BOUNTY_REFRESH_LOG)).toBe(false);
  });

  it('a companion kill spends the out-of-combat count without logging a reset', () => {
    const next = killAtTally(4, { companionBountyOocTurns: 19 });
    expect(next.companionKillTally).toBe(5);
    expect(next.companionBountyOocTurns).toBe(0);
    expect(next.logs.some(l => l.text === '🥷 Companion killed 👺 (40% XP)')).toBe(true);
    expect(next.logs.some(l => l.text === COMPANION_BOUNTY_REFRESH_LOG)).toBe(false);
  });
});
