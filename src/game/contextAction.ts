import { GameState, Enemy } from './types';
import { COOKABLE_EMOJIS } from './emojis';
import { chebyshev } from './geo';

export type ContextActionKind =
  | 'attack' | 'recruit' | 'fairy' | 'monkey' | 'bear'
  | 'cook' | 'close-door'
  | 'open-shop' | 'open-cache' | 'open-restaurant'
  | 'descend' | 'shrine' | 'pickup' | 'wait';

export interface ContextActionDescriptor {
  kind: ContextActionKind;
  label: string;
  icon: string;
  /** Step direction for actions resolved by bumping (attack, recruit, shrine, etc.). */
  dir?: { dx: number; dy: number };
}

/**
 * Half-Life-style "use" resolver: inspects what is under and around the player
 * and returns the single most relevant action. Pure — the caller dispatches it.
 * Priority mirrors the implicit precedence in handleMove / the keyboard handlers.
 */
export function resolveContextAction(state: GameState): ContextActionDescriptor {
  const { player, map, items, enemies } = state;
  const { x: px, y: py } = player.pos;
  const tileAt = (x: number, y: number) => map[y]?.[x];
  const here = tileAt(px, py);

  // Standing on an interactive tile -> open its UI.
  if (here?.type === 'shop-item' && here.emoji === '🏪') return { kind: 'open-shop', label: 'Shop', icon: '🏪' };
  if (here?.type === 'shop-item' && here.emoji === '📦') return { kind: 'open-cache', label: 'Ammo', icon: '📦' };
  if (here?.type === 'restaurant') return { kind: 'open-restaurant', label: 'Eat', icon: '🍽️' };

  const neighbours: { dx: number; dy: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) neighbours.push({ dx, dy });
  const ortho = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }];

  // Adjacent open door -> close it.
  if (ortho.some(d => tileAt(px + d.dx, py + d.dy)?.type === 'door-open')) {
    return { kind: 'close-door', label: 'Close', icon: '🚪' };
  }

  // Adjacent fire/restaurant + raw food in bag -> cook.
  const nearCook = neighbours.some(d => {
    const t = tileAt(px + d.dx, py + d.dy)?.type;
    return t === 'campfire' || t === 'restaurant';
  });
  const hasRaw = player.inventory.some(it => !it.consumed && it.healAmount !== undefined && COOKABLE_EMOJIS.has(it.emoji));
  if (nearCook && hasRaw) return { kind: 'cook', label: 'Cook', icon: '🔥' };

  const adjEnemy = (pred: (e: Enemy) => boolean): Enemy | null =>
    enemies.find(e => pred(e) && chebyshev(player.pos, e.pos) === 1) ?? null;
  const dirTo = (e: Enemy) => ({ dx: Math.sign(e.pos.x - px), dy: Math.sign(e.pos.y - py) });

  // Adjacent hostile -> attack. (Excludes recruitable/neutral NPCs handled below.)
  const hostile = adjEnemy(e =>
    e.tag !== 'Friendly' &&
    !(e.isAdventurer && !e.isRecruited && !e.engaged) &&
    !(e.monkey && !e.engaged) &&
    !(e.bear && !e.engaged && e.tag !== 'Hostile')
  );
  if (hostile) return { kind: 'attack', label: `Attack ${hostile.emoji}`, icon: '⚔️', dir: dirTo(hostile) };

  const adv = adjEnemy(e => !!e.isAdventurer && !e.isRecruited && !e.engaged);
  if (adv) return { kind: 'recruit', label: 'Recruit', icon: '🤝', dir: dirTo(adv) };

  const fairy = adjEnemy(e => e.tag === 'Friendly' && !e.isAdventurer && !e.monkey && !e.bear && !e.isRecruited);
  if (fairy) return { kind: 'fairy', label: 'Wish', icon: '🧚', dir: dirTo(fairy) };

  const monkey = adjEnemy(e => !!e.monkey && !e.engaged);
  if (monkey) return { kind: 'monkey', label: 'Monkey', icon: '🐒', dir: dirTo(monkey) };

  const bear = adjEnemy(e => !!e.bear && !e.engaged && e.tag !== 'Hostile');
  if (bear) return { kind: 'bear', label: bear.tag === 'Friendly' ? 'Offer Food 🐻' : 'Feed Bear 🐻', icon: '🐻', dir: dirTo(bear) };

  const shrineDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'shrine');
  if (shrineDir) return { kind: 'shrine', label: 'Pray', icon: '⛩️', dir: shrineDir };

  const stairDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'stairs');
  if (stairDir) return { kind: 'descend', label: 'Descend', icon: '🕳️', dir: stairDir };

  const itemDir = neighbours.find(d => items.some(it => it.pos.x === px + d.dx && it.pos.y === py + d.dy));
  if (itemDir) return { kind: 'pickup', label: 'Pick up', icon: '🫳', dir: itemDir };

  return { kind: 'wait', label: 'Wait', icon: '⏳' };
}
