import type { Enemy, Equipment, Player, Position } from './types';
import {
  COWBOY,
  FENCER,
  FENCER_BACKDASH_CD,
  FENCER_BASE_EVA,
  FENCER_CRIT_AT_EMPTY,
  FENCER_CRIT_AT_FULL,
  FENCER_EVA_AT_EMPTY,
  FENCER_EVA_AT_FULL,
  FENCER_EVA_CAP,
  FENCER_FLOURISH_EVERY,
  FENCER_FLOURISH_MULT,
  FENCER_LUNGE_CD,
  FENCER_LUNGE_RANGE,
  FENCER_RIPOSTE_MULT,
  GENIE,
  GENIE_BASE_MP,
  GENIE_BLOODCAST_HP_PER_MP,
  GENIE_FIREBALL_MP,
  GENIE_OVERCHANNEL_EXTRA_MP,
  GENIE_OVERCHANNEL_LEVEL,
  GENIE_OVERCHANNEL_MULT,
  GENIE_TRANSMUTE_MP,
  GUARDIAN_INCOMING_MULT,
  GUARDIAN_STANCE_CD,
  GUARDIAN_STANCE_DEF,
  GUARDIAN_STANCE_TURNS,
  HITMAN,
  HITMAN_CONTRACT_BULLETS,
  HITMAN_CONTRACT_GOLD_BASE,
  HITMAN_CONTRACT_GOLD_PER_FLOOR,
  HITMAN_CONTRACT_KILLS,
  HITMAN_DUAL_MULT,
  HITMAN_DUAL_RANGE,
  HITMAN_EXECUTE_BULLETS,
  HITMAN_EXECUTE_CD,
  HITMAN_EXECUTE_GOLD,
  HITMAN_EXECUTE_HP_PCT,
  HITMAN_EXECUTE_MULT,
  HITMAN_EXECUTE_RANGE,
  HITMAN_SINGLE_MULT,
  HITMAN_SINGLE_RANGE,
  RANGER,
  ROYAL_AURA_DEF,
  ROYAL_BARE_MELEE_MULT,
  ROYAL_CROWN_DEF,
  ROYAL_CROWN_LUCK,
  ROYAL_GUARD,
  ROYAL_PIERCE_FRACTION,
  ROYAL_SWORD_MELEE_MULT,
  WIZARD,
} from './prestigeConstants';
import { PLAYER_PASSABLE_TILES } from './tiles';

function isFoe(e: Enemy): boolean {
  if (e.hp <= 0 || e.isSpectator || e.isRecruited) return false;
  if (e.tag === 'Friendly') return false;
  if (e.tag === 'Neutral' && !e.engaged) return false;
  return true;
}

export function isGenie(cls: string): boolean { return cls === GENIE; }
export function isFencer(cls: string): boolean { return cls === FENCER; }
export function isHitman(cls: string): boolean { return cls === HITMAN; }
export function isRoyalGuard(cls: string): boolean { return cls === ROYAL_GUARD; }
export function isArcaneCaster(cls: string): boolean { return cls === WIZARD || cls === GENIE; }
export function classFlies(cls: string): boolean { return cls === GENIE || cls === HITMAN; }
export function usesBullets(cls: string): boolean { return cls === COWBOY || cls === HITMAN || cls === ROYAL_GUARD; }
export function usesArrows(cls: string): boolean { return cls === RANGER || cls === ROYAL_GUARD; }
export function isTrailblazer(cls: string): boolean { return cls === RANGER || cls === ROYAL_GUARD; }

export function ammoNoun(cls: string): 'bullets' | 'arrows' | 'ammo' {
  if (cls === ROYAL_GUARD) return 'ammo';
  if (usesBullets(cls)) return 'bullets';
  return 'arrows';
}

export function ammoIcon(cls: string, equipment?: Equipment): string {
  if (cls === ROYAL_GUARD) {
    const gun = equipment?.mainHand?.weaponKind === 'gun' || equipment?.offHand?.weaponKind === 'gun';
    const bow = equipment?.mainHand?.weaponKind === 'bow' || equipment?.offHand?.weaponKind === 'bow';
    if (gun && !bow) return '🪙';
    if (bow && !gun) return '🏹';
    return '🎯';
  }
  return usesBullets(cls) ? '🪙' : '🏹';
}

export interface GunshotPlan {
  ammoCost: number;
  range: number;
  damageMult: number;
  label: string;
}

