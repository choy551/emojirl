export const BED_EMOJI = '🛏️';
/** Sleeps remaining on a fresh bed. Change this to retune the limit. */
export const BED_MAX_USES = 2;

/** Crops (🌱🪴🌽🌾) are omitted on purpose: they block movement, not sight or shots. */
export const PLAYER_PASSABLE_TILES = new Set(['floor', 'stairs', 'door-open', 'door-closed', 'grass', 'shrine', 'shrine-used', 'slot-shrine', 'safe-floor', 'shop-item', 'restaurant', 'boss-floor', 'campfire', 'bed', 'obsidian', 'mirror', 'bounty', 'vanity', 'auction']);
export const ENEMY_PASSABLE_TILES = new Set(['floor', 'stairs', 'door-open', 'grass', 'boss-floor', 'obsidian']);
/** Humanoids: same as enemies + closed doors (open-on-enter). */
export const HUMANOID_ENEMY_PASSABLE_TILES = new Set([...ENEMY_PASSABLE_TILES, 'door-closed']);
export const MERMAN_PASSABLE_TILES = new Set(['water']);
/** Tiles only flying creatures may enter, in addition to their normal passable set. */
export const FLYING_TILES = new Set(['water', 'lava']);
export const PASSABLE_TILES = PLAYER_PASSABLE_TILES;

/** Tiles that stop wizard bolts, bows, guns, and enemy ranged shots. Open doors too — shoot from the doorway, not through it. Bushes and crops do not block. */
export const RANGED_BLOCKING_TILES = new Set(['wall', 'tree', 'door-closed', 'door-open', 'volcano']);