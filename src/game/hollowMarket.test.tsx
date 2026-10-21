import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EmojiItem, GameState, MapGrid, Player, Tile } from './types';
import { EMOJI_POWERS } from './emojis';
import { generateMap, placeFloorService } from './mapgen';
import { resolveContextAction } from './contextAction';
import { playerBagPassives } from './inventory';
import { getPassiveTooltipSuffix } from './passives';
import { saveGame, loadGame } from './save';
import { readGhostCatalog } from './voidMeta';
import { HollowMarketModal } from '../components/HollowMarketModal';
import { HotbarPanel } from '../components/HotbarPanel';
import { ActivePassivesPanel } from '../components/ActivePassivesPanel';
import { MobileBagStrip } from '../components/mobile/MobileBagStrip';
import {
  HOLLOW_CHANCE,
  HOLLOW_EMOJI,
  HOLLOW_HP_CONSUMES,
  HOLLOW_HP_COST,
  HOLLOW_REROLL_SPARE,
  HOLLOW_UNMAKE_CONSUMES,
  offerBlood,
  rerollVoidProgress,
  shouldPlaceHollow,
  unmakeAtMarket,
} from './hollowMarket';
import { addVoidConsumes } from './voidMeta';

function installStorage() {
  const mem = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
}

installStorage();

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: true, visible: true };
}

function soul(emoji: string, id: string, over: Partial<EmojiItem> = {}): EmojiItem {
  const power = EMOJI_POWERS.find(e => e.emoji === emoji);
  return {
    id,
    emoji,
    name: power?.name ?? emoji,
    description: power?.description ?? 'soul',
    consumed: false,
    bagPassive: power?.bagPassive ?? { description: 'soul', attackBonus: 1 },
    ...over,
  };
}

function ghostItem(emoji: string, stacks: number, dormant = false): EmojiItem {
  return {
    ...soul(emoji, `void-ghost:${emoji}`),
    stackCount: stacks,
    isVoidGhost: true,
    isVoidGhostDormant: dormant || undefined,
  };
}

function player(over: Partial<Player> = {}): Player {
  const base: Player = {
    pos: { x: 1, y: 1 },
    emoji: '👤',
    characterClass: '👤',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 3, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 777,
    },
    inventory: [],
    bank: [],
    equipment: {},
  };
  return { ...base, ...over, stats: { ...base.stats, ...over.stats } };
}

function state(p: Player, floor = 3, over: Partial<GameState> = {}): GameState {
  const map: MapGrid = [
    [tile('wall', '⬛'), tile('wall', '⬛'), tile('wall', '⬛')],
    [tile('wall', '⬛'), tile('hollow', HOLLOW_EMOJI), tile('floor', '⬜')],
    [tile('wall', '⬛'), tile('floor', '⬜'), tile('floor', '⬜')],
  ];
  return {
    schemaVersion: 1,
    player: p,
    currentFloor: floor,
    map,
    enemies: [],
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

beforeEach(() => {
  localStorage.clear();
});

describe('Hollow Market numbers', () => {
  it('appears on about 22% of Void floors and never for other runs', () => {
    expect(HOLLOW_CHANCE).toBe(0.22);
    expect(shouldPlaceHollow(1, 0.21, true)).toBe(true);
    expect(shouldPlaceHollow(1, 0.22, true)).toBe(false);
    expect(shouldPlaceHollow(8, 0, false)).toBe(false);
    expect(HOLLOW_UNMAKE_CONSUMES).toBe(3);
    expect(HOLLOW_REROLL_SPARE).toBe(5);
    expect(HOLLOW_HP_COST).toBe(5);
    expect(HOLLOW_HP_CONSUMES).toBe(2);
  });

  it('places the tile only when the floor is a Void run', () => {
    const room = { x: 0, y: 0, w: 5, h: 5, theme: 'normal' as const };
    const map: MapGrid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => tile('floor', '⬜')));
    expect(placeFloorService(map, room, 'hollow', HOLLOW_EMOJI)).toBe(true);
    expect(map[2][2]).toMatchObject({ type: 'hollow', emoji: HOLLOW_EMOJI });

    for (let i = 0; i < 12; i++) {
      const generated = generateMap(1 + (i % 6));
      expect(generated.map.flat().some(t => t.type === 'hollow')).toBe(false);
    }
    const seen = Array.from({ length: 40 }, (_, i) => generateMap(1 + (i % 8), { voidRun: true }))
      .some(g => g.map.flat().some(t => t.type === 'hollow'));
    expect(seen).toBe(true);
  });
});

