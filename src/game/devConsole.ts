import type { GameState, Position } from './types';
import { EMOJI_POWERS } from './emojis';
import { addToPlayerBag, playerBagPassives } from './inventory';
import { autoexploreOccupiedKeys } from './autoexplore';
import { bfsStepToward } from './pathfinding';
import { PLAYER_PASSABLE_TILES } from './tiles';
import { classFlies } from './prestige';
import { chebyshev } from './geo';
import { withVisibility } from './vision';

export const QUIT_CONFIRM_TEXT = 'Are you sure you want to Quit without Saving?';
export const CHEAT_CONFIRM_TEXT = 'This will invalidate the run for high scores. Continue?';

export const DEV_CONSOLE_HELP = [
  '/help — list console commands',
  '/quit — end the run without saving and record a death',
  '/stuck — if you cannot reach the downstairs, teleport to a tile that can',
  '/impulse101 — one of every hotbar emoji (invalidates high scores)',
  '/877cashnow — gain 877 gold (invalidates high scores)',
];

export type DevConfirmKind = 'quit' | 'impulse101' | 'cash';

export type ParsedDevCommand =
  | { kind: 'quit' | 'stuck' | 'help' | 'impulse101' | 'cash' }
  | { kind: 'unknown' };

/**
 * Enter already confirms the bag, Blink Strike, Unmake, shop tiles, and dialogs.
 * The console may open only when none of those consumers are active.
 * Dialogs take Enter in the capture phase before the game handler runs.
 */
export interface DevConsoleEnterBlockers {
  bagOpen: boolean;
  blinkTarget: boolean;
  unmakeTarget: boolean;
  interactTile: boolean;
  logOpen: boolean;
  menuOpen: boolean;
  directionPick: boolean;
  consoleOpen: boolean;
  gameOver: boolean;
}

export function isConsoleOpenKey(e: { key: string; code: string }): boolean {
  return e.key === 'Enter' || e.code === 'NumpadEnter';
}

export function devConsoleOpensOnEnter(blockers: DevConsoleEnterBlockers): boolean {
  return !(
    blockers.bagOpen
    || blockers.blinkTarget
    || blockers.unmakeTarget
    || blockers.interactTile
    || blockers.logOpen
    || blockers.menuOpen
    || blockers.directionPick
    || blockers.consoleOpen
    || blockers.gameOver
  );
}

/** Shop, slot shrine, ammo cache, and restaurant already use Enter to open. */
export function standingOnInteractTile(tile: { type: string; emoji: string } | undefined): boolean {
  if (!tile) return false;
  if (tile.type === 'slot-shrine' || tile.type === 'restaurant') return true;
  return tile.type === 'shop-item' && (tile.emoji === '🏪' || tile.emoji === '📦');
}

export function parseDevCommand(raw: string): ParsedDevCommand {
  const token = raw.trim().toLowerCase();
  if (token === '/quit') return { kind: 'quit' };
  if (token === '/stuck') return { kind: 'stuck' };
  if (token === '/help') return { kind: 'help' };
  if (token === '/impulse101') return { kind: 'impulse101' };
  if (token === '/877cashnow') return { kind: 'cash' };
  return { kind: 'unknown' };
}

/** Missing or false stays eligible. Only an explicit cheat confirmation excludes the run. */
export function scoreCountsForLeaderboard(state: Pick<GameState, 'scoreInvalid'>): boolean {
  return state.scoreInvalid !== true;
}

export function appendDevLogs(state: GameState, lines: string[]): GameState {
  const stamped = [...lines].reverse().map((text, i) => ({
    id: `dev-${state.turn}-${i}-${text.length}`,
    text,
    turn: state.turn,
  }));
  return { ...state, logs: [...stamped, ...state.logs].slice(0, 24) };
}

/** End the run. The game-over path records a death and clears the save. Does not invalidate high scores. */
export function applyQuit(state: GameState): GameState {
  if (state.gameOver) return state;
  return appendDevLogs({
    ...state,
    gameOver: true,
    victory: false,
    killer: { name: 'Quit', emoji: '💀' },
  }, ['You quit without saving.']);
}

