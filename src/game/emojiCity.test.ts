import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CITIZEN_TILES,
  CITY_COLS,
  CITY_ROWS,
  CITY_SIZE,
  CITY_DIM_MAX,
  CITY_EXPAND_COST,
  DECOR,
  DISTRICT_BONUS_TIER_CAP,
  DISTRICT_THRESHOLD,
  DISTRICTS,
  GROWTH_TURNS,
  TOKENS_PER_CONSUME,
  WANDER_CATCHUP_CAP,
  activeDistricts,
  applyDistrictBonus,
  buildPaletteSections,
  paletteMenuRows,
  availableTokens,
  awaySummary,
  catchUpCity,
  cityGridIsFull,
  citizenCapacity,
  citizenCapacityOf,
  classifyEmoji,
  districtBonusTier,
  districtHudLine,
  districtPickerEntries,
  districtPickerLine,
  districtStandings,
  districtTileWeight,
  DEFAULT_BLOCKED_TYPES,
  emptyCity,
  isDecorEmoji,
  lotUnpassable,
  isDecorLot,
  normalizeCity,
  emojiCityRulesBlurb,
  expandBlockReason,
  expandCity,
  fullCityConsumeNotice,
  scaledBonusAmount,
  paletteEmojis,
  supplyPalette,
  pickWeightedCitizen,
  placeAt,
  placeDecor,
  placedCount,
  placedOf,
  removeAt,
  setSquarePass,
  syncCitizens,
  tickCitizens,
  toggleBlockedType,
  tokensForEmoji,
  tokensGrantedForRunConsume,
  totalAvailableTokens,
  TRAIN_EMOJI,
  TRAIN_LINE_HINT,
  isTrainEmoji,
  spanningTrainLine,
  trainLineSpansCity,
  trainLineStatusLabel,
} from './emojiCity';
import { CITY_NAME_DEFAULT, CITY_NAME_MAX, generateAnonymousName, isAnonymousName, normalizeCityName } from './cityIdentity';
import { BUILDINGS } from './cityBuildings';
import { DROP_RARITIES, FULL_GRID_RARITY_TOKENS } from './dropTable';
import { ensureCityProfile, loadMeta, noteCityTurns, recordEmojiConsume, recordPrestigeWin, recordRunEmojiConsume, replaceEmojiConsumes, saveCity, saveCityName, saveMeta, setMetaStore, settleCityCatchUp, type KeyValueStore } from './meta';
import { COWBOY, FENCER, GENIE, HITMAN, META_SAVE_KEY, META_SCHEMA_VERSION, NINJA, RANGER, ROYAL_GUARD, VOID, WIZARD } from './prestigeConstants';

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

  it('converts a full-grid consume by drop rarity, from 1 token to 5', () => {
    expect(DROP_RARITIES).toEqual(['common', 'uncommon', 'rare', 'legendary']);
    expect(FULL_GRID_RARITY_TOKENS).toEqual({
      common: 1,
      uncommon: 2,
      rare: 4,
      legendary: 5,
    });
    expect(cityGridIsFull(undefined)).toBe(false);
    expect(cityGridIsFull(emptyCity())).toBe(false);
    expect(tokensGrantedForRunConsume(undefined, 1, 5)).toBe(TOKENS_PER_CONSUME);

    const unsaved = recordRunEmojiConsume('🍇', 1, { emoji: '🍇', healAmount: 2 });
    expect(unsaved).toMatchObject({ granted: 1, notice: null, count: 1 });

    const open = emptyCity();
    open.tiles[0] = '🏠';
    saveCity(open);
    replaceEmojiConsumes({ '🍎': 4 });
    const spared = recordRunEmojiConsume('🍀', 1, { emoji: '🍀', bagPassive: { bonusLoot: true } });
    expect(spared.granted).toBe(1);
    expect(spared.notice).toBeNull();
    expect(loadMeta().emojiConsumes?.['🍀']).toBe(1);
    expect(loadMeta().emojiConsumes?.['🍎']).toBe(4);

    const almost = emptyCity();
    for (let i = 0; i < almost.tiles.length - 1; i++) almost.tiles[i] = '🏠';
    saveCity(almost);
    const hole = recordRunEmojiConsume('🍎', 1, { emoji: '🍎', healAmount: 2 });
    expect(cityGridIsFull(almost)).toBe(false);
    expect(hole.granted).toBe(TOKENS_PER_CONSUME);
    expect(hole.notice).toBeNull();

    const full = emptyCity();
    for (let i = 0; i < full.tiles.length; i++) full.tiles[i] = '🏠';
    saveCity(full);
    replaceEmojiConsumes({});

    const common = recordRunEmojiConsume('🍎', 1, { emoji: '🍎', healAmount: 2 });
    expect(common.granted).toBe(FULL_GRID_RARITY_TOKENS.common);
    expect(common.notice).toBe('🏙️ City is full. 🍎 became 1 token.');

    const uncommon = recordRunEmojiConsume('🪢', 1, { emoji: '🪢', activeKind: 'rope' });
    expect(uncommon.granted).toBe(2);
    expect(uncommon.notice).toBe(fullCityConsumeNotice('🪢', 1, 2));

    const beforeRare = totalAvailableTokens(loadMeta().emojiConsumes ?? {}, loadMeta().city!);
    const rareGear = recordRunEmojiConsume('🗡️', 1, { emoji: '🗡️', isEquipment: true });
    expect(rareGear.granted).toBe(FULL_GRID_RARITY_TOKENS.rare);
    expect(rareGear.notice).toBe('🏙️ City is full. 🗡️ became 4 tokens.');
    const rareMeta = loadMeta();
    expect(rareMeta.emojiConsumes?.['🗡️']).toBe(4);
    expect(availableTokens(4, placedOf(rareMeta.city!, '🗡️'))).toBe(4);
    expect(totalAvailableTokens(rareMeta.emojiConsumes ?? {}, rareMeta.city!) - beforeRare).toBe(4);

    const legendarySoul = recordRunEmojiConsume('🗡️', 1, { emoji: '🗡️', bagPassive: { ninjaCombo: true } });
    expect(legendarySoul.granted).toBe(FULL_GRID_RARITY_TOKENS.legendary);
    expect(loadMeta().emojiConsumes?.['🗡️']).toBe(4 + 5);

    const decor = emptyCity();
    for (let i = 0; i < decor.tiles.length; i++) {
      decor.tiles[i] = '🌲';
      decor.decor[i] = true;
    }
    saveCity(decor);
    const cosmetic = recordRunEmojiConsume('🌵');
    expect(cityGridIsFull(decor)).toBe(true);
    expect(cosmetic.granted).toBe(FULL_GRID_RARITY_TOKENS.common);
    expect(cosmetic.notice).toBe('🏙️ City is full. 🌵 became 1 token.');

    saveCity(full);
    const batch = recordRunEmojiConsume('🍀', 2, { emoji: '🍀', bagPassive: { bonusLoot: true } });
    expect(batch.granted).toBe(FULL_GRID_RARITY_TOKENS.legendary * 2);
    expect(batch.notice).toBe('🏙️ City is full. 🍀 ×2 became 10 tokens.');

    const castle = recordRunEmojiConsume('🏰', 1, { emoji: '🏰', itemId: 'structure:🏰' });
    expect(castle.granted).toBe(FULL_GRID_RARITY_TOKENS.legendary);
    const house = recordRunEmojiConsume('🏠', 1, { emoji: '🏠', itemId: 'structure:🏠' });
    expect(house.granted).toBe(FULL_GRID_RARITY_TOKENS.common);

    const blurb = emojiCityRulesBlurb();
    expect(blurb).toContain('Common 1, Uncommon 2, Rare 4, Legendary 5');
    expect(blurb).toContain('no drop rarity pays 1');
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

function paint(pairs: ReadonlyArray<readonly [string, number]>): ReturnType<typeof emptyCity> {
  const city = emptyCity();
  let index = 0;
  for (const [emoji, n] of pairs) {
    for (let i = 0; i < n; i++) city.tiles[index++] = emoji;
  }
  return city;
}

describe('EmojiCB districts', () => {
  it('classifies themed emoji and leaves food unclassified', () => {
    expect(DISTRICT_THRESHOLD).toBe(4);
    expect(DISTRICT_BONUS_TIER_CAP).toBe(4);
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

  it('raises the bonus tier when weight doubles and then caps it', () => {
    expect(districtTileWeight('🗡️')).toBe(1);
    expect(districtTileWeight('🛖')).toBe(2);
    expect(districtTileWeight('🏟️')).toBe(3);
    expect(districtTileWeight('🏰')).toBe(0);
    expect(districtTileWeight('🍎')).toBe(0);

    const tiers: Array<[number, number]> = [
      [0, 0], [3, 0], [4, 1], [7, 1], [8, 2], [15, 2], [16, 3], [31, 3], [32, 4], [64, 4], [100, 4],
    ];
    for (const [weight, tier] of tiers) {
      expect(districtBonusTier(weight), `weight ${weight}`).toBe(tier);
      expect(scaledBonusAmount(1, weight)).toBe(tier);
      expect(scaledBonusAmount(2, weight)).toBe(tier * 2);
    }
  });

  it('keeps every built district active and scales larger buildings', () => {
    expect(activeDistricts(fill(3, '🗡️'))).toEqual([]);
    expect(activeDistricts(fill(4, '🗡️')).map(row => row.name)).toEqual(['Slums of Thieves']);
    const tied = paint([['🗡️', 4], ['🧪', 4]]);
    expect(activeDistricts(tied).map(row => row.id)).toEqual(['thieves', 'arcane']);
    expect(activeDistricts(fill(6, '🍎'))).toEqual([]);
    expect(activeDistricts(fill(6, '🏰'))).toEqual([]);
    expect(districtPickerLine(NINJA, fill(6, '🍎'))).toBeNull();

    const huts = fill(4, '🛖');
    const slums = districtStandings(huts).find(row => row.id === 'thieves');
    expect(slums).toMatchObject({ count: 4, weight: 8, tier: 2, amount: 2, label: '+2 SPD' });
    expect(districtHudLine(slums!)).toBe('Slums of Thieves: 4 placed, weight 8, +2 SPD');
    expect(districtStandings(paint([['🛖', 2]])).find(row => row.id === 'thieves')).toMatchObject({
      count: 2, weight: 4, tier: 1, amount: 1,
    });
    expect(districtStandings(paint([['🏟️', 4]])).find(row => row.id === 'saloon')).toMatchObject({
      count: 4, weight: 12, tier: 2, amount: 2, label: '+2 ATK',
    });

    const ninjaLine = districtPickerLine(NINJA, fill(4, '🗡️'));
    expect(ninjaLine).toBe('Slums of Thieves: 4 placed, weight 4, +1 SPD at run start');
    const wizardView = districtPickerEntries(WIZARD, fill(4, '🗡️'));
    expect(wizardView.map(entry => entry.text)).toEqual([
      'Slums of Thieves: 4 placed, weight 4, +1 SPD for Ninja',
      'Arcane Sanctum: 0 placed, weight 0, +0 max MP at run start',
    ]);
  });

  it('grants each matching class its own scaled bonus at once', () => {
    const city = paint([
      ['🗡️', 4],
      ['🧪', 4],
      ['🔫', 4],
      ['🌳', 4],
      ['🌑', 4],
    ]);
    expect(activeDistricts(city).map(row => row.id)).toEqual(['thieves', 'arcane', 'saloon', 'grove', 'void']);
    const lines = districtPickerEntries(NINJA, city);
    expect(lines).toHaveLength(5);
    expect(lines.find(entry => entry.id === 'thieves')?.text).toContain('4 placed, weight 4, +1 SPD at run start');
    expect(lines.find(entry => entry.id === 'arcane')?.text).toContain('4 placed, weight 4, +2 max MP for Wizard');
    expect(lines.find(entry => entry.id === 'void')?.text).toContain('+2 max HP for The Void');

    const ninja = applyDistrictBonus(vessel(NINJA, { speed: 3, mana: 4, maxMana: 4 }), city);
    expect(ninja.player.stats.speed).toBe(4);
    expect(ninja.player.stats.maxMana).toBe(4);
    expect(ninja.log).toContain('+1 SPD');
    expect(ninja.log).toContain('4 placed, weight 4');
    const fencer = applyDistrictBonus(vessel(FENCER, { speed: 2 }), city);
    expect(fencer.player.stats.speed).toBe(3);

    const wizard = applyDistrictBonus(vessel(WIZARD, { speed: 1, mana: 4, maxMana: 4 }), city);
    expect(wizard.player.stats.speed).toBe(1);
    expect(wizard.player.stats.mana).toBe(6);
    expect(wizard.player.stats.maxMana).toBe(6);
    const genie = applyDistrictBonus(vessel(GENIE, { mana: 6, maxMana: 6 }), city);
    expect(genie.player.stats.maxMana).toBe(8);

    expect(applyDistrictBonus(vessel(COWBOY, { attack: 4 }), city).player.stats.attack).toBe(5);
    expect(applyDistrictBonus(vessel(HITMAN, { attack: 4 }), city).player.stats.attack).toBe(5);
    expect(applyDistrictBonus(vessel(RANGER, { evasion: 10 }), city).player.stats.evasion).toBe(11);
    expect(applyDistrictBonus(vessel(ROYAL_GUARD, { evasion: 10 }), city).player.stats.evasion).toBe(11);
    const voided = applyDistrictBonus(vessel(VOID, { hp: 6, maxHp: 6 }), city);
    expect(voided.player.stats.hp).toBe(8);
    expect(voided.player.stats.maxHp).toBe(8);

    const grown = paint([['🧪', 16], ['🗡️', 3], ['🌋', 1], ['🌑', 2]]);
    const sanctum = applyDistrictBonus(vessel(WIZARD, { mana: 4, maxMana: 4 }), grown);
    expect(sanctum.player.stats.maxMana).toBe(10);
    expect(sanctum.log).toContain('+6 max MP');
    expect(sanctum.log).toContain('weight 16');
    expect(applyDistrictBonus(vessel(NINJA, { speed: 3 }), grown).log).toBeUndefined();
    const hollow = districtStandings(grown).find(row => row.id === 'void');
    expect(hollow).toMatchObject({ count: 3, weight: 4, amount: 2, label: '+2 max HP' });
    expect(applyDistrictBonus(vessel(VOID, { hp: 6, maxHp: 6 }), grown).player.stats.maxHp).toBe(8);

    const capped = applyDistrictBonus(vessel(NINJA, { speed: 1 }), fill(40, '🗡️'));
    expect(capped.player.stats.speed).toBe(5);
    expect(capped.log).toContain('+4 SPD');
    expect(applyDistrictBonus(vessel(WIZARD), fill(6, '🍎')).log).toBeUndefined();
  });

  it('migrates a v1 meta save and scores every district on the old grid', () => {
    expect(META_SCHEMA_VERSION).toBe(4);
    const store = memoryStore();
    setMetaStore(store);
    const tiles = Array.from({ length: 10 }, (_, i) => (i < 4 ? '🗡️' : i < 8 ? '⛩️' : '🏰'));
    store.setItem(META_SAVE_KEY, JSON.stringify({
      schemaVersion: 1,
      unlockedPrestige: [GENIE, GENIE],
      insuredCarry: [{ id: 'a', emoji: '🍎', name: 'Apple' }],
      emojiConsumes: { '🗡️': 4, '⛩️': 4 },
      activeDistrict: 'thieves',
      pendingCityTurns: 3,
      cityGrowthRemainder: 2,
      city: {
        tiles,
        citizens: [
          { id: 'c-1', emoji: '🧟', x: 1, y: 1 },
          { id: 'bad', emoji: '🦇', x: 99, y: 0 },
        ],
        nextId: 4,
      },
    }));

    const meta = loadMeta();
    expect(meta.schemaVersion).toBe(4);
    expect(meta.city?.blockedTypes).toEqual([...DEFAULT_BLOCKED_TYPES]);
    expect(meta.city?.passOverride.every(flag => flag === null)).toBe(true);
    expect(meta.unlockedPrestige).toEqual([GENIE]);
    expect(meta.insuredCarry?.map(item => item.id)).toEqual(['a']);
    expect(meta.emojiConsumes).toEqual({ '🗡️': 4, '⛩️': 4 });
    expect(meta.pendingCityTurns).toBe(3);
    expect(meta.cityGrowthRemainder).toBe(2);
    expect(meta.city?.tiles.slice(0, 10)).toEqual(tiles);
    expect(meta.city?.tiles).toHaveLength(CITY_SIZE);
    expect(meta.city?.cols).toBe(CITY_COLS);
    expect(meta.city?.rows).toBe(CITY_ROWS);
    expect(meta.city?.citizens).toEqual([{ id: 'c-1', emoji: '🧟', x: 1, y: 1 }]);
    expect(meta.city?.nextId).toBe(4);

    const standings = districtStandings(meta.city!);
    expect(standings.find(row => row.id === 'thieves')).toMatchObject({ count: 4, weight: 4, amount: 1 });
    expect(standings.find(row => row.id === 'arcane')).toMatchObject({ count: 4, weight: 8, amount: 4, label: '+4 max MP' });
    expect(activeDistricts(meta.city!).map(row => row.id)).toEqual(['thieves', 'arcane']);
    const ninja = applyDistrictBonus(vessel(NINJA, { speed: 1 }), meta.city!);
    const wizard = applyDistrictBonus(vessel(WIZARD, { mana: 4, maxMana: 4 }), meta.city!);
    expect(ninja.player.stats.speed).toBe(2);
    expect(wizard.player.stats.maxMana).toBe(8);

    saveMeta(meta);
    const raw = JSON.parse(store.getItem(META_SAVE_KEY) ?? '{}') as Record<string, unknown>;
    expect(raw.schemaVersion).toBe(4);
    expect((raw.city as { cols: number; rows: number }).cols).toBe(CITY_COLS);
    expect((raw.city as { cols: number; rows: number }).rows).toBe(CITY_ROWS);
    expect(raw.activeDistrict).toBeUndefined();
    expect(raw.unlockedPrestige).toEqual([GENIE]);
    expect((raw.city as { tiles: string[] }).tiles.slice(0, 4)).toEqual(['🗡️', '🗡️', '🗡️', '🗡️']);

    store.setItem(META_SAVE_KEY, '{');
    expect(loadMeta().unlockedPrestige).toEqual([]);
    expect(loadMeta().schemaVersion).toBe(4);

    store.setItem(META_SAVE_KEY, JSON.stringify({
      schemaVersion: 99,
      unlockedPrestige: [FENCER],
      city: { tiles: ['🌑', '🌑', '🌑', '🌑'], citizens: [], nextId: 1 },
      pendingCityTurns: 1,
    }));
    const future = loadMeta();
    expect(future.unlockedPrestige).toEqual([FENCER]);
    expect(future.pendingCityTurns).toBe(1);
    expect(activeDistricts(future.city!).map(row => row.id)).toEqual(['void']);

    const blurb = emojiCityRulesBlurb();
    expect(blurb).toContain('every style can be active at once');
    expect(blurb).toContain('larger building counts for more');
    expect(blurb).toContain('placed count, weight, and current bonus');
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

describe('EmojiCB expansion', () => {
  it('shifts existing lots and citizens when growing north or west', () => {
    expect(CITY_EXPAND_COST).toBe(10);
    const city = emptyCity();
    city.tiles[0] = '🗡️';
    city.tiles[1] = '🧪';
    city.tiles[8] = '🌳';
    city.citizens = [{ id: 'c-1', emoji: '🧟', x: 1, y: 0 }];
    const consumes = { '🍎': 40, '🗡️': 1, '🧪': 1, '🌳': 1 };

    const north = expandCity(city, 'north', consumes);
    expect(north.ok).toBe(true);
    expect(consumes['🍎']).toBe(40);
    expect(city.tiles[0]).toBe('🗡️');
    expect(city.rows).toBe(CITY_ROWS);
    expect(north.city.cols).toBe(CITY_COLS);
    expect(north.city.rows).toBe(CITY_ROWS + 1);
    expect(north.city.tiles).toHaveLength(CITY_COLS * (CITY_ROWS + 1));
    expect(north.city.tiles[0]).toBeNull();
    expect(north.city.tiles[8]).toBe('🗡️');
    expect(north.city.tiles[9]).toBe('🧪');
    expect(north.city.tiles[16]).toBe('🌳');
    expect(north.city.citizens[0]).toMatchObject({ x: 1, y: 1 });
    expect(north.consumes['🍎']).toBe(30);
    expect(north.consumes['🗡️']).toBe(1);

    const west = expandCity(north.city, 'west', north.consumes);
    expect(west.ok).toBe(true);
    expect(west.city.cols).toBe(CITY_COLS + 1);
    expect(west.city.rows).toBe(CITY_ROWS + 1);
    expect(west.city.tiles[0]).toBeNull();
    expect(west.city.tiles[1 * (CITY_COLS + 1) + 1]).toBe('🗡️');
    expect(west.city.tiles[1 * (CITY_COLS + 1) + 2]).toBe('🧪');
    expect(west.city.tiles[2 * (CITY_COLS + 1) + 1]).toBe('🌳');
    expect(west.city.citizens[0]).toMatchObject({ x: 2, y: 1 });
    expect(west.consumes['🍎']).toBe(20);
  });

  it('grows south and east without moving lots, and refuses a short purse', () => {
    const city = emptyCity();
    city.tiles[0] = '🗡️';
    city.tiles[8] = '🌳';
    city.tiles[63] = '🏰';
    city.citizens = [{ id: 'c-1', emoji: '🧟', x: 7, y: 0 }];
    const south = expandCity(city, 'south', { '🔥': 9, '🍎': 3 });
    expect(south.ok).toBe(true);
    expect(south.consumes).toEqual({ '🍎': 2 });
    expect(south.city.tiles[0]).toBe('🗡️');
    expect(south.city.tiles[63]).toBe('🏰');
    expect(south.city.tiles[64]).toBeNull();
    expect(south.city.rows).toBe(CITY_ROWS + 1);
    expect(south.city.citizens[0]).toMatchObject({ x: 7, y: 0 });

    const east = expandCity(south.city, 'east', { '🏠': 10 });
    expect(east.ok).toBe(true);
    expect(east.consumes['🏠']).toBeUndefined();
    expect(east.city.cols).toBe(CITY_COLS + 1);
    expect(east.city.tiles[0]).toBe('🗡️');
    expect(east.city.tiles[9]).toBe('🌳');
    expect(east.city.citizens[0]).toMatchObject({ x: 7, y: 0 });
    const stepped = tickCitizens(east.city, () => 0);
    expect(stepped.citizens[0]).toMatchObject({ x: 8, y: 0 });

    const broke = expandCity(emptyCity(), 'west', { '🍎': 9 });
    expect(broke.ok).toBe(false);
    expect(broke.reason).toBe('Need 10 tokens');
    expect(broke.city.cols).toBe(CITY_COLS);
    expect(broke.consumes).toEqual({ '🍎': 9 });
    expect(expandBlockReason(emptyCity(), 'north', 9)).toBe('Need 10 tokens');
    expect(expandBlockReason(emptyCity(), 'north', 10)).toBeNull();

    const capped = emptyCity();
    capped.rows = CITY_DIM_MAX;
    capped.tiles = Array.from({ length: capped.cols * capped.rows }, () => null);
    const blocked = expandCity(capped, 'south', { '🍎': 10 });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('This edge cannot grow further.');
    expect(blocked.consumes).toEqual({ '🍎': 10 });
  });

  it('keeps an older 8×8 grid and reloads a grown one', () => {
    const store = memoryStore();
    setMetaStore(store);
    const tiles = Array.from({ length: CITY_SIZE }, () => null as string | null);
    tiles[9] = '🗼';
    store.setItem(META_SAVE_KEY, JSON.stringify({
      schemaVersion: 2,
      unlockedPrestige: [],
      emojiConsumes: { '🗼': 1, '🍎': 10 },
      city: { tiles, citizens: [{ id: 'c-1', emoji: '🧟', x: 1, y: 1 }], nextId: 2 },
    }));
    const loaded = loadMeta();
    expect(loaded.schemaVersion).toBe(4);
    expect(loaded.city?.blockedTypes).toEqual([...DEFAULT_BLOCKED_TYPES]);
    expect(loaded.city?.cols).toBe(8);
    expect(loaded.city?.rows).toBe(8);
    expect(loaded.city?.tiles[9]).toBe('🗼');
    expect(loaded.city?.citizens[0]).toMatchObject({ x: 1, y: 1 });

    const grown = expandCity(loaded.city ?? emptyCity(), 'west', loaded.emojiConsumes ?? {});
    expect(grown.ok).toBe(true);
    expect(grown.city.tiles[11]).toBe('🗼');
    expect(grown.city.citizens[0]).toMatchObject({ x: 2, y: 1 });
    replaceEmojiConsumes(grown.consumes);
    saveCity(grown.city);
    const again = loadMeta();
    expect(again.city?.cols).toBe(9);
    expect(again.city?.rows).toBe(8);
    expect(again.city?.tiles).toHaveLength(72);
    expect(again.city?.tiles[11]).toBe('🗼');
    expect(again.emojiConsumes?.['🍎']).toBeUndefined();
    expect(again.emojiConsumes?.['🗼']).toBe(1);
    const raw = JSON.parse(store.getItem(META_SAVE_KEY) ?? '{}') as { schemaVersion: number; city: { cols: number; rows: number } };
    expect(raw.schemaVersion).toBe(4);
    expect(raw.city.cols).toBe(9);
    expect(raw.city.rows).toBe(8);

    const huge = normalizeCity({ cols: 10000, rows: 4, tiles: ['🗡️'], citizens: [], nextId: 1 });
    expect(huge.cols).toBe(CITY_DIM_MAX);
    expect(huge.rows).toBe(CITY_ROWS);
    expect(huge.tiles).toHaveLength(CITY_DIM_MAX * CITY_ROWS);
    expect(huge.tiles[0]).toBe('🗡️');
    expect(emojiCityRulesBlurb()).toContain(`${CITY_EXPAND_COST} unspent placement tokens`);
  });
});

describe('EmojiCB decor', () => {
  const required = [
    '🛣️', '🌲', '🌳', '🌴', '🌵',
    '🚗', '🚓', '🚕', '🛺',
    '🟢', '🟠', '🟥', '🟧', '◽', '◾', '🔷', '🔶', '🔳', '🔲',
    '🌷', '🌻', '🪨', '🟦', '🟩', '🟨', '⬜', '⬛', '⛲',
  ];

  it('lists free decor and leaves gameplay emoji out', () => {
    expect(new Set(DECOR).size).toBe(DECOR.length);
    for (const emoji of required) expect(isDecorEmoji(emoji), emoji).toBe(true);
    expect(isDecorEmoji('🗡️')).toBe(false);
    expect(isDecorEmoji('🍎')).toBe(false);
    expect(classifyEmoji('🌲')?.id).toBe('grove');
    expect(classifyEmoji('🌵')?.id).toBe('saloon');
  });

  it('places and removes decor without tokens, districts, or housing', () => {
    const consumes = { '🍎': 3, '🌲': 1 };
    const road = placeDecor(emptyCity(), 0, '🛣️');
    expect(road.ok).toBe(true);
    expect(consumes).toEqual({ '🍎': 3, '🌲': 1 });
    expect(isDecorLot(road.city, 0)).toBe(true);
    expect(placedOf(road.city, '🛣️')).toBe(0);
    expect(totalAvailableTokens(consumes, road.city)).toBe(4);
    expect(supplyPalette(consumes, road.city)).toEqual(['🍎', '🌲']);

    let cosmetic = road.city;
    for (let i = 1; i <= 4; i++) cosmetic = placeDecor(cosmetic, i, '🌲').city;
    expect(placeDecor(cosmetic, 0, '🌴').ok).toBe(false);
    expect(placeDecor(cosmetic, 5, '🗡️').ok).toBe(false);
    expect(districtStandings(cosmetic).find(row => row.id === 'grove')).toMatchObject({ count: 0, weight: 0, amount: 0 });
    expect(citizenCapacityOf(cosmetic)).toBe(0);
    expect(syncCitizens(cosmetic, { '🧟': 4 }, () => 0).citizens).toHaveLength(0);
    expect(applyDistrictBonus(vessel(RANGER, { evasion: 10 }), cosmetic).log).toBeUndefined();

    const tokenTree = placeAt(cosmetic, 5, '🌲', consumes, {}, () => 0);
    expect(tokenTree.ok).toBe(true);
    expect(placedOf(tokenTree.city, '🌲')).toBe(1);
    expect(isDecorLot(tokenTree.city, 5)).toBe(false);
    expect(districtStandings(tokenTree.city).find(row => row.id === 'grove')).toMatchObject({ count: 1, weight: 1, amount: 0 });

    const fountain = placeDecor(emptyCity(), 1, '⛲');
    expect(citizenCapacityOf(fountain.city)).toBe(0);
    expect(districtStandings(fountain.city).find(row => row.id === 'saloon')).toMatchObject({ count: 0, weight: 0 });
    const realFountain = placeAt(emptyCity(), 1, '⛲', { '⛲': 1 }, {}, () => 0);
    expect(districtStandings(realFountain.city).find(row => row.id === 'saloon')?.weight).toBe(2);

    const cleared = removeAt(road.city, 0, {}, () => 0);
    expect(cleared.city.tiles[0]).toBeNull();
    expect(cleared.city.decor[0]).toBe(false);
    expect(totalAvailableTokens(consumes, cleared.city)).toBe(4);
  });

  it('shifts decor with the grid and keeps old trees as real placements', () => {
    const road = placeDecor(emptyCity(), 0, '🚗');
    const grown = expandCity(road.city, 'north', { '🍎': 10 });
    expect(grown.ok).toBe(true);
    expect(isDecorLot(grown.city, 0)).toBe(false);
    expect(isDecorLot(grown.city, CITY_COLS)).toBe(true);
    expect(grown.city.tiles[CITY_COLS]).toBe(road.city.tiles[0]);

    const tiles = Array.from({ length: CITY_SIZE }, () => null as string | null);
    for (let i = 0; i < 4; i++) tiles[i] = '🌲';
    const legacy = normalizeCity({ tiles, citizens: [], nextId: 1 });
    expect(legacy.decor.every(flag => flag === false)).toBe(true);
    expect(districtStandings(legacy).find(row => row.id === 'grove')).toMatchObject({ count: 4, weight: 4, amount: 1 });
    expect(applyDistrictBonus(vessel(RANGER, { evasion: 10 }), legacy).player.stats.evasion).toBe(11);

    saveCity(grown.city);
    const loaded = loadMeta().city;
    expect(loaded && isDecorLot(loaded, CITY_COLS)).toBe(true);
    expect(emojiCityRulesBlurb()).toContain('Decor does not spend a token');
  });
});

describe('EmojiCB palette sections', () => {
  it('groups districts, neutral buildings, and decor, and keeps locked emoji listed', () => {
    const sections = buildPaletteSections({ '🗡️': 2, '🍎': 1, '🏰': 1 }, emptyCity());
    expect(sections.map(section => section.label)).toEqual([
      'Slums of Thieves',
      'Arcane Sanctum',
      'Grove of Wilds',
      'Frontier Saloon',
      'Void Hollow',
      'Neutral',
      'Roads',
      'Foliage',
      'Vehicles',
      'Shapes',
      'Misc',
    ]);
    expect(sections.map(section => section.badge)).toEqual([
      NINJA, WIZARD, RANGER, COWBOY, VOID,
      null,
      '🛣️', '🌲', '🚗', '🟢', '🪨',
    ]);

    const thieves = sections[0]!;
    expect(thieves.entries.find(entry => entry.emoji === '🗡️')).toMatchObject({ locked: false, tokens: 2, kind: 'token' });
    const knife = thieves.entries.find(entry => entry.emoji === '🔪')!;
    expect(knife.locked).toBe(true);
    expect(knife.tokens).toBe(0);
    expect(knife.hint).toMatch(/locked/i);
    expect(knife.hint).toMatch(/descent/i);
    const sized = thieves.entries.filter(entry => entry.housing === 2).map(entry => entry.name);
    expect(sized).toEqual(['Bridge', 'Hut', 'Ruin', 'Site']);
    expect(thieves.entries.findIndex(entry => entry.emoji === '🛖')).toBeLessThan(
      thieves.entries.findIndex(entry => entry.emoji === '🗡️'),
    );

    const neutral = sections.find(section => section.id === 'neutral')!;
    expect(neutral.entries.map(entry => entry.emoji)).toEqual(['🏰', '🏭', '🏘️', '🏢', '🗺️', '🍎', '🏡', '🏠']);
    expect(neutral.entries.find(entry => entry.emoji === '🏠')!.hint).toMatch(/Survey/);
    expect(neutral.entries.find(entry => entry.emoji === '🍎')).toMatchObject({ name: 'Apple', locked: false, housing: 1 });
    expect(sections.filter(section => section.id !== 'neutral').every(section => section.entries.every(entry => entry.emoji !== '🍎'))).toBe(true);

    for (const section of sections) {
      for (let i = 1; i < section.entries.length; i++) {
        const prev = section.entries[i - 1]!;
        const curr = section.entries[i]!;
        const order = prev.housing !== curr.housing
          ? prev.housing - curr.housing
          : (curr.name.localeCompare(prev.name, 'en') || curr.emoji.localeCompare(prev.emoji, 'en'));
        expect(order).toBeGreaterThanOrEqual(0);
      }
    }

    const tokens = sections.flatMap(section => section.entries.filter(entry => entry.kind === 'token'));
    for (const style of DISTRICTS) {
      for (const emoji of style.emoji) expect(tokens.filter(entry => entry.emoji === emoji)).toHaveLength(1);
    }
    for (const building of BUILDINGS) expect(tokens.filter(entry => entry.emoji === building.emoji)).toHaveLength(1);

    const roads = sections.find(section => section.id === 'roads')!;
    expect(roads.badge).toBe('🛣️');
    expect(roads.entries.every(entry => entry.kind === 'decor' && !entry.locked && entry.housing === 0)).toBe(true);
    expect(roads.entries.map(entry => entry.emoji)).toEqual(expect.arrayContaining([...TRAIN_EMOJI]));
    expect(roads.entries.map(entry => entry.name)).toEqual([
      'Bullet Train', 'Express', 'Locomotive', 'Railcar', 'Road', 'Station', 'Track', 'Train',
    ]);

    const foliage = sections.find(section => section.id === 'foliage')!;
    expect(foliage.entries.every(entry => entry.kind === 'decor' && !entry.locked && entry.housing === 0)).toBe(true);
    expect(foliage.entries.map(entry => entry.name)).toEqual(['Cactus', 'Palm', 'Pine', 'Sunflower', 'Tree', 'Tulip']);
    expect(sections.find(section => section.id === 'saloon')!.entries.some(entry => entry.emoji === '⛲' && entry.kind === 'token')).toBe(true);
    expect(sections.find(section => section.id === 'misc')!.entries.some(entry => entry.emoji === '⛲' && entry.kind === 'decor')).toBe(true);
    const decor = sections.flatMap(section => section.entries.filter(entry => entry.kind === 'decor').map(entry => entry.emoji));
    expect(new Set(decor)).toEqual(new Set(DECOR));

    const cosmetic = placeDecor(emptyCity(), 0, '🌲').city;
    const stillLocked = buildPaletteSections({}, cosmetic);
    expect(stillLocked.find(section => section.id === 'grove')!.entries.find(entry => entry.emoji === '🌲')!.locked).toBe(true);
    expect(stillLocked.find(section => section.id === 'neutral')!.entries.some(entry => entry.emoji === '🌲')).toBe(false);
    const earned = buildPaletteSections({ '🌲': 1 }, emptyCity());
    expect(earned.find(section => section.id === 'grove')!.entries.find(entry => entry.emoji === '🌲')).toMatchObject({ locked: false, tokens: 1, kind: 'token' });
    expect(emojiCityRulesBlurb()).toContain('Locked emoji stay listed');

    const rows = paletteMenuRows(sections);
    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 4).map(row => row.map(section => section.id))).toEqual([
      ['thieves'],
      ['arcane'],
      ['grove'],
      ['saloon'],
    ]);
    expect(rows[4]!.map(section => section.id)).toEqual([
      'void', 'neutral', 'roads', 'foliage', 'vehicles', 'shapes', 'misc',
    ]);
    expect(rows[4]![0]!.badge).toBe(VOID);
    expect(rows[4]![0]!.label).toBe('Void Hollow');
    expect(emojiCityRulesBlurb()).toContain('Void Hollow leads the fifth row');
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
    expect(home).toContain('districtPickerEntries');
    expect(city).toContain('districtStandings');
    expect(city).toContain('city-district-');
    expect(manual).toContain('emojiCityRulesBlurb');
    expect(app).toContain('path="/city"');
    expect(city).toContain('catchUpCity');
    expect(city).toContain('city-away');
    expect(city).toContain('data-testid="city-decor"');
    expect(city).toContain('buildPaletteSections');
    expect(city).toContain('palette-more-');
    expect(city).toContain('…');
    expect(city).toContain('text-purple-400');
    expect(city).toContain('data-testid="palette-flyout"');
    expect(city).toContain('palette-flyout-grid');
    expect(city).toContain('repeat(auto-fill, minmax(2.75rem, 1fr))');
    expect(city).not.toContain('palette-toggle-');
    expect(city).not.toContain('(more)');
    expect(city).not.toContain('absolute inset-x-0 top-full');
    expect(city).toContain('data-testid="raise-structure"');
    expect(city).toContain('hoveredRow ?? openId ?? tappedRow');
    expect(city).toContain('raisePlace');
    expect(city).toContain('raiseFlyoutFrame');
    expect(city).not.toContain('pr-[6.75rem]');
    expect(city).not.toContain('absolute right-8 top-1/2');
    expect(city).toContain('palette-more-${openSection.id}');
    expect(city).toContain('FLYOUT_CLOSE_MS');
    expect(city).not.toContain('sticky top-3');
    expect(city).toContain('palette-section-${openSection.id}');
    expect(city).toContain('aria-expanded');
    expect(city).toContain('PALETTE_MENU_ROWS = 5');
    expect(city).toContain('data-testid="palette-menu"');
    expect(city).toContain('overflow-x-hidden');
    expect(city).toContain("pointerType === 'mouse'");
    expect(city).toContain('applyPlacement');
    expect(city).toContain('applyPaste');
    expect(city).toContain('brushFromLot');
    expect(city).toContain('CITY_TILE_MIN');
    expect(city).toContain('CITY_TILE_MAX');
    expect(city).toContain('minmax(${CITY_TILE_MIN}, ${CITY_TILE_MAX})');
    expect(city).toContain('data-testid="city-name"');
    expect(city).toContain('data-testid="city-visitor"');
    expect(city).toContain('data-testid="city-train-status"');
    expect(city).toContain('data-testid="city-train-hint"');
    expect(city).toContain('data-testid="visit-cities"');
    expect(city).toContain('loadShareStatus');
    expect(city).toContain('href="/ledger"');
    expect(city).toContain('data-testid="share-city"');
    expect(city).toContain('Share');
    expect(city).toContain('ensureCityProfile');
    expect(city).toContain('trainLineSpansCity');
    expect(city).not.toContain('fetch(');
    expect(city).toContain('data-testid="city-grid-scroll"');
    expect(city).toContain('data-testid="city-workbench"');
    expect(city).toContain('data-testid="city-structures"');
    expect(city).toContain('lg:grid-rows-[auto_auto_auto]');
    expect(city).toContain('lg:row-span-full');
    expect(city).toContain('lg:sticky lg:top-3 lg:max-h-[calc(100dvh-1.5rem)]');
    expect(city).toContain('onContextMenu={onGridContextMenu}');
    expect(city).toContain('button === 2');
    expect(city).toContain('ERASE_LONG_PRESS_MS');
    expect(city).toContain("drag.tool === 'erase'");
    expect(city).toContain('paint-ants');
    expect(city).toContain('button === 1');
    const tools = readFileSync(new URL('../pages/cityTools.tsx', import.meta.url), 'utf8');
    expect(tools).toContain('data-testid={`city-tool-${entry.id}`}');
    for (const id of ['place', 'select', 'copy', 'cut', 'paste', 'delete', 'eyedropper', 'pass', 'undo']) {
      expect(tools).toContain(`id: '${id}'`);
    }
    expect(tools).toContain('paint-btn');
    expect(city).toContain('w-fit min-w-min max-w-full');
    expect(city).toContain('edge="north"');
    expect(city).toContain('expand-${edge}');
    expect(city).toContain('expandBlockReason');
    expect(city).toContain('title={hint}');
    expect(game).toContain('noteCityTurns');
    expect(game).toContain('applyDistrictBonus');
    const items = readFileSync(new URL('../hooks/actions/useItemActions.ts', import.meta.url), 'utf8');
    const burden = readFileSync(new URL('../game/voidCharge.ts', import.meta.url), 'utf8');
    expect(items).toContain('recordRunEmojiConsume');
    expect(items).toContain('noteFullCity');
    expect(items).not.toContain('recordEmojiConsume(');
    expect(burden).toContain('recordRunEmojiConsume');
    expect(burden).toContain('cityGrant.notice');
    expect(burden).not.toContain('recordEmojiConsume(');
  });
});

describe('EmojiCB passability', () => {
  it('blocks orange and blue by default, lets a square override the type, and keeps citizens out', () => {
    const fresh = emptyCity();
    fresh.tiles[1] = '🟧';
    fresh.tiles[2] = '🟦';
    fresh.tiles[3] = '🟩';
    expect(lotUnpassable(fresh, 1)).toBe(true);
    expect(lotUnpassable(fresh, 2)).toBe(true);
    expect(lotUnpassable(fresh, 3)).toBe(false);
    expect(fresh.blockedTypes).toEqual([...DEFAULT_BLOCKED_TYPES]);

    const legacy = normalizeCity({ tiles: ['🟧', '🏠'], citizens: [], nextId: 1 });
    expect(legacy.blockedTypes).toEqual([...DEFAULT_BLOCKED_TYPES]);
    expect(legacy.passOverride.every(flag => flag === null)).toBe(true);
    expect(lotUnpassable(legacy, 0)).toBe(true);
    expect(lotUnpassable(legacy, 1)).toBe(false);
    const clearedTypes = normalizeCity({ ...legacy, blockedTypes: [] });
    expect(lotUnpassable(clearedTypes, 0)).toBe(false);

    const opened = toggleBlockedType(fresh, '🟧');
    expect(lotUnpassable(opened, 1)).toBe(false);
    expect(lotUnpassable(opened, 2)).toBe(true);
    const houseBlocked = toggleBlockedType(opened, '🟩');
    expect(lotUnpassable(houseBlocked, 3)).toBe(true);

    const square = setSquarePass(fresh, [1, 3], false);
    expect(lotUnpassable(square, 1)).toBe(false);
    expect(lotUnpassable(setSquarePass(square, [3], true), 3)).toBe(true);
    expect(lotUnpassable(setSquarePass(square, [1], null), 1)).toBe(true);

    fresh.citizens = [{ id: 'a', emoji: '🧟', x: 0, y: 0 }];
    expect(tickCitizens(fresh, () => 0).citizens[0]).toMatchObject({ x: 0, y: 0 });
    const openedWalk = toggleBlockedType(fresh, '🟧');
    expect(tickCitizens(openedWalk, () => 0).citizens[0]).toMatchObject({ x: 1, y: 0 });
    const blockedHouse = setSquarePass(openedWalk, [1], true);
    blockedHouse.tiles[1] = '🟩';
    expect(tickCitizens(blockedHouse, () => 0).citizens[0]).toMatchObject({ x: 0, y: 0 });

    const grown = expandCity(setSquarePass(fresh, [0], true), 'north', { '🍎': 10 });
    expect(grown.ok).toBe(true);
    expect(grown.city.passOverride[grown.city.cols]).toBe(true);
    expect(grown.city.passOverride[0]).toBeNull();
  });
});

describe('EmojiCB select marquee', () => {
  it('clears the marquee when the selection is finished and keeps the clipboard for paste', () => {
    const city = readFileSync(new URL('../pages/city.tsx', import.meta.url), 'utf8');
    const copy = city.slice(city.indexOf('const doCopy'), city.indexOf('const doCut'));
    const cut = city.slice(city.indexOf('const doCut'), city.indexOf('const doPaste'));
    expect(copy).toContain('setClipboard(stamp)');
    expect(copy).toContain('setSelection(null)');
    expect(copy.indexOf('setClipboard(stamp)')).toBeLessThan(copy.indexOf('setSelection(null)'));
    expect(cut).toContain("setNote('Nothing to cut.')");
    expect(cut.indexOf("setNote('Nothing to cut.')")).toBeLessThan(cut.indexOf('setSelection(null)'));
    expect(cut).toContain('setClipboard(stamp)');
    expect(city).not.toContain('setClipboard(null)');

    const choose = city.slice(city.indexOf('const chooseTool'), city.indexOf('const finishClear'));
    expect(choose).toContain("if (next !== tool && next !== 'select' && next !== 'pass') setSelection(null)");

    const keys = city.slice(city.indexOf("e.key === 'Escape'"), city.indexOf('window.addEventListener(\'keydown\''));
    expect(keys).toContain('setSelection(null)');
    expect(keys.indexOf('setSelection(null)')).toBeLessThan(keys.indexOf("setLocation('/')"));

    expect(city).toContain("document.addEventListener('pointerdown'");
    expect(city).toContain('city-tool-copy');
    expect(city).toContain('city-tool-cut');
    expect(city).toContain('city-tool-delete');
    const outside = city.slice(city.indexOf('const onPointerDown'), city.indexOf("document.addEventListener('pointerdown'"));
    expect(outside).toContain('setSelection(null)');
    expect(outside).toContain('selection.x0');
  });
});

describe('EmojiCB city name and visitor', () => {
  it('accepts a short name, rejects symbols, and persists it with the visitor name', () => {
    expect(normalizeCityName('   ')).toEqual({ ok: true, name: CITY_NAME_DEFAULT });
    expect(normalizeCityName('  North   Yard  ')).toEqual({ ok: true, name: 'North Yard' });
    expect(normalizeCityName("O'Hare!")).toEqual({ ok: true, name: "O'Hare!" });
    expect(normalizeCityName('A'.repeat(CITY_NAME_MAX)).ok).toBe(true);
    expect(normalizeCityName('A'.repeat(CITY_NAME_MAX + 1))).toEqual({
      ok: false,
      reason: `Keep the name to ${CITY_NAME_MAX} characters.`,
    });
    expect(normalizeCityName('City 🏙️').ok).toBe(false);
    expect(normalizeCityName('Line\nBreak').ok).toBe(false);
    expect(normalizeCityName('---').ok).toBe(false);

    const profile = ensureCityProfile(() => 0);
    expect(profile).toEqual({ cityName: CITY_NAME_DEFAULT, anonymousName: 'BraveOtter1000' });
    expect(isAnonymousName(profile.anonymousName)).toBe(true);
    expect(ensureCityProfile(() => { throw new Error('visitor name must stay'); })).toEqual(profile);

    const saved = saveCityName('  Dockside  ');
    expect(saved).toEqual({ ok: true, name: 'Dockside' });
    expect(saveCityName('City 🚆')).toMatchObject({ ok: false });
    saveCity(emptyCity());
    settleCityCatchUp(emptyCity(), 2);
    expect(loadMeta().cityName).toBe('Dockside');
    expect(loadMeta().anonymousName).toBe('BraveOtter1000');
    expect(loadMeta().schemaVersion).toBe(4);

    saveMeta({ ...loadMeta(), anonymousName: 'not-a-name', cityName: '🏙️' });
    const replaced = ensureCityProfile(() => 0.5);
    expect(replaced.cityName).toBe(CITY_NAME_DEFAULT);
    expect(replaced.anonymousName).not.toBe('not-a-name');
    expect(isAnonymousName(replaced.anonymousName)).toBe(true);
    expect(ensureCityProfile(() => 0)).toEqual(replaced);

    expect(generateAnonymousName(() => 0)).toBe('BraveOtter1000');
    expect(emojiCityRulesBlurb()).toContain('defaulting to Emoji City');
    expect(emojiCityRulesBlurb()).toContain('Visit Cities and Share stay offline until a database is configured');
    expect(emojiCityRulesBlurb()).toContain('Visit Cities opens the ledger');
    expect(emojiCityRulesBlurb()).toContain('The Raise button sits on the right of the section under the pointer, or the section that was last tapped.');
    expect(emojiCityRulesBlurb()).toContain('Tools sit on the left of the map');
    expect(emojiCityRulesBlurb()).toContain('flush against the right side of that …');
  });
});

describe('EmojiCB train line', () => {
  function paint(city: ReturnType<typeof emptyCity>, edits: (tiles: (string | null)[], cols: number) => void) {
    const tiles = [...city.tiles];
    edits(tiles, city.cols);
    return normalizeCity({ ...city, tiles, decor: city.decor });
  }

  function fillRow(city: ReturnType<typeof emptyCity>, y: number, glyphAt: (x: number) => string) {
    return paint(city, (tiles, cols) => {
      for (let x = 0; x < cols; x++) tiles[y * cols + x] = glyphAt(x);
    });
  }

  function fillColumn(city: ReturnType<typeof emptyCity>, x: number, glyphAt: (y: number) => string) {
    return paint(city, (tiles, cols) => {
      for (let y = 0; y < city.rows; y++) tiles[y * cols + x] = glyphAt(y);
    });
  }

  const mixed = (index: number) => TRAIN_EMOJI[index % TRAIN_EMOJI.length]!;

  it('accepts a mixed edge-to-edge row or column and rejects gaps', () => {
    expect(trainLineSpansCity(emptyCity())).toBe(false);
    expect(TRAIN_EMOJI.every(isTrainEmoji)).toBe(true);
    expect(isTrainEmoji('🛤️'.replace(/\uFE0F/g, ''))).toBe(true);
    expect(isTrainEmoji('🛣️')).toBe(false);

    const row = fillRow(emptyCity(), 3, mixed);
    expect(spanningTrainLine(row)).toEqual({ axis: 'row', index: 3 });
    expect(trainLineStatusLabel(true)).toMatch(/unlocked/i);
    expect(TRAIN_LINE_HINT).toMatch(/full row or one full column/i);

    const gapped = fillRow(emptyCity(), 3, x => (x === 4 ? '🛣️' : mixed(x)));
    expect(trainLineSpansCity(gapped)).toBe(false);
    const short = fillRow(emptyCity(), 1, x => (x === CITY_COLS - 1 ? '🏠' : '🚆'));
    expect(trainLineSpansCity(short)).toBe(false);

    const column = fillColumn(emptyCity(), 0, mixed);
    expect(spanningTrainLine(column)).toEqual({ axis: 'column', index: 0 });
    const columnGap = fillColumn(emptyCity(), 2, y => (y === 5 ? null as unknown as string : '🚉'));
    expect(trainLineSpansCity(columnGap)).toBe(false);

    const placed = TRAIN_EMOJI.reduce((next, emoji, index) => placeDecor(next, index, emoji).city, emptyCity());
    expect(placed.tiles.slice(0, TRAIN_EMOJI.length)).toEqual([...TRAIN_EMOJI]);
    expect(placed.decor.slice(0, TRAIN_EMOJI.length).every(Boolean)).toBe(true);
    expect(trainLineSpansCity(placed)).toBe(false);
  });

  it('drops a spanning line when that side grows, and keeps it when the other side grows', () => {
    const row = fillRow(emptyCity(), 0, mixed);
    const east = expandCity(row, 'east', { '🍎': 10 });
    expect(east.ok).toBe(true);
    expect(east.city.cols).toBe(CITY_COLS + 1);
    expect(trainLineSpansCity(east.city)).toBe(false);
    const extendedEast = paint(east.city, (tiles, cols) => { tiles[cols - 1] = '🚉'; });
    expect(spanningTrainLine(extendedEast)).toEqual({ axis: 'row', index: 0 });

    const west = expandCity(row, 'west', { '🍎': 10 });
    expect(west.ok).toBe(true);
    expect(trainLineSpansCity(west.city)).toBe(false);
    const extendedWest = paint(west.city, tiles => { tiles[0] = '🚂'; });
    expect(trainLineSpansCity(extendedWest)).toBe(true);

    const southFromRow = expandCity(row, 'south', { '🍎': 10 });
    expect(southFromRow.ok).toBe(true);
    expect(trainLineSpansCity(southFromRow.city)).toBe(true);

    const column = fillColumn(emptyCity(), CITY_COLS - 1, mixed);
    const south = expandCity(column, 'south', { '🍎': 10 });
    expect(south.ok).toBe(true);
    expect(trainLineSpansCity(south.city)).toBe(false);
    const extendedSouth = paint(south.city, (tiles, cols) => {
      tiles[(south.city.rows - 1) * cols + (CITY_COLS - 1)] = '🚅';
    });
    expect(spanningTrainLine(extendedSouth)).toEqual({ axis: 'column', index: CITY_COLS - 1 });

    const north = expandCity(column, 'north', { '🍎': 10 });
    expect(north.ok).toBe(true);
    expect(trainLineSpansCity(north.city)).toBe(false);

    const eastFromColumn = expandCity(column, 'east', { '🍎': 10 });
    expect(eastFromColumn.ok).toBe(true);
    expect(spanningTrainLine(eastFromColumn.city)).toEqual({ axis: 'column', index: CITY_COLS - 1 });
  });
});
