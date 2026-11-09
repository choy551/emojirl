import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerStats } from './types';
import { BlinkTalentModal } from '../components/BlinkTalentModal';
import {
  BLINK_T3_RESPEC_NOTE,
  BLINK_TALENT_CREDITS_PER_TIER,
  BLINK_TALENTS,
  LONGER_CHAIN_MIGRATION_LOG,
  blinkT3RespecOffer,
  blinkTalentAvailability,
  blinkTalentOffersEarned,
  blinkTalentPrompt,
  blinkTokensHeld,
  blinkTokensSpent,
  grantBlinkT3Respec,
  legacyBlinkRunNeedsT3Respec,
  migrateLegacyBlinkTalents,
} from './blinkStrike';
import { SAVE_KEY, SAVE_SCHEMA_VERSION, loadGame, saveGame } from './save';

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

function plant(raw: Record<string, unknown>) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    player: { characterClass: '🥷', stats: {} },
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

describe('legacy blink talent ids', () => {
  it('replaces Longer Chain in place and drops unknown ids', () => {
    expect(migrateLegacyBlinkTalents(['shorter-cd', 'longer-chain', 'twin-strike']))
      .toEqual(['shorter-cd', 'heavier-blink', 'twin-strike']);
    expect(migrateLegacyBlinkTalents(['lifesteal', 'longer-chain', 'endless-chain']))
      .toEqual(['lifesteal', 'heavier-blink', 'endless-chain']);
    expect(migrateLegacyBlinkTalents(['longer-chain', 'heavier-blink'])).toEqual(['heavier-blink']);
    expect(migrateLegacyBlinkTalents(['nope', 'shorter-cd'])).toEqual(['shorter-cd']);
    expect(migrateLegacyBlinkTalents(['longer-chain'])).toEqual(['heavier-blink']);
    expect(migrateLegacyBlinkTalents(undefined)).toBeUndefined();
    expect(migrateLegacyBlinkTalents([])).toBeUndefined();

    const once = migrateLegacyBlinkTalents(['longer-chain', 'twin-strike']);
    expect(migrateLegacyBlinkTalents(once)).toEqual(once);
  });

  it('asks for a new Tier 3 only when a Ninja already owned a moved Tier 3', () => {
    expect(legacyBlinkRunNeedsT3Respec('🥷', ['shorter-cd', 'longer-chain', 'twin-strike'])).toBe(true);
    expect(legacyBlinkRunNeedsT3Respec('🥷', ['endless-chain'])).toBe(true);
    expect(legacyBlinkRunNeedsT3Respec('🥷', ['longer-chain', 'flowing-strikes'])).toBe(false);
    expect(legacyBlinkRunNeedsT3Respec('🥷', ['overkill'])).toBe(false);
    expect(legacyBlinkRunNeedsT3Respec('🧙', ['twin-strike', 'longer-chain'])).toBe(false);
    expect(legacyBlinkRunNeedsT3Respec('🥷', undefined)).toBe(false);
  });
});

