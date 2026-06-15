import { Player, FloatingText, Position } from './types';
import { getRandomEmojiPower } from './emojis';
import { markEmojiSeen } from './discoveries';
import { addToBag, activeKindLabel } from './inventory';
import { moodMax, hpBonusForLevel, mpBonusForLevel } from './progression';

/**
 * Overheal decay: while HP exceeds natural maxHp, shed 1 HP every 5 turns until
 * back to maxHp. Pure: returns the updated player plus an optional floating text
 * that the caller merges into its own float list (callers differ in ordering).
 */
export function applyOverhealDecay(
  player: Player,
  turn: number,
  pos: Position,
  floatIdPrefix: string,
): { player: Player; float: FloatingText | null } {
  if (player.stats.hp <= player.stats.maxHp) return { player, float: null };

  const tick = (player.stats.overhealDecayTick ?? 0) + 1;
  if (tick >= 5) {
    const decayedHp = Math.max(player.stats.maxHp, player.stats.hp - 1);
    const next = { ...player, stats: { ...player.stats, hp: decayedHp, overhealDecayTick: 0 } };
    const float: FloatingText | null = decayedHp > player.stats.maxHp
      ? { id: `${floatIdPrefix}-${turn}`, pos: { ...pos }, text: '-1 ✨', color: '#fbbf24', life: 2 }
      : null;
    return { player: next, float };
  }
  return { player: { ...player, stats: { ...player.stats, overhealDecayTick: tick } }, float: null };
}

/**
 * Ninja Blink Strike instakill-chain out-of-combat decay: while no enemy is
 * engaged, count up; after 10 turns a chain of 2+ fades back to 0. Engaging
 * resets the counter. Non-ninjas are returned unchanged.
 */
export function tickBlinkChainOutOfCombat(
  player: Player,
  inCombat: boolean,
  addLog: (text: string) => void,
): Player {
  if (player.characterClass !== '🥷') return player;

  let outTurns = player.stats.blinkStrikeInstakillOutOfCombat ?? 0;
  let chain = player.stats.blinkStrikeInstakillChain ?? 0;

  if (inCombat) {
    outTurns = 0;
  } else {
    outTurns += 1;
    if (outTurns >= 10 && chain >= 2) {
      chain = 0;
      addLog(`🥷 Blink Strike instakill chain faded (10 turns out of combat).`);
      outTurns = 0;
    }
  }

  return {
    ...player,
    stats: { ...player.stats, blinkStrikeInstakillOutOfCombat: outTurns, blinkStrikeInstakillChain: chain },
  };
}

/**
 * Level-up rewards shared by every melee/ranged kill path: grant a max-HP bump
 * with full heal, award a random emoji power (two for Wizards), restore mood, and
 * grant Wizards bonus max MP. Side effects are limited to the passed `addLog` and
 * the global discoveries store (markEmojiSeen). Returns the updated player.
 *
 * Callers must have already applied the XP gain to `player.stats.xp` and computed
 * `oldLevel`/`newLevel`; this only runs when `newLevel > oldLevel`.
 */
export function applyLevelUp(
  player: Player,
  oldLevel: number,
  newLevel: number,
  addLog: (text: string) => void,
): Player {
  const hpIncrease = hpBonusForLevel(newLevel) - hpBonusForLevel(oldLevel);
  const newMaxHp = player.stats.maxHp + hpIncrease;
  const newEmoji = { ...getRandomEmojiPower(), id: `lvlup-${Math.random()}`, consumed: false };
  const extraEmoji = player.characterClass === '🧙'
    ? [{ ...getRandomEmojiPower(), id: `lvlup2-${Math.random()}`, consumed: false }]
    : [];
  const { inventory, bank, nonStackableBanked, duplicateActiveBanked } = addToBag(player.inventory, player.bank, newEmoji, ...extraEmoji);
  markEmojiSeen(newEmoji.emoji); extraEmoji.forEach(e => markEmojiSeen(e.emoji));
  nonStackableBanked.forEach(i => addLog(`Extra ${i.emoji} → Bank (already carried)`));
  duplicateActiveBanked.forEach(i => addLog(`${i.emoji} Duplicate ${activeKindLabel(i.activeKind!)} banked — you already have one`));

  let result: Player = {
    ...player,
    stats: { ...player.stats, level: newLevel, maxHp: newMaxHp, hp: newMaxHp, moodValue: Math.min(moodMax(player.characterClass), player.stats.moodValue + 30) },
    inventory,
    bank,
  };
  addLog(`✨ Level ${newLevel}! Full heal! +${hpIncrease} max HP! Got ${newEmoji.emoji}!`);

  if (player.characterClass === '🧙') {
    const mpInc = mpBonusForLevel(newLevel) - mpBonusForLevel(oldLevel);
    if (mpInc > 0) {
      const newMaxMana = (result.stats.maxMana ?? 4) + mpInc;
      result = { ...result, stats: { ...result.stats, maxMana: newMaxMana, mana: newMaxMana } };
      addLog(`🔵 +${mpInc} max MP! (${newMaxMana} total)`);
    }
  }

  return result;
}
