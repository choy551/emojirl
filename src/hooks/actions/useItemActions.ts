import { useCallback } from 'react';
import { EmojiItem, ActiveBuff, GameState } from '../../game/types';
import {
  getRandomEmojiPower, getRandomActiveDrop, getBulletDrop, COOKABLE_EMOJIS, cookFood,
} from '../../game/emojis';
import { isStackableBagPassive } from '../../game/passives';
import {
  moodMax, refillBagFromBank, removeAndRefillBag, takeOneMatchingFromBank,
  tickActiveBuffs, withVisibility, runEnemyTurns, applyEnemyTurns, getItemBuyPrice, cookedEatHeal,
  buildHotbarSlots, grantGhostStack, livingMaxHp,
} from '../../game/gameHelpers';
import { applyInstantItemUse, canBuyAndUse } from '../../game/shopUse';
import { applyDrinkToPlayer, pickDrink } from '../../game/drinks';
import { GHOST_LINGER_TEXT, isVoidSoulSpend } from '../../game/voidDamage';
import { recordHotbarSoulConsume } from '../../game/voidMeta';
import {
  chargeGhostUseRefusal,
  chargeKindForEmoji,
  consumeVoidBurdenItem,
  isVoidBurdenActive,
  locateVoidGhost,
  spendChargeGhostUse,
} from '../../game/voidCharge';
import { reclaimVoidSlotPressure, releaseVoidSlotBurden } from '../../game/voidSlotBurden';
import { recordRunEmojiConsume } from '../../game/meta';
import { noteThemedHotbarConsume } from '../../game/voidAbilities';
import { _flashSignals } from '../../game/flashSignals';
import type { GameRefs, GameSetters, AddLog, ApplyMonkeyDropOnKill } from './types';

function noteFullCity(state: GameState, notice: string | null, id: string): GameState {
  if (!notice) return state;
  return {
    ...state,
    logs: [{ id, text: notice, turn: state.turn }, ...state.logs].slice(0, 24),
  };
}