describe('Hollow Market trades', () => {
  it('unmakes a hotbar soul for consumes and never touches gold', () => {
    addVoidConsumes('🔥', 8);
    const before = player({ inventory: [soul('🔥', 'fire'), soul('🍖', 'meat', { bagPassive: undefined, healAmount: 4 })] });
    const refused = unmakeAtMarket(before, 'meat', 3);
    expect(refused.ok).toBe(false);
    expect(before.inventory).toHaveLength(2);

    const deal = unmakeAtMarket(before, 'fire', 3);
    expect(deal.ok).toBe(true);
    expect(deal.player?.stats.gold).toBe(777);
    expect(deal.player?.inventory.map(i => i.id)).toEqual(['meat']);
    expect(readGhostCatalog()['🔥']).toMatchObject({ consumes: 11, unlocks: 1 });
    expect(deal.player?.ghostHotbar?.some(g => g?.emoji === '🔥' && g.stacks === 1)).toBe(true);
    expect(deal.log).toContain('+3 consumes');

    const again = unmakeAtMarket(deal.player!, 'meat', 3, deal.hollowUsedFloor);
    expect(again.ok).toBe(false);
    expect(again.reason).toContain('this floor');
  });

  it('moves spare consumes without dropping the source stack', () => {
    addVoidConsumes('🔥', 15);
    addVoidConsumes('❤️', 8);
    addVoidConsumes('🌟', 3);
    const held = player({
      ghostHotbar: [{ emoji: '🔥', stacks: 1 }, null, null, null, null, null, null, null, null],
    });
    const short = rerollVoidProgress(held, '🌟', 2, undefined, 0);
    expect(short.ok).toBe(false);
    expect(readGhostCatalog()['🌟']?.consumes).toBe(3);

    const deal = rerollVoidProgress(held, '🔥', 2, undefined, 0);
    expect(deal.ok).toBe(true);
    expect(deal.player?.stats.gold).toBe(777);
    expect(deal.player?.ghostHotbar?.[0]).toEqual({ emoji: '🔥', stacks: 1 });
    expect(readGhostCatalog()['🔥']).toMatchObject({ consumes: 10, unlocks: 1 });
    expect(readGhostCatalog()['❤️']).toMatchObject({ consumes: 13, unlocks: 1 });
    expect(deal.player?.ghostHotbar?.some(g => g?.emoji === '❤️' && g.stacks === 1) || deal.player?.ghostBank?.some(g => g.emoji === '❤️' && g.stacks === 1)).toBe(true);
    expect(deal.log).toContain(`Moved ${HOLLOW_REROLL_SPARE}`);
  });

  it('trades HP for ghost progress and refuses a lethal offering', () => {
    const held = player({
      stats: { ...player().stats, hp: 6 },
      ghostHotbar: [{ emoji: '🔥', stacks: 1 }, null, null, null, null, null, null, null, null],
    });
    const low = offerBlood({ ...held, stats: { ...held.stats, hp: 5 } }, '🔥', 4);
    expect(low.ok).toBe(false);
    expect(readGhostCatalog()['🔥']).toBeUndefined();

    const deal = offerBlood(held, '🔥', 4);
    expect(deal.ok).toBe(true);
    expect(deal.player?.stats.hp).toBe(1);
    expect(deal.player?.stats.gold).toBe(777);
    expect(readGhostCatalog()['🔥']).toMatchObject({ consumes: HOLLOW_HP_CONSUMES, unlocks: 0 });

    const stranger = offerBlood(held, '💎', 4);
    expect(stranger.ok).toBe(false);
  });

  it('stays closed for anyone who is not the Void', () => {
    const wizard = player({ emoji: '🧙', characterClass: '🧙', inventory: [soul('🔥', 'fire')] });
    const deal = unmakeAtMarket(wizard, 'fire', 1);
    expect(deal.ok).toBe(false);
    expect(deal.reason).toContain('closed');
    expect(wizard.stats.gold).toBe(777);
    expect(readGhostCatalog()['🔥']).toBeUndefined();
    const sheet = renderToStaticMarkup(
      <HollowMarketModal gameState={state(wizard)} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(sheet).toContain('Only the Void');
    expect(sheet).toContain('min-h-11');
  });
});

describe('Hollow Market presentation', () => {
  it('opens from the tile and documents the trades without a gold price', () => {
    const here = state(player({ inventory: [soul('🔥', 'fire')], ghostHotbar: [{ emoji: '💎', stacks: 2 }, null, null, null, null, null, null, null, null] }));
    expect(resolveContextAction(here).kind).toBe('open-hollow');
    const sheet = renderToStaticMarkup(
      <HollowMarketModal gameState={here} setGameState={() => {}} addLog={() => {}} onClose={() => {}} />,
    );
    expect(sheet).toContain('does not deal in gold');
    expect(sheet).toContain('Unmake 🔥');
    expect(sheet).toContain(`+${HOLLOW_UNMAKE_CONSUMES} consumes`);
    expect(sheet).toContain(`Offer ${HOLLOW_HP_COST} HP`);
    expect(sheet).toContain('min-h-11');
    expect(sheet).toContain('aria-label="Hollow Market"');
    expect(sheet).not.toMatch(/\d+g/);

    const rtfm = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(rtfm).toContain('voidExtrasRulesBlurb');
    expect(rtfm).toContain('Hollow Market and grace');
  });

  it('keeps grace and the market visit in the run save', () => {
    const saved = state(player(), 6, { voidGraceFloor: 6, hollowUsedFloor: 6 });
    saveGame(saved);
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind === 'ok') {
      expect(loaded.state.voidGraceFloor).toBe(6);
      expect(loaded.state.hollowUsedFloor).toBe(6);
    }
  });
});

