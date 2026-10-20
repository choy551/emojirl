import type { Enemy, GameState, Position } from './types';
import { FINALE_FLOOR, BOSSRUSH_MAX_WAVE, BOSSRUSH_GRACE_TURNS } from './finaleConstants';
import { recordPrestigeWin } from './meta';
import { getClassDef } from './classes';
import { pressureForRun } from './progression';
import { generateFinaleArena, type FinaleArena } from './mapgen';
import { makeBossrushFighter } from './spawning';

export { FINALE_FLOOR, BOSSRUSH_MAX_WAVE, BOSSRUSH_GRACE_TURNS } from './finaleConstants';

export const FINALE_WIN_PROMPT = 'Do you want to Win the Game?';
export const FINALE_DIVE_PROMPT = 'Do you want to dive even deeper into the Dungeon for greater glory (and much greater danger)?';

export type FinalePrompt = 'win' | 'dive';

/** People in the stands. */
export const SPECTATOR_PEOPLE = [
  '🥷', '👷‍♀️', '👩‍🌾', '👩‍🍳', '👩‍🔬', '👩‍🎨', '🧙‍♀️', '🧝‍♀️', '🤠',
  '🤴', '👸', '🧑‍🎤', '🦸', '🦹', '💂', '🕵️', '👮', '🧑‍🚀', '💃', '🕺',
  '👷', '👨‍🌾', '👨‍🍳', '🧑‍🔬', '👨‍🎨', '🧙‍♂️', '🧝‍♂️', '🧛', '🙋', '🙆',
];

/** Neutral fauna sharing the seats. They are crowd, not monsters. */
export const SPECTATOR_FAUNA = [
  '🐻', '🐦‍⬛', '🦊', '🐗', '🐒', '🐺', '🦉', '🦌', '🐇', '🦝', '🐧', '🐸', '🐢', '🐿️',
];

const FAUNA_CHANCE = 0.42;

export function bossrushWaveComposition(wave: number): { bosses: number; echoes: number } {
  if (wave <= 1) return { bosses: 1, echoes: 0 };
  const n = 2 ** (wave - 2);
  return { bosses: n, echoes: n };
}

export function waveBeginLog(wave: number): string {
  const { bosses, echoes } = bossrushWaveComposition(wave);
  if (wave <= 1 || echoes === 0) return '🏟️ Wave 1 begins! A boss enters the ring.';
  const bossWord = bosses === 1 ? 'boss' : 'bosses';
  const echoWord = echoes === 1 ? 'echo' : 'echoes';
  return `🏟️ Wave ${wave} begins! ${bosses} ${bossWord} and ${echoes} ${echoWord} enter the ring.`;
}

export function isBossrushCombatant(e: { isBoss?: boolean; isEcho?: boolean; isSpectator?: boolean; hp: number }): boolean {
  return e.hp > 0 && !e.isSpectator && (!!e.isBoss || !!e.isEcho);
}

export function shouldPromptFinaleStairs(state: { currentFloor: number; deepDive?: boolean }): boolean {
  return state.currentFloor === FINALE_FLOOR && !state.deepDive;
}

export function spectatorBumpText(emoji: string): string {
  return `${emoji} The crowd blocks the way. They're only here to watch.`;
}

function pushLog(state: GameState, text: string): GameState {
  return {
    ...state,
    logs: [{ id: `finale-${state.turn}-${Math.random()}`, text, turn: state.turn }, ...state.logs].slice(0, 24),
  };
}

export function spawnSpectators(seats: Position[], rng: () => number = Math.random): Enemy[] {
  return seats.map((pos, i) => {
    const fauna = rng() < FAUNA_CHANCE;
    const pool = fauna ? SPECTATOR_FAUNA : SPECTATOR_PEOPLE;
    const emoji = pool[Math.floor(rng() * pool.length)] ?? pool[0];
    return {
      id: `spectator-${i}`,
      pos,
      emoji,
      name: 'Spectator',
      hp: 1,
      maxHp: 1,
      attack: 0,
      defense: 0,
      speed: 0,
      engaged: false,
      tag: 'Neutral' as const,
      isSpectator: true,
      xp: 0,
    };
  });
}

export function spawnBossrushWave(opts: {
  floor: number;
  wave: number;
  difficultyTier: number;
  pressure: { atk: number; def: number };
  tiles: Position[];
  rng?: () => number;
}): Enemy[] {
  const rng = opts.rng ?? Math.random;
  const { bosses, echoes } = bossrushWaveComposition(opts.wave);
  const tiles = [...opts.tiles];
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = tiles[i];
    tiles[i] = tiles[j];
    tiles[j] = swap;
  }
  const fighters: Enemy[] = [];
  const place = (kind: 'boss' | 'echo', n: number) => {
    for (let i = 0; i < n && tiles.length > 0; i++) {
      const pos = tiles.pop()!;
      const fighter = makeBossrushFighter(opts.floor, opts.difficultyTier, opts.pressure, kind, opts.wave * 10 + i);
      fighters.push({
        ...fighter,
        id: `bossrush-w${opts.wave}-${kind}-${i}-${Math.random()}`,
        pos,
        hp: fighter.hp,
        maxHp: fighter.hp,
        engaged: false,
      });
    }
  };
  place('boss', bosses);
  place('echo', echoes);
  return fighters;
}

