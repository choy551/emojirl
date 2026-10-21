import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BUILDING_EXCHANGE_COST,
  BUILDING_RARITY_WEIGHT,
  BUILDINGS,
  STRUCTURE_FLOOR_CHANCE,
  STRUCTURE_SELL_VALUE,
  STRUCTURE_SURVEY_MOOD,
  buildingOf,
  rollStructureBuilding,
  structureItem,
  structureSurvey,
} from './cityBuildings';
import { DROP_TABLE, rarityOfItem } from './dropTable';
import { getItemSellValue } from './economy';
import {
  activeDistricts,
  applyDistrictBonus,
  citizenCapacityOf,
  classifyEmoji,
  districtStandings,
  emptyCity,
  exchangeForBuilding,
  lotHousing,
  supplyPalette,
  syncCitizens,
} from './emojiCity';
import { replaceEmojiConsumes, saveCity, setMetaStore, loadMeta, type KeyValueStore } from './meta';
import { rollStructureFind } from './spawning';
import type { MapGrid, Tile } from './types';
import type { Room } from './mapgen';
import { WIZARD } from './prestigeConstants';

const REQUIRED = [
  '🛖', '🏔️', '🗻', '⛩️', '🏢', '🏤', '🏭', '🏰', '🌉', '⛺',
  '🏠', '🏡', '🏘️', '🏚️', '🏣', '🏥', '🏦', '🏨', '🏪', '🏫', '🏬',
  '🏯', '💒', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛲', '🏟️', '🏛️',
  '🏗️', '🏕️', '🌋', '🗾', '🎡', '🎢', '🎪', '🗺️',
];

function memoryStore(): KeyValueStore {
  const mem = new Map<string, string>();
  return {
    getItem: key => mem.get(key) ?? null,
    setItem: (key, value) => { mem.set(key, value); },
    removeItem: key => { mem.delete(key); },
  };
}

function fill(emoji: string, n: number) {
  const city = emptyCity();
  for (let i = 0; i < n; i++) city.tiles[i] = emoji;
  return city;
}

function floorMap(): MapGrid {
  const tile = (type: Tile['type']): Tile => ({ type, emoji: '⬜', seen: false, visible: false });
  return [
    [tile('wall'), tile('wall'), tile('wall'), tile('wall')],
    [tile('wall'), tile('floor'), tile('floor'), tile('wall')],
    [tile('wall'), tile('wall'), tile('wall'), tile('wall')],
  ];
}

beforeEach(() => {
  setMetaStore(memoryStore());
});

