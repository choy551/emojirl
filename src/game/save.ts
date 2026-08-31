import { GameState, Player, PlayerStats } from './types';

const SAVE_KEY = 'emojirl_save_v1';

/**
 * Current save-file schema version. Bump this whenever a structural migration is needed.
 * Migration steps are added to `migrateRaw()` below.
 */
const CURRENT_SCHEMA_VERSION = 1;

/** Set of schema versions this build knows how to load (after migration). */
const KNOWN_VERSIONS = new Set([1]);

/**
 * Runs in-place migrations on the raw parsed JSON object so that
 * `normalizeGameState` always receives a shape consistent with the current version.
 *
 * HOW TO ADD A MIGRATION
 * ──────────────────────
 * 1. Bump CURRENT_SCHEMA_VERSION above and add the new value to KNOWN_VERSIONS.
 * 2. Add a `case <old_version>:` block below (fall-through to the next case is
 *    intentional — every case runs until the switch exhausts).
 * 3. Mutate `raw` in-place (rename fields, change types, set defaults, etc.).
 *
 * NOTE: `migrateRaw` is only called after `loadGame()` has confirmed that
 * `raw.schemaVersion` is a known version, so no unknown-version guard is needed here.
 */
function migrateRaw(raw: Record<string, unknown>): void {
  const fromVersion = raw.schemaVersion as number;

  switch (fromVersion) {
    case 1:
      // Version 1 is current — no structural changes needed.
      break;
    // case 1:
    //   // Version 1 → 2: example migration
    //   // raw.newField = (raw.oldField as string) ?? 'default';
    //   // delete raw.oldField;
    //   break;
    default:
      break;
  }

  raw.schemaVersion = CURRENT_SCHEMA_VERSION;
}

/**
 * Applies defaults for every field in GameState (and its nested structures)
 * that might be absent in saves created before those fields were introduced.
 *
 * This is the single source of truth for save-file defaults. When a new field
 * is added to GameState, add its default here — no scattered `??=` lines needed.
 */
