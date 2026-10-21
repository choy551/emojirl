import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Enemy, GameState, Player } from './types';
import { resolveContextAction } from './contextAction';
import { descendFloor } from './descend';
import { getDungeonPressure } from './progression';
import { placeFloorService } from './mapgen';
import type { MapGrid } from './types';
import { BountyBoardModal } from '../components/BountyBoardModal';
import { VanityFlexModal } from '../components/VanityFlexModal';
import { BloodAuctionModal } from '../components/BloodAuctionModal';
import {
  acceptBounty,
  auctionGold,
  auctionHpCost,
  bountyAnte,
  bountyProgress,
  buyVanity,
  executeBloodAuction,
  expireBountyOnDescend,
  grantBounty,
  killNeedForFloor,
  rareChance,
  rollBountyOffer,
  shouldPlaceAuction,
  shouldPlaceBounty,
  shouldPlaceVanity,
  surviveTurnsForFloor,
  RARE_REWARDS,
} from './goldSinks2';

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

function player(over: Partial<Player> = {}): Player {
  const stats = {
    hp: 20, maxHp: 20, attack: 6, defense: 1, speed: 2, evasion: 5,
    luck: 1, level: 1, xp: 0, moodValue: 0, gold: 8000,
    mana: 4, maxMana: 4,
  };
  return {
    pos: { x: 0, y: 0 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    equipment: {},
    inventory: [],
    bank: [],
    ...over,
    stats: { ...stats, ...over.stats },
  };
}

function zombie(x: number, y: number): Enemy {
  return {
    id: `z-${x}-${y}`, emoji: '🧟', name: 'Zombie', pos: { x, y },
    hp: 4, maxHp: 4, attack: 2, defense: 0, speed: 2, engaged: true,
  };
}

function state(over: Partial<GameState> = {}): GameState {
  const floor = { type: 'floor' as const, emoji: '⬜', seen: true, visible: true };
  const map = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ ...floor })));
  return {
    schemaVersion: 1,
    player: player(),
    currentFloor: 1,
    map,
    enemies: [zombie(2, 2), zombie(3, 2), zombie(4, 2)],
    items: [],
    turn: 4,
    logs: [],
    floatingTexts: [],
    gameOver: false,
    victory: false,
    levelUpPending: false,
    cameraOffset: { x: 0, y: 0 },
    placedBombs: [],
    activeProjectile: null,
    killCounts: {},
    difficultyTier: 0,
    highestPressureTierWarned: 0,
    ...over,
  };
}

