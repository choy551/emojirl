import { GameState } from './types';

export type ZodiacRuler = 'taurus' | 'leo' | 'aquarius' | 'scorpio';

export interface ZodiacFloorCaps {
  taurus_bank_deposit: number;
  leo_explore_unseen: number;
  aquarius_reveal_enemy: number;
  /** Enemy ids already revealed this floor. Cleared on descend. */
  revealedEnemyIds: string[];
}

export interface ZodiacCombat {
  id: string;
  tookDamage: boolean;
  leoDisengageFired: boolean;
  scorpioMultiPullFired: boolean;
}

export interface ZodiacState {
  ruler: ZodiacRuler | null;
  piety: number;
  floor: ZodiacFloorCaps;
  runSeenEmojiTypes: string[];
  combat: ZodiacCombat | null;
}

export interface ZodiacPassives {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  evasion: number;
  luck: number;
  crit: number;
}

export const ZODIAC_RULERS: ZodiacRuler[] = ['taurus', 'leo', 'aquarius', 'scorpio'];

export const ZODIAC_GLYPH: Record<ZodiacRuler, string> = {
  taurus: '♉',
  leo: '♌',
  aquarius: '♒',
  scorpio: '♏',
};

export const ZODIAC_DESCEND_WARN =
  "You haven't pledged a Zodiac Ruler. After D:7 you won't be able to choose a Ruler to be re-born under. Descend anyway?";

const RULER_SET = new Set<string>(ZODIAC_RULERS);

export function createDefaultZodiacState(): ZodiacState {
  return {
    ruler: null,
    piety: 0,
    floor: {
      taurus_bank_deposit: 0,
      leo_explore_unseen: 0,
      aquarius_reveal_enemy: 0,
      revealedEnemyIds: [],
    },
    runSeenEmojiTypes: [],
    combat: null,
  };
}

