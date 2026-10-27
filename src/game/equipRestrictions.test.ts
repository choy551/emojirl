import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EquipmentTab } from '../components/EquipmentTab';
import {
  canEquipInSlot,
  canEquipItem,
  classWeaponRulesBlurb,
  emptyLegalEquipSlot,
  equipRestrictionReason,
  legalEquipSlots,
  preferredEquipSlot,
} from '../components/itemUtils';
import { executeIdentityReroll } from './goldSinks';
import { setMetaStore, type KeyValueStore } from './meta';
import {
  COWBOY,
  FENCER,
  GENIE,
  HITMAN,
  NINJA,
  RANGER,
  ROYAL_GUARD,
  VOID,
  WIZARD,
} from './prestigeConstants';
import { SAVE_KEY, SAVE_SCHEMA_VERSION, loadGame } from './save';
import type { EmojiItem, EquipSlot, Player } from './types';

function memStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
}

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

beforeEach(() => {
  localStorage.clear();
  setMetaStore(memStore());
});

afterEach(() => {
  localStorage.clear();
});

function piece(over: Partial<EmojiItem> & Pick<EmojiItem, 'id' | 'emoji' | 'name'>): EmojiItem {
  return { description: over.name, consumed: false, isEquipment: true, ...over };
}

const bow = piece({ id: 'bow', emoji: '🏹', name: 'Longbow', weaponKind: 'bow', equipSlots: ['mainHand'] });
const gun = piece({ id: 'gun', emoji: '🔫', name: 'Revolver', weaponKind: 'gun', equipSlots: ['mainHand', 'offHand'] });
const musket = piece({ id: 'musket', emoji: '🔫', name: 'Musket', weaponKind: 'gun', gunTier: 'musket', equipSlots: ['mainHand'] });
const blade = piece({ id: 'sword', emoji: '⚔️', name: 'Sword', weaponKind: 'blade', equipSlots: ['mainHand', 'offHand'] });
const hunt = piece({ id: 'hunt', emoji: '🔰', name: 'Hunting Blade', weaponKind: 'blade', equipSlots: ['offHand'] });
const staff = piece({ id: 'wand', emoji: '🪄', name: 'Magic Wand', weaponKind: 'staff', equipSlots: ['mainHand'] });
const parasol = piece({ id: 'parasol', emoji: '🌂', name: 'Arcane Parasol', weaponKind: 'staff', equipSlots: ['mainHand', 'offHand'] });
const arrows = piece({ id: 'fire', emoji: '🔥', name: 'Fire Arrows', specialAmmoKind: 'fire', equipSlots: ['offHand'] });
const shield = piece({ id: 'ward', emoji: '🪬', name: 'Ward Shield', armorKind: 'shield', equipSlots: ['offHand'] });
const armor = piece({ id: 'helm', emoji: '⛑️', name: 'Combat Helmet', armorKind: 'armor', equipSlots: ['body'] });
const ring = piece({ id: 'ring', emoji: '💍', name: 'Power Ring', equipSlots: ['accessory'] });

function slotsOf(item: EmojiItem, cls: string): EquipSlot[] {
  return legalEquipSlots(item, cls);
}

function hero(cls: string, over: Partial<Player> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: cls,
    characterClass: cls,
    ammo: 0,
    stats: {
      hp: 12, maxHp: 20, attack: 4, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 5000,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  };
}

