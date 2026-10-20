import { describe, it, expect } from 'vitest';
import type { Enemy, GameState, Player } from './types';
import {
  ARENA_CENTER, ARENA_OUTER_RADIUS, ARENA_PIT_RADIUS, arenaZone, generateFinaleArena, generateMap,
} from './mapgen';
import {
  BOSSRUSH_GRACE_TURNS, BOSSRUSH_MAX_WAVE, FINALE_DIVE_PROMPT, FINALE_FLOOR, FINALE_WIN_PROMPT,
  SPECTATOR_FAUNA, SPECTATOR_PEOPLE, bossrushWaveComposition, buildFinaleFloor, claimFinaleWin,
  isBossrushCombatant, spawnSpectators, tickBossrush, waveBeginLog,
} from './finale';
import { pressureForRun, getDungeonPressure } from './progression';
import { leaderboardEntryFromRun } from './leaderboard';
import { descendFloor } from './descend';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import { resolveProjectileFlight } from './projectiles';
import { resolveContextAction } from './contextAction';

function playerAt(x: number, y: number): Player {
  return {
    pos: { x, y },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 4, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0, mana: 4, maxMana: 4,
    },
    inventory: [{
      id: 'soul', emoji: '🍀', name: 'Clover', description: 'luck',
      consumed: false, bagPassive: { description: 'lucky' },
    }],
    bank: [],
    equipment: {},
  };
}

function bareState(over: Partial<GameState> = {}): GameState {
  const arena = generateFinaleArena();
  return {
    schemaVersion: 1,
    player: playerAt(arena.startPos.x, arena.startPos.y),
    currentFloor: FINALE_FLOOR,
    map: arena.map,
    enemies: [],
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
    bossrush: { wave: 1, graceTurns: 0, revealed: false, stairs: arena.stairsPos },
    ...over,
  };
}

describe('D:27 arena', () => {
  const arena = generateFinaleArena();

  it('is a fixed circle, not a procedural dungeon', () => {
    const again = generateFinaleArena();
    expect(again.startPos).toEqual(arena.startPos);
    expect(again.stairsPos).toEqual(arena.stairsPos);
    expect(again.seats.length).toBe(arena.seats.length);
    const viaGenerate = generateMap(FINALE_FLOOR);
    expect(viaGenerate.startPos).toEqual(arena.startPos);
    expect(viaGenerate.map.some(row => row.some(t => t.type === 'stairs'))).toBe(false);
    expect(viaGenerate.map.flat().some(t => t.type === 'shop-item' || t.type === 'water' || t.type === 'lava')).toBe(false);
  });

  it('puts the player at the south end and the hidden stairway at the north', () => {
    expect(arena.startPos.y).toBeGreaterThan(ARENA_CENTER.y);
    expect(arena.stairsPos.y).toBeLessThan(ARENA_CENTER.y);
    expect(arena.startPos.x).toBe(ARENA_CENTER.x);
    expect(arena.stairsPos.x).toBe(ARENA_CENTER.x);
    expect(arenaZone(arena.startPos.x, arena.startPos.y)).toBe('pit');
    expect(arenaZone(arena.stairsPos.x, arena.stairsPos.y)).toBe('pit');
    expect(arena.map[arena.stairsPos.y][arena.stairsPos.x].type).toBe('boss-floor');
  });

  it('fills concentric seating rings and keeps the pit enclosed', () => {
    const rings = new Set(arena.seats.map(s => Math.round(Math.hypot(s.x - ARENA_CENTER.x, s.y - ARENA_CENTER.y))));
    expect(rings.size).toBeGreaterThanOrEqual(3);
    for (const seat of arena.seats) {
      const d = Math.hypot(seat.x - ARENA_CENTER.x, seat.y - ARENA_CENTER.y);
      expect(d).toBeGreaterThan(ARENA_PIT_RADIUS);
      expect(d).toBeLessThanOrEqual(ARENA_OUTER_RADIUS);
      expect(arena.map[seat.y][seat.x].type).toBe('floor');
    }
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const pit of arena.pitTiles) {
      for (const [dx, dy] of dirs) {
        const n = arena.map[pit.y + dy]?.[pit.x + dx];
        expect(n).toBeTruthy();
        expect(n!.type === 'wall').toBe(false);
      }
    }
    expect(arena.pitTiles.length).toBeGreaterThanOrEqual(18);
  });
});

