import { describe, it, expect } from 'vitest';
import type { Player } from './types';
import { CHARACTER_CLASSES } from './classes';
import {
  BLINK_TALENT_CREDITS_PER_TIER,
  BLINK_TALENT_DELAYED_KILL_TURNS,
  BLINK_TALENTS,
  addBlinkMarks,
  applyBlinkCooldownReduction,
  applyFlowingStrike,
  blinkInstakillChainLimit,
  blinkLifestealHeal,
  blinkMeleeChargesAfterCast,
  blinkStrikeDamagePhrase,
  blinkStrikeMultiplierPercent,
  blinkStrikeRulesBlurb,
  blinkStrikeTargetCount,
  blinkTalentChoices,
  blinkTalentProgress,
  creditsForBlinkTarget,
  critStat,
  grantBlinkCredits,
  isBlinkStrikeTarget,
  knownBlinkTalents,
  overkillBankAfterHit,
  overkillExcess,
  pendingBlinkTalentOffer,
  resolveBlinkCooldown,
  resolveOverkillAfterBlink,
  settleBlinkStrikeMarks,
  tickBlinkCooldowns,
} from './blinkStrike';

function ninja(stats: Partial<Player['stats']> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🥷',
    characterClass: '🥷',
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: {},
    stats: {
      hp: 20, maxHp: 20, attack: 3, defense: 0, speed: 3, evasion: 20,
      luck: 2, level: 1, xp: 0, moodValue: 0, gold: 0,
      ...stats,
    },
  };
}

describe('Blink Strike multiplier', () => {
  it('is 200% at 0 CRIT and exactly 400% at 99 CRIT', () => {
    expect(blinkStrikeMultiplierPercent(0)).toBe(200);
    expect(blinkStrikeMultiplierPercent(50)).toBe(301);
    expect(blinkStrikeMultiplierPercent(98)).toBe(398);
    expect(blinkStrikeMultiplierPercent(99)).toBe(400);
    expect(blinkStrikeMultiplierPercent(100)).toBe(400);
    expect(blinkStrikeMultiplierPercent(150)).toBe(400);
    expect(blinkStrikeMultiplierPercent(-8)).toBe(200);
    expect(critStat(0)).toBe(5);
    expect(blinkStrikeDamagePhrase(0)).toBe('210% damage (CRIT 5%)');
    expect(critStat(2)).toBe(7);
    expect(blinkStrikeMultiplierPercent(critStat(2))).toBe(214);
  });

  it('shifts the same line by +100 with Heavier Blink', () => {
    const heavy = ['heavier-blink'] as const;
    expect(blinkStrikeMultiplierPercent(0, heavy)).toBe(300);
    expect(blinkStrikeMultiplierPercent(50, heavy)).toBe(401);
    expect(blinkStrikeMultiplierPercent(99, heavy)).toBe(500);
    expect(blinkStrikeMultiplierPercent(150, heavy)).toBe(500);
    expect(blinkStrikeMultiplierPercent(-8, heavy)).toBe(300);
    expect(blinkStrikeDamagePhrase(0, heavy)).toBe('310% damage (CRIT 5%)');
    expect(blinkStrikeRulesBlurb(undefined, heavy)).toContain('300%');
    expect(blinkStrikeRulesBlurb(undefined, heavy)).toContain('500%');
    expect(blinkStrikeRulesBlurb()).toContain('200%');
    expect(blinkStrikeRulesBlurb()).toContain('400%');
  });
});