describe('ghost stack polish', () => {
  it('names every ghost stack and does not multiply a flat bonus', () => {
    const fire = ghostItem('🔥', 3);
    const heart = ghostItem('❤️', 2);
    const dormant = ghostItem('🌟', 1, true);
    expect(getPassiveTooltipSuffix(fire)).toContain('Ghost stack ×3');
    expect(getPassiveTooltipSuffix(fire)).toContain('+1 ATK');
    expect(getPassiveTooltipSuffix(heart)).toContain('Passive ×2');
    expect(getPassiveTooltipSuffix(heart)).toContain('Ghost stack ×2');
    expect(getPassiveTooltipSuffix(dormant)).toContain('Ghost stack ×1');
    expect(getPassiveTooltipSuffix(dormant)).toContain('dormant');

    const capped = playerBagPassives(player({
      ghostHotbar: [
        { emoji: '🔥', stacks: 3 },
        { emoji: '❤️', stacks: 4 },
        null, null, null, null, null, null, null,
      ],
      voidBossesCleared: 1,
    }));
    expect(capped.attack).toBe(1);
    expect(capped.vampiricStrike).toBe(4);

    const slots = [fire, heart, null, null, null, null, null, null, null];
    const hotbar = renderToStaticMarkup(
      <HotbarPanel
        bagSlots={slots}
        bank={[]}
        selectedItemId={null}
        focusedBagIdx={0}
        onSelect={() => {}}
        onMove={() => {}}
        onShowStatCard={() => {}}
      />,
    );
    expect(hotbar).toContain('data-testid="ghost-stack-🔥"');
    expect(hotbar).toContain('×3');
    expect(hotbar).toContain('Ghost stack ×3');
    expect(hotbar).toContain('Ghost stack ×2');

    const passives = renderToStaticMarkup(<ActivePassivesPanel bagSlots={slots} />);
    expect(passives).toContain('Ghost stack ×3');
    expect(passives).toContain('Ghost stack ×2');

    const mobile = renderToStaticMarkup(
      <MobileBagStrip
        bagSlots={slots}
        healSlots={[]}
        drinkSlots={[]}
        onUseSlot={() => {}}
        onUseHeal={() => {}}
        onUseDrink={() => {}}
        onOpenBag={() => {}}
        itemInspectProps={() => ({})}
      />,
    );
    expect(mobile).toContain('Ghost stack ×2');
    expect(mobile).toContain('data-testid="ghost-stack-❤️"');
  });
});
