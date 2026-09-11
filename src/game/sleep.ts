import { Enemy, GameState, MapGrid, Player, Position, Tile } from './types';
import { chebyshev } from './geo';
import { applyEquipmentAndPassives, computeBagPassives } from './inventory';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import { hasLineOfSight, visionRadiusFor } from './vision';
import { BED_EMOJI, BED_MAX_USES } from './tiles';

export { BED_MAX_USES };

export const SLEEP_TURNS = 100;
/** Rest sets HP to this multiple of max HP (bar rest is 1.5). */
export const BED_OVERHEAL_MULT = 2;

export function makeBedTile(seen = false, visible = false): Tile {
  return { type: 'bed', emoji: BED_EMOJI, seen, visible, usesLeft: BED_MAX_USES };
}

/** Missing `usesLeft` (old saves) counts as a fresh bed. */
export function bedUsesLeft(tile: Tile | undefined): number {
  if (!tile || tile.type !== 'bed') return 0;
  return tile.usesLeft ?? BED_MAX_USES;
}

export function consumeBedUse(map: MapGrid, pos: Position): MapGrid {
  return map.map((row, y) =>
    row.map((tile, x) => {
      if (x !== pos.x || y !== pos.y || tile.type !== 'bed') return tile;
      return { ...tile, usesLeft: Math.max(0, bedUsesLeft(tile) - 1) };
    })
  );
}

export function findSleepThreatInSight(state: GameState): Enemy | undefined {
  const { player, map, enemies } = state;
  const radius = Math.max(
    1,
    visionRadiusFor(player.characterClass, player.stats.level) + computeBagPassives(player.inventory).losBonus,
  );
  return enemies.find(e =>
    isSleepThreat(e) &&
    chebyshev(e.pos, player.pos) <= radius &&
    hasLineOfSight(map, player.pos, e.pos)
  );
}

export type BedSleepCheck =
  | { ok: true; usesLeft: number }
  | { ok: false; reason: 'worn' | 'threat'; usesLeft: number; threat?: Enemy };

export function evaluateBedSleep(state: GameState): BedSleepCheck {
  const tile = state.map[state.player.pos.y]?.[state.player.pos.x];
  const usesLeft = bedUsesLeft(tile);
  if (usesLeft <= 0) return { ok: false, reason: 'worn', usesLeft: 0 };
  const threat = findSleepThreatInSight(state);
  if (threat) return { ok: false, reason: 'threat', usesLeft, threat };
  return { ok: true, usesLeft };
}

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
