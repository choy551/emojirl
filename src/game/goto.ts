import { chebyshev } from './geo';
import type { MapGrid, Position } from './types';

export type GotoKind =
  | 'stairs'
  | 'shop'
  | 'bar'
  | 'shrine'
  | 'restaurant'
  | 'cache'
  | 'campfire';

export interface GotoDestination {
  key: string;
  kind: GotoKind;
  label: string;
  icon: string;
  pos: Position;
  dist: number;
}

export interface GotoScanOpts {
  /** True once this floor's 🏪 shop has been opened and has no stock left. */
  shopSoldOut?: boolean;
  /** True once this floor's 📦 cache has been opened and has no stock left. */
  cacheSoldOut?: boolean;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

const KIND_META: Record<GotoKind, { icon: string; label: string }> = {
  shrine: { icon: '🛕', label: 'Altar' },
  shop: { icon: '🏪', label: 'Shop' },
  bar: { icon: '🍺', label: 'Bartender' },
  restaurant: { icon: '🍽️', label: 'Restaurant' },
  cache: { icon: '📦', label: 'Ammo cache' },
  campfire: { icon: '🔥', label: 'Campfire' },
  stairs: { icon: '🕳️', label: 'Downstairs' },
};

function classifyTile(
  type: string,
  emoji: string,
  opts: GotoScanOpts,
): GotoKind | null {
  if (type === 'shrine') return 'shrine';
  if (type === 'stairs') return 'stairs';
  if (type === 'restaurant') return 'restaurant';
  if (type === 'campfire') return 'campfire';
  if (type === 'shop-item' && emoji === '🏪') return opts.shopSoldOut ? null : 'shop';
  if (type === 'shop-item' && emoji === '🍺') return 'bar';
  if (type === 'shop-item' && emoji === '📦') return opts.cacheSoldOut ? null : 'cache';
  return null;
}

/** Known (seen) still-usable destinations on the current floor. */
export function scanGotoDestinations(
  map: MapGrid,
  playerPos: Position,
  opts: GotoScanOpts = {},
): GotoDestination[] {
  const found: Omit<GotoDestination, 'key'>[] = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const tile = map[y][x];
      if (!tile.seen) continue;
      const kind = classifyTile(tile.type, tile.emoji, opts);
      if (!kind) continue;
      const meta = KIND_META[kind];
      found.push({
        kind,
        label: meta.label,
        icon: meta.icon,
        pos: { x, y },
        dist: chebyshev(playerPos, { x, y }),
      });
    }
  }
  found.sort((a, b) => a.dist - b.dist || a.kind.localeCompare(b.kind));
  return found.slice(0, LETTERS.length).map((d, i) => ({ ...d, key: LETTERS[i] }));
}
