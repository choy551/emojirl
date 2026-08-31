import { useCallback } from 'react';
import { GameState, Player, FloatingText, PlacedBomb, ActiveProjectile } from '../../game/types';
import { resolveCombat } from '../../game/combat';
import { getMood } from '../../game/moods';
import { markEnemyKilled } from '../../game/discoveries';
import {
  moodMax, chebyshev, hasLOSBetween, PLAYER_PASSABLE_TILES, computeBagPassives,
  applyEquipmentAndPassives, removeAndRefillBag, withVisibility, runEnemyTurns, applyEnemyTurns,
  handleGodBlessedImmunity, levelFromXP,
} from '../../game/gameHelpers';
import { applyLevelUp } from '../../game/playerTurn';
import type { GameSetters, AddLog, ApplyMonkeyDropOnKill } from './types';

export function useCombatActions(
  setters: GameSetters,
  addLog: AddLog,
  applyMonkeyDropOnKill: ApplyMonkeyDropOnKill,
) {
  const { setGameState } = setters;

  const handlePlantBomb = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      const bombItem = prev.player.inventory.find(it => it.activeKind === 'bomb' && !it.consumed && (it.charges ?? 0) > 0);
      if (!bombItem) { addLog('No 💣 Bomb in inventory!'); return prev; }
      const bomb: PlacedBomb = { id: `bomb-${Math.random()}`, pos: { ...prev.player.pos }, countdown: 3, radius: 1 };
      addLog(`💣 You plant a bomb! It will explode in 3 turns!`);
      const newInv = prev.player.inventory.map(it =>
        it.id === bombItem.id ? { ...it, charges: (it.charges ?? 1) - 1, consumed: ((it.charges ?? 1) - 1) <= 0 } : it
      );
      const midState = { ...prev, player: { ...prev.player, inventory: newInv }, placedBombs: [...prev.placedBombs, bomb], turn: prev.turn + 1 };
      return applyEnemyTurns(midState, runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const handleFireProjectile = useCallback((kind: 'gun' | 'freeze' | 'boomerang' | 'bomb', dx: number, dy: number) => {
    setGameState(prev => {
      if (!prev || prev.gameOver) return prev;
      if (prev.activeProjectile) {
        addLog('A projectile is already in flight!');
        return prev;
      }
      const kindEmoji = kind === 'gun' ? '🔫' : kind === 'freeze' ? '❄️' : kind === 'bomb' ? '💣' : '🪃';
      const item = prev.player.inventory.find(it => it.activeKind === kind && !it.consumed && (it.charges === -1 || (it.charges ?? 0) > 0));
      if (!item) { addLog(`No ${kindEmoji} in inventory!`); return prev; }
      const throwLabel = kind === 'boomerang' ? 'throw the boomerang' : kind === 'bomb' ? 'throw the bomb' : kind === 'gun' ? 'fire the gun' : 'fire a freeze bolt';
      const bankBoomerangs = kind === 'boomerang' ? prev.player.bank.filter(it => it.activeKind === 'boomerang' && !it.consumed).length : 0;
      const boomerangPct = Math.round(Math.min(2.0, 1.0 + 0.25 * bankBoomerangs) * 100);
      addLog(`${kindEmoji} You ${throwLabel}!${kind === 'boomerang' && bankBoomerangs > 0 ? ` (${boomerangPct}% ATK — ${bankBoomerangs} extra in Bank)` : ''}`);
      const proj: ActiveProjectile = {
        id: `proj-${Math.random()}`,
        kind,
        pos: { ...prev.player.pos },
        dir: { x: dx, y: dy },
        phase: 'outgoing',
        maxRange: kind === 'boomerang' ? 5 : 8,
        traveled: 0,
      };
      let newInv = prev.player.inventory;
      let newProjBank = prev.player.bank;
      if (kind === 'gun') {
        const newCharges = (item.charges ?? 3) - 1;
        if (newCharges <= 0) {
          addLog('🔫 Gun is empty!');
          const r = removeAndRefillBag(prev.player.inventory, prev.player.bank, item.id);
          newInv = r.inventory; newProjBank = r.bank;
        } else {
          newInv = prev.player.inventory.map(it => it.id === item.id ? { ...it, charges: newCharges } : it);
        }
      } else if (kind === 'freeze') {
        const r = removeAndRefillBag(prev.player.inventory, prev.player.bank, item.id);
        newInv = r.inventory; newProjBank = r.bank;
      } else if (kind === 'bomb') {
        const newCharges = (item.charges ?? 1) - 1;
        if (newCharges <= 0) {
          const r = removeAndRefillBag(prev.player.inventory, prev.player.bank, item.id);
          newInv = r.inventory; newProjBank = r.bank;
        } else {
          newInv = prev.player.inventory.map(it => it.id === item.id ? { ...it, charges: newCharges } : it);
        }
      }
      const midState = { ...prev, player: { ...prev.player, inventory: newInv, bank: newProjBank }, activeProjectile: proj, turn: prev.turn + 1 };
      return applyEnemyTurns(midState, runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const handleBlinkStrikeOnTarget = useCallback((targetId: string) => {
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.player.characterClass !== '🥷') return prev;
      const cooldown = prev.player.stats.blinkStrikeCooldown ?? 0;
      if (cooldown > 0) {
        addLog(`🥷 Blink Strike not ready — ${cooldown}t remaining.`);
        return prev;
      }
      const target = prev.enemies.find(e => e.id === targetId);
      if (!target) { addLog('🥷 Blink Strike — target lost.'); return prev; }
      if (target.tag === 'Friendly' || (target.tag === 'Neutral' && !target.engaged)) {
        addLog(`🥷 Blink Strike — ${target.name} is not hostile.`);
        return prev;
      }
      const dist = chebyshev(prev.player.pos, target.pos);
      if (dist < 1 || dist > 6 || !hasLOSBetween(prev.map, prev.player.pos, target.pos) || !prev.map[target.pos.y]?.[target.pos.x]?.visible) {
        addLog('🥷 Blink Strike — target out of range or LOS broken.');
        return prev;
      }

      const dirs8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      const adjFree = dirs8
        .map(([dy, dx]) => ({ x: target.pos.x + dx, y: target.pos.y + dy }))
        .filter(p => {
          const tile = prev.map[p.y]?.[p.x];
          return tile && PLAYER_PASSABLE_TILES.has(tile.type) &&
            !prev.enemies.some(e => e.id !== target.id && e.pos.x === p.x && e.pos.y === p.y);
        });
      const blinkPos = adjFree.length > 0 ? adjFree[0] : prev.player.pos;

      const _blinkPassives = computeBagPassives(prev.player.inventory);
      const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, false);
      const blinkEffPlayer = applyEquipmentAndPassives({ ...prev.player, pos: blinkPos });
      const boostedPlayer = { ...blinkEffPlayer, pos: blinkPos, stats: { ...blinkEffPlayer.stats, attack: Math.round(blinkEffPlayer.stats.attack * 2) } };

      addLog(`🥷 Blink Strike → ${target.emoji} ${target.name}!`);
      const combatResult = resolveCombat(boostedPlayer, target, addLog, { mood, advantage: _blinkPassives.advantageDice, execBlow: _blinkPassives.execBlow });

      let actuallyKilled = combatResult.enemyDied;
      const blinkDmg = target.hp - Math.max(0, combatResult.enemyHp);

      const blinkFloats: FloatingText[] = [];
      if (blinkDmg > 0) blinkFloats.push({ id: `blink-e-${target.id}-${prev.turn}`, pos: { ...target.pos }, text: `-${blinkDmg}`, color: '#818cf8', life: 2 });
      const dmgToPlayer = prev.player.stats.hp - combatResult.playerHp;
      if (dmgToPlayer > 0) blinkFloats.push({ id: `blink-p-${prev.turn}`, pos: { ...blinkPos }, text: `-${dmgToPlayer}`, color: '#f97316', life: 2 });

      let newEnemies = [...prev.enemies];
      const targetIdx = newEnemies.findIndex(e => e.id === target.id);
      let newKillCounts = { ...prev.killCounts };
      let ninjaFreeMoves = prev.ninjaFreeMoves ?? 0;
      let newDifficultyTier = prev.difficultyTier ?? 0;

      let newPlayer: Player = {
        ...prev.player,
        pos: blinkPos,
        stats: { ...prev.player.stats, hp: combatResult.playerHp, blinkStrikeCooldown: 8, moodValue: Math.max(-100, prev.player.stats.moodValue - 5) },
      };

      if (combatResult.enemyDied && target.godBlessed) {
        const gb = handleGodBlessedImmunity(target, newEnemies, targetIdx, newPlayer.stats.hp, prev.turn, addLog, blinkFloats);
        if (gb.proc) {
          actuallyKilled = false;
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, hp: gb.newPlayerHp } };
          newEnemies = gb.newEnemies;
          if (gb.newPlayerHp <= 0) {
            return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer: { name: target.name, emoji: target.emoji }, floatingTexts: [...blinkFloats, ...prev.floatingTexts] };
          }
        }
      }

      if (actuallyKilled) {
        markEnemyKilled(target.emoji);
        newKillCounts[target.emoji] = (newKillCounts[target.emoji] ?? 0) + 1;
        if (targetIdx !== -1) newEnemies.splice(targetIdx, 1);
        newPlayer = applyMonkeyDropOnKill(target, newPlayer);
        const xpGain = target.isBoss ? 25 : 5;
        const oldLevel = newPlayer.stats.level;
        const newXP = newPlayer.stats.xp + xpGain;
        const newLevel = levelFromXP(newXP);
        newPlayer.stats.xp = newXP;
        addLog(`🏆 You defeated ${target.name}! +${xpGain} XP!`);
        if (target.isBoss) {
          addLog(`⬆️ Darkness stirs — enemies grow stronger from here on!`);
          newDifficultyTier = (prev.difficultyTier ?? 0) + 1;
        }
        if (newLevel > oldLevel) {
          newPlayer = applyLevelUp(newPlayer, oldLevel, newLevel, addLog);
        }
        const blinkInstakill = target.hp >= target.maxHp;
        const currentChain = prev.player.stats.blinkStrikeInstakillChain ?? 0;
        if (blinkInstakill && currentChain < 3) {
          const newChain = currentChain + 1;
          newPlayer.stats.blinkStrikeCooldown = 0;
          newPlayer.stats.blinkStrikeInstakillChain = newChain;
          addLog(`🥷 Blink Kill! Chain ${newChain}/3 — instant reset!`);
        } else if (blinkInstakill) {
          newPlayer.stats.blinkStrikeCooldown = 3;
          newPlayer.stats.blinkStrikeInstakillChain = currentChain;
          addLog(`🥷 Blink Kill! Chain maxed — 3t cooldown.`);
        } else {
          newPlayer.stats.blinkStrikeCooldown = 7;
          newPlayer.stats.blinkStrikeInstakillChain = 0;
          addLog(`🥷 Blink Kill! Cooldown: 7t.`);
        }
        newPlayer.stats.moodValue = Math.min(moodMax('🥷'), prev.player.stats.moodValue + 15);
        const freeMovesGain = prev.stealthMode ? 2 : 1;
        ninjaFreeMoves += freeMovesGain;
        addLog(`🥷 Assassin's Edge — ${freeMovesGain} free move${freeMovesGain > 1 ? 's' : ''}!`);
      } else if (!target.godBlessed || !combatResult.enemyDied) {
        if (targetIdx !== -1) newEnemies[targetIdx] = { ...target, hp: combatResult.enemyHp, engaged: true };
        newPlayer.stats.blinkStrikeInstakillChain = 0;
        addLog(`🥷 Blink Strike — 8 turn cooldown started.`);
      } else {
        newPlayer.stats.blinkStrikeInstakillChain = 0;
        addLog(`🥷 Blink Strike — 8 turn cooldown started.`);
      }

      if (combatResult.playerDied) {
        return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer: { name: target.name, emoji: target.emoji }, floatingTexts: [...blinkFloats, ...prev.floatingTexts] };
      }

      newPlayer.stats.blinkStrikeInstakillOutOfCombat = 0;
      const midState: GameState = { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, killCounts: newKillCounts, difficultyTier: newDifficultyTier, floatingTexts: [...blinkFloats, ...prev.floatingTexts], ninjaFreeMoves };
      return applyEnemyTurns(withVisibility(midState), runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const handleBlinkStrike = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.gameOver || prev.player.characterClass !== '🥷') return prev;
      const cooldown = prev.player.stats.blinkStrikeCooldown ?? 0;
      if (cooldown > 0) {
        addLog(`🥷 Blink Strike not ready — ${cooldown} turn${cooldown > 1 ? 's' : ''} remaining.`);
        return prev;
      }

      const targets = prev.enemies.filter(e => {
        const dist = chebyshev(prev.player.pos, e.pos);
        return dist >= 1 && dist <= 6 && hasLOSBetween(prev.map, prev.player.pos, e.pos) && prev.map[e.pos.y]?.[e.pos.x]?.visible
          && (e.tag === 'Hostile' || e.engaged);
      });
      if (targets.length === 0) {
        addLog('🥷 Blink Strike — no targets in range (6 tiles, requires LOS).');
        return prev;
      }
      const target = targets.reduce((a, b) =>
        chebyshev(prev.player.pos, a.pos) <= chebyshev(prev.player.pos, b.pos) ? a : b
      );

      const dirs8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      const adjFree = dirs8
        .map(([dy, dx]) => ({ x: target.pos.x + dx, y: target.pos.y + dy }))
        .filter(p => {
          const tile = prev.map[p.y]?.[p.x];
          return tile && PLAYER_PASSABLE_TILES.has(tile.type) &&
            !prev.enemies.some(e => e.id !== target.id && e.pos.x === p.x && e.pos.y === p.y);
        });
      const blinkPos = adjFree.length > 0 ? adjFree[0] : prev.player.pos;

      const _blinkPassives = computeBagPassives(prev.player.inventory);
      const mood = getMood(prev.player.stats.moodValue, prev.player.stats.hp, prev.player.stats.maxHp, prev.player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, false);
      const blinkEffPlayer = applyEquipmentAndPassives({ ...prev.player, pos: blinkPos });
      const boostedPlayer = { ...blinkEffPlayer, pos: blinkPos, stats: { ...blinkEffPlayer.stats, attack: Math.round(blinkEffPlayer.stats.attack * 2) } };

      addLog(`🥷 Blink Strike → ${target.emoji} ${target.name}!`);
      const combatResult = resolveCombat(boostedPlayer, target, addLog, { mood, advantage: _blinkPassives.advantageDice, execBlow: _blinkPassives.execBlow });

      let actuallyKilledX = combatResult.enemyDied;
      const blinkDmg = target.hp - Math.max(0, combatResult.enemyHp);

      const blinkFloats: FloatingText[] = [];
      if (blinkDmg > 0) blinkFloats.push({ id: `blink-e-${target.id}-${prev.turn}`, pos: { ...target.pos }, text: `-${blinkDmg}`, color: '#818cf8', life: 2 });
      const dmgToPlayer = prev.player.stats.hp - combatResult.playerHp;
      if (dmgToPlayer > 0) blinkFloats.push({ id: `blink-p-${prev.turn}`, pos: { ...blinkPos }, text: `-${dmgToPlayer}`, color: '#f97316', life: 2 });

      let newEnemies = [...prev.enemies];
      const targetIdx = newEnemies.findIndex(e => e.id === target.id);
      let newKillCounts = { ...prev.killCounts };
      let ninjaFreeMoves = prev.ninjaFreeMoves ?? 0;
      let newDifficultyTier = prev.difficultyTier ?? 0;

      let newPlayer: Player = {
        ...prev.player,
        pos: blinkPos,
        stats: { ...prev.player.stats, hp: combatResult.playerHp, blinkStrikeCooldown: 8, moodValue: Math.max(-100, prev.player.stats.moodValue - 5) },
      };

      if (combatResult.enemyDied && target.godBlessed) {
        const gb = handleGodBlessedImmunity(target, newEnemies, targetIdx, newPlayer.stats.hp, prev.turn, addLog, blinkFloats);
        if (gb.proc) {
          actuallyKilledX = false;
          newPlayer = { ...newPlayer, stats: { ...newPlayer.stats, hp: gb.newPlayerHp } };
          newEnemies = gb.newEnemies;
          if (gb.newPlayerHp <= 0) {
            return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer: { name: target.name, emoji: target.emoji }, floatingTexts: [...blinkFloats, ...prev.floatingTexts] };
          }
        }
      }

      if (actuallyKilledX) {
        markEnemyKilled(target.emoji);
        newKillCounts[target.emoji] = (newKillCounts[target.emoji] ?? 0) + 1;
        if (targetIdx !== -1) newEnemies.splice(targetIdx, 1);
        newPlayer = applyMonkeyDropOnKill(target, newPlayer);
        const xpGain = target.isBoss ? 25 : 5;
        const oldLevel = newPlayer.stats.level;
        const newXP = newPlayer.stats.xp + xpGain;
        const newLevel = levelFromXP(newXP);
        newPlayer.stats.xp = newXP;
        addLog(`🏆 You defeated ${target.name}! +${xpGain} XP!`);
        if (target.isBoss) {
          addLog(`⬆️ Darkness stirs — enemies grow stronger from here on!`);
          newDifficultyTier = (prev.difficultyTier ?? 0) + 1;
        }
        if (newLevel > oldLevel) {
          newPlayer = applyLevelUp(newPlayer, oldLevel, newLevel, addLog);
        }
        const blinkInstakillX = target.hp >= target.maxHp;
        const currentChainX = prev.player.stats.blinkStrikeInstakillChain ?? 0;
        if (blinkInstakillX && currentChainX < 3) {
          const newChain = currentChainX + 1;
          newPlayer.stats.blinkStrikeCooldown = 0;
          newPlayer.stats.blinkStrikeInstakillChain = newChain;
          addLog(`🥷 Blink Kill! Chain ${newChain}/3 — instant reset!`);
        } else if (blinkInstakillX) {
          newPlayer.stats.blinkStrikeCooldown = 3;
          newPlayer.stats.blinkStrikeInstakillChain = currentChainX;
          addLog(`🥷 Blink Kill! Chain maxed — 3t cooldown.`);
        } else {
          newPlayer.stats.blinkStrikeCooldown = 7;
          newPlayer.stats.blinkStrikeInstakillChain = 0;
          addLog(`🥷 Blink Kill! Cooldown: 7t.`);
        }
        newPlayer.stats.moodValue = Math.min(moodMax('🥷'), prev.player.stats.moodValue + 15);
        const freeMovesGain = prev.stealthMode ? 2 : 1;
        ninjaFreeMoves += freeMovesGain;
        addLog(`🥷 Assassin's Edge — ${freeMovesGain} free move${freeMovesGain > 1 ? 's' : ''}!`);
      } else if (!target.godBlessed || !combatResult.enemyDied) {
        if (targetIdx !== -1) newEnemies[targetIdx] = { ...target, hp: combatResult.enemyHp, engaged: true };
        newPlayer.stats.blinkStrikeInstakillChain = 0;
        addLog(`🥷 Blink Strike — 8 turn cooldown started.`);
      } else {
        newPlayer.stats.blinkStrikeInstakillChain = 0;
        addLog(`🥷 Blink Strike — 8 turn cooldown started.`);
      }

      if (combatResult.playerDied) {
        return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer: { name: target.name, emoji: target.emoji }, floatingTexts: [...blinkFloats, ...prev.floatingTexts] };
      }

      newPlayer.stats.blinkStrikeInstakillOutOfCombat = 0;
      const midState: GameState = { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, killCounts: newKillCounts, difficultyTier: newDifficultyTier, floatingTexts: [...blinkFloats, ...prev.floatingTexts], ninjaFreeMoves };
      return applyEnemyTurns(withVisibility(midState), runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  return { handlePlantBomb, handleFireProjectile, handleBlinkStrikeOnTarget, handleBlinkStrike };
}
