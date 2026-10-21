import { Player, EmojiItem, VoidGhost } from './types';
import type { BagPassiveSummary } from './types';
import { STACKABLE_BAG_CAPS, isStackableBagPassive } from './passives';
import { EMOJI_POWERS } from './emojis';
import { hotbarCapFor, padGhostHotbar, voidGhostCapacity } from './voidDamage';
import { drinkEvasionBonus } from './drinks';
import { resolveSoftCap, type SoftCapInput, type SoftCapResult } from './softCap';

export function isNonStackableBagPassiveDuplicate(item: EmojiItem, inv: EmojiItem[]): boolean {
  if (!item.bagPassive?.nonStackable) return false;
  return inv.some(i => !i.consumed && !i.isEquipment && i.emoji === item.emoji && !!i.bagPassive);
}

export function isActiveKindDuplicate(item: EmojiItem, inv: EmojiItem[]): boolean {
  if (!item.activeKind) return false;
  return inv.some(i => !i.consumed && i.emoji === item.emoji && i.activeKind);
}

export function addToBag(
  inv: EmojiItem[],
  bank: EmojiItem[],
  ...items: EmojiItem[]
): { inventory: EmojiItem[]; bank: EmojiItem[]; nonStackableBanked: EmojiItem[]; duplicateActiveBanked: EmojiItem[] } {
  return addItemsToBag(inv, bank, items, 9);
}

/** Same as addToBag, but the hotbar holds at most `hotbarCap` real souls (Void ghosts reserve the rest). */
export function addToBagCapped(
  inv: EmojiItem[],
  bank: EmojiItem[],
  hotbarCap: number,
  ...items: EmojiItem[]
): { inventory: EmojiItem[]; bank: EmojiItem[]; nonStackableBanked: EmojiItem[]; duplicateActiveBanked: EmojiItem[] } {
  return addItemsToBag(inv, bank, items, hotbarCap);
}

export function addToPlayerBag(
  player: Player,
  ...items: EmojiItem[]
): { inventory: EmojiItem[]; bank: EmojiItem[]; nonStackableBanked: EmojiItem[]; duplicateActiveBanked: EmojiItem[] } {
  return addItemsToBag(player.inventory, player.bank, items, hotbarCapFor(player));
}

function addItemsToBag(
  inv: EmojiItem[],
  bank: EmojiItem[],
  items: EmojiItem[],
  hotbarCap: number,
): { inventory: EmojiItem[]; bank: EmojiItem[]; nonStackableBanked: EmojiItem[]; duplicateActiveBanked: EmojiItem[] } {
  const newInv = [...inv];
  const newBank = [...bank];
  const nonStackableBanked: EmojiItem[] = [];
  const duplicateActiveBanked: EmojiItem[] = [];
  const cap = Math.max(0, hotbarCap);
  for (const item of items) {
    if (item.isEquipment) { newBank.push(item); continue; }
    if (item.bagPassive?.nonStackable) {
      if (isNonStackableBagPassiveDuplicate(item, newInv)) { newBank.push(item); nonStackableBanked.push(item); continue; }
    }
    if (item.activeKind) {
      if (isActiveKindDuplicate(item, newInv)) { newBank.push(item); duplicateActiveBanked.push(item); continue; }
    }
    if (isStackableBagPassive(item)) {
      const cap = STACKABLE_BAG_CAPS[item.emoji] ?? 9;
      const addCount = Math.max(1, item.stackCount ?? 1);
      const existingIdx = newInv.findIndex(i => i.emoji === item.emoji && isStackableBagPassive(i));
      if (existingIdx !== -1) {
        const existing = newInv[existingIdx];
        const cur = existing.stackCount ?? 1;
        const room = Math.max(0, cap - cur);
        if (room === 0) { newBank.push({ ...item, stackCount: addCount }); continue; }
        const toStack = Math.min(room, addCount);
        newInv[existingIdx] = { ...existing, stackCount: cur + toStack };
        if (addCount > toStack) {
          newBank.push({ ...item, id: `${item.id}-overflow`, stackCount: addCount - toStack });
        }
        continue;
      }
      const bagCount = newInv.filter(isHotbarBagItem).length;
      if (bagCount >= cap) { newBank.push({ ...item, stackCount: addCount }); continue; }
      if (addCount > cap) {
        newInv.push({ ...item, stackCount: cap });
        newBank.push({ ...item, id: `${item.id}-overflow`, stackCount: addCount - cap });
        continue;
      }
      newInv.push({ ...item, stackCount: addCount });
      continue;
    }
    const bagCount = newInv.filter(isHotbarBagItem).length;
    if (item.healAmount !== undefined || item.ammoAmount !== undefined || item.drinkTier !== undefined || bagCount < cap) {
      newInv.push(item);
    } else {
      newBank.push(item);
    }
  }
  return { inventory: newInv, bank: newBank, nonStackableBanked, duplicateActiveBanked };
}