export function clampPiety(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function emptyPassives(): ZodiacPassives {
  return { maxHp: 0, attack: 0, defense: 0, speed: 0, evasion: 0, luck: 0, crit: 0 };
}

function lerp(max: number, piety: number): number {
  return Math.floor(max * clampPiety(piety) / 100);
}

export function getZodiacPassives(z: ZodiacState | null | undefined): ZodiacPassives {
  if (!z?.ruler) return emptyPassives();
  const t = z.piety;
  if (z.ruler === 'taurus') return { ...emptyPassives(), maxHp: lerp(5, t), defense: lerp(3, t) };
  if (z.ruler === 'leo') return { ...emptyPassives(), attack: lerp(5, t), speed: lerp(3, t) };
  if (z.ruler === 'aquarius') return { ...emptyPassives(), evasion: lerp(5, t), luck: lerp(3, t) };
  return { ...emptyPassives(), attack: lerp(3, t), crit: lerp(5, t) };
}

export function pledgeRuler(z: ZodiacState, ruler: ZodiacRuler): ZodiacState {
  return { ...z, ruler, piety: 0, combat: null };
}

export function abandonRuler(z: ZodiacState): ZodiacState {
  return { ...z, ruler: null, piety: 0, combat: null };
}

export function resetZodiacFloorCaps(z: ZodiacState): ZodiacState {
  return {
    ...z,
    combat: null,
    floor: {
      taurus_bank_deposit: 0,
      leo_explore_unseen: 0,
      aquarius_reveal_enemy: 0,
      revealedEnemyIds: [],
    },
  };
}

function eventRuler(eventId: string): ZodiacRuler | null {
  const head = eventId.split('_')[0];
  return RULER_SET.has(head) ? head as ZodiacRuler : null;
}

export function pietyLogLine(z: ZodiacState, delta: number, eventId: string): string {
  const glyph = z.ruler ? ZODIAC_GLYPH[z.ruler] : '';
  const signed = delta >= 0 ? `+${delta}` : `${delta}`;
  return `${glyph} ${signed} piety (${eventId})`.trim();
}

/** Apply a piety change only when the pledged ruler owns the event. */
export function applyPietyDelta(
  z: ZodiacState,
  delta: number,
  eventId: string,
): { zodiac: ZodiacState; log: string | null } {
  if (z.ruler !== eventRuler(eventId) || delta === 0) return { zodiac: z, log: null };
  const next = { ...z, piety: clampPiety(z.piety + delta) };
  return { zodiac: next, log: pietyLogLine(next, delta, eventId) };
}

type CapKey = 'taurus_bank_deposit' | 'leo_explore_unseen' | 'aquarius_reveal_enemy';

/** Gain `per * count` piety, limited by the floor cap stored on `counter`. */
export function grantCappedPiety(
  z: ZodiacState,
  eventId: string,
  per: number,
  counter: CapKey,
  cap: number,
  count: number,
): { zodiac: ZodiacState; log: string | null } {
  if (count <= 0 || z.ruler !== eventRuler(eventId)) return { zodiac: z, log: null };
  const room = cap - z.floor[counter];
  const gain = Math.min(room, per * count);
  if (gain <= 0) return { zodiac: z, log: null };
  const withCap: ZodiacState = {
    ...z,
    floor: { ...z.floor, [counter]: z.floor[counter] + gain },
  };
  return applyPietyDelta(withCap, gain, eventId);
}

export function noteBankDeposit(z: ZodiacState): { zodiac: ZodiacState; log: string | null } {
  return grantCappedPiety(z, 'taurus_bank_deposit', 2, 'taurus_bank_deposit', 2, 1);
}

export function noteSparseConsume(z: ZodiacState, filledHotbar: number): { zodiac: ZodiacState; log: string | null } {
  if (filledHotbar > 4) return { zodiac: z, log: null };
  return applyPietyDelta(z, -2, 'taurus_consume_sparse');
}

export function noteNewEmojiType(z: ZodiacState, emoji: string): { zodiac: ZodiacState; log: string | null } {
  if (!emoji || z.runSeenEmojiTypes.includes(emoji)) return { zodiac: z, log: null };
  const next = { ...z, runSeenEmojiTypes: [...z.runSeenEmojiTypes, emoji] };
  return applyPietyDelta(next, 5, 'aquarius_new_emoji_type');
}

export function pietyOnPlayerKill(
  z: ZodiacState,
  playerMaxHp: number,
  enemy: { maxHp: number; isBoss?: boolean; isEcho?: boolean },
  info: { unaware: boolean; damageDealt: number; onWater: boolean },
): { zodiac: ZodiacState; logs: string[] } {
  let cur = z;
  const logs: string[] = [];
  const take = (delta: number, id: string) => {
    const r = applyPietyDelta(cur, delta, id);
    cur = r.zodiac;
    if (r.log) logs.push(r.log);
  };
  if (enemy.maxHp > playerMaxHp) {
    take(enemy.isBoss || enemy.isEcho ? 8 : 4, 'leo_kill_stronger');
  }
  if (info.unaware || info.damageDealt <= 0) take(3, 'scorpio_stealth_kill');
  if (info.onWater) take(4, 'scorpio_water_or_poison_kill');
  return { zodiac: cur, logs };
}

function isHostile(e: { isRecruited?: boolean; tag?: string; engaged?: boolean }): boolean {
  if (e.isRecruited) return false;
  if (e.tag === 'Friendly') return false;
  if (e.tag === 'Neutral' && !e.engaged) return false;
  return true;
}

function visibleHostiles(state: GameState): number {
  return state.enemies.filter(e => isHostile(e) && state.map[e.pos.y]?.[e.pos.x]?.visible).length;
}

function filledHotbar(inv: GameState['player']['inventory']): number {
  return inv.filter(i => i.healAmount === undefined && i.ammoAmount === undefined && !i.isEquipment && !i.consumed).length;
}

/** Combat tracker, floor-end Taurus hotbar, Leo disengage, Scorpio multi-aggro, companion deaths. */
export function settleZodiacTurn(
  before: GameState,
  after: GameState,
  inCombat: boolean,
): { zodiac: ZodiacState; logs: string[] } {
  let z = after.zodiac ?? before.zodiac ?? createDefaultZodiacState();
  const logs: string[] = [];
  const take = (delta: number, id: string) => {
    const r = applyPietyDelta(z, delta, id);
    z = r.zodiac;
    if (r.log) logs.push(r.log);
  };

  const afterIds = new Set(after.enemies.map(e => e.id));
  for (const e of before.enemies) {
    if (e.isRecruited && e.hp > 0 && !afterIds.has(e.id)) take(-15, 'aquarius_companion_death');
  }

  const had = before.zodiac?.combat ?? z.combat;
  const hpDropped = after.player.stats.hp < before.player.stats.hp;

  if (inCombat && !had) {
    z = {
      ...z,
      combat: {
        id: `c-${after.turn}`,
        tookDamage: hpDropped,
        leoDisengageFired: false,
        scorpioMultiPullFired: false,
      },
    };
    // LOCKED S: no enemy-pull; FOV multi-aggro stand-in.
    if ((z.combat && !z.combat.scorpioMultiPullFired) && visibleHostiles(after) >= 3) {
      take(-4, 'scorpio_multi_pull');
      if (z.combat) z = { ...z, combat: { ...z.combat, scorpioMultiPullFired: true } };
    }
  } else if (inCombat && had && hpDropped) {
    z = { ...z, combat: { ...had, tookDamage: true } };
  }

  const tracker = z.combat;
  if (tracker && !tracker.leoDisengageFired && visibleHostiles(after) === 0) {
    const low = after.player.stats.hp * 2 < after.player.stats.maxHp;
    if (low && (had || inCombat)) {
      take(-5, 'leo_disengage');
      if (z.combat) z = { ...z, combat: { ...z.combat, leoDisengageFired: true } };
    }
  }

  if (!inCombat && z.combat) {
    const filled = filledHotbar(after.player.inventory);
    if (filled >= 6) take(3, 'taurus_combat_hotbar6');
    z = { ...z, combat: null };
  }

  return { zodiac: z, logs };
}

/** Newly seen tiles (Leo) and newly visible enemies (Aquarius) after FOV. */
export function noteZodiacVision(
  z: ZodiacState,
  beforeSeen: boolean[],
  afterSeen: boolean[],
  revealedNow: string[],
): { zodiac: ZodiacState; logs: string[] } {
  let cur = z;
  const logs: string[] = [];
  let fresh = 0;
  const n = Math.min(beforeSeen.length, afterSeen.length);
  for (let i = 0; i < n; i++) if (!beforeSeen[i] && afterSeen[i]) fresh++;
  const explore = grantCappedPiety(cur, 'leo_explore_unseen', 1, 'leo_explore_unseen', 10, fresh);
  cur = explore.zodiac;
  if (explore.log) logs.push(explore.log);

  const newcomers = revealedNow.filter(id => !cur.floor.revealedEnemyIds.includes(id));
  if (newcomers.length > 0) {
    const reveal = grantCappedPiety(cur, 'aquarius_reveal_enemy', 2, 'aquarius_reveal_enemy', 8, newcomers.length);
    const gained = (reveal.zodiac.floor.aquarius_reveal_enemy - cur.floor.aquarius_reveal_enemy) / 2;
    const kept = newcomers.slice(0, Math.max(0, gained));
    cur = {
      ...reveal.zodiac,
      floor: { ...reveal.zodiac.floor, revealedEnemyIds: [...cur.floor.revealedEnemyIds, ...kept] },
    };
    if (reveal.log) logs.push(reveal.log);
  }
  return { zodiac: cur, logs };
}

export function normalizeZodiac(raw: unknown): ZodiacState {
  const d = createDefaultZodiacState();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<ZodiacState>;
  const ruler = typeof r.ruler === 'string' && RULER_SET.has(r.ruler) ? r.ruler as ZodiacRuler : null;
  const floor = (r.floor ?? {}) as Partial<ZodiacFloorCaps>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const combat = r.combat && typeof r.combat === 'object' && typeof r.combat.id === 'string'
    ? {
        id: r.combat.id,
        tookDamage: !!r.combat.tookDamage,
        leoDisengageFired: !!r.combat.leoDisengageFired,
        scorpioMultiPullFired: !!r.combat.scorpioMultiPullFired,
      }
    : null;
  return {
    ruler,
    piety: clampPiety(typeof r.piety === 'number' ? r.piety : 0),
    floor: {
      taurus_bank_deposit: num(floor.taurus_bank_deposit),
      leo_explore_unseen: num(floor.leo_explore_unseen),
      aquarius_reveal_enemy: num(floor.aquarius_reveal_enemy),
      revealedEnemyIds: Array.isArray(floor.revealedEnemyIds)
        ? floor.revealedEnemyIds.filter((id): id is string => typeof id === 'string')
        : [],
    },
    runSeenEmojiTypes: Array.isArray(r.runSeenEmojiTypes)
      ? r.runSeenEmojiTypes.filter((e): e is string => typeof e === 'string')
      : [],
    combat,
  };
}
