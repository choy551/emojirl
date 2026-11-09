import { BUILDINGS, buildingOf, structureSurvey, type BuildingDistrict } from './cityBuildings';
import { recordRunEmojiConsume } from './meta';
import { moodMax } from './progression';
import type { MapGrid, Player, Tile } from './types';

/** One vault theme per class district. A floor keeps at most one. */
export const VAULT_DISTRICTS = ['thieves', 'arcane', 'grove', 'saloon', 'void'] as const satisfies readonly BuildingDistrict[];

const FLAVOR: Record<string, string> = {
  '🛖': 'The hut sags, but the door still latches.',
  '🏚️': 'A ruin. The roof gave up before the walls did.',
  '🌉': 'The bridge spans a gap that is not there anymore.',
  '🏗️': 'Long-forgotten construction equipment, from when the Dungeon was first built.',
  '🎭': 'The mask is smiling at nobody.',
  '⛪': 'The pews are dust. The quiet is not.',
  '🕌': 'A call to prayer, worn down to an echo.',
  '🛕': 'Offerings have petrified in their bowls.',
  '🕍': 'The lamps are cold. The steps are not.',
  '⛩️': 'The gate still marks a threshold.',
  '🏯': 'Arrow slits watch a war that ended.',
  '💒': 'Confetti has turned to grit underfoot.',
  '🗼': 'The stair stops halfway to the bell.',
  '📜': 'The scroll is blank where the spell used to be.',
  '✨': 'Glitter clings to the stone and will not leave.',
  '⛺': 'The canvas smells like old rain.',
  '🏕️': 'The fire pit is a ring of cold stones.',
  '🌿': 'The bush has grown through the flagstones.',
  '🌱': 'Something is still trying to sprout.',
  '🌽': 'The ears are dry enough to rattle.',
  '🌾': 'Wheat, cut and then forgotten.',
  '🗻': 'A peak, carved small enough to walk around.',
  '🏔️': 'Snow that never melts sits on the ridge.',
  '🗾': 'A countryside in miniature, paths and all.',
  '🌲': 'The pine is older than the room around it.',
  '🌳': 'Roots have buckled the floor.',
  '🪴': 'The planter is cracked. The plant is not.',
  '🍃': 'Leaves drift, though there is no wind.',
  '🪵': 'A stack of logs, waiting on a fire.',
  '🦅': 'The eagle is stone, and still looks hungry.',
  '🏣': 'The post slot is jammed with letters.',
  '🏥': 'The beds are made. Nobody is expected.',
  '🏦': 'The Bank looks like it was emptied long ago.',
  '🏨': 'A key is in every door, and none of them turn.',
  '🏪': 'The shelves face the aisle. They are bare.',
  '🏫': 'Chalk dust. The lesson ended mid-word.',
  '🏬': 'Every floor of the store is this one floor.',
  '⛲': 'The fountain keeps a coin no one threw.',
  '🎪': 'The tent is up. The crowd left years ago.',
  '🏤': 'Parcel tags, and no parcels.',
  '🗽': 'The monument faces a direction that is gone.',
  '🏟️': 'The stands are empty. The field is stone.',
  '🏛️': 'Columns hold up a ceiling that holds up nothing.',
  '🎡': 'The wheel is stuck between two gondolas.',
  '🎢': 'The track climbs and does not come down.',
  '🎰': 'The reels show the same three faces.',
  '🎩': 'A top hat, brushed, on a stand with no owner.',
  '👢': 'One boot. The other was never here.',
  '🌵': 'The cactus is the only thing still armed.',
  '🐴': 'The hitching post remembers a horse.',
  '🍻': 'Two mugs, stuck together by old foam.',
  '🌑': 'The eclipse does not pass.',
  '🕳️': 'The pit has a bottom. You still lean away.',
  '👻': 'A ghost, polite enough to stay in the stone.',
  '🖤': 'The heart is dark and does not beat.',
  '🌀': 'The vortex turns once, then waits.',
  '🌋': 'The crater is cold. The smell is not.',
};

const FALLBACK = 'The old stone has nothing left to say.';

export function structureFlavor(emoji: string): string {
  return FLAVOR[emoji] ?? FALLBACK;
}

const VAULT_NAME: Record<BuildingDistrict, string> = {
  thieves: 'Slums of Thieves',
  arcane: 'Arcane Sanctum',
  grove: 'Grove of Wilds',
  saloon: 'Frontier Saloon',
  void: 'Void Hollow',
};

export function districtVaultEnteredLog(district: BuildingDistrict): string {
  return `🏛️ The ${VAULT_NAME[district]} is built into a side hall.`;
}

export function districtStructures(district: BuildingDistrict) {
  return BUILDINGS.filter(building => building.district === district);
}

function origins(map: MapGrid, room: { x: number; y: number; w: number; h: number }, size: number): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  for (let y = room.y; y <= room.y + room.h - size; y++) {
    for (let x = room.x; x <= room.x + room.w - size; x++) {
      let open = true;
      for (let dy = 0; dy < size && open; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (map[y + dy]?.[x + dx]?.type !== 'floor') open = false;
        }
      }
      if (open) spots.push({ x, y });
    }
  }
  return spots;
}

/** Cluster that district's structures in a 2×2, or a 3×3 when it has enough. */
export function placeDistrictVault(
  map: MapGrid,
  room: { x: number; y: number; w: number; h: number },
  district: BuildingDistrict,
  rng: () => number = Math.random,
): boolean {
  const structures = districtStructures(district);
  if (structures.length === 0) return false;
  const size = structures.length >= 9 && origins(map, room, 3).length > 0 && rng() < 0.5 ? 3 : 2;
  const spots = origins(map, room, size);
  if (spots.length === 0) return false;
  const at = spots[Math.floor(rng() * spots.length)]!;
  const deck = structures.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  let n = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const building = deck[n % deck.length]!;
      n += 1;
      const tile: Tile = { type: 'floor', emoji: building.emoji, seen: false, visible: false };
      map[at.y + dy][at.x + dx] = tile;
    }
  }
  return true;
}

/**
 * First step surveys the structure into EmojiCB. The tile stays.
 * Later steps only show flavor.
 */
export function stepDistrictStructure(
  map: MapGrid,
  x: number,
  y: number,
  player: Player,
): { map: MapGrid; player: Player; logs: string[] } | null {
  const tile = map[y]?.[x];
  if (!tile || tile.type !== 'floor') return null;
  const building = buildingOf(tile.emoji);
  if (!building?.district) return null;
  if (tile.surveyed) {
    return { map, player, logs: [`${building.emoji} ${structureFlavor(building.emoji)}`] };
  }
  const next = map.map(row => row.slice());
  next[y][x] = { ...tile, surveyed: true };
  const surveyed = structureSurvey(player.stats.moodValue, moodMax(player.characterClass), building);
  const grant = recordRunEmojiConsume(building.emoji, 1, { emoji: building.emoji, itemId: `structure:${building.emoji}` });
  const logs = [surveyed.log];
  if (grant.notice) logs.push(grant.notice);
  return {
    map: next,
    player: { ...player, stats: { ...player.stats, moodValue: surveyed.moodValue } },
    logs,
  };
}
