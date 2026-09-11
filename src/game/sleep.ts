import { Enemy, GameState, Player } from './types';
import { chebyshev } from './geo';
import { applyEquipmentAndPassives } from './inventory';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';

export const SLEEP_TURNS = 100;
/** Rest sets HP to this multiple of max HP (bar rest is 1.5). */
export const BED_OVERHEAL_MULT = 2;

export function isSleepThreat(e: Enemy): boolean {
  if (e.isRecruited || e.tag === 'Friendly') return false;
  if (e.isAdventurer && !e.engaged) return false;
  if (e.monkey && !e.engaged) return false;
  if (e.bear && !e.engaged && e.tag !== 'Hostile') return false;
  return true;
}

/** Double the normal melee hit. No dodge — the player is asleep. */
export function sneakAttackDamage(player: Player, enemy: Enemy): number {
  const effective = applyEquipmentAndPassives(player);
  const base = Math.max(1, enemy.attack - Math.floor((effective.stats.defense ?? 0) / 2));
  return base * 2;
}

export function applyBedRest(player: Player): Player {
  const maxHp = player.stats.maxHp;
  const isWizard = player.characterClass === '🧙';
  return {
    ...player,
    trailblazerCooldown: 0,
    stats: {
      ...player.stats,
      hp: Math.floor(maxHp * BED_OVERHEAL_MULT),
      overhealDecayTick: 0,
      blinkStrikeCooldown: 0,
      ...(isWizard ? { mana: player.stats.maxMana ?? 4 } : {}),
    },
  };
}

export interface SleepResult {
  state: GameState;
  wokeBy: Enemy | null;
  turnsSlept: number;
}

/**
 * Advance the dungeon `turns` times while the player stays put.
 * Enemies still move; they do not make normal attacks. The first hostile to
 * end a turn adjacent delivers one 200% sneak attack and wakes the player.
 */
export function simulateSleep(state: GameState, turns = SLEEP_TURNS): SleepResult {
  let s = state;
  for (let i = 0; i < turns; i++) {
    s = { ...s, turn: s.turn + 1 };
    s = applyEnemyTurns(s, runEnemyTurns(s, undefined, true));
    if (s.gameOver) {
      return { state: s, wokeBy: null, turnsSlept: i + 1 };
    }
    const finder = s.enemies.find(e => isSleepThreat(e) && chebyshev(e.pos, s.player.pos) <= 1);
    if (finder) {
      const dmg = sneakAttackDamage(s.player, finder);
      const hp = Math.max(0, s.player.stats.hp - dmg);
      const died = hp <= 0;
      return {
        turnsSlept: i + 1,
        wokeBy: finder,
        state: {
          ...s,
          player: { ...s.player, stats: { ...s.player.stats, hp } },
          gameOver: died,
          killer: died ? (s.killer ?? { name: finder.name, emoji: finder.emoji }) : s.killer,
          floatingTexts: [
            { id: `sneak-${finder.id}-${s.turn}`, pos: { ...s.player.pos }, text: `-${dmg}`, color: '#dc2626', life: 3 },
            ...s.floatingTexts,
          ],
          logs: [
            { id: `sneak-${s.turn}`, text: `💤 ${finder.emoji} ${finder.name} sneak-attacks you for ${dmg} (200%)! You wake!`, turn: s.turn },
            ...s.logs,
          ].slice(0, 24),
        },
      };
    }
  }
  return { state: s, wokeBy: null, turnsSlept: turns };
}