/** Ranged auto-shot. Cowboy shoots only with two guns. Hitman shoots one or two. */
export function gunshotPlan(player: Player): GunshotPlan | null {
  const main = player.equipment.mainHand?.weaponKind === 'gun';
  const off = player.equipment.offHand?.weaponKind === 'gun';
  const guns = (main ? 1 : 0) + (off ? 1 : 0);
  const ammo = player.ammo ?? 0;
  if (player.characterClass === COWBOY) {
    if (guns === 2 && ammo >= 2) {
      return { ammoCost: 2, range: 4, damageMult: 1, label: '🤠 Dual guns — BANG BANG!' };
    }
    return null;
  }
  if (player.characterClass === HITMAN) {
    if (guns === 2 && ammo >= 2) {
      return { ammoCost: 2, range: HITMAN_DUAL_RANGE, damageMult: HITMAN_DUAL_MULT, label: '🕴️ Dual guns — suppressed pair (−25%).' };
    }
    if (guns === 1 && ammo >= 1) {
      return { ammoCost: 1, range: HITMAN_SINGLE_RANGE, damageMult: HITMAN_SINGLE_MULT, label: '🕴️ Sharpshooter — one gun (+150%).' };
    }
  }
  return null;
}

export function hasSword(player: Player): boolean {
  return [player.equipment.mainHand, player.equipment.offHand].some(i => i?.weaponKind === 'blade');
}

/** Bow+sword melee is 125%. No sword (including out of ammo) is 100% ATK. */
export function royalMeleeMultiplier(player: Player): number {
  if (player.characterClass !== ROYAL_GUARD) return 1;
  return hasSword(player) ? ROYAL_SWORD_MELEE_MULT : ROYAL_BARE_MELEE_MULT;
}

export function royalDefenseBonus(player: Player): number {
  if (player.characterClass !== ROYAL_GUARD) return 0;
  let bonus = ROYAL_AURA_DEF;
  if ((player.stats.guardianStanceTurns ?? 0) > 0) bonus += GUARDIAN_STANCE_DEF;
  return bonus;
}

export function royalIncomingMult(player: Player): number {
  if (player.characterClass !== ROYAL_GUARD) return 1;
  return (player.stats.guardianStanceTurns ?? 0) > 0 ? GUARDIAN_INCOMING_MULT : 1;
}

export function crownItem(): import('./types').EmojiItem {
  return {
    id: 'royal-crown',
    emoji: '👑',
    name: 'Crown',
    description: `Royal Guard crown: +${ROYAL_CROWN_DEF} DEF, +${ROYAL_CROWN_LUCK} LCK. The aura's focus.`,
    consumed: false,
    isEquipment: true,
    equipSlots: ['accessory'],
    equipBonus: { defense: ROYAL_CROWN_DEF, luck: ROYAL_CROWN_LUCK },
  };
}

function hpFrac(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
}

/** High HP crits. Low HP evades. Gear evasion above the class base is kept. */
export function fencerCritBonus(hp: number, maxHp: number): number {
  const frac = hpFrac(hp, maxHp);
  return Math.round(FENCER_CRIT_AT_EMPTY + (FENCER_CRIT_AT_FULL - FENCER_CRIT_AT_EMPTY) * frac);
}

export function fencerEvasion(hp: number, maxHp: number, totalEvasion: number, classBase = FENCER_BASE_EVA): number {
  const frac = hpFrac(hp, maxHp);
  const scaled = FENCER_EVA_AT_EMPTY + (FENCER_EVA_AT_FULL - FENCER_EVA_AT_EMPTY) * frac;
  const gear = Math.max(0, totalEvasion - classBase);
  return Math.min(FENCER_EVA_CAP, Math.round(scaled + gear));
}

export function fencerOutgoingMult(stats: Player['stats']): { mult: number; nextFlourish: number; clearRiposte: boolean } {
  let mult = 1;
  let flourish = stats.flourishCount ?? 0;
  const clearRiposte = !!stats.riposteReady;
  if (clearRiposte) mult *= FENCER_RIPOSTE_MULT;
  flourish += 1;
  if (flourish >= FENCER_FLOURISH_EVERY) {
    mult *= FENCER_FLOURISH_MULT;
    flourish = 0;
  }
  return { mult, nextFlourish: flourish, clearRiposte };
}

export interface CastPayment {
  canCast: boolean;
  mpSpent: number;
  hpSpent: number;
  damageMult: number;
  /** overchannel | bloodcast | fireball | none */
  kind: 'overchannel' | 'bloodcast' | 'fireball' | 'none';
}