describe('bounty board', () => {
  it('prices the ante from 50 to 450', () => {
    expect(bountyAnte(1)).toBe(50);
    expect(bountyAnte(16)).toBe(290);
    expect(bountyAnte(26)).toBe(450);
    expect(bountyAnte(40)).toBe(450);
    expect(killNeedForFloor(1)).toBe(2);
    expect(killNeedForFloor(25)).toBe(5);
    expect(surviveTurnsForFloor(1)).toBe(6);
    expect(surviveTurnsForFloor(26)).toBe(11);
    expect(rareChance(1)).toBeCloseTo(0.25);
    expect(rareChance(26)).toBeCloseTo(0.7);
  });

  it('posts a kill contract for a mob already on the floor and pays the named rare', () => {
    const offer = rollBountyOffer(state(), seq([0, 0, 0]));
    expect(offer.kind).toBe('kill');
    expect(offer.targetEmoji).toBe('🧟');
    expect(offer.need).toBe(2);
    expect(offer.reward).toEqual(RARE_REWARDS[0]);
    expect(offer.ante).toBe(50);

    const accepted = acceptBounty({ ...state(), bounty: offer });
    expect(accepted.ok).toBe(true);
    expect(accepted.state?.player.stats.gold).toBe(7950);
    expect(accepted.state?.bounty?.status).toBe('active');

    const hunting = accepted.state!;
    expect(bountyProgress(hunting).done).toBe(false);
    const slain = { ...hunting, killCounts: { '🧟': 2 } };
    expect(bountyProgress(slain).done).toBe(true);
    const paid = grantBounty(slain);
    expect(paid.bounty?.status).toBe('done');
    expect(paid.player.inventory.map(item => item.name)).toContain('Crown');
    expect(paid.player.stats.attack).toBe(6);
    expect(grantBounty(paid)).toBe(paid);
  });

  it('does not count kills from before the ante', () => {
    const offer = rollBountyOffer(state({ killCounts: { '🧟': 5 } }), seq([0, 0.9, 0]));
    const accepted = acceptBounty({ ...state({ killCounts: { '🧟': 5 } }), bounty: offer }).state!;
    expect(bountyProgress(accepted).done).toBe(false);
    expect(bountyProgress({ ...accepted, killCounts: { '🧟': 6 } }).done).toBe(false);
    expect(bountyProgress({ ...accepted, killCounts: { '🧟': 7 } }).done).toBe(true);
  });

  it('marks a reach tile and completes on standing there', () => {
    const offer = rollBountyOffer(state({ enemies: [] }), seq([0.5, 0, 0, 0]));
    expect(offer.kind).toBe('reach');
    expect(offer.x).toBe(4);
    expect(offer.y).toBe(0);
    const accepted = acceptBounty({ ...state({ enemies: [] }), bounty: offer }).state!;
    expect(bountyProgress(accepted).done).toBe(false);
    const stood = { ...accepted, player: { ...accepted.player, pos: { x: 4, y: 0 } } };
    expect(bountyProgress(stood).done).toBe(true);
  });

  it('completes a survive contract after the posted turns', () => {
    const offer = rollBountyOffer(state({ enemies: [] }), seq([0.9, 0.9, 0]));
    expect(offer.kind).toBe('survive');
    expect(offer.need).toBe(6);
    expect(offer.reward.name).toBe('Magnet');
    const accepted = acceptBounty({ ...state({ enemies: [], turn: 4 }), bounty: offer }).state!;
    expect(bountyProgress({ ...accepted, turn: 9 }).done).toBe(false);
    expect(bountyProgress({ ...accepted, turn: 10 }).done).toBe(true);
  });

  it('expires an accepted bounty on descend and keeps the ante spent', () => {
    const offer = rollBountyOffer(state(), seq([0.9, 0.9, 0]));
    const accepted = acceptBounty({ ...state(), bounty: offer }).state!;
    const expired = expireBountyOnDescend(accepted);
    expect(expired.log).toContain('ante stays spent');
    expect(expired.state.bounty).toBeUndefined();
    expect(expired.state.player.stats.gold).toBe(7950);
    const next = descendFloor(accepted, () => {});
    expect(next.bounty).toBeUndefined();
    expect(next.player.stats.gold).toBe(7950);
    expect(next.currentFloor).toBe(2);
  });
});

describe('vanity flex', () => {
  it('appears on pressure floors only and changes no combat stat', () => {
    expect(getDungeonPressure(15).atk).toBe(0);
    expect(getDungeonPressure(16).atk).toBeGreaterThan(0);
    expect(shouldPlaceVanity(15, 0)).toBe(false);
    expect(shouldPlaceVanity(16, 0.39)).toBe(true);
    expect(shouldPlaceVanity(16, 0.4)).toBe(false);
    const bought = buyVanity(player({ stats: { ...player().stats, gold: 20000 } }), 'title', 'gaudy');
    expect(bought.ok).toBe(true);
    expect(bought.player?.stats.gold).toBe(17500);
    expect(bought.player?.stats.attack).toBe(6);
    expect(bought.player?.stats.defense).toBe(1);
    expect(bought.player?.stats.hp).toBe(20);
    expect(bought.player?.stats.maxHp).toBe(20);
    expect(bought.player?.stats.evasion).toBe(5);
    expect(bought.player?.stats.speed).toBe(2);
    expect(bought.player?.vanity?.title).toBe('gaudy');
    const again = buyVanity(bought.player!, 'title', 'gaudy');
    expect(again.ok).toBe(false);
    const trail = buyVanity(bought.player!, 'trail', 'prisms');
    expect(trail.player?.stats.gold).toBe(12500);
    expect(trail.player?.vanity).toEqual({ title: 'gaudy', trail: 'prisms' });
    expect(trail.player?.stats.attack).toBe(6);
    expect(buyVanity(player({ stats: { ...player().stats, gold: 2499 } }), 'trail', 'glitter').ok).toBe(false);
  });
});