describe('class weapon locks', () => {
  it('lets wizards and genies hold staves, and nothing else, in either hand', () => {
    for (const cls of [WIZARD, GENIE]) {
      expect(slotsOf(staff, cls)).toEqual(['mainHand']);
      expect(slotsOf(parasol, cls)).toEqual(['mainHand', 'offHand']);
      expect(slotsOf(blade, cls)).toEqual([]);
      expect(slotsOf(bow, cls)).toEqual([]);
      expect(slotsOf(gun, cls)).toEqual([]);
      expect(slotsOf(musket, cls)).toEqual([]);
      expect(slotsOf(arrows, cls)).toEqual([]);
      expect(slotsOf(shield, cls)).toEqual(['offHand']);
      expect(slotsOf(armor, cls)).toEqual(['body']);
      expect(slotsOf(ring, cls)).toEqual(['accessory']);
    }
  });

  it('lets ninjas and fencers hold blades in either hand', () => {
    for (const cls of [NINJA, FENCER]) {
      expect(slotsOf(blade, cls)).toEqual(['mainHand', 'offHand']);
      expect(slotsOf(hunt, cls)).toEqual(['offHand']);
      expect(slotsOf(staff, cls)).toEqual([]);
      expect(slotsOf(parasol, cls)).toEqual([]);
      expect(slotsOf(bow, cls)).toEqual([]);
      expect(slotsOf(gun, cls)).toEqual([]);
      expect(slotsOf(musket, cls)).toEqual([]);
      expect(slotsOf(arrows, cls)).toEqual([]);
      expect(slotsOf(shield, cls)).toEqual(['offHand']);
    }
  });

  it('gives a ranger bows in the main hand and arrows or swords in the off hand', () => {
    expect(slotsOf(bow, RANGER)).toEqual(['mainHand']);
    expect(canEquipInSlot(bow, RANGER, 'offHand')).toBe(false);
    expect(slotsOf(blade, RANGER)).toEqual(['offHand']);
    expect(canEquipInSlot(blade, RANGER, 'mainHand')).toBe(false);
    expect(slotsOf(hunt, RANGER)).toEqual(['offHand']);
    expect(slotsOf(arrows, RANGER)).toEqual(['offHand']);
    expect(canEquipItem(gun, RANGER)).toBe(false);
    expect(canEquipItem(musket, RANGER)).toBe(false);
    expect(canEquipItem(staff, RANGER)).toBe(false);
    expect(canEquipItem(parasol, RANGER)).toBe(false);
    expect(canEquipItem(shield, RANGER)).toBe(false);
    expect(slotsOf(armor, RANGER)).toEqual(['body']);
    expect(slotsOf(ring, RANGER)).toEqual(['accessory']);
    expect(preferredEquipSlot(blade, RANGER, {})).toBe('offHand');
    expect(emptyLegalEquipSlot(blade, RANGER, { offHand: blade })).toBeUndefined();
    expect(equipRestrictionReason(gun, RANGER)).toContain('cannot equip guns');
    expect(equipRestrictionReason(gun, RANGER)).toContain('bows in the main hand');
    expect(equipRestrictionReason(blade, RANGER, 'mainHand')).toContain('Swords and arrows');
    expect(equipRestrictionReason(staff, RANGER)).toContain('staves/wands');
  });

  it('lets cowboys hold pistols and the hitman hold muskets too', () => {
    expect(slotsOf(gun, COWBOY)).toEqual(['mainHand', 'offHand']);
    expect(canEquipItem(musket, COWBOY)).toBe(false);
    expect(canEquipItem(blade, COWBOY)).toBe(false);
    expect(canEquipItem(bow, COWBOY)).toBe(false);
    expect(canEquipItem(shield, COWBOY)).toBe(false);
    expect(equipRestrictionReason(blade, COWBOY)).toBe('Only real Cowboys fight with their fists!');
    expect(equipRestrictionReason(musket, COWBOY)).toContain('cannot equip muskets');

    expect(slotsOf(gun, HITMAN)).toEqual(['mainHand', 'offHand']);
    expect(slotsOf(musket, HITMAN)).toEqual(['mainHand']);
    expect(canEquipInSlot(musket, HITMAN, 'offHand')).toBe(false);
    expect(canEquipItem(bow, HITMAN)).toBe(false);
    expect(canEquipItem(blade, HITMAN)).toBe(false);
    expect(canEquipItem(shield, HITMAN)).toBe(false);
    expect(canEquipItem(arrows, HITMAN)).toBe(false);
  });

  it('gives the royal guard gun and bow versatility, including a bow in the off hand', () => {
    expect(slotsOf(bow, ROYAL_GUARD)).toEqual(['mainHand', 'offHand']);
    expect(slotsOf(gun, ROYAL_GUARD)).toEqual(['mainHand', 'offHand']);
    expect(slotsOf(musket, ROYAL_GUARD)).toEqual(['mainHand']);
    expect(slotsOf(blade, ROYAL_GUARD)).toEqual(['mainHand', 'offHand']);
    expect(slotsOf(arrows, ROYAL_GUARD)).toEqual(['offHand']);
    expect(canEquipInSlot(arrows, ROYAL_GUARD, 'mainHand')).toBe(false);
    expect(canEquipItem(staff, ROYAL_GUARD)).toBe(false);
    expect(slotsOf(shield, ROYAL_GUARD)).toEqual(['offHand']);
    expect(preferredEquipSlot(bow, ROYAL_GUARD, { mainHand: gun })).toBe('offHand');
  });

  it('lets the void wear usual weapons, not muskets or special arrows', () => {
    expect(slotsOf(bow, VOID)).toEqual(['mainHand']);
    expect(slotsOf(gun, VOID)).toEqual(['mainHand', 'offHand']);
    expect(slotsOf(blade, VOID)).toEqual(['mainHand', 'offHand']);
    expect(slotsOf(staff, VOID)).toEqual(['mainHand']);
    expect(slotsOf(parasol, VOID)).toEqual(['mainHand', 'offHand']);
    expect(canEquipItem(musket, VOID)).toBe(false);
    expect(canEquipItem(arrows, VOID)).toBe(false);
    expect(slotsOf(shield, VOID)).toEqual(['offHand']);
    expect(slotsOf(armor, VOID)).toEqual(['body']);
    expect(slotsOf(ring, VOID)).toEqual(['accessory']);
  });

  it('banks a sword that is only legal in the other hand when the class changes', () => {
    const result = executeIdentityReroll(
      hero(WIZARD, { equipment: { mainHand: blade }, inventory: [piece({ id: 'keep', emoji: '🍀', name: 'Clover', isEquipment: false })] }),
      1,
      RANGER,
    );
    expect(result.ok).toBe(true);
    expect(result.player?.equipment.mainHand).toBeUndefined();
    expect(result.player?.equipment.offHand).toBeUndefined();
    expect(result.player?.bank.some(item => item.id === 'sword')).toBe(true);
    expect(result.player?.inventory.some(item => item.id === 'sword')).toBe(false);
  });
});

