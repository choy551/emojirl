import { isHostileCombatTarget } from './combat';
import { spareLethalHit } from './flashSignals';
import { starXpGain } from './emojiBalance';
import { applyEquippedAttack, applyEquipmentAndPassives } from './inventory';
import { applyLevelUp } from './playerTurn';
import { fireballBlastDamage, grantGenieTransmute, tilesInRadius } from './prestige';
import { GENIE_METEOR_MP, GENIE_METEOR_MULT, GENIE_METEOR_RADIUS } from './prestigeConstants';
import { levelFromXP } from './progression';
import type { Enemy, FloatingText, GameState, Player, Position } from './types';

export interface PendingMeteor {
  x: number;
  y: number;
  landTurn: number;
}

export function meteorArea(center: Position): Position[] {
  return tilesInRadius(center, GENIE_METEOR_RADIUS);
}

/** 250% of attack, then defense, then gear attack percent. */
export function meteorStrikeDamage(player: Player, defense: number): number {
  const geared = applyEquipmentAndPassives(player);
  const raw = fireballBlastDamage(geared.stats.attack, defense, GENIE_METEOR_MULT);
  return applyEquippedAttack(player, raw);
}

export type PlaceMeteorResult =
  | { ok: true; player: Player; meteor: PendingMeteor; log: string }
  | { ok: false; log: string };

/**
 * Spend 4 MP and schedule the blast. `turn` is the turn before this action.
 * The mark is placed as the turn advances, and it lands at the end of the
 * following turn (`landTurn`). Bloodcast never pays this cost.
 */
export function placeMeteor(player: Player, turn: number, center: Position): PlaceMeteorResult {
  if (player.characterClass !== '🧞‍♀️') return { ok: false, log: '☄️ Only a Genie can call a meteor.' };
  const mp = player.stats.mana ?? 0;
  if (mp < GENIE_METEOR_MP) {
    return { ok: false, log: `☄️ Meteor needs ${GENIE_METEOR_MP} MP. Bloodcast cannot pay this.` };
  }
  const next = mp - GENIE_METEOR_MP;
  const max = player.stats.maxMana ?? next;
  return {
    ok: true,
    player: { ...player, stats: { ...player.stats, mana: next } },
    meteor: { x: center.x, y: center.y, landTurn: turn + 2 },
    log: `☄️ Meteor marked a 3×3 at (${center.x}, ${center.y}). It falls next turn. ${next}/${max} MP.`,
  };
}

export function meteorDue(meteor: PendingMeteor | undefined, turn: number): boolean {
  return !!meteor && turn >= meteor.landTurn;
}

export function applyMeteorBlast(args: {
  player: Player;
  enemies: Enemy[];
  center: Position;
  floor: number;
  turn: number;
}): { player: Player; enemies: Enemy[]; logs: string[]; tiles: Position[]; floats: FloatingText[] } {
  const tiles = meteorArea(args.center);
  const inside = new Set(tiles.map(tile => `${tile.x},${tile.y}`));
  const logs = ['☄️ Meteor strikes.'];
  const floats: FloatingText[] = [];
  let player = args.player;
  let roster = args.enemies.map(enemy => ({ ...enemy }));
  const slainForMp: Enemy[] = [];
  for (const enemy of [...roster]) {
    if (!inside.has(`${enemy.pos.x},${enemy.pos.y}`) || enemy.hp <= 0 || !isHostileCombatTarget(enemy)) continue;
    const idx = roster.findIndex(live => live.id === enemy.id);
    if (idx < 0) continue;
    const dealt = meteorStrikeDamage(player, enemy.defense ?? 0);
    const nextHp = enemy.hp - dealt;
    floats.push({
      id: `meteor-${enemy.id}-${args.turn}`,
      pos: { ...enemy.pos },
      text: `-${dealt}`,
      color: '#fb923c',
      life: 2,
    });
    if (nextHp > 0) {
      roster[idx] = { ...roster[idx], hp: nextHp, engaged: true };
      continue;
    }
    const spared = spareLethalHit({
      enemy,
      lethal: true,
      enemies: roster,
      index: idx,
      playerHp: player.stats.hp,
      turn: args.turn,
      log: text => logs.push(text),
      floats,
    });
    if (spared.spared) {
      roster = spared.enemies;
      player = { ...player, stats: { ...player.stats, hp: spared.playerHp } };
      continue;
    }
    roster = roster.filter(live => live.id !== enemy.id);
    slainForMp.push(enemy);
    const xpGain = starXpGain(enemy.isBoss ? 25 : 5, player.stats.xpBoostTurns);
    const oldLevel = player.stats.level;
    player = { ...player, stats: { ...player.stats, xp: player.stats.xp + xpGain } };
    const newLevel = levelFromXP(player.stats.xp);
    if (newLevel > oldLevel) player = applyLevelUp(player, oldLevel, newLevel, text => logs.push(text));
    logs.push(`☄️ ${enemy.emoji} ${enemy.name} is crushed.`);
  }
  const blastMp = grantGenieTransmute(player, slainForMp);
  player = blastMp.player;
  logs.push(...blastMp.logs);
  return { player, enemies: roster, logs, tiles, floats };
}

/** Detonate a mark whose turn has arrived. Earlier turns leave it on the map. */
export function resolvePendingMeteor(state: GameState): GameState {
  if (!meteorDue(state.pendingMeteor, state.turn) || state.gameOver || !state.pendingMeteor) return state;
  const blast = applyMeteorBlast({
    player: state.player,
    enemies: state.enemies,
    center: { x: state.pendingMeteor.x, y: state.pendingMeteor.y },
    floor: state.currentFloor,
    turn: state.turn,
  });
  return {
    ...state,
    pendingMeteor: undefined,
    player: blast.player,
    enemies: blast.enemies,
    pendingExplosion: blast.tiles,
    logs: [
      ...blast.logs.map(text => ({ id: `meteor-${state.turn}-${text}`, text, turn: state.turn })),
      ...state.logs,
    ].slice(0, 24),
    floatingTexts: [...blast.floats, ...state.floatingTexts],
  };
}
