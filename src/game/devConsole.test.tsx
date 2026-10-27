import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState, Tile } from './types';
import { EMOJI_POWERS } from './emojis';
import { SAVE_KEY, SAVE_SCHEMA_VERSION, loadGame } from './save';
import {
  CHEAT_CONFIRM_TEXT,
  DEV_CONSOLE_GAP,
  DEV_CONSOLE_HELP,
  DEV_CONSOLE_STRIP,
  QUIT_CONFIRM_TEXT,
  appendDevLogs,
  applyConfirmedCheat,
  applyQuit,
  applyStuck,
  consoleStack,
  devConsoleOpensOnEnter,
  isBlankConsoleDraft,
  parseDevCommand,
  scoreCountsForLeaderboard,
  type DevConsoleEnterBlockers,
} from './devConsole';
import { DevConsoleBar, DevConsoleConfirm } from '../components/DevConsole';

function floor(w: number, h: number): Tile[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ type: 'floor' as const, emoji: '⬜', seen: true, visible: true })),
  );
}

function wallAt(map: Tile[][], x: number, y: number) {
  map[y][x] = { type: 'wall', emoji: '⬛', seen: true, visible: true };
}

function bare(partial: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    player: {
      pos: { x: 1, y: 1 },
      emoji: '🧝',
      characterClass: '🧝',
      ammo: 0,
      stats: {
        hp: 20, maxHp: 20, attack: 2, defense: 0, speed: 1, evasion: 0, luck: 0,
        level: 1, xp: 0, moodValue: 0, gold: 10,
      },
      inventory: [],
      bank: [],
      equipment: {},
    },
    currentFloor: 2,
    map: floor(6, 4),
    enemies: [],
    items: [],
    turn: 1,
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
    ...partial,
  };
}

const idleEnter: DevConsoleEnterBlockers = {
  bagOpen: false,
  blinkTarget: false,
  unmakeTarget: false,
  interactTile: false,
  logOpen: false,
  menuOpen: false,
  directionPick: false,
  consoleOpen: false,
  gameOver: false,
};

describe('dev console Enter', () => {
  it('opens only when Enter is not already doing something else', () => {
    expect(devConsoleOpensOnEnter(idleEnter)).toBe(true);
    for (const flag of [
      'bagOpen',
      'blinkTarget',
      'unmakeTarget',
      'interactTile',
      'logOpen',
      'menuOpen',
      'directionPick',
      'consoleOpen',
      'gameOver',
    ] as const) {
      expect(devConsoleOpensOnEnter({ ...idleEnter, [flag]: true })).toBe(false);
    }
  });

  it('treats a blank prompt as a close, and keeps a command', () => {
    expect(isBlankConsoleDraft('')).toBe(true);
    expect(isBlankConsoleDraft('   ')).toBe(true);
    expect(isBlankConsoleDraft('/help')).toBe(false);
  });
});

