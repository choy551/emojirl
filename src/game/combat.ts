import { Player, Enemy, MoodType } from './types';
import { crowGoldSteal } from './economy';

export interface MoodModifiers {
  damageMult: number;
  incomingMult: number;
  hitChance: number;
  dodgeBonus: number;
  critBonus: number;
  fleeChance: number;
  doubleStrike: number;
}

export function getMoodModifiers(mood: MoodType, hp: number, maxHp: number, cowboyMoodValue?: number): MoodModifiers {
  const base: MoodModifiers = { damageMult: 1, incomingMult: 1, hitChance: 0, dodgeBonus: 0, critBonus: 0, fleeChance: 0, doubleStrike: 0 };
  switch (mood) {
    case 'happy':      return { ...base, damageMult: 1.2, doubleStrike: 10 };
    case 'very_happy': {
      if (cowboyMoodValue !== undefined && cowboyMoodValue > 100) {
        const excess = cowboyMoodValue - 100;
        const tiers = Math.floor(excess / 20);
        return {
          ...base,
          damageMult:   1.3 + tiers * 0.05,
          dodgeBonus:   10  + tiers * 2,
          critBonus:    tiers * 3,
          doubleStrike: 15  + tiers * 2,
        };
      }
      return { ...base, damageMult: 1.3, dodgeBonus: 10, doubleStrike: 15 };
    }
    case 'excited':    return { ...base, damageMult: 1.1, critBonus: 15 };
    case 'confident':  return { ...base, damageMult: 1.1, hitChance: 5, dodgeBonus: 5 };
    case 'sad':        return { ...base, hitChance: -20, fleeChance: 15 };
    case 'crying':     return { ...base, hitChance: -30, fleeChance: 25, incomingMult: 0.9 };
    case 'angry':      return { ...base, damageMult: 1.4, incomingMult: 1.1 };
    case 'scared':     return { ...base, damageMult: 0.9, dodgeBonus: 20, fleeChance: 10 };
    case 'desperate': {
      const bonus = hp <= 2 ? 1.5 : hp / maxHp <= 0.2 ? 1.3 : 1;
      return { ...base, damageMult: bonus, fleeChance: 5 };
    }
    case 'confused':   return { ...base, hitChance: -10 };
    case 'in_love':    return { ...base, fleeChance: 5, damageMult: 0.95 };
    default:           return base;
  }
}

export interface CombatResult {
  enemyHp: number;
  playerHp: number;
  playerDied: boolean;
  enemyDied: boolean;
  stunned: boolean;
  dodged: boolean;
  fled: boolean;
  goldStolen?: number;
}

export function getCowboyUnarmedBonus(level: number): number {
  if (level <= 5) return level;
  if (level <= 10) return 5 + (level - 5) * 2;
  return 5 + 10 + (level - 10) * 3;
}

