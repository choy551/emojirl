import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EmojiItem, GameState, MapGrid, Player, Tile } from './types';
import { RESTAURANT_COOKED_SELL_LIMIT } from './economy';
import { playerMood } from './drinks';
import { loadMeta, recordPrestigeWin, setMetaStore, type KeyValueStore } from './meta';
import { placeMirror } from './mapgen';
import { resolveContextAction } from './contextAction';
import { IdentityRerollModal } from '../components/IdentityRerollModal';
import { InsuranceModal } from '../components/InsuranceModal';
import { RestaurantModal } from '../components/RestaurantModal';
import {
  INSURE_BILL_CAP,
  REROLL_COST_MAX,
  REROLL_COST_MIN,
  applyHouseRoundTick,
  executeHouseRound,
  executeIdentityReroll,
  executeInsurance,
  goldSinkRulesBlurb,
  insuranceCost,
  rerollCost,
  roundCost,
  roundPlan,
  shouldPlaceMirror,
  stashInsuranceOnDeath,
  takeInsuredStartItems,
} from './goldSinks';

function memStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
}

beforeEach(() => {
  setMetaStore(memStore());
});

function soul(id: string): EmojiItem {
  return {
    id, emoji: '🍀', name: id, description: 'luck', consumed: false,
    bagPassive: { description: 'lucky', luckBonus: 1 },
  };
}

function player(over: Partial<Player> = {}): Player {
  const baseStats = {
    hp: 12, maxHp: 20, attack: 6, defense: 1, speed: 2, evasion: 5,
    luck: 1, level: 3, xp: 10, moodValue: -80, gold: 6000,
    mana: 5, maxMana: 5,
  };
  return {
    pos: { x: 1, y: 1 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 3,
    equipment: {},
    ...over,
    stats: { ...baseStats, ...over.stats },
    inventory: over.inventory ?? [soul('clover')],
    bank: over.bank ?? [soul('banked')],
  };
}

const floorTile: Tile = { type: 'floor', emoji: '⬜', seen: true, visible: true };

function state(p: Player, floor = 1): GameState {
  return {
    schemaVersion: 1,
    player: p,
    currentFloor: floor,
    map: [
      [floorTile, floorTile, floorTile],
      [floorTile, floorTile, floorTile],
      [floorTile, floorTile, floorTile],
    ],
    enemies: [],
    items: [],
    turn: 2,
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
  };
}

describe('identity reroll', () => {
  it('prices 750 on D:1 and 1500 from D:26', () => {
    expect(rerollCost(1)).toBe(REROLL_COST_MIN);
    expect(rerollCost(1)).toBe(750);
    expect(rerollCost(26)).toBe(1500);
    expect(rerollCost(40)).toBe(REROLL_COST_MAX);
  });

  it('swaps to an unlocked class, keeps the bag, and shifts base stats', () => {
    const staff: EmojiItem = {
      id: 'wand', emoji: '🪄', name: 'Wand', description: 'arcane', consumed: false,
      isEquipment: true, weaponKind: 'staff', equipSlots: ['mainHand'],
    };
    const hero = player({ equipment: { mainHand: staff }, inventory: [soul('keep')] });
    const result = executeIdentityReroll(hero, 1, '🥷');
    expect(result.ok).toBe(true);
    expect(result.player?.characterClass).toBe('🥷');
    expect(result.player?.emoji).toBe('🥷');
    expect(result.player?.inventory.map(item => item.id)).toEqual(['keep']);
    expect(result.player?.bank.some(item => item.id === 'banked')).toBe(true);
    expect(result.player?.bank.some(item => item.id === 'wand')).toBe(true);
    expect(result.player?.equipment.mainHand).toBeUndefined();
    expect(result.player?.stats.gold).toBe(6000 - 750);
    expect(result.player?.stats.maxHp).toBe(20);
    expect(result.player?.stats.evasion).toBe(20);
    expect(result.player?.identityRerolled).toBe(true);
    expect(result.player?.ammo).toBe(3);

    const again = executeIdentityReroll(result.player!, 1, '🤠');
    expect(again.ok).toBe(false);
    expect(again.player).toBeUndefined();
  });

  it('refuses a locked class', () => {
    const refused = executeIdentityReroll(player(), 4, '🧞‍♀️');
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/locked/);
  });
});