export function planGenieCast(player: Player): CastPayment {
  const mp = player.stats.mana ?? 0;
  const hp = player.stats.hp;
  const level = player.stats.level;
  const none: CastPayment = { canCast: false, mpSpent: 0, hpSpent: 0, damageMult: 1, kind: 'none' };
  if (level >= GENIE_OVERCHANNEL_LEVEL && mp >= GENIE_FIREBALL_MP + GENIE_OVERCHANNEL_EXTRA_MP) {
    return {
      canCast: true,
      mpSpent: GENIE_FIREBALL_MP + GENIE_OVERCHANNEL_EXTRA_MP,
      hpSpent: 0,
      damageMult: GENIE_OVERCHANNEL_MULT,
      kind: 'overchannel',
    };
  }
  if (mp >= GENIE_FIREBALL_MP) {
    return { canCast: true, mpSpent: GENIE_FIREBALL_MP, hpSpent: 0, damageMult: 1, kind: 'fireball' };
  }
  if (level >= GENIE_OVERCHANNEL_LEVEL) {
    const missing = GENIE_FIREBALL_MP - Math.max(0, mp);
    const hpSpent = missing * GENIE_BLOODCAST_HP_PER_MP;
    if (hp - hpSpent <= 0) return none;
    return { canCast: true, mpSpent: Math.max(0, mp), hpSpent, damageMult: 1, kind: 'bloodcast' };
  }
  return none;
}

export function fireballBlastDamage(attack: number, defense: number, mult: number): number {
  return Math.max(1, Math.round(attack * mult) - Math.max(0, defense));
}

export function selfSplashDamage(blast: number): number {
  if (blast <= 0) return 0;
  return Math.max(1, Math.round(blast * 0.25));
}

export function tilesInRadius(center: Position, radius: number): Position[] {
  const tiles: Position[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      tiles.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  return tiles;
}

export function pierceDamage(dealt: number): number {
  if (dealt <= 0) return 0;
  return Math.max(1, Math.round(dealt * ROYAL_PIERCE_FRACTION));
}

export function tileBeyond(from: Position, target: Position): Position {
  return {
    x: target.x + Math.sign(target.x - from.x),
    y: target.y + Math.sign(target.y - from.y),
  };
}

export function contractGold(floor: number): number {
  return HITMAN_CONTRACT_GOLD_BASE + Math.max(1, floor) * HITMAN_CONTRACT_GOLD_PER_FLOOR;
}

export function startFloorContract(player: Player): { player: Player; log: string | null } {
  if (player.characterClass !== HITMAN) return { player, log: null };
  return {
    player: {
      ...player,
      stats: {
        ...player.stats,
        contractKills: 0,
        contractGoal: HITMAN_CONTRACT_KILLS,
        contractDone: false,
      },
    },
    log: `🕴️ Contract: drop ${HITMAN_CONTRACT_KILLS} targets on this floor for bullets and gold.`,
  };
}

export function notePrestigeKill(player: Player, floor: number): { player: Player; logs: string[] } {
  const logs: string[] = [];
  let next = player;
  if (next.characterClass === GENIE) {
    const maxMana = next.stats.maxMana ?? GENIE_BASE_MP;
    const prev = next.stats.mana ?? 0;
    const gain = Math.min(GENIE_TRANSMUTE_MP, Math.max(0, maxMana - prev));
    if (gain > 0) {
      next = { ...next, stats: { ...next.stats, mana: prev + gain } };
      logs.push(`🧞‍♀️ Transmute — +${gain} MP (${prev + gain}/${maxMana})`);
    }
  }
  if (next.characterClass === HITMAN && !next.stats.contractDone) {
    const goal = next.stats.contractGoal ?? HITMAN_CONTRACT_KILLS;
    const kills = (next.stats.contractKills ?? 0) + 1;
    if (kills >= goal) {
      const gold = contractGold(floor);
      next = {
        ...next,
        ammo: (next.ammo ?? 0) + HITMAN_CONTRACT_BULLETS,
        stats: { ...next.stats, contractKills: kills, contractDone: true, gold: next.stats.gold + gold },
      };
      logs.push(`🕴️ Contract fulfilled — +${HITMAN_CONTRACT_BULLETS} bullets, +${gold} gold.`);
    } else {
      next = { ...next, stats: { ...next.stats, contractKills: kills, contractGoal: goal } };
      logs.push(`🕴️ Contract ${kills}/${goal}.`);
    }
  }
  return { player: next, logs };
}

export function executeStrike(attack: number, enemyHp: number, enemyMax: number, defense: number): { damage: number; executed: boolean } {
  const frac = enemyHp / Math.max(1, enemyMax);
  if (frac <= HITMAN_EXECUTE_HP_PCT) return { damage: enemyHp, executed: true };
  return { damage: Math.max(1, Math.round(attack * HITMAN_EXECUTE_MULT) - Math.max(0, defense)), executed: false };
}

export function tickPrestigeTimers(player: Player): Player {
  const s = player.stats;
  const dec = (n?: number) => {
    if (!n || n <= 0) return undefined;
    const next = n - 1;
    return next > 0 ? next : undefined;
  };
  return {
    ...player,
    stats: {
      ...s,
      backdashCooldown: dec(s.backdashCooldown),
      lungeCooldown: dec(s.lungeCooldown),
      executeCooldown: dec(s.executeCooldown),
      guardianStanceTurns: dec(s.guardianStanceTurns),
      guardianStanceCooldown: dec(s.guardianStanceCooldown),
    },
  };
}

export function activateGuardianStance(player: Player): { player: Player; log: string; ok: boolean } {
  if (player.characterClass !== ROYAL_GUARD) return { player, log: '', ok: false };
  if ((player.stats.guardianStanceCooldown ?? 0) > 0 || (player.stats.guardianStanceTurns ?? 0) > 0) {
    const left = Math.max(player.stats.guardianStanceCooldown ?? 0, player.stats.guardianStanceTurns ?? 0);
    return { player, log: `💂 Guardian Stance is not ready (${left}t).`, ok: false };
  }
  return {
    ok: true,
    log: `💂 Guardian Stance — holding the line for ${GUARDIAN_STANCE_TURNS} turns.`,
    player: {
      ...player,
      stats: {
        ...player.stats,
        guardianStanceTurns: GUARDIAN_STANCE_TURNS,
        guardianStanceCooldown: GUARDIAN_STANCE_CD,
      },
    },
  };
}

function tileOpen(map: { type: string }[][], pos: Position, enemies: Enemy[], self: Position): boolean {
  const tile = map[pos.y]?.[pos.x];
  if (!tile || !PLAYER_PASSABLE_TILES.has(tile.type)) return false;
  if (enemies.some(e => e.hp > 0 && e.pos.x === pos.x && e.pos.y === pos.y)) return false;
  if (pos.x === self.x && pos.y === self.y) return true;
  return true;
}

export function planBackdash(player: Player, enemies: Enemy[], map: { type: string }[][]): Position | null {
  if ((player.stats.backdashCooldown ?? 0) > 0) return null;
  const foes = enemies.filter(isFoe);
  if (foes.length === 0) return null;
  const nearest = [...foes].sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos))[0];
  const dx = Math.sign(player.pos.x - nearest.pos.x);
  const dy = Math.sign(player.pos.y - nearest.pos.y);
  if (dx === 0 && dy === 0) return null;
  const dest = { x: player.pos.x + dx, y: player.pos.y + dy };
  if (!tileOpen(map, dest, enemies, player.pos)) return null;
  return dest;
}