describe('Bag Equip options', () => {
  function markup(player: Player, selectedItemId: string | null = null) {
    return renderToStaticMarkup(createElement(EquipmentTab, {
      player,
      selectedItemId,
      focusedBagIdx: -1,
      onEquip: () => {},
      onUnequip: () => {},
      onSelectItem: () => {},
      itemInspectProps: () => ({}),
    }));
  }

  it('greys weapons the class cannot wear and keeps the row tall enough to tap', () => {
    const html = markup(hero(RANGER, { inventory: [gun, staff, bow, blade], bank: [] }));
    const gunRow = html.slice(html.indexOf('data-testid="equip-option-gun"'), html.indexOf('data-testid="equip-option-wand"'));
    const wandRow = html.slice(html.indexOf('data-testid="equip-option-wand"'), html.indexOf('data-testid="equip-option-bow"'));
    const bowRow = html.slice(html.indexOf('data-testid="equip-option-bow"'), html.indexOf('data-testid="equip-option-sword"'));
    expect(gunRow).toContain('grayscale');
    expect(gunRow).toContain('aria-disabled="true"');
    expect(gunRow).toContain('min-h-11');
    expect(gunRow).toContain('cannot equip guns');
    expect(wandRow).toContain('grayscale');
    expect(wandRow).toContain('staves/wands');
    expect(bowRow).not.toContain('grayscale');
    expect(bowRow).toContain('aria-disabled="false"');
    expect(bowRow).toContain('min-h-11');
  });

  it('greys the main hand when a ranger sword can only sit in the off hand', () => {
    const html = markup(hero(RANGER, { inventory: [blade] }), 'sword');
    const main = html.slice(html.indexOf('data-testid="equip-slot-mainHand"'), html.indexOf('data-testid="equip-slot-offHand"'));
    const off = html.slice(html.indexOf('data-testid="equip-slot-offHand"'), html.indexOf('data-testid="equip-slot-accessory"'));
    expect(main).toContain('aria-disabled="true"');
    expect(main).toContain('grayscale');
    expect(main).toContain('Swords and arrows');
    expect(off).toContain('aria-disabled="false"');
    expect(off).not.toContain('grayscale');
  });
});

