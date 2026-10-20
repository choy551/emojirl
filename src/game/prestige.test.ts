import { beforeEach, describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from './classes';
import { canEquipItem } from '../components/itemUtils';
import { claimFinaleWin } from './finale';
import { FINALE_FLOOR } from './finaleConstants';
import { classSelectEntries, prestigeUnlockHint, resolveVesselChoice, unlockHintFor } from './classSelect';
import { loadMeta, recordPrestigeWin, setMetaStore, type KeyValueStore } from './meta';
import { resolveCombat } from './combat';
import {
  classFlies,
  contractGold,
  executeStrike,
  fencerCritBonus,
  fencerEvasion,
  fireballBlastDamage,
  gunshotPlan,
  planGenieCast,
  royalMeleeMultiplier,
  selfSplashDamage,
  startFloorContract,
  tilesInRadius,
} from './prestige';
import {
  CLASS_SELECT_ORDER,
  FENCER,
  FENCER_CRIT_AT_FULL,
  FENCER_EVA_AT_EMPTY,
  GENIE,
  GENIE_FIREBALL_MP,
  GENIE_OVERCHANNEL_LEVEL,
  GENIE_SELF_SPLASH,
  HITMAN,
  HITMAN_CONTRACT_KILLS,
  HITMAN_DUAL_MULT,
  HITMAN_EXECUTE_HP_PCT,
  HITMAN_SINGLE_MULT,
  ROYAL_GUARD,
  ROYAL_SWORD_MELEE_MULT,
  VOID,
  VOID_UNLOCK_HINT,
  VOID_UNLOCK_KEY,
  WIZARD,
} from './prestigeConstants';
import { resolveGenieFireball } from './prestigeCast';
import type { Enemy, MapGrid, Player } from './types';

function memStore(): KeyValueStore & { dump: Map<string, string> } {
  const dump = new Map<string, string>();
  return {
    dump,
    getItem: (k) => dump.get(k) ?? null,
    setItem: (k, v) => { dump.set(k, v); },
    removeItem: (k) => { dump.delete(k); },
  };
}

function player(partial: Partial<Player> & { characterClass: string }): Player {
  return {
    pos: { x: 2, y: 2 },
    emoji: partial.characterClass,
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: {},
    ...partial,
    stats: {
      hp: 10, maxHp: 10, attack: 4, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0, mana: 6, maxMana: 6,
      ...partial.stats,
    },
  };
}

function foe(partial: Partial<Enemy> = {}): Enemy {
  return {
    id: 'e', pos: { x: 4, y: 2 }, emoji: '🐀', name: 'Rat',
    hp: 20, maxHp: 20, attack: 3, defense: 0, speed: 1, engaged: true,
    ...partial,
  };
}

function floorMap(): MapGrid {
  return [Array.from({ length: 6 }, () => ({ type: 'floor' as const, emoji: '⬜', seen: true, visible: true }))];
}

beforeEach(() => {
  setMetaStore(memStore());
});

describe('class select', () => {
  it('lists every base class, the four prestige classes, and The Void', () => {
    const entries = classSelectEntries();
    expect(entries.map(e => e.emoji)).toEqual([...CLASS_SELECT_ORDER]);
    expect(entries.filter(e => e.unlocked).map(e => e.emoji)).toEqual(['🧙', '🥷', '🧝', '🤠']);
    expect(entries.find(e => e.emoji === GENIE)?.hint).toBe('Win D:27 as 🧙 Wizard to unlock');
    expect(entries.find(e => e.emoji === FENCER)?.hint).toBe(prestigeUnlockHint('🥷'));
    expect(entries.find(e => e.emoji === HITMAN)?.hint).toBe('Win D:27 as 🤠 Cowboy to unlock');
    expect(entries.find(e => e.emoji === ROYAL_GUARD)?.hint).toBe('Win D:27 as 🧝 Ranger to unlock');
    expect(unlockHintFor(VOID)).toBe(VOID_UNLOCK_HINT);
    expect(entries.find(e => e.emoji === VOID)?.hint).toBe('Die to Void damage to unlock');
  });

  it('a locked tap does not change the vessel', () => {
    const locked = resolveVesselChoice(WIZARD, GENIE);
    expect(locked.showHint).toBe(true);
    expect(locked.selected).toBe(WIZARD);
    expect(locked.hint).toBe('Win D:27 as 🧙 Wizard to unlock');
    recordPrestigeWin(WIZARD);
    const open = resolveVesselChoice(WIZARD, GENIE);
    expect(open.showHint).toBe(false);
    expect(open.selected).toBe(GENIE);
  });

  it('unlocks The Void from the same flag as the Void slice', () => {
    expect(resolveVesselChoice(WIZARD, VOID).showHint).toBe(true);
    const store = memStore();
    store.setItem(VOID_UNLOCK_KEY, '1');
    setMetaStore(store);
    expect(resolveVesselChoice(WIZARD, VOID)).toEqual({ selected: VOID, showHint: false, hint: null });
  });
});

describe('D:27 prestige unlock', () => {
  it('persists the prestige class for the winning base class only', () => {
    const store = memStore();
    setMetaStore(store);
    const won = claimFinaleWin({
      player: player({ characterClass: WIZARD }),
      currentFloor: 26,
      gameOver: false,
      victory: false,
      logs: [],
      turn: 3,
    } as never);
    expect(won.victory).toBe(true);
    expect(won.currentFloor).toBe(FINALE_FLOOR);
    expect(won.logs[0].text).toContain('🧞‍♀️ Genie unlocked');
    expect(loadMeta().unlockedPrestige).toEqual([GENIE]);
    const again = recordPrestigeWin(WIZARD);
    expect(again.fresh).toBe(false);
    recordPrestigeWin(GENIE);
    expect(loadMeta().unlockedPrestige).toEqual([GENIE]);
    recordPrestigeWin('🤠');
    expect(loadMeta().unlockedPrestige).toEqual([GENIE, HITMAN]);
  });
});

describe('prestige kits', () => {
  it('keeps ranged classes at 3 passives and the fencer at 4, each with an active', () => {
    for (const emoji of [GENIE, HITMAN, ROYAL_GUARD]) {
      expect(CHARACTER_CLASSES[emoji].passives).toHaveLength(3);
      expect(CHARACTER_CLASSES[emoji].active?.label).toBeTruthy();
    }
    expect(CHARACTER_CLASSES[FENCER].passives).toHaveLength(4);
    expect(CHARACTER_CLASSES[FENCER].active?.label).toBe('Footwork');
    expect(CHARACTER_CLASSES[VOID].name).toBe('The Void');
  });

  it('plans genie fireball, overchannel, and bloodcast from mana and level', () => {
    const broke = planGenieCast(player({ characterClass: GENIE, stats: { mana: 1, level: 1, hp: 10, maxHp: 10, attack: 4, defense: 0, speed: 1, evasion: 0, luck: 0, xp: 0, moodValue: 0, gold: 0 } }));
    expect(broke.canCast).toBe(false);
    const cast = planGenieCast(player({ characterClass: GENIE, stats: { mana: GENIE_FIREBALL_MP, level: 1, hp: 10, maxHp: 10, attack: 4, defense: 0, speed: 1, evasion: 0, luck: 0, xp: 0, moodValue: 0, gold: 0 } }));
    expect(cast).toMatchObject({ canCast: true, mpSpent: GENIE_FIREBALL_MP, kind: 'fireball' });
    const over = planGenieCast(player({ characterClass: GENIE, stats: { mana: 4, level: GENIE_OVERCHANNEL_LEVEL, hp: 10, maxHp: 10, attack: 4, defense: 0, speed: 1, evasion: 0, luck: 0, xp: 0, moodValue: 0, gold: 0 } }));
    expect(over.kind).toBe('overchannel');
    expect(over.damageMult).toBeGreaterThan(1);
    const blood = planGenieCast(player({ characterClass: GENIE, stats: { mana: 0, level: GENIE_OVERCHANNEL_LEVEL, hp: 20, maxHp: 20, attack: 4, defense: 0, speed: 1, evasion: 0, luck: 0, xp: 0, moodValue: 0, gold: 0 } }));
    expect(blood.kind).toBe('bloodcast');
    expect(blood.hpSpent).toBeGreaterThan(0);
    expect(tilesInRadius({ x: 3, y: 3 }, 1)).toHaveLength(9);
    const blast = fireballBlastDamage(8, 0, 1);
    expect(selfSplashDamage(blast)).toBe(Math.max(1, Math.round(blast * GENIE_SELF_SPLASH)));
  });

  it('hits the 3×3 and splashes the caster', () => {
    const map = floorMap();
    const center = foe({ id: 'mid', pos: { x: 4, y: 0 }, hp: 40, maxHp: 40, defense: 0 });
    const beside = foe({ id: 'side', pos: { x: 5, y: 0 }, hp: 30, maxHp: 30 });
    const far = foe({ id: 'far', pos: { x: 0, y: 0 }, hp: 30, maxHp: 30 });
    const caster = player({ characterClass: GENIE, pos: { x: 1, y: 0 }, stats: { mana: 6, maxMana: 6, hp: 20, maxHp: 20, attack: 8, defense: 0, speed: 1, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0 } });
    const logs: string[] = [];
    const volley = resolveGenieFireball({
      player: caster,
      enemies: [center, beside, far],
      map,
      mode: 'nearest',
      manualTargetId: null,
      turn: 1,
      floor: 1,
      addLog: (t) => logs.push(t),
    });
    expect(volley.cast).toBe(true);
    expect(volley.player.stats.mana).toBe(6 - GENIE_FIREBALL_MP);
    expect(volley.player.stats.hp).toBeLessThan(20);
    expect(volley.enemies.find(e => e.id === 'mid')!.hp).toBeLessThan(40);
    expect(volley.enemies.find(e => e.id === 'side')!.hp).toBeLessThan(30);
    expect(volley.enemies.find(e => e.id === 'far')!.hp).toBe(30);
    expect(logs.some(l => l.includes('Fireball'))).toBe(true);
  });

  it('scales fencer crit up with HP and evasion up as HP falls', () => {
    expect(fencerCritBonus(10, 10)).toBe(FENCER_CRIT_AT_FULL);
    expect(fencerCritBonus(10, 10)).toBeGreaterThan(fencerCritBonus(1, 10));
    expect(fencerEvasion(0, 10, 8)).toBe(FENCER_EVA_AT_EMPTY);
    expect(fencerEvasion(1, 10, 8)).toBeLessThan(FENCER_EVA_AT_EMPTY);
    expect(fencerEvasion(10, 10, 8)).toBeLessThan(fencerEvasion(1, 10, 8));
  });

  it('parries when the chance is certain', () => {
    const result = resolveCombat(
      player({ characterClass: WIZARD, stats: { hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 1, evasion: 0, luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0, mana: 0, maxMana: 0 } }),
      foe({ attack: 9, hp: 5, maxHp: 5 }),
      () => {},
      { parryChance: 1 },
    );
    expect(result.parried).toBe(true);
    expect(result.playerHp).toBe(10);
    expect(result.enemyHp).toBe(5);
  });

  it('pays hitman contracts and swings the sharpshooter multipliers', () => {
    const started = startFloorContract(player({ characterClass: HITMAN }));
    expect(started.log).toContain(String(HITMAN_CONTRACT_KILLS));
    expect(started.player.stats.contractGoal).toBe(HITMAN_CONTRACT_KILLS);
    expect(contractGold(3)).toBeGreaterThan(0);
    const dual = gunshotPlan(player({
      characterClass: HITMAN,
      ammo: 4,
      equipment: {
        mainHand: { id: 'a', emoji: '🔫', name: 'A', description: '', consumed: false, weaponKind: 'gun' },
        offHand: { id: 'b', emoji: '🔫', name: 'B', description: '', consumed: false, weaponKind: 'gun' },
      },
    }));
    const single = gunshotPlan(player({
      characterClass: HITMAN,
      ammo: 2,
      equipment: { mainHand: { id: 'a', emoji: '🔫', name: 'Musket', description: '', consumed: false, weaponKind: 'gun', gunTier: 'musket' } },
    }));
    expect(dual?.damageMult).toBe(HITMAN_DUAL_MULT);
    expect(single?.damageMult).toBe(HITMAN_SINGLE_MULT);
    expect(single!.damageMult).toBeGreaterThan(dual!.damageMult);
    const low = executeStrike(10, 2, 10, 0);
    const high = executeStrike(10, 9, 10, 0);
    expect(low.executed).toBe(true);
    expect(high.executed).toBe(false);
    expect(2 / 10).toBeLessThanOrEqual(HITMAN_EXECUTE_HP_PCT);
  });

  it('gives the royal guard 125% melee with a sword and 100% without', () => {
    const sword = player({
      characterClass: ROYAL_GUARD,
      equipment: { offHand: { id: 's', emoji: '⚔️', name: 'Sword', description: '', consumed: false, weaponKind: 'blade' } },
    });
    const guns = player({
      characterClass: ROYAL_GUARD,
      ammo: 0,
      equipment: {
        mainHand: { id: 'g', emoji: '🔫', name: 'Gun', description: '', consumed: false, weaponKind: 'gun' },
        offHand: { id: 'b', emoji: '🏹', name: 'Bow', description: '', consumed: false, weaponKind: 'bow' },
      },
    });
    expect(royalMeleeMultiplier(sword)).toBe(ROYAL_SWORD_MELEE_MULT);
    expect(royalMeleeMultiplier(guns)).toBe(1);
  });

  it('reserves muskets for the Royal Guard and the Levitating Hitman', () => {
    const musket = { id: 'm', emoji: '🔫', name: 'Musket', description: '', consumed: false, weaponKind: 'gun' as const, gunTier: 'musket' as const, equipSlots: ['mainHand' as const] };
    expect(canEquipItem(musket, ROYAL_GUARD)).toBe(true);
    expect(canEquipItem(musket, HITMAN)).toBe(true);
    expect(canEquipItem(musket, '🤠')).toBe(false);
    expect(canEquipItem(musket, '🧝')).toBe(false);
    expect(canEquipItem({ ...musket, gunTier: undefined, equipSlots: ['mainHand', 'offHand'] }, '🤠')).toBe(true);
  });

  it('marks genie and hitman as flying', () => {
    expect(classFlies(GENIE)).toBe(true);
    expect(classFlies(HITMAN)).toBe(true);
    expect(classFlies(WIZARD)).toBe(false);
    expect(classFlies(FENCER)).toBe(false);
  });
});