export function planLunge(player: Player, enemies: Enemy[], map: { type: string }[][]): { pos: Position; target: Enemy } | null {
  if ((player.stats.lungeCooldown ?? 0) > 0) return null;
  const foes = enemies.filter(e => isFoe(e) && chebyshev(player.pos, e.pos) <= FENCER_LUNGE_RANGE && chebyshev(player.pos, e.pos) > 0);
  if (foes.length === 0) return null;
  const target = [...foes].sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos))[0];
  const dist = chebyshev(player.pos, target.pos);
  if (dist <= 1) return { pos: player.pos, target };
  const step = {
    x: player.pos.x + Math.sign(target.pos.x - player.pos.x),
    y: player.pos.y + Math.sign(target.pos.y - player.pos.y),
  };
  if (step.x === target.pos.x && step.y === target.pos.y) return { pos: player.pos, target };
  if (!tileOpen(map, step, enemies, player.pos)) return null;
  if (chebyshev(step, target.pos) > 1) return null;
  return { pos: step, target };
}

export { FENCER_BACKDASH_CD, FENCER_LUNGE_CD, HITMAN_EXECUTE_CD, HITMAN_EXECUTE_GOLD, HITMAN_EXECUTE_BULLETS };

function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function nearestExecuteTarget(
  player: Player,
  enemies: Enemy[],
  los: (from: Position, to: Position) => boolean,
): Enemy | null {
  if ((player.stats.executeCooldown ?? 0) > 0) return null;
  const foes = enemies.filter(e =>
    isFoe(e) &&
    chebyshev(player.pos, e.pos) > 0 &&
    chebyshev(player.pos, e.pos) <= HITMAN_EXECUTE_RANGE &&
    los(player.pos, e.pos)
  );
  if (foes.length === 0) return null;
  return [...foes].sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos))[0];
}