describe('invalid gear on load', () => {
  function soul(id: string): EmojiItem {
    return {
      id, emoji: '🍀', name: id, description: 'luck', consumed: false,
      bagPassive: { description: 'lucky', luckBonus: 1 },
    };
  }

  function plant(raw: Record<string, unknown>) {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 4,
      turn: 6,
      logs: [{ id: 'old', text: 'earlier', turn: 5 }],
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
      player: { characterClass: RANGER, stats: {}, inventory: [], bank: [], equipment: {} },
      ...raw,
    }));
  }

  function loadOk() {
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') throw new Error('expected a migrated save');
    return loaded.state;
  }

  it('keeps a legal bow and moves a gun and a staff into the bag', () => {
    plant({
      player: {
        characterClass: RANGER,
        stats: {},
        inventory: [soul('keep')],
        bank: [],
        equipment: { mainHand: gun, offHand: staff, body: armor },
      },
    });
    const state = loadOk();
    expect(state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(state.schemaVersion).toBe(5);
    expect(state.player.equipment.mainHand).toBeUndefined();
    expect(state.player.equipment.offHand).toBeUndefined();
    expect(state.player.equipment.body?.id).toBe('helm');
    expect(state.player.inventory.map(item => item.id)).toEqual(['keep', 'gun', 'wand']);
    expect(state.player.bank).toEqual([]);
    expect(state.logs.map(log => log.text).join('\n')).toContain("Revolver doesn't fit a Ranger — moved to the Bag.");
    expect(state.logs.map(log => log.text).join('\n')).toContain("Magic Wand doesn't fit a Ranger — moved to the Bag.");
    expect(state.logs.at(-1)?.text).toBe('earlier');
  });

  it('sends overflow gear to the bank when the bag is full', () => {
    const souls = Array.from({ length: 8 }, (_, i) => soul(`s${i}`));
    plant({
      player: {
        characterClass: RANGER,
        stats: {},
        inventory: souls,
        bank: [soul('banked')],
        equipment: { mainHand: gun, offHand: parasol },
      },
    });
    const state = loadOk();
    expect(state.player.inventory.map(item => item.id)).toEqual([...souls.map(item => item.id), 'gun']);
    expect(state.player.bank.map(item => item.id)).toEqual(['banked', 'parasol']);
    const text = state.logs.map(log => log.text).join('\n');
    expect(text).toContain("Revolver doesn't fit a Ranger — moved to the Bag.");
    expect(text).toContain("Arcane Parasol doesn't fit a Ranger — Bag full, moved to the Bank.");
  });

  it('leaves a royal guard bow in the off hand alone', () => {
    plant({
      player: {
        characterClass: ROYAL_GUARD,
        stats: {},
        inventory: [],
        bank: [],
        equipment: { mainHand: gun, offHand: { ...bow, id: 'bow-off' } },
      },
    });
    const state = loadOk();
    expect(state.player.equipment.mainHand?.id).toBe('gun');
    expect(state.player.equipment.offHand?.id).toBe('bow-off');
    expect(state.logs.map(log => log.text)).toEqual(['earlier']);
  });
});

describe('RTFM weapon rules', () => {
  it('prints the same class rules the equip check uses', () => {
    const blurb = classWeaponRulesBlurb();
    expect(blurb).toContain('Ranger: bows in the main hand, arrows or swords in the off hand');
    expect(blurb).toContain('Royal Guard:');
    expect(blurb).toContain('both hands may be ranged');
    expect(blurb).toContain('The Void:');
    expect(blurb).toContain('Genie:');
    expect(blurb).toContain('Fencer:');
    expect(blurb).toContain('Levitating Hitman:');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('classWeaponRulesBlurb');
    const hook = readFileSync(new URL('../hooks/actions/useInventoryActions.ts', import.meta.url), 'utf8');
    expect(hook).toContain('equipRestrictionReason');
    expect(hook).not.toContain('bow or gun');
  });
});
