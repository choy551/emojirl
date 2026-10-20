import { useCallback } from 'react';
import { EquipSlot } from '../../game/types';
import { rollKillDrop } from '../../game/dropTable';
import { markEnemySeen, markEnemyKilled } from '../../game/discoveries';
import { isStackableBagPassive } from '../../game/passives';
import {
  moodMax, levelFromXP, addToPlayerBag, activeKindLabel, sortBagSlots, buildHotbarSlots, computeBagPassives,
  isNonStackableBagPassiveDuplicate, isActiveKindDuplicate, runEnemyTurns, applyEnemyTurns, cookedEatHeal,
} from '../../game/gameHelpers';
import type { GameSetters, AddLog, ApplyMonkeyDropOnKill } from './types';
import { _flashSignals, tryDualGunsFanfare, PEACEMAKERS_LOG } from '../../game/flashSignals';
import { creditVoidBoss, hotbarCapFor } from '../../game/voidDamage';

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
          const srcItem = bank[srcBankIdx];
          if (isNonStackableBagPassiveDuplicate(srcItem, inv) || isActiveKindDuplicate(srcItem, inv)) {
            return prev; // prevent pulling duplicate non-stackable or active into hotbar
          }
          if (!dstCell && bagItems.length >= cap) return prev;
          const [srcItemMoved] = bank.splice(srcBankIdx, 1);
          if (dstCell && !dstCell.isVoidGhost) {
            const dstActualIdx = inv.findIndex(i => i.id === dstCell.id);
            if (dstActualIdx === -1) { bank.push(srcItemMoved); }
            else {
              bank.push(inv[dstActualIdx]);
              inv[dstActualIdx] = srcItemMoved;
            }
          } else {
            inv.push(srcItemMoved);
          }
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

      return { ...prev, player: { ...prev.player, inventory: inv, bank } };
    });
  }, [setGameState]);

  const handleConsumeBankItem = useCallback((itemId: string) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const item = prev.player.bank.find(i => i.id === itemId);
      if (!item || item.consumed || item.isEquipment) return prev;

      const stats = { ...prev.player.stats };

      if (item.healAmount !== undefined) {
        if (stats.hp >= stats.maxHp) { addLog('Already at full HP.'); return prev; }
        const amount = cookedEatHeal(item, prev.chefLessonCount ?? 0, stats.maxHp);
        const wasLow = stats.hp / stats.maxHp <= 0.3;
        stats.hp = Math.min(stats.maxHp, stats.hp + amount);
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 10));
        addLog(wasLow
          ? `${item.emoji} ${item.name}: +${amount} HP — relief floods through you! Mood surges!`
          : `${item.emoji} ${item.name}: +${amount} HP restored.`);
        const newBank = prev.player.bank.filter(i => i.id !== itemId);
        const mid = { ...prev, player: { ...prev.player, stats, bank: newBank }, turn: prev.turn + 1 };
        return applyEnemyTurns(mid, runEnemyTurns(mid));
      }

      const effect = (item as any).effect;
      if (effect?.instakillNearest) {
        const anyVisible = prev.enemies.some(e => prev.map[e.pos.y]?.[e.pos.x]?.visible);
        if (!anyVisible) { addLog(`${item.emoji} No visible enemies to strike!`); return prev; }
      }
      if (effect) {
        if (effect.hpBonus)      stats.hp        = Math.min(stats.maxHp + (effect.maxHpBonus ?? 0), stats.hp + effect.hpBonus);
        if (effect.maxHpBonus)   stats.maxHp     = stats.maxHp + effect.maxHpBonus;
        if (effect.attackBonus)  stats.attack    = stats.attack  + effect.attackBonus;
        if (effect.defenseBonus) stats.defense   = stats.defense + effect.defenseBonus;
        if (effect.speedBonus)   stats.speed     = (stats.speed   ?? 0) + effect.speedBonus;
        if (effect.evasionBonus) stats.evasion   = (stats.evasion ?? 0) + effect.evasionBonus;
        if (effect.luckBonus)    stats.luck      = (stats.luck    ?? 0) + effect.luckBonus;
        if (effect.moodBonus)    stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + effect.moodBonus);
        if (effect.xpBonus) {
          const newXP = stats.xp + effect.xpBonus;
          const newLevel = levelFromXP(newXP);
          if (newLevel > stats.level) addLog(`✨ Level up! You are now level ${newLevel}!`);
          stats.xp = newXP; stats.level = newLevel;
        }
        addLog(`${item.emoji} ${effect.label}`);
      } else {
        addLog(`${item.emoji} ${item.name} activated!`);
      }

      const isWizard = prev.player.characterClass === '🧙';
      const echo = isWizard && Math.random() < 0.25;
      let newBank = prev.player.bank;
      if (echo) {
        _flashSignals.spellEchoFlashPending = true;
        addLog(`🧙 Spell Echo! ${item.emoji} resonates — not consumed.`);
      } else if (isStackableBagPassive(item) && (item.stackCount ?? 1) > 1) {
        newBank = prev.player.bank.map(it => it.id === itemId ? { ...it, stackCount: (it.stackCount ?? 1) - 1 } : it);
      } else {
        newBank = prev.player.bank.filter(i => i.id !== itemId);
      }

      let newPlayer = { ...prev.player, stats, bank: newBank };
      let newEnemies = prev.enemies;
      let newItems = prev.items;

      if (effect?.instakillNearest) {
        const visible = prev.enemies.filter(e => prev.map[e.pos.y]?.[e.pos.x]?.visible);
        const target = visible.reduce((closest, e) => {
          const d1 = Math.abs(e.pos.x - prev.player.pos.x) + Math.abs(e.pos.y - prev.player.pos.y);
          const d2 = Math.abs(closest.pos.x - prev.player.pos.x) + Math.abs(closest.pos.y - prev.player.pos.y);
          return d1 < d2 ? e : closest;
        });
        markEnemySeen(target.emoji); markEnemyKilled(target.emoji);
        addLog(`⚡ ZAP! ${target.emoji} ${target.name} is obliterated!`);
        newEnemies = prev.enemies.filter(e => e.id !== target.id);
        newPlayer = applyMonkeyDropOnKill(target, newPlayer);
        const drop = rollKillDrop({
          boss: !!target.isBoss,
          clover: computeBagPassives(newPlayer.inventory).bonusLoot,
          floor: prev.currentFloor,
          playerClass: newPlayer.characterClass,
          cowboyDualGuns: newPlayer.characterClass === '🤠' && newPlayer.equipment.mainHand?.weaponKind === 'gun' && newPlayer.equipment.offHand?.weaponKind === 'gun',
        });
        if (drop) {
          newItems = [...newItems, { ...drop, id: `zap-drop-${Math.random()}`, consumed: false, pos: target.pos }];
        }
      }

      let mid = { ...prev, player: newPlayer, enemies: newEnemies, items: newItems, turn: prev.turn + 1 };
      if (effect?.instakillNearest) {
        const slain = prev.enemies.find(e => !newEnemies.some(n => n.id === e.id));
        if (slain?.isBoss) mid = creditVoidBoss(mid, slain);
      }
      return applyEnemyTurns(mid, runEnemyTurns(mid));
    });
  }, [addLog, setGameState]);

  const handleEquip = useCallback((itemId: string, slot: EquipSlot) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const { player } = prev;
      const invIdx  = player.inventory.findIndex(i => i.id === itemId);
      const bankIdx = player.bank.findIndex(i => i.id === itemId);
      const item = invIdx >= 0 ? player.inventory[invIdx] : bankIdx >= 0 ? player.bank[bankIdx] : null;
      if (!item || !item.isEquipment) return prev;
      if (!item.equipSlots?.includes(slot)) { addLog(`${item.emoji} can't go in ${slot} slot.`); return prev; }

      const cls = player.characterClass;
      if (item.specialAmmoKind && cls !== '🧝') { addLog(`${item.emoji} Special arrows are Ranger-only.`); return prev; }
      if ((slot === 'mainHand' || slot === 'offHand') && item.weaponKind) {
        if (cls === '🧙' && item.weaponKind !== 'staff') { addLog(`🧙 Wizard main/off-hand: staves & wands only.`); return prev; }
        if (cls === '🥷' && item.weaponKind !== 'blade') { addLog(`🥷 Ninja main/off-hand: blades only.`); return prev; }
        if (cls === '🧝' && slot === 'mainHand' && !['bow', 'gun'].includes(item.weaponKind)) { addLog(`🧝 Ranger main hand: bow or gun only.`); return prev; }
        if (cls === '🤠' && item.weaponKind !== 'gun') { addLog(`🤠 Only real Cowboys fight with their fists!`); return prev; }
      }
      if (item.armorKind === 'shield' && slot !== 'offHand') { addLog(`Shield goes in the off-hand slot.`); return prev; }
      if (item.armorKind && (slot === 'mainHand' || slot === 'offHand') && item.armorKind !== 'shield' && cls !== '🤠') {
        addLog(`Armor goes in the Body slot.`); return prev;
      }

      let newInv = [...player.inventory];
      let newBank = [...player.bank];
      const currentEquipped = player.equipment[slot];
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
      const newEquipment = { ...player.equipment, [slot]: item };
      const fan = tryDualGunsFanfare({
        characterClass: cls,
        prevEquipment: player.equipment,
        nextEquipment: newEquipment,
        alreadyDone: prev.dualGunsFanfareDone,
      });
      if (fan.fired) addLog(PEACEMAKERS_LOG);
      return {
        ...prev,
        ...(fan.done ? { dualGunsFanfareDone: true } : {}),
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
