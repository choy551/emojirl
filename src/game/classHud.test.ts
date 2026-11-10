import { describe, expect, it } from 'vitest';
import type { Player } from './types';
import { classHudBadges } from './classHud';

function hero(cls: string, over: Partial<Player> = {}): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: cls,
    characterClass: cls,
    ammo: 0,
    stats: {
      hp: 10, maxHp: 10, attack: 4, defense: 0, speed: 2, evasion: 8,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  } as Player;
}

describe('class hud badges', () => {
  it('lists live badges per class and skips static ones', () => {
    const ninja = classHudBadges({ player: hero('🥷', { stats: { ...hero('🥷').stats, hp: 3, maxHp: 10 } }), stealth: true });
    expect(ninja.map(b => b.id)).toEqual(['phantom', 'stealth']);
    expect(ninja[0]?.label).toBe('👻45');
    expect(ninja[1]?.dim).toBe(false);

    const genie = classHudBadges({ player: hero('🧞‍♀️', { genieOverchannel: false }) });
    expect(genie.find(b => b.id === 'overchannel')?.dim).toBe(true);
    expect(genie.find(b => b.id === 'bloodcast')?.title).toContain('2 HP');

    const hitman = classHudBadges({
      player: hero('🕴️', {
        ammo: 2,
        stats: { ...hero('🕴️').stats, stillStacks: 2, contractKills: 1, contractGoal: 4 },
        equipment: { mainHand: { id: 'p', emoji: '🔫', name: 'Pistol', description: '', consumed: false, weaponKind: 'gun' } },
      }),
    });
    expect(hitman.find(b => b.id === 'contract')?.label).toBe('📜3');
    expect(hitman.find(b => b.id === 'still')?.title).toContain('175%');
    expect(hitman.find(b => b.id === 'still')?.title).toContain('range 5');

    expect(classHudBadges({ player: hero('🤠', { stats: { ...hero('🤠').stats, moodValue: 0 } }) })[0]?.dim).toBe(true);
    expect(classHudBadges({ player: hero('🧝', { ammo: 0 }) })[0]).toMatchObject({ id: 'ammo', dim: true });
    expect(classHudBadges({ player: hero('💂') }).find(b => b.id === 'ammo')?.dim).toBe(true);
    const voided = classHudBadges({ player: hero('👤', { voidBossesCleared: 1 }) });
    expect(voided.find(b => b.id === 'void-cost')?.label).toBe('👤2');
    expect(voided.find(b => b.id === 'ghosts')?.dim).toBe(true);

    expect(classHudBadges({ player: hero('🧙') })).toEqual([]);
    expect(classHudBadges({ player: hero('🤺') }).map(b => b.id)).toEqual(['flourish', 'riposte', 'poise']);
  });
});
