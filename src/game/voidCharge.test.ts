import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ActiveKind, EmojiItem, Player } from './types';
import { buildHotbarSlots, countVoidPressureSlots } from './inventory';
import { loadMeta, replaceEmojiConsumes } from './meta';
import { readGhostCatalog, readVoidModeProgress, startingVoidLoadout, recordHotbarSoulConsume } from './voidMeta';
import {
  chargeGhostUseRefusal,
  consumeVoidBurdenItem,
  isVoidBurdenActive,
  locateVoidGhost,
  spendChargeGhostByKind,
  spendChargeGhostUse,
  voidGhostBadge,
  writeGhostCharge,
} from './voidCharge';

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
  replaceEmojiConsumes({});
});

function player(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 3, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  };
}

function voidPlayer(over: Partial<Player> = {}): Player {
  return player({ emoji: '👤', characterClass: '👤', ...over });
}

function active(emoji: string, name: string, activeKind: ActiveKind, charges: number, id = name): EmojiItem {
  return { id, emoji, name, description: name, consumed: false, activeKind, charges };
}

const gun = (id = 'gun') => active('🔫', 'Gun', 'gun', 3, id);
const boom = (id = 'boom') => active('🪃', 'Boomerang', 'boomerang', -1, id);
const money = (id = 'money'): EmojiItem => ({
  id, emoji: '💰', name: 'Money Bag', description: 'coins', consumed: false, isMoneyBag: true,
});

function feed(p: Player, item: EmojiItem, floor = 1) {
  return consumeVoidBurdenItem({ ...p, inventory: [item], bank: [] }, item, floor);
}