function firstStairs(map: GameState['map']): Position | null {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[0].length; x++) {
      if (map[y][x].type === 'stairs') return { x, y };
    }
  }
  return null;
}

/** Same passable set autoexplore uses when it paths to the downstairs. */
export function stuckPassable(state: GameState): Set<string> {
  const passable = new Set<string>([...PLAYER_PASSABLE_TILES, 'stairs']);
  const swim = playerBagPassives(state.player).canSwim || classFlies(state.player.characterClass);
  if (swim) passable.add('water');
  return passable;
}

/** Enemies, bars, and beds — the occupied set autoexplore uses for the stairs route. */
export function stuckOccupied(state: GameState): Set<string> {
  const occupied = autoexploreOccupiedKeys(state.enemies);
  for (let y = 0; y < state.map.length; y++) {
    for (let x = 0; x < state.map[0].length; x++) {
      const tile = state.map[y][x];
      if ((tile.type === 'shop-item' && tile.emoji === '🍺') || tile.type === 'bed') {
        occupied.add(`${x},${y}`);
      }
    }
  }
  return occupied;
}

function canReachStairs(
  map: GameState['map'],
  from: Position,
  stairs: Position,
  occupied: Set<string>,
  passable: Set<string>,
): boolean {
  if (from.x === stairs.x && from.y === stairs.y) return true;
  return bfsStepToward(map, from, stairs, occupied, passable) !== null;
}

/**
 * Nearest passable tile from which autoexplore's stairs route succeeds.
 * Null when the player can already reach the downstairs, or when no downstairs exists.
 */
export function stuckRescueTile(state: GameState): Position | null | 'no-stairs' | 'already' {
  const stairs = firstStairs(state.map);
  if (!stairs) return 'no-stairs';
  const occupied = stuckOccupied(state);
  const passable = stuckPassable(state);
  if (canReachStairs(state.map, state.player.pos, stairs, occupied, passable)) return 'already';
  let best: Position | null = null;
  let bestDist = Infinity;
  for (let y = 0; y < state.map.length; y++) {
    for (let x = 0; x < state.map[0].length; x++) {
      if (!passable.has(state.map[y][x].type)) continue;
      const key = `${x},${y}`;
      if (occupied.has(key)) continue;
      const pos = { x, y };
      if (!canReachStairs(state.map, pos, stairs, occupied, passable)) continue;
      const dist = chebyshev(state.player.pos, pos);
      const closer = dist < bestDist
        || (best !== null && dist === bestDist && (y < best.y || (y === best.y && x < best.x)));
      if (best === null || closer) {
        best = pos;
        bestDist = dist;
      }
    }
  }
  return best;
}

export function applyStuck(state: GameState): GameState {
  const rescue = stuckRescueTile(state);
  if (rescue === 'no-stairs') return appendDevLogs(state, ['No downstairs on this floor.']);
  if (rescue === 'already') return appendDevLogs(state, ['You can already reach the downstairs.']);
  if (!rescue) return appendDevLogs(state, ['No open tile can reach the downstairs.']);
  const moved: GameState = {
    ...state,
    player: { ...state.player, pos: rescue },
  };
  return appendDevLogs(withVisibility(moved), ['Teleported to a tile that can reach the downstairs.']);
}

export function applyConfirmedCheat(state: GameState, kind: 'impulse101' | 'cash'): GameState {
  const flagged: GameState = { ...state, scoreInvalid: true };
  if (kind === 'cash') {
    const player = {
      ...flagged.player,
      stats: { ...flagged.player.stats, gold: flagged.player.stats.gold + 877 },
    };
    return appendDevLogs(
      { ...flagged, player },
      ['This run will not be recorded on the high score log. +877 gold.'],
    );
  }
  const items = EMOJI_POWERS.map((power, i) => ({
    id: `impulse-${i}`,
    emoji: power.emoji,
    name: power.name,
    description: power.description,
    consumed: false,
    bagPassive: power.bagPassive,
  }));
  const added = addToPlayerBag(flagged.player, ...items);
  const player = { ...flagged.player, inventory: added.inventory, bank: added.bank };
  return appendDevLogs(
    { ...flagged, player },
    ['This run will not be recorded on the high score log. One of every hotbar emoji granted.'],
  );
}
