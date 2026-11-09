import type { Enemy, MapGrid, Player, Position } from './types';
import { chebyshev } from './geo';
import { isHostileCombatTarget } from './combat';
import { gunshotPlan, isArcaneCaster, isHitman, isRoyalGuard } from './prestige';
import { chooseGuardShot } from './royalGuard';
import { bfsStepToward, hasLOS, hasLOSBetween } from './pathfinding';
import { PLAYER_PASSABLE_TILES } from './tiles';
import { eagleEyeRange, VISION_RADIUS } from './vision';
import { voidRangedSpend } from './voidAttackCost';

/** Refuse autofight when current HP is strictly below half of max HP. */
export const AUTOFIGHT_HP_FRACTION = 0.5;
export const NO_ENEMIES_LOG = 'No enemies in sight.';
export const LOW_HP_LOG = 'Too injured to autofight — below 50% HP.';

export type AutofightAction =
  | { kind: 'idle'; log: string }
  | { kind: 'move'; dx: number; dy: number; log?: string }
  | { kind: 'wait'; log?: string };

const DIRS: [number, number][] = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

export interface AutofightInput {
  player: Player;
  map: MapGrid;
  enemies: Enemy[];
  maxHp: number;
  rangerMode?: 'ranged' | 'melee' | 'flee';
  voidAttackMode?: 'melee' | 'ranger' | 'wizard';
  /** Depth bosses beaten. Void HP prices use this, not the floor number. */
  voidBossesCleared?: number;
  holdFire?: boolean;
}

function keyOf(p: Position): string {
  return `${p.x},${p.y}`;
}

function onEightLine(from: Position, to: Position): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return false;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}

function clearShot(map: MapGrid, from: Position, enemy: Position, range: number): boolean {
  if (!onEightLine(from, enemy)) return false;
  const dist = Math.max(Math.abs(enemy.x - from.x), Math.abs(enemy.y - from.y));
  if (dist < 2 || dist > range) return false;
  return hasLOS(map, from, Math.sign(enemy.x - from.x), Math.sign(enemy.y - from.y), dist);
}

function passableFor(): Set<string> {
  return PLAYER_PASSABLE_TILES;
}

function occupied(enemies: Enemy[], exceptId?: string): Set<string> {
  const set = new Set<string>();
  for (const e of enemies) {
    if (e.hp <= 0 || e.id === exceptId) continue;
    set.add(keyOf(e.pos));
  }
  return set;
}

/** Same foes Tab autofight will chase: living hostiles on a visible tile. */
export function foesInSight(map: MapGrid, enemies: Enemy[]): Enemy[] {
  return enemies.filter(e =>
    e.hp > 0
    && isHostileCombatTarget(e)
    && !!map[e.pos.y]?.[e.pos.x]?.visible,
  );
}

function visibleHostiles(input: AutofightInput): Enemy[] {
  return foesInSight(input.map, input.enemies);
}

function nearest(from: Position, foes: Enemy[]): Enemy {
  return [...foes].sort((a, b) => chebyshev(from, a.pos) - chebyshev(from, b.pos) || a.id.localeCompare(b.id))[0];
}

function styleOf(input: AutofightInput): 'melee' | 'ranged' | 'wizard' {
  const cls = input.player.characterClass;
  const voidMode = input.voidAttackMode ?? 'melee';
  if (input.holdFire) return 'melee';
  if (isArcaneCaster(cls) || (cls === '👤' && voidMode === 'wizard')) return 'wizard';
  if ((cls === '🧝' || isRoyalGuard(cls)) && input.rangerMode === 'ranged') return 'ranged';
  if (cls === '👤' && voidMode === 'ranger') return 'ranged';
  if ((cls === '🤠' || isHitman(cls)) && gunshotPlan(input.player)) return 'ranged';
  return 'melee';
}

function shotRange(input: AutofightInput): number {
  return gunshotPlan(input.player)?.range ?? eagleEyeRange(input.player.stats.level);
}

function voidSpend(input: AutofightInput, style: 'wizard' | 'ranger') {
  return voidRangedSpend({
    style,
    hp: input.player.stats.hp,
    maxHp: input.maxHp,
    ammo: input.player.ammo ?? 0,
    bossesCleared: input.voidBossesCleared ?? input.player.voidBossesCleared ?? 0,
  });
}

/** Bow or gun in one hand and a blade in the other. */
function hybridLoadout(player: Player): boolean {
  const hands = [player.equipment.mainHand, player.equipment.offHand];
  const ranged = hands.some(item => item?.weaponKind === 'bow' || item?.weaponKind === 'gun');
  const blade = hands.some(item => item?.weaponKind === 'blade');
  return ranged && blade;
}