describe('Void unmake of charge items and money bags', () => {
  it('leaves other classes unable to unmake a gun', () => {
    const wiz = player({ inventory: [gun()] });
    const result = consumeVoidBurdenItem(wiz, wiz.inventory[0], 1);
    expect(result.removed).toBe(false);
    expect(result.player.inventory).toHaveLength(1);
    expect(readGhostCatalog()['🔫']).toBeUndefined();
    expect(isVoidBurdenActive(gun())).toBe(true);
    expect(isVoidBurdenActive({ ...gun(), isEquipment: true, activeKind: undefined })).toBe(false);
  });

  it('removes a gun, counts one consume, and does not fill the slot with a ghost yet', () => {
    const held = voidPlayer({ inventory: [gun(), {
      id: 'fire', emoji: '🔥', name: 'Fire', description: '', consumed: false,
      bagPassive: { description: 'burn', attackBonus: 1 },
    }] });
    expect(countVoidPressureSlots(held)).toBe(2);
    const result = consumeVoidBurdenItem(held, held.inventory[0], 1);
    expect(result.removed).toBe(true);
    expect(result.player.inventory.map(i => i.emoji)).toEqual(['🔥']);
    expect(countVoidPressureSlots(result.player)).toBe(1);
    expect(readGhostCatalog()['🔫']).toMatchObject({ consumes: 1, unlocks: 0 });
    expect(locateVoidGhost(result.player, '🔫')).toBeNull();
    expect(result.logs.join(' ')).toContain('1/10 toward a ghost');
    expect(loadMeta().emojiConsumes?.['🔫']).toBe(1);
    expect(readVoidModeProgress().ranger).toBe(1);
  });

  it('unlocks a gun ghost at full charges on the 10th unmake, and ghost uses are not pressure', () => {
    let p = voidPlayer();
    for (let i = 0; i < 9; i++) {
      const step = feed(p, gun(`g${i}`));
      expect(step.removed).toBe(true);
      p = step.player;
    }
    expect(locateVoidGhost(p, '🔫')).toBeNull();
    const tenth = feed(p, { ...gun('g9'), charges: 1 });
    p = tenth.player;
    const ghost = locateVoidGhost(p, '🔫')!.ghost;
    expect(ghost.stacks).toBe(1);
    expect(ghost.uses).toBe(3);
    expect(ghost.maxUses).toBe(3);
    expect(tenth.logs.join(' ')).toContain('Ghost unlocked — 3/3 uses');
    expect(countVoidPressureSlots(p)).toBe(0);
    const shown = buildHotbarSlots(p)[0]!;
    expect(shown.name).toBe('Gun Ghost');
    expect(shown.charges).toBe(3);
    expect(shown.description).toContain('does not add Void pressure');
    expect(voidGhostBadge(shown)).toBe('×3');

    const beforeCatalog = readGhostCatalog()['🔫'].consumes;
    const beforeTokens = loadMeta().emojiConsumes?.['🔫'];
    const spent = spendChargeGhostUse(p, '🔫');
    expect(spent.ok).toBe(true);
    expect(spent.uses).toBe(2);
    expect(spent.player.inventory).toBe(p.inventory);
    expect(readGhostCatalog()['🔫'].consumes).toBe(beforeCatalog);
    expect(loadMeta().emojiConsumes?.['🔫']).toBe(beforeTokens);
    expect(countVoidPressureSlots(spent.player)).toBe(0);
    const spentAgain = spendChargeGhostByKind(spent.player, 'gun');
    expect(spentAgain.ok).toBe(true);
    expect(spentAgain.uses).toBe(1);
    expect(spentAgain.player.inventory).toBe(p.inventory);
    expect(countVoidPressureSlots(spentAgain.player)).toBe(0);

    const topped = feed(tenth.player, gun('full'));
    expect(locateVoidGhost(topped.player, '🔫')!.ghost.uses).toBe(3);
    expect(topped.logs.join(' ')).toContain('stays at 3/3');

    const low = writeGhostCharge(topped.player, '🔫', 1, 3);
    const recharged = feed(low, gun('re'));
    expect(locateVoidGhost(recharged.player, '🔫')!.ghost.uses).toBe(2);
    expect(recharged.logs.join(' ')).toContain('1 → 2');
  });

  it('raises the ghost stack on the 20th unmake without wiping uses', () => {
    let p = voidPlayer();
    for (let i = 0; i < 19; i++) p = feed(p, gun(`g${i}`)).player;
    expect(locateVoidGhost(p, '🔫')!.ghost).toMatchObject({ stacks: 1, uses: 3, maxUses: 3 });
    p = writeGhostCharge(p, '🔫', 1, 3);
    const twentieth = feed(p, gun('g19'));
    expect(locateVoidGhost(twentieth.player, '🔫')!.ghost).toMatchObject({ stacks: 2, uses: 2, maxUses: 3 });
    expect(twentieth.logs.join(' ')).toContain('Ghost stack ×2');
    expect(countVoidPressureSlots(twentieth.player)).toBe(0);
  });

  it('pays a money bag its sell value and does not unlock a ghost', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const held = voidPlayer({ inventory: [money()], stats: { ...voidPlayer().stats, gold: 5 } });
      const result = consumeVoidBurdenItem(held, held.inventory[0], 1);
      expect(result.removed).toBe(true);
      expect(result.goldGained).toBe(100);
      expect(result.player.stats.gold).toBe(105);
      expect(result.player.inventory).toHaveLength(0);
      expect(readGhostCatalog()['💰']).toBeUndefined();
      expect(locateVoidGhost(result.player, '💰')).toBeNull();
      expect(countVoidPressureSlots(result.player)).toBe(0);
    } finally {
      random.mockRestore();
    }
  });

  it('keeps a boomerang ghost endless', () => {
    let p = voidPlayer();
    for (let i = 0; i < 10; i++) p = feed(p, boom(`b${i}`)).player;
    expect(locateVoidGhost(p, '🪃')!.ghost).toMatchObject({ uses: -1, maxUses: -1, stacks: 1 });
    const shown = buildHotbarSlots(p)[0]!;
    expect(shown.charges).toBe(-1);
    expect(voidGhostBadge(shown)).toBe('∞');
    expect(shown.description).toContain('does not add Void pressure');
    const spent = spendChargeGhostUse(p, '🪃');
    expect(spent.ok).toBe(true);
    expect(spent.uses).toBe(-1);
    expect(locateVoidGhost(spent.player, '🪃')!.ghost.uses).toBe(-1);
    p = feed(spent.player, boom('more')).player;
    expect(locateVoidGhost(p, '🪃')!.ghost.uses).toBe(-1);
    expect(countVoidPressureSlots(p)).toBe(0);
  });

  it('gives bomb, rope, and freeze ghosts a single use that recharges', () => {
    const specs: { emoji: string; name: string; kind: ActiveKind }[] = [
      { emoji: '💣', name: 'Bomb', kind: 'bomb' },
      { emoji: '🪢', name: 'Rope', kind: 'rope' },
      { emoji: '❄️', name: 'Freeze', kind: 'freeze' },
    ];
    for (const spec of specs) {
      localStorage.clear();
      replaceEmojiConsumes({});
      let p = voidPlayer();
      for (let i = 0; i < 10; i++) {
        p = feed(p, active(spec.emoji, spec.name, spec.kind, 1, `${spec.kind}${i}`)).player;
      }
      expect(locateVoidGhost(p, spec.emoji)!.ghost).toMatchObject({ uses: 1, maxUses: 1 });
      const spent = spendChargeGhostByKind(p, spec.kind);
      expect(spent.ok).toBe(true);
      expect(spent.uses).toBe(0);
      expect(spent.player.inventory).toBe(p.inventory);
      expect(readGhostCatalog()[spec.emoji].consumes).toBe(10);
      expect(countVoidPressureSlots(spent.player)).toBe(0);
      const empty = spendChargeGhostByKind(spent.player, spec.kind);
      expect(empty.ok).toBe(false);
      expect(empty.refusal).toContain('no uses');
      expect(locateVoidGhost(empty.player, spec.emoji)!.ghost.uses).toBe(0);
      const recharged = feed(spent.player, active(spec.emoji, spec.name, spec.kind, 1, `${spec.kind}-re`));
      expect(locateVoidGhost(recharged.player, spec.emoji)!.ghost.uses).toBe(1);
    }
  });

  it('refuses a dormant charge ghost without spending a use', () => {
    const p = voidPlayer({
      voidBossesCleared: 0,
      ghostHotbar: [
        { emoji: '🔫', stacks: 1, uses: 3, maxUses: 3 },
        { emoji: '💣', stacks: 1, uses: 1, maxUses: 1 },
        null, null, null, null, null, null, null,
      ],
    });
    const slots = buildHotbarSlots(p);
    expect(slots[1]?.isVoidGhostDormant).toBe(true);
    expect(chargeGhostUseRefusal(slots[1]!, locateVoidGhost(p, '💣')!.ghost)).toContain('dormant');
    const shot = spendChargeGhostByKind(p, 'bomb');
    expect(shot.ok).toBe(false);
    expect(shot.player).toBe(p);
    expect(locateVoidGhost(p, '💣')!.ghost.uses).toBe(1);
    expect(countVoidPressureSlots(p)).toBe(0);
  });

  it('starts a new run with charge ghosts full', () => {
    for (let i = 0; i < 10; i++) recordHotbarSoulConsume('🔫');
    const load = startingVoidLoadout(0);
    expect(load.ghostHotbar[0]).toMatchObject({ emoji: '🔫', stacks: 1, uses: 3, maxUses: 3 });
  });

  it('documents unmake, ghost uses, and money-bag gold in the Void rules', () => {
    const classes = readFileSync(new URL('./classes.ts', import.meta.url), 'utf8');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    for (const text of [classes, manual]) {
      expect(text).toContain('does not add Void pressure');
      expect(text).toContain('sell value');
    }
  });
});
