import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EmojiItem, Enemy, GameState, MapGrid, Player, Tile } from './types';
import { RESTAURANT_COOKED_SELL_LIMIT } from './economy';
import { getMood } from './moods';
import { rawCombatStats } from './inventory';
import { placeLoneCampfire } from './mapgen';
import { resolveContextAction } from './contextAction';
import { CampfireBanquetModal } from '../components/CampfireBanquetModal';
import { ShrineOfferingModal } from '../components/ShrineOfferingModal';
import { CompanionTalkDialog } from '../components/InteractionDialogs';
import {
  BANQUET_MIN_DISHES,
  LONE_CAMPFIRE_CHANCE,
  applyBanquetTick,
  banquetPlan,
  clearShrineOffering,
  executeBanquet,
  executeFeast,
  executeShrineOffer,
  feastDefense,
  foodSinkRulesBlurb,
  mapHasCampfire,
  shouldPlaceLoneCampfire,
  tickFeastBuffs,
} from './foodSinks';

function item(over: Partial<EmojiItem> & Pick<EmojiItem, 'emoji' | 'name'>): EmojiItem {
  return { id: over.id ?? over.name, description: over.description ?? '', consumed: false, ...over };
}

function cooked(id: string, heal = 8): EmojiItem {
  return item({ id, emoji: '🥩', name: id, healAmount: heal, isCooked: true });
}

function playerWith(inventory: EmojiItem[], bank: EmojiItem[] = [], hp = 4, gold = 40): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp, maxHp: 20, attack: 4, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold,
    },
    inventory,
    bank,
    equipment: {},
  };
}

function wolf(over: Partial<Enemy> = {}): Enemy {
  return {
    id: 'wolf', emoji: '🐺', name: 'Wolf', pos: { x: 2, y: 1 },
    hp: 10, maxHp: 10, attack: 3, defense: 1, speed: 2, engaged: false,
    tag: 'Friendly', isRecruited: true, xp: 0, level: 1, loyalty: 0,
    ...over,
  };
}

const floor: Tile = { type: 'floor', emoji: '⬜', seen: true, visible: true };

function stubState(over: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: 1,
    player: playerWith([]),
    currentFloor: 4,
    map: [
      [floor, floor, floor],
      [floor, floor, floor],
      [floor, floor, floor],
    ],
    enemies: [],
    items: [],
    turn: 3,
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

describe('food sink numbers', () => {
  it('keeps the restaurant cooked-sell cap at 5', () => {
    expect(RESTAURANT_COOKED_SELL_LIMIT).toBe(5);
    expect(foodSinkRulesBlurb()).toContain('5');
  });

  it('scales a banquet from 3 dishes and caps it', () => {
    expect(BANQUET_MIN_DISHES).toBe(3);
    expect(banquetPlan(3)).toEqual({ floor: 12, turns: 8 });
    expect(banquetPlan(4)).toEqual({ floor: 16, turns: 10 });
    expect(banquetPlan(10)).toEqual({ floor: 28, turns: 16 });
  });

  it('places a lone campfire only when the floor has none and the roll is under 22%', () => {
    expect(LONE_CAMPFIRE_CHANCE).toBeCloseTo(0.22);
    expect(shouldPlaceLoneCampfire(false, 0.21)).toBe(true);
    expect(shouldPlaceLoneCampfire(false, 0.22)).toBe(false);
    expect(shouldPlaceLoneCampfire(true, 0)).toBe(false);
  });
});

describe('campfire banquet', () => {
  it('fully heals, keeps overheal and gold, and spends cooked dishes from the bank', () => {
    const dishes = [cooked('a'), cooked('b'), cooked('c')];
    const hurt = executeBanquet(playerWith([], dishes, 4, 77), ['a', 'b', 'c']);
    expect(hurt.ok).toBe(true);
    expect(hurt.player?.stats.hp).toBe(20);
    expect(hurt.player?.stats.gold).toBe(77);
    expect(hurt.player?.bank).toEqual([]);
    expect(hurt.player?.banquet).toEqual({ floor: 12, turnsLeft: 8 });

    const over = executeBanquet(playerWith(dishes, [], 30, 77), ['a', 'b', 'c']);
    expect(over.player?.stats.hp).toBe(30);
    expect(over.player?.stats.gold).toBe(77);
  });

  it('refuses a short pile and anything that is not a cooked dish', () => {
    const two = executeBanquet(playerWith([cooked('a'), cooked('b')]), ['a', 'b']);
    expect(two.ok).toBe(false);
    const raw = item({ id: 'raw', emoji: '🍎', name: 'Apple', healAmount: 4 });
    const mixed = executeBanquet(playerWith([cooked('a'), cooked('b'), raw], [], 4, 12), ['a', 'b', 'raw']);
    expect(mixed.ok).toBe(false);
    expect(mixed.player).toBeUndefined();
  });

  it('ticks the mood floor down and does not override a last stand', () => {
    const held = playerWith([]);
    held.banquet = { floor: 16, turnsLeft: 2 };
    const once = applyBanquetTick(stubState({ player: held }));
    expect(once.player.banquet?.turnsLeft).toBe(1);
    const fading = { ...held, banquet: { floor: 16, turnsLeft: 1 } };
    const done = applyBanquetTick(stubState({ player: fading }));
    expect(done.player.banquet).toBeUndefined();
    expect(done.logs[0]?.text).toContain('fades');

    expect(getMood(-80, 20, 20, 1, false, 0, 16)).toBe('excited');
    expect(getMood(-80, 20, 20, 1, false, 0, 12)).toBe('neutral');
    expect(getMood(0, 2, 20, 1, false, 0, 16)).toBe('desperate');
    expect(getMood(-80, 2, 20, 1, false, 0, 16)).toBe('crying');
  });

  it('paints a fire on grass', () => {
    const map: MapGrid = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => ({ type: 'grass' as const, emoji: '🟩', seen: false, visible: false })),
    );
    const room = { x: 1, y: 1, w: 5, h: 5, theme: 'prairie' as const };
    expect(mapHasCampfire(map)).toBe(false);
    expect(placeLoneCampfire(map, room)).toBe(true);
    expect(map[3][3]).toMatchObject({ type: 'campfire', emoji: '🔥' });
    expect(mapHasCampfire(map)).toBe(true);
  });
});