/** First step toward the nearest tile that satisfies `goal`. */
function stepToGoal(
  map: MapGrid,
  from: Position,
  passable: Set<string>,
  blocked: Set<string>,
  goal: (p: Position) => boolean,
): Position | null {
  const queue: { pos: Position; first: Position }[] = [];
  const seen = new Set<string>([keyOf(from)]);
  for (const [dx, dy] of DIRS) {
    const p = { x: from.x + dx, y: from.y + dy };
    if (!map[p.y]?.[p.x] || !passable.has(map[p.y][p.x].type)) continue;
    const k = keyOf(p);
    if (seen.has(k) || blocked.has(k)) continue;
    seen.add(k);
    queue.push({ pos: p, first: p });
  }
  while (queue.length > 0) {
    const { pos, first } = queue.shift()!;
    if (goal(pos)) return first;
    for (const [dx, dy] of DIRS) {
      const p = { x: pos.x + dx, y: pos.y + dy };
      if (!map[p.y]?.[p.x] || !passable.has(map[p.y][p.x].type)) continue;
      const k = keyOf(p);
      if (seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      queue.push({ pos: p, first });
    }
  }
  return null;
}

function asMove(from: Position, to: Position): AutofightAction {
  return { kind: 'move', dx: to.x - from.x, dy: to.y - from.y };
}

function melee(input: AutofightInput, foe: Enemy): AutofightAction {
  const from = input.player.pos;
  if (chebyshev(from, foe.pos) === 1) {
    return { kind: 'move', dx: foe.pos.x - from.x, dy: foe.pos.y - from.y };
  }
  const next = bfsStepToward(input.map, from, foe.pos, occupied(input.enemies, foe.id), passableFor());
  return next ? asMove(from, next) : { kind: 'idle', log: NO_ENEMIES_LOG };
}

/**
 * One Tab press. `idle` spends no turn. `move` is one step, a bump, or a
 * shot direction the existing move handler already fires. `wait` is a wizard
 * already at the edge of range, so the bolt casts in place.
 */
export function planAutofight(input: AutofightInput): AutofightAction {
  const hp = input.player.stats.hp;
  const maxHp = Math.max(1, input.maxHp);
  if (hp / maxHp < AUTOFIGHT_HP_FRACTION) return { kind: 'idle', log: LOW_HP_LOG };

  const foes = visibleHostiles(input);
  if (foes.length === 0) return { kind: 'idle', log: NO_ENEMIES_LOG };
  const foe = nearest(input.player.pos, foes);
  const style = styleOf(input);
  const from = input.player.pos;

  if (style === 'ranged') {
    // Close hybrids step in and swing. Lining up a shot only starts past 2 tiles.
    if (hybridLoadout(input.player) && chebyshev(from, foe.pos) <= 2) {
      return melee(input, foe);
    }
    const guns = gunshotPlan(input.player);
    const ammo = input.player.ammo ?? 0;
    const voidRanger = input.player.characterClass === '👤';
    const armed = isRoyalGuard(input.player.characterClass)
      ? chooseGuardShot(input.player) !== null
      : voidRanger
        ? voidSpend(input, 'ranger').kind !== 'melee'
        : (guns ? ammo >= guns.ammoCost : ammo > 0);
    const range = shotRange(input);
    if (armed && clearShot(input.map, from, foe.pos, range)) {
      return {
        kind: 'move',
        dx: Math.sign(foe.pos.x - from.x),
        dy: Math.sign(foe.pos.y - from.y),
      };
    }
    if (armed) {
      const blocked = occupied(input.enemies);
      const step = stepToGoal(input.map, from, passableFor(), blocked, (p) => clearShot(input.map, p, foe.pos, range));
      if (step) return asMove(from, step);
    }
    if (voidRanger) {
      const spend = voidSpend(input, 'ranger');
      const step = melee(input, foe);
      if (spend.kind !== 'melee' || step.kind !== 'move') return step;
      const lined = clearShot(input.map, from, foe.pos, range)
        && step.dx === Math.sign(foe.pos.x - from.x)
        && step.dy === Math.sign(foe.pos.y - from.y);
      return lined ? step : { ...step, log: spend.log };
    }
    return melee(input, foe);
  }

  if (style === 'wizard') {
    const dist = chebyshev(from, foe.pos);
    const mana = input.player.stats.mana ?? 0;
    const voidWizard = input.player.characterClass === '👤';
    const pay = voidWizard ? voidSpend(input, 'wizard') : null;
    if (pay?.kind === 'melee') {
      const step = melee(input, foe);
      if (step.kind === 'move' && chebyshev(from, foe.pos) === 1) return { ...step, log: pay.log };
      return step;
    }
    const canCast = !input.holdFire && (voidWizard ? pay?.kind === 'hp' : mana > 0)
      && dist > 1 && dist <= VISION_RADIUS
      && hasLOSBetween(input.map, from, foe.pos);
    if (canCast) {
      let best: Position | null = null;
      let bestDist = dist;
      for (const [dx, dy] of DIRS) {
        const p = { x: from.x + dx, y: from.y + dy };
        const tile = input.map[p.y]?.[p.x];
        if (!tile || !passableFor().has(tile.type)) continue;
        if (occupied(input.enemies).has(keyOf(p))) continue;
        const d = chebyshev(p, foe.pos);
        if (d > bestDist && d <= VISION_RADIUS && hasLOSBetween(input.map, p, foe.pos)) {
          bestDist = d;
          best = p;
        }
      }
      if (best) return asMove(from, best);
      return { kind: 'wait' };
    }
    const blocked = occupied(input.enemies);
    const ring = stepToGoal(input.map, from, passableFor(), blocked, (p) =>
      chebyshev(p, foe.pos) === VISION_RADIUS && hasLOSBetween(input.map, p, foe.pos),
    );
    if (ring) return asMove(from, ring);
    return melee(input, foe);
  }

  return melee(input, foe);
}
