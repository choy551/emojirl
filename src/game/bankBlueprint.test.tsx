import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BankPanel } from '../components/BankPanel';
import { buildingOf, structureItem } from './cityBuildings';
import { loadMeta, setMetaStore, type KeyValueStore } from './meta';
import { surveyBankedBlueprint } from './shopUse';
import type { Player } from './types';

function memoryStore(): KeyValueStore {
  const mem = new Map<string, string>();
  return {
    getItem: key => mem.get(key) ?? null,
    setItem: (key, value) => { mem.set(key, value); },
    removeItem: key => { mem.delete(key); },
  };
}

function player(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 6, defense: 1, speed: 2, evasion: 5,
      luck: 1, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  };
}

beforeEach(() => {
  setMetaStore(memoryStore());
});

describe('bank structure blueprints', () => {
  it('surveys a banked blueprint into one EmojiCB token and leaves the hotbar alone', () => {
    const hut = { ...structureItem(buildingOf('🛖')!), id: 'hut-1', consumed: false };
    const hotbar = { id: 'star', emoji: '🌟', name: 'Star', description: 'Beacon', consumed: false };
    const surveyed = surveyBankedBlueprint(player({ inventory: [hotbar], bank: [hut] }), 'hut-1', () => 1);
    expect(surveyed).not.toBeNull();
    expect(surveyed!.consumed).toBe(true);
    expect(surveyed!.player.bank).toHaveLength(0);
    expect(surveyed!.player.inventory).toEqual([hotbar]);
    expect(surveyed!.player.stats.moodValue).toBe(8);
    expect(surveyed!.logs.join('\n')).toContain('Hut surveyed');
    expect(surveyed!.logs.join('\n')).toContain('EmojiCB gains a token');
    expect(loadMeta().emojiConsumes?.['🛖']).toBe(1);
  });

  it('offers Consume next to Pull to Hotbar', () => {
    const hut = { ...structureItem(buildingOf('🏠')!), id: 'house-1', consumed: false };
    const html = renderToStaticMarkup(
      <BankPanel
        player={player({ bank: [hut] })}
        bagSlots={[]}
        selectedItemId="house-1"
        focusedBagIdx={-1}
        onSelect={() => {}}
        onMove={() => {}}
        onConsume={() => {}}
        onClose={() => {}}
        onShowStatCard={() => {}}
      />,
    );
    expect(html).toContain('Pull to Hotbar');
    expect(html).toContain('Consume');
  });
});
