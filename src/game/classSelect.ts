import { CHARACTER_CLASSES } from './classes';
import { isPrestigeUnlocked, isVoidUnlocked, loadMeta } from './meta';
import {
  BASE_CLASSES,
  CLASS_SELECT_ORDER,
  COWBOY,
  FENCER,
  GENIE,
  HITMAN,
  NINJA,
  PRESTIGE_OF,
  RANGER,
  ROYAL_GUARD,
  VOID,
  VOID_UNLOCK_HINT,
  WIZARD,
} from './prestigeConstants';

const BASE = new Set<string>(BASE_CLASSES);

export function prestigeUnlockHint(baseEmoji: string): string {
  const name = CHARACTER_CLASSES[baseEmoji]?.name ?? 'that class';
  return `Win D:27 as ${baseEmoji} ${name} to unlock`;
}

export function unlockHintFor(emoji: string): string | null {
  if (BASE.has(emoji)) return null;
  if (emoji === VOID) return VOID_UNLOCK_HINT;
  for (const [base, prestige] of Object.entries(PRESTIGE_OF)) {
    if (prestige === emoji) return prestigeUnlockHint(base);
  }
  return null;
}

export function isClassUnlocked(emoji: string): boolean {
  if (BASE.has(emoji)) return true;
  if (emoji === VOID) return isVoidUnlocked();
  return isPrestigeUnlocked(emoji, loadMeta());
}

export interface VesselChoice {
  /** Vessel that should stay saved. Unchanged when the click was on a lock. */
  selected: string;
  /** True when the click should show the unlock tooltip and must not start a run. */
  showHint: boolean;
  hint: string | null;
}

/** Locked classes stay visible. Choosing one does not change the saved vessel. */
export function resolveVesselChoice(current: string, emoji: string): VesselChoice {
  if (!isClassUnlocked(emoji)) {
    return { selected: current, showHint: true, hint: unlockHintFor(emoji) };
  }
  return { selected: emoji, showHint: false, hint: null };
}

export function classSelectEntries(): { emoji: string; name: string; unlocked: boolean; hint: string | null }[] {
  return CLASS_SELECT_ORDER.map((emoji) => ({
    emoji,
    name: CHARACTER_CLASSES[emoji]?.name ?? emoji,
    unlocked: isClassUnlocked(emoji),
    hint: isClassUnlocked(emoji) ? null : unlockHintFor(emoji),
  }));
}

export type VesselGridRow = 1 | 2 | 'both';

export interface VesselGridCell {
  emoji: string;
  /** 1–4 are base/prestige pairs. 5 is The Void. */
  column: 1 | 2 | 3 | 4 | 5;
  /** `both` spans the two rows and is centered in that column. */
  row: VesselGridRow;
}

/**
 * Five columns: each base class sits above its prestige class.
 * Wizard, Cowboy, Ninja, Ranger, then The Void beside both rows.
 */
const VESSEL_GRID: readonly VesselGridCell[] = [
  { emoji: WIZARD, column: 1, row: 1 },
  { emoji: GENIE, column: 1, row: 2 },
  { emoji: COWBOY, column: 2, row: 1 },
  { emoji: HITMAN, column: 2, row: 2 },
  { emoji: NINJA, column: 3, row: 1 },
  { emoji: FENCER, column: 3, row: 2 },
  { emoji: RANGER, column: 4, row: 1 },
  { emoji: ROYAL_GUARD, column: 4, row: 2 },
  { emoji: VOID, column: 5, row: 'both' },
];

export function vesselGridCells(): VesselGridCell[] {
  return VESSEL_GRID.map((cell) => ({ ...cell }));
}