describe('vault insurance', () => {
  it('scales from 500 to 2500 with floor and slots', () => {
    expect(insuranceCost(1, 1)).toBe(500);
    expect(insuranceCost(1, 2)).toBe(850);
    expect(insuranceCost(1, 3)).toBe(1200);
    expect(insuranceCost(26, 1)).toBe(1100);
    expect(insuranceCost(26, 3)).toBe(2500);
    expect(insuranceCost(40, 3)).toBe(INSURE_BILL_CAP);
  });

  it('snapshots 1–3 hotbar emojis and carries them once', () => {
    const hero = player({ inventory: [soul('a'), soul('b'), soul('c')] });
    const tooMany = executeInsurance(hero, 1, ['a', 'b', 'c', 'd']);
    expect(tooMany.ok).toBe(false);
    const bankOnly = executeInsurance(hero, 1, ['banked']);
    expect(bankOnly.ok).toBe(false);

    const bought = executeInsurance(hero, 26, ['a', 'b', 'c']);
    expect(bought.ok).toBe(true);
    expect(bought.player?.stats.gold).toBe(6000 - 2500);
    expect(bought.player?.insurance?.items.map(item => item.id)).toEqual(['a', 'b', 'c']);
    hero.inventory[0].name = 'changed';
    expect(bought.player?.insurance?.items[0].name).toBe('a');

    stashInsuranceOnDeath(bought.player!);
    recordPrestigeWin('🧙');
    expect(loadMeta().insuredCarry?.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(loadMeta().unlockedPrestige).toContain('🧞‍♀️');
    const carried = takeInsuredStartItems();
    expect(carried.map(item => item.emoji)).toEqual(['🍀', '🍀', '🍀']);
    expect(carried[0].id).not.toBe('a');
    expect(takeInsuredStartItems()).toEqual([]);
    expect(loadMeta().unlockedPrestige).toContain('🧞‍♀️');
  });
});

describe('round for the house', () => {
  it('keeps the restaurant sell cap at 5', () => {
    expect(RESTAURANT_COOKED_SELL_LIMIT).toBe(5);
  });

  it('charges 250–1000 and resets the kitchen sell count without raising the cap', () => {
    expect(roundCost(1)).toBe(250);
    expect(roundCost(26)).toBe(1000);
    expect(roundCost(40)).toBe(1000);
    expect(roundPlan(1)).toEqual({ floor: 16, turns: 8 });
    expect(roundPlan(26)).toEqual({ floor: 24, turns: 11 });
    const bought = executeHouseRound(player(), 1);
    expect(bought.ok).toBe(true);
    expect(bought.soldCount).toBe(0);
    expect(bought.player?.stats.gold).toBe(5750);
    expect(bought.player?.houseRound).toEqual({ floor: 16, turnsLeft: 8 });
    expect(RESTAURANT_COOKED_SELL_LIMIT).toBe(5);

    const cheered = player({ stats: { ...player().stats, hp: 20, maxHp: 20, moodValue: -80 } });
    cheered.houseRound = { floor: 16, turnsLeft: 4 };
    expect(playerMood(cheered)).toBe('excited');
    const dying = { ...cheered, stats: { ...cheered.stats, hp: 2 } };
    expect(playerMood(dying)).toBe('crying');

    const faded = applyHouseRoundTick(state(player({ houseRound: { floor: 16, turnsLeft: 1 } })));
    expect(faded.player.houseRound).toBeUndefined();
    expect(faded.logs[0]?.text).toContain('wears off');
  });
});

describe('mirror shrine and screens', () => {
  it('appears from D:4 at 12% and paints a mirror', () => {
    expect(shouldPlaceMirror(3, 0)).toBe(false);
    expect(shouldPlaceMirror(4, 0.119)).toBe(true);
    expect(shouldPlaceMirror(4, 0.12)).toBe(false);
    const map: MapGrid = Array.from({ length: 7 }, () =>
      Array.from({ length: 7 }, () => ({ type: 'floor' as const, emoji: '⬜', seen: false, visible: false })),
    );
    expect(placeMirror(map, { x: 1, y: 1, w: 5, h: 5, theme: 'normal' })).toBe(true);
    expect(map[3][3]).toMatchObject({ type: 'mirror', emoji: '🪞' });
  });

  it('offers a reroll when you stand on the mirror', () => {
    const mirror: Tile = { type: 'mirror', emoji: '🪞', seen: true, visible: true };
    const gs = state(player());
    gs.map[1][1] = mirror;
    expect(resolveContextAction(gs).kind).toBe('open-mirror');
  });

  it('renders the mobile gold-sink sheets', () => {
    const gs = state(player(), 1);
    const reroll = renderToStaticMarkup(
      <IdentityRerollModal gameState={gs} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(reroll).toContain('Identity Reroll');
    expect(reroll).toContain('750g');
    expect(reroll).toContain('Ninja');
    expect(reroll).toContain('min-h-11');
    expect(reroll).toContain('disabled');

    const insure = renderToStaticMarkup(
      <InsuranceModal gameState={gs} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(insure).toContain('Vault Insurance');
    expect(insure).toContain('min-h-11');
    expect(insure).toContain('clover');

    const restaurant = renderToStaticMarkup(
      <RestaurantModal
        gameState={gs}
        setGameState={() => {}}
        restaurantItems={[]}
        setRestaurantItems={() => {}}
        restaurantSoldCount={5}
        setRestaurantSoldCount={() => {}}
        addLog={() => {}}
        onClose={() => {}}
      />,
    );
    expect(restaurant).toContain('Round for the House');
    expect(restaurant).toContain('250g');
    expect(restaurant).toContain('stays 5');
  });

  it('documents the sinks in the rules blurb used by RTFM', () => {
    const text = goldSinkRulesBlurb();
    expect(text).toContain('750');
    expect(text).toContain('1500');
    expect(text).toContain('2500');
    expect(text).toContain('100 gold on D:1');
    expect(text).toContain('cap stays 5');
    const rtfm = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(rtfm).toContain('goldSinkRulesBlurb');
  });
});
