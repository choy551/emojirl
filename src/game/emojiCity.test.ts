import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CITIZEN_TILES,
  CITY_COLS,
  CITY_ROWS,
  CITY_SIZE,
  TOKENS_PER_CONSUME,
  availableTokens,
  citizenCapacity,
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
import { loadMeta, recordEmojiConsume, recordPrestigeWin, saveCity, setMetaStore, type KeyValueStore } from './meta';
import { WIZARD } from './prestigeConstants';

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

describe('EmojiCB surfaces', () => {
  it('is linked from home and described in the manual', () => {
    const home = readFileSync(new URL('../pages/home.tsx', import.meta.url), 'utf8');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(home).toContain('href="/city"');
    expect(home).toContain('EmojiCB');
    expect(manual).toContain('emojiCityRulesBlurb');
    expect(app).toContain('path="/city"');
  });
});