describe('companion feast', () => {
  it('gives a modest buff, loyalty, and XP by food tier, and replaces the last feast', () => {
    const bite = item({ id: 'apple', emoji: '🍎', name: 'Apple', healAmount: 4 });
    const square = item({ id: 'sandwich', emoji: '🥪', name: 'Sandwich', healAmount: 8, isCooked: true });
    const hearty = cooked('steak', 12);
    const potion = item({ id: 'pot', emoji: '🧪', name: 'Potion', healAmount: 10 });

    const nibbled = executeFeast(playerWith([bite], [], 20), wolf(), 'apple');
    expect(nibbled.ok).toBe(true);
    expect(nibbled.companion?.feastBuff).toMatchObject({ attack: 1, defense: 0, turnsLeft: 6 });
    expect(nibbled.companion?.xp).toBe(3);
    expect(nibbled.companion?.level).toBe(1);
    expect(nibbled.companion?.attack).toBe(3);
    expect(nibbled.companion?.loyalty).toBe(1);
    expect(nibbled.player?.stats.gold).toBe(40);
    expect(nibbled.player?.inventory).toEqual([]);

    const fed = executeFeast(playerWith([square]), wolf(), 'sandwich');
    expect(fed.companion?.level).toBe(2);
    expect(fed.companion?.attack).toBe(4);
    expect(fed.companion?.feastBuff).toMatchObject({ attack: 1, defense: 1, turnsLeft: 8 });
    expect(fed.companion?.xp).toBe(5);

    const big = executeFeast(playerWith([hearty]), wolf({ feastBuff: { attack: 9, defense: 9, turnsLeft: 4, label: 'old' } }), 'steak');
    expect(big.companion?.feastBuff).toMatchObject({ attack: 2, defense: 1, turnsLeft: 10 });
    expect(big.companion?.loyalty).toBe(1);
    expect(feastDefense(big.companion!)).toBe(2);

    const refused = executeFeast(playerWith([potion]), wolf(), 'pot');
    expect(refused.ok).toBe(false);
    expect(refused.player).toBeUndefined();
  });

  it('lets the feast defense expire', () => {
    const enemy = wolf({ defense: 2, feastBuff: { attack: 1, defense: 1, turnsLeft: 1, label: 'Apple' } });
    expect(feastDefense(enemy)).toBe(3);
    const ticked = tickFeastBuffs([enemy]);
    expect(ticked.enemies[0].feastBuff).toBeUndefined();
    expect(ticked.logs[0]).toContain('feast fades');
    expect(feastDefense(ticked.enemies[0])).toBe(2);
  });
});