/** Open a rope vault. If `consumeInventoryId` is set, spend that bag rope; shop Buy & Use passes null. */
export function applyRopeVault(
  prev: GameState,
  consumeInventoryId: string | null,
  addLog: AddLog,
): GameState {
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

  const spendRope = (p: typeof newPlayer) => {
    if (!consumeInventoryId) return p;
    const { inventory, bank } = removeAndRefillBag(p.inventory, p.bank, consumeInventoryId);
    return { ...p, inventory, bank };
  };

  if (vaultX === -1) {
    addLog('🪢 The rope leads nowhere — but fate rewards you anyway!');
    const rewards = Array.from({ length: 2 }, (_, i) => ({
      ...getRandomActiveDrop(), id: `vault-fb-${i}-${Math.random()}`, consumed: false, pos: prev.player.pos,
    }));
    newPlayer = spendRope(newPlayer);
    return { ...prev, player: newPlayer, items: [...prev.items, ...rewards] };
  }

  for (let ry = vaultY; ry < vaultY + vh; ry++) {
    for (let rx = vaultX; rx < vaultX + vw; rx++) {
      map[ry][rx] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    }
  }

  const midX = vaultX + Math.floor(vw / 2);
  const midY = vaultY + Math.floor(vh / 2);
  const PASSABLE_TO_CONNECT = new Set(['floor', 'grass', 'safe-floor', 'shop-item', 'shrine', 'shrine-used', 'slot-shrine', 'boss-floor', 'stairs', 'door-open', 'door-closed', 'bed']);
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

  newPlayer.pos = { x: midX, y: midY };
  newPlayer = spendRope(newPlayer);

  const isTrap = Math.random() < 0.35;
  let newItems = [...prev.items];
  let newLogs: Array<{ id: string; text: string; turn: number }> = [];
  if (isTrap) {
    const trapDmg = Math.max(1, Math.floor(livingMaxHp(newPlayer) * 0.25));
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
}

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
      const pool = livingMaxHp(prev.player);
      if (prev.player.stats.hp >= pool) { addLog('Already at full HP.'); return prev; }

      const healCandidates = prev.player.inventory
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => !it.consumed && it.healAmount !== undefined);
      if (healCandidates.length === 0) { addLog('No healing items! Search for 🍎🍖🧪 drops from enemies.'); return prev; }

      const hpPct = prev.player.stats.hp / pool;
      const missingHp = pool - prev.player.stats.hp;
      const lessons = prev.chefLessonCount ?? 0;
      const healOf = (it: EmojiItem) => cookedEatHeal(it, lessons, pool);
      let best: { it: EmojiItem; idx: number };
      if (hpPct <= 0.4) {
        // Low health — use the biggest heal available
        best = healCandidates.reduce((a, b) => healOf(b.it) > healOf(a.it) ? b : a);
      } else {
        // Near full — prefer the smallest heal that covers the gap, avoid wasting big ones
        const fitsGap = healCandidates.filter(({ it }) => healOf(it) <= missingHp);
        const pool = fitsGap.length > 0 ? fitsGap : healCandidates;
        best = pool.reduce((a, b) => healOf(b.it) < healOf(a.it) ? b : a);
      }
      const healIndex = best.idx;

      const item = best.it;
      const stats = { ...prev.player.stats };
      const amount = cookedEatHeal(item, prev.chefLessonCount ?? 0, pool);
      const wasLow = stats.hp / pool <= 0.3;

      stats.hp = Math.min(pool, stats.hp + amount);
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
      const cityGrant = recordRunEmojiConsume(item.emoji, 1, item);
      if (prev.player.characterClass === '👤') {
        const themed = noteThemedHotbarConsume(item);
        if (themed) addLog(themed.text);
      }

      const midState = { ...prev, player: { ...prev.player, stats, inventory: newInventory, bank: newBank }, turn: prev.turn + 1 };
      return noteFullCity(applyEnemyTurns(midState, runEnemyTurns(midState)), cityGrant.notice, `city-full-${prev.turn}-${item.id}`);
    });
  }, [addLog, setGameState]);

  const handleUseDrink = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const pick = pickDrink(prev.player.inventory, prev.player);
      if (!pick) { addLog('No drinks! Search for 🧃🧋🍺.'); return prev; }
      const drank = applyDrinkToPlayer(prev.player, pick.it);
      if (!drank.ok) { addLog(drank.log); return prev; }
      addLog(drank.log);
      const consumed = prev.player.inventory.filter((_, idx) => idx !== pick.idx);
      const { inventory, bank } = refillBagFromBank(consumed, prev.player.bank);
      const cityGrant = recordRunEmojiConsume(pick.it.emoji, 1, pick.it);
      const midState = { ...prev, player: { ...drank.player, inventory, bank }, turn: prev.turn + 1 };
      return noteFullCity(applyEnemyTurns(midState, runEnemyTurns(midState)), cityGrant.notice, `city-full-${prev.turn}-${pick.it.id}`);
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
      const cityGrant = recordRunEmojiConsume(ropeItem.emoji, 1, ropeItem);
      return noteFullCity(applyRopeVault(prev, ropeItem.id, addLog), cityGrant.notice, `city-full-${prev.turn}-${ropeItem.id}`);
    });
  }, [addLog, setGameState]);

  const handleUseSlot = useCallback((bagSlotIndex: number) => {
    const gs = gameStateRef.current;
    if (!gs || gs.gameOver) return;
    const bagItems = buildHotbarSlots(gs.player);
    const item = bagItems[bagSlotIndex];
    if (!item || item.consumed) return;
    if (item.isVoidGhost) {
      const kind = chargeKindForEmoji(item.emoji);
      if (!kind || gs.player.characterClass !== '👤') {
        addLog(GHOST_LINGER_TEXT);
        return;
      }
      const ghost = locateVoidGhost(gs.player, item.emoji)?.ghost;
      const refusal = chargeGhostUseRefusal(item, ghost);
      if (refusal) {
        addLog(refusal);
        return;
      }
      if (kind === 'rope') {
        setGameState(prev => {
          if (!prev || prev.gameOver) return prev;
          const spent = spendChargeGhostUse(prev.player, item.emoji);
          if (!spent.ok) return prev;
          const opened = applyRopeVault({ ...prev, player: spent.player }, null, addLog);
          return {
            ...opened,
            logs: [{ id: `ghost-rope-${prev.turn}`, text: `👤 ${item.emoji} ghost opens a vault. Using it does not add Void pressure.`, turn: prev.turn }, ...opened.logs].slice(0, 24),
          };
        });
        return;
      }
      if (gs.activeProjectile) { addLog('A projectile is already in flight!'); return; }
      dirPickModeRef.current = kind;
      setDirPickMode(kind);
      addLog(`👤 ${item.emoji} ghost — pick a direction. Using it does not add Void pressure.`);
      return;
    }

    if (gs.player.characterClass === '👤' && isVoidBurdenActive(item)) {
      setGameState(prev => {
        if (!prev || prev.gameOver) return prev;
        const slotItem = buildHotbarSlots(prev.player)[bagSlotIndex];
        if (!slotItem || !isVoidBurdenActive(slotItem)) return prev;
        const result = consumeVoidBurdenItem(prev.player, slotItem, prev.currentFloor);
        if (!result.removed) return prev;
        const logs = [
          ...result.logs.map((text, i) => ({ id: `void-unmake-${prev.turn}-${slotItem.id}-${i}`, text, turn: prev.turn })),
          ...prev.logs,
        ].slice(0, 24);
        const mid = { ...prev, player: result.player, logs, turn: prev.turn + 1 };
        return withVisibility(applyEnemyTurns(mid, runEnemyTurns(mid)));
      });
      return;
    }

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

    if (item.isMoneyBag || item.emoji === '💰') {
      addLog("💰 It's full of coins — sell it at a shop.");
      return;
    }

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
      const prevBagItems = buildHotbarSlots(prev.player);
      const slotItem = prevBagItems[bagSlotIndex];
      if (!slotItem || slotItem.isVoidGhost) return prev;

      const applied = applyInstantItemUse(prev, slotItem, {
        source: 'bag',
        addLog: () => {}, // withLog already writes state.logs; real addLog would duplicate
        applyMonkeyDropOnKill,
      });
      if (!applied) return prev;

      const isWizard = prev.player.characterClass === '🧙';
      const echo = isWizard && Math.random() < 0.25;
      let newInventory = applied.player.inventory;
      let newSoulBank = applied.player.bank;
      if (echo) {
        _flashSignals.spellEchoFlashPending = true;
        addLog(`🧙 Spell Echo! ${slotItem.emoji} resonates — not consumed.`);
      } else if (isStackableBagPassive(slotItem)) {
        const fromBank = takeOneMatchingFromBank(applied.player.bank, slotItem.emoji);
        if (fromBank.took) {
          newInventory = applied.player.inventory;
          newSoulBank = fromBank.bank;
        } else if ((slotItem.stackCount ?? 1) > 1) {
          newInventory = applied.player.inventory.map(it =>
            it.id === slotItem.id ? { ...it, stackCount: (it.stackCount ?? 1) - 1 } : it
          );
          const r = refillBagFromBank(newInventory, applied.player.bank);
          newInventory = r.inventory; newSoulBank = r.bank;
        } else {
          const r = removeAndRefillBag(applied.player.inventory, applied.player.bank, slotItem.id);
          newInventory = r.inventory; newSoulBank = r.bank;
        }
      } else {
        const r = removeAndRefillBag(applied.player.inventory, applied.player.bank, slotItem.id);
        newInventory = r.inventory; newSoulBank = r.bank;
      }

      let nextPlayer = { ...applied.player, inventory: newInventory, bank: newSoulBank };
      let nextLogs = applied.logs;
      if (!echo && prev.player.characterClass === '👤') {
        const reclaim = reclaimVoidSlotPressure(applied.player, slotItem);
        nextPlayer = {
          ...nextPlayer,
          stats: reclaim.player.stats,
          voidSlotBurden: reclaim.player.voidSlotBurden,
        };
        nextPlayer = releaseVoidSlotBurden(nextPlayer, slotItem.id);
        if (reclaim.log) {
          nextLogs = [{ id: `void-reclaim-${applied.turn}-${slotItem.id}`, text: reclaim.log, turn: applied.turn }, ...nextLogs].slice(0, 24);
        }
      }
      const cityGrant = echo ? null : recordRunEmojiConsume(slotItem.emoji, 1, slotItem);
      if (!echo && prev.player.characterClass === '👤' && isVoidSoulSpend(slotItem)) {
        const rec = recordHotbarSoulConsume(slotItem.emoji);
        if (rec.crossed) {
          nextPlayer = grantGhostStack(nextPlayer, slotItem.emoji, rec.unlocks);
          const text = rec.unlocks <= 1
            ? `👤 Ghost unlocked: ${slotItem.emoji}`
            : `👤 Ghost unlocked: ${slotItem.emoji} (stack ×${rec.unlocks})`;
          nextLogs = [{ id: `ghost-${applied.turn}-${slotItem.emoji}-${rec.unlocks}`, text, turn: applied.turn }, ...nextLogs].slice(0, 24);
        }
      }
      if (!echo && prev.player.characterClass === '👤') {
        const themed = noteThemedHotbarConsume(slotItem);
        if (themed) {
          nextLogs = [{ id: `void-theme-${applied.turn}-${slotItem.id}`, text: themed.text, turn: applied.turn }, ...nextLogs].slice(0, 24);
        }
      }

      return noteFullCity({ ...applied, player: nextPlayer, logs: nextLogs }, cityGrant?.notice ?? null, `city-full-${applied.turn}-${slotItem.id}`);
    });
  }, [handleUseRope, addLog, gameStateRef, setGameState, setBagTab, setBankOpen, setSelectedItemId, dirPickModeRef, setDirPickMode, setDrownWarnSlot, setLastBoatWarnSlot, boatConfirmedRef, applyMonkeyDropOnKill]);

  const handleShopBuyAndUse = useCallback((item: EmojiItem): boolean => {
    const gs = gameStateRef.current;
    if (!gs || gs.gameOver) return false;
    const price = getItemBuyPrice(item, gs.currentFloor);
    const check = canBuyAndUse(item, gs, price);
    if (!check.ok) return false;
    if (gs.shopStock != null && !gs.shopStock.some(i => i.id === item.id)) return false;
    let succeeded = false;
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      if (prev.shopStock != null && !prev.shopStock.some(i => i.id === item.id)) return prev;
      const p = getItemBuyPrice(item, prev.currentFloor);
      const again = canBuyAndUse(item, prev, p);
      if (!again.ok) return prev;
      const boughtLine = `🏪 Bought & used ${item.emoji} ${item.name} for ${p}g!`;
      const paid: typeof prev = {
        ...prev,
        player: { ...prev.player, stats: { ...prev.player.stats, gold: prev.player.stats.gold - p } },
        logs: [{ id: `shop-use-${prev.turn}`, text: boughtLine, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
      const nextStock = prev.shopStock == null ? prev.shopStock : prev.shopStock.filter(i => i.id !== item.id);
      if (item.activeKind === 'rope' || item.emoji === '🪢') {
        succeeded = true;
        const cityGrant = recordRunEmojiConsume(item.emoji, 1, item);
        return { ...noteFullCity(applyRopeVault(paid, null, addLog), cityGrant.notice, `city-full-${prev.turn}`), shopStock: nextStock };
      }
      const used = applyInstantItemUse(paid, item, { source: 'shop', addLog: () => {}, applyMonkeyDropOnKill });
      if (!used) return prev;
      succeeded = true;
      const cityGrant = recordRunEmojiConsume(item.emoji, 1, item);
      return { ...noteFullCity(used, cityGrant.notice, `city-full-${prev.turn}`), shopStock: nextStock };
    });
    return succeeded;
  }, [gameStateRef, setGameState, applyMonkeyDropOnKill]);

  return { handleUseHeal, handleUseDrink, handleCook, handleUseRope, handleUseSlot, handleShopBuyAndUse };
}
