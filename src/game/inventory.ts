import { Player, EmojiItem } from './types';
import type { BagPassiveSummary } from './types';
import { STACKABLE_BAG_CAPS, isStackableBagPassive } from './passives';

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
  const newInv = [...inv];
  const newBank = [...bank];
  const nonStackableBanked: EmojiItem[] = [];
  const duplicateActiveBanked: EmojiItem[] = [];
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
      const bagCount = newInv.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment).length;
      if (bagCount >= 9) { newBank.push({ ...item, stackCount: addCount }); continue; }
      if (addCount > cap) {
        newInv.push({ ...item, stackCount: cap });
        newBank.push({ ...item, id: `${item.id}-overflow`, stackCount: addCount - cap });
        continue;
      }
      newInv.push({ ...item, stackCount: addCount });
      continue;
    }
    const bagCount = newInv.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment).length;
    if (item.healAmount !== undefined || item.ammoAmount !== undefined || bagCount < 9) {
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
  const items = inv.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment);
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
  return item.healAmount === undefined && item.ammoAmount === undefined && !item.isEquipment;
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

export function refillBagFromBank(inventory: EmojiItem[], bank: EmojiItem[]): { inventory: EmojiItem[]; bank: EmojiItem[] } {
  if (bank.length === 0) return { inventory, bank };

  // First pass: try to merge any stackable at the front of the bank
  const [frontItem, ...rest] = bank;
  if (isStackableBagPassive(frontItem)) {
    const cap = STACKABLE_BAG_CAPS[frontItem.emoji] ?? 9;
    const existingIdx = inventory.findIndex(i => i.emoji === frontItem.emoji && isStackableBagPassive(i) && (i.stackCount ?? 1) < cap);
    if (existingIdx !== -1) {
      const newInv = inventory.map((it, i) => i === existingIdx ? { ...it, stackCount: (it.stackCount ?? 1) + 1 } : it);
      return { inventory: newInv, bank: rest };
    }
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

export function computeBagPassives(inventory: EmojiItem[]): BagPassiveSummary {
  const acc = {
    attack: 0, defense: 0, speed: 0, evasion: 0, luck: 0,
    losBonus: 0, stealthBonus: 0, stealthPenalty: 0,
    canSwim: false, burningOnHit: false, freezeAura: false, advantageDice: false,
    vampiricStrike: 0, lightningBolt: false, thorns: 0, bonusLoot: 0,
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
    if (p.lightningBolt)  acc.lightningBolt  = true;
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

export function applyEquipmentAndPassives(player: Player): Player {
  const passives = computeBagPassives(player.inventory);
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
    ...player,
    stats: {
      ...player.stats,
      attack:  player.stats.attack  + passives.attack  + eqAtk + buffAtk,
      defense: player.stats.defense + passives.defense + eqDef + buffDef,
      speed:   player.stats.speed   + passives.speed   + eqSpd,
      evasion: player.stats.evasion + passives.evasion + eqEva,
      luck:    player.stats.luck    + passives.luck    + eqLck,
    },
  };
}

