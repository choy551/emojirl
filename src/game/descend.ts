import type { GameState, Player } from './types';
import { generateMap } from './mapgen';
import { spawnEnemies, spawnVaultItems } from './spawning';
import { computeVisibility, visionRadiusFor } from './vision';
import { moodMax } from './progression';
import { pressureForRun } from './progression';
import { _flashSignals, PEACEMAKERS_LOG, tryDualGunsFanfare } from './flashSignals';
import { FINALE_FLOOR, buildFinaleFloor, waveBeginLog } from './finale';

function stampDualGunsFanfare(state: GameState, prevEquipment: Player['equipment'], addLog: (text: string) => void): GameState {
  const fan = tryDualGunsFanfare({
    characterClass: state.player.characterClass,
    prevEquipment,
    nextEquipment: state.player.equipment,
    alreadyDone: state.dualGunsFanfareDone,
  });
  if (fan.fired) addLog(PEACEMAKERS_LOG);
  return fan.done ? { ...state, dualGunsFanfareDone: true } : state;
}

/**
 * Step down a floor. `state.player` is the player leaving the current floor
 * (mood already updated for the step). D:27 uses the preset arena and boss rush.
 */
export function descendFloor(state: GameState, addLog: (text: string) => void): GameState {
  const prev = state;
  const nextFloor = prev.currentFloor + 1;
  const cls = prev.player.characterClass;
  let newPlayer: Player = { ...prev.player, stats: { ...prev.player.stats } };
  let newState: GameState = { ...prev };

  const enteringFinale = nextFloor === FINALE_FLOOR;
  const finale = enteringFinale
    ? buildFinaleFloor(nextFloor, prev.difficultyTier ?? 0, !!prev.deepDive)
    : null;
  const generated = finale ?? generateMap(nextFloor);
  const { map, startPos, rooms } = generated;

  newState.map = computeVisibility(map, startPos, visionRadiusFor(newPlayer.characterClass, newPlayer.stats.level));
  newPlayer.pos = startPos;
  newState.currentFloor = nextFloor;
  newState.placedBombs = [];
  newState.activeProjectile = null;
  newState.pendingExplosion = undefined;
  newState.pendingBeam = undefined;
  newState.shopStock = null;
  newState.restaurantStock = null;
  newState.ammoCacheStock = null;
  newState.restaurantSoldCount = 0;
  newState.bossrush = finale ? finale.bossrush : undefined;

  const recruitedCompanions = prev.enemies.filter(e =>
    e.isRecruited && e.tag === 'Friendly' && e.hp > 0
  );
  const favoriteCompanion = recruitedCompanions.find(e => e.isFavoriteCompanion);
  const descendingCompanion = favoriteCompanion ??
    (recruitedCompanions.length > 0
      ? recruitedCompanions[Math.floor(Math.random() * recruitedCompanions.length)]
      : null);
  const leftBehind = recruitedCompanions.filter(e => descendingCompanion && e.id !== descendingCompanion.id);
  if (leftBehind.length > 0) {
    addLog(`🏕️ New recruits stay behind in the safer levels of the Dungeon!`);
  }

  const freshEnemies = finale
    ? [...finale.enemies]
    : spawnEnemies(nextFloor, rooms, startPos, prev.difficultyTier ?? 0, map, !!prev.deepDive);
  if (descendingCompanion) {
    const adjacentOffsets = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
    ];
    const spawnedSet = new Set(freshEnemies.map(e => `${e.pos.x},${e.pos.y}`));
    const slot = adjacentOffsets
      .map(o => ({ x: startPos.x + o.x, y: startPos.y + o.y }))
      .find(p => {
        const t = map[p.y]?.[p.x];
        return t && (t.type === 'floor' || t.type === 'safe-floor' || t.type === 'boss-floor') && !spawnedSet.has(`${p.x},${p.y}`);
      });
    const companionPos = slot ?? startPos;
    freshEnemies.push({ ...descendingCompanion, pos: companionPos });
    if (!favoriteCompanion && recruitedCompanions.length > 1) {
      addLog(`🤝 ${descendingCompanion.emoji} ${descendingCompanion.name} follows you deeper into the dungeon!`);
    } else if (favoriteCompanion) {
      addLog(`⭐ ${descendingCompanion.emoji} ${descendingCompanion.name} stays by your side as you descend.`);
    }
  }
  newState.enemies = freshEnemies;
  newState.items = finale ? [] : spawnVaultItems(rooms, newPlayer.characterClass, nextFloor, map);

  if (enteringFinale) {
    addLog(`🏟️ Floor ${FINALE_FLOOR} — the final arena. The crowd is seated. Survive the boss rush!`);
    addLog(waveBeginLog(1));
  } else if (nextFloor % 5 === 0) {
    addLog(`⚠️ Floor ${nextFloor} — a boss lurks here! Prepare yourself!`);
  } else {
    addLog(`Descended to floor ${nextFloor}.`);
  }
  if (prev.deepDive && prev.currentFloor === FINALE_FLOOR && nextFloor > FINALE_FLOOR) {
    addLog('⚠️ You dive past the end of the dungeon. From D:28 on, Dungeon Pressure is doubled on every floor.');
  }
  const newPressure = pressureForRun(nextFloor, prev.deepDive);
  const highestWarned = prev.highestPressureTierWarned ?? 0;
  if (newPressure.atk > 0 && newPressure.atk > highestWarned) {
    addLog(`⚠️ Dungeon Pressure rises to +${newPressure.atk} ATK / +${newPressure.def} DEF!`);
    newState.highestPressureTierWarned = newPressure.atk;
    _flashSignals.pressureFlashPending = true;
  }
  if (!enteringFinale) {
    if (rooms.some(r => r.theme === 'monster-den')) addLog(`🦴 You sense a terrible presence nearby...`);
    if (rooms.some(r => r.theme === 'treasure-vault')) addLog(`💎 You sense hidden treasure surrounded by water...`);
    if (rooms.some(r => r.theme === 'bush-ambush')) addLog(`🌿 You hear bowstrings drawn behind the bushes...`);
    if (rooms.some(r => r.theme === 'room-vault')) addLog(`🛏️ A small room is tucked inside these halls...`);
    if (rooms.some(r => r.theme === 'volcano')) {
      addLog(`🌋 There is a Volcano on this floor!`);
      newState.floorAnnouncement = {
        kind: 'volcano',
        title: 'There is a Volcano on this floor!',
        body: 'Hurry & pick up the valuable Emoji around it before it all burns in Lava!',
      };
    }
  }
  newPlayer.stats.moodValue = Math.min(moodMax(cls), newPlayer.stats.moodValue + 15);
  if (cls === '🧙') newPlayer.stats.mana = newPlayer.stats.maxMana ?? 4;
  newState.stealthMode = false;
  newState.ninjaFreeMoves = 0;
  // Marks are floor-local. Leaving them would credit the next floor's reused ids.
  if (newPlayer.stats.blinkStrikeMarks) {
    const stats = { ...newPlayer.stats };
    delete stats.blinkStrikeMarks;
    newPlayer = { ...newPlayer, stats };
  }
  newState.player = newPlayer;
  newState = stampDualGunsFanfare(newState, prev.player.equipment, addLog);
  newState.turn++;
  return newState;
}
