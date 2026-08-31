import { Enemy, EmojiItem, MapGrid, Position } from './types';
import type { Room } from './geo';
import { getRandomEnemy, getForestEnemy, getBossForFloor, getEchoEnemy, getRandomAdventurer, adventurerSpawnChance, ADVENTURER_FAVORITE_EMOJIS, rollAmbushCount, getAmbushRangedType } from './enemies';
import { getRandomEmojiPower, getBulletDrop, getRandomEquipmentDrop, getEmojiPowerByEmoji, VOLCANO_VALUABLE_EMOJIS } from './emojis';
import { getDungeonPressure } from './progression';

function floorScale<T extends { hp: number; attack: number; defense: number }>(type: T, floor: number): T {
  if (floor <= 1) return type;
  const depth = floor - 1;
  const hpMult = Math.min(20, 1 + 0.4 * depth);
  return {
    ...type,
    hp:      Math.max(type.hp, Math.round(type.hp * hpMult)),
    attack:  type.attack + Math.floor(depth * 0.9),
    defense: type.defense + Math.floor(depth * 0.4),
  };
}

// Boss-kill tier scaling stacks on top of floor depth.
// Each tier: +50% HP, +2 ATK, +1 DEF for regular enemies; +60% HP, +3 ATK for bosses.
function scaleEnemy<T extends { hp: number; attack: number; defense: number }>(type: T, tier: number): T {
  if (tier <= 0) return type;
  return {
    ...type,
    hp:      Math.round(type.hp * (1 + 0.5 * tier)),
    attack:  type.attack + tier * 2,
    defense: type.defense + tier,
  };
}

function scaleBoss<T extends { hp: number; attack: number; defense: number }>(type: T, tier: number): T {
  if (tier <= 0) return type;
  return {
    ...type,
    hp:     Math.round(type.hp * (1 + 0.6 * tier)),
    attack: type.attack + tier * 3,
  };
}

export function spawnEnemies(floor: number, rooms: Room[], _playerPos: Position, difficultyTier = 0, map?: MapGrid): Enemy[] {
  const enemies: Enemy[] = [];
  const pressure = getDungeonPressure(floor);
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    if (room.theme === 'shop' || room.theme === 'market' || room.theme === 'restaurant') continue;
    if (room.theme === 'treasure-vault' || room.theme === 'volcano') continue;
    if (room.theme === 'bush-ambush') {
      const n = rollAmbushCount();
      const cover: Position[] = [];
      const open: Position[] = [];
      for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
        for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
          if (map && map[ry][rx].type !== 'floor') continue;
          if (!map) { open.push({ x: rx, y: ry }); continue; }
          const nearBush = [-1, 0, 1].some(dy =>
            [-1, 0, 1].some(dx => (dx || dy) && map[ry + dy]?.[rx + dx]?.type === 'bush')
          );
          (nearBush ? cover : open).push({ x: rx, y: ry });
        }
      }
      const spots = [
        ...cover.sort(() => Math.random() - 0.5),
        ...open.sort(() => Math.random() - 0.5),
      ];
      for (let j = 0; j < n && j < spots.length; j++) {
        const pos = spots[j];
        const rawType = getAmbushRangedType();
        const base = scaleEnemy(floorScale(rawType, floor), difficultyTier);
        const type = pressure.atk > 0
          ? { ...base, attack: base.attack + pressure.atk, defense: base.defense + pressure.def }
          : base;
        enemies.push({
          ...type,
          ranged: true,
          id: `ambush-${i}-${j}-${Math.random()}`,
          pos,
          maxHp: type.hp,
          engaged: false,
          spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
        });
      }
      continue;
    }
    if (room.theme === 'boss') {
      const rawBoss = getBossForFloor(floor);
      const bossBase = scaleBoss(floorScale(rawBoss, floor), difficultyTier);
      const bossType = pressure.atk > 0
        ? { ...bossBase, attack: bossBase.attack + pressure.atk, defense: bossBase.defense + pressure.def }
        : bossBase;
      const cx = room.x + Math.floor(room.w / 2);
      const cy = room.y + Math.floor(room.h / 2);
      enemies.push({
        ...bossType,
        id: `boss-${i}-${Math.random()}`,
        pos: { x: cx, y: cy },
        maxHp: bossType.hp,
        engaged: false,
        isBoss: true,
        spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
      });
      continue;
    }
    if (room.theme === 'monster-den') {
      for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
        for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
          if ((rx + ry) % 2 !== 0) continue;
          const base = scaleEnemy(floorScale(getRandomEnemy(floor, difficultyTier), floor), difficultyTier);
          const type = pressure.atk > 0
            ? { ...base, attack: base.attack + pressure.atk, defense: base.defense + pressure.def }
            : base;
          enemies.push({
            ...type,
            id: `den-${i}-${ry}-${rx}-${Math.random()}`,
            pos: { x: rx, y: ry },
            maxHp: type.hp,
            engaged: false,
            spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
          });
        }
      }
      continue;
    }
    const densityBonus = Math.floor(floor / 5);
    const baseCount = 1 + Math.floor(Math.random() * Math.min(3, 1 + Math.floor(floor / 2))) + densityBonus;
    const count = Math.min(6, baseCount + Math.floor(difficultyTier / 2));
    const roomEnemyStart = enemies.length;
    for (let j = 0; j < count; j++) {
      const rawType = room.theme === 'forest' ? getForestEnemy(floor) : getRandomEnemy(floor, difficultyTier);
      const base = scaleEnemy(floorScale(rawType, floor), difficultyTier);
      const type = pressure.atk > 0
        ? { ...base, attack: base.attack + pressure.atk, defense: base.defense + pressure.def }
        : base;
      const ex = room.x + 1 + Math.floor(Math.random() * (room.w - 2 || 1));
      const ey = room.y + 1 + Math.floor(Math.random() * (room.h - 2 || 1));
      let spawnPos: Position = { x: ex, y: ey };
      let spawnBounds: { x: number; y: number; w: number; h: number } | undefined =
        { x: room.x, y: room.y, w: room.w, h: room.h };
      if ('waterAggro' in type && type.waterAggro && map) {
        const waterTiles: Position[] = [];
        for (let wy = 1; wy < map.length - 1; wy++) {
          for (let wx = 1; wx < map[0].length - 1; wx++) {
            if (map[wy][wx].type === 'water') waterTiles.push({ x: wx, y: wy });
          }
        }
        if (waterTiles.length > 0) {
          spawnPos = waterTiles[Math.floor(Math.random() * waterTiles.length)];
          spawnBounds = undefined;
        }
      }
      enemies.push({
        ...type,
        id: `e${i}-${j}-${Math.random()}`,
        pos: spawnPos,
        maxHp: type.hp,
        engaged: false,
        spawnRoomBounds: spawnBounds,
      });
    }
    if (floor >= 6 && enemies.length > roomEnemyStart) {
      const echoChance = 0.08 + Math.random() * 0.04;
      if (Math.random() < echoChance) {
        const echoBoss = getBossForFloor(floor - 5);
        const rawEcho = getEchoEnemy(echoBoss);
        const echoBase = scaleEnemy(floorScale(rawEcho, floor), difficultyTier);
        const echoType = pressure.atk > 0
          ? { ...echoBase, attack: echoBase.attack + pressure.atk, defense: echoBase.defense + pressure.def }
          : echoBase;
        const replaceIdx = roomEnemyStart + Math.floor(Math.random() * (enemies.length - roomEnemyStart));
        const replacePos = enemies[replaceIdx].pos;
        enemies[replaceIdx] = {
          ...echoType,
          id: `echo-${i}-${Math.random()}`,
          pos: replacePos,
          maxHp: echoType.hp,
          engaged: false,
          isEcho: true,
          spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
        };
      }
    }
    if (Math.random() < adventurerSpawnChance(floor)) {
      const advType = getRandomAdventurer();
      const isAlreadyFriendly = Math.random() < 0.15;
      const favoriteEmoji = ADVENTURER_FAVORITE_EMOJIS[Math.floor(Math.random() * ADVENTURER_FAVORITE_EMOJIS.length)];
      const ax = room.x + 1 + Math.floor(Math.random() * Math.max(1, room.w - 2));
      const ay = room.y + 1 + Math.floor(Math.random() * Math.max(1, room.h - 2));
      enemies.push({
        ...advType,
        tag: isAlreadyFriendly ? 'Friendly' as const : 'Neutral' as const,
        id: `adv-${i}-${Math.random()}`,
        pos: { x: ax, y: ay },
        maxHp: advType.hp,
        engaged: false,
        favoriteEmoji,
        spawnRoomBounds: { x: room.x, y: room.y, w: room.w, h: room.h },
      });
    }
  }
  return enemies;
}

