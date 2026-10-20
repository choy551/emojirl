import type { EmojiItem, GameState, Player } from './types';

export const VOID_DEATH_TEXT = 'The Void is un-manifested into Existence!';
export const VOID_UNLOCK_TEXT = '👤 The Void unlocked — death by emptiness taught you absence.';
export const GHOST_LINGER_TEXT = 'Ghosts linger — they cannot be spent.';

/** Base Void pressure for n "pressure units" on this floor. */
export function voidDamageFor(n: number, floor: number): number {
  if (n <= 0) return 0;
  // Normal emoji-less damage is floor when n is 1 pressure unit.
  return floor * n;
}

/** Void 👤 turn damage: shared curve plus a flat point per filled hotbar slot. */
export function voidClassTurnDamage(filledCount: number, floor: number): number {
  if (filledCount <= 0) return 0;
  return voidDamageFor(filledCount, floor) + filledCount;
}

/**
 * Active ghost slots. D:1–4 (0 depth bosses) → 1.
 * +1 after each D:5/10/15… boss, cap 9. `floor` is unused; bosses cleared is the source of truth.
 */
export function voidGhostCapacity(_floor: number, bossesClearedAt5k: number): number {
  return Math.min(9, 1 + Math.max(0, bossesClearedAt5k));
}

/** Hotbar spend that can unlock a ghost: a soul bag-passive, actually consumed. */
export function isVoidSoulSpend(item: EmojiItem): boolean {
  return !!item.bagPassive
    && !item.isVoidGhost
    && !item.consumed
    && !item.isEquipment
    && !item.activeKind
    && item.healAmount == null
    && item.ammoAmount == null;
}

export function padGhostHotbar(slots: Player['ghostHotbar']): (import('./types').VoidGhost | null)[] {
  const next: (import('./types').VoidGhost | null)[] = Array.from({ length: 9 }, () => null);
  if (!slots) return next;
  for (let i = 0; i < 9; i++) next[i] = slots[i] ?? null;
  return next;
}

export function occupiedGhosts(slots: Player['ghostHotbar']): number {
  if (!slots) return 0;
  let n = 0;
  for (let i = 0; i < 9 && i < slots.length; i++) if (slots[i]) n++;
  return n;
}

export function hotbarCapFor(player: Pick<Player, 'characterClass' | 'ghostHotbar'>): number {
  if (player.characterClass !== '👤') return 9;
  return Math.max(0, 9 - occupiedGhosts(player.ghostHotbar));
}

/** Credit one depth-boss kill (floor % 5 === 0) toward Hollow Roster. No-op otherwise. */
export function creditVoidBoss(state: GameState, enemy: { isBoss?: boolean; isEcho?: boolean }): GameState {
  if (state.player.characterClass !== '👤') return state;
  if (!enemy.isBoss || enemy.isEcho) return state;
  if (state.currentFloor % 5 !== 0) return state;
  const n = (state.voidBossesCleared ?? 0) + 1;
  const cap = voidGhostCapacity(state.currentFloor, n);
  return {
    ...state,
    voidBossesCleared: n,
    player: { ...state.player, voidBossesCleared: n },
    logs: [{
      id: `void-roster-${state.turn}-${n}`,
      text: `👤 Hollow Roster grows — ${cap} active ghosts.`,
      turn: state.turn,
    }, ...state.logs].slice(0, 24),
  };
}