describe('spectators', () => {
  it('seats people and neutral fauna, and nothing else', () => {
    let i = 0;
    const seq = [0, 0, 0.99, 0];
    const rng = () => seq[i++ % seq.length];
    const arena = generateFinaleArena();
    const crowd = spawnSpectators(arena.seats, rng);
    expect(crowd).toHaveLength(arena.seats.length);
    const emojis = new Set(crowd.map(s => s.emoji));
    expect([...emojis].some(e => SPECTATOR_FAUNA.includes(e))).toBe(true);
    expect([...emojis].some(e => SPECTATOR_PEOPLE.includes(e))).toBe(true);
    for (const s of crowd) {
      expect(s.isSpectator).toBe(true);
      expect(s.tag).toBe('Neutral');
      expect(s.attack).toBe(0);
      expect(s.xp).toBe(0);
      expect(isBossrushCombatant(s)).toBe(false);
    }
    const keys = new Set(crowd.map(s => `${s.pos.x},${s.pos.y}`));
    expect(keys.size).toBe(crowd.length);
  });

  it('does not move or attack', () => {
    const arena = generateFinaleArena();
    const spectator = spawnSpectators([arena.seats[0]])[0];
    const player = playerAt(spectator.pos.x + 1, spectator.pos.y);
    const state = bareState({
      player,
      map: arena.map.map(row => row.map(t => ({ ...t, type: t.type === 'wall' ? t.type : 'floor' as const, emoji: '⬜' }))),
      enemies: [{ ...spectator, pos: { x: spectator.pos.x, y: spectator.pos.y } }],
    });
    // Put them in a open  corridor-sized patch so a normal enemy would step.
    state.map[player.pos.y][player.pos.x] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    state.map[spectator.pos.y][spectator.pos.x] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    const next = applyEnemyTurns(state, runEnemyTurns(state));
    const still = next.enemies.find(e => e.id === spectator.id);
    expect(still?.pos).toEqual(spectator.pos);
    expect(still?.hp).toBe(spectator.hp);
    expect(next.player.stats.hp).toBe(player.stats.hp);
  });
});

describe('boss rush', () => {
  it('doubles bosses and echoes up to the cap', () => {
    expect(BOSSRUSH_MAX_WAVE).toBe(5);
    expect(BOSSRUSH_GRACE_TURNS).toBe(5);
    expect(bossrushWaveComposition(1)).toEqual({ bosses: 1, echoes: 0 });
    expect(bossrushWaveComposition(2)).toEqual({ bosses: 1, echoes: 1 });
    expect(bossrushWaveComposition(3)).toEqual({ bosses: 2, echoes: 2 });
    expect(bossrushWaveComposition(4)).toEqual({ bosses: 4, echoes: 4 });
    expect(bossrushWaveComposition(5)).toEqual({ bosses: 8, echoes: 8 });
    expect(bossrushWaveComposition(6)).toEqual({ bosses: 16, echoes: 16 });
  });

  it('opens D:27 with spectators, one boss, and no stairway', () => {
    const floor = buildFinaleFloor(FINALE_FLOOR, 0, false, () => 0.5);
    const bosses = floor.enemies.filter(e => e.isBoss);
    const echoes = floor.enemies.filter(e => e.isEcho);
    const crowd = floor.enemies.filter(e => e.isSpectator);
    expect(bosses).toHaveLength(1);
    expect(echoes).toHaveLength(0);
    expect(crowd).toHaveLength(floor.seats.length);
    expect(floor.map.some(row => row.some(t => t.type === 'stairs'))).toBe(false);
    const occupied = new Set(floor.enemies.map(e => `${e.pos.x},${e.pos.y}`));
    expect(occupied.has(`${floor.startPos.x},${floor.startPos.y}`)).toBe(false);
    expect(occupied.has(`${floor.stairsPos.x},${floor.stairsPos.y}`)).toBe(false);
  });

  it('counts down five turns between waves, then spawns the next doubled wave', () => {
    let state = bareState();
    state = tickBossrush(state);
    expect(state.bossrush?.graceTurns).toBe(5);
    expect(state.logs[0].text).toBe('🏟️ Wave 1 cleared. Next wave in 5 turns.');
    for (const n of [4, 3, 2, 1]) {
      state = tickBossrush(state);
      expect(state.bossrush?.graceTurns).toBe(n);
      expect(state.logs[0].text).toBe(`🏟️ Next wave in ${n}...`);
      expect(state.enemies.filter(isBossrushCombatant)).toHaveLength(0);
    }
    state = tickBossrush(state);
    expect(state.bossrush?.wave).toBe(2);
    expect(state.bossrush?.graceTurns).toBe(0);
    expect(state.enemies.filter(e => e.isBoss)).toHaveLength(1);
    expect(state.enemies.filter(e => e.isEcho)).toHaveLength(1);
    expect(state.logs[0].text).toBe(waveBeginLog(2));
  });

  it('does not advance while the current wave is still alive', () => {
    const boss: Enemy = {
      id: 'b', pos: { x: 24, y: 13 }, emoji: '🐉', name: 'Dragon',
      hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 1, engaged: true, isBoss: true,
    };
    const state = bareState({ enemies: [boss] });
    const next = tickBossrush(state);
    expect(next.bossrush?.wave).toBe(1);
    expect(next.bossrush?.graceTurns).toBe(0);
    expect(next.enemies).toHaveLength(1);
  });

  it('reveals the north stairway only after the final wave', () => {
    const state = bareState({
      bossrush: {
        wave: BOSSRUSH_MAX_WAVE,
        graceTurns: 0,
        revealed: false,
        stairs: generateFinaleArena().stairsPos,
      },
    });
    const next = tickBossrush(state);
    expect(next.bossrush?.revealed).toBe(true);
    const stairs = next.bossrush!.stairs;
    expect(next.map[stairs.y][stairs.x].type).toBe('stairs');
    expect(next.map[stairs.y][stairs.x].emoji).toBe('🕳️');
    expect(next.map[stairs.y][stairs.x].seen).toBe(true);
    expect(next.enemies.filter(isBossrushCombatant)).toHaveLength(0);
    expect(next.logs[0].text).toContain('🕳️');
  });
});

