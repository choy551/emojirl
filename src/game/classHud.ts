import type { Player } from './types';
import { GENIE_BLOODCAST_HP_PER_MP, HITMAN_CONTRACT_KILLS } from './prestigeConstants';
import { fencerStatusBadges, genieBloodcastEnabled, genieOverchannelEnabled } from './prestige';
import { occupiedGhosts } from './voidDamage';
import { voidRangedHpCost } from './voidAttackCost';
import { stillDamageMult, weaponRange } from './sharpshooter';

export interface ClassBadge {
  id: string;
  label: string;
  title: string;
  dim: boolean;
}

export interface ClassHudInput {
  player: Player;
  /** Equipped evasion, used by Fencer Poise. */
  evasion?: number;
  stealth?: boolean;
  tile?: string;
}

function badge(id: string, label: string, title: string, dim: boolean): ClassBadge {
  return { id, label, title, dim };
}

export function classHudBadges(input: ClassHudInput): ClassBadge[] {
  const { player } = input;
  const cls = player.characterClass;
  const stats = player.stats;

  if (cls === '🤺') return fencerStatusBadges(stats, input.evasion ?? stats.evasion ?? 0);

  if (cls === '🥷') {
    const low = stats.hp / Math.max(1, stats.maxHp) < 0.4;
    const phantom = low ? 45 : 20;
    const stealth = !!input.stealth || !!player.drinkBuff?.stealth;
    return [
      badge('phantom', `👻${phantom}`, low ? 'Phantom evasion is 45% below 40% HP.' : 'Phantom evasion is 20%. It spikes to 45% below 40% HP.', false),
      badge('stealth', stealth ? '🤫' : '👁', stealth ? 'Stealth is on.' : 'Stealth is off.', !stealth),
    ];
  }

  if (cls === '🧞‍♀️') {
    const blood = genieBloodcastEnabled(player);
    const over = genieOverchannelEnabled(player);
    return [
      badge('overchannel', over ? 'OC' : 'oc', over ? 'Overchannel is on.' : 'Overchannel is off.', !over),
      badge('bloodcast', blood ? 'BC' : 'bc', blood
        ? `Bloodcast is on. ${GENIE_BLOODCAST_HP_PER_MP} HP per missing MP.`
        : 'Bloodcast is off. Casts that MP does not cover are refused.', !blood),
    ];
  }

  if (cls === '🕴️') {
    const goal = stats.contractGoal ?? HITMAN_CONTRACT_KILLS;
    const left = stats.contractDone ? 0 : Math.max(0, goal - (stats.contractKills ?? 0));
    const still = stats.stillStacks ?? 0;
    const pct = Math.round(stillDamageMult(still, cls, input.tile) * 100);
    const range = weaponRange(player);
    return [
      badge('contract', `📜${left}`, left === 0 ? 'Contract is done.' : `${left} contract kill${left === 1 ? '' : 's'} left.`, left === 0),
      badge('still', `Still ${still}`, `Still ${still}: ${pct}% ATK, range ${range}. Moving clears Still.`, still === 0),
    ];
  }

  if (cls === '🤠') {
    const mood = stats.moodValue ?? 0;
    return [badge('mood', `🤠${mood}`, `Cowboy mood ${mood}. Above 100 it adds damage.`, mood === 0)];
  }

  if (cls === '🧝') {
    const ammo = player.ammo ?? 0;
    const bonus = player.drinkBuff?.survivalistBonus ?? 0;
    const badges = [
      badge('ammo', `🏹${ammo}`, ammo === 0 ? 'No arrows.' : `${ammo} arrows.`, ammo === 0),
    ];
    if (bonus > 0) {
      badges.push(badge('survivalist', `🪶+${Math.round(bonus * 100)}`, `Survivalist drink: +${Math.round(bonus * 100)}% ammo save for ${player.drinkBuff?.turnsLeft ?? 0}t.`, false));
    }
    return badges;
  }

  if (cls === '💂') {
    const arrows = player.arrowAmmo ?? 0;
    const bullets = player.bulletAmmo ?? 0;
    const kinds = [player.equipment.mainHand?.weaponKind, player.equipment.offHand?.weaponKind];
    const both = kinds.includes('bow') && kinds.includes('gun');
    const badges = [
      badge('ammo', `🏹${arrows} 🪙${bullets}`, `Arrows ${arrows}. Bullets ${bullets}.`, arrows === 0 && bullets === 0),
    ];
    if (both) {
      const next = player.guardNextShot === 'gun' ? 'gun' : 'bow';
      badges.push(badge('next', next === 'gun' ? '🪙' : '🏹', `Next shot is the ${next}.`, false));
    }
    return badges;
  }

  if (cls === '👤') {
    const cost = voidRangedHpCost(player.voidBossesCleared ?? 0);
    const ghosts = occupiedGhosts(player.ghostHotbar);
    return [
      badge('void-cost', `👤${cost}`, `Ranged Void attack costs ${cost} HP. Ranger shots spend ammo first.`, false),
      badge('ghosts', `👻${ghosts}`, ghosts === 0 ? 'No active ghosts.' : `${ghosts} active ghost${ghosts === 1 ? '' : 's'}.`, ghosts === 0),
    ];
  }

  return [];
}
