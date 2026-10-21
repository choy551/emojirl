import { useCallback } from 'react';
import { GameState, Player, FloatingText, PlacedBomb, ActiveProjectile } from '../../game/types';
import { resolveCombat, isHostileCombatTarget } from '../../game/combat';
import {
  addBlinkMarks,
  blinkLifestealHeal,
  blinkMeleeChargesAfterCast,
  blinkStrikeTargetCount,
  creditsForBlinkTarget,
  grantBlinkCredits,
  resolveBlinkCooldown,
} from '../../game/blinkStrike';
import { playerMood } from '../../game/drinks';
import { markEnemyKilled } from '../../game/discoveries';
import {
  moodMax, chebyshev, hasLOSBetween, PLAYER_PASSABLE_TILES, playerBagPassives,
  applyEquipmentAndPassives, removeAndRefillBag, withVisibility, runEnemyTurns, applyEnemyTurns,
  handleGodBlessedImmunity, levelFromXP, livingMaxHp,
} from '../../game/gameHelpers';
import { spendChargeGhostByKind } from '../../game/voidCharge';
import { applyLevelUp } from '../../game/playerTurn';
import { creditVoidBoss } from '../../game/voidDamage';
import { noteThemedHotbarConsume } from '../../game/voidAbilities';
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
      if (prev.player.characterClass === '👤') {
        const shot = spendChargeGhostByKind(prev.player, kind);
        if (!shot.ok) {
          addLog(shot.refusal ?? `👤 No ${kindEmoji} ghost to spend.`);
          return prev;
        }
        const throwLabel = kind === 'boomerang' ? 'throw the boomerang' : kind === 'bomb' ? 'throw the bomb' : kind === 'gun' ? 'fire the gun' : 'fire a freeze bolt';
        const bankBoomerangs = kind === 'boomerang' ? prev.player.bank.filter(it => it.activeKind === 'boomerang' && !it.consumed).length : 0;
        const boomerangPct = Math.round(Math.min(2.0, 1.0 + 0.25 * bankBoomerangs) * 100);
        addLog(`${kindEmoji} You ${throwLabel}!${kind === 'boomerang' && bankBoomerangs > 0 ? ` (${boomerangPct}% ATK — ${bankBoomerangs} extra in Bank)` : ''}`);
        if (shot.uses === 0) addLog(`👤 ${kindEmoji} ghost is spent. Consume another to recharge it.`);
        const proj: ActiveProjectile = {
          id: `proj-${Math.random()}`,
          kind,
          pos: { ...prev.player.pos },
          dir: { x: dx, y: dy },
          phase: 'outgoing',
          maxRange: kind === 'boomerang' ? 5 : 8,
          traveled: 0,
        };
        const midState = { ...prev, player: shot.player, activeProjectile: proj, turn: prev.turn + 1 };
        return applyEnemyTurns(midState, runEnemyTurns(midState));
      }
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
      let themeLogs = prev.logs;
      if (prev.player.characterClass === '👤') {
        const themed = noteThemedHotbarConsume(item);
        if (themed) {
          themeLogs = [{ id: `void-theme-${prev.turn}-${item.id}`, text: themed.text, turn: prev.turn }, ...prev.logs].slice(0, 24);
        }
      }
      const midState = { ...prev, logs: themeLogs, player: { ...prev.player, inventory: newInv, bank: newProjBank }, activeProjectile: proj, turn: prev.turn + 1 };
      return applyEnemyTurns(midState, runEnemyTurns(midState));
    });
  }, [addLog, setGameState]);

  const blinkInRange = (prev: GameState, enemy: GameState['enemies'][number]) => {
    const dist = chebyshev(prev.player.pos, enemy.pos);
    return dist >= 1 && dist <= 6 && hasLOSBetween(prev.map, prev.player.pos, enemy.pos) && !!prev.map[enemy.pos.y]?.[enemy.pos.x]?.visible
      && isHostileCombatTarget(enemy);
  };

  const executeBlinkStrike = useCallback((prev: GameState, primary: GameState['enemies'][number]): GameState => {
    const talents = prev.player.stats.blinkTalents;
    const want = blinkStrikeTargetCount(talents);
    const extras = want > 1
      ? prev.enemies
        .filter(e => e.id !== primary.id && blinkInRange(prev, e))
        .sort((a, b) => chebyshev(prev.player.pos, a.pos) - chebyshev(prev.player.pos, b.pos))
        .slice(0, want - 1)
      : [];
    const targets = [primary, ...extras];

    const dirs8: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    const adjFree = dirs8
      .map(([dy, dx]) => ({ x: primary.pos.x + dx, y: primary.pos.y + dy }))
      .filter(p => {
        const tile = prev.map[p.y]?.[p.x];
        return tile && PLAYER_PASSABLE_TILES.has(tile.type) &&
          !prev.enemies.some(e => e.id !== primary.id && e.pos.x === p.x && e.pos.y === p.y);
      });
    const blinkPos = adjFree.length > 0 ? adjFree[0] : prev.player.pos;

    const _blinkPassives = playerBagPassives(prev.player);
    const mood = playerMood(prev.player);

    addLog(`🥷 Blink Strike → ${targets.map(t => `${t.emoji} ${t.name}`).join(' & ')}!`);

    let newEnemies = [...prev.enemies];
    let newKillCounts = { ...prev.killCounts };
    let ninjaFreeMoves = prev.ninjaFreeMoves ?? 0;
    let newDifficultyTier = prev.difficultyTier ?? 0;
    let runningHp = prev.player.stats.hp;
    let xp = prev.player.stats.xp;
    let level = prev.player.stats.level;
    let maxHp = prev.player.stats.maxHp;
    let maxMana = prev.player.stats.maxMana;
    let mana = prev.player.stats.mana;
    let anyKill = false;
    let anyInstakill = false;
    let totalDmg = 0;
    let immediateCredits = 0;
    const markIds: string[] = [];
    const blinkFloats: FloatingText[] = [];
    let playerDied = false;
    let killer = { name: primary.name, emoji: primary.emoji };
    let inventory = prev.player.inventory;
    let bank = prev.player.bank;
    const slainBosses: GameState['enemies'] = [];

    for (const target of targets) {
      const striker = applyEquipmentAndPassives({
        ...prev.player,
        pos: blinkPos,
        inventory,
        bank,
        stats: { ...prev.player.stats, hp: runningHp, xp, level },
      });
      const combatResult = resolveCombat(striker, target, addLog, {
        mood,
        advantage: _blinkPassives.advantageDice,
        execBlow: _blinkPassives.execBlow,
        blinkStrike: true,
      });
      let actuallyKilled = combatResult.enemyDied;
      const blinkDmg = target.hp - Math.max(0, combatResult.enemyHp);
      totalDmg += Math.max(0, blinkDmg);
      if (blinkDmg > 0) blinkFloats.push({ id: `blink-e-${target.id}-${prev.turn}`, pos: { ...target.pos }, text: `-${blinkDmg}`, color: '#818cf8', life: 2 });
      runningHp = combatResult.playerHp;

      let targetIdx = newEnemies.findIndex(e => e.id === target.id);
      if (combatResult.enemyDied && target.godBlessed && targetIdx !== -1) {
        const gb = handleGodBlessedImmunity(target, newEnemies, targetIdx, runningHp, prev.turn, addLog, blinkFloats);
        if (gb.proc) {
          actuallyKilled = false;
          runningHp = gb.newPlayerHp;
          newEnemies = gb.newEnemies;
          targetIdx = newEnemies.findIndex(e => e.id === target.id);
          if (runningHp <= 0) playerDied = true;
        }
      }

      const instakill = actuallyKilled && target.hp >= target.maxHp;
      const credit = creditsForBlinkTarget(instakill, actuallyKilled);
      immediateCredits += credit.immediate;
      if (credit.mark) markIds.push(target.id);

      if (actuallyKilled) {
        anyKill = true;
        if (instakill) anyInstakill = true;
        markEnemyKilled(target.emoji);
        newKillCounts[target.emoji] = (newKillCounts[target.emoji] ?? 0) + 1;
        if (targetIdx !== -1) newEnemies.splice(targetIdx, 1);
        const dropped = applyMonkeyDropOnKill(target, { ...prev.player, inventory, bank, stats: { ...prev.player.stats, hp: runningHp, xp, level } });
        inventory = dropped.inventory;
        bank = dropped.bank;
        const xpGain = target.isBoss ? 25 : 5;
        const oldLevel = level;
        xp += xpGain;
        const newLevel = levelFromXP(xp);
        addLog(`🏆 You defeated ${target.name}! +${xpGain} XP!`);
        if (target.isBoss) {
          addLog(`⬆️ Darkness stirs — enemies grow stronger from here on!`);
          newDifficultyTier += 1;
          slainBosses.push(target);
        }
        if (newLevel > oldLevel) {
          const leveled = applyLevelUp(
            { ...prev.player, inventory, bank, stats: { ...prev.player.stats, hp: runningHp, xp, level: oldLevel, maxHp, maxMana, mana } },
            oldLevel,
            newLevel,
            addLog,
          );
          inventory = leveled.inventory;
          bank = leveled.bank;
          runningHp = leveled.stats.hp;
          level = leveled.stats.level;
          xp = leveled.stats.xp;
          maxHp = leveled.stats.maxHp;
          maxMana = leveled.stats.maxMana;
          mana = leveled.stats.mana;
        } else {
          level = newLevel;
        }
      } else if (targetIdx !== -1) {
        const live = newEnemies[targetIdx];
        const blinkLanded = combatResult.enemyHp < target.hp && live.hp > 1;
        const hp = live.godBlessed === false && target.godBlessed ? live.hp : combatResult.enemyHp;
        const blinkBurn = blinkLanded && _blinkPassives.burningOnHit && hp > 0 ? { burningTurns: 3 } : {};
        if (blinkLanded && _blinkPassives.burningOnHit) addLog(`🔥 ${target.emoji} is ignited!`);
        if (live.hp > 0) {
          newEnemies[targetIdx] = { ...live, hp: live.hp === 1 && target.godBlessed ? live.hp : hp, engaged: true, ...blinkBurn };
        }
      }

      if (playerDied || runningHp <= 0 || combatResult.playerDied) {
        playerDied = true;
        killer = { name: target.name, emoji: target.emoji };
        break;
      }
    }

    const dmgToPlayer = prev.player.stats.hp - runningHp;
    if (dmgToPlayer > 0) blinkFloats.push({ id: `blink-p-${prev.turn}`, pos: { ...blinkPos }, text: `-${dmgToPlayer}`, color: '#f97316', life: 2 });

    const heal = runningHp > 0 ? blinkLifestealHeal(totalDmg, talents) : 0;
    const pool = livingMaxHp(prev.player);
    if (heal > 0 && runningHp < pool) {
      const gained = Math.min(heal, pool - runningHp);
      if (gained > 0) {
        runningHp += gained;
        addLog(`🥷 Blink lifesteal +${gained} HP.`);
        blinkFloats.push({ id: `blink-ls-${prev.turn}`, pos: { ...blinkPos }, text: `+${gained}`, color: '#f472b6', life: 2 });
      }
    }

    const cd = resolveBlinkCooldown({
      talents,
      killed: anyKill,
      instakill: anyInstakill,
      chain: prev.player.stats.blinkStrikeInstakillChain ?? 0,
    });
    addLog(cd.log);
    if (anyKill) {
      const freeMovesGain = prev.stealthMode ? 2 : 1;
      ninjaFreeMoves += freeMovesGain;
      addLog(`🥷 Assassin's Edge — ${freeMovesGain} free move${freeMovesGain > 1 ? 's' : ''}!`);
    }

    let newPlayer: Player = {
      ...prev.player,
      pos: blinkPos,
      inventory,
      bank,
      stats: {
        ...prev.player.stats,
        hp: runningHp,
        xp,
        level,
        maxHp,
        maxMana,
        mana,
        blinkStrikeCooldown: cd.cooldown,
        blinkStrikeInstakillChain: cd.chain,
        blinkStrikeInstakillOutOfCombat: 0,
        moodValue: anyKill
          ? Math.min(moodMax('🥷'), prev.player.stats.moodValue + 15)
          : Math.max(-100, prev.player.stats.moodValue - 5),
        blinkMeleeCdCharges: blinkMeleeChargesAfterCast(talents),
      },
    };
    const granted = grantBlinkCredits(newPlayer, immediateCredits);
    granted.logs.forEach(addLog);
    newPlayer = granted.player;
    if (markIds.length) {
      newPlayer = {
        ...newPlayer,
        stats: {
          ...newPlayer.stats,
          blinkStrikeMarks: addBlinkMarks(newPlayer.stats.blinkStrikeMarks, markIds, prev.turn + 1),
        },
      };
    }

    if (playerDied) {
      return { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, gameOver: true, killer, killCounts: newKillCounts, difficultyTier: newDifficultyTier, floatingTexts: [...blinkFloats, ...prev.floatingTexts], ninjaFreeMoves };
    }

    let midState: GameState = { ...prev, player: newPlayer, enemies: newEnemies, turn: prev.turn + 1, killCounts: newKillCounts, difficultyTier: newDifficultyTier, floatingTexts: [...blinkFloats, ...prev.floatingTexts], ninjaFreeMoves };
    for (const boss of slainBosses) midState = creditVoidBoss(midState, boss);
    return applyEnemyTurns(withVisibility(midState), runEnemyTurns(midState));
  }, [addLog, applyMonkeyDropOnKill]);

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
      if (!isHostileCombatTarget(target)) {
        addLog(`🥷 Blink Strike — ${target.name} is not hostile.`);
        return prev;
      }
      if (!blinkInRange(prev, target)) {
        addLog('🥷 Blink Strike — target out of range or LOS broken.');
        return prev;
      }
      return executeBlinkStrike(prev, target);
    });
  }, [addLog, executeBlinkStrike, setGameState]);

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
          && isHostileCombatTarget(e);
      });
      if (targets.length === 0) {
        addLog('🥷 Blink Strike — no targets in range (6 tiles, requires LOS).');
        return prev;
      }
      const target = targets.reduce((a, b) =>
        chebyshev(prev.player.pos, a.pos) <= chebyshev(prev.player.pos, b.pos) ? a : b
      );
      return executeBlinkStrike(prev, target);
    });
  }, [addLog, executeBlinkStrike, setGameState]);

  return { handlePlantBomb, handleFireProjectile, handleBlinkStrikeOnTarget, handleBlinkStrike };
}
