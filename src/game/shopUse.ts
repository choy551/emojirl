import { Enemy, EmojiItem, FloatingText, GameState, Player } from './types';
import type { SoulEffect } from './emojis';
import { EMOJI_POWERS, getRandomEmojiPower, getRandomFloorDrop, getRandomActiveDrop, getRandomEquipmentDrop } from './emojis';
import { markEnemySeen, markEnemyKilled, markEmojiSeen } from './discoveries';
import { moodMax, levelFromXP, hpBonusForLevel } from './progression';
import { addToBag, activeKindLabel } from './inventory';
import { withVisibility } from './vision';
import { runEnemyTurns, applyEnemyTurns } from './enemyTurns';
import { _flashSignals } from './flashSignals';

export type ShopUseBlockReason =
  | 'Not enough gold'
  | 'Needs a target direction — buy it and use from the hotbar'
  | 'No enemies on screen'
  | 'Equip from Buy / bag'
  | 'Already at full HP'
  | 'Sell it at the shop';

const AIMED_KINDS = new Set(['gun', 'boomerang', 'freeze', 'bomb', 'rope']);

export function isShopDirectUseBlocked(item: EmojiItem): boolean {
  if (item.isEquipment) return true;
  if (item.ammoAmount !== undefined) return true;
  if (item.isMoneyBag || item.emoji === '💰') return true;
  if (item.activeKind && AIMED_KINDS.has(item.activeKind)) return true;
  return false;
}

export function hasVisibleEnemy(state: GameState): boolean {
  return state.enemies.some(e => state.map[e.pos.y]?.[e.pos.x]?.visible);
}

export function soulConsumeEffect(item: EmojiItem): SoulEffect | undefined {
  const onItem = (item as { effect?: SoulEffect }).effect;
  if (onItem) return onItem;
  return EMOJI_POWERS.find(e => e.emoji === item.emoji)?.effect;
}

function withLog(state: GameState, text: string, addLog?: (t: string) => void): GameState {
  addLog?.(text);
  return {
    ...state,
    logs: [{ id: `use-${state.turn}-${Math.random().toString(36).slice(2, 8)}`, text, turn: state.turn }, ...state.logs].slice(0, 24),
  };
}

export function canBuyAndUse(
  item: EmojiItem,
  state: GameState,
  price: number,
): { ok: true } | { ok: false; reason: ShopUseBlockReason } {
  if (state.player.stats.gold < price) return { ok: false, reason: 'Not enough gold' };
  if (item.isEquipment || item.ammoAmount !== undefined) return { ok: false, reason: 'Equip from Buy / bag' };
  if (item.isMoneyBag || item.emoji === '💰') return { ok: false, reason: 'Sell it at the shop' };
  if (item.activeKind && AIMED_KINDS.has(item.activeKind)) {
    return { ok: false, reason: 'Needs a target direction — buy it and use from the hotbar' };
  }
  const effect = soulConsumeEffect(item);
  if ((effect?.instakillNearest || item.emoji === '⚡') && !hasVisibleEnemy(state)) {
    return { ok: false, reason: 'No enemies on screen' };
  }
  if (item.healAmount !== undefined && state.player.stats.hp >= state.player.stats.maxHp) {
    return { ok: false, reason: 'Already at full HP' };
  }
  return { ok: true };
}

