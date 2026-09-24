import { Enemy, FloatingText, Player } from './types';
import { chebyshev } from './geo';

export const _flashSignals = {
  berserkFlashPending: null as string | null,
  emojilessFlashPending: false,
  divineFlashPending: null as string | null,
  pendingFairyId: null as string | null,
  pressureFlashPending: false,
  lightningFlashPending: false,
  spellEchoFlashPending: false,
  dualGunsFanfarePending: false,
};

export const PEACEMAKERS_LOG =
  '🤠 Real Cowboys fight with their fists... but a Real American Hero fights with his two Peacemakers!';

/** First time Cowboy completes Dual Guns this run. Flavor only. */
export function tryDualGunsFanfare(opts: {
  characterClass: string;
  prevEquipment: Player['equipment'];
  nextEquipment: Player['equipment'];
  alreadyDone: boolean | undefined;
}): { done: boolean; fired: boolean } {
  if (opts.alreadyDone) return { done: true, fired: false };
  if (opts.characterClass !== '🤠') return { done: false, fired: false };
  const was = opts.prevEquipment.mainHand?.weaponKind === 'gun'
    && opts.prevEquipment.offHand?.weaponKind === 'gun';
  const now = opts.nextEquipment.mainHand?.weaponKind === 'gun'
    && opts.nextEquipment.offHand?.weaponKind === 'gun';
  if (!was && now) {
    _flashSignals.dualGunsFanfarePending = true;
    return { done: true, fired: true };
  }
  return { done: false, fired: false };
}

export const DIVINE_INSPIRE_RADIUS = 4;

export function handleGodBlessedImmunity(
  enemy: Enemy,
  enemies: Enemy[],
  enemyIndex: number,
  playerHp: number,
  turn: number,
  log: (msg: string) => void,
  floats: FloatingText[],
): { proc: boolean; newPlayerHp: number; newEnemies: Enemy[] } {
  if (!enemy.godBlessed) return { proc: false, newPlayerHp: playerHp, newEnemies: enemies };
  _flashSignals.divineFlashPending = enemy.id;
  const counterDmg = Math.round(enemy.attack * 1.5);
  log(`✨ Divine Intervention! ${enemy.emoji} ${enemy.name} is shielded by the gods — clings to 1 HP!`);
  log(`⚡ ${enemy.emoji} ${enemy.name} counter-attacks for ${counterDmg} damage! (auto-hit)`);
  floats.push({ id: `divine-${enemy.id}-${turn}`, pos: { ...enemy.pos }, text: '✨ DIVINE!', color: '#fcd34d', life: 3 });
  const newPlayerHp = Math.max(0, playerHp - counterDmg);
  const newEnemies = enemies.map((e, i) => {
    if (i === enemyIndex) return { ...e, hp: 1, godBlessed: false, engaged: true };
    if (e.id !== enemy.id && chebyshev(e.pos, enemy.pos) <= DIVINE_INSPIRE_RADIUS) {
      log(`✨ ${e.emoji} ${e.name} is divinely inspired! (+25% next attack)`);
      return { ...e, divineBuff: 1.25, engaged: true };
    }
    return e;
  });
  return { proc: true, newPlayerHp, newEnemies };
}