describe('blood auction', () => {
  it('spends gold on a failed bid and HP only when the rare lot is won', () => {
    expect(auctionGold(1)).toBe(500);
    expect(auctionGold(16)).toBe(1400);
    expect(auctionGold(26)).toBe(2000);
    expect(auctionGold(40)).toBe(2000);
    expect(shouldPlaceAuction(1, 0.21)).toBe(true);
    expect(shouldPlaceBounty(1, 0.29)).toBe(true);
    expect(auctionHpCost(10, 30)).toBe(3);
    expect(auctionHpCost(2, 10)).toBe(1);
    expect(auctionHpCost(1, 30)).toBe(0);

    const lot = RARE_REWARDS[0];
    const failed = executeBloodAuction(player(), 1, 30, lot, () => 0.99);
    expect(failed.won).toBe(false);
    expect(failed.player?.stats.gold).toBe(7500);
    expect(failed.player?.stats.hp).toBe(20);
    expect(failed.player?.inventory).toHaveLength(0);

    const won = executeBloodAuction(player(), 1, 10, lot, () => 0);
    expect(won.won).toBe(true);
    expect(won.player?.stats.gold).toBe(7500);
    expect(won.player?.stats.hp).toBe(18);
    expect(won.player?.inventory.map(item => item.name)).toContain('Crown');
    expect(won.player?.stats.attack).toBe(6);
    expect(executeBloodAuction(player({ stats: { ...player().stats, hp: 1 } }), 1, 10, lot, () => 0).ok).toBe(false);
    expect(executeBloodAuction(player(), 1, 10, { ...lot, tier: 'uncommon' }, () => 0).ok).toBe(false);
  });
});

describe('boards on the map', () => {
  it('paints a service tile and opens from the context button', () => {
    const map: MapGrid = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => ({ type: 'floor' as const, emoji: '⬜', seen: false, visible: false })),
    );
    expect(placeFloorService(map, { x: 0, y: 0, w: 5, h: 5, theme: 'normal' }, 'auction', '☠️')).toBe(true);
    expect(map[2][2]).toMatchObject({ type: 'auction', emoji: '☠️' });
    const gs = state();
    gs.map[0][0] = { type: 'bounty', emoji: '📜', seen: true, visible: true };
    expect(resolveContextAction(gs).kind).toBe('open-bounty');
  });

  it('renders the three sheets and the RTFM rule', () => {
    const quest = rollBountyOffer(state(), seq([0, 0, 0]));
    const gs = { ...state(), bounty: quest };
    const board = renderToStaticMarkup(
      <BountyBoardModal gameState={gs} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(board).toContain('Bounty board');
    expect(board).toContain('Crown');
    expect(board).toContain('Accept for 50g');
    expect(board).toContain('min-h-11');

    const flex = renderToStaticMarkup(
      <VanityFlexModal gameState={state()} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(flex).toContain('Glitter');
    expect(flex).toContain('2500g');
    expect(flex).toContain('the Gaudy');
    expect(flex).toContain('Zero attack');

    const auction = renderToStaticMarkup(
      <BloodAuctionModal gameState={state()} setGameState={() => {}} addLog={() => {}} onClose={() => {}} lot={RARE_REWARDS[2]} />,
    );
    expect(auction).toContain('Dagger');
    expect(auction).toContain('Bid 500g');
    expect(auction).toContain('only if you win');
    expect(auction).toContain('min-h-11');

    const rtfm = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(rtfm).toContain('goldSink2RulesBlurb');
    expect(rtfm).toContain('Blood Auction');
  });
});
