import { useCallback } from 'react';
import { Player, EmojiItem, FloatingText, ActiveBuff } from '../../game/types';
import {
  getRandomEmojiPower, getRandomHealDrop, getBulletDrop, getRandomActiveDrop,
  getRandomEquipmentDrop, COOKABLE_EMOJIS, cookFood,
} from '../../game/emojis';
import { markEnemySeen, markEmojiSeen, markEnemyKilled } from '../../game/discoveries';
import { isStackableBagPassive } from '../../game/passives';
import {
  moodMax, addToBag, activeKindLabel, sortBagSlots, refillBagFromBank, levelFromXP,
  hpBonusForLevel, tickActiveBuffs, withVisibility, runEnemyTurns, applyEnemyTurns,
} from '../../game/gameHelpers';
import type { GameRefs, GameSetters, AddLog, ApplyMonkeyDropOnKill } from './types';

export function useItemActions(
  refs: GameRefs,
  setters: GameSetters,
  addLog: AddLog,
  applyMonkeyDropOnKill: ApplyMonkeyDropOnKill,
) {
  const { gameStateRef, dirPickModeRef, boatConfirmedRef, restaurantClosedRef } = refs;
  const {
    setGameState, setBagTab, setBankOpen, setSelectedItemId,
    setDirPickMode, setDrownWarnSlot, setLastBoatWarnSlot,
  } = setters;

  const handleUseHeal = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      if (prev.player.stats.hp >= prev.player.stats.maxHp) { addLog('Already at full HP.'); return prev; }

      const healCandidates = prev.player.inventory
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => !it.consumed && it.healAmount !== undefined);
      if (healCandidates.length === 0) { addLog('No healing items! Search for 🍎🍖🧪 drops from enemies.'); return prev; }

      const hpPct = prev.player.stats.hp / prev.player.stats.maxHp;
      const missingHp = prev.player.stats.maxHp - prev.player.stats.hp;
      let best: { it: EmojiItem; idx: number };
      if (hpPct <= 0.4) {
        // Low health — use the biggest heal available
        best = healCandidates.reduce((a, b) => (b.it.healAmount ?? 0) > (a.it.healAmount ?? 0) ? b : a);
      } else {
        // Near full — prefer the smallest heal that covers the gap, avoid wasting big ones
        const fitsGap = healCandidates.filter(({ it }) => (it.healAmount ?? 0) <= missingHp);
        const pool = fitsGap.length > 0 ? fitsGap : healCandidates;
        best = pool.reduce((a, b) => (b.it.healAmount ?? 0) < (a.it.healAmount ?? 0) ? b : a);
      }
      const healIndex = best.idx;

      const item = best.it;
      const amount = item.healAmount ?? 2;
      const stats = { ...prev.player.stats };
      const wasLow = stats.hp / stats.maxHp <= 0.3;

      stats.hp = Math.min(stats.maxHp, stats.hp + amount);
      // Tick active buffs each time food is used (costs 1 turn)
      Object.assign(stats, tickActiveBuffs(stats));

      // Handle cooked food bonus effects
      if (item.cookedBuff) {
        const newBuff: ActiveBuff = {
          stat: item.cookedBuff.stat,
          amount: item.cookedBuff.amount,
          turnsLeft: item.cookedBuff.turns,
          label: `+${item.cookedBuff.amount} ${item.cookedBuff.stat === 'attack' ? 'ATK' : 'DEF'}`,
        };
        stats.activeBuffs = [...(stats.activeBuffs ?? []), newBuff];
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 15));
        addLog(`${item.emoji} ${item.name}: +${amount} HP & ${newBuff.label} for ${item.cookedBuff.turns} turns!`);
      } else if (item.emoji === '🍲') {
        // Mushroom Stew — 40% chance to lift bad mood
        const clearsDebuff = Math.random() < 0.4 && stats.moodValue < 0;
        if (clearsDebuff) stats.moodValue = 0;
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 10));
        addLog(clearsDebuff
          ? `🍲 Mushroom Stew: +${amount} HP & the fog lifts — mood restored!`
          : `🍲 Mushroom Stew: +${amount} HP restored.`);
      } else if (item.isCooked) {
        // Baked Apple / Cooked Berries — mood boost
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 50 : 25));
        addLog(`${item.emoji} ${item.name}: +${amount} HP & mood boost!`);
      } else {
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 10));
        addLog(wasLow
          ? `${item.emoji} ${item.name}: +${amount} HP — relief floods through you! Mood surges!`
          : `${item.emoji} ${item.name}: +${amount} HP restored.`
        );
      }

      const consumed = prev.player.inventory.filter((_, idx) => idx !== healIndex);
      const { inventory: newInventory, bank: newBank } = refillBagFromBank(consumed, prev.player.bank);

      const midState = { ...prev, player: { ...prev.player, stats, inventory: newInventory, bank: newBank }, turn: prev.turn + 1 };
      return applyEnemyTurns(midState, runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const handleCook = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const { x: cpx, y: cpy } = prev.player.pos;
      const nearFire = [-1, 0, 1].some(dy =>
        [-1, 0, 1].some(dx => prev.map[cpy + dy]?.[cpx + dx]?.type === 'campfire')
      );
      const nearRestCook = [-1, 0, 1].some(dy =>
        [-1, 0, 1].some(dx => prev.map[cpy + dy]?.[cpx + dx]?.type === 'restaurant')
      );
      if (!nearFire && !nearRestCook) {
        addLog('🔥 You need to be next to a campfire (🔥) or restaurant (🏪) to cook food.');
        return prev;
      }
      if (nearRestCook && !nearFire && restaurantClosedRef.current) {
        addLog('🏪 The kitchen is closed — thank you for cooking for us today!');
        return prev;
      }
      const rawIdx = prev.player.inventory.findIndex(
        it => !it.consumed && it.healAmount !== undefined && COOKABLE_EMOJIS.has(it.emoji)
      );
      if (rawIdx === -1) {
        addLog('🔥 Nothing to cook — need raw food (🍎 🍞 🍖 🍄 🍇) in your bag.');
        return prev;
      }
      const raw = prev.player.inventory[rawIdx];
      const cooked = cookFood(raw);
      if (!cooked) return prev;
      const cookedItem: EmojiItem = { ...cooked, id: `cooked-${Math.random()}`, consumed: false };
      const newInventory = [...prev.player.inventory];
      newInventory[rawIdx] = cookedItem;
      addLog(`🔥 Cooked ${raw.emoji} → ${cookedItem.emoji} ${cookedItem.name}!`);
      const midState = { ...prev, player: { ...prev.player, inventory: newInventory }, turn: prev.turn + 1 };
      return withVisibility(applyEnemyTurns(midState, runEnemyTurns(midState)));
    });
  }, [addLog, setGameState]);

  const handleUseRope = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const ropeItem = prev.player.inventory.find(it => it.activeKind === 'rope' && !it.consumed && (it.charges ?? 0) > 0);
      if (!ropeItem) { addLog('No 🪢 Rope in inventory!'); return prev; }

      const map = prev.map.map(row => row.map(t => ({ ...t })));
      const mapH = map.length;
      const mapW = map[0].length;

      let vaultX = -1, vaultY = -1;
      const vw = 6, vh = 5;
      let tries = 0;
      outer:
      while (tries++ < 300) {
        const tx = 1 + Math.floor(Math.random() * (mapW - vw - 2));
        const ty = 1 + Math.floor(Math.random() * (mapH - vh - 2));
        for (let ry = ty; ry < ty + vh; ry++) {
          for (let rx = tx; rx < tx + vw; rx++) {
            if (map[ry][rx].type !== 'wall') continue outer;
          }
        }
        vaultX = tx; vaultY = ty; break;
      }

      let newPlayer = { ...prev.player };

      if (vaultX === -1) {
        addLog('🪢 The rope leads nowhere — but fate rewards you anyway!');
        const rewards = Array.from({ length: 2 }, (_, i) => ({
          ...getRandomActiveDrop(), id: `vault-fb-${i}-${Math.random()}`, consumed: false, pos: prev.player.pos,
        }));
        const { inventory: ropeInv, bank: ropeBank } = refillBagFromBank(prev.player.inventory.filter(it => it.id !== ropeItem.id), newPlayer.bank);
        newPlayer = { ...newPlayer, inventory: ropeInv, bank: ropeBank };
        return { ...prev, player: newPlayer, items: [...prev.items, ...rewards] };
      }

      for (let ry = vaultY; ry < vaultY + vh; ry++) {
        for (let rx = vaultX; rx < vaultX + vw; rx++) {
          map[ry][rx] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
        }
      }

      const midX = vaultX + Math.floor(vw / 2);
      const midY = vaultY + Math.floor(vh / 2);
      const PASSABLE_TO_CONNECT = new Set(['floor', 'grass', 'safe-floor', 'shop-item', 'shrine', 'shrine-used', 'boss-floor', 'stairs', 'door-open', 'door-closed']);
      const scanDirs = [
        { sx: midX,        sy: vaultY - 1,  dx:  0, dy: -1 },
        { sx: midX,        sy: vaultY + vh, dx:  0, dy:  1 },
        { sx: vaultX - 1,  sy: midY,        dx: -1, dy:  0 },
        { sx: vaultX + vw, sy: midY,        dx:  1, dy:  0 },
      ];
      const corridorCandidates: { sx: number; sy: number; dx: number; dy: number; dist: number }[] = [];
      for (const { sx, sy, dx, dy } of scanDirs) {
        if (sy < 0 || sy >= mapH || sx < 0 || sx >= mapW) continue;
        let cx = sx, cy = sy, dist = 0;
        while (cx >= 0 && cx < mapW && cy >= 0 && cy < mapH && dist < 20) {
          if (PASSABLE_TO_CONNECT.has(map[cy][cx].type)) {
            corridorCandidates.push({ sx, sy, dx, dy, dist });
            break;
          }
          const ttype = map[cy][cx].type;
          if (ttype === 'water') break;
          cx += dx; cy += dy; dist++;
        }
      }
      if (corridorCandidates.length > 0) {
        corridorCandidates.sort((a, b) => a.dist - b.dist);
        const { sx, sy, dx, dy, dist } = corridorCandidates[0];
        for (let i = 0; i <= dist; i++) {
          const cx = sx + dx * i, cy = sy + dy * i;
          if (map[cy][cx].type === 'wall') {
            map[cy][cx] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
          }
        }
      } else {
        for (let rx = vaultX + vw; rx < Math.min(mapW - 1, vaultX + vw + 15); rx++) {
          if (map[midY][rx].type !== 'wall') break;
          map[midY][rx] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
        }
      }

      const entrancePos = { x: midX, y: midY };
      newPlayer.pos = entrancePos;
      const { inventory: vaultInv, bank: vaultBank } = refillBagFromBank(prev.player.inventory.filter(it => it.id !== ropeItem.id), newPlayer.bank);
      newPlayer = { ...newPlayer, inventory: vaultInv, bank: vaultBank };

      const isTrap = Math.random() < 0.35;
      let newItems = [...prev.items];
      let newLogs: Array<{ id: string; text: string; turn: number }> = [];
      if (isTrap) {
        const trapDmg = Math.max(1, Math.floor(newPlayer.stats.maxHp * 0.25));
        newPlayer.stats = { ...newPlayer.stats, hp: Math.max(1, newPlayer.stats.hp - trapDmg) };
        newLogs = [{ id: Math.random().toString(), text: `🪢 You enter the vault — TRAP! Spikes deal ${trapDmg} damage!`, turn: prev.turn }];
        addLog(`🪢 You enter the vault — TRAP! Spikes deal ${trapDmg} damage!`);
      } else {
        const rewardCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < rewardCount; i++) {
          const rx = vaultX + 1 + Math.floor(Math.random() * (vw - 2));
          const ry = vaultY + 1 + Math.floor(Math.random() * (vh - 2));
          let drop: Omit<EmojiItem, 'id' | 'consumed'>;
          if (newPlayer.characterClass === '🤠' && Math.random() < 0.13) {
            drop = getBulletDrop();
          } else {
            drop = Math.random() < 0.5 ? getRandomEmojiPower() : getRandomActiveDrop();
          }
          newItems.push({ ...drop, id: `vault-${i}-${Math.random()}`, consumed: false, pos: { x: rx, y: ry } });
        }
        addLog(`🪢 You descend into a hidden vault! Treasure awaits…`);
      }

      const midState = { ...prev, player: newPlayer, map, items: newItems, logs: [...newLogs, ...prev.logs].slice(0, 24), turn: prev.turn + 1 };
      const withVis = withVisibility(midState);
      return applyEnemyTurns(withVis, runEnemyTurns(withVis));
    });
  }, [addLog, setGameState]);

  const handleUseSlot = useCallback((bagSlotIndex: number) => {
    const gs = gameStateRef.current;
    if (!gs || gs.gameOver) return;
    const bagItems = sortBagSlots(gs.player.inventory);
    const item = bagItems[bagSlotIndex];
    if (!item || item.consumed) return;

    if (item.isEquipment) {
      setBagTab('equipment');
      setBankOpen(true);
      setSelectedItemId(item.id);
      addLog(`${item.emoji} ${item.name} — select an equipment slot in the Bag window (B).`);
      return;
    }

    if (item.activeKind === 'gun' || item.activeKind === 'boomerang' || item.activeKind === 'freeze' || item.activeKind === 'bomb') {
      if (gs.activeProjectile) { addLog('A projectile is already in flight!'); return; }
      dirPickModeRef.current = item.activeKind as 'gun' | 'freeze' | 'boomerang' | 'bomb';
      setDirPickMode(item.activeKind as 'gun' | 'freeze' | 'boomerang' | 'bomb');
      addLog(`${item.emoji} Pick a direction (click a tile, d-pad, or arrow/numpad/WASD)…`);
      return;
    }

    if (item.activeKind === 'rope') { handleUseRope(); return; }

    if (item.emoji === '⛵') {
      const tile = gs.map[gs.player.pos.y]?.[gs.player.pos.x];
      if (tile?.type === 'water') {
        setDrownWarnSlot(bagSlotIndex);
        return;
      }
      if (!boatConfirmedRef.current) {
        const totalBoats = gs.player.inventory.filter(i => i.emoji === '⛵' && !i.consumed).length
                         + gs.player.bank.filter(i => i.emoji === '⛵' && !i.consumed).length;
        if (totalBoats <= 1) {
          setLastBoatWarnSlot(bagSlotIndex);
          return;
        }
      }
      boatConfirmedRef.current = false;
    }

    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const prevBagItems = sortBagSlots(prev.player.inventory);
      const slotItem = prevBagItems[bagSlotIndex];
      if (!slotItem) return prev;

      if (slotItem.healAmount !== undefined) {
        if (prev.player.stats.hp >= prev.player.stats.maxHp) { addLog('Already at full HP.'); return prev; }
        const amount = slotItem.healAmount ?? 2;
        const stats = { ...prev.player.stats };
        const wasLow = stats.hp / stats.maxHp <= 0.3;
        stats.hp = Math.min(stats.maxHp, stats.hp + amount);
        stats.moodValue = Math.min(moodMax(prev.player.characterClass), stats.moodValue + (wasLow ? 40 : 10));
        const { inventory: healInv, bank: healBank } = refillBagFromBank(prev.player.inventory.filter(it => it.id !== slotItem.id), prev.player.bank);
        addLog(wasLow
          ? `${slotItem.emoji} ${slotItem.name}: +${amount} HP — relief floods through you! Mood surges!`
          : `${slotItem.emoji} ${slotItem.name}: +${amount} HP restored.`
        );
        const mid = { ...prev, player: { ...prev.player, stats, inventory: healInv, bank: healBank }, turn: prev.turn + 1 };
        return applyEnemyTurns(mid, runEnemyTurns(mid));
      }

      const stats = { ...prev.player.stats };
      const effect = (slotItem as any).effect;

      if (effect?.instakillNearest) {
        const anyVisible = prev.enemies.some(e => prev.map[e.pos.y]?.[e.pos.x]?.visible);
        if (!anyVisible) {
          addLog(`${slotItem.emoji} No visible enemies to strike!`);
          return prev;
        }
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
          stats.xp = newXP;
          stats.level = newLevel;
        }
        if (slotItem.emoji === '⛵') { stats.gold = (stats.gold ?? 0) + 50; addLog(`${slotItem.emoji} ${effect.label} +50g from the voyage!`); }
        else addLog(`${slotItem.emoji} ${effect.label}`);
      } else {
        addLog(`${slotItem.emoji} ${slotItem.name} activated!`);
      }
      const isWizard = prev.player.characterClass === '🧙';
      const echo = isWizard && Math.random() < 0.25;
      let newInventory: typeof prev.player.inventory;
      let newSoulBank = prev.player.bank;
      if (echo) {
        addLog(`🧙 Spell Echo! ${slotItem.emoji} resonates — not consumed.`);
        newInventory = [...prev.player.inventory];
      } else if (isStackableBagPassive(slotItem) && (slotItem.stackCount ?? 1) > 1) {
        newInventory = prev.player.inventory.map(it =>
          it.id === slotItem.id ? { ...it, stackCount: (it.stackCount ?? 1) - 1 } : it
        );
        const r = refillBagFromBank(newInventory, prev.player.bank);
        newInventory = r.inventory; newSoulBank = r.bank;
      } else {
        const r = refillBagFromBank(prev.player.inventory.filter(it => it.id !== slotItem.id), prev.player.bank);
        newInventory = r.inventory; newSoulBank = r.bank;
      }

      let newPlayer: Player = { ...prev.player, stats, inventory: newInventory, bank: newSoulBank };
      let newEnemies = prev.enemies;
      let newItems = prev.items;
      const floats: FloatingText[] = [];

      let zapKillCounts = prev.killCounts;
      if (effect?.instakillNearest) {
        const visible = prev.enemies.filter(e => prev.map[e.pos.y]?.[e.pos.x]?.visible);
        const target = visible.reduce((closest, e) => {
          const d1 = Math.abs(e.pos.x - prev.player.pos.x) + Math.abs(e.pos.y - prev.player.pos.y);
          const d2 = Math.abs(closest.pos.x - prev.player.pos.x) + Math.abs(closest.pos.y - prev.player.pos.y);
          return d1 < d2 ? e : closest;
        });
        markEnemySeen(target.emoji);
        markEnemyKilled(target.emoji);
        zapKillCounts = { ...prev.killCounts, [target.emoji]: (prev.killCounts[target.emoji] ?? 0) + 1 };
        addLog(`⚡ ZAP! ${target.emoji} ${target.name} is obliterated!`);
        const xpGain = target.isBoss ? 25 : 5;
        const newXP = newPlayer.stats.xp + xpGain;
        const oldLevel = newPlayer.stats.level;
        const newLevel = levelFromXP(newXP);
        newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, xp: newXP } };
        if (newLevel > oldLevel) {
          const hpInc = hpBonusForLevel(newLevel) - hpBonusForLevel(oldLevel);
          const newMaxHp = newPlayer.stats.maxHp + hpInc;
          const lvlEmoji = { ...getRandomEmojiPower(), id: `zap-lvl-${Math.random()}`, consumed: false };
          const { inventory: _inv, bank: _bnk, nonStackableBanked: _nsbZ, duplicateActiveBanked: _dabZ } = addToBag(newPlayer.inventory, newPlayer.bank, lvlEmoji);
          markEmojiSeen(lvlEmoji.emoji);
          _nsbZ.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
          _dabZ.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, level: newLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(prev.player.characterClass), newPlayer.stats.moodValue + 30) }, inventory: _inv, bank: _bnk };
          addLog(`✨ Level ${newLevel}! Full heal! +${hpInc} max HP! Got ${lvlEmoji.emoji}!`);
        }
        newEnemies = prev.enemies.filter(e => e.id !== target.id);
        newPlayer = applyMonkeyDropOnKill(target, newPlayer);
        if (target.isBoss || Math.random() < 0.50) {
          const r2 = Math.random();
          const drop = r2 < 0.12 ? getRandomEquipmentDrop(prev.currentFloor) : r2 < 0.28 ? getRandomActiveDrop() : getRandomHealDrop();
          newItems = [...newItems, { ...drop, id: `zap-drop-${Math.random()}`, consumed: false, pos: target.pos }];
        }
        floats.push({ id: `zap-${target.id}-${prev.turn}`, pos: { ...target.pos }, text: '⚡ ZAP!', color: '#fbbf24', life: 3 });
      }

      const midState = { ...prev, killCounts: zapKillCounts, player: newPlayer, enemies: newEnemies, items: newItems, floatingTexts: floats, turn: prev.turn + 1 };
      return withVisibility(applyEnemyTurns(midState, runEnemyTurns(midState)));
    });
  }, [handleUseRope, addLog, gameStateRef, setGameState, setBagTab, setBankOpen, setSelectedItemId, dirPickModeRef, setDirPickMode, setDrownWarnSlot, setLastBoatWarnSlot, boatConfirmedRef]);

  return { handleUseHeal, handleCook, handleUseRope, handleUseSlot };
}
