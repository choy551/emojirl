import type { Player } from './types';
import { buildHotbarSlots, healHp, livingMaxHp } from './inventory';
import { voidClassTurnDamage } from './voidDamage';

export interface VoidSlotBurdenRow {
  itemId: string | null;
  dealt: number;
}

/** Real hotbar occupants. Ghosts and empty slots are null and do not take pressure. */
export function hotbarPressureIds(player: Player): (string | null)[] {
  return buildHotbarSlots(player).map(slot => (slot && !slot.isVoidGhost ? slot.id : null));
}

/**
 * Keep each slot's total only while the same item still occupies it.
 * A different id, a ghost, or an empty cell starts that slot over at 0.
 */
export function syncVoidSlotBurden(player: Player): Player {
  if (player.characterClass !== '👤') return player;
  const ids = hotbarPressureIds(player);
  const prev = player.voidSlotBurden ?? [];
  const next: VoidSlotBurdenRow[] = ids.map((itemId, i) => {
    const row = prev[i];
    if (itemId && row && row.itemId === itemId) {
      return { itemId, dealt: Math.max(0, row.dealt) };
    }
    return { itemId, dealt: 0 };
  });
  return { ...player, voidSlotBurden: next };
}

/**
 * Add this turn's Void pressure onto the slots that actually dealt it.
 * Drink suppression ignores the earliest filled slots. Each remaining slot
 * takes an equal share of voidClassTurnDamage (floor + 1 on an integer floor).
 */
export function attributeVoidSlotPressure(player: Player, floor: number, ignoredSlots = 0): Player {
  if (player.characterClass !== '👤') return player;
  const synced = syncVoidSlotBurden(player);
  const rows = (synced.voidSlotBurden ?? []).map(row => ({ ...row }));
  const filled = rows.map((row, i) => (row.itemId ? i : -1)).filter(i => i >= 0);
  const ignore = Math.max(0, Math.floor(ignoredSlots));
  const dealing = filled.slice(ignore);
  if (dealing.length === 0) return { ...synced, voidSlotBurden: rows };
  const share = voidClassTurnDamage(dealing.length, floor) / dealing.length;
  for (const index of dealing) {
    rows[index] = { ...rows[index], dealt: rows[index].dealt + share };
  }
  return { ...synced, voidSlotBurden: rows };
}

export interface VoidSlotReclaim {
  player: Player;
  heal: number;
  log: string | null;
}

/**
 * Half the pressure this hotbar item's slot has dealt, rounded down.
 * The heal fills toward the living pool (base max HP plus DEF overflow) and never lowers HP.
 * Items that are not in a pressure slot reclaim nothing.
 */
export function reclaimVoidSlotPressure(player: Player, item: { id: string; emoji: string }): VoidSlotReclaim {
  if (player.characterClass !== '👤') return { player, heal: 0, log: null };
  const synced = syncVoidSlotBurden(player);
  const idx = hotbarPressureIds(synced).findIndex(id => id === item.id);
  if (idx < 0) return { player: synced, heal: 0, log: null };
  const dealt = synced.voidSlotBurden?.[idx]?.dealt ?? 0;
  const maxHp = livingMaxHp(synced);
  const raw = Math.min(maxHp, Math.floor(Math.max(0, dealt) / 2));
  const hp = healHp(synced.stats.hp, maxHp, raw);
  const heal = hp - synced.stats.hp;
  return {
    player: hp === synced.stats.hp ? synced : { ...synced, stats: { ...synced.stats, hp } },
    heal,
    log: heal > 0 ? `👤 Released ${item.emoji}, reclaimed ${heal} HP` : null,
  };
}

/** Zero the consumed item, then match the hotbar after it has left the slot. */
export function releaseVoidSlotBurden(player: Player, itemId: string): Player {
  if (player.characterClass !== '👤') return player;
  const rows = (player.voidSlotBurden ?? []).map(row =>
    row?.itemId === itemId ? { itemId: row.itemId, dealt: 0 } : row,
  );
  return syncVoidSlotBurden({ ...player, voidSlotBurden: rows });
}