describe('console strip under the combat log', () => {
  const chrome = 'calc(10rem + env(safe-area-inset-bottom, 0px))';

  function expectClearOfLog(opts: Parameters<typeof consoleStack>[0]) {
    const placed = consoleStack({ ...opts, consoleOpen: true });
    expect(placed.bar).not.toBeNull();
    expect(placed.bar!.height).toBe(DEV_CONSOLE_STRIP);
    expect(placed.logBottom).toBe(`calc(${placed.bar!.bottom} + ${DEV_CONSOLE_STRIP} + ${DEV_CONSOLE_GAP})`);
    expect(placed.logBottom).not.toBe(placed.bar!.bottom);
  }

  it('reserves a row under the desktop log', () => {
    const closed = consoleStack({ consoleOpen: false, mobile: false, oneHanded: false, thumbSide: 'right', chromeBottom: chrome });
    expect(closed.bar).toBeNull();
    expect(closed.logBottom).toBe('1rem');
    expectClearOfLog({ consoleOpen: true, mobile: false, oneHanded: false, thumbSide: 'right', chromeBottom: chrome });
    const open = consoleStack({ consoleOpen: true, mobile: false, oneHanded: false, thumbSide: 'right', chromeBottom: chrome });
    expect(open.bar).toMatchObject({ left: '0.75rem', right: '0.75rem', bottom: '1rem' });
  });

  it('reserves a row under the mobile log, including one-handed', () => {
    expectClearOfLog({ consoleOpen: true, mobile: true, oneHanded: false, thumbSide: 'right', chromeBottom: chrome });
    const twoHand = consoleStack({ consoleOpen: true, mobile: true, oneHanded: false, thumbSide: 'right', chromeBottom: chrome });
    expect(twoHand.bar).toMatchObject({ bottom: chrome, left: '0.5rem', right: '0.5rem' });

    const oneHand = consoleStack({ consoleOpen: true, mobile: true, oneHanded: true, thumbSide: 'left', chromeBottom: chrome });
    expect(oneHand.logBottom).toBe(`calc(${oneHand.bar!.bottom} + ${DEV_CONSOLE_STRIP} + ${DEV_CONSOLE_GAP})`);
    expect(oneHand.bar).toMatchObject({ left: '9.25rem', right: '0.5rem' });
  });

  it('places the prompt in that row instead of over the viewport bottom', () => {
    const html = renderToStaticMarkup(
      <DevConsoleBar
        placement={{ bottom: '1rem', height: DEV_CONSOLE_STRIP, left: '0.75rem', right: '0.75rem' }}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('style="bottom:1rem;height:');
    expect(html).toContain(`height:${DEV_CONSOLE_STRIP}`);
    expect(html).not.toContain('inset-x-0');
    expect(html).not.toContain('bottom-0');
  });
});

describe('dev console commands', () => {
  it('parses the slash commands without case sensitivity', () => {
    expect(parseDevCommand(' /QUIT ')).toEqual({ kind: 'quit' });
    expect(parseDevCommand('/stuck')).toEqual({ kind: 'stuck' });
    expect(parseDevCommand('/help')).toEqual({ kind: 'help' });
    expect(parseDevCommand('/Impulse101')).toEqual({ kind: 'impulse101' });
    expect(parseDevCommand('/877cashnow')).toEqual({ kind: 'cash' });
    expect(parseDevCommand('quit')).toEqual({ kind: 'unknown' });
  });

  it('lists every command from /help', () => {
    const next = appendDevLogs(bare(), DEV_CONSOLE_HELP);
    const text = next.logs.map(log => log.text).join('\n');
    expect(text).toContain('/quit');
    expect(text).toContain('/stuck');
    expect(text).toContain('/impulse101');
    expect(text).toContain('/877cashnow');
    expect(text).toContain('/help');
    expect(next.scoreInvalid).toBeUndefined();
  });

  it('records /quit as a death without invalidating high scores', () => {
    const next = applyQuit(bare());
    expect(next.gameOver).toBe(true);
    expect(next.victory).toBe(false);
    expect(next.scoreInvalid).toBeUndefined();
    expect(scoreCountsForLeaderboard(next)).toBe(true);
  });

  it('does not apply a cheat until the warning is confirmed', () => {
    const start = bare();
    expect(CHEAT_CONFIRM_TEXT.toLowerCase()).toContain('invalidate the run for high scores');
    expect(start.player.stats.gold).toBe(10);
    expect(scoreCountsForLeaderboard(start)).toBe(true);
  });

  it('gives 877 gold and excludes the run after confirmation', () => {
    const next = applyConfirmedCheat(bare(), 'cash');
    expect(next.player.stats.gold).toBe(887);
    expect(next.scoreInvalid).toBe(true);
    expect(scoreCountsForLeaderboard(next)).toBe(false);
  });

  it('gives one of every hotbar emoji and banks whatever does not fit', () => {
    const next = applyConfirmedCheat(bare(), 'impulse101');
    const held = [...next.player.inventory, ...next.player.bank];
    expect(new Set(held.map(item => item.emoji))).toEqual(new Set(EMOJI_POWERS.map(power => power.emoji)));
    expect(held).toHaveLength(EMOJI_POWERS.length);
    expect(next.player.inventory.length).toBeLessThanOrEqual(9);
    expect(next.player.bank.length).toBeGreaterThan(0);
    expect(next.scoreInvalid).toBe(true);
  });

  it('banks the whole grant when the hotbar is already full', () => {
    const inventory = Array.from({ length: 9 }, (_, i) => ({
      id: `full-${i}`,
      emoji: '🧪',
      name: 'Tonic',
      description: 'filler',
      consumed: false,
    }));
    const next = applyConfirmedCheat(bare({ player: { ...bare().player, inventory } }), 'impulse101');
    expect(next.player.inventory).toHaveLength(9);
    expect(next.player.bank).toHaveLength(EMOJI_POWERS.length);
  });

  it('teleports to the nearest tile that can reach the downstairs', () => {
    const map = floor(7, 5);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 7; x++) wallAt(map, x, y);
    }
    map[1][1] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    for (let y = 1; y <= 3; y++) {
      for (let x = 3; x <= 5; x++) map[y][x] = { type: 'floor', emoji: '⬜', seen: true, visible: true };
    }
    map[2][4] = { type: 'stairs', emoji: '🕳️', seen: true, visible: true };
    const start = bare({ map, player: { ...bare().player, pos: { x: 1, y: 1 } } });
    const next = applyStuck(start);
    expect(next.player.pos).toEqual({ x: 3, y: 1 });
    expect(next.scoreInvalid).toBeUndefined();
    expect(next.logs[0].text).toContain('Teleported');
  });

  it('leaves a player who can already reach the downstairs where they are', () => {
    const map = floor(4, 3);
    map[1][3] = { type: 'stairs', emoji: '🕳️', seen: true, visible: true };
    const start = bare({ map, player: { ...bare().player, pos: { x: 1, y: 1 } } });
    const next = applyStuck(start);
    expect(next.player.pos).toEqual({ x: 1, y: 1 });
    expect(next.logs[0].text).toContain('already reach');
    expect(next.scoreInvalid).toBeUndefined();
  });

  it('shows the quit confirmation sentence', () => {
    const html = renderToStaticMarkup(
      <DevConsoleConfirm text={QUIT_CONFIRM_TEXT} yesLabel="Quit without Saving" onYes={() => {}} onNo={() => {}} />,
    );
    expect(html).toContain('Are you sure you want to Quit without Saving?');
    expect(html).toContain('min-h-11');
  });
});

describe('scoreInvalid migration', () => {
  beforeEach(() => {
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
  });
  afterEach(() => {
    localStorage.removeItem(SAVE_KEY);
  });

  it('keeps an older save eligible for high scores', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 4,
      player: { characterClass: '🧝', stats: { gold: 40 } },
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.state.scoreInvalid).toBe(false);
    expect(scoreCountsForLeaderboard(loaded.state)).toBe(true);
    expect(loaded.state.player.stats.gold).toBe(40);
  });

  it('preserves an already invalidated run', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 4,
      scoreInvalid: true,
      player: { characterClass: '🧝', stats: {} },
      map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.scoreInvalid).toBe(true);
    expect(scoreCountsForLeaderboard(loaded.state)).toBe(false);
  });
});
