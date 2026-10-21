import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CITIZEN_TILES,
  CITY_COLS,
  CITY_ROWS,
  CITY_SIZE,
  DISTRICT_THRESHOLD,
  DISTRICTS,
  GROWTH_TURNS,
  TOKENS_PER_CONSUME,
  WANDER_CATCHUP_CAP,
  applyDistrictBonus,
  availableTokens,
  awaySummary,
  catchUpCity,
  citizenCapacity,
  classifyEmoji,
  districtPickerLine,
  dominantDistrict,
  emptyCity,
  paletteEmojis,
  pickWeightedCitizen,
  placeAt,
  placedCount,
  placedOf,
  removeAt,
  syncCitizens,
  tickCitizens,
  tokensForEmoji,
  totalAvailableTokens,
} from './emojiCity';
import { loadMeta, noteCityTurns, recordEmojiConsume, recordPrestigeWin, saveCity, setMetaStore, settleCityCatchUp, type KeyValueStore } from './meta';
import { COWBOY, FENCER, GENIE, NINJA, RANGER, VOID, WIZARD } from './prestigeConstants';

function memoryStore(): KeyValueStore {
  const mem = new Map<string, string>();
  return {
    getItem: key => mem.get(key) ?? null,
    setItem: (key, value) => { mem.set(key, value); },
    removeItem: key => { mem.delete(key); },
  };
}

function fill(n: number, emoji = '🏠'): ReturnType<typeof emptyCity> {
  const city = emptyCity();
  for (let i = 0; i < n; i++) city.tiles[i] = emoji;
  return city;
}

beforeEach(() => {
  setMetaStore(memoryStore());
});

describe('EmojiCB token math', () => {
  it('grants one token per consume and refunds a removed lot', () => {
    expect(TOKENS_PER_CONSUME).toBe(1);
    expect(tokensForEmoji(0)).toBe(0);
    expect(tokensForEmoji(4)).toBe(4);
    expect(availableTokens(4, 0)).toBe(4);
    expect(availableTokens(4, 3)).toBe(1);
    expect(availableTokens(4, 9)).toBe(0);

    const consumes = { '🔥': 2 };
    let city = emptyCity();
    const first = placeAt(city, 0, '🔥', consumes, {}, () => 0);
    expect(first.ok).toBe(true);
    city = first.city;
    const second = placeAt(city, 1, '🔥', consumes, {}, () => 0);
    expect(second.ok).toBe(true);
    city = second.city;
    expect(availableTokens(2, placedOf(city, '🔥'))).toBe(0);
    expect(totalAvailableTokens(consumes, city)).toBe(0);
    const broke = placeAt(city, 2, '🔥', consumes, {}, () => 0);
    expect(broke.ok).toBe(false);
    expect(broke.reason).toContain('No tokens');

    const refund = removeAt(city, 1, {}, () => 0);
    expect(refund.ok).toBe(true);
    expect(refund.city.tiles[1]).toBeNull();
    expect(availableTokens(2, placedOf(refund.city, '🔥'))).toBe(1);
    const again = placeAt(refund.city, 3, '🔥', consumes, {}, () => 0);
    expect(again.ok).toBe(true);
    expect(again.city.tiles[3]).toBe('🔥');
  });

  it('refuses a filled lot and a lot outside the grid', () => {
    const consumes = { '🌳': 3 };
    const placed = placeAt(emptyCity(), 0, '🌳', consumes, {}, () => 0);
    const stacked = placeAt(placed.city, 0, '🌳', consumes, {}, () => 0);
    expect(stacked.ok).toBe(false);
    expect(removeAt(emptyCity(), 4, {}, () => 0).ok).toBe(false);
    expect(placeAt(emptyCity(), -1, '🌳', consumes, {}, () => 0).ok).toBe(false);
    expect(placeAt(emptyCity(), CITY_SIZE, '🌳', consumes, {}, () => 0).ok).toBe(false);
  });

  it('stores lifetime consumes in the meta save without dropping the city', () => {
    expect(recordEmojiConsume('🍎')).toBe(1);
    expect(recordEmojiConsume('🍎', 2)).toBe(3);
    const city = placeAt(emptyCity(), 0, '🍎', { '🍎': 3 }, {}, () => 0).city;
    saveCity(city);
    recordPrestigeWin(WIZARD);
    const meta = loadMeta();
    expect(meta.emojiConsumes?.['🍎']).toBe(3);
    expect(meta.city?.tiles[0]).toBe('🍎');
    expect(meta.unlockedPrestige.length).toBe(1);
    expect(paletteEmojis(meta.emojiConsumes ?? {}, meta.city!)).toContain('🍎');
  });
});