describe('v1 save migration', () => {
  it('swaps Longer Chain, keeps the old Tier 3, and flags one respec for a Ninja', () => {
    plant({
      schemaVersion: 1,
      turn: 12,
      logs: [{ id: 'old', text: 'earlier', turn: 11 }],
      player: {
        characterClass: '🥷',
        stats: { blinkTalents: ['shorter-cd', 'longer-chain', 'twin-strike'], blinkStrikeCredits: 132 },
      },
    });
    const state = loadOk();
    expect(state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(state.player.stats.blinkTalents).toEqual(['shorter-cd', 'heavier-blink', 'twin-strike']);
    expect(state.blinkT3RespecPending).toBe(true);
    expect(state.logs[0]).toMatchObject({ text: LONGER_CHAIN_MIGRATION_LOG, turn: 12 });
    expect(state.logs[1]?.text).toBe('earlier');
  });

  it('swaps Longer Chain with no prompt when no Tier 3 was picked', () => {
    plant({
      schemaVersion: 1,
      player: { characterClass: '🥷', stats: { blinkTalents: ['longer-chain'] } },
    });
    const state = loadOk();
    expect(state.player.stats.blinkTalents).toEqual(['heavier-blink']);
    expect(state.blinkT3RespecPending).toBeUndefined();
    expect(state.logs.map(log => log.text)).toContain(LONGER_CHAIN_MIGRATION_LOG);
  });

  it('flags a respec when the moved Tier 3 is still owned and Longer Chain was not', () => {
    plant({
      schemaVersion: 1,
      player: { characterClass: '🥷', stats: { blinkTalents: ['flowing-strikes', 'twin-strike'] } },
    });
    const state = loadOk();
    expect(state.player.stats.blinkTalents).toEqual(['flowing-strikes', 'twin-strike']);
    expect(state.blinkT3RespecPending).toBe(true);
    expect(state.logs.map(log => log.text)).not.toContain(LONGER_CHAIN_MIGRATION_LOG);
  });

  it('swaps Longer Chain for other classes without a Ninja prompt or log', () => {
    plant({
      schemaVersion: 1,
      player: { characterClass: '🧙', stats: { blinkTalents: ['longer-chain', 'twin-strike'] } },
    });
    const state = loadOk();
    expect(state.player.stats.blinkTalents).toEqual(['heavier-blink', 'twin-strike']);
    expect(state.blinkT3RespecPending).toBeUndefined();
    expect(state.logs.map(log => log.text)).not.toContain(LONGER_CHAIN_MIGRATION_LOG);
    expect(blinkTalentPrompt({
      characterClass: state.player.characterClass,
      credits: 400,
      talents: state.player.stats.blinkTalents,
      respecPending: state.blinkT3RespecPending,
    })).toBeNull();
  });

  it('shows the prompt again if the run is saved before the pick, and only once', () => {
    plant({
      schemaVersion: 1,
      turn: 4,
      player: {
        characterClass: '🥷',
        stats: { blinkTalents: ['shorter-cd', 'longer-chain', 'endless-chain'] },
      },
    });
    const first = loadOk();
    saveGame(first);
    const second = loadOk();
    expect(second.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(second.blinkT3RespecPending).toBe(true);
    expect(second.player.stats.blinkTalents).toEqual(['shorter-cd', 'heavier-blink', 'endless-chain']);
    expect(second.logs.filter(log => log.text === LONGER_CHAIN_MIGRATION_LOG)).toHaveLength(1);

    const picked = grantBlinkT3Respec(second.player.stats, 'overkill');
    expect(picked?.blinkTalents).toEqual(['shorter-cd', 'heavier-blink', 'endless-chain', 'overkill']);
    saveGame({
      ...second,
      blinkT3RespecPending: undefined,
      player: { ...second.player, stats: picked! },
    });
    const third = loadOk();
    expect(third.blinkT3RespecPending).toBeUndefined();
    expect(third.player.stats.blinkTalents).toEqual(['shorter-cd', 'heavier-blink', 'endless-chain', 'overkill']);
    expect(third.logs.filter(log => log.text === LONGER_CHAIN_MIGRATION_LOG)).toHaveLength(1);
  });

  it('does not arm the prompt for a version 2 save that already owns Twin Strike', () => {
    plant({
      schemaVersion: 2,
      player: { characterClass: '🥷', stats: { blinkTalents: ['twin-strike'] } },
    });
    const state = loadOk();
    expect(state.blinkT3RespecPending).toBeUndefined();
    expect(state.player.stats.blinkTalents).toEqual(['twin-strike']);

    plant({
      schemaVersion: 2,
      blinkT3RespecPending: false,
      player: { characterClass: '🥷', stats: { blinkTalents: ['endless-chain'] } },
    });
    expect(loadOk().blinkT3RespecPending).toBeUndefined();
  });

  it('loads a v1 save whose talent list is missing or not an array', () => {
    plant({ schemaVersion: 1, player: { characterClass: '🥷', stats: { blinkTalents: 'longer-chain' } } });
    const junk = loadOk();
    expect(junk.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(junk.player.stats.blinkTalents).toBeUndefined();
    expect(junk.blinkT3RespecPending).toBeUndefined();

    plant({ schemaVersion: 1, player: { characterClass: '🥷' } });
    const empty = loadOk();
    expect(empty.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(empty.player.stats.blinkTalents).toBeUndefined();
    expect(empty.blinkT3RespecPending).toBeUndefined();
  });
});

describe('one-time Tier 3 respec', () => {
  const owned = ['shorter-cd', 'heavier-blink', 'twin-strike'] as const;

  it('offers only the new Tier 3 talents while the flag is set', () => {
    expect(blinkT3RespecOffer(false, [...owned])).toBeNull();
    expect(blinkT3RespecOffer(undefined, [...owned])).toBeNull();
    const offer = blinkT3RespecOffer(true, [...owned]);
    expect(offer?.tierLabel).toBe('T3');
    expect(offer?.note).toBe(BLINK_T3_RESPEC_NOTE);
    expect(offer?.choices.map(choice => choice.id)).toEqual(['overkill', 'blink-truestrike']);
  });

  it('shows the respec before an already-earned talent offer', () => {
    const prompt = blinkTalentPrompt({
      characterClass: '🥷',
      credits: 176,
      talents: [...owned],
      respecPending: true,
    });
    expect(prompt?.kind).toBe('respec');
    expect(prompt?.choices.map(choice => choice.id)).toEqual(['overkill', 'blink-truestrike']);
    expect(blinkTalentPrompt({
      characterClass: '🥷',
      credits: 0,
      talents: [],
    })).toBeNull();
  });

  it('keeps the old Tier 4 pick and does not spend an earned offer', () => {
    const pendingBefore = blinkTalentOffersEarned(176) - owned.length;
    expect(pendingBefore).toBe(1);
    const picked = grantBlinkT3Respec(
      { blinkTalents: [...owned], blinkStrikeCredits: 176 } as PlayerStats,
      'overkill',
    );
    expect(picked?.blinkTalents).toEqual([...owned, 'overkill']);
    expect(picked?.blinkStrikeCredits).toBe(176 + 3 * BLINK_TALENT_CREDITS_PER_TIER);
    expect(blinkTokensHeld(picked!.blinkStrikeCredits!, picked!.blinkTalents)).toBe(blinkTokensHeld(176, [...owned]));
    const followUp = blinkTalentPrompt({
      characterClass: '🥷',
      credits: picked!.blinkStrikeCredits!,
      talents: picked!.blinkTalents,
      respecPending: false,
    });
    expect(followUp).toBeNull();

    const quiet = grantBlinkT3Respec(
      { blinkTalents: [...owned], blinkStrikeCredits: 150 } as PlayerStats,
      'blink-truestrike',
    );
    expect(quiet?.blinkStrikeCredits).toBe(150 + 3 * BLINK_TALENT_CREDITS_PER_TIER);
    expect(blinkTalentAvailability(quiet!.blinkStrikeCredits!, quiet!.blinkTalents, BLINK_TALENTS.find(t => t.id === 'overkill')!)).not.toBe('buy');

    expect(grantBlinkT3Respec({ blinkTalents: [...owned] } as PlayerStats, 'twin-strike')).toBeNull();
  });

  it('renders the one-time note above the token shop', () => {
    const html = renderToStaticMarkup(
      <BlinkTalentModal
        earned={4}
        held={1}
        progressLabel="0/44"
        rows={blinkT3RespecOffer(true, [...owned])!.choices.map(talent => ({ talent, state: 'buy' as const }))}
        note={BLINK_T3_RESPEC_NOTE}
        onBuy={() => {}}
      />,
    );
    expect(html).toContain('data-testid="blink-t3-respec-note"');
    expect(html).toContain('Your old pick stays');
    expect(html).toContain('This prompt is shown once');
    expect(html).toContain('data-testid="blink-talent-overkill"');
    expect(html).toContain('data-testid="blink-talent-blink-truestrike"');
    expect(html).toContain('1 held · 4 earned');
  });
});

describe('talent token save migration', () => {
  it('keeps owned talents and clamps held to 0 when they cost more than earned', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
      },
    });
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 8,
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
      player: {
        characterClass: '🥷',
        ammo: 0,
        stats: {
          blinkStrikeCredits: 100,
          blinkTalents: ['shorter-cd', 'heavier-blink', 'twin-strike'],
        },
        inventory: [],
        bank: [],
        equipment: {},
      },
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.schemaVersion).toBe(9);
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    const stats = loaded.state.player.stats;
    expect(stats.blinkStrikeCredits).toBe(100);
    expect(stats.blinkTalents).toEqual(['shorter-cd', 'heavier-blink', 'twin-strike']);
    expect(blinkTokensSpent(stats.blinkTalents)).toBe(1 + 2 + 4);
    expect(blinkTokensHeld(stats.blinkStrikeCredits!, stats.blinkTalents)).toBe(0);
    expect(100 % BLINK_TALENT_CREDITS_PER_TIER).toBe(12);
  });
});
