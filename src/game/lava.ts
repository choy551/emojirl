import { GameState, MapGrid, Position, EmojiItem, FloatingText, Enemy } from './types';

export const LAVA_EMOJI = '🔥';
export const VOLCANO_EMOJI = '🌋';
export const BUSH_EMOJI = '🌿';

const LAVA_IMMUNE = new Set([
  'wall', 'volcano', 'stairs', 'shrine', 'shrine-used',
  'shop-item', 'restaurant', 'safe-floor', 'door-closed', 'door-open',
  'campfire', 'boss-floor',
]);

export function lavaFlatDamage(floor: number): number {
  return 10 + 5 * Math.max(0, floor - 1);
}

/** 50% of max HP + a flat amount that scales +5 per D:Floor descended. */
export function lavaDamageForFloor(floor: number, maxHp: number): number {
  return Math.floor(maxHp * 0.5) + lavaFlatDamage(floor);
}

export function isLavaTileType(type: string): boolean {
  return type === 'lava';
}

export function findVolcano(map: MapGrid): Position | null {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x].type === 'volcano') return { x, y };
    }
  }
  return null;
}

export function canConvertToLava(type: string): boolean {
  return !LAVA_IMMUNE.has(type) && type !== 'lava';
}

const SPREAD_DIRS: [number, number][] = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/**
 * Spew new lava from existing lava/volcano tiles, biased toward the volcano center.
 * Returns a new map and the positions that became lava.
 */
export function spreadVolcanoLava(
  map: MapGrid,
  volcano: Position,
  spewCount: number,
): { map: MapGrid; converted: Position[] } {
  const H = map.length;
  const W = map[0]?.length ?? 0;
  const candidates: { x: number; y: number; weight: number }[] = [];
  const seen = new Set<string>();

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const t = map[y][x].type;
      if (t !== 'lava' && t !== 'volcano') continue;
      for (const [dx, dy] of SPREAD_DIRS) {
        const nx = x + dx, ny = y + dy;
        if (ny <= 0 || ny >= H - 1 || nx <= 0 || nx >= W - 1) continue;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        if (!canConvertToLava(map[ny][nx].type)) continue;
        seen.add(key);
        const dist = Math.max(Math.abs(nx - volcano.x), Math.abs(ny - volcano.y));
        candidates.push({ x: nx, y: ny, weight: 1 / (1 + dist) });
      }
    }
  }

  if (candidates.length === 0) return { map, converted: [] };

  const converted: Position[] = [];
  const pool = [...candidates];
  const n = Math.min(spewCount, pool.length);
  for (let i = 0; i < n; i++) {
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let roll = Math.random() * total;
    let pick = 0;
    for (let j = 0; j < pool.length; j++) {
      roll -= pool[j].weight;
      if (roll <= 0) { pick = j; break; }
    }
    const [chosen] = pool.splice(pick, 1);
    converted.push({ x: chosen.x, y: chosen.y });
  }

  if (converted.length === 0) return { map, converted: [] };

  const keys = new Set(converted.map(p => `${p.x},${p.y}`));
  const next = map.map((row, y) =>
    row.map((tile, x) =>
      keys.has(`${x},${y}`)
        ? { ...tile, type: 'lava' as const, emoji: LAVA_EMOJI }
        : tile
    )
  );
  return { map: next, converted };
}

export function volcanoSpewCount(floor: number): number {
  let n = 1;
  if (Math.random() < 0.40) n++;
  if (floor >= 8 && Math.random() < 0.35) n++;
  return n;
}

/** Inclusive 5–10 turns until the next eruption. */
export function volcanoSpewInterval(): number {
  return 5 + Math.floor(Math.random() * 6);
}

function lavaOn(map: MapGrid, pos: Position): boolean {
  return map[pos.y]?.[pos.x]?.type === 'lava';
}

/**
 * End-of-turn lava: volcano spew, burn ground items, scorch anyone standing in it.
 */