describe('EmojiCB citizens', () => {
  it('grows capacity by one citizen per five placed tiles', () => {
    expect(CITIZEN_TILES).toBe(5);
    expect(CITY_COLS).toBe(8);
    expect(CITY_ROWS).toBe(8);
    expect(citizenCapacity(0)).toBe(0);
    expect(citizenCapacity(4)).toBe(0);
    expect(citizenCapacity(5)).toBe(1);
    expect(citizenCapacity(9)).toBe(1);
    expect(citizenCapacity(10)).toBe(2);
  });

  it('fills streets from kill weights and leaves them empty with no kills', () => {
    expect(pickWeightedCitizen({}, () => 0)).toBeNull();
    expect(pickWeightedCitizen({ '🧟': 1, '🦇': 1 }, () => 0)).toBe('🧟');
    expect(pickWeightedCitizen({ '🧟': 1, '🦇': 1 }, () => 0.999)).toBe('🦇');

    const quiet = syncCitizens(fill(10), {}, () => 0);
    expect(quiet.citizens).toEqual([]);

    const busy = syncCitizens(fill(15), { '🧟': 9, '🦇': 1 }, () => 0);
    expect(placedCount(busy)).toBe(15);
    expect(busy.citizens).toHaveLength(3);
    expect(busy.citizens.every(c => c.emoji === '🧟')).toBe(true);

    const shrunk = removeAt(busy, 0, { '🧟': 9 }, () => 0).city;
    for (let i = 1; i < 11; i++) {
      shrunk.tiles[i] = null;
    }
    const after = syncCitizens(shrunk, { '🧟': 9 }, () => 0);
    expect(placedCount(after)).toBe(4);
    expect(after.citizens).toHaveLength(0);
  });

  it('steps citizens one lot and stops them on each other', () => {
    const city = emptyCity();
    city.citizens = [
      { id: 'a', emoji: '🧟', x: 0, y: 0 },
      { id: 'b', emoji: '🦇', x: 1, y: 0 },
    ];
    const east = () => 0;
    const stepped = tickCitizens(city, east);
    expect(stepped.citizens[0]).toMatchObject({ x: 0, y: 0 });
    expect(stepped.citizens[1]).toMatchObject({ x: 2, y: 0 });
    const edge = tickCitizens({
      ...emptyCity(),
      citizens: [{ id: 'a', emoji: '🧟', x: 0, y: 0 }],
    }, () => 0.25);
    expect(edge.citizens[0]).toMatchObject({ x: 0, y: 0 });
  });
});

function vessel(characterClass: string, stats: { hp?: number; maxHp?: number; attack?: number; speed?: number; evasion?: number; mana?: number; maxMana?: number } = {}) {
  return {
    characterClass,
    stats: {
      hp: stats.hp ?? 8,
      maxHp: stats.maxHp ?? 8,
      attack: stats.attack ?? 3,
      defense: 1,
      speed: stats.speed ?? 1,
      evasion: stats.evasion ?? 5,
      luck: 0,
      mana: stats.mana ?? 0,
      maxMana: stats.maxMana ?? 0,
    },
  };
}

