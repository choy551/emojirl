import { CHARACTER_CLASSES } from './classes';
import { isPrestigeUnlocked, isVoidUnlocked, loadMeta } from './meta';
import {
  BASE_CLASSES,
  CLASS_SELECT_ORDER,
  PRESTIGE_OF,
  VOID,
  VOID_UNLOCK_HINT,
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
