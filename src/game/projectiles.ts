import { ActiveProjectile, Enemy, EmojiItem, FloatingText, Player, Position } from './types';
import { applyEquipmentAndPassives } from './inventory';
import { stolenEmojiSummary } from './monkeyLoot';

const BLOCKING = new Set(['wall', 'tree', 'door-closed', 'volcano']);

export interface ProjectileResolution {
  projectile: ActiveProjectile | null;
  enemies: Enemy[];
  logs: Array<{ id: string; text: string; turn: number }>;
  floats: FloatingText[];
  explosions: Position[];
  beam?: { positions: Position[]; color: string };
  playerDamage: number;
  playerDied: boolean;
  killer?: { name: string; emoji: string };
  stolenReturns: EmojiItem[];
}

function inBounds(map: { length: number; 0?: { length: number } }, x: number, y: number): boolean {
  return y >= 0 && y < map.length && x >= 0 && x < (map[0]?.length ?? 0);
}

function isBlocked(map: { type: string }[][], x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return true;
  return BLOCKING.has(map[y][x].type);
}

function beamColor(kind: ActiveProjectile['kind']): string {
  if (kind === 'gun') return '#ef4444';
  if (kind === 'freeze') return '#93c5fd';
  if (kind === 'bomb') return '#f97316';
  return '#fde68a';
}

function hitIndex(enemies: Enemy[], x: number, y: number): number {
  return enemies.findIndex(e =>
    e.hp > 0 &&
    e.pos.x === x && e.pos.y === y &&
    e.tag !== 'Friendly'
  );
}

function gunDmg(atk: number, def: number): number {
  return Math.max(1, atk - (def ?? 0));
}

function boomDmg(atk: number, def: number, extraBoomerangs: number): number {
  const mult = Math.min(2.0, 1.0 + 0.25 * extraBoomerangs);
  return Math.max(1, Math.floor(atk * mult) - (def ?? 0));
}

/**
 * Resolve a gun / freeze / boomerang / bomb along its whole line in one action.
 * Enemies no longer get a move to step off the lane before the shot arrives.
 */