export function applyInstantItemUse(
  state: GameState,
  item: EmojiItem,
  opts: {
    source: 'bag' | 'shop';
    addLog: (text: string) => void;
    applyMonkeyDropOnKill: (killed: Enemy, p: Player) => Player;
  },
): GameState | null {
  if (state.gameOver) return null;
  const effect = soulConsumeEffect(item);
  const cls = state.player.characterClass;
  let s = state;
  const log = (text: string) => { s = withLog(s, text, opts.addLog); };

  if (item.isMoneyBag || item.emoji === '💰') {
    log("💰 It's full of coins — sell it at a shop.");
    return s;
  }

  if (item.healAmount !== undefined) {
    if (s.player.stats.hp >= s.player.stats.maxHp) {
      log('Already at full HP.');
      return null;
    }
    const amount = item.healAmount ?? 2;
    const stats = { ...s.player.stats };
    const wasLow = stats.hp / stats.maxHp <= 0.3;
    stats.hp = Math.min(stats.maxHp, stats.hp + amount);
    stats.moodValue = Math.min(moodMax(cls), stats.moodValue + (wasLow ? 40 : 10));
    log(wasLow
      ? `${item.emoji} ${item.name}: +${amount} HP — relief floods through you! Mood surges!`
      : `${item.emoji} ${item.name}: +${amount} HP restored.`
    );
    const mid = { ...s, player: { ...s.player, stats }, turn: s.turn + 1 };
    return withVisibility(applyEnemyTurns(mid, runEnemyTurns(mid)));
  }

  if (effect?.instakillNearest && !hasVisibleEnemy(s)) {
    log(`${item.emoji} No visible enemies to strike!`);
    return null;
  }

  const stats = { ...s.player.stats };
  if (effect) {
    if (effect.hpBonus)      stats.hp        = Math.min(stats.maxHp + (effect.maxHpBonus ?? 0), stats.hp + effect.hpBonus);
    if (effect.maxHpBonus)   stats.maxHp     = stats.maxHp + effect.maxHpBonus;
    if (effect.attackBonus)  stats.attack    = stats.attack  + effect.attackBonus;
    if (effect.defenseBonus) stats.defense   = stats.defense + effect.defenseBonus;
    if (effect.speedBonus)   stats.speed     = (stats.speed   ?? 0) + effect.speedBonus;
    if (effect.evasionBonus) stats.evasion   = (stats.evasion ?? 0) + effect.evasionBonus;
    if (effect.luckBonus)    stats.luck      = (stats.luck    ?? 0) + effect.luckBonus;
    if (effect.moodBonus)    stats.moodValue = Math.min(moodMax(cls), stats.moodValue + effect.moodBonus);
    if (effect.xpBonus) {
      const newXP = stats.xp + effect.xpBonus;
      const newLevel = levelFromXP(newXP);
      if (newLevel > stats.level) log(`✨ Level up! You are now level ${newLevel}!`);
      stats.xp = newXP;
      stats.level = newLevel;
    }
    if (item.emoji === '⛵') {
      stats.gold = (stats.gold ?? 0) + 50;
      log(`${item.emoji} ${effect.label} +50g from the voyage!`);
    } else {
      log(`${item.emoji} ${effect.label}`);
    }
  } else {
    log(`${item.emoji} ${item.name} activated!`);
  }

  let newPlayer: Player = { ...s.player, stats };
  let newEnemies = s.enemies;
  let newItems = s.items;
  const floats: FloatingText[] = [...(s.floatingTexts ?? [])];
  let zapKillCounts = s.killCounts;

  if (effect?.instakillNearest) {
    const visible = s.enemies.filter(e => s.map[e.pos.y]?.[e.pos.x]?.visible);
    if (visible.length === 0) {
      log(`${item.emoji} No visible enemies to strike!`);
      return null;
    }
    const target = visible.reduce((closest, e) => {
      const d1 = Math.abs(e.pos.x - s.player.pos.x) + Math.abs(e.pos.y - s.player.pos.y);
      const d2 = Math.abs(closest.pos.x - s.player.pos.x) + Math.abs(closest.pos.y - s.player.pos.y);
      return d1 < d2 ? e : closest;
    });
    markEnemySeen(target.emoji);
    markEnemyKilled(target.emoji);
    zapKillCounts = { ...s.killCounts, [target.emoji]: (s.killCounts[target.emoji] ?? 0) + 1 };
    _flashSignals.lightningFlashPending = true;
    if (opts.source === 'shop') {
      log(`The Shopkeeper slays a potential filthy shoplifter ${target.emoji} ${target.name} with his awesome shopkeeper powers!`);
    } else {
      log(`⚡ ZAP! ${target.emoji} ${target.name} is obliterated!`);
    }
    const xpGain = target.isBoss ? 25 : 5;
    const newXP = newPlayer.stats.xp + xpGain;
    const oldLevel = newPlayer.stats.level;
    const newLevel = levelFromXP(newXP);
    newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, xp: newXP } };
    if (newLevel > oldLevel) {
      const hpInc = hpBonusForLevel(newLevel) - hpBonusForLevel(oldLevel);
      const newMaxHp = newPlayer.stats.maxHp + hpInc;
      const lvlEmoji = { ...getRandomEmojiPower(), id: `zap-lvl-${Math.random()}`, consumed: false };
      markEmojiSeen(lvlEmoji.emoji);
      if (opts.source === 'bag') {
        const { inventory: _inv, bank: _bnk, nonStackableBanked: _nsbZ, duplicateActiveBanked: _dabZ } = addToBag(newPlayer.inventory, newPlayer.bank, lvlEmoji);
        _nsbZ.forEach(i => log(`Extra ${i.emoji} → Bank (already carried)`));
        _dabZ.forEach(i => log(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));
        newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, level: newLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(cls), newPlayer.stats.moodValue + 30) }, inventory: _inv, bank: _bnk };
        log(`✨ Level ${newLevel}! Full heal! +${hpInc} max HP! Got ${lvlEmoji.emoji}!`);
      } else {
        newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, level: newLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(cls), newPlayer.stats.moodValue + 30) } };
        log(`✨ Level ${newLevel}! Full heal! +${hpInc} max HP!`);
      }
    }
    newEnemies = s.enemies.filter(e => e.id !== target.id);
    newPlayer = opts.applyMonkeyDropOnKill(target, newPlayer);
    if (target.isBoss || Math.random() < 0.50) {
      const r2 = Math.random();
      const drop = r2 < 0.12 ? getRandomEquipmentDrop(s.currentFloor) : r2 < 0.28 ? getRandomActiveDrop() : getRandomFloorDrop();
      newItems = [...newItems, { ...drop, id: `zap-drop-${Math.random()}`, consumed: false, pos: target.pos }];
    }
    floats.push({ id: `zap-${target.id}-${s.turn}`, pos: { ...target.pos }, text: '⚡ ZAP!', color: '#fbbf24', life: 3 });
  }

  const midState = {
    ...s,
    killCounts: zapKillCounts,
    player: newPlayer,
    enemies: newEnemies,
    items: newItems,
    floatingTexts: floats,
    turn: s.turn + 1,
  };
  return withVisibility(applyEnemyTurns(midState, runEnemyTurns(midState)));
}