export function resolveCombat(
  player: Player,
  enemy: Enemy,
  addLog: (msg: string) => void,
  opts: { weakMelee?: boolean; wizardMelee?: boolean; firstShot?: boolean; mood?: MoodType; cowboyMoodValue?: number; dualStrike?: boolean; quadStrike?: boolean; advantage?: boolean; execBlow?: boolean; trueAim?: boolean; shieldWall?: number; isRanged?: boolean; pistolWhip?: boolean; floor?: number } = {}
): CombatResult {
  const cls = player.characterClass;
  const mods = getMoodModifiers(opts.mood ?? 'neutral', player.stats.hp, player.stats.maxHp, opts.cowboyMoodValue);

  // Advantage (🎲 Dice bag passive): roll twice, take the favorable (lower) value so
  // hit/crit/dodge checks are all more likely to succeed for the player.
  const r = opts.advantage
    ? () => Math.min(Math.random(), Math.random())
    : () => Math.random();

  // ── 1. Flee check (mood-based) ─────────────────────────────────────────────
  if (mods.fleeChance > 0 && Math.random() * 100 < mods.fleeChance) {
    addLog(`You flee from ${enemy.emoji} ${enemy.name}!`);
    return { enemyHp: enemy.hp, playerHp: player.stats.hp, playerDied: false, enemyDied: false, stunned: false, dodged: false, fled: true, goldStolen: 0 };
  }

  // ── 2. Hit resolution ──────────────────────────────────────────────────────
  const baseHit = 85 + mods.hitChance;
  const critChance = 5 + (player.stats.luck ?? 1) + mods.critBonus;
  let newEnemyHp = enemy.hp;

  if (cls === '🥷' && (opts.dualStrike || opts.quadStrike)) {
    // ── Ninja Multi-Strike: 2 hits (dualStrike) or 4 hits (quadStrike = dual blades) ──
    const wasUnaware = !enemy.engaged;

    // Swing 1 (main hand)
    const hit1 = (opts.trueAim ?? false) || r() * 100 < Math.max(5, Math.min(99, baseHit));
    if (!hit1) {
      addLog(`You swing at ${enemy.emoji} — miss!`);
    } else {
      const raw1 = wasUnaware ? Math.round(player.stats.attack * 1.6) : player.stats.attack;
      const isCrit1 = (opts.execBlow ?? false) || r() * 100 < critChance;
      const dmg1 = Math.max(1, Math.round(raw1 * mods.damageMult * (isCrit1 ? 2 : 1)) - (enemy.defense ?? 0));
      newEnemyHp -= dmg1;
      if (wasUnaware) {
        addLog(`🥷 Shadow Strike! ${dmg1} dmg to ${enemy.emoji} (unaware)${isCrit1 ? ' CRITICAL!' : ''}!`);
      } else {
        addLog(`You hit ${enemy.emoji} for ${dmg1} dmg${isCrit1 ? ' CRITICAL!' : ''}`);
      }
    }

    // Swing 2 (main hand follow-up)
    if (newEnemyHp > 0) {
      const hit2 = (opts.trueAim ?? false) || r() * 100 < Math.max(5, Math.min(99, baseHit));
      if (!hit2) {
        addLog(`🥷 Dual Strike — second swing misses!`);
      } else {
        const raw2 = Math.floor((wasUnaware ? Math.round(player.stats.attack * 1.6) : player.stats.attack) * 0.65);
        const isCrit2 = (opts.execBlow ?? false) || r() * 100 < critChance;
        const dmg2 = Math.max(1, Math.round(raw2 * mods.damageMult * (isCrit2 ? 2 : 1)) - (enemy.defense ?? 0));
        newEnemyHp -= dmg2;
        addLog(`🥷 Dual Strike! ${wasUnaware ? 'Shadow ' : ''}${dmg2} dmg${isCrit2 ? ' CRITICAL!' : ''}!`);
      }
    }

    // Swings 3 & 4 — off-hand blade (quadStrike only)
    if (opts.quadStrike && newEnemyHp > 0) {
      const hit3 = (opts.trueAim ?? false) || r() * 100 < Math.max(5, Math.min(99, baseHit));
      if (!hit3) {
        addLog(`🥷 Off-hand slash — miss!`);
      } else {
        const raw3 = Math.floor((wasUnaware ? Math.round(player.stats.attack * 1.6) : player.stats.attack) * 0.55);
        const isCrit3 = (opts.execBlow ?? false) || r() * 100 < critChance;
        const dmg3 = Math.max(1, Math.round(raw3 * mods.damageMult * (isCrit3 ? 2 : 1)) - (enemy.defense ?? 0));
        newEnemyHp -= dmg3;
        addLog(`🥷 Off-hand slash! ${dmg3} dmg${isCrit3 ? ' CRITICAL!' : ''}!`);
      }
    }
    if (opts.quadStrike && newEnemyHp > 0) {
      const hit4 = (opts.trueAim ?? false) || r() * 100 < Math.max(5, Math.min(99, baseHit));
      if (!hit4) {
        addLog(`🥷 Finishing strike — miss!`);
      } else {
        const raw4 = Math.floor((wasUnaware ? Math.round(player.stats.attack * 1.6) : player.stats.attack) * 0.40);
        const isCrit4 = (opts.execBlow ?? false) || r() * 100 < critChance;
        const dmg4 = Math.max(1, Math.round(raw4 * mods.damageMult * (isCrit4 ? 2 : 1)) - (enemy.defense ?? 0));
        newEnemyHp -= dmg4;
        addLog(`🥷 Finishing strike! ${dmg4} dmg${isCrit4 ? ' CRITICAL!' : ''}!`);
      }
    }
  } else {
    // ── Normal attack path ────────────────────────────────────────────────────
    const hit = (opts.trueAim ?? false) || r() * 100 < Math.max(5, Math.min(99, baseHit));
    if (!hit) {
      addLog(`You swing at ${enemy.emoji} — miss!`);
    } else {
      let rawDamage = player.stats.attack;
      if (cls === '🥷' && !enemy.engaged) {
        rawDamage = Math.round(rawDamage * 1.6);
      } else if (opts.wizardMelee) {
        rawDamage = Math.max(1, Math.floor(rawDamage * 0.25));
      } else if (opts.weakMelee) {
        rawDamage = Math.max(1, Math.floor(rawDamage * 0.7));
      } else if (opts.pistolWhip) {
        rawDamage = Math.round(rawDamage * 2.2);
      } else if (opts.firstShot) {
        rawDamage = Math.ceil(rawDamage * 1.5);
      }

      const isCrit = (opts.execBlow ?? false) || r() * 100 < critChance;
      const moodDamage = Math.round(rawDamage * mods.damageMult * (isCrit ? 2 : 1));
      const actualDamage = Math.max(1, moodDamage - (enemy.defense ?? 0));
      newEnemyHp = enemy.hp - actualDamage;

      if (cls === '🥷' && !enemy.engaged) {
        addLog(`🥷 Shadow Strike! ${actualDamage} dmg to ${enemy.emoji} (unaware)!`);
      } else if (opts.wizardMelee) {
        addLog(`🧙 Frail melee — ${actualDamage} dmg to ${enemy.emoji} (no spells in range)`);
      } else if (opts.weakMelee) {
        addLog(`🧝 Weak melee — ${actualDamage} dmg to ${enemy.emoji} (no ammo)`);
      } else if (opts.pistolWhip) {
        addLog(`🤠 Pistol whip! ${actualDamage} dmg to ${enemy.emoji}!`);
      } else if (opts.firstShot) {
        addLog(`🎯 First shot! ${actualDamage} dmg to ${enemy.emoji}${isCrit ? ' CRITICAL!' : ''}!`);
      } else {
        addLog(`You hit ${enemy.emoji} for ${actualDamage} dmg${isCrit ? ' CRITICAL!' : ''}`);
      }

      // Mood: double strike
      if (mods.doubleStrike > 0 && newEnemyHp > 0 && r() * 100 < mods.doubleStrike) {
        const dmg2 = Math.max(1, Math.round(rawDamage * mods.damageMult) - (enemy.defense ?? 0));
        newEnemyHp -= dmg2;
        addLog(`You strike again for ${dmg2}!`);
      }
    }
  }

  // ── 3. Cowboy stun (20%, melee hit only — not on ranged dual-gun shots, not on miss) ─
  const stunned = cls === '🤠' && !opts.isRanged && newEnemyHp < enemy.hp && Math.random() < 0.2;
  if (stunned && newEnemyHp > 0) {
    addLog(`🤠 Iron Fist! ${enemy.emoji} is stunned — no counterattack!`);
  }

  // ── 4. Enemy counterattack ─────────────────────────────────────────────────
  let newPlayerHp = player.stats.hp;
  let dodged = false;
  let playerDied = false;
  let goldStolen = 0;
  let goldRemaining = player.stats.gold;

  if (newEnemyHp > 0 && !stunned) {
    const fastEnemy = enemy.speed > (player.stats.speed ?? 1);

    const tryCrowSteal = () => {
      if (!enemy.crow || goldRemaining <= 0 || opts.floor == null) return;
      const stolen = crowGoldSteal(opts.floor, goldRemaining);
      if (stolen <= 0) return;
      goldStolen += stolen;
      goldRemaining -= stolen;
      addLog(`🐦‍⬛ ${enemy.name} pecks you and flies off with ${stolen}g!`);
    };

    const performAttack = (label: string) => {
      if (opts.shieldWall && Math.random() < 0.25) {
        addLog(`🛡️ Shield wall! The blow is deflected!`);
        return;
      }
      const dodgeChance = Math.min(95, (player.stats.evasion ?? 0) + mods.dodgeBonus);
      if (r() * 100 < dodgeChance) {
        dodged = true;
        addLog(`${label}${enemy.emoji} swings — you dodge!`);
        return;
      }
      const rawEnemy = enemy.crow
        ? 1
        : Math.max(1, enemy.attack - Math.floor((player.stats.defense ?? 0) / 2));
      const incoming = Math.round(rawEnemy * mods.incomingMult);
      const shieldDR = Math.min(incoming, opts.shieldWall ?? 0);
      const finalDmg = incoming - shieldDR;
      newPlayerHp -= finalDmg;
      const shieldNote = shieldDR > 0 ? ` (🛡️−${shieldDR})` : '';
      if (finalDmg <= 0) {
        addLog(`${label}${enemy.emoji} attacks — shields absorb it all! 🛡️`);
      } else {
        addLog(`${label}${enemy.emoji} hits you for ${finalDmg} dmg${shieldNote}!`);
        tryCrowSteal();
      }
      if (newPlayerHp <= 0) playerDied = true;
    };

    performAttack('');
    if (fastEnemy && !playerDied && Math.random() < 0.20) {
      performAttack('Fast! ');
    }
  }

  return {
    enemyHp: newEnemyHp,
    playerHp: newPlayerHp,
    playerDied,
    enemyDied: newEnemyHp <= 0,
    stunned,
    dodged,
    fled: false,
    goldStolen,
  };
}