describe('shrine offering', () => {
  it('blesses once per floor through combat stats and clears on descend', () => {
    const apple = item({ id: 'apple', emoji: '🍎', name: 'Apple', healAmount: 3 });
    const steak = cooked('steak', 12);
    const first = executeShrineOffer(playerWith([apple, steak], [], 20, 15), 'steak');
    expect(first.ok).toBe(true);
    expect(first.player?.shrineOffering).toMatchObject({ attack: 2, defense: 1, turnsNote: 'floor', foodEmoji: '🥩' });
    expect(first.player?.inventory.map(entry => entry.id)).toEqual(['apple']);
    expect(first.player?.stats.gold).toBe(15);
    const base = rawCombatStats(playerWith([apple], [], 20, 15));
    const blessed = rawCombatStats(first.player!);
    expect(blessed.attack - base.attack).toBe(2);
    expect(blessed.defense - base.defense).toBe(1);

    const second = executeShrineOffer(first.player!, 'apple');
    expect(second.ok).toBe(false);
    expect(second.reason).toContain('already holds');
    expect(clearShrineOffering(first.player!).shrineOffering).toBeUndefined();
  });
});

describe('food sink context and screens', () => {
  it('banquets at a campfire once three cooked dishes are in hand, and still prays at a live shrine', () => {
    const campfire: Tile = { type: 'campfire', emoji: '🔥', seen: true, visible: true };
    const shrine: Tile = { type: 'shrine', emoji: '🛕', seen: true, visible: true };
    const used: Tile = { type: 'shrine-used', emoji: '🛕', seen: true, visible: true };
    const slots: Tile = { type: 'slot-shrine', emoji: '🎰', seen: true, visible: true };
    const dishes = [cooked('a'), cooked('b'), cooked('c')];
    const raw = item({ id: 'raw', emoji: '🍎', name: 'Apple', healAmount: 4 });
    const byFire = stubState({
      player: playerWith([...dishes, raw]),
      map: [
        [floor, floor, floor],
        [floor, floor, campfire],
        [floor, floor, floor],
      ],
    });
    expect(resolveContextAction(byFire).kind).toBe('banquet');

    const short = stubState({
      player: playerWith([cooked('a'), cooked('b'), raw]),
      map: byFire.map,
    });
    expect(resolveContextAction(short).kind).toBe('cook');

    const pray = stubState({
      player: playerWith(dishes),
      map: [
        [floor, shrine, floor],
        [floor, floor, floor],
        [floor, floor, floor],
      ],
    });
    expect(resolveContextAction(pray).kind).toBe('shrine');

    const offer = stubState({
      map: [
        [floor, used, floor],
        [floor, floor, floor],
        [floor, floor, floor],
      ],
    });
    expect(resolveContextAction(offer).kind).toBe('offer');

    const spinning = stubState({
      map: [
        [floor, floor, floor],
        [floor, slots, floor],
        [floor, floor, floor],
      ],
    });
    expect(resolveContextAction(spinning).kind).toBe('open-slots');
  });

  it('renders the mobile banquet and offering sheets without spending gold', () => {
    const dishes = [cooked('a'), cooked('b'), cooked('c')];
    const gs = stubState({ player: playerWith(dishes, [], 4, 777) });
    const banquet = renderToStaticMarkup(
      <CampfireBanquetModal gameState={gs} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(banquet).toContain('Campfire Banquet');
    expect(banquet).toContain('min-h-11');
    expect(banquet).toContain('Mood floor');
    expect(banquet).not.toContain('777');

    const offering = renderToStaticMarkup(
      <ShrineOfferingModal gameState={gs} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(offering).toContain('Shrine Offering');
    expect(offering).toContain('this floor');
    expect(offering).not.toContain('777');

    const blocked = stubState({
      player: {
        ...playerWith([item({ id: 'apple', emoji: '🍎', name: 'Apple', healAmount: 4 })], [], 20, 777),
        shrineOffering: { attack: 1, defense: 0, turnsNote: 'floor', label: 'Apple', foodEmoji: '🍎' },
      },
    });
    const refused = renderToStaticMarkup(
      <ShrineOfferingModal gameState={blocked} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(refused).toContain('already holds your offering');
    expect(refused).toContain('disabled');
  });

  it('offers a feast from the companion sheet', () => {
    const gs = stubState({
      player: playerWith([item({ id: 'apple', emoji: '🍎', name: 'Apple', healAmount: 4 })]),
      enemies: [wolf({ loyalty: 2, feastBuff: { attack: 1, defense: 0, turnsLeft: 4, label: 'Apple' } })],
    });
    const html = renderToStaticMarkup(
      <CompanionTalkDialog gameState={gs} setGameState={() => {}} companionId="wolf" onClose={() => {}} />,
    );
    expect(html).toContain('Feast');
    expect(html).toContain('Loyalty 2');
    expect(html).toContain('min-h-11');
  });

  it('documents the sinks in the rules blurb used by RTFM', () => {
    const text = foodSinkRulesBlurb();
    expect(text).toContain('22%');
    expect(text).toContain('at least 3');
    expect(text).toContain('once per floor');
    expect(text).toMatch(/Potions, hearts, and gold/);
    const rtfm = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(rtfm).toContain('foodSinkRulesBlurb');
  });
});
