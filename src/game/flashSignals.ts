import { Enemy, FloatingText } from './types';
import { chebyshev } from './geo';

export const _flashSignals = {
  berserkFlashPending: null as string | null,
  emojilessFlashPending: false,
  divineFlashPending: null as string | null,
  pendingFairyId: null as string | null,
  pressureFlashPending: false,
};

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