export function resolveProjectileFlight(
  proj: ActiveProjectile,
  map: { type: string }[][],
  enemiesIn: Enemy[],
  player: Player,
  turn: number,
  extraBoomerangs = 0,
): ProjectileResolution {
  const logs: ProjectileResolution['logs'] = [];
  const floats: FloatingText[] = [];
  const explosions: Position[] = [];
  const beam: Position[] = [];
  const stolenReturns: EmojiItem[] = [];
  const log = (text: string) => logs.push({ id: Math.random().toString(), text, turn });
  const reclaim = (e: Enemy) => {
    if (e.monkey && e.stolenEmojis?.length) {
      stolenReturns.push(...e.stolenEmojis);
      log(`🐒 ${e.name} dropped your ${stolenEmojiSummary(e.stolenEmojis)}!`);
    }
  };

  const atk = applyEquipmentAndPassives(player).stats.attack;
  let enemies = [...enemiesIn];
  let playerDamage = 0;
  let playerDied = false;
  let killer: { name: string; emoji: string } | undefined;
  let x = proj.pos.x;
  let y = proj.pos.y;
  const dx = proj.dir.x;
  const dy = proj.dir.y;

  const applyHit = (idx: number, kind: ActiveProjectile['kind']): boolean => {
    const target = enemies[idx];
    if (kind === 'gun') {
      const dmg = gunDmg(atk, target.defense ?? 0);
      log(`🔫 Bullet hits ${target.emoji} ${target.name} for ${dmg} dmg!`);
      floats.push({ id: `gun-hit-${target.id}-${turn}`, pos: { ...target.pos }, text: `-${dmg}`, color: '#ef4444', life: 2 });
      const newHp = target.hp - dmg;
      if (newHp <= 0) { reclaim(target); enemies.splice(idx, 1); }
      else enemies[idx] = { ...target, hp: newHp, engaged: true };
      return true;
    }
    if (kind === 'freeze') {
      const dmg = gunDmg(atk, target.defense ?? 0);
      log(`❄️ Freeze hits ${target.emoji} ${target.name} for ${dmg} dmg! Frozen for 3 turns!`);
      floats.push({ id: `freeze-hit-${target.id}-${turn}`, pos: { ...target.pos }, text: `❄️-${dmg}`, color: '#93c5fd', life: 2 });
      const newHp = target.hp - dmg;
      if (newHp <= 0) { reclaim(target); enemies.splice(idx, 1); }
      else enemies[idx] = { ...target, hp: newHp, engaged: true, frozenTurns: 3, slowedTurns: 0 };
      return true;
    }
    if (kind === 'boomerang') {
      const dmg = boomDmg(atk, target.defense ?? 0, extraBoomerangs);
      const pct = Math.round(Math.min(2.0, 1.0 + 0.25 * extraBoomerangs) * 100);
      log(`🪃 Boomerang hits ${target.emoji} ${target.name} for ${dmg} dmg! (${pct}% ATK)`);
      floats.push({ id: `boom-hit-${target.id}-${turn}`, pos: { ...target.pos }, text: `-${dmg}`, color: '#fde68a', life: 2 });
      const newHp = target.hp - dmg;
      if (newHp <= 0) { reclaim(target); enemies.splice(idx, 1); }
      else enemies[idx] = { ...target, hp: newHp, engaged: true };
      return true;
    }
    if (kind === 'bomb') {
      const blastPos = { ...target.pos };
      const blastRadius = 1;
      log(`💥 BOOM! Bomb detonates on ${target.emoji} ${target.name}!`);
      floats.push({ id: `bomb-proj-exp-${proj.id}`, pos: { ...blastPos }, text: '💥', color: '#f97316', life: 3 });
      for (let fy = blastPos.y - blastRadius; fy <= blastPos.y + blastRadius; fy++) {
        for (let fx = blastPos.x - blastRadius; fx <= blastPos.x + blastRadius; fx++) {
          if (Math.max(Math.abs(fx - blastPos.x), Math.abs(fy - blastPos.y)) <= blastRadius) {
            explosions.push({ x: fx, y: fy });
          }
        }
      }
      const bombAtk = atk * 2;
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        if (Math.max(Math.abs(e.pos.x - blastPos.x), Math.abs(e.pos.y - blastPos.y)) > blastRadius) continue;
        const dmg = Math.max(1, bombAtk - (e.defense ?? 0));
        log(`💥 Explosion hits ${e.emoji} ${e.name} for ${dmg} dmg!`);
        floats.push({ id: `bomb-proj-hit-${e.id}`, pos: { ...e.pos }, text: `-${dmg}`, color: '#f97316', life: 2 });
        const newHp = e.hp - dmg;
        if (newHp <= 0) { reclaim(e); enemies.splice(ei, 1); }
        else enemies[ei] = { ...e, hp: newHp, engaged: true };
      }
      if (Math.max(Math.abs(player.pos.x - blastPos.x), Math.abs(player.pos.y - blastPos.y)) <= blastRadius) {
        const selfDmg = Math.max(1, bombAtk);
        playerDamage += selfDmg;
        log(`💥 You're caught in your own explosion! -${selfDmg} HP!`);
        floats.push({ id: `bomb-self-${proj.id}`, pos: { ...player.pos }, text: `-${selfDmg}`, color: '#f97316', life: 2 });
        if (player.stats.hp - playerDamage <= 0) {
          playerDied = true;
          killer = { name: 'your own bomb', emoji: '💣' };
        }
      }
      return true;
    }
    return false;
  };

  const maxSteps = proj.phase === 'outgoing'
    ? Math.max(1, proj.maxRange - proj.traveled)
    : Math.max(1, proj.maxRange);
  for (let step = 1; step <= maxSteps; step++) {
    const nx = x + dx;
    const ny = y + dy;
    if (isBlocked(map, nx, ny)) {
      if (proj.kind === 'boomerang') {
        log('🪃 The boomerang returns to your hand!');
      }
      break;
    }
    x = nx;
    y = ny;
    beam.push({ x, y });
    const idx = hitIndex(enemies, x, y);
    if (idx !== -1) {
      applyHit(idx, proj.kind);
      if (proj.kind === 'boomerang') log('🪃 The boomerang returns to your hand!');
      break;
    }
    if (step === maxSteps && proj.kind === 'boomerang') {
      log('🪃 The boomerang returns to your hand!');
    }
  }

  return {
    projectile: null,
    enemies,
    logs,
    floats,
    explosions,
    beam: beam.length > 0 ? { positions: beam, color: beamColor(proj.kind) } : undefined,
    playerDamage,
    playerDied,
    killer,
    stolenReturns,
  };
}