describe('EmojiCB buildings', () => {
  it('lists every structure once and tags the districts', () => {
    expect(new Set(BUILDINGS.map(b => b.emoji)).size).toBe(BUILDINGS.length);
    for (const emoji of REQUIRED) expect(buildingOf(emoji)?.emoji).toBe(emoji);
    expect(BUILDINGS).toHaveLength(REQUIRED.length);

    expect(classifyEmoji('🛖')?.id).toBe('thieves');
    expect(classifyEmoji('🏚️')?.id).toBe('thieves');
    expect(classifyEmoji('⛩️')?.id).toBe('arcane');
    expect(classifyEmoji('🛕')?.id).toBe('arcane');
    expect(classifyEmoji('⛺')?.id).toBe('grove');
    expect(classifyEmoji('🏕️')?.id).toBe('grove');
    expect(classifyEmoji('🏔️')?.id).toBe('grove');
    expect(classifyEmoji('🏤')?.id).toBe('saloon');
    expect(classifyEmoji('🏦')?.id).toBe('saloon');
    expect(classifyEmoji('🏟️')?.id).toBe('saloon');
    expect(classifyEmoji('🌋')?.id).toBe('void');
    expect(classifyEmoji('🏰')).toBeNull();
    expect(classifyEmoji('🏭')).toBeNull();
    expect(classifyEmoji('🏢')).toBeNull();
    expect(classifyEmoji('🏠')).toBeNull();

    expect(activeDistricts(fill('⛩️', 4)).map(row => row.name)).toEqual(['Arcane Sanctum']);
    expect(activeDistricts(fill('🛖', 4)).map(row => row.id)).toEqual(['thieves']);
    expect(activeDistricts(fill('🏰', 6))).toEqual([]);
    expect(districtStandings(fill('⛩️', 4)).find(row => row.id === 'arcane')).toMatchObject({
      count: 4, weight: 8, tier: 2, amount: 4, label: '+4 max MP',
    });
    const wizard = applyDistrictBonus(
      { characterClass: WIZARD, stats: { hp: 8, maxHp: 8, attack: 3, defense: 0, speed: 1, evasion: 5, luck: 0, mana: 4, maxMana: 4 } },
      fill('⛩️', 4),
    );
    expect(wizard.player.stats.maxMana).toBe(8);
  });

  it('gives larger buildings more citizen housing', () => {
    expect(lotHousing('🏠')).toBe(1);
    expect(lotHousing('⛺')).toBe(2);
    expect(lotHousing('🏢')).toBe(3);
    expect(lotHousing('🏰')).toBe(4);
    expect(lotHousing('🍎')).toBe(1);
    expect(citizenCapacityOf(fill('🏠', 5))).toBe(1);
    expect(citizenCapacityOf(fill('🗡️', 5))).toBe(1);
    expect(citizenCapacityOf(fill('🏰', 2))).toBe(1);
    expect(citizenCapacityOf(fill('🏰', 5))).toBe(4);
    const crowded = syncCitizens(fill('🏰', 5), { '🧟': 3 }, () => 0);
    expect(crowded.citizens).toHaveLength(4);
    expect(crowded.citizens.every(c => c.emoji === '🧟')).toBe(true);
  });

  it('raises a structure by spending spare non-building tokens', () => {
    expect(BUILDING_EXCHANGE_COST).toBe(3);
    const apples = { '🍎': 3 };
    const raised = exchangeForBuilding(apples, emptyCity(), '🏠');
    expect(raised.ok).toBe(true);
    expect(apples).toEqual({ '🍎': 3 });
    expect(raised.consumes['🍎']).toBe(0);
    expect(raised.consumes['🏠']).toBe(1);

    const short = { '🍎': 2 };
    const refused = exchangeForBuilding(short, emptyCity(), '🏠');
    expect(refused.ok).toBe(false);
    expect(refused.consumes).toBe(short);

    const placed = fill('🍎', 2);
    const held = { '🍎': 4 };
    expect(exchangeForBuilding(held, placed, '🛖').ok).toBe(false);
    const freed = exchangeForBuilding({ '🍎': 4 }, fill('🍎', 1), '🛖');
    expect(freed.ok).toBe(true);
    expect(freed.consumes['🍎']).toBe(1);
    expect(freed.consumes['🛖']).toBe(1);

    expect(exchangeForBuilding({ '🏰': 9 }, emptyCity(), '🏠').ok).toBe(false);
    const split = exchangeForBuilding({ '🍎': 2, '🗡️': 2 }, emptyCity(), '🛖');
    expect(split.ok).toBe(true);
    expect((split.consumes['🍎'] ?? 0) + (split.consumes['🗡️'] ?? 0)).toBe(1);
    expect(split.consumes['🛖']).toBe(1);
    expect(supplyPalette(split.consumes, emptyCity())).not.toContain('🛖');
    expect(supplyPalette({ '🍎': 1, '🏠': 2 }, emptyCity())).toEqual(['🍎']);
  });

  it('keeps the raised blueprint in the consume ledger', () => {
    saveCity(fill('🌳', 1));
    const raised = exchangeForBuilding({ '🍎': 3 }, emptyCity(), '⛩️');
    const saved = replaceEmojiConsumes(raised.consumes);
    expect(saved['⛩️']).toBe(1);
    expect(saved['🍎']).toBeUndefined();
    const meta = loadMeta();
    expect(meta.city?.tiles[0]).toBe('🌳');
    expect(meta.emojiConsumes?.['⛩️']).toBe(1);
  });

  it('rolls structure rarity separately from kill loot', () => {
    expect(STRUCTURE_FLOOR_CHANCE).toBe(0.18);
    expect(STRUCTURE_SURVEY_MOOD).toBe(8);
    expect(STRUCTURE_SELL_VALUE).toBe(1);
    expect(BUILDING_RARITY_WEIGHT.common).toBe(8);
    expect(rollStructureBuilding(() => 0).emoji).toBe('🏠');
    expect(rollStructureBuilding(() => 0).rarity).toBe('common');
    expect(rollStructureBuilding(() => 0.999999).emoji).toBe('🌋');
    const item = structureItem(buildingOf('🏠')!);
    expect(item.isStructure).toBe(true);
    expect(item.itemId).toBe('structure:🏠');
    expect(rarityOfItem(item)).toBe('common');
    expect(rarityOfItem(structureItem(buildingOf('🌋')!))).toBe('legendary');
    expect(getItemSellValue({ ...item, id: 's', consumed: false })).toBe(1);
    expect(DROP_TABLE.some(row => row.itemId.startsWith('structure:'))).toBe(false);
    const surveyed = structureSurvey(0, 100, buildingOf('🛖')!);
    expect(surveyed.moodValue).toBe(8);
    expect(surveyed.log).toContain('EmojiCB gains 1 token');
  });

  it('hides one blueprint on an open floor and skips boss vaults', () => {
    const room: Room = { x: 0, y: 0, w: 4, h: 3, theme: 'normal' };
    const found = rollStructureFind([room], floorMap(), [], () => 0);
    expect(found?.emoji).toBe('🏠');
    expect(found?.isStructure).toBe(true);
    expect(found?.pos).toEqual({ x: 1, y: 1 });
    expect(rollStructureFind([room], floorMap(), [], () => 0.5)).toBeNull();
    const boss: Room = { x: 0, y: 0, w: 4, h: 3, theme: 'boss' };
    expect(rollStructureFind([boss], floorMap(), [], () => 0)).toBeNull();
  });

  it('shows structures on their own row in the city', () => {
    const city = readFileSync(new URL('../pages/city.tsx', import.meta.url), 'utf8');
    expect(city).toContain('city-structures');
    expect(city).toContain('raise-structure');
    expect(city).toContain('data-testid="city-palette"');
  });
});
