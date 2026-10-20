import type { GameState } from './types';
import { pressureForRun } from './progression';

const STORAGE_KEY = "emojirl_scores";
const MAX_SCORES = 5;

export interface LeaderboardEntry {
  characterClass: string;
  className: string;
  floor: number;
  level: number;
  xp: number;
  timestamp: number;
  maxPressure?: number;
  /** True when the run ended by winning on D:27. */
  won?: boolean;
}

export function leaderboardEntryFromRun(state: GameState, className: string, timestamp: number): LeaderboardEntry {
  return {
    characterClass: state.player.characterClass,
    className,
    floor: state.currentFloor,
    level: state.player.stats.level,
    xp: state.player.stats.xp,
    timestamp,
    maxPressure: pressureForRun(state.currentFloor, state.deepDive).atk,
    won: state.victory === true,
  };
}

export function saveScore(entry: LeaderboardEntry): void {
  const all = getScores();
  all.push(entry);
  all.sort((a, b) => b.floor - a.floor || Number(!!b.won) - Number(!!a.won) || b.xp - a.xp);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_SCORES)));
}

export function getScores(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LeaderboardEntry[];
  } catch {
    return [];
  }
}

export function clearScores(): void {
  localStorage.removeItem(STORAGE_KEY);
}