describe('EmojiCB districts', () => {
  it('classifies themed emoji and leaves food unclassified', () => {
    expect(DISTRICT_THRESHOLD).toBe(4);
    expect(classifyEmoji('🗡️')?.id).toBe('thieves');
    expect(classifyEmoji('🧪')?.id).toBe('arcane');
    expect(classifyEmoji('🔫')?.id).toBe('saloon');
    expect(classifyEmoji('🌳')?.id).toBe('grove');
    expect(classifyEmoji('🌑')?.id).toBe('void');
    expect(classifyEmoji('🍎')).toBeNull();

    const seen = new Map<string, string>();
    for (const style of DISTRICTS) {
      for (const emoji of style.emoji) {
        expect(seen.has(emoji), `${emoji} is in ${seen.get(emoji)} and ${style.id}`).toBe(false);
        seen.set(emoji, style.id);
        expect(classifyEmoji(emoji)?.id).toBe(style.id);
      }
    }
  });

  it('needs four tiles and a strict lead before a style dominates', () => {
    expect(dominantDistrict(fill(3, '🗡️'))).toBeNull();
    expect(dominantDistrict(fill(4, '🗡️'))?.name).toBe('Slums of Thieves');
    const tied = fill(4, '🗡️');
    for (let i = 4; i < 8; i++) tied.tiles[i] = '🧪';
    expect(dominantDistrict(tied)).toBeNull();
    tied.tiles[8] = '🗡️';
    expect(dominantDistrict(tied)?.id).toBe('thieves');
    const apples = fill(6, '🍎');
    expect(dominantDistrict(apples)).toBeNull();
    expect(districtPickerLine(NINJA, apples)).toBeNull();
    expect(districtPickerLine(NINJA, fill(4, '🗡️'))).toBe('Slums of Thieves: +1 SPD at run start');
    expect(districtPickerLine(WIZARD, fill(4, '🗡️'))).toBe('Slums of Thieves favors Ninja (+1 SPD)');
  });

  it('grants the run-start bonus to the matching class and its prestige', () => {
    const thieves = fill(4, '🗡️');
    const ninja = applyDistrictBonus(vessel(NINJA, { speed: 3 }), thieves);
    expect(ninja.player.stats.speed).toBe(4);
    expect(ninja.log).toContain('+1 SPD');
    const fencer = applyDistrictBonus(vessel(FENCER, { speed: 2 }), thieves);
    expect(fencer.player.stats.speed).toBe(3);
    const wizardIgnored = applyDistrictBonus(vessel(WIZARD, { speed: 1, mana: 4, maxMana: 4 }), thieves);
    expect(wizardIgnored.player.stats.speed).toBe(1);
    expect(wizardIgnored.player.stats.maxMana).toBe(4);
    expect(wizardIgnored.log).toBeUndefined();

    const sanctum = fill(4, '🧪');
    const wizard = applyDistrictBonus(vessel(WIZARD, { mana: 4, maxMana: 4 }), sanctum);
    expect(wizard.player.stats.mana).toBe(6);
    expect(wizard.player.stats.maxMana).toBe(6);
    const genie = applyDistrictBonus(vessel(GENIE, { mana: 6, maxMana: 6 }), sanctum);
    expect(genie.player.stats.maxMana).toBe(8);
    expect(genie.player.stats.mana).toBe(8);

    const saloon = fill(4, '🔫');
    expect(applyDistrictBonus(vessel(COWBOY, { attack: 4 }), saloon).player.stats.attack).toBe(5);
    const grove = fill(4, '🌳');
    expect(applyDistrictBonus(vessel(RANGER, { evasion: 10 }), grove).player.stats.evasion).toBe(11);
    const hollow = fill(4, '🌑');
    const voided = applyDistrictBonus(vessel(VOID, { hp: 6, maxHp: 6 }), hollow);
    expect(voided.player.stats.hp).toBe(8);
    expect(voided.player.stats.maxHp).toBe(8);
    expect(applyDistrictBonus(vessel(WIZARD), fill(6, '🍎')).log).toBeUndefined();
  });
});

