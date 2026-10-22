import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbilityButtons } from '../components/mobile/AbilityButtons';
import { ActionsMenu } from '../components/mobile/ActionsMenu';
import { getClassAbilities, type ClassAbilityArgs } from '../components/mobile/classAbilities';
import { TacticsMenu } from '../components/TacticsMenu';
import { CHARACTER_CLASSES } from './classes';
import {
  bloodcastOffLog,
  genieBloodcastEnabled,
  genieOverchannelEnabled,
  genieSafeFireballEnabled,
  planGenieCast,
  toggleGenieCast,
  type GenieCastToggle,
} from './prestige';
import { resolveGenieFireball, safeFireballLog, safeFireballResponse, tileInFireball } from './prestigeCast';
import {
  GENIE,
  GENIE_FIREBALL_MP,
  GENIE_OVERCHANNEL_LEVEL,
  GENIE_OVERCHANNEL_MULT,
  WIZARD,
} from './prestigeConstants';
import { SAVE_KEY, SAVE_SCHEMA_VERSION, loadGame, saveGame } from './save';
import type { Enemy, GameState, MapGrid, Player } from './types';

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
});

afterEach(() => {
  localStorage.clear();
});

function player(partial: Omit<Partial<Player>, 'stats'> & { characterClass: string; stats?: Partial<Player['stats']> }): Player {
  return {
    pos: { x: 1, y: 0 },
    emoji: partial.characterClass,
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: {},
    ...partial,
    stats: {
      hp: 20, maxHp: 20, attack: 8, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: GENIE_OVERCHANNEL_LEVEL, xp: 0, moodValue: 0, gold: 0,
      mana: 6, maxMana: 6,
      ...partial.stats,
    },
  };
}

function foe(): Enemy {
  return {
    id: 'mid', pos: { x: 4, y: 0 }, emoji: '🐀', name: 'Rat',
    hp: 40, maxHp: 40, attack: 3, defense: 0, speed: 1, engaged: true,
  };
}

function floorMap(): MapGrid {
  return [Array.from({ length: 6 }, () => ({ type: 'floor' as const, emoji: '⬜', seen: true, visible: true }))];
}

function plant(raw: Record<string, unknown>) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    player: { characterClass: '🧞‍♀️', stats: {} },
    map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
    ...raw,
  }));
}

function loadOk() {
  const loaded = loadGame();
  expect(loaded.kind).toBe('ok');
  if (loaded.kind !== 'ok') throw new Error('expected a migrated save');
  return loaded.state;
}

function abilityArgs(p: Player, toggle?: (which: GenieCastToggle) => void): ClassAbilityArgs {
  const noop = () => {};
  return {
    player: p,
    turn: 1,
    blinkTurn: -900,
    trailblazeTurn: -900,
    yeehawTurn: -900,
    rangerMode: 'ranged',
    wizardMode: 'nearest',
    stealthOn: false,
    applyWizardMode: noop,
    applyRangerMode: noop,
    handleCowboyTactics: noop,
    handleBlinkStrike: noop,
    applyNinjaMode: noop,
    handleBackdash: noop,
    handleLunge: noop,
    handleExecuteContract: noop,
    handleGuardianStance: noop,
    toggleGenieCast: toggle,
  };
}

function tacticsHtml(p: Player): string {
  const noop = () => {};
  return renderToStaticMarkup(createElement(TacticsMenu, {
    player: p,
    gameState: { turn: 10, stealthMode: false } as GameState,
    wizardTactics: { mode: 'nearest', manualTargetId: null },
    blinkTurn: -900,
    trailblazeTurn: -900,
    yeehawTurn: -900,
    autoStealth: false,
    rangerMode: 'ranged',
    applyWizardMode: noop,
    enterBlinkTargetMode: noop,
    applyNinjaMode: noop,
    toggleAutoStealth: noop,
    applyRangerMode: noop,
    handleCowboyTactics: noop,
    handleBackdash: noop,
    handleLunge: noop,
    handleExecuteContract: noop,
    handleGuardianStance: noop,
    onToggleGenieCast: noop,
    onClose: noop,
  }));
}