describe('finale prompts and pressure', () => {
  it('uses the exact win and dive questions', () => {
    expect(FINALE_WIN_PROMPT).toBe('Do you want to Win the Game?');
    expect(FINALE_DIVE_PROMPT).toBe('Do you want to dive even deeper into the Dungeon for greater glory (and much greater danger)?');
  });

  it('records a win on D:27', () => {
    const won = claimFinaleWin(bareState({ currentFloor: FINALE_FLOOR }));
    expect(won.victory).toBe(true);
    expect(won.gameOver).toBe(true);
    expect(won.currentFloor).toBe(27);
    const entry = leaderboardEntryFromRun(won, 'Wizard', 1);
    expect(entry.won).toBe(true);
    expect(entry.floor).toBe(27);
    expect(entry.maxPressure).toBe(getDungeonPressure(27).atk);
  });

  it('doubles each deeper floor independently', () => {
    expect(pressureForRun(27, true)).toEqual(getDungeonPressure(27));
    expect(pressureForRun(28, false)).toEqual(getDungeonPressure(28));
    expect(pressureForRun(28, true)).toEqual({
      atk: getDungeonPressure(28).atk * 2,
      def: getDungeonPressure(28).def * 2,
    });
    expect(pressureForRun(29, true)).toEqual({
      atk: getDungeonPressure(29).atk * 2,
      def: getDungeonPressure(29).def * 2,
    });
    expect(pressureForRun(29, true).atk).not.toBe(pressureForRun(28, true).atk * 2);
    expect(pressureForRun(28, true)).toEqual({ atk: 78, def: 52 });
    expect(pressureForRun(29, true)).toEqual({ atk: 84, def: 56 });
  });

  it('labels the D:27 stair context action for both layouts', () => {
    const arena = generateFinaleArena();
    const state = bareState();
    state.map[arena.stairsPos.y][arena.stairsPos.x] = { type: 'stairs', emoji: '🕳️', seen: true, visible: true };
    state.player = playerAt(arena.stairsPos.x, arena.stairsPos.y + 1);
    expect(resolveContextAction(state).label).toBe('Stairs');
    state.currentFloor = 28;
    state.deepDive = true;
    expect(resolveContextAction(state).label).toBe('Descend');
  });
});

describe('descending into the finale', () => {
  it('builds the arena instead of a procedural floor', () => {
    const logs: string[] = [];
    const prev = bareState({
      currentFloor: 26,
      bossrush: undefined,
      map: [[
        { type: 'floor', emoji: '⬜', seen: true, visible: true },
        { type: 'stairs', emoji: '🕳️', seen: true, visible: true },
      ]],
      player: playerAt(0, 0),
    });
    const next = descendFloor(prev, text => logs.push(text));
    expect(next.currentFloor).toBe(27);
    expect(next.bossrush?.wave).toBe(1);
    expect(next.bossrush?.revealed).toBe(false);
    expect(next.map.some(row => row.some(t => t.type === 'stairs'))).toBe(false);
    expect(next.enemies.filter(e => e.isSpectator).length).toBeGreaterThan(10);
    expect(next.enemies.filter(e => e.isBoss)).toHaveLength(1);
    expect(next.player.pos.y).toBeGreaterThan(next.bossrush!.stairs.y);
    expect(logs.some(l => l.includes('final arena'))).toBe(true);
    expect(logs.some(l => l.includes('Wave 1 begins'))).toBe(true);
  });

  it('a shot into the crowd stops and does not grant a kill', () => {
    const floor = { type: 'floor' as const, emoji: '⬜', seen: true, visible: true };
    const map = [Array.from({ length: 6 }, () => ({ ...floor }))];
    const spectator = spawnSpectators([{ x: 2, y: 0 }])[0];
    const player = playerAt(0, 0);
    const res = resolveProjectileFlight(
      { id: 'p', kind: 'gun', pos: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, phase: 'outgoing', maxRange: 4, traveled: 0 },
      map,
      [spectator],
      player,
      3,
    );
    expect(res.enemies[0].hp).toBe(spectator.hp);
    expect(res.logs.some(l => l.text.includes('crowd'))).toBe(true);
  });
});
