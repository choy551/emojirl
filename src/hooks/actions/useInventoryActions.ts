import { useCallback } from 'react';
import { EquipSlot } from '../../game/types';
import {
  addToPlayerBag, activeKindLabel, sortBagSlots, buildHotbarSlots,
  isNonStackableBagPassiveDuplicate, isActiveKindDuplicate, runEnemyTurns, applyEnemyTurns,
  applyBankToHotbarSlot, divertStoredHeals,
} from '../../game/gameHelpers';
import type { GameSetters, AddLog, ApplyMonkeyDropOnKill } from './types';
import { _flashSignals, tryDualGunsFanfare, PEACEMAKERS_LOG } from '../../game/flashSignals';
import { canEquipInSlot, equipRestrictionReason } from '../../components/itemUtils';
import { settleHandEquip } from '../../game/weaponCombo';
import { hotbarCapFor } from '../../game/voidDamage';
import { consumeBankItem, surveyBankedBlueprint } from '../../game/shopUse';

export function useInventoryActions(
  setters: GameSetters,
  addLog: AddLog,
  applyMonkeyDropOnKill: ApplyMonkeyDropOnKill,
) {
  const { setGameState } = setters;

  const handleBankMove = useCallback((sourceId: string, dest: string | number | 'bank') => {
    setGameState(prev => {
      if (!prev) return prev;
      const inv  = [...prev.player.inventory];
      const bank = [...prev.player.bank];

      const srcInvIdx  = inv.findIndex(i => i.id === sourceId);
      const srcBankIdx = bank.findIndex(i => i.id === sourceId);

      if (dest === 'bank') {
        if (srcInvIdx !== -1) {
          const [item] = inv.splice(srcInvIdx, 1);
          bank.push(item);
        }
      } else if (typeof dest === 'number') {
        const draft = { ...prev.player, inventory: inv, bank };
        const cells = buildHotbarSlots(draft);
        const dstCell = cells[dest] ?? null;
        if (dstCell?.isVoidGhost) return prev;
        const bagItems = sortBagSlots(inv);
        const cap = hotbarCapFor(draft);
        if (srcInvIdx !== -1) {
          const srcBagIdx = bagItems.findIndex(i => i.id === sourceId);
          const srcActualIdx = inv.findIndex(i => i.id === sourceId);
          if (srcBagIdx !== -1 && srcActualIdx !== -1 && (!dstCell || dstCell.id !== sourceId)) {
            if (dstCell && !dstCell.isVoidGhost) {
              const dstActualIdx = inv.findIndex(i => i.id === dstCell.id);
              if (dstActualIdx !== -1) {
                [inv[srcActualIdx], inv[dstActualIdx]] = [inv[dstActualIdx], inv[srcActualIdx]];
              }
            } else if (!dstCell && bagItems.length < cap) {
              const [item] = inv.splice(srcActualIdx, 1);
              inv.push(item);
            }
          }
        } else if (srcBankIdx !== -1) {
          const next = applyBankToHotbarSlot(prev.player, sourceId, dest);
          if (next === prev.player) return prev;
          const parked = divertStoredHeals(next.inventory, next.bank, next.food ?? []);
          return { ...prev, player: { ...next, ...parked } };
        }
      } else {
        const dstInvIdx  = inv.findIndex(i => i.id === dest);
        const dstBankIdx = bank.findIndex(i => i.id === dest);
        const srcItem = srcInvIdx !== -1 ? inv[srcInvIdx] : srcBankIdx !== -1 ? bank[srcBankIdx] : null;
        const dstItem = dstInvIdx !== -1 ? inv[dstInvIdx] : dstBankIdx !== -1 ? bank[dstBankIdx] : null;
        if (!srcItem || !dstItem) return prev;
        if (srcBankIdx !== -1 && dstInvIdx !== -1 && (isNonStackableBagPassiveDuplicate(srcItem, inv) || isActiveKindDuplicate(srcItem, inv))) {
          return prev; // prevent introducing duplicate non-stackable/active via bank->hotbar swap
        }
        if (srcInvIdx !== -1 && dstInvIdx !== -1) { inv[srcInvIdx] = dstItem; inv[dstInvIdx] = srcItem; }
        else if (srcBankIdx !== -1 && dstBankIdx !== -1) { bank[srcBankIdx] = dstItem; bank[dstBankIdx] = srcItem; }
        else if (srcInvIdx !== -1 && dstBankIdx !== -1) { inv[srcInvIdx] = dstItem; bank[dstBankIdx] = srcItem; }
        else if (srcBankIdx !== -1 && dstInvIdx !== -1) { bank[srcBankIdx] = dstItem; inv[dstInvIdx] = srcItem; }
      }

      const parked = divertStoredHeals(inv, bank, prev.player.food ?? []);
      return { ...prev, player: { ...prev.player, inventory: parked.inventory, bank: parked.bank, food: parked.food } };
    });
  }, [setGameState]);

  const handleConsumeBankItem = useCallback((itemId: string) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const item = prev.player.bank.find(i => i.id === itemId);
      if (!item || item.consumed || item.isEquipment) return prev;

      if (item.isStructure) {
        const surveyed = surveyBankedBlueprint(prev.player, itemId);
        if (!surveyed) {
          addLog(`${item.emoji} The plan is blank.`);
          return prev;
        }
        if (!surveyed.consumed) _flashSignals.spellEchoFlashPending = true;
        const entries = [...surveyed.logs].reverse().map(text => ({ id: Math.random().toString(), text, turn: prev.turn }));
        let logs = [...entries, ...prev.logs].slice(0, 24);
        if (surveyed.notice) {
          logs = [{ id: `city-full-${prev.turn}-${itemId}`, text: surveyed.notice, turn: prev.turn }, ...logs].slice(0, 24);
        }
        const mid = { ...prev, player: surveyed.player, logs, turn: prev.turn + 1 };
        return applyEnemyTurns(mid, runEnemyTurns(mid));
      }

      return consumeBankItem(prev, itemId, { addLog, applyMonkeyDropOnKill }) ?? prev;
    });
  }, [addLog, applyMonkeyDropOnKill, setGameState]);

  const handleEquip = useCallback((itemId: string, slot: EquipSlot) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const { player } = prev;
      const invIdx  = player.inventory.findIndex(i => i.id === itemId);
      const bankIdx = player.bank.findIndex(i => i.id === itemId);
      const item = invIdx >= 0 ? player.inventory[invIdx] : bankIdx >= 0 ? player.bank[bankIdx] : null;
      if (!item || !item.isEquipment) return prev;
      const cls = player.characterClass;
      if (!canEquipInSlot(item, cls, slot)) {
        addLog(equipRestrictionReason(item, cls, slot));
        return prev;
      }

      const settled = settleHandEquip(player.equipment, item, slot);
      let newInv = [...player.inventory];
      let newBank = [...player.bank];
      if (settled.stow.length > 0) {
        const parked = addToPlayerBag({ ...player, inventory: newInv, bank: newBank }, ...settled.stow);
        newInv = parked.inventory;
        newBank = parked.bank;
      }
      const currentEquipped = settled.equipment[slot];
      if (currentEquipped) {
        const result = addToPlayerBag({ ...player, inventory: newInv, bank: newBank }, currentEquipped);
        newInv = result.inventory; newBank = result.bank;
        result.nonStackableBanked.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
        result.duplicateActiveBanked.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
      }
      if (invIdx >= 0) newInv = newInv.filter(i => i.id !== itemId);
      else newBank = newBank.filter(i => i.id !== itemId);

      const bonusStr = Object.entries(item.equipBonus ?? {}).filter(([,v]) => (v ?? 0) !== 0).map(([k, v]) => `${(v ?? 0) > 0 ? '+' : ''}${v}${k.substring(0,3).toUpperCase()}`).join(' ');
      addLog(`${item.emoji} ${item.name} equipped${bonusStr ? ` (${bonusStr})` : ''}.`);
      const newEquipment = { ...settled.equipment, [slot]: item };
      const fan = tryDualGunsFanfare({
        characterClass: cls,
        prevEquipment: player.equipment,
        nextEquipment: newEquipment,
        alreadyDone: prev.dualGunsFanfareDone,
      });
      if (fan.fired) addLog(PEACEMAKERS_LOG);
      const logs = settled.log
        ? [{ id: `ammo-clash-${prev.turn}-${item.id}`, text: settled.log, turn: prev.turn }, ...prev.logs].slice(0, 24)
        : prev.logs;
      return {
        ...prev,
        ...(fan.done ? { dualGunsFanfareDone: true } : {}),
        logs,
        player: { ...player, inventory: newInv, bank: newBank, equipment: newEquipment },
      };
    });
  }, [addLog, setGameState]);

  const handleUnequip = useCallback((slot: EquipSlot) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const { player } = prev;
      const item = player.equipment[slot];
      if (!item) return prev;
      const { inventory, bank, nonStackableBanked: _nsbU, duplicateActiveBanked: _dabU } = addToPlayerBag(player, item);
      _nsbU.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
      _dabU.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
      const newEquipment = { ...player.equipment };
      delete newEquipment[slot];
      addLog(`${item.emoji} ${item.name} unequipped.`);
      return { ...prev, player: { ...player, inventory, bank, equipment: newEquipment } };
    });
  }, [addLog, setGameState]);

  return { handleBankMove, handleConsumeBankItem, handleEquip, handleUnequip };
}