export function activeKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    gun: 'Gun', boomerang: 'Boomerang', rope: 'Rope', bomb: 'Bomb', freeze: 'Freeze Ray',
  };
  return labels[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function sortBagSlots(inv: EmojiItem[]): EmojiItem[] {
  const items = inv.filter(isHotbarBagItem);
  return [...items].sort((a, b) => {
    const score = (i: EmojiItem) => {
      if (i.consumed) return 3;
      if (i.activeKind) return 0;
      if ((i as any).effect || i.bagPassive?.nonStackable) return 1;
      if (isStackableBagPassive(i)) return 2;
      return 1;
    };
    return score(a) - score(b);
  });
}

function isHotbarBagItem(item: EmojiItem): boolean {
  return item.healAmount === undefined && item.ammoAmount === undefined && item.drinkTier === undefined && !item.isEquipment;
}

function isEligibleBankPull(item: EmojiItem, inventory: EmojiItem[]): boolean {
  return !item.isEquipment &&
    !isNonStackableBagPassiveDuplicate(item, inventory) &&
    !isActiveKindDuplicate(item, inventory);
}

function wouldMergeIntoExistingStack(item: EmojiItem, inventory: EmojiItem[]): boolean {
  if (!isStackableBagPassive(item)) return false;
  const cap = STACKABLE_BAG_CAPS[item.emoji] ?? 9;
  return inventory.some(i => i.emoji === item.emoji && isStackableBagPassive(i) && (i.stackCount ?? 1) < cap);
}

/** Remove one copy of `emoji` from bank (decrement stackCount or drop the entry). */
export function takeOneMatchingFromBank(
  bank: EmojiItem[],
  emoji: string,
): { bank: EmojiItem[]; took: boolean } {
  const idx = bank.findIndex(i =>
    !i.consumed && !i.isEquipment && i.emoji === emoji && isStackableBagPassive(i)
  );
  if (idx === -1) return { bank, took: false };
  const it = bank[idx];
  const n = it.stackCount ?? 1;
  if (n > 1) {
    const next = [...bank];
    next[idx] = { ...it, stackCount: n - 1 };
    return { bank: next, took: true };
  }
  return { bank: [...bank.slice(0, idx), ...bank.slice(idx + 1)], took: true };
}

export function refillBagFromBank(inventory: EmojiItem[], bank: EmojiItem[]): { inventory: EmojiItem[]; bank: EmojiItem[] } {
  if (bank.length === 0) return { inventory, bank };

  // Merge one copy of a banked stackable into an existing under-cap hotbar stack.
  for (let bi = 0; bi < bank.length; bi++) {
    const frontItem = bank[bi];
    if (!isStackableBagPassive(frontItem) || frontItem.consumed || frontItem.isEquipment) continue;
    const cap = STACKABLE_BAG_CAPS[frontItem.emoji] ?? 9;
    const existingIdx = inventory.findIndex(i => i.emoji === frontItem.emoji && isStackableBagPassive(i) && (i.stackCount ?? 1) < cap);
    if (existingIdx === -1) continue;
    const newInv = inventory.map((it, i) => i === existingIdx ? { ...it, stackCount: (it.stackCount ?? 1) + 1 } : it);
    const n = frontItem.stackCount ?? 1;
    const newBank = n > 1
      ? bank.map((it, i) => i === bi ? { ...it, stackCount: n - 1 } : it)
      : [...bank.slice(0, bi), ...bank.slice(bi + 1)];
    return { inventory: newInv, bank: newBank };
  }

  // Find first *safe* non-equipment item in bank to pull into bag.
  // Skip duplicates of nonStackable bag passives or activeKind items (only one allowed in hotbar/inventory).
  const bagCount = inventory.filter(isHotbarBagItem).length;
  if (bagCount >= 9) return { inventory, bank };
  const pullIdx = bank.findIndex(i => isEligibleBankPull(i, inventory));
  if (pullIdx === -1) return { inventory, bank };
  const pulled = bank[pullIdx];
  const newBank = [...bank.slice(0, pullIdx), ...bank.slice(pullIdx + 1)];
  return { inventory: [...inventory, pulled], bank: newBank };
}

/** Consume an inventory item and refill from Bank without reshuffling 1–9 hotbar keys. */
export function removeAndRefillBag(
  inventory: EmojiItem[],
  bank: EmojiItem[],
  consumedId: string,
): { inventory: EmojiItem[]; bank: EmojiItem[] } {
  const idx = inventory.findIndex(i => i.id === consumedId);
  if (idx === -1) return refillBagFromBank(inventory, bank);

  const consumed = inventory[idx];
  const without = [...inventory.slice(0, idx), ...inventory.slice(idx + 1)];
  const keepSlot = isHotbarBagItem(consumed);

  if (keepSlot) {
    const preferIdx = bank.findIndex(i => i.emoji === consumed.emoji && isEligibleBankPull(i, without));
    const pullIdx = preferIdx !== -1
      ? preferIdx
      : bank.findIndex(i => isEligibleBankPull(i, without) && !wouldMergeIntoExistingStack(i, without));
    if (pullIdx !== -1) {
      const pulled = bank[pullIdx];
      const newInv = [...inventory];
      newInv[idx] = pulled;
      return {
        inventory: newInv,
        bank: [...bank.slice(0, pullIdx), ...bank.slice(pullIdx + 1)],
      };
    }
  }

  return refillBagFromBank(without, bank);
}

function ghostToDisplayItem(ghost: VoidGhost, dormant: boolean): EmojiItem {
  const power = EMOJI_POWERS.find(e => e.emoji === ghost.emoji);
  return {
    id: `void-ghost:${ghost.emoji}`,
    emoji: ghost.emoji,
    name: power?.name ?? 'Ghost',
    description: power?.description ?? 'A remembered soul.',
    consumed: false,
    bagPassive: power?.bagPassive,
    stackCount: Math.max(1, ghost.stacks),
    isVoidGhost: true,
    isVoidGhostDormant: dormant || undefined,
  };
}

/** 9-slot hotbar. Ghosts keep their indices; real souls fill the holes in sortBagSlots order. */
export function buildHotbarSlots(player: Player): (EmojiItem | null)[] {
  const ghosts = padGhostHotbar(player.ghostHotbar);
  const reals = sortBagSlots(player.inventory).filter(i => !i.isVoidGhost);
  const slots: (EmojiItem | null)[] = Array.from({ length: 9 }, () => null);
  if (player.characterClass === '👤') {
    let activeLeft = voidGhostCapacity(0, player.voidBossesCleared ?? 0);
    for (let i = 0; i < 9; i++) {
      const ghost = ghosts[i];
      if (!ghost) continue;
      const dormant = activeLeft <= 0;
      if (!dormant) activeLeft -= 1;
      slots[i] = ghostToDisplayItem(ghost, dormant);
    }
  }
  let r = 0;
  for (let i = 0; i < 9 && r < reals.length; i++) {
    if (slots[i] == null) slots[i] = reals[r++];
  }
  return slots;
}

/** Real hotbar items only — ghosts, equipment, and empty slots do not count. */
export function countVoidPressureSlots(player: Player): number {
  return buildHotbarSlots(player).filter(s => s && !s.isVoidGhost).length;
}

/** Inventory that actually contributes bag passives. Void ghosts in active slots are included. */
export function passiveInventory(player: Player): EmojiItem[] {
  if (player.characterClass !== '👤') return player.inventory;
  const cells = buildHotbarSlots(player);
  const slottedReals = cells.filter((s): s is EmojiItem => !!s && !s.isVoidGhost);
  const slottedIds = new Set(slottedReals.map(s => s.id));
  const kept = player.inventory.filter(i => {
    const hotbarSoul = i.healAmount === undefined && i.ammoAmount === undefined && i.drinkTier === undefined && !i.isEquipment && !i.isVoidGhost;
    if (!hotbarSoul) return true;
    return slottedIds.has(i.id);
  });
  const ghosts = cells.filter((s): s is EmojiItem => !!s?.isVoidGhost && !s.isVoidGhostDormant);
  return [...kept, ...ghosts];
}

export function playerBagPassives(player: Player): BagPassiveSummary {
  return computeBagPassives(passiveInventory(player));
}

/** If ghosts reserve hotbar slots, real souls past the remaining room go to the bank. */
export function parkVoidOverflow(player: Player): Player {
  if (player.characterClass !== '👤') return player;
  const room = hotbarCapFor(player);
  const reals = sortBagSlots(player.inventory).filter(i => !i.isVoidGhost);
  if (reals.length <= room) return player;
  const overflowIds = new Set(reals.slice(room).map(i => i.id));
  return {
    ...player,
    inventory: player.inventory.filter(i => !overflowIds.has(i.id)),
    bank: [...player.bank, ...reals.filter(i => overflowIds.has(i.id))],
  };
}

export function grantGhostStack(player: Player, emoji: string, stacks: number): Player {
  const hot = padGhostHotbar(player.ghostHotbar);
  const hi = hot.findIndex(g => g?.emoji === emoji);
  if (hi !== -1) {
    hot[hi] = { emoji, stacks };
    return { ...player, ghostHotbar: hot };
  }
  const bank = [...(player.ghostBank ?? [])];
  const bi = bank.findIndex(g => g.emoji === emoji);
  if (bi !== -1) {
    bank[bi] = { emoji, stacks };
    return { ...player, ghostHotbar: hot, ghostBank: bank };
  }
  const cells = buildHotbarSlots({ ...player, ghostHotbar: hot, ghostBank: bank });
  const empty = cells.findIndex(c => c == null);
  if (empty !== -1) {
    hot[empty] = { emoji, stacks };
    return { ...player, ghostHotbar: hot, ghostBank: bank };
  }
  bank.push({ emoji, stacks });
  return { ...player, ghostHotbar: hot, ghostBank: bank };
}

export function manifestPlayerGhost(player: Player, emoji: string): { player: Player; ok: boolean } {
  const bank = [...(player.ghostBank ?? [])];
  const bi = bank.findIndex(g => g.emoji === emoji);
  if (bi === -1) return { player, ok: false };
  const cells = buildHotbarSlots(player);
  const empty = cells.findIndex(c => c == null);
  if (empty === -1) return { player, ok: false };
  const hot = padGhostHotbar(player.ghostHotbar);
  hot[empty] = bank[bi];
  bank.splice(bi, 1);
  return { player: { ...player, ghostHotbar: hot, ghostBank: bank }, ok: true };
}

export function banishPlayerGhost(player: Player, slot: number): Player {
  const hot = padGhostHotbar(player.ghostHotbar);
  const ghost = hot[slot];
  if (!ghost) return player;
  hot[slot] = null;
  return { ...player, ghostHotbar: hot, ghostBank: [...(player.ghostBank ?? []), ghost] };
}

export function computeBagPassives(inventory: EmojiItem[]): BagPassiveSummary {
  const acc = {
    attack: 0, defense: 0, speed: 0, evasion: 0, luck: 0,
    losBonus: 0, stealthBonus: 0, stealthPenalty: 0,
    canSwim: false, burningOnHit: false, freezeAura: false, advantageDice: false,
    vampiricStrike: 0, lightningBolt: 0, thorns: 0, bonusLoot: 0,
    execBlow: false, trueVision: false, itemMagnet: false, shieldWall: 0,
    healOnKill: 0, trueAim: false, regeneration: 0, ninjaCombo: 0,
    royalAura: false, combatRegen: 0, dodgeHeal: 0,
  };
  for (const item of inventory) {
    if (item.consumed || item.isEquipment || !item.bagPassive || item.activeKind || item.healAmount != null || item.ammoAmount != null) continue;
    const p = item.bagPassive;
    acc.attack         += p.attackBonus    ?? 0;
    acc.defense        += p.defenseBonus   ?? 0;
    acc.speed          += p.speedBonus     ?? 0;
    acc.evasion        += p.evasionBonus   ?? 0;
    acc.luck           += p.luckBonus      ?? 0;
    acc.losBonus       += p.losBonus       ?? 0;
    acc.stealthBonus   += p.stealthBonus   ?? 0;
    acc.stealthPenalty += p.stealthPenalty ?? 0;
    const sc = isStackableBagPassive(item) ? (item.stackCount ?? 1) : 1;
    if (p.canSwim)        acc.canSwim        = true;
    if (p.burningOnHit)   acc.burningOnHit   = true;
    if (p.freezeAura)     acc.freezeAura     = true;
    if (p.advantageDice)  acc.advantageDice  = true;
    if (p.vampiricStrike) acc.vampiricStrike += sc;
    if (p.lightningBolt)  acc.lightningBolt += sc;
    if (p.thorns)         acc.thorns        += sc;
    if (p.bonusLoot)      acc.bonusLoot     += sc;
    if (p.execBlow)       acc.execBlow       = true;
    if (p.trueVision)     acc.trueVision     = true;
    if (p.itemMagnet)     acc.itemMagnet     = true;
    if (p.shieldWall)     acc.shieldWall    += sc;
    if (p.healOnKill)     acc.healOnKill    += sc;
    if (p.trueAim)        acc.trueAim        = true;
    if (p.regeneration)   acc.regeneration  += sc;
    if (p.ninjaCombo)     acc.ninjaCombo    += sc;
    if (p.royalAura)      acc.royalAura      = true;
    if (p.combatRegen)    acc.combatRegen   += sc;
    if (p.dodgeHeal)      acc.dodgeHeal     += sc;
  }
  return acc;
}

export function tickActiveBuffs(stats: import('./types').PlayerStats): import('./types').PlayerStats {
  if (!stats.activeBuffs?.length) return stats;
  const updated = stats.activeBuffs
    .map(b => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
    .filter(b => b.turnsLeft > 0);
  return { ...stats, activeBuffs: updated.length ? updated : undefined };
}

/** Gear, bag passives, buffs, and drink EVA — before overflow soft caps. */
export function rawCombatStats(player: Player): SoftCapInput {
  const passives = playerBagPassives(player);
  const eq = player.equipment;
  const slots = [eq.body, eq.mainHand, eq.offHand, eq.accessory].filter(Boolean) as EmojiItem[];
  let eqAtk = 0, eqDef = 0, eqSpd = 0, eqEva = 0, eqLck = 0;
  for (const item of slots) {
    const b = item.equipBonus ?? {};
    eqAtk += b.attack  ?? 0;
    eqDef += b.defense ?? 0;
    eqSpd += b.speed   ?? 0;
    eqEva += b.evasion ?? 0;
    eqLck += b.luck    ?? 0;
    if (player.characterClass === '🤠' && item.bagPassive && !item.weaponKind && !item.armorKind) {
      eqAtk += item.bagPassive.attackBonus  ?? 0;
      eqDef += item.bagPassive.defenseBonus ?? 0;
      eqSpd += item.bagPassive.speedBonus   ?? 0;
      eqEva += item.bagPassive.evasionBonus ?? 0;
      eqLck += item.bagPassive.luckBonus    ?? 0;
    }
  }
  const buffAtk = (player.stats.activeBuffs ?? []).filter(b => b.stat === 'attack').reduce((s, b) => s + b.amount, 0);
  const buffDef = (player.stats.activeBuffs ?? []).filter(b => b.stat === 'defense').reduce((s, b) => s + b.amount, 0);
  return {
    attack:  player.stats.attack  + passives.attack  + eqAtk + buffAtk,
    defense: player.stats.defense + passives.defense + eqDef + buffDef,
    speed:   player.stats.speed   + passives.speed   + eqSpd,
    evasion: player.stats.evasion + passives.evasion + eqEva + drinkEvasionBonus(player),
    luck:    player.stats.luck    + passives.luck    + eqLck,
    maxHp:   player.stats.maxHp,
  };
}

export function playerSoftCap(player: Player): SoftCapResult {
  return resolveSoftCap(rawCombatStats(player));
}

/** Hit-point pool after DEF overflow. Stored maxHp stays the base. */
export function livingMaxHp(player: Player): number {
  return playerSoftCap(player).maxHp;
}

export function applyEquipmentAndPassives(player: Player): Player {
  const raw = rawCombatStats(player);
  const caps = resolveSoftCap(raw);
  return {
    ...player,
    stats: {
      ...player.stats,
      attack:  caps.attack,
      defense: caps.defense,
      speed:   caps.speed,
      evasion: caps.evasion,
      // Raw luck: crit uses it (then the CRIT cap). The stats row shows the LCK cap.
      luck:    raw.luck,
      maxHp:   caps.maxHp,
    },
  };
}