describe('Blink Strike talents', () => {
  it('shows progress toward the next tier', () => {
    const early = blinkTalentProgress(12, []);
    expect(early.statsLabel).toBe('Blink talents: 12/44');
    expect(early.hudLabel).toBe('⚡ Blink talents 12/44');
    expect(early.compactLabel).toBe('⚡12/44');
    expect(early.nextLabel).toBe('Next: T1');
    expect(early.needed).toBe(BLINK_TALENT_CREDITS_PER_TIER);

    const ready = blinkTalentProgress(44, []);
    expect(ready.ratio).toBe('44/44');
    expect(ready.nextLabel).toBe('Choose T1');
    expect(ready.readyToPick).toBe(true);

    const towardT2 = blinkTalentProgress(50, ['shorter-cd']);
    expect(towardT2.ratio).toBe('6/44');
    expect(towardT2.nextLabel).toBe('Next: T2');
  });

  it('unlocks tier pairs, then any unpicked talent', () => {
    expect(pendingBlinkTalentOffer(43, [])).toBeNull();
    expect(pendingBlinkTalentOffer(44, [])?.tierLabel).toBe('T1');
    expect(pendingBlinkTalentOffer(44, [])?.choices.map(c => c.id)).toEqual(['shorter-cd', 'lifesteal']);

    expect(blinkTalentChoices(['shorter-cd']).map(c => c.id)).toEqual(['flowing-strikes', 'heavier-blink']);
    expect(pendingBlinkTalentOffer(88, ['shorter-cd'])?.tierLabel).toBe('T2');

    expect(blinkTalentChoices(['shorter-cd', 'flowing-strikes']).map(c => c.id)).toEqual(['overkill', 'blink-truestrike']);
    expect(pendingBlinkTalentOffer(132, ['shorter-cd', 'heavier-blink'])?.tierLabel).toBe('T3');

    const afterT3 = ['shorter-cd', 'flowing-strikes', 'overkill'] as const;
    expect(blinkTalentChoices(afterT3).map(c => c.id)).toEqual(['twin-strike', 'endless-chain']);
    expect(pendingBlinkTalentOffer(132, afterT3)).toBeNull();
    expect(pendingBlinkTalentOffer(176, afterT3)?.tierLabel).toBe('T4');

    const afterT4 = ['shorter-cd', 'flowing-strikes', 'overkill', 'twin-strike'] as const;
    expect(pendingBlinkTalentOffer(176, afterT4)).toBeNull();
    expect(pendingBlinkTalentOffer(220, afterT4)?.tierLabel).toBe('T5+');
    const leftover = pendingBlinkTalentOffer(220, afterT4)?.choices.map(c => c.id);
    expect(leftover).toEqual(['lifesteal', 'heavier-blink', 'blink-truestrike', 'endless-chain']);
    expect(leftover).not.toContain('shorter-cd');

    expect(BLINK_TALENTS.filter(t => t.tier === 3).map(t => t.id)).toEqual(['overkill', 'blink-truestrike']);
    expect(BLINK_TALENTS.filter(t => t.tier === 4).map(t => t.id)).toEqual(['twin-strike', 'endless-chain']);
    expect(BLINK_TALENTS.some(t => t.name === 'Longer Chain')).toBe(false);

    expect(pendingBlinkTalentOffer(44 * BLINK_TALENTS.length, BLINK_TALENTS.map(t => t.id))).toBeNull();
    expect(blinkTalentProgress(44 * BLINK_TALENTS.length, BLINK_TALENTS.map(t => t.id)).complete).toBe(true);
    expect(knownBlinkTalents(['shorter-cd', 'longer-chain', 'twin-strike'])).toEqual(['shorter-cd', 'twin-strike']);
  });

  it('pays 2 credits for an instakill and 1 when a marked target dies inside the window', () => {
    expect(creditsForBlinkTarget(true, true)).toEqual({ immediate: 2, mark: false });
    expect(creditsForBlinkTarget(false, true)).toEqual({ immediate: 1, mark: false });
    expect(creditsForBlinkTarget(false, false)).toEqual({ immediate: 0, mark: true });

    const marked = ninja({
      blinkStrikeMarks: addBlinkMarks(undefined, ['a', 'b'], 10),
      blinkStrikeCredits: 12,
    });
    const inWindow = settleBlinkStrikeMarks(marked, [{ id: 'b' }], 10 + BLINK_TALENT_DELAYED_KILL_TURNS);
    expect(inWindow.player.stats.blinkStrikeCredits).toBe(13);
    expect(inWindow.logs[0]).toBe('🥷 Blink talent +1 (13/44).');
    expect(inWindow.player.stats.blinkStrikeMarks?.map(m => m.enemyId)).toEqual(['b']);

    const expired = settleBlinkStrikeMarks(marked, [], 10 + BLINK_TALENT_DELAYED_KILL_TURNS + 1);
    expect(expired.player.stats.blinkStrikeCredits).toBe(12);
    expect(expired.logs).toEqual([]);
    expect(expired.player.stats.blinkStrikeMarks).toBeUndefined();
  });

  it('logs an unlock once when credits cross a tier, without a line for zero gain', () => {
    const granted = grantBlinkCredits(ninja({ blinkStrikeCredits: 42 }), 2);
    expect(granted.player.stats.blinkStrikeCredits).toBe(44);
    expect(granted.logs).toEqual([
      '🥷 Blink talent +2 (44/44).',
      '🥷 Blink talent ready — choose T1.',
    ]);
    expect(grantBlinkCredits(ninja(), 0).logs).toEqual([]);
  });

  it('applies each talent with the tunable constants', () => {
    expect(applyBlinkCooldownReduction(8, [])).toBe(8);
    expect(applyBlinkCooldownReduction(8, ['shorter-cd'])).toBe(7);
    expect(applyBlinkCooldownReduction(0, ['shorter-cd'])).toBe(0);
    expect(blinkLifestealHeal(25, ['lifesteal'])).toBe(2);
    expect(blinkLifestealHeal(25, [])).toBe(0);
    expect(blinkMeleeChargesAfterCast(['flowing-strikes'])).toBe(3);
    expect(blinkStrikeTargetCount(['twin-strike'])).toBe(2);
    expect(blinkStrikeTargetCount([])).toBe(1);

    expect(blinkInstakillChainLimit([])).toBe(3);
    expect(blinkInstakillChainLimit(['heavier-blink'])).toBe(3);
    expect(blinkInstakillChainLimit(['endless-chain'])).toBeNull();

    const extended = resolveBlinkCooldown({ talents: [], killed: true, instakill: true, chain: 2 });
    expect(extended.cooldown).toBe(0);
    expect(extended.chain).toBe(3);
    const capped = resolveBlinkCooldown({ talents: ['shorter-cd'], killed: true, instakill: true, chain: 3 });
    expect(capped.cooldown).toBe(2);
    expect(capped.chain).toBe(3);

    const endless = resolveBlinkCooldown({ talents: ['endless-chain'], killed: true, instakill: true, chain: 9 });
    expect(endless.cooldown).toBe(0);
    expect(endless.chain).toBe(10);

    const flow = applyFlowingStrike(ninja({
      blinkTalents: ['flowing-strikes'],
      blinkStrikeCooldown: 6,
      blinkMeleeCdCharges: 3,
    }).stats);
    expect(flow.stats.blinkStrikeCooldown).toBe(5);
    expect(flow.stats.blinkMeleeCdCharges).toBe(2);
    expect(flow.log).toBe('🥷 Flowing Strike — Blink cooldown 5t.');
    const quiet = applyFlowingStrike({ ...flow.stats, blinkStrikeCooldown: 0 });
    expect(quiet.stats.blinkMeleeCdCharges).toBe(1);
    expect(quiet.log).toBeNull();

    const both = applyFlowingStrike(ninja({
      blinkTalents: ['flowing-strikes'],
      blinkStrikeCooldown: 6,
      blinkOverkillCooldown: 4,
      blinkMeleeCdCharges: 2,
    }).stats);
    expect(both.stats.blinkStrikeCooldown).toBe(5);
    expect(both.stats.blinkOverkillCooldown).toBe(3);
    expect(both.log).toBe('🥷 Flowing Strike — Blink cooldown 5t, Overkill 3t.');
  });

  it('banks instakill excess for the next Blink and gates only the banking', () => {
    expect(overkillExcess(30, 10)).toBe(20);
    expect(overkillExcess(10, 10)).toBe(0);
    expect(overkillBankAfterHit(20, 0)).toBe(20);
    expect(overkillBankAfterHit(20, 11)).toBe(0);

    const banked = resolveOverkillAfterBlink({
      talents: ['overkill'],
      cooldown: 0,
      carriedBank: 0,
      instakillDamages: [{ damage: 30, maxHp: 10 }, { damage: 15, maxHp: 12 }],
    });
    expect(banked.bank).toBe(23);
    expect(banked.cooldown).toBe(8);
    expect(banked.log).toBe('🥷 Overkill — +23 damage banked for the next Blink (8t).');

    const exact = resolveOverkillAfterBlink({
      talents: ['overkill'],
      cooldown: 0,
      carriedBank: 0,
      instakillDamages: [{ damage: 10, maxHp: 10 }],
    });
    expect(exact).toEqual({ bank: 0, cooldown: 0, log: null });

    const blocked = resolveOverkillAfterBlink({
      talents: ['overkill'],
      cooldown: 5,
      carriedBank: 23,
      instakillDamages: [{ damage: 40, maxHp: 10 }],
    });
    expect(blocked.bank).toBe(23);
    expect(blocked.cooldown).toBe(4);
    expect(blocked.log).toBeNull();

    const replaced = resolveOverkillAfterBlink({
      talents: ['overkill', 'shorter-cd'],
      cooldown: 0,
      carriedBank: 23,
      instakillDamages: [{ damage: 18, maxHp: 10 }],
    });
    expect(replaced.bank).toBe(8);
    expect(replaced.cooldown).toBe(7);

    const noTalent = resolveOverkillAfterBlink({
      talents: [],
      cooldown: 0,
      carriedBank: 4,
      instakillDamages: [{ damage: 30, maxHp: 10 }],
    });
    expect(noTalent).toEqual({ bank: 4, cooldown: 0, log: null });

    expect(tickBlinkCooldowns(ninja({ blinkStrikeCooldown: 2, blinkOverkillCooldown: 1 }).stats)).toMatchObject({
      blinkStrikeCooldown: 1,
      blinkOverkillCooldown: 0,
    });
  });

  it('lets Truestrike ignore line of sight only when the ninja has Telepathy', () => {
    const base = { dist: 6, hasLos: false, tileVisible: false, hostile: true, talents: ['blink-truestrike'] as const, telepathy: false };
    expect(isBlinkStrikeTarget(base)).toBe(false);
    expect(isBlinkStrikeTarget({ ...base, telepathy: true })).toBe(true);
    expect(isBlinkStrikeTarget({ ...base, talents: [], telepathy: true, hasLos: true, tileVisible: true })).toBe(true);
    expect(isBlinkStrikeTarget({ ...base, talents: [], telepathy: true })).toBe(false);
    expect(isBlinkStrikeTarget({ ...base, telepathy: true, dist: 7 })).toBe(false);
    expect(isBlinkStrikeTarget({ ...base, telepathy: true, hostile: false })).toBe(false);
    expect(isBlinkStrikeTarget({ ...base, hasLos: true, tileVisible: true, talents: [] })).toBe(true);
  });

  it('describes the live multiplier in the class and RTFM copy', () => {
    const detail = CHARACTER_CLASSES['🥷'].active?.detail ?? '';
    expect(detail).toContain('214%');
    expect(detail).toContain('200%');
    expect(detail).toContain('400%');
    expect(detail).toContain('44');
    expect(detail).not.toContain('double damage');
  });
});
