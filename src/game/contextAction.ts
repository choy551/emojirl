import { GameState, Enemy } from './types';
import { COOKABLE_EMOJIS } from './emojis';
import { chebyshev } from './geo';
import { FINALE_FLOOR } from './finaleConstants';
import { BANQUET_MIN_DISHES, cookedDishCount, nearCampfire } from './foodSinks';

export type ContextActionKind =
  | 'attack' | 'recruit' | 'fairy' | 'monkey' | 'bear' | 'talk' | 'trade'
  | 'cook' | 'banquet' | 'close-door' | 'rest'
  | 'open-shop' | 'open-cache' | 'open-restaurant' | 'open-slots' | 'open-mirror'
  | 'open-bounty' | 'open-vanity' | 'open-auction'
  | 'descend' | 'shrine' | 'offer' | 'pickup' | 'wait' | 'explore';

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
export function resolveContextAction(
  state: GameState,
  idle: 'wait' | 'explore' = 'wait',
): ContextActionDescriptor {
  const { player, map, items, enemies } = state;
  const { x: px, y: py } = player.pos;
  const tileAt = (x: number, y: number) => map[y]?.[x];
  const here = tileAt(px, py);

  // Standing on an interactive tile -> open its UI.
  if (here?.type === 'shop-item' && here.emoji === '🏪') return { kind: 'open-shop', label: 'Shop', icon: '🏪' };
  if (here?.type === 'slot-shrine') return { kind: 'open-slots', label: 'Spin', icon: '🎰' };
  if (here?.type === 'shop-item' && here.emoji === '📦') return { kind: 'open-cache', label: 'Ammo', icon: '📦' };
  if (here?.type === 'restaurant') return { kind: 'open-restaurant', label: 'Eat', icon: '🍽️' };
  if (here?.type === 'bed') return { kind: 'rest', label: 'Rest', icon: '🛏️' };
  if (here?.type === 'mirror') return { kind: 'open-mirror', label: 'Reroll', icon: '🪞' };
  if (here?.type === 'bounty') return { kind: 'open-bounty', label: 'Board', icon: '📜' };
  if (here?.type === 'vanity') return { kind: 'open-vanity', label: 'Flex', icon: '💎' };
  if (here?.type === 'auction') return { kind: 'open-auction', label: 'Bid', icon: '☠️' };

  const neighbours: { dx: number; dy: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) neighbours.push({ dx, dy });
  const ortho = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }];

  // Adjacent open door -> close it.
  if (ortho.some(d => tileAt(px + d.dx, py + d.dy)?.type === 'door-open')) {
    return { kind: 'close-door', label: 'Close', icon: '🚪' };
  }

  // Campfire + enough cooked dishes -> banquet. Cook stays on F and when the pile is smaller.
  if (nearCampfire(map, player.pos) && cookedDishCount(player) >= BANQUET_MIN_DISHES) {
    return { kind: 'banquet', label: 'Banquet', icon: '🍽️' };
  }

  // Adjacent fire/restaurant + raw food in bag -> cook.
  const nearCook = here?.type === 'campfire' || neighbours.some(d => {
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
    !e.isSpectator &&
    !e.isFarmer &&
    !e.isFarmAnimal &&
    e.tag !== 'Friendly' &&
    !(e.isAdventurer && !e.isRecruited && !e.engaged) &&
    !(e.monkey && !e.engaged) &&
    !(e.bear && !e.engaged && e.tag !== 'Hostile')
  );
  if (hostile) return { kind: 'attack', label: `Attack ${hostile.emoji}`, icon: '⚔️', dir: dirTo(hostile) };

  const adv = adjEnemy(e => !!e.isAdventurer && !e.isRecruited && !e.engaged);
  if (adv) return { kind: 'recruit', label: 'Recruit', icon: '🤝', dir: dirTo(adv) };

  const farmer = adjEnemy(e => !!e.isFarmer && e.hp > 0);
  if (farmer) return { kind: 'trade', label: 'Trade', icon: '🧑‍🌾', dir: dirTo(farmer) };

  const fairy = adjEnemy(e => e.tag === 'Friendly' && !e.isAdventurer && !e.monkey && !e.bear && !e.isRecruited && !e.isFarmer && !e.isFarmAnimal);
  if (fairy) return { kind: 'fairy', label: 'Wish', icon: '🧚', dir: dirTo(fairy) };

  const monkey = adjEnemy(e => !!e.monkey && !e.engaged);
  if (monkey) return { kind: 'monkey', label: 'Monkey', icon: '🐒', dir: dirTo(monkey) };

  const bear = adjEnemy(e => !!e.bear && !e.isRecruited && !e.engaged && e.tag !== 'Hostile');
  if (bear) return { kind: 'bear', label: bear.tag === 'Friendly' ? 'Offer Food 🐻' : 'Feed Bear 🐻', icon: '🐻', dir: dirTo(bear) };

  const companion = adjEnemy(e => !!e.isRecruited && e.tag === 'Friendly');
  if (companion) return { kind: 'talk', label: `Talk to ${companion.emoji}`, icon: '💬', dir: dirTo(companion) };

  const bedDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'bed');
  if (bedDir) return { kind: 'rest', label: 'Rest', icon: '🛏️', dir: bedDir };

  const shrineDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'shrine');
  if (shrineDir) return { kind: 'shrine', label: 'Pray', icon: '⛩️', dir: shrineDir };

  // Offering is separate from the one-use pray. A live shrine still prays first.
  if (here?.type === 'shrine-used') return { kind: 'offer', label: 'Offer', icon: '🛕' };
  const offerDir = neighbours.find(d => {
    const kind = tileAt(px + d.dx, py + d.dy)?.type;
    return kind === 'shrine-used' || kind === 'slot-shrine';
  });
  if (offerDir) return { kind: 'offer', label: 'Offer', icon: '🛕', dir: offerDir };

  const mirrorDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'mirror');
  if (mirrorDir) return { kind: 'open-mirror', label: 'Reroll', icon: '🪞', dir: mirrorDir };

  const bountyDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'bounty');
  if (bountyDir) return { kind: 'open-bounty', label: 'Board', icon: '📜', dir: bountyDir };
  const vanityDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'vanity');
  if (vanityDir) return { kind: 'open-vanity', label: 'Flex', icon: '💎', dir: vanityDir };
  const auctionDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'auction');
  if (auctionDir) return { kind: 'open-auction', label: 'Bid', icon: '☠️', dir: auctionDir };

  const stairDir = neighbours.find(d => tileAt(px + d.dx, py + d.dy)?.type === 'stairs');
  if (stairDir) {
    const finale = state.currentFloor === FINALE_FLOOR && !state.deepDive;
    return { kind: 'descend', label: finale ? 'Stairs' : 'Descend', icon: '🕳️', dir: stairDir };
  }

  const itemDir = neighbours.find(d => items.some(it => it.pos.x === px + d.dx && it.pos.y === py + d.dy));
  if (itemDir) return { kind: 'pickup', label: 'Pick up', icon: '🫳', dir: itemDir };

  if (idle === 'explore') return { kind: 'explore', label: 'Explore', icon: '🔭' };
  return { kind: 'wait', label: 'Wait', icon: '⏳' };
}