function normalizeGameState(raw: Record<string, unknown>): GameState {
  // ── PlayerStats ───────────────────────────────────────────────────────────
  const rawStats = (raw.player as Record<string, unknown>)?.stats as Partial<PlayerStats> ?? {};
  const stats: PlayerStats = {
    hp:                   (rawStats.hp                   as number)  ?? 10,
    maxHp:                (rawStats.maxHp                as number)  ?? 10,
    attack:               (rawStats.attack               as number)  ?? 1,
    defense:              (rawStats.defense              as number)  ?? 0,
    speed:                (rawStats.speed                as number)  ?? 1,
    evasion:              (rawStats.evasion              as number)  ?? 0,
    luck:                 (rawStats.luck                 as number)  ?? 0,
    level:                (rawStats.level                as number)  ?? 1,
    xp:                   (rawStats.xp                   as number)  ?? 0,
    moodValue:            (rawStats.moodValue            as number)  ?? 0,
    gold:                 (rawStats.gold                 as number)  ?? 0,
    // optional stats — keep undefined when absent so consumers can use `??`
    mana:                 rawStats.mana                  as number | undefined,
    maxMana:              rawStats.maxMana               as number | undefined,
    activeBuffs:          (rawStats.activeBuffs          as PlayerStats['activeBuffs']) ?? [],
    blinkStrikeCooldown:           rawStats.blinkStrikeCooldown            as number | undefined,
    blinkStrikeInstakillChain:     rawStats.blinkStrikeInstakillChain      as number | undefined,
    blinkStrikeInstakillOutOfCombat: rawStats.blinkStrikeInstakillOutOfCombat as number | undefined,
    overhealDecayTick:             rawStats.overhealDecayTick             as number | undefined,
  };

  // ── Player ────────────────────────────────────────────────────────────────
  const rawPlayer = (raw.player ?? {}) as Record<string, unknown>;
  const player: Player = {
    pos:             (rawPlayer.pos              as Player['pos'])        ?? { x: 0, y: 0 },
    emoji:           (rawPlayer.emoji            as string)               ?? '🧙',
    characterClass:  (rawPlayer.characterClass   as string)               ?? '🧙',
    ammo:            (rawPlayer.ammo             as number)               ?? 0,
    stats,
    inventory:       (rawPlayer.inventory        as Player['inventory'])  ?? [],
    bank:            (rawPlayer.bank             as Player['bank'])       ?? [],
    equipment:       (rawPlayer.equipment        as Player['equipment'])  ?? {},
    // optional fields
    trailblazerCooldown: rawPlayer.trailblazerCooldown as number | undefined,
  };

  // ── GameState ─────────────────────────────────────────────────────────────
  return {
    schemaVersion:            CURRENT_SCHEMA_VERSION,
    player,
    currentFloor:             (raw.currentFloor              as number)                  ?? 1,
    map:                      (raw.map                       as GameState['map'])         ?? [],
    enemies:                  (raw.enemies                   as GameState['enemies'])     ?? [],
    items:                    (raw.items                     as GameState['items'])       ?? [],
    turn:                     (raw.turn                      as number)                  ?? 0,
    logs:                     (raw.logs                      as GameState['logs'])        ?? [],
    floatingTexts:            (raw.floatingTexts             as GameState['floatingTexts']) ?? [],
    gameOver:                 (raw.gameOver                  as boolean)                 ?? false,
    killer:                   raw.killer                     as GameState['killer'],
    victory:                  (raw.victory                   as boolean)                 ?? false,
    levelUpPending:           (raw.levelUpPending            as boolean)                 ?? false,
    cameraOffset:             (raw.cameraOffset              as GameState['cameraOffset']) ?? { x: 0, y: 0 },
    stealthMode:              raw.stealthMode                as boolean | undefined,
    placedBombs:              (raw.placedBombs               as GameState['placedBombs']) ?? [],
    activeProjectile:         (raw.activeProjectile          as GameState['activeProjectile']) ?? null,
    pendingExplosion:         raw.pendingExplosion           as GameState['pendingExplosion'],
    pendingBeam:              raw.pendingBeam                as GameState['pendingBeam'],
    killCounts:               (raw.killCounts                as Record<string, number>)  ?? {},
    difficultyTier:           (raw.difficultyTier            as number)                  ?? 0,
    ninjaFreeMoves:           raw.ninjaFreeMoves             as number | undefined,
    highestPressureTierWarned: (raw.highestPressureTierWarned as number)                 ?? 0,
    floorAnnouncement:        (raw.floorAnnouncement as GameState['floorAnnouncement']) ?? null,
  };
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, schemaVersion: CURRENT_SCHEMA_VERSION }));
  } catch {
    // Quota exceeded or storage unavailable — fail silently
  }
}

export type LoadGameResult =
  | { kind: 'ok'; state: GameState }
  | { kind: 'corrupted' }
  | { kind: 'none' };

export function loadGame(): LoadGameResult {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { kind: 'none' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: 'corrupted' };
    }
    if (!parsed || typeof parsed !== 'object') return { kind: 'corrupted' };
    const obj = parsed as Record<string, unknown>;
    // Reject saves with a missing or unrecognised schemaVersion — these cannot
    // be safely migrated and must not be silently normalised into a bad state.
    if (typeof obj.schemaVersion !== 'number' || !KNOWN_VERSIONS.has(obj.schemaVersion)) {
      return { kind: 'corrupted' };
    }
    // Minimal structural check before normalization — missing player or map means the
    // save is structurally invalid (not just an old save with a missing optional field).
    if (!obj.player || typeof obj.player !== 'object' || !obj.map) {
      return { kind: 'corrupted' };
    }
    migrateRaw(obj);
    return { kind: 'ok', state: normalizeGameState(obj) };
  } catch {
    return { kind: 'corrupted' };
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export function getRawSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}