function openPitTiles(state: GameState): Position[] {
  const stairs = state.bossrush?.stairs;
  const occupied = new Set(state.enemies.map(e => `${e.pos.x},${e.pos.y}`));
  occupied.add(`${state.player.pos.x},${state.player.pos.y}`);
  if (stairs) occupied.add(`${stairs.x},${stairs.y}`);
  const tiles: Position[] = [];
  for (let y = 0; y < state.map.length; y++) {
    for (let x = 0; x < state.map[0].length; x++) {
      if (state.map[y][x].type !== 'boss-floor') continue;
      if (occupied.has(`${x},${y}`)) continue;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

export function buildFinalePopulation(
  arena: FinaleArena,
  floor: number,
  difficultyTier: number,
  deepDive = false,
  rng: () => number = Math.random,
): { enemies: Enemy[]; bossrush: NonNullable<GameState['bossrush']> } {
  const blocked = new Set([`${arena.startPos.x},${arena.startPos.y}`, `${arena.stairsPos.x},${arena.stairsPos.y}`]);
  const pit = arena.pitTiles.filter(p => !blocked.has(`${p.x},${p.y}`));
  const spectators = spawnSpectators(arena.seats, rng);
  const wave = spawnBossrushWave({
    floor,
    wave: 1,
    difficultyTier,
    pressure: pressureForRun(floor, deepDive),
    tiles: pit,
    rng,
  });
  return {
    enemies: [...spectators, ...wave],
    bossrush: { wave: 1, graceTurns: 0, revealed: false, stairs: { ...arena.stairsPos } },
  };
}

export function buildFinaleFloor(
  floor: number,
  difficultyTier: number,
  deepDive = false,
  rng: () => number = Math.random,
): FinaleArena & { enemies: Enemy[]; bossrush: NonNullable<GameState['bossrush']> } {
  const arena = generateFinaleArena();
  const pop = buildFinalePopulation(arena, floor, difficultyTier, deepDive, rng);
  return { ...arena, ...pop };
}

function revealFinaleStairs(state: GameState): GameState {
  const rush = state.bossrush!;
  const map = state.map.map(row => row.map(t => ({ ...t })));
  const { x, y } = rush.stairs;
  if (map[y]?.[x]) {
    map[y][x] = { type: 'stairs', emoji: '🕳️', seen: true, visible: true };
  }
  return pushLog(
    { ...state, map, bossrush: { ...rush, revealed: true, graceTurns: 0 } },
    '🕳️ The crowd stills. A stairway opens at the north end of the arena!',
  );
}

/**
 * Advance the D:27 boss rush at the end of a turn.
 * A cleared wave waits BOSSRUSH_GRACE_TURNS, logging the countdown, then the next
 * wave spawns. Clearing the capped wave reveals the north stairway.
 */
export function tickBossrush(state: GameState, rng: () => number = Math.random): GameState {
  const rush = state.bossrush;
  if (!rush || rush.revealed || state.gameOver || state.currentFloor !== FINALE_FLOOR) return state;
  if (state.enemies.some(isBossrushCombatant)) return state;

  if (rush.wave >= BOSSRUSH_MAX_WAVE) return revealFinaleStairs(state);

  if (rush.graceTurns <= 0) {
    const grace = BOSSRUSH_GRACE_TURNS;
    return pushLog(
      { ...state, bossrush: { ...rush, graceTurns: grace } },
      `🏟️ Wave ${rush.wave} cleared. Next wave in ${grace} turns.`,
    );
  }

  const nextGrace = rush.graceTurns - 1;
  if (nextGrace > 0) {
    return pushLog(
      { ...state, bossrush: { ...rush, graceTurns: nextGrace } },
      `🏟️ Next wave in ${nextGrace}...`,
    );
  }

  const wave = rush.wave + 1;
  const spawned = spawnBossrushWave({
    floor: state.currentFloor,
    wave,
    difficultyTier: state.difficultyTier ?? 0,
    pressure: pressureForRun(state.currentFloor, state.deepDive),
    tiles: openPitTiles(state),
    rng,
  });
  return pushLog(
    {
      ...state,
      enemies: [...state.enemies, ...spawned],
      bossrush: { ...rush, wave, graceTurns: 0 },
    },
    waveBeginLog(wave),
  );
}

export function claimFinaleWin(state: GameState): GameState {
  const unlock = recordPrestigeWin(state.player.characterClass);
  const prestige = unlock.fresh && unlock.prestige ? getClassDef(unlock.prestige) : null;
  const text = prestige
    ? `🏆 You win the game on D:27! ${unlock.prestige} ${prestige.name} unlocked.`
    : '🏆 You win the game on D:27!';
  return pushLog(
    {
      ...state,
      currentFloor: FINALE_FLOOR,
      gameOver: true,
      victory: true,
    },
    text,
  );
}