describe('EmojiCB catch-up', () => {
  it('builds one lot per ten turns and keeps the leftover turns', () => {
    expect(GROWTH_TURNS).toBe(10);
    expect(WANDER_CATCHUP_CAP).toBe(200);
    const idle = catchUpCity({ city: emptyCity(), consumes: { '🔫': 4 }, kills: {}, pendingTurns: 0, rng: () => 0 });
    expect(idle.buildingsGained).toBe(0);
    expect(idle.turns).toBe(0);

    const consumes = { '🔫': 9, '🍺': 9 };
    const first = catchUpCity({ city: emptyCity(), consumes, kills: {}, pendingTurns: 10, rng: () => 0 });
    expect(first.buildingsGained).toBe(1);
    expect(first.growthRemainder).toBe(0);
    expect(consumes['🔫']).toBe(9);

    const second = catchUpCity({ city: first.city, consumes, kills: {}, pendingTurns: 25, rng: () => 0 });
    expect(second.buildingsGained).toBe(2);
    expect(second.growthRemainder).toBe(5);
    const third = catchUpCity({
      city: second.city,
      consumes,
      kills: {},
      pendingTurns: 7,
      growthRemainder: second.growthRemainder,
      rng: () => 0,
    });
    expect(third.buildingsGained).toBe(1);
    expect(third.growthRemainder).toBe(2);
  });

  it('fills citizens from the kill ledger without copying or spending consumes', () => {
    const consumes = { '🗡️': 5 };
    const caught = catchUpCity({
      city: emptyCity(),
      consumes,
      kills: { '🧟': 3 },
      pendingTurns: 50,
      rng: () => 0,
    });
    expect(caught.buildingsGained).toBe(5);
    expect(placedCount(caught.city)).toBe(5);
    expect(caught.citizensGained).toBe(1);
    expect(caught.city.citizens[0]?.emoji).toBe('🧟');
    expect(consumes).toEqual({ '🗡️': 5 });

    const quiet = catchUpCity({
      city: emptyCity(),
      consumes: { '🗡️': 5 },
      kills: {},
      pendingTurns: 50,
      rng: () => 0,
    });
    expect(quiet.buildingsGained).toBe(5);
    expect(quiet.citizensGained).toBe(0);

    const waiting = fill(5, '🏠');
    const arrived = catchUpCity({ city: waiting, consumes: { '🏠': 5 }, kills: { '🧟': 2 }, pendingTurns: 0, rng: () => 0 });
    expect(arrived.citizensGained).toBe(1);
    expect(arrived.buildingsGained).toBe(0);
  });

  it('caps wander steps on a long absence', () => {
    const city = fill(5, '🌳');
    city.citizens = [{ id: 'c-1', emoji: '🧟', x: 1, y: 1 }];
    let calls = 0;
    const caught = catchUpCity({
      city,
      consumes: { '🌳': 5 },
      kills: { '🧟': 1 },
      pendingTurns: 5000,
      rng: () => { calls += 1; return 0; },
    });
    expect(caught.buildingsGained).toBe(0);
    expect(caught.turns).toBe(5000);
    expect(calls).toBeLessThan(1000);
    expect(awaySummary(12, 3)).toBe('While you were away: +12 turns, +3 citizens');
  });

  it('stores pending turns in the meta save and clears them on catch-up', () => {
    expect(noteCityTurns(3)).toBe(3);
    expect(noteCityTurns(2)).toBe(5);
    recordEmojiConsume('🍎');
    saveCity(emptyCity());
    recordPrestigeWin(WIZARD);
    expect(loadMeta().pendingCityTurns).toBe(5);
    const caught = catchUpCity({
      city: loadMeta().city ?? emptyCity(),
      consumes: loadMeta().emojiConsumes ?? {},
      kills: {},
      pendingTurns: loadMeta().pendingCityTurns ?? 0,
      growthRemainder: loadMeta().cityGrowthRemainder ?? 0,
      rng: () => 0,
    });
    settleCityCatchUp(caught.city, caught.growthRemainder);
    const meta = loadMeta();
    expect(meta.pendingCityTurns).toBe(0);
    expect(meta.cityGrowthRemainder).toBe(5);
    expect(meta.emojiConsumes?.['🍎']).toBe(1);
    expect(meta.unlockedPrestige).toHaveLength(1);
    expect(meta.city?.tiles.some(Boolean)).toBe(false);
  });
});

describe('EmojiCB surfaces', () => {
  it('is linked from home and described in the manual', () => {
    const home = readFileSync(new URL('../pages/home.tsx', import.meta.url), 'utf8');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const city = readFileSync(new URL('../pages/city.tsx', import.meta.url), 'utf8');
    const game = readFileSync(new URL('../pages/game.tsx', import.meta.url), 'utf8');
    expect(home).toContain('href="/city"');
    expect(home).toContain('EmojiCB');
    expect(home).toContain('vessel-district');
    expect(manual).toContain('emojiCityRulesBlurb');
    expect(app).toContain('path="/city"');
    expect(city).toContain('catchUpCity');
    expect(city).toContain('city-away');
    expect(game).toContain('noteCityTurns');
    expect(game).toContain('applyDistrictBonus');
  });
});