describe('genie cast toggles', () => {
  it('refuses a short cast with no HP cost when Bloodcast is off', () => {
    const dry = player({ characterClass: GENIE, genieBloodcast: false, stats: { mana: 0, hp: 20, maxHp: 20 } });
    const plan = planGenieCast(dry);
    expect(plan).toMatchObject({ canCast: false, hpSpent: 0, mpSpent: 0 });
    expect(plan.blockReason).toBe(bloodcastOffLog());

    const early = planGenieCast(player({
      characterClass: GENIE,
      genieBloodcast: false,
      stats: { mana: 1, level: 1, hp: 20, maxHp: 20 },
    }));
    expect(early.canCast).toBe(false);
    expect(early.hpSpent).toBe(0);
    expect(early.blockReason).toBe(bloodcastOffLog());

    const silent = planGenieCast(player({
      characterClass: GENIE,
      stats: { mana: 0, level: 1, hp: 20, maxHp: 20 },
    }));
    expect(silent.canCast).toBe(false);
    expect(silent.blockReason).toBeUndefined();

    const covered = planGenieCast(player({
      characterClass: GENIE,
      genieBloodcast: false,
      genieOverchannel: false,
      stats: { mana: GENIE_FIREBALL_MP },
    }));
    expect(covered).toMatchObject({ canCast: true, hpSpent: 0, mpSpent: GENIE_FIREBALL_MP, damageMult: 1, kind: 'fireball' });

    const logs: string[] = [];
    const volley = resolveGenieFireball({
      player: dry,
      enemies: [foe()],
      map: floorMap(),
      mode: 'nearest',
      manualTargetId: null,
      turn: 4,
      floor: 1,
      addLog: (text) => logs.push(text),
    });
    expect(volley.cast).toBe(false);
    expect(volley.player.stats.hp).toBe(20);
    expect(volley.player.stats.mana).toBe(0);
    expect(volley.enemies[0].hp).toBe(40);
    expect(logs).toEqual([bloodcastOffLog()]);
  });

  it('casts the 2 MP fireball at 100% when Overchannel is off', () => {
    const full = planGenieCast(player({
      characterClass: GENIE,
      genieOverchannel: false,
      stats: { mana: 6 },
    }));
    expect(full).toMatchObject({
      canCast: true,
      mpSpent: GENIE_FIREBALL_MP,
      hpSpent: 0,
      damageMult: 1,
      kind: 'fireball',
    });
    expect(full.damageMult).not.toBe(GENIE_OVERCHANNEL_MULT);

    const blood = planGenieCast(player({
      characterClass: GENIE,
      genieOverchannel: false,
      genieBloodcast: true,
      stats: { mana: 0, hp: 20, maxHp: 20 },
    }));
    expect(blood).toMatchObject({ canCast: true, hpSpent: 4, mpSpent: 0, damageMult: 1, kind: 'bloodcast' });

    const untouched = planGenieCast(player({ characterClass: GENIE, stats: { mana: 6 } }));
    expect(untouched.kind).toBe('overchannel');
    expect(untouched.damageMult).toBe(GENIE_OVERCHANNEL_MULT);
  });

  it('defaults both switches on and flips one at a time', () => {
    const fresh = player({ characterClass: GENIE });
    expect(genieBloodcastEnabled(fresh)).toBe(true);
    expect(genieOverchannelEnabled(fresh)).toBe(true);
    expect(genieSafeFireballEnabled(fresh)).toBe(false);
    const bloodOff = toggleGenieCast(fresh, 'bloodcast');
    expect(bloodOff.genieBloodcast).toBe(false);
    expect(genieOverchannelEnabled(bloodOff)).toBe(true);
    expect(toggleGenieCast(bloodOff, 'bloodcast').genieBloodcast).toBe(true);
    const overOff = toggleGenieCast(fresh, 'overchannel');
    expect(overOff.genieOverchannel).toBe(false);
    expect(genieBloodcastEnabled(overOff)).toBe(true);
    const safeOn = toggleGenieCast(fresh, 'safe');
    expect(safeOn.genieSafeFireball).toBe(true);
    expect(toggleGenieCast(safeOn, 'safe').genieSafeFireball).toBe(false);
  });

  it('migrates older saves to both on and keeps an explicit off', () => {
    plant({ schemaVersion: 1, player: { characterClass: '🧞‍♀️', stats: {} } });
    const fromV1 = loadOk();
    expect(fromV1.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(fromV1.player.genieBloodcast).toBe(true);
    expect(fromV1.player.genieOverchannel).toBe(true);
    expect(fromV1.player.genieSafeFireball).toBe(false);

    plant({ schemaVersion: 2, player: { characterClass: '🧞‍♀️' } });
    const fromV2 = loadOk();
    expect(fromV2.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(fromV2.player.genieBloodcast).toBe(true);
    expect(fromV2.player.genieOverchannel).toBe(true);
    expect(fromV2.player.genieSafeFireball).toBe(false);

    plant({
      schemaVersion: 2,
      player: { characterClass: '🧞‍♀️', genieBloodcast: false, genieOverchannel: false },
    });
    const kept = loadOk();
    expect(kept.player.genieBloodcast).toBe(false);
    expect(kept.player.genieOverchannel).toBe(false);
    saveGame(kept);
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as {
      schemaVersion: number;
      player: { genieBloodcast: boolean; genieOverchannel: boolean };
    };
    expect(raw.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(raw.player.genieBloodcast).toBe(false);
    expect(raw.player.genieOverchannel).toBe(false);
    const again = loadOk();
    expect(again.player.genieBloodcast).toBe(false);
    expect(again.player.genieOverchannel).toBe(false);

    plant({
      schemaVersion: 3,
      player: { characterClass: '🧞‍♀️', genieBloodcast: 'yes', genieOverchannel: false },
    });
    const scrubbed = loadOk();
    expect(scrubbed.player.genieBloodcast).toBe(true);
    expect(scrubbed.player.genieOverchannel).toBe(false);
    expect(scrubbed.player.genieSafeFireball).toBe(false);

    plant({
      schemaVersion: 3,
      player: { characterClass: '🧞‍♀️', genieSafeFireball: true },
    });
    const keptSafe = loadOk();
    expect(keptSafe.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(keptSafe.player.genieSafeFireball).toBe(true);
    saveGame(keptSafe);
    expect(loadOk().player.genieSafeFireball).toBe(true);
  });

  it('renders tappable On/Off switches in the genie tactics menu and on mobile', () => {
    const onHtml = tacticsHtml(player({ characterClass: GENIE, genieBloodcast: true, genieOverchannel: true }));
    expect(onHtml).toContain('data-testid="genie-bloodcast-toggle"');
    expect(onHtml).toContain('data-testid="genie-overchannel-toggle"');
    expect(onHtml).toContain('data-testid="genie-safe-toggle"');
    expect(onHtml).toContain('role="switch"');
    expect(onHtml).toContain('aria-checked="true"');
    expect(onHtml).toContain('aria-checked="false"');
    expect(onHtml).toContain('min-h-11');
    expect(onHtml).toContain('>On<');
    expect(onHtml).toContain('>Off<');
    expect(onHtml).toContain('5 Bloodcast · 6 Overchannel · 7 Safe · ESC or T to close');

    const allOn = tacticsHtml(player({ characterClass: GENIE, genieBloodcast: true, genieOverchannel: true, genieSafeFireball: true }));
    expect(allOn).toContain('data-testid="genie-safe-toggle"');
    expect(allOn).not.toContain('aria-checked="false"');

    const offHtml = tacticsHtml(player({ characterClass: GENIE, genieBloodcast: false, genieOverchannel: false }));
    expect(offHtml).toContain('aria-checked="false"');
    expect(offHtml).toContain('>Off<');
    expect(offHtml).not.toContain('aria-checked="true"');

    const wizardHtml = tacticsHtml(player({ characterClass: WIZARD }));
    expect(wizardHtml).not.toContain('genie-bloodcast-toggle');
    expect(wizardHtml).not.toContain('5 Bloodcast');

    let which: GenieCastToggle | null = null;
    const abilities = getClassAbilities(abilityArgs(player({ characterClass: GENIE }), (picked) => { which = picked; }));
    const blood = abilities.find(a => a.id === 'genie-bloodcast');
    const over = abilities.find(a => a.id === 'genie-overchannel');
    const safe = abilities.find(a => a.id === 'genie-safe');
    expect(blood).toMatchObject({ detail: 'On', active: true, roomy: true, disabled: false });
    expect(over).toMatchObject({ detail: 'On', active: true, roomy: true });
    expect(safe).toMatchObject({ detail: 'Off', active: false, roomy: true, label: 'Safe' });
    blood?.onUse();
    expect(which).toBe('bloodcast');
    over?.onUse();
    expect(which).toBe('overchannel');
    safe?.onUse();
    expect(which).toBe('safe');

    const offAbilities = getClassAbilities(abilityArgs(player({
      characterClass: GENIE,
      genieBloodcast: false,
      genieOverchannel: false,
    })));
    expect(offAbilities.find(a => a.id === 'genie-bloodcast')?.detail).toBe('Off');
    expect(offAbilities.find(a => a.id === 'genie-overchannel')?.active).toBe(false);
    expect(getClassAbilities(abilityArgs(player({ characterClass: WIZARD }))).map(a => a.id)).toEqual(['wizard-blink', 'wizard-aim']);

    const hud = renderToStaticMarkup(createElement(AbilityButtons, { abilities, align: 'right' }));
    expect(hud).toContain('data-testid="ability-genie-bloodcast"');
    expect(hud).toContain('min-h-11');
    expect(hud).toContain('>On<');

    const sheet = renderToStaticMarkup(createElement(ActionsMenu, {
      general: [],
      abilities,
      onOpenTactics: () => {},
      onOpenGoto: () => {},
      onClose: () => {},
    }));
    expect(sheet).toContain('Bloodcast');
    expect(sheet).toContain('Overchannel');
    expect(sheet).toContain('>Safe<');
    expect(sheet).toContain('min-h-11');

    const detail = CHARACTER_CLASSES[GENIE].passives.find(p => p.label === 'Overchannel / Bloodcast')?.detail ?? '';
    expect(detail).toContain('Both start on');
    expect(detail).toContain('spends no HP');
    const fireball = CHARACTER_CLASSES[GENIE].passives.find(p => p.label === 'Fireball')?.detail ?? '';
    expect(fireball).toContain('inside that 3×3');
    expect(fireball).toContain('starts off');
    expect(fireball).not.toContain('even at range');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('5 toggles Bloodcast and 6 toggles Overchannel (both start on). 7 toggles Safe fireballs (starts off)');
  });

  it('melees instead of splashing when Safe fireballs is on', () => {
    expect(tileInFireball({ x: 3, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(tileInFireball({ x: 3, y: 0 }, { x: 2, y: 0 })).toBe(true);
    expect(safeFireballResponse({ x: 0, y: 0 }, { x: 3, y: 0 }, true)).toBe('cast');
    expect(safeFireballResponse({ x: 2, y: 0 }, { x: 3, y: 0 }, false)).toBe('cast');
    expect(safeFireballResponse({ x: 2, y: 0 }, { x: 3, y: 0 }, true)).toBe('melee');
    expect(safeFireballResponse({ x: 3, y: 0 }, { x: 3, y: 0 }, true)).toBe('block');
    expect(safeFireballLog(false)).toContain('splash would hit you');
    expect(safeFireballLog(false)).not.toContain('Melee');

    const map: MapGrid = [Array.from({ length: 8 }, () => ({ type: 'floor' as const, emoji: '⬜', seen: true, visible: true }))];
    const stats = { mana: 6, maxMana: 6, hp: 20, maxHp: 20, attack: 8, defense: 0, speed: 1, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0 };
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const logs: string[] = [];
    const melee = resolveGenieFireball({
      player: player({ characterClass: GENIE, pos: { x: 3, y: 0 }, genieSafeFireball: true, stats }),
      enemies: [{ ...foe(), pos: { x: 4, y: 0 } }],
      map,
      mode: 'nearest',
      manualTargetId: null,
      turn: 5,
      floor: 1,
      addLog: (text) => logs.push(text),
    });
    random.mockRestore();
    expect(melee.cast).toBe(false);
    expect(melee.meleeFallback).toBe(true);
    expect(melee.player.stats.mana).toBe(6);
    expect(melee.enemies[0].hp).toBeLessThan(40);
    expect(logs).toContain(safeFireballLog(true));
    expect(logs.some(line => line.includes('Fireball'))).toBe(false);

    const held: string[] = [];
    const blocked = resolveGenieFireball({
      player: player({ characterClass: GENIE, pos: { x: 4, y: 0 }, genieSafeFireball: true, stats }),
      enemies: [{ ...foe(), pos: { x: 4, y: 0 } }],
      map,
      mode: 'nearest',
      manualTargetId: null,
      turn: 6,
      floor: 1,
      addLog: (text) => held.push(text),
    });
    expect(blocked.cast).toBe(false);
    expect(blocked.meleeFallback).toBeUndefined();
    expect(blocked.player.stats.hp).toBe(20);
    expect(blocked.player.stats.mana).toBe(6);
    expect(blocked.enemies[0].hp).toBe(40);
    expect(held).toEqual([safeFireballLog(false)]);
  });
});
