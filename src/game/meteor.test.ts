import { describe, expect, it } from 'vitest';
import { applyShrineBlessing } from './inventory';
import { applyDrinkToPlayer } from './drinks';
import { manaAfterQuietWait, manaOnDescend } from './genieMana';
import { applyMeteorBlast, meteorArea, meteorDue, meteorStrikeDamage, placeMeteor, resolvePendingMeteor } from './meteor';
import { genieBloodcastEnabled, notePrestigeKill, planGenieCast } from './prestige';
import { GENIE_DRINK_MP, GENIE_FIREBALL_MP, GENIE_METEOR_MP, GENIE_METEOR_MULT } from './prestigeConstants';
import type { Enemy, GameState, Player } from './types';

function genie(stats: Partial<Player['stats']> = {}, extra: Partial<Player> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🧞‍♀️',
    characterClass: '🧞‍♀️',
    ammo: 0,
    inventory: [],
    bank: [],
    equipment: {},
    ...extra,
    stats: {
      hp: 20, maxHp: 20, attack: 10, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
      mana: 6, maxMana: 20,
      ...stats,
    },
  };
}

function foe(partial: Partial<Enemy> = {}): Enemy {
  return {
    id: 'rat', pos: { x: 3, y: 3 }, emoji: '🐀', name: 'Rat',
    hp: 40, maxHp: 40, attack: 2, defense: 0, speed: 1, engaged: true,
    ...partial,
  };
}

describe('genie meteor', () => {
  it('spends 4 MP, marks a 3×3, and lands at the end of the next turn for 250%', () => {
    const caster = genie({ mana: 6, hp: 18 }, { genieBloodcast: true });
    const placed = placeMeteor(caster, 4, { x: 3, y: 3 });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.player.stats.mana).toBe(6 - GENIE_METEOR_MP);
    expect(placed.player.stats.hp).toBe(18);
    expect(placed.meteor.landTurn).toBe(6);
    expect(meteorDue(placed.meteor, 5)).toBe(false);
    expect(meteorDue(placed.meteor, 6)).toBe(true);

    const tiles = meteorArea({ x: 3, y: 3 });
    expect(tiles).toHaveLength(9);
    expect(tiles).toContainEqual({ x: 2, y: 2 });
    expect(tiles).toContainEqual({ x: 4, y: 4 });
    expect(tiles).not.toContainEqual({ x: 5, y: 3 });

    expect(meteorStrikeDamage(caster, 0)).toBe(Math.round(10 * GENIE_METEOR_MULT));
    const blast = applyMeteorBlast({
      player: placed.player,
      enemies: [foe(), foe({ id: 'far', pos: { x: 6, y: 3 }, hp: 30, maxHp: 30 })],
      center: { x: 3, y: 3 },
      floor: 1,
      turn: 6,
    });
    expect(blast.tiles).toHaveLength(9);
    expect(blast.enemies.find(e => e.id === 'rat')!.hp).toBe(40 - 25);
    expect(blast.enemies.find(e => e.id === 'far')!.hp).toBe(30);

    const early = resolvePendingMeteor({
      turn: 5,
      gameOver: false,
      currentFloor: 1,
      pendingMeteor: placed.meteor,
      player: placed.player,
      enemies: [foe({ hp: 80, maxHp: 80 })],
      logs: [],
      floatingTexts: [],
    } as unknown as GameState);
    expect(early.pendingMeteor).toEqual(placed.meteor);
    expect(early.enemies[0].hp).toBe(80);

    const landed = resolvePendingMeteor({ ...early, turn: 6 });
    expect(landed.pendingMeteor).toBeUndefined();
    expect(landed.enemies[0].hp).toBe(80 - 25);
    expect(landed.pendingExplosion).toHaveLength(9);
    expect(landed.logs.some(l => l.text.includes('Meteor strikes'))).toBe(true);
  });

  it('refuses Meteor when MP is short, and Bloodcast cannot pay it', () => {
    const dry = genie({ mana: 3, hp: 20 }, { genieBloodcast: true });
    const refused = placeMeteor(dry, 2, { x: 1, y: 1 });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.log).toContain('Bloodcast cannot pay');
    expect(dry.stats.hp).toBe(20);
    expect(dry.stats.mana).toBe(3);

    const fireball = planGenieCast(genie({ mana: 0, hp: 20 }, { genieBloodcast: true }));
    expect(fireball).toMatchObject({ canCast: true, kind: 'bloodcast', hpSpent: GENIE_FIREBALL_MP * 2, mpSpent: 0 });
    const meteor = placeMeteor(genie({ mana: 0, hp: 20 }, { genieBloodcast: true }), 1, { x: 1, y: 1 });
    expect(meteor.ok).toBe(false);

    expect(genieBloodcastEnabled(genie())).toBe(false);
    const off = planGenieCast(genie({ mana: 0, hp: 20 }));
    expect(off.canCast).toBe(false);
    expect(off.hpSpent).toBe(0);
    const floor = planGenieCast(genie({ mana: 0, hp: 4, maxHp: 20 }, { genieBloodcast: true }));
    expect(floor.canCast).toBe(false);
    expect(floor.blockReason).toContain('25%');
  });

  it('does not regenerate MP, and each listed source pays the right amount', () => {
    expect(manaAfterQuietWait('🧞‍♀️', 1, 6)).toBe(1);
    expect(manaAfterQuietWait('🧙', 1, 6)).toBe(2);
    expect(manaAfterQuietWait('🧙', 6, 6)).toBe(6);

    const pool = { mana: 1, maxMana: 20 };
    expect(notePrestigeKill(genie(pool), 1).player.stats.mana).toBe(3);
    expect(notePrestigeKill(genie(pool), 1, 0, { godBlessed: true }).player.stats.mana).toBe(5);
    expect(notePrestigeKill(genie(pool), 1, 0, { isBoss: true }).player.stats.mana).toBe(9);
    expect(notePrestigeKill(genie(pool), 1, 0, { isBoss: true, godBlessed: true }).player.stats.mana).toBe(9);

    const drunk = applyDrinkToPlayer(genie({ mana: 1, maxMana: 10, hp: 8 }), {
      id: 'drink', emoji: '🧃', name: 'Tonic', description: '', consumed: false, drinkTier: 1,
    });
    expect(drunk.ok).toBe(true);
    if (!drunk.ok) return;
    expect(drunk.player.stats.mana).toBe(1 + GENIE_DRINK_MP);
    expect(drunk.player.stats.hp).toBe(8);

    const shrine = applyShrineBlessing(genie({ mana: 1, maxMana: 6, hp: 8, maxHp: 20 }), 2, true);
    expect(shrine.stats.maxMana).toBe(7);
    expect(shrine.stats.mana).toBe(7);
    expect(shrine.stats.hp).toBeGreaterThanOrEqual(8);

    expect(manaOnDescend('🧞‍♀️', 1, 6)).toBe(3);
    expect(manaOnDescend('🧞‍♀️', 5, 6)).toBe(5);
    expect(manaOnDescend('🧙', 1, 6)).toBe(6);
    expect(manaOnDescend('🥷', 1, 6)).toBe(1);
  });
});