export function spawnVaultItems(rooms: Room[], playerClass?: string, floor = 1, map?: MapGrid): (EmojiItem & { pos: Position })[] {
  const items: (EmojiItem & { pos: Position })[] = [];
  for (const room of rooms) {
    if (room.theme === 'treasure-vault') {
      const cx = room.x + Math.floor(room.w / 2);
      const cy = room.y + Math.floor(room.h / 2);
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        let drop: Omit<EmojiItem, 'id' | 'consumed'>;
        if (playerClass === '🤠' && Math.random() < 0.13) {
          drop = getBulletDrop();
        } else {
          drop = Math.random() < 0.45 ? getRandomEquipmentDrop(floor) : getRandomEmojiPower();
        }
        const ox = i - Math.floor(count / 2);
        items.push({
          ...drop,
          id: `vault-${room.x}-${room.y}-${i}-${Math.random()}`,
          consumed: false,
          pos: { x: cx + ox, y: cy },
        });
      }
      continue;
    }

    if (room.theme !== 'volcano') continue;
    const lootFloor = floor + 5 + Math.floor(Math.random() * 6);
    const spots: Position[] = [];
    for (let ry = room.y; ry < room.y + room.h; ry++) {
      for (let rx = room.x; rx < room.x + room.w; rx++) {
        const t = map?.[ry]?.[rx]?.type ?? 'floor';
        if (t === 'floor' || t === 'grass') spots.push({ x: rx, y: ry });
      }
    }
    const shuffled = spots.sort(() => Math.random() - 0.5);
    const count = Math.min(shuffled.length, 3 + Math.floor(Math.random() * 3));
    for (let i = 0; i < count; i++) {
      let drop: Omit<EmojiItem, 'id' | 'consumed'>;
      if (i === 0 || Math.random() < 0.45) {
        const emoji = VOLCANO_VALUABLE_EMOJIS[Math.floor(Math.random() * VOLCANO_VALUABLE_EMOJIS.length)];
        drop = getEmojiPowerByEmoji(emoji);
      } else {
        drop = getRandomEquipmentDrop(lootFloor);
      }
      items.push({
        ...drop,
        id: `volcano-${room.x}-${room.y}-${i}-${Math.random()}`,
        consumed: false,
        pos: shuffled[i],
      });
    }
  }
  return items;
}