export function tickVolcanoAndLava(state: GameState): GameState {
  if (state.gameOver) return state;

  let map = state.map;
  const logs: GameState['logs'] = [];
  const floats: FloatingText[] = [];
  const turn = state.turn;

  const volcano = findVolcano(map);
  let volcanoNextSpewTurn = state.volcanoNextSpewTurn;
  if (!volcano) {
    volcanoNextSpewTurn = undefined;
  } else {
    if (volcanoNextSpewTurn === undefined) {
      volcanoNextSpewTurn = turn + volcanoSpewInterval();
    }
    if (turn >= volcanoNextSpewTurn) {
      const { map: nextMap, converted } = spreadVolcanoLava(map, volcano, volcanoSpewCount(state.currentFloor));
      map = nextMap;
      volcanoNextSpewTurn = turn + volcanoSpewInterval();
      if (converted.length > 0) {
        logs.push({
          id: `volcano-spew-${turn}-${Math.random()}`,
          text: `🌋 The volcano spews fresh lava!`,
          turn,
        });
      }
    }
  }

  const burnedItems: EmojiItem[] = [];
  const items = state.items.filter(it => {
    if (lavaOn(map, it.pos)) {
      burnedItems.push(it);
      return false;
    }
    return true;
  });
  for (const it of burnedItems) {
    logs.push({
      id: `lava-burn-${it.id}-${turn}`,
      text: `🔥 ${it.emoji} ${it.name} burns away in the lava!`,
      turn,
    });
  }

  const enemies: Enemy[] = [];
  for (const e of state.enemies) {
    if (!lavaOn(map, e.pos)) { enemies.push(e); continue; }
    const dmg = lavaDamageForFloor(state.currentFloor, e.maxHp);
    const hp = e.hp - dmg;
    floats.push({
      id: `lava-e-${e.id}-${turn}`,
      pos: { ...e.pos },
      text: `-${dmg}`,
      color: '#ef4444',
      life: 2,
    });
    if (hp <= 0) {
      logs.push({
        id: `lava-ekill-${e.id}-${turn}`,
        text: `🔥 ${e.emoji} ${e.name} is consumed by lava!`,
        turn,
      });
    } else {
      logs.push({
        id: `lava-ehit-${e.id}-${turn}`,
        text: `🔥 ${e.emoji} ${e.name} is scorched by lava (${dmg})!`,
        turn,
      });
      enemies.push({ ...e, hp });
    }
  }

  let playerHp = state.player.stats.hp;
  let playerDied = false;
  if (lavaOn(map, state.player.pos)) {
    const dmg = lavaDamageForFloor(state.currentFloor, state.player.stats.maxHp);
    playerHp = Math.max(0, playerHp - dmg);
    logs.push({
      id: `lava-player-${turn}`,
      text: `🔥 The lava burns you for ${dmg} damage!`,
      turn,
    });
    floats.push({
      id: `lava-p-${turn}`,
      pos: { ...state.player.pos },
      text: `-${dmg}`,
      color: '#ef4444',
      life: 2,
    });
    if (playerHp <= 0) playerDied = true;
  }

  if (
    logs.length === 0 &&
    items.length === state.items.length &&
    map === state.map &&
    !playerDied &&
    enemies.length === state.enemies.length &&
    volcanoNextSpewTurn === state.volcanoNextSpewTurn
  ) {
    return state;
  }

  return {
    ...state,
    volcanoNextSpewTurn,
    map,
    items,
    enemies,
    player: {
      ...state.player,
      stats: { ...state.player.stats, hp: playerHp },
    },
    logs: [...logs, ...state.logs].slice(0, 24),
    floatingTexts: [...floats, ...state.floatingTexts],
    gameOver: state.gameOver || playerDied,
    killer: playerDied ? (state.killer ?? { name: 'Lava', emoji: VOLCANO_EMOJI }) : state.killer,
  };
}
