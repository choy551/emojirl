import { useState, useEffect, useRef, useCallback } from 'react';
import { generateMap } from '../game/mapgen';
import { Player, Enemy, EmojiItem, GameState, Position, EquipSlot, Equipment } from '../game/types';
import { getCowboyUnarmedBonus } from '../game/combat';
import { getRandomEmojiPower } from '../game/emojis';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { getMood, MOODS } from '../game/moods';
import { getClassDef } from '../game/classes';
import { saveScore } from '../game/leaderboard';
import { saveGame, loadGame, clearSave, getRawSave } from '../game/save';
import { isStackableBagPassive, hasBagPassive, getStackableBonusLabel, getStackableCumulativeLabel, getPassiveTooltipSuffix } from '../game/passives';
import { useIsMobile } from '../hooks/use-mobile';
import { ActivePassivesPanel } from '../components/ActivePassivesPanel';
import { VirtualDpad } from '../components/VirtualDpad';
import { StatBadge } from '../components/StatBadge';
import { MiniMap } from '../components/MiniMap';
import { EnemyTooltip } from '../components/EnemyTooltip';
import { EnemyCard } from '../components/EnemyCard';
import HowToPlay from './how-to-play';
import { HotbarPanel } from '../components/HotbarPanel';
import { BankPanel } from '../components/BankPanel';
import { EquipmentTab } from '../components/EquipmentTab';
import { getEquipBonusSuffix, canEquipItem, equipRestrictionReason } from '../components/itemUtils';
import { RightSidebar } from '../components/RightSidebar';
import {
  chebyshev, computeBagPassives, applyEquipmentAndPassives, computeNinjaEvasion,
  VISION_RADIUS, hasLOS, hasLOSBetween, detectionRadius,
  eagleEyeRange, sortBagSlots, generateShopStock, generateAmmoCacheStock, generateRestaurantStock, nearestRestaurantPos,
  spawnEnemies, spawnVaultItems, xpThresholdForLevel,
  computeVisibility, visionRadiusFor, addToBag,
  getItemBuyPrice, getItemSellValue, _flashSignals,
  bfsStepToward, bfsNextStep, bfsNextStepWallHug, PLAYER_PASSABLE_TILES,
  getDungeonPressure,
} from '../game/gameHelpers';
import { useGameActions } from '../hooks/useGameActions';


export default function Game() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [autoExplore, setAutoExplore] = useState(false);
  const [autoRest, setAutoRest] = useState(false);
  const [wizardTactics, setWizardTactics] = useState<{
    mode: 'nearest' | 'furthest' | 'manual' | 'holdfire';
    manualTargetId: string | null;
  }>({ mode: 'nearest', manualTargetId: null });
  const wizardTacticsRef = useRef<{
    mode: 'nearest' | 'furthest' | 'manual' | 'holdfire';
    manualTargetId: string | null;
  }>({ mode: 'nearest', manualTargetId: null });
  const [autoStealth, setAutoStealth] = useState(() => localStorage.getItem('emojirl_vessel') === '🥷');
  const autoStealthRef = useRef(localStorage.getItem('emojirl_vessel') === '🥷');
  const [rangerMode, setRangerMode] = useState<'ranged' | 'melee' | 'flee'>('ranged');
  const rangerModeRef = useRef<'ranged' | 'melee' | 'flee'>('ranged');
  const [yeehawTurn, setYeehawTurn] = useState(-999);
  const yeehawTurnRef = useRef(-999);
  const lastCowboyFlavorTurnRef = useRef(-999);
  const [blinkTurn, setBlinkTurn] = useState(-999);
  const blinkTurnRef = useRef(-999);
  const [trailblazeTurn, setTrailblazeTurn] = useState(-999);
  const trailblazeTurnRef = useRef(-999);
  const [tacticsMenuOpen, setTacticsMenuOpen] = useState(false);
  const tacticsMenuOpenRef = useRef(false);
  const [hoveredEnemyId, setHoveredEnemyId] = useState<string | null>(null);
  const [inspectedEnemyId, setInspectedEnemyId] = useState<string | null>(null);
  const inspectedEnemyIdRef = useRef<string | null>(null);
  const [blinkTargetMode, setBlinkTargetMode] = useState(false);
  const blinkTargetModeRef = useRef(false);
  const [dirPickMode, setDirPickMode] = useState<'gun' | 'freeze' | 'boomerang' | 'bomb' | null>(null);
  const dirPickModeRef = useRef<'gun' | 'freeze' | 'boomerang' | 'bomb' | null>(null);
  const [explosionTiles, setExplosionTiles] = useState<Set<string>>(new Set());
  const explosionClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [beamTiles, setBeamTiles] = useState<Map<string, string>>(new Map());
  const gameStateRef = useRef<GameState | null>(null);
  const scoreSaved = useRef(false);
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { inspectedEnemyIdRef.current = inspectedEnemyId; }, [inspectedEnemyId]);
  useEffect(() => { blinkTargetModeRef.current = blinkTargetMode; }, [blinkTargetMode]);
  useEffect(() => { wizardTacticsRef.current = wizardTactics; }, [wizardTactics]);
  useEffect(() => { autoStealthRef.current = autoStealth; }, [autoStealth]);
  useEffect(() => { rangerModeRef.current = rangerMode; }, [rangerMode]);
  useEffect(() => { yeehawTurnRef.current = yeehawTurn; }, [yeehawTurn]);
  useEffect(() => { blinkTurnRef.current = blinkTurn; }, [blinkTurn]);
  useEffect(() => { trailblazeTurnRef.current = trailblazeTurn; }, [trailblazeTurn]);
  useEffect(() => { tacticsMenuOpenRef.current = tacticsMenuOpen; }, [tacticsMenuOpen]);
  useEffect(() => { dirPickModeRef.current = dirPickMode; }, [dirPickMode]);
  const [bankOpen, setBankOpen] = useState(false);
  const bankOpenRef = useRef(false);
  const [drownWarnSlot, setDrownWarnSlot] = useState<number | null>(null);
  const [lastBoatWarnSlot, setLastBoatWarnSlot] = useState<number | null>(null);
  const boatConfirmedRef = useRef(false);
  const [shopOpen, setShopOpen] = useState(false);
  const shopOpenRef = useRef(false);
  const [shopItems, setShopItems] = useState<EmojiItem[]>([]);
  const shopStockFloor = useRef(-1);
  useEffect(() => { shopOpenRef.current = shopOpen; }, [shopOpen]);
  // Reset shop stock whenever the floor changes so each floor's shop is generated fresh
  useEffect(() => {
    shopStockFloor.current = -1;
    setShopItems([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.currentFloor]);

  const [ammoCacheOpen, setAmmoCacheOpen] = useState(false);
  const ammoCacheOpenRef = useRef(false);
  const [restaurantOpen, setRestaurantOpen] = useState(false);
  const restaurantOpenRef = useRef(false);
  const [restaurantItems, setRestaurantItems] = useState<EmojiItem[]>([]);
  const restaurantStockFloor = useRef(-1);
  const [restaurantSoldCount, setRestaurantSoldCount] = useState(0);
  const restaurantClosedRef = useRef(false);
  useEffect(() => { restaurantOpenRef.current = restaurantOpen; }, [restaurantOpen]);
  useEffect(() => { restaurantClosedRef.current = restaurantSoldCount >= 5; }, [restaurantSoldCount]);
  useEffect(() => {
    restaurantStockFloor.current = -1;
    setRestaurantItems([]);
    setRestaurantSoldCount(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.currentFloor]);
  const [ammoCacheItems, setAmmoCacheItems] = useState<EmojiItem[]>([]);
  const ammoCacheStockFloor = useRef(-1);
  useEffect(() => { ammoCacheOpenRef.current = ammoCacheOpen; }, [ammoCacheOpen]);
  // Reset ammo cache stock on floor change
  useEffect(() => {
    ammoCacheStockFloor.current = -1;
    setAmmoCacheItems([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.currentFloor]);
  const [logOpen, setLogOpen] = useState(false);
  const logOpenRef = useRef(false);
  useEffect(() => { logOpenRef.current = logOpen; }, [logOpen]);
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  const pauseMenuOpenRef = useRef(false);
  useEffect(() => { pauseMenuOpenRef.current = pauseMenuOpen; }, [pauseMenuOpen]);
  const [showRTFM, setShowRTFM] = useState(false);
  const showRTFMRef = useRef(false);
  useEffect(() => { showRTFMRef.current = showRTFM; }, [showRTFM]);
  const [berserkerFlashId, setBerserkerFlashId] = useState<string | null>(null);
  const [emojilessFlashKey, setEmojilessFlashKey] = useState(0);
  const [bagTab, setBagTab] = useState<'hotbar' | 'equipment' | 'bank'>('hotbar');
  const [corruptedSaveWarning, setCorruptedSaveWarning] = useState(false);
  const [corruptedSaveRaw, setCorruptedSaveRaw] = useState<string | null>(null);
  const [saveCopied, setSaveCopied] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItemIdRef = useRef<string | null>(null);
  const [statCardItem, setStatCardItem] = useState<EmojiItem | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { bankOpenRef.current = bankOpen; }, [bankOpen]);
  useEffect(() => { selectedItemIdRef.current = selectedItemId; }, [selectedItemId]);
  const [focusedBagIdx, setFocusedBagIdx] = useState(0);
  const focusedBagIdxRef = useRef(0);
  const bagTabRef = useRef<'hotbar' | 'equipment' | 'bank'>('hotbar');
  useEffect(() => { focusedBagIdxRef.current = focusedBagIdx; }, [focusedBagIdx]);
  useEffect(() => { bagTabRef.current = bagTab; }, [bagTab]);
  useEffect(() => { if (bankOpen) setFocusedBagIdx(0); }, [bankOpen]);

  // Open shop when player steps onto a 🏪 tile
  useEffect(() => {
    if (!gameState) return;
    const { pos } = gameState.player;
    const tile = gameState.map[pos.y]?.[pos.x];
    if (tile?.type === 'shop-item' && tile.emoji === '🏪' && !shopOpenRef.current) {
      if (shopStockFloor.current !== gameState.currentFloor) {
        setShopItems(generateShopStock(gameState.currentFloor, gameState.player.characterClass));
        shopStockFloor.current = gameState.currentFloor;
      }
      setShopOpen(true);
    }
    if (tile?.type === 'restaurant' && !restaurantOpenRef.current) {
      if (restaurantStockFloor.current !== gameState.currentFloor) {
        setRestaurantItems(generateRestaurantStock(gameState.currentFloor));
        restaurantStockFloor.current = gameState.currentFloor;
      }
      setRestaurantOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.player.pos.x, gameState?.player.pos.y]);

  // Open ammo cache when player steps onto a 📦 tile
  useEffect(() => {
    if (!gameState) return;
    const { pos } = gameState.player;
    const tile = gameState.map[pos.y]?.[pos.x];
    if (tile?.type === 'shop-item' && tile.emoji === '📦' && !ammoCacheOpenRef.current) {
      if (ammoCacheStockFloor.current !== gameState.currentFloor) {
        setAmmoCacheItems(generateAmmoCacheStock(gameState.currentFloor, gameState.player.characterClass));
        ammoCacheStockFloor.current = gameState.currentFloor;
      }
      setAmmoCacheOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.player.pos.x, gameState?.player.pos.y]);

  // Berserker badge flash: flush the module-scope signal set inside runEnemyTurns
  useEffect(() => {
    if (!_flashSignals.berserkFlashPending) return;
    const id = _flashSignals.berserkFlashPending;
    _flashSignals.berserkFlashPending = null;
    setBerserkerFlashId(id);
    const t = setTimeout(() => setBerserkerFlashId(null), 400);
    return () => clearTimeout(t);
  }, [gameState?.turn]);

  // Divine intervention flash
  const [divineFlashId, setDivineFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!_flashSignals.divineFlashPending) return;
    const id = _flashSignals.divineFlashPending;
    _flashSignals.divineFlashPending = null;
    setDivineFlashId(id);
    const t = setTimeout(() => setDivineFlashId(null), 600);
    return () => clearTimeout(t);
  }, [gameState?.turn]);

  const [pendingFairyId, setPendingFairyId] = useState<string | null>(null);
  const pendingFairyIdRef = useRef<string | null>(null);
  useEffect(() => { pendingFairyIdRef.current = pendingFairyId; }, [pendingFairyId]);
  const [pendingMonkeyInteraction, setPendingMonkeyInteraction] = useState<{ id: string; wants: string } | null>(null);
  const [pendingAdventurerInteraction, setPendingAdventurerInteraction] = useState<string | null>(null);

  // Emoji-less flash: full-screen red vignette when player has no soul emojis
  useEffect(() => {
    if (!_flashSignals.emojilessFlashPending) return;
    _flashSignals.emojilessFlashPending = false;
    setEmojilessFlashKey(k => k + 1);
  }, [gameState?.turn]);

  // Pressure flash: brief red vignette when dungeon pressure rises
  const [pressureFlashKey, setPressureFlashKey] = useState(0);
  useEffect(() => {
    if (!_flashSignals.pressureFlashPending) return;
    _flashSignals.pressureFlashPending = false;
    setPressureFlashKey(k => k + 1);
  }, [gameState?.turn]);

  // Explosion flash: when a bomb detonates, drive the tile overlay for ~400ms
  // NOTE: no cleanup return — timer is managed via ref to prevent premature
  // cancellation when the effect re-runs as pendingExplosion clears to undefined.
  useEffect(() => {
    if (!gameState?.pendingExplosion?.length) return;
    const keys = new Set(gameState.pendingExplosion.map(p => `${p.x},${p.y}`));
    setExplosionTiles(keys);
    setGameState(s => s ? { ...s, pendingExplosion: undefined } : s);
    if (explosionClearTimerRef.current) clearTimeout(explosionClearTimerRef.current);
    explosionClearTimerRef.current = setTimeout(() => {
      setExplosionTiles(new Set());
      explosionClearTimerRef.current = null;
    }, 400);
  }, [gameState?.pendingExplosion]);

  const beamClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Blink Strike cooldown animation
  const prevBlinkCdRef = useRef<number | null>(null);
  const [blinkCdReducedFlash, setBlinkCdReducedFlash] = useState(false);
  const [blinkReadyFlash, setBlinkReadyFlash] = useState(false);
  useEffect(() => {
    const cd = gameState?.player.stats.blinkStrikeCooldown ?? 0;
    const prev = prevBlinkCdRef.current;
    if (prev !== null && cd < prev) {
      if (cd === 0) {
        setBlinkReadyFlash(true);
        setTimeout(() => setBlinkReadyFlash(false), 700);
      } else {
        setBlinkCdReducedFlash(true);
        setTimeout(() => setBlinkCdReducedFlash(false), 600);
      }
    }
    prevBlinkCdRef.current = cd;
  }, [gameState?.player.stats.blinkStrikeCooldown]);

  // Beam flash: wizard bolt / ranger arrow trail after firing (~280ms)
  // NOTE: no cleanup return — timer is managed via ref to prevent premature
  // cancellation when the effect re-runs as pendingBeam clears to undefined.
  useEffect(() => {
    if (!gameState?.pendingBeam?.positions.length) return;
    const colorMap = new Map(gameState.pendingBeam.positions.map(p => [`${p.x},${p.y}`, gameState.pendingBeam!.color]));
    if (beamClearTimerRef.current) clearTimeout(beamClearTimerRef.current);
    setBeamTiles(colorMap);
    setGameState(s => s ? { ...s, pendingBeam: undefined } : s);
    beamClearTimerRef.current = setTimeout(() => { setBeamTiles(new Map()); beamClearTimerRef.current = null; }, 280);
  }, [gameState?.pendingBeam]);

  function saveCurrentScore(state: GameState) {
    if (scoreSaved.current) return;
    scoreSaved.current = true;
    const { player, currentFloor } = state;
    const cls = getClassDef(player.characterClass);
    saveScore({
      characterClass: player.characterClass,
      className: cls.name,
      floor: currentFloor,
      level: player.stats.level,
      xp: player.stats.xp,
      timestamp: Date.now(),
      maxPressure: getDungeonPressure(currentFloor).atk,
    });
  }

  useEffect(() => {
    if (gameState?.gameOver) {
      saveCurrentScore(gameState);
      clearSave();
    }
  }, [gameState?.gameOver]);

  // ── init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // If a save exists, restore it instead of generating a new run
    const result = loadGame();
    if (result.kind === 'corrupted') {
      setCorruptedSaveRaw(getRawSave());
      clearSave();
      setCorruptedSaveWarning(true);
    } else if (result.kind === 'ok' && !result.state.gameOver) {
      setGameState({ ...result.state, killCounts: result.state.killCounts ?? {} });
      return;
    } else {
      clearSave();
    }
    const { map, startPos, rooms } = generateMap(1);
    const vessel = localStorage.getItem('emojirl_vessel') ?? '🧙';
    const cls = getClassDef(vessel);

    const startingPowers = Array.from({ length: cls.startingEmojiSlots }, (_, i) => ({
      ...getRandomEmojiPower(),
      id: `start-${i}`,
      consumed: false,
    }));

    const initialPlayer: Player = {
      pos: startPos,
      emoji: vessel,
      characterClass: vessel,
      ammo: cls.startingAmmo,
      stats: {
        hp: cls.baseStats.hp,
        maxHp: cls.baseStats.maxHp,
        attack: cls.baseStats.attack,
        defense: cls.baseStats.defense,
        luck: cls.baseStats.luck,
        speed: cls.baseStats.speed,
        evasion: cls.baseStats.evasion,
        level: 1,
        xp: 0,
        moodValue: 0,
        gold: 10,
        mana: vessel === '🧙' ? 4 : 0,
        maxMana: vessel === '🧙' ? 4 : 0,
      },
      inventory: startingPowers,
      bank: [],
      equipment: {},
    };

    setGameState({
      schemaVersion: 1,
      player: initialPlayer,
      currentFloor: 1,
      map: computeVisibility(map, startPos),
      enemies: spawnEnemies(1, rooms, startPos, 0, map),
      items: spawnVaultItems(rooms, vessel, 1),
      turn: 1,
      logs: [{ id: 'l1', text: vessel === '🤠' ? `Welcome, Cowboy. Only real Cowboys fight with their fists! Descend and collect emojis.` : `Welcome, ${cls.name}. Descend and collect emojis.`, turn: 1 }],
      floatingTexts: [],
      gameOver: false,
      victory: false,
      levelUpPending: false,
      cameraOffset: { x: 0, y: 0 },
      stealthMode: false,
      ninjaFreeMoves: 0,
      placedBombs: [],
      activeProjectile: null,
      pendingExplosion: undefined,
      pendingBeam: undefined,
      killCounts: {},
      difficultyTier: 0,
      highestPressureTierWarned: 0,
    });
  }, []);

  // ── game action hook ─────────────────────────────────────────────────────
  const {
    addLog,
    handleMove,
    handleWait,
    handleCloseDoor,
    handleUseHeal,
    applyWizardMode,
    handleCycleRangedTarget,
    applyNinjaMode,
    toggleAutoStealth,
    handleBlinkStrike,
    handleBlinkStrikeOnTarget,
    applyRangerMode,
    handleCowboyTactics,
    handlePlantBomb,
    handleFireProjectile,
    handleUseRope,
    handleUseSlot,
    handleCook,
    handleBankMove,
    handleConsumeBankItem,
    handleEquip,
    handleUnequip,
  } = useGameActions(
    {
      gameStateRef,
      wizardTacticsRef,
      autoStealthRef,
      rangerModeRef,
      yeehawTurnRef,
      lastCowboyFlavorTurnRef,
      inspectedEnemyIdRef,
      dirPickModeRef,
      boatConfirmedRef,
      blinkTurnRef,
      trailblazeTurnRef,
      restaurantClosedRef,
    },
    {
      setGameState,
      setWizardTactics,
      setAutoStealth,
      setRangerMode,
      setYeehawTurn,
      setAutoExplore,
      setAutoRest,
      setInspectedEnemyId,
      setDirPickMode,
      setBagTab,
      setBankOpen,
      setSelectedItemId,
      setDrownWarnSlot,
      setLastBoatWarnSlot,
      setPendingFairyId,
      setPendingMonkeyInteraction,
      setPendingAdventurerInteraction,
      setBlinkTurn,
      setTrailblazeTurn,
    },
  );

  // ── Blink target mode helpers ─────────────────────────────────────────────
  const exitBlinkTargetMode = useCallback(() => {
    setBlinkTargetMode(false);
    blinkTargetModeRef.current = false;
  }, []);

  const enterBlinkTargetMode = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || gs.gameOver || gs.player.characterClass !== '🥷') return;
    if ((gs.player.stats.blinkStrikeCooldown ?? 0) > 0) {
      addLog(`🥷 Blink Strike not ready — ${gs.player.stats.blinkStrikeCooldown}t remaining.`);
      return;
    }
    const targets = gs.enemies.filter(e => {
      const d = chebyshev(gs.player.pos, e.pos);
      return d >= 1 && d <= 6 && hasLOSBetween(gs.map, gs.player.pos, e.pos) && gs.map[e.pos.y]?.[e.pos.x]?.visible;
    }).sort((a, b) => chebyshev(gs.player.pos, a.pos) - chebyshev(gs.player.pos, b.pos));
    if (targets.length === 0) {
      addLog('🥷 Blink Strike — no targets in range (6 tiles, requires LOS).');
      return;
    }
    const nearest = targets[0];
    setInspectedEnemyId(nearest.id);
    inspectedEnemyIdRef.current = nearest.id;
    setBlinkTargetMode(true);
    blinkTargetModeRef.current = true;
    addLog(`⚡ Blink targeting: ${nearest.emoji} ${nearest.name} — Tab to cycle · Enter to strike · Esc to cancel`);
  }, [addLog, gameStateRef, setInspectedEnemyId, inspectedEnemyIdRef]);

  // ── autoexplore interval ─────────────────────────────────────────────────
  useEffect(() => {
    if (!autoExplore) return;
    const interval = setInterval(() => {
      const state = gameStateRef.current;
      if (!state || state.gameOver) { setAutoExplore(false); return; }

      const { player, enemies, items } = state;
      const exploreCls = player.characterClass;

      const hostileEnemies = enemies.filter(e => e.tag !== 'Friendly');
      if (exploreCls === '🧙' && hostileEnemies.some(e =>
        chebyshev(player.pos, e.pos) <= VISION_RADIUS + 1 &&
        state.map[e.pos.y]?.[e.pos.x]?.visible
      )) {
        setAutoExplore(false);
        addLog('Autoexplore stopped: enemy in sight — auto-fire engaged!');
        return;
      }
      if (hostileEnemies.some(e => chebyshev(player.pos, e.pos) <= 1)) {
        setAutoExplore(false);
        addLog('Autoexplore stopped: enemy nearby!');
        return;
      }
      // Keep friendly entities (fairies) as routing obstacles so we don't bump into them
      const friendlyBlockedSet = new Set(
        enemies.filter(e => e.tag === 'Friendly').map(e => `${e.pos.x},${e.pos.y}`)
      );
      // Collect bar (🍺) tile positions so autoexplore routes around them
      const barBlockedSet = new Set<string>();
      for (let by = 0; by < state.map.length; by++) {
        for (let bx = 0; bx < state.map[0].length; bx++) {
          const bt = state.map[by][bx];
          if (bt.type === 'shop-item' && bt.emoji === '🍺') {
            barBlockedSet.add(`${bx},${by}`);
          }
        }
      }
      const autoBlockedSet = new Set([...friendlyBlockedSet, ...barBlockedSet]);
      const exploreTile = state.map[player.pos.y]?.[player.pos.x];
      if (exploreTile?.type === 'restaurant') {
        setAutoExplore(false);
        addLog('Autoexplore stopped: \ud83c\udfea\ud83d\udd25 Restaurant found!');
        return;
      }
      if (exploreTile?.type === 'shop-item' && exploreTile.emoji === '🏪') {
        setAutoExplore(false);
        addLog('Autoexplore stopped: 🏪 shop found!');
        return;
      }
      const explorePassives = computeBagPassives(player.inventory);

      const visibleItems = items.filter(it => state.map[it.pos.y]?.[it.pos.x]?.visible);
      if (visibleItems.length > 0) {
        const itemOccupiedSet = new Set([...enemies.map(e => `${e.pos.x},${e.pos.y}`), ...barBlockedSet]);
        const itemPassable = explorePassives.canSwim
          ? new Set([...PLAYER_PASSABLE_TILES, 'water'])
          : new Set([...PLAYER_PASSABLE_TILES]);
        const reachableItems = visibleItems.filter(it =>
          bfsStepToward(state.map, player.pos, it.pos, itemOccupiedSet, itemPassable) !== null
        );
        if (reachableItems.length > 0) {
          const closest = reachableItems.reduce((a, b) =>
            chebyshev(player.pos, a.pos) <= chebyshev(player.pos, b.pos) ? a : b
          );
          const nextPos = bfsStepToward(state.map, player.pos, closest.pos, itemOccupiedSet, itemPassable);
          if (nextPos) {
            handleMove(nextPos.x - player.pos.x, nextPos.y - player.pos.y);
            return;
          }
        }
      }

      // Auto-rest first if HP or MP (Wizard) isn't full and no enemies are visible
      const exploreIsWizard = player.characterClass === '🧙';
      const exploreMpFull = !exploreIsWizard || (player.stats.mana ?? 0) >= (player.stats.maxMana ?? 4);
      if (player.stats.hp < player.stats.maxHp || !exploreMpFull) {
        const anyVisibleEnemy = enemies.some(
          e => state.map[e.pos.y]?.[e.pos.x]?.visible
        );
        if (!anyVisibleEnemy) {
          handleWaitRef.current?.();
          return;
        }
      }

      const useWallHug = player.characterClass === '🥷' && autoStealthRef.current;
      const step = useWallHug
        ? bfsNextStepWallHug(state.map, player.pos, explorePassives.canSwim, autoBlockedSet)
        : bfsNextStep(state.map, player.pos, explorePassives.canSwim, autoBlockedSet);
      if (!step) {
        let stairsTarget: Position | null = null;
        for (let sy = 0; sy < state.map.length && !stairsTarget; sy++) {
          for (let sx = 0; sx < state.map[0].length && !stairsTarget; sx++) {
            if (state.map[sy][sx].type === 'stairs') stairsTarget = { x: sx, y: sy };
          }
        }
        if (!stairsTarget || chebyshev(player.pos, stairsTarget) <= 1) {
          setAutoExplore(false);
          addLog(stairsTarget ? 'Autoexplore: floor cleared — 🕳️ stairs are right here!' : 'Autoexplore: nothing left to explore.');
          return;
        }
        const occupiedSet = new Set([...enemies.map(e => `${e.pos.x},${e.pos.y}`), ...barBlockedSet]);
        const stairsPassable = explorePassives.canSwim
          ? new Set([...PLAYER_PASSABLE_TILES, 'water', 'stairs'])
          : new Set([...PLAYER_PASSABLE_TILES, 'stairs']);
        const nextPos = bfsStepToward(state.map, player.pos, stairsTarget, occupiedSet, stairsPassable);
        if (!nextPos || (nextPos.x === stairsTarget.x && nextPos.y === stairsTarget.y)) {
          setAutoExplore(false);
          addLog('Autoexplore: floor cleared — 🕳️ stairs are right here!');
          return;
        }
        handleMove(nextPos.x - player.pos.x, nextPos.y - player.pos.y);
        return;
      }
      handleMove(step[0], step[1]);
    }, 150);
    return () => clearInterval(interval);
  }, [autoExplore, handleMove, addLog]);

  // Ref so autoexplore can call handleWait without stale closure
  const handleWaitRef = useRef<(() => void) | null>(null);
  useEffect(() => { handleWaitRef.current = handleWait; }, [handleWait]);

  // ── auto-rest interval ────────────────────────────────────────────────────
  // Heals faster (shorter tick interval) the more HP the player currently has.
  // This reduces real-world waiting time as the player recovers, without changing manual wait (Z).
  useEffect(() => {
    if (!autoRest) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const state = gameStateRef.current;
      if (!state || state.gameOver || !autoRest) {
        setAutoRest(false);
        return;
      }

      const isWizard = state.player.characterClass === '🧙';
      const hpFull = state.player.stats.hp >= state.player.stats.maxHp;
      const mpFull = !isWizard || (state.player.stats.mana ?? 0) >= (state.player.stats.maxMana ?? 4);
      if (hpFull && mpFull) {
        setAutoRest(false);
        addLog('Fully rested.');
        return;
      }

      const passives = computeBagPassives(state.player.inventory);
      const safeRadius = visionRadiusFor(state.player.characterClass, state.player.stats.level) + passives.losBonus;
      const { x: px, y: py } = state.player.pos;
      const hasVisibleEnemy = state.enemies.some(e => {
        if (!state.map[e.pos.y]?.[e.pos.x]?.visible) return false;
        if (passives.trueVision) {
          const dist = Math.max(Math.abs(e.pos.x - px), Math.abs(e.pos.y - py));
          return dist <= safeRadius;
        }
        return true;
      });
      if (hasVisibleEnemy) {
        setAutoRest(false);
        addLog('Auto-rest interrupted — danger nearby!');
        return;
      }

      handleWait();

      // Re-read live state after the wait to compute dynamic speed.
      // Faster (smaller delay) the higher the current HP ratio.
      const curr = gameStateRef.current;
      if (!curr) return;
      const hp = curr.player.stats.hp;
      const maxHp = curr.player.stats.maxHp || 1;
      const ratio = Math.max(0, Math.min(1, hp / maxHp));
      const delay = Math.max(60, Math.floor(260 - 200 * ratio));
      timeout = setTimeout(tick, delay);
    };

    timeout = setTimeout(tick, 200);
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [autoRest, handleWait, addLog]);

  // ── keyboard ─────────────────────────────────────────────────────────────
  const heldKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const MOVE_KEYS = new Set([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'w', 'a', 's', 'd',
      'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
    ]);

    const getDxDy = (keys: Set<string>): [number, number] | null => {
      if (keys.has('Numpad7')) return [-1, -1];
      if (keys.has('Numpad8')) return [0, -1];
      if (keys.has('Numpad9')) return [1, -1];
      if (keys.has('Numpad4')) return [-1, 0];
      if (keys.has('Numpad6')) return [1, 0];
      if (keys.has('Numpad1')) return [-1, 1];
      if (keys.has('Numpad2')) return [0, 1];
      if (keys.has('Numpad3')) return [1, 1];
      const up    = keys.has('ArrowUp')    || keys.has('w');
      const down  = keys.has('ArrowDown')  || keys.has('s');
      const left  = keys.has('ArrowLeft')  || keys.has('a');
      const right = keys.has('ArrowRight') || keys.has('d');
      const dx = (right ? 1 : 0) - (left ? 1 : 0);
      const dy = (down  ? 1 : 0) - (up   ? 1 : 0);
      return dx === 0 && dy === 0 ? null : [dx, dy];
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // ── RTFM overlay: let the browser scroll natively, only Esc closes ────
      if (showRTFMRef.current) {
        if (e.key === 'Escape') { e.preventDefault(); setShowRTFM(false); setPauseMenuOpen(true); }
        return;
      }
      if (e.code === 'NumLock') { e.preventDefault(); return; }
      const isNumpad = e.code.startsWith('Numpad');

      // ── Bank modal intercept ───────────────────────────────────────────────
      if (e.key === '/' || e.code === 'NumpadDivide') { e.preventDefault(); setLogOpen(v => !v); return; }

      // ── Fairy healing dialogue intercept ──────────────────────────────────
      if (pendingFairyIdRef.current) {
        e.preventDefault();
        if (e.key === 'Enter' || e.code === 'Space') {
          const fairyId = pendingFairyIdRef.current;
          const fairy = gameStateRef.current?.enemies.find(en => en.id === fairyId);
          if (fairy) {
            setGameState(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                player: { ...prev.player, stats: { ...prev.player.stats, hp: prev.player.stats.maxHp } },
                enemies: prev.enemies.filter(e => e.id !== fairyId),
                logs: [{ id: Math.random().toString(), text: `🧚‍♀️ ${fairy.name} heals you to full HP! ✨`, turn: prev.turn }, ...prev.logs].slice(0, 24),
              };
            });
          }
          setPendingFairyId(null);
        } else if (e.key === 'Escape' || e.key === 'Shift') {
          setPendingFairyId(null);
        }
        return;
      }

      // ── Shop modal intercept ───────────────────────────────────────────────
      if (shopOpenRef.current) {
        e.preventDefault();
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') { setShopOpen(false); return; }
        return;
      }

      // ── Ammo cache modal intercept ─────────────────────────────────────────
      if (ammoCacheOpenRef.current) {
        e.preventDefault();
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') { setAmmoCacheOpen(false); return; }
        return;
      }
      if (restaurantOpenRef.current) {
        e.preventDefault();
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') { setRestaurantOpen(false); return; }
        return;
      }

      if (bankOpenRef.current) {
        e.preventDefault();

        // Tab / Shift+Tab: cycle bag tabs
        if (e.key === 'Tab') {
          const tabs = ['hotbar', 'equipment', 'bank'] as const;
          const cur = tabs.indexOf(bagTabRef.current);
          const next = e.shiftKey ? (cur + 2) % 3 : (cur + 1) % 3;
          setBagTab(tabs[next]); setFocusedBagIdx(0); return;
        }

        // B: close modal
        if (e.key === 'b') { setBankOpen(false); setSelectedItemId(null); return; }
        // Esc: deselect first, then close
        if (e.key === 'Escape') {
          if (selectedItemIdRef.current) { setSelectedItemId(null); return; }
          setBankOpen(false); return;
        }
        // Bare Shift: context-dependent cancel — only deselects if something is selected.
        // Does nothing otherwise so Shift+Tab can fire its Tab event next.
        if (e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey) {
          if (selectedItemIdRef.current) { setSelectedItemId(null); }
          return;
        }

        // 1–9: quick-assign selected item to hotbar slot
        if (/^[1-9]$/.test(e.key) && !isNumpad && selectedItemIdRef.current) {
          handleBankMove(selectedItemIdRef.current, parseInt(e.key) - 1);
          setSelectedItemId(null); return;
        }

        // Directional cursor: arrows / WASD / numpad
        const gs = gameStateRef.current;
        const bagNav = (() => {
          const k = e.key; const c = e.code;
          if (k === 'ArrowRight' || k === 'd' || c === 'Numpad6') return { dx:  1, dy:  0 };
          if (k === 'ArrowLeft'  || k === 'a' || c === 'Numpad4') return { dx: -1, dy:  0 };
          if (k === 'ArrowDown'  || k === 's' || c === 'Numpad2') return { dx:  0, dy:  1 };
          if (k === 'ArrowUp'    || k === 'w' || c === 'Numpad8') return { dx:  0, dy: -1 };
          return null;
        })();
        if (bagNav && gs) {
          const tab = bagTabRef.current;
          const allEqItems = [
            ...gs.player.inventory.filter(i => i.isEquipment && !i.consumed),
            ...gs.player.bank.filter(i => i.isEquipment && !i.consumed),
          ];
          const { count, cols } =
            tab === 'hotbar'   ? { count: 9, cols: 3 } :
            tab === 'bank'     ? { count: new Set(gs.player.bank.filter(i => !i.isEquipment).map(i => `${i.name}|${i.emoji}|${i.activeKind ?? ''}`)).size, cols: 4 } :
            /* equipment */      { count: allEqItems.length, cols: 4 };
          if (count > 0) {
            setFocusedBagIdx(prev => Math.max(0, Math.min(count - 1, prev + bagNav.dx + bagNav.dy * cols)));
          }
          return;
        }

        // Enter / NumpadEnter / Space: activate focused item
        if (e.key === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
          if (!gs) return;
          const tab = bagTabRef.current;
          const idx = focusedBagIdxRef.current;
          const selId = selectedItemIdRef.current;
          const bagSlots = sortBagSlots(gs.player.inventory);
          if (tab === 'hotbar') {
            const item = bagSlots[idx] ?? null;
            if (!item) { if (selId) { handleBankMove(selId, idx); setSelectedItemId(null); } }
            else if (selId === item.id) { setSelectedItemId(null); }
            else if (selId) { handleBankMove(selId, idx); setSelectedItemId(null); }
            else { setSelectedItemId(item.id); }
          } else if (tab === 'bank') {
            const item = gs.player.bank[idx];
            if (!item) return;
            if (selId === item.id) {
              // Second Enter on selected non-equipment item: pull it into the hotbar
              if (!item.isEquipment) {
                const bagNonHeal = gs.player.inventory.filter(i => i.healAmount === undefined && i.ammoAmount === undefined);
                handleBankMove(item.id, bagNonHeal.length < 9 ? bagNonHeal.length : 0);
              }
              setSelectedItemId(null);
            }
            else if (selId) { handleBankMove(selId, item.id); setSelectedItemId(null); }
            else { setSelectedItemId(item.id); }
          } else {
            const allEqItems = [
              ...gs.player.inventory.filter(i => i.isEquipment && !i.consumed),
              ...gs.player.bank.filter(i => i.isEquipment && !i.consumed),
            ];
            const item = allEqItems[idx];
            if (!item || !canEquipItem(item, gs.player.characterClass)) return;
            const slots = (item.equipSlots ?? []) as EquipSlot[];
            const emptySlot = slots.find(s => !gs.player.equipment[s]);
            const targetSlot = emptySlot ?? slots[0];
            if (targetSlot) { handleEquip(item.id, targetSlot); setSelectedItemId(null); }
            else { setSelectedItemId(selId === item.id ? null : item.id); }
          }
          return;
        }

        return;
      }

      // ── Tactics menu intercept ─────────────────────────────────────────────
      if (tacticsMenuOpenRef.current) {
        e.preventDefault();
        if (e.key === 'Escape' || e.key === 't') { setTacticsMenuOpen(false); return; }
        const mState = gameStateRef.current;
        if (!mState || mState.gameOver) { setTacticsMenuOpen(false); return; }
        const tCls = mState.player.characterClass;
        if (tCls === '🧙') {
          const WM = ['nearest', 'furthest', 'manual', 'holdfire'] as const;
          const wi = parseInt(e.key) - 1;
          if (wi >= 0 && wi < WM.length) { applyWizardMode(WM[wi]); setTacticsMenuOpen(false); }
        } else if (tCls === '🥷') {
          if (e.key === '1') { enterBlinkTargetMode(); setTacticsMenuOpen(false); }
          if (e.key === '2') { applyNinjaMode(true);  setTacticsMenuOpen(false); }
          if (e.key === '3') { applyNinjaMode(false); setTacticsMenuOpen(false); }
          if (e.key === '4') { toggleAutoStealth();   setTacticsMenuOpen(false); }
        } else if (tCls === '🧝') {
          if (e.key === '1') { applyRangerMode('ranged'); setTacticsMenuOpen(false); }
          if (e.key === '2') { applyRangerMode('melee');  setTacticsMenuOpen(false); }
          if (e.key === '3') { applyRangerMode('flee');   setTacticsMenuOpen(false); }
        } else if (tCls === '🤠') {
          if (e.key === '1') { handleCowboyTactics(); setTacticsMenuOpen(false); }
        }
        return;
      }

      // ── Pause menu intercept ──────────────────────────────────────────────
      if (pauseMenuOpenRef.current) {
        e.preventDefault();
        if (e.key === 'Escape') setPauseMenuOpen(false);
        return;
      }

      // ── Blink target mode intercept ────────────────────────────────────────
      if (blinkTargetModeRef.current) {
        if (e.key === 'Tab' || (e.key === 'i' && !e.ctrlKey && !e.metaKey)) {
          e.preventDefault();
          const gs = gameStateRef.current;
          if (gs) {
            const blinkTargets = gs.enemies.filter(en => {
              const d = chebyshev(gs.player.pos, en.pos);
              return d >= 1 && d <= 6 && hasLOSBetween(gs.map, gs.player.pos, en.pos) && gs.map[en.pos.y]?.[en.pos.x]?.visible;
            }).sort((a, b) => chebyshev(gs.player.pos, a.pos) - chebyshev(gs.player.pos, b.pos));
            if (blinkTargets.length > 0) {
              const idx = blinkTargets.findIndex(en => en.id === inspectedEnemyIdRef.current);
              const dir = e.shiftKey ? -1 : 1;
              const next = blinkTargets[(idx + dir + blinkTargets.length) % blinkTargets.length];
              setInspectedEnemyId(next.id);
              inspectedEnemyIdRef.current = next.id;
              addLog(`⚡ Blink target: ${next.emoji} ${next.name} (${chebyshev(gs.player.pos, next.pos)} tiles)`);
            }
          }
          return;
        }
        if (e.key === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          const targetId = inspectedEnemyIdRef.current;
          exitBlinkTargetMode();
          setInspectedEnemyId(null);
          inspectedEnemyIdRef.current = null;
          if (targetId) handleBlinkStrikeOnTarget(targetId);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          exitBlinkTargetMode();
          addLog('🥷 Blink Strike cancelled.');
          return;
        }
        // Any other key: exit blink mode and fall through
        exitBlinkTargetMode();
      }

      // Cycle ranged target: Tab (forward) / Shift+Tab (backward) / I (forward)
      if (e.key === 'Tab' || (e.key === 'i' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        handleCycleRangedTarget(e.shiftKey ? -1 : 1);
        return;
      }

      // Dismiss inspect / cancel direction-pick / close log / open pause menu: Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        if (dirPickModeRef.current) {
          dirPickModeRef.current = null;
          setDirPickMode(null);
          addLog('Cancelled.');
          return;
        }
        if (inspectedEnemyIdRef.current) {
          setInspectedEnemyId(null);
          return;
        }
        if (logOpenRef.current) {
          setLogOpen(false);
          return;
        }
        setPauseMenuOpen(true);
        return;
      }

      // ── Direction-pick mode: intercept movement keys ──────────────────────
      if (dirPickModeRef.current) {
        const tempKey = MOVE_KEYS.has(e.code) ? e.code : e.key;
        if (MOVE_KEYS.has(tempKey)) {
          e.preventDefault();
          const kind = dirPickModeRef.current;
          dirPickModeRef.current = null;
          setDirPickMode(null);
          // Resolve direction from the pressed key
          const tempKeys = new Set([tempKey]);
          const dir = getDxDy(tempKeys);
          if (dir) {
            const [dx, dy] = dir;
            handleFireProjectile(kind, dx, dy);
          }
          return;
        }
        // Non-direction key cancels dir-pick
        if (e.key === 'Escape') {
          e.preventDefault();
          dirPickModeRef.current = null;
          setDirPickMode(null);
          return;
        }
        return;
      }

      // Autoexplore toggle
      if (e.key === 'o' || e.code === 'NumpadAdd') {
        e.preventDefault();
        setAutoExplore(v => !v);
        return;
      }
      // Re-enter shop: interact keys while standing on 🏪 tile
      if (e.key === 'z' || e.code === 'Numpad5' || e.key === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        const gs = gameStateRef.current;
        if (gs) {
          const { pos } = gs.player;
          const tile = gs.map[pos.y]?.[pos.x];
          if (tile?.type === 'shop-item' && tile.emoji === '🏪') {
            e.preventDefault();
            setShopOpen(true);
            return;
          }
          if (tile?.type === 'shop-item' && tile.emoji === '📦') {
            e.preventDefault();
            setAmmoCacheOpen(true);
            return;
          }
          if (tile?.type === 'restaurant') {
            e.preventDefault();
            setRestaurantOpen(true);
            return;
          }
        }
      }
      // Wait 1 turn: z or Numpad5
      if (e.key === 'z' || e.code === 'Numpad5') {
        e.preventDefault();
        setAutoRest(false);
        handleWait();
        return;
      }
      // Auto-rest to full HP: R (rest) — upper-case only so 'r' is free for rope... but task says r=rope
      // Using Shift+R or just auto-rest via button; keeping R for auto-rest, U for rope
      if (e.key === 'r') {
        e.preventDefault();
        setAutoRest(v => !v);
        return;
      }
      // Use heal consumable: h
      if (e.key === 'h') { e.preventDefault(); handleUseHeal(); return; }
      // Cook food at campfire: f
      if (e.key === 'f') { e.preventDefault(); handleCook(); return; }
      // Close adjacent door: c
      if (e.key === 'c') { e.preventDefault(); handleCloseDoor(); return; }
      // Class tactics: t opens the tactics menu
      if (e.key === 't') { e.preventDefault(); setTacticsMenuOpen(v => !v); return; }
      // Ninja blink strike shortcut: x → instant strike on nearest enemy
      if ((e.key === 'x' || e.key === 'X') && gameStateRef.current?.player.characterClass === '🥷') { e.preventDefault(); handleBlinkStrike(); return; }


      // ── Bag: open with B ──────────────────────────────────────────────────
      if (e.key === 'b') { e.preventDefault(); setBankOpen(true); setSelectedItemId(null); return; }
      // ── Combat log: open with / ───────────────────────────────────────────
      if (logOpenRef.current && e.key !== 'Escape') {
        e.preventDefault();
        return;
      }

      // Use bag slot: digit 1–9, main keyboard only
      if (/^[1-9]$/.test(e.key) && !isNumpad && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); handleUseSlot(parseInt(e.key) - 1); return;
      }

      const key = MOVE_KEYS.has(e.code) ? e.code : e.key;
      if (!MOVE_KEYS.has(key)) return;
      e.preventDefault();
      setAutoExplore(false); // manual movement cancels autoexplore
      setAutoRest(false);    // manual movement cancels auto-rest
      setInspectedEnemyId(null); // movement dismisses inspect
      if (blinkTargetModeRef.current) exitBlinkTargetMode(); // movement cancels blink targeting
      heldKeys.current.add(key);
      const result = getDxDy(heldKeys.current);
      if (result) handleMove(result[0], result[1]);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = MOVE_KEYS.has(e.code) ? e.code : e.key;
      heldKeys.current.delete(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);

    };
  }, [handleMove, handleWait, handleUseHeal, handleCook, handleCloseDoor, handleUseSlot, handleBankMove, setAutoRest, applyWizardMode, handleCycleRangedTarget, applyNinjaMode, toggleAutoStealth, handleBlinkStrike, handleBlinkStrikeOnTarget, enterBlinkTargetMode, exitBlinkTargetMode, applyRangerMode, handleCowboyTactics, handleFireProjectile, addLog]);

  // ── render ────────────────────────────────────────────────────────────────
  if (!gameState) return <div className="p-8 text-center text-muted-foreground">Loading depths...</div>;

  const { player, currentFloor } = gameState;
  const cls = getClassDef(player.characterClass);
  const currentMood = getMood(player.stats.moodValue, player.stats.hp, player.stats.maxHp, player.inventory.filter(i => !i.consumed && !i.healAmount && !i.ammoAmount).length, player.characterClass === '🤠');
  const moodData = MOODS[currentMood];

  // ── Detection / Aggro status ───────────────────────────────────────────────
  const engagedEnemies = gameState.enemies.filter(e => e.engaged);
  const huntedByVisible = engagedEnemies.some(e => gameState.map[e.pos.y]?.[e.pos.x]?.visible);
  // Stealth only counts if no enemies have already spotted the player
  const isNinjaStealth = player.characterClass === '🥷' && (gameState.stealthMode || autoStealth) && engagedEnemies.length === 0;
  const detectionState: 'unseen' | 'seen' | 'hunted' =
    huntedByVisible ? 'hunted' :
    engagedEnemies.length > 0 ? 'seen' :
    'unseen';
  const detectionCfg = detectionState === 'hunted'
    ? { icon: '⚠️', label: 'Hunted',   color: 'text-red-400',     bg: 'bg-red-950/50 border-red-500/50',     glow: 'rgba(239,68,68,0.35)',  tip: 'Enemies have line of sight on you and are actively chasing!' }
    : detectionState === 'seen'
    ? { icon: '👁️', label: 'Seen',     color: 'text-amber-400',   bg: 'bg-amber-950/40 border-amber-500/40', glow: 'rgba(251,191,36,0.2)',  tip: 'Enemies spotted you but lost direct line of sight — still searching.' }
    : isNinjaStealth
    ? { icon: '🌫️', label: 'Stealthed', color: 'text-teal-300',   bg: 'bg-teal-900/30 border-teal-500/40',  glow: 'rgba(45,212,191,0.2)',  tip: 'Ninja Stealth active — enemies cannot detect you.' }
    : { icon: '👤', label: 'Unseen',   color: 'text-emerald-400', bg: 'bg-emerald-950/30 border-emerald-500/30', glow: 'transparent', tip: 'No enemies are aware of your position.' };

  const isAdjacentToOpenDoor = (() => {
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    return dirs.some(([dx, dy]) => {
      const nx = player.pos.x + dx;
      const ny = player.pos.y + dy;
      return ny >= 0 && ny < gameState.map.length && nx >= 0 && nx < gameState.map[0].length &&
        gameState.map[ny][nx].type === 'door-open';
    });
  })();

  const viewWidth = 20;
  const viewHeight = 14;
  const startX = Math.max(0, Math.min(gameState.map[0].length - viewWidth, player.pos.x - Math.floor(viewWidth / 2)));
  const startY = Math.max(0, Math.min(gameState.map.length - viewHeight, player.pos.y - Math.floor(viewHeight / 2)));

  // ─── Ranged-attack targeting indicators (render-time, no state needed) ────
  const wizardAutoTarget: Enemy | null = (() => {
    if (player.characterClass !== '🧙' || wizardTactics.mode === 'holdfire') return null;
    const candidates = gameState.enemies.filter(e => {
      const d = chebyshev(player.pos, e.pos);
      return d > 1 && d <= VISION_RADIUS && hasLOSBetween(gameState.map, player.pos, e.pos);
    });
    if (!candidates.length) return null;
    if (wizardTactics.mode === 'furthest')
      return [...candidates].sort((a, b) => chebyshev(player.pos, b.pos) - chebyshev(player.pos, a.pos))[0];
    if (wizardTactics.mode === 'manual')
      return candidates.find(e => e.id === wizardTactics.manualTargetId) ??
        [...candidates].sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos))[0];
    return [...candidates].sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos))[0];
  })();

  const wizardBoltPathKeys = new Set<string>();
  if (wizardAutoTarget) {
    const _wdx = wizardAutoTarget.pos.x - player.pos.x;
    const _wdy = wizardAutoTarget.pos.y - player.pos.y;
    const _wsteps = Math.max(Math.abs(_wdx), Math.abs(_wdy));
    for (let n = 1; n < _wsteps; n++) {
      wizardBoltPathKeys.add(`${Math.round(player.pos.x + (_wdx * n) / _wsteps)},${Math.round(player.pos.y + (_wdy * n) / _wsteps)}`);
    }
  }

  const rangerTargetKeys = new Set<string>();
  if (player.characterClass === '🧝' && rangerMode === 'ranged' && player.ammo > 0) {
    const _maxRange = eagleEyeRange(player.stats.level);
    for (const e of gameState.enemies) {
      if (!gameState.map[e.pos.y]?.[e.pos.x]?.visible) continue;
      const _edx = e.pos.x - player.pos.x;
      const _edy = e.pos.y - player.pos.y;
      const _dist = Math.max(Math.abs(_edx), Math.abs(_edy));
      if (_dist < 2 || _dist > _maxRange) continue;
      if (player.pos.x + Math.sign(_edx) * _dist !== e.pos.x || player.pos.y + Math.sign(_edy) * _dist !== e.pos.y) continue;
      if (hasLOS(gameState.map, player.pos, Math.sign(_edx), Math.sign(_edy), _dist))
        rangerTargetKeys.add(`${e.pos.x},${e.pos.y}`);
    }
  }

  const nearestEngagedEnemy: Enemy | null = (() => {
    const candidates = gameState.enemies.filter(e =>
      e.engaged && gameState.map[e.pos.y]?.[e.pos.x]?.visible
    );
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => chebyshev(player.pos, a.pos) - chebyshev(player.pos, b.pos))[0];
  })();

  const visibleMap = [];
  for (let y = 0; y < viewHeight; y++) {
    const row = [];
    for (let x = 0; x < viewWidth; x++) {
      const mapY = startY + y;
      const mapX = startX + x;
      if (mapY >= 0 && mapY < gameState.map.length && mapX >= 0 && mapX < gameState.map[0].length) {
        const tileData = gameState.map[mapY][mapX];
        if (!tileData.seen) {
          row.push(<div key={`${x}-${y}`} className="w-8 h-8 bg-black" />);
        } else if (!tileData.visible) {
          row.push(
            <div key={`${x}-${y}`} className="w-8 h-8 flex items-center justify-center text-2xl select-none opacity-30 grayscale">
              {tileData.emoji}
            </div>
          );
        } else {
          let displayChar = tileData.emoji;
          const groundItem = gameState.items.find(it => it.pos.x === mapX && it.pos.y === mapY);
          if (groundItem) displayChar = groundItem.emoji;
          const enemy = gameState.enemies.find(e => e.pos.x === mapX && e.pos.y === mapY);
          if (enemy) displayChar = enemy.emoji;
          const isPlayer = player.pos.x === mapX && player.pos.y === mapY;
          if (isPlayer) displayChar = player.emoji;
          // Active bomb display (countdown shown as overlay)
          const bomb = gameState.placedBombs.find(b => b.pos.x === mapX && b.pos.y === mapY);
          if (bomb && !isPlayer) displayChar = '💣';
          // Active projectile display
          const proj = gameState.activeProjectile;
          const projHere = proj && proj.pos.x === mapX && proj.pos.y === mapY;
          if (projHere) {
            displayChar = proj.kind === 'gun' ? '🔴' : proj.kind === 'freeze' ? '🔵' : proj.kind === 'bomb' ? '💣' : '🪃';
          }

          let threatDotColor: string | null = null;
          if (enemy && !isPlayer) {
            const r = detectionRadius(enemy.speed);
            if (r <= 3) threatDotColor = '#22c55e';
            else if (r <= 5) threatDotColor = '#eab308';
            else threatDotColor = '#ef4444';
          }

          // Background tints for special tile types
          let tileBg: string | undefined;
          if (tileData.type === 'safe-floor' || tileData.type === 'shop-item') tileBg = 'rgba(180,120,40,0.18)';
          else if (tileData.type === 'shrine') tileBg = 'rgba(220,170,20,0.22)';
          else if (tileData.type === 'boss-floor') tileBg = 'rgba(200,30,30,0.22)';
          else if (tileData.type === 'campfire') tileBg = 'rgba(255,140,0,0.25)';
          else if (tileData.type === 'restaurant') tileBg = 'rgba(220,60,60,0.22)';

          row.push(
            <div
              key={`${x}-${y}`}
              style={tileBg ? { background: tileBg } : undefined}
              className={`w-8 h-8 flex items-center justify-center text-2xl select-none relative${isPlayer ? ' cursor-pointer hover:brightness-125 active:scale-90 transition-transform' : ''}${enemy && !isPlayer ? ' cursor-help' : ''}`}
              onClick={isPlayer ? handleWait : (enemy && !isPlayer ? () => setHoveredEnemyId(prev => prev === enemy.id ? null : enemy.id) : undefined)}
              onMouseEnter={enemy && !isPlayer ? () => setHoveredEnemyId(enemy.id) : undefined}
              onMouseLeave={enemy && !isPlayer ? () => setHoveredEnemyId(null) : undefined}
              title={isPlayer ? 'Wait / rest (+1 HP)' : (enemy && !isPlayer ? `${enemy.name} — tap for stats` : undefined)}
              data-testid={isPlayer ? 'player-tile' : (enemy && !isPlayer ? `enemy-tile-${enemy.id}` : undefined)}
            >
              {displayChar}
              {/* Restaurant fire overlay */}
              {tileData.type === 'restaurant' && !isPlayer && !enemy && (
                <span style={{ position: 'absolute', top: -1, right: 0, fontSize: 10, lineHeight: 1, pointerEvents: 'none', zIndex: 5 }}>🔥</span>
              )}
              {/* Bomb countdown overlay */}
              {bomb && !isPlayer && (
                <span
                  style={{
                    position: 'absolute',
                    top: 1,
                    right: 3,
                    fontSize: 10,
                    fontWeight: 900,
                    color: bomb.countdown === 1 ? '#ef4444' : bomb.countdown === 2 ? '#f97316' : '#facc15',
                    textShadow: '0 0 4px rgba(0,0,0,0.9)',
                    lineHeight: 1,
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                >
                  {bomb.countdown}
                </span>
              )}
              {/* Explosion flash overlay — fades out over 400ms when bomb detonates */}
              {explosionTiles.has(`${mapX},${mapY}`) && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle, rgba(255,180,30,0.95) 0%, rgba(239,68,68,0.75) 55%, rgba(180,20,0,0.35) 100%)',
                    animation: 'explode-flash 400ms ease-out forwards',
                    borderRadius: 2,
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                />
              )}
              {threatDotColor && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: threatDotColor,
                    boxShadow: `0 0 3px ${threatDotColor}`,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {/* Wizard target — manual lock indicator */}
              {enemy && !isPlayer && wizardTactics.mode === 'manual' && wizardTactics.manualTargetId === enemy.id && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 1,
                    borderRadius: 3,
                    border: '2px solid #a78bfa',
                    boxShadow: '0 0 6px #a78bfa',
                    pointerEvents: 'none',
                    opacity: 0.9,
                  }}
                />
              )}
              {/* Wizard target — auto-target pulsing reticle (nearest / furthest modes) */}
              {enemy && !isPlayer && wizardAutoTarget?.id === enemy.id && wizardTactics.mode !== 'manual' && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 1,
                    borderRadius: 3,
                    border: '2px solid #a78bfa',
                    boxShadow: '0 0 10px #a78bfa, 0 0 20px rgba(167,139,250,0.35)',
                    animation: 'wizard-target-pulse 0.75s ease-in-out infinite alternate',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {/* Wizard bolt path — sparkle ✦ on intermediate tiles */}
              {wizardBoltPathKeys.has(`${mapX},${mapY}`) && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    color: '#c4b5fd',
                    animation: 'wizard-sparkle 0.55s ease-in-out infinite alternate',
                    pointerEvents: 'none',
                    zIndex: 6,
                    filter: 'drop-shadow(0 0 3px rgba(167,139,250,0.9))',
                  }}
                >
                  ✦
                </span>
              )}
              {/* Ranger in-range target — orange pulsing reticle */}
              {enemy && !isPlayer && rangerTargetKeys.has(`${mapX},${mapY}`) && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 1,
                    borderRadius: 3,
                    border: '2px solid #fb923c',
                    boxShadow: '0 0 8px rgba(251,146,60,0.8), 0 0 16px rgba(251,146,60,0.25)',
                    animation: 'ranger-target-pulse 0.65s ease-in-out infinite alternate',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {/* Nearest engaged enemy — combat targeting reticle */}
              {enemy && !isPlayer && nearestEngagedEnemy?.id === enemy.id && (
                <span
                  style={{
                    position: 'absolute',
                    inset: -2,
                    borderRadius: '50%',
                    border: '2px solid #ef4444',
                    boxShadow: '0 0 8px rgba(239,68,68,0.8), 0 0 16px rgba(239,68,68,0.3)',
                    animation: 'combat-reticle-pulse 0.8s ease-in-out infinite alternate',
                    pointerEvents: 'none',
                    zIndex: 7,
                  }}
                />
              )}
              {/* Beam flash — wizard bolt / ranger arrow trail after firing */}
              {beamTiles.has(`${mapX},${mapY}`) && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `radial-gradient(circle, ${beamTiles.get(`${mapX},${mapY}`)}e0 0%, ${beamTiles.get(`${mapX},${mapY}`)}55 60%, transparent 100%)`,
                    animation: 'beam-flash 280ms ease-out forwards',
                    borderRadius: 2,
                    pointerEvents: 'none',
                    zIndex: 9,
                  }}
                />
              )}
              {enemy && !isPlayer && enemy.engaged && enemy.alertedBlind && (
                <>
                  <span
                    style={{
                      position: 'absolute',
                      inset: 1,
                      borderRadius: 3,
                      border: '2px solid #f97316',
                      boxShadow: '0 0 6px rgba(249,115,22,0.7)',
                      pointerEvents: 'none',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: 11,
                      lineHeight: 1,
                      pointerEvents: 'none',
                      zIndex: 9,
                      filter: 'drop-shadow(0 0 3px rgba(249,115,22,0.8))',
                    }}
                  >
                    ⚠️
                  </span>
                </>
              )}
              {/* Silent badge — shown on visible silent enemies so players can learn the mechanic */}
              {enemy && !isPlayer && enemy.silent && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 1,
                    fontSize: 9,
                    lineHeight: 1,
                    pointerEvents: 'none',
                    zIndex: 8,
                    opacity: 0.85,
                    filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))',
                  }}
                >
                  🔇
                </span>
              )}
              {/* Berserker trait — red tint + flame badge (top-right) */}
              {enemy && !isPlayer && enemy.berserker && (
                <>
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(239,68,68,0.18)',
                      borderRadius: 2,
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 1,
                      fontSize: 9,
                      lineHeight: 1,
                      pointerEvents: 'none',
                      zIndex: 8,
                      filter: 'drop-shadow(0 0 3px rgba(239,68,68,0.95))',
                      animation: berserkerFlashId === enemy?.id
                        ? 'berserk-flash 0.35s ease-out'
                        : undefined,
                    }}
                  >
                    🔥
                  </span>
                </>
              )}
              {/* Pack-hunter trait — green tint + chain-link badge (bottom-left) */}
              {enemy && !isPlayer && enemy.packHunter && (
                <>
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(34,197,94,0.15)',
                      borderRadius: 2,
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      left: 1,
                      fontSize: 8,
                      lineHeight: 1,
                      pointerEvents: 'none',
                      zIndex: 8,
                      filter: 'drop-shadow(0 0 3px rgba(34,197,94,0.9))',
                    }}
                  >
                    🔗
                  </span>
                </>
              )}
              {/* Cowardly trait — blue faded tint */}
              {enemy && !isPlayer && enemy.cowardly && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(59,130,246,0.15)',
                    borderRadius: 2,
                    pointerEvents: 'none',
                    zIndex: 3,
                  }}
                />
              )}
              {/* Echo enemy — violet tint + ✨ badge (top-left) */}
              {enemy && !isPlayer && enemy.isEcho && (
                <>
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(139,92,246,0.18)',
                      borderRadius: 2,
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: 1,
                      left: 1,
                      fontSize: 8,
                      lineHeight: 1,
                      pointerEvents: 'none',
                      zIndex: 8,
                      filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.95))',
                    }}
                  >
                    ✨
                  </span>
                </>
              )}
              {/* God-blessed trait — gold tint + ✨ badge (bottom-right) */}
              {enemy && !isPlayer && enemy.godBlessed && (
                <>
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(250,204,21,0.18)',
                      borderRadius: 2,
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 1,
                      right: 1,
                      fontSize: 8,
                      lineHeight: 1,
                      pointerEvents: 'none',
                      zIndex: 8,
                      filter: 'drop-shadow(0 0 3px rgba(250,204,21,0.95))',
                      animation: divineFlashId === enemy?.id
                        ? 'berserk-flash 0.5s ease-out'
                        : undefined,
                    }}
                  >
                    ✨
                  </span>
                </>
              )}
              {enemy && !isPlayer && enemy.tag === 'Neutral' && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(20,184,166,0.14)',
                    borderRadius: 2,
                    pointerEvents: 'none',
                    zIndex: 3,
                  }}
                />
              )}
              {enemy && !isPlayer && enemy.tag === 'Friendly' && (
                <>
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(244,114,182,0.18)',
                      borderRadius: 2,
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 1,
                      right: 1,
                      fontSize: 8,
                      lineHeight: 1,
                      pointerEvents: 'none',
                      zIndex: 8,
                    }}
                  >
                    💗
                  </span>
                </>
              )}
            </div>
          );
        }
      } else {
        row.push(<div key={`${x}-${y}`} className="w-8 h-8 bg-black" />);
      }
    }
    visibleMap.push(<div key={`row-${y}`} className="flex">{row}</div>);
  }

  const bagSlots  = sortBagSlots(player.inventory);
  const itemInspectProps = (item: EmojiItem | null) => ({
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); if (item) setStatCardItem(item); },
    onPointerDown: (e: React.PointerEvent) => {
      if (item && (e.pointerType === 'touch' || e.pointerType === 'pen')) {
        longPressTimerRef.current = setTimeout(() => setStatCardItem(item), 500);
      }
    },
    onPointerUp:     () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
    onPointerLeave:  () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
    onPointerCancel: () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
  });
  const bagPassiveSummary = computeBagPassives(player.inventory);
  // Stack counts for stackable-passive emojis — uses stackCount on the item directly
  const stackableCounts = bagSlots.reduce<Record<string, number>>((acc, item) => {
    if (!item.consumed && isStackableBagPassive(item)) {
      acc[item.emoji] = (acc[item.emoji] ?? 0) + (item.stackCount ?? 1);
    }
    return acc;
  }, {});
  // Same but includes bank overflow (each bank item counts as +1 regardless of stackCount)
  const allStackableCounts = { ...stackableCounts };
  for (const item of player.bank) {
    if (!item.consumed && isStackableBagPassive(item)) {
      allStackableCounts[item.emoji] = (allStackableCounts[item.emoji] ?? 0) + (item.stackCount ?? 1);
    }
  }
  const healSlots = player.inventory.filter(i => i.healAmount !== undefined && !i.consumed);

  const xpThisLevel = xpThresholdForLevel(player.stats.level);
  const xpNextLevel = xpThresholdForLevel(player.stats.level + 1);
  const xpProgress  = Math.min(1, (player.stats.xp - xpThisLevel) / Math.max(1, xpNextLevel - xpThisLevel));

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden" data-testid="game-root">
      <style>{`
        @keyframes explode-flash {
          0%   { opacity: 0.92; transform: scale(1.18); }
          50%  { opacity: 0.65; transform: scale(1.06); }
          100% { opacity: 0;    transform: scale(1); }
        }
        @keyframes berserk-flash {
          0%   { transform: scale(1);    filter: drop-shadow(0 0 3px rgba(239,68,68,0.95)); }
          25%  { transform: scale(1.7);  filter: drop-shadow(0 0 8px rgba(239,68,68,1)) drop-shadow(0 0 14px rgba(251,146,60,0.9)); }
          60%  { transform: scale(1.4);  filter: drop-shadow(0 0 6px rgba(239,68,68,0.9)); }
          100% { transform: scale(1);    filter: drop-shadow(0 0 3px rgba(239,68,68,0.95)); }
        }
        @keyframes beam-flash {
          0%   { opacity: 0.85; transform: scale(0.65); }
          35%  { opacity: 0.95; transform: scale(1.08); }
          100% { opacity: 0;    transform: scale(1); }
        }
        @keyframes emojiless-flash {
          0%   { opacity: 0; }
          20%  { opacity: 0.55; }
          60%  { opacity: 0.35; }
          100% { opacity: 0; }
        }
        @keyframes pressure-flash {
          0%   { opacity: 0; }
          15%  { opacity: 0.7; }
          50%  { opacity: 0.45; }
          100% { opacity: 0; }
        }
        @keyframes wizard-target-pulse {
          0%   { box-shadow: 0 0 6px #a78bfa, 0 0 12px rgba(167,139,250,0.25); opacity: 0.7; }
          100% { box-shadow: 0 0 12px #a78bfa, 0 0 24px rgba(167,139,250,0.55); opacity: 1; }
        }
        @keyframes wizard-sparkle {
          0%   { opacity: 0.35; transform: scale(0.7) rotate(0deg); }
          100% { opacity: 1;    transform: scale(1.3) rotate(45deg); }
        }
        @keyframes ranger-target-pulse {
          0%   { box-shadow: 0 0 5px rgba(251,146,60,0.5), 0 0 10px rgba(251,146,60,0.15); opacity: 0.65; }
          100% { box-shadow: 0 0 10px rgba(251,146,60,0.95), 0 0 20px rgba(251,146,60,0.4); opacity: 1; }
        }
        @keyframes combat-reticle-pulse {
          0%   { box-shadow: 0 0 5px rgba(239,68,68,0.55), 0 0 10px rgba(239,68,68,0.18); opacity: 0.6; transform: scale(0.92); }
          100% { box-shadow: 0 0 12px rgba(239,68,68,1), 0 0 24px rgba(239,68,68,0.45); opacity: 1; transform: scale(1.08); }
        }
        @keyframes blink-cd-reduced {
          0%   { background-color: rgba(139,92,246,0.55); color: #ddd6fe; border-color: rgba(139,92,246,0.8); transform: scale(1.15); }
          60%  { background-color: rgba(109,40,217,0.35); color: #c4b5fd; border-color: rgba(109,40,217,0.5); transform: scale(1.05); }
          100% { background-color: rgba(63,63,70,0.4);   color: #a1a1aa;  border-color: rgba(82,82,91,0.4);  transform: scale(1); }
        }
        @keyframes blink-cd-ready {
          0%   { background-color: rgba(139,92,246,0.3);  color: #c4b5fd; border-color: rgba(139,92,246,0.5);  transform: scale(1); }
          25%  { background-color: rgba(167,139,250,0.7); color: #fff;    border-color: rgba(167,139,250,0.9); transform: scale(1.2); box-shadow: 0 0 10px rgba(167,139,250,0.7); }
          60%  { background-color: rgba(139,92,246,0.5);  color: #ede9fe; border-color: rgba(139,92,246,0.7);  transform: scale(1.08); }
          100% { background-color: rgba(109,40,217,0.3);  color: #e9d5ff; border-color: rgba(139,92,246,0.6);  transform: scale(1); }
        }
      `}</style>
      {/* ── Corrupted Save Warning ──────────────────────────────────── */}
      {corruptedSaveWarning && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-950/80 border-b border-amber-700/60 text-amber-200 text-xs z-50 shrink-0">
          <span>⚠️ Your save file appeared corrupted and couldn't be loaded — starting a fresh run.</span>
          <div className="flex items-center gap-2 shrink-0">
            {corruptedSaveRaw && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(corruptedSaveRaw).then(() => {
                    setSaveCopied(true);
                    setTimeout(() => setSaveCopied(false), 2500);
                  }).catch(() => {});
                }}
                className="text-amber-300 hover:text-amber-100 border border-amber-700/60 hover:border-amber-400/60 rounded px-2 py-0.5 transition-colors"
                aria-label="Copy save data to clipboard"
              >{saveCopied ? '✓ Copied!' : '📋 Copy save data'}</button>
            )}
            <button
              onClick={() => setCorruptedSaveWarning(false)}
              className="text-amber-400 hover:text-amber-100 transition-colors font-bold leading-none"
              aria-label="Dismiss"
            >✕</button>
          </div>
        </div>
      )}
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div className="h-13 bg-sidebar border-b border-border/40 flex items-center gap-2.5 px-3 shrink-0 z-10 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
        {/* Portrait + class + mode */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-2xl">{player.emoji}</div>
          <div>
            <div className="text-[11px] font-bold uppercase leading-tight tracking-wide">{cls.name} · Lv {player.stats.level}</div>
            <div className="text-[9px] text-muted-foreground/60 leading-tight">
              {player.characterClass === '🧙' && (wizardTactics.mode === 'nearest' ? '🎯 Nearest' : wizardTactics.mode === 'furthest' ? '🎯 Furthest' : wizardTactics.mode === 'manual' ? (wizardTactics.manualTargetId ? '🎯 Locked' : '🎯 Manual') : '✨ Blink')}
              {player.characterClass === '🥷' && (
                <span className="flex items-center gap-1.5">
                  <span>{autoStealth ? '🧱 Auto-Stealth' : gameState.stealthMode ? '🤫 Stealthy' : '👁️ Visible'}</span>
                  {(gameState.ninjaFreeMoves ?? 0) > 0 && (
                    <span className="px-1 py-px rounded text-[8px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/50">
                      👻×{gameState.ninjaFreeMoves}
                    </span>
                  )}
                  <span
                    className={`px-1 py-px rounded text-[8px] font-bold border ${(player.stats.blinkStrikeCooldown ?? 0) === 0 ? 'bg-violet-500/30 text-violet-200 border-violet-400/60' : 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40'}`}
                    style={blinkReadyFlash ? { animation: 'blink-cd-ready 0.7s ease-out forwards' } : blinkCdReducedFlash ? { animation: 'blink-cd-reduced 0.6s ease-out forwards' } : undefined}
                    title="Blink Strike — kills reduce cooldown by 1 (2 if unseen). Instakills: -2."
                  >
                    ⚡{(player.stats.blinkStrikeCooldown ?? 0) === 0 ? 'BLINK' : player.stats.blinkStrikeCooldown}
                  </span>
                </span>
              )}
              {player.characterClass === '🧝' && (rangerMode === 'ranged' ? '🏹 Ranged' : rangerMode === 'flee' ? '💨 Flee' : '⚔️ Melee')}
              {player.characterClass === '🤠' && (gameState.turn - yeehawTurn >= 45 ? '🤠 YEEHAW!' : `🤠 ${45 - (gameState.turn - yeehawTurn)}t`)}
            </div>
          </div>
        </div>

        <div className="h-7 w-px bg-border/40 shrink-0" />

        {/* HP bar + Wizard MP bar stacked */}
        <div className="flex flex-col gap-1 shrink-0 w-36">
          <div>
            <div className="flex justify-between text-[9px] mb-0.5">
              <span className="font-bold text-destructive">❤️ HP</span>
              {player.stats.hp > player.stats.maxHp
                ? <span className="font-bold tabular-nums text-amber-300">✨{player.stats.hp}/{player.stats.maxHp}</span>
                : <span className="font-bold tabular-nums">{player.stats.hp}/{player.stats.maxHp}</span>
              }
            </div>
            <div className="h-3.5 bg-secondary/20 rounded-full overflow-hidden border border-border/50">
              {(() => {
                const isOverheal = player.stats.hp > player.stats.maxHp;
                if (isOverheal) {
                  const overhealPct = Math.min(100, (player.stats.hp / (player.stats.maxHp * 1.5)) * 100);
                  return <div className="h-full transition-all duration-300 rounded-full animate-pulse" style={{ width: `${overhealPct}%`, backgroundColor: '#f59e0b', boxShadow: '0 0 6px #fbbf24' }} />;
                }
                const pct = (player.stats.hp / player.stats.maxHp) * 100;
                const color = pct > 60 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444';
                return <div className="h-full transition-all duration-300 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />;
              })()}
            </div>
          </div>
          {player.characterClass === '🧙' && (
            <div>
              <div className="flex justify-between text-[9px] mb-0.5">
                <span className="font-medium text-violet-400">🔵 MP</span>
                <span className="font-bold tabular-nums text-violet-300">{player.stats.mana ?? 0}/{player.stats.maxMana ?? 4}</span>
              </div>
              <div className="h-2 bg-secondary/20 rounded-full overflow-hidden border border-border/30">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(0, ((player.stats.mana ?? 0) / (player.stats.maxMana ?? 4)) * 100)}%`,
                    backgroundColor: (player.stats.mana ?? 0) > 0 ? '#8b5cf6' : '#374151',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* XP bar */}
        <div className="w-20 shrink-0">
          <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
            <span>XP</span><span>{player.stats.xp}</span>
          </div>
          <div className="h-1.5 bg-secondary/20 rounded-full overflow-hidden border border-border/30">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${xpProgress * 100}%` }} />
          </div>
        </div>

        {/* Gold + ammo (grouped) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-0.5">
            <span className="text-sm leading-none">💰</span>
            <span className="text-[11px] font-bold text-yellow-300 tabular-nums">{player.stats.gold}g</span>
          </div>
          {player.characterClass === '🧝' && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] shrink-0 ${player.ammo > 0 ? 'bg-amber-950/30 border-amber-700/40 text-amber-300' : 'bg-red-950/30 border-red-700/40 text-red-400'}`}>
              <span className="text-sm leading-none">🏹</span>
              <span className="font-bold tabular-nums">{player.ammo > 0 ? player.ammo : '—'}</span>
            </div>
          )}
          {player.characterClass === '🧝' && (
            <div
              title={(player.trailblazerCooldown ?? 0) > 0 ? `Trailblazer on cooldown — ${player.trailblazerCooldown} turn${player.trailblazerCooldown === 1 ? '' : 's'} left` : 'Trailblazer ready — springs away when enemies close in'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] shrink-0 ${(player.trailblazerCooldown ?? 0) > 0 ? 'bg-slate-900/50 border-slate-600/40 text-slate-400' : 'bg-emerald-950/30 border-emerald-700/40 text-emerald-400'}`}
            >
              <span className="text-sm leading-none">🏃</span>
              <span className="font-bold tabular-nums">{(player.trailblazerCooldown ?? 0) > 0 ? player.trailblazerCooldown : '✓'}</span>
            </div>
          )}
          {player.characterClass === '🤠' && player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun' && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] shrink-0 ${player.ammo > 0 ? 'bg-amber-950/30 border-amber-700/40 text-amber-300' : 'bg-red-950/30 border-red-700/40 text-red-400'}`}>
              <span className="text-sm leading-none">🪙</span>
              <span className="font-bold tabular-nums">{player.ammo > 0 ? player.ammo : '—'}</span>
            </div>
          )}
        </div>

        <div className="h-7 w-px bg-border/40 shrink-0" />

        {/* Mood */}
        <div className="relative group shrink-0">
          <div className="flex items-center gap-1.5 cursor-default">
            <div className="text-xl drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]">{moodData.emoji}</div>
            <div>
              <div className="text-[10px] font-bold leading-tight">{moodData.name}</div>
              <div className="text-[9px] text-primary/60 leading-tight">{moodData.description.split(',')[0]}<span className="text-primary/30">…</span></div>
            </div>
          </div>
          {/* Hover tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none
                          opacity-0 group-hover:opacity-100 transition-opacity duration-150
                          w-52 bg-black/90 border border-purple-500/40 rounded-lg p-3 shadow-xl shadow-black/60">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{moodData.emoji}</span>
              <div>
                <div className="text-[11px] font-bold text-white leading-tight">{moodData.name}</div>
                <div className="text-[9px] text-purple-300/70 leading-tight">Current Mood</div>
              </div>
            </div>
            <p className="text-[10px] text-white/80 leading-relaxed mb-2">{moodData.description}</p>
            <div className="border-t border-white/10 pt-2">
              <div className="flex justify-between text-[9px] text-white/40 mb-1">
                <span>😭 Low</span>
                <span>Mood</span>
                <span>High 😄</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(4, Math.min(100, (player.stats.moodValue + 100) / 2))}%`,
                    background: player.stats.moodValue >= 40 ? '#a855f7' : player.stats.moodValue >= 0 ? '#6366f1' : '#ef4444',
                  }}
                />
              </div>
              <div className="text-center text-[9px] text-white/30 mt-1">{player.stats.moodValue > 0 ? '+' : ''}{player.stats.moodValue}</div>
            </div>
          </div>
        </div>

        <div className="h-7 w-px bg-border/40 shrink-0" />

        {/* Detection / Aggro status */}
        <div className="relative group shrink-0">
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] transition-colors duration-300 cursor-default ${detectionCfg.bg} ${detectionCfg.color}`}
            style={{ boxShadow: detectionState !== 'unseen' || isNinjaStealth ? `0 0 8px ${detectionCfg.glow}` : 'none' }}
          >
            <span className="text-sm leading-none">{detectionCfg.icon}</span>
            <span className="font-bold leading-tight">{detectionCfg.label}</span>
            {detectionState === 'hunted' && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
            )}
          </div>
          {/* Hover tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none
                          opacity-0 group-hover:opacity-100 transition-opacity duration-150
                          w-56 bg-black/90 border border-white/10 rounded-lg p-3 shadow-xl shadow-black/60">
            <div className="text-[11px] font-bold text-white mb-1.5">Detection Status</div>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 font-semibold ${detectionState === 'unseen' && !isNinjaStealth ? 'text-emerald-400' : 'text-white/30'}`}>👤 Unseen</span>
                <span className="text-white/40">— no enemies know your position</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`shrink-0 font-semibold ${isNinjaStealth ? 'text-teal-300' : 'text-white/30'}`}>🌫️ Stealthed</span>
                <span className="text-white/40">— Ninja passive, undetectable</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`shrink-0 font-semibold ${detectionState === 'seen' ? 'text-amber-400' : 'text-white/30'}`}>👁️ Seen</span>
                <span className="text-white/40">— spotted, searching but no LOS</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`shrink-0 font-semibold ${detectionState === 'hunted' ? 'text-red-400' : 'text-white/30'}`}>⚠️ Hunted</span>
                <span className="text-white/40">— enemy has direct line of sight</span>
              </div>
            </div>
            <p className="mt-2 pt-2 border-t border-white/10 text-[10px] text-white/60 leading-snug">{detectionCfg.tip}</p>
          </div>
        </div>

        <div className="h-7 w-px bg-border/40 shrink-0" />

        {/* Stats row */}
        {(() => {
          const _ifDualGuns = player.characterClass === '🤠' && player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
          const _ifUnarmed = player.characterClass === '🤠' && !player.equipment.mainHand?.weaponKind && !player.equipment.offHand?.weaponKind;
          const hudIronFistBonus = (_ifDualGuns && player.ammo <= 0) || _ifUnarmed ? getCowboyUnarmedBonus(player.stats.level) : 0;
          const _effPlayer = applyEquipmentAndPassives(player);
          const displayedAtk = _effPlayer.stats.attack + hudIronFistBonus;
          const atkTitle = hudIronFistBonus > 0 ? `ATK ${_effPlayer.stats.attack} + ${hudIronFistBonus} Iron Fist` : '';
          const crit = Math.min(99, 5 + _effPlayer.stats.luck);
          const dodge = player.characterClass === '🥷' ? computeNinjaEvasion(_effPlayer) : Math.min(50, _effPlayer.stats.evasion ?? 0);
          return (
            <div className="flex gap-1.5 shrink-0 text-[9px]" data-testid="stat-grid">
              {[['ATK', displayedAtk, 'text-orange-400', atkTitle], ['DEF', _effPlayer.stats.defense, 'text-blue-400', ''], ['SPD', _effPlayer.stats.speed, 'text-yellow-400', ''], ['EVA', _effPlayer.stats.evasion, 'text-emerald-400', ''], ['LCK', _effPlayer.stats.luck, 'text-pink-400', '']].map(([label, val, color, title]) => (
                <div key={label as string} title={title as string || undefined} className="bg-card/60 border border-border/40 rounded px-1.5 py-0.5 flex flex-col items-center leading-none gap-0.5">
                  <span className={`font-bold ${color as string}`}>{val as number}</span>
                  <span className="text-muted-foreground/50">{label as string}</span>
                </div>
              ))}
              <div className="bg-card/60 border border-border/40 rounded px-1.5 py-0.5 flex flex-col items-center leading-none gap-0.5">
                <span className="font-bold text-rose-300">{crit}%</span>
                <span className="text-muted-foreground/50">CRIT</span>
              </div>
              <div className="bg-card/60 border border-border/40 rounded px-1.5 py-0.5 flex flex-col items-center leading-none gap-0.5">
                <span className="font-bold text-sky-300">{dodge}%</span>
                <span className="text-muted-foreground/50">DODGE</span>
              </div>
            </div>
          );
        })()}

        {/* Active food buffs */}
        {(player.stats.activeBuffs ?? []).length > 0 && (
          <>
            <div className="h-7 w-px bg-border/40 shrink-0" />
            <div className="flex gap-1 shrink-0">
              {(player.stats.activeBuffs ?? []).map((buf, i) => (
                <div
                  key={i}
                  title={`${buf.label} — ${buf.turnsLeft} turns left`}
                  className="flex items-center gap-0.5 bg-orange-950/40 border border-orange-500/40 rounded px-1.5 py-0.5 text-[9px] text-orange-300"
                >
                  <span>🍽️</span>
                  <span className="font-bold">{buf.label}</span>
                  <span className="text-orange-400/60">{buf.turnsLeft}t</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Dungeon Pressure badge (floor 16+) */}
        {(() => {
          const pressure = getDungeonPressure(currentFloor);
          if (pressure.atk === 0) return null;
          const tier = pressure.atk;
          const tierStyle =
            tier === 1
              ? { bg: 'bg-yellow-950/60', border: 'border-yellow-500/60', text: 'text-yellow-400' }
              : tier === 2
              ? { bg: 'bg-orange-950/60', border: 'border-orange-500/60', text: 'text-orange-400' }
              : { bg: 'bg-red-950/60', border: 'border-red-500/60', text: 'text-red-400' };
          const pulseClass = tier >= 3 ? 'animate-pulse' : tier === 2 ? 'animate-pulse opacity-90' : '';
          return (
            <>
              <div className="h-7 w-px bg-border/40 shrink-0" />
              <div
                title={`Dungeon Pressure Tier ${tier}: all enemies gain +${pressure.atk} ATK and +${pressure.def} DEF`}
                className={`flex items-center gap-1 ${tierStyle.bg} border ${tierStyle.border} rounded px-1.5 py-0.5 text-[9px] ${tierStyle.text} shrink-0 ${pulseClass}`}
              >
                <span>⚡</span>
                <span className="font-bold">Pressure +{tier}</span>
              </div>
            </>
          );
        })()}

        {/* Spacer + Floor + Quit */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">Floor {currentFloor}</span>
          <Button
            data-testid="button-quit"
            variant="link"
            size="sm"
            className="h-auto p-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (gameState) saveCurrentScore(gameState);
              navigate('/');
            }}
          >Quit</Button>
        </div>
      </div>

      {/* ── Main content row ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* Main Game Area */}
      <div
        className="flex-1 flex flex-col items-center justify-center relative"
        style={isMobile && !gameState.gameOver ? { paddingBottom: 200 } : undefined}
      >
        {gameState.gameOver ? (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
            <div className="text-8xl mb-4">💀</div>
            <h1 className="text-5xl font-black text-destructive mb-2 tracking-widest">YOU DIED</h1>
            {gameState.killer && (
              <p className="text-xl mb-1 text-orange-300 font-semibold">
                Slain by {gameState.killer.emoji} {gameState.killer.name}
              </p>
            )}
            <p className="text-muted-foreground mb-1">Final mood: {moodData.emoji} {moodData.name}</p>
            <p className="text-lg mb-1">Floor {currentFloor} · Level {player.stats.level} · {player.stats.xp} XP</p>
            {(() => {
              const pressure = getDungeonPressure(currentFloor);
              if (pressure.atk <= 0) return null;
              return (
                <p className="text-sm font-semibold mb-4" style={{ color: '#f97316' }}>
                  🔥 Dungeon Pressure: +{pressure.atk}
                </p>
              );
            })()}
            {gameState.logs.length > 0 && (
              <div className="mb-6 w-full max-w-sm bg-black/60 border border-border/40 rounded px-3 py-2 text-left">
                {gameState.logs.slice(0, 5).reverse().map((log, i) => (
                  <p key={log.id} className={`text-[11px] leading-5 ${i === gameState.logs.slice(0, 5).length - 1 ? 'text-foreground/80' : 'text-muted-foreground/60'}`}>{log.text}</p>
                ))}
              </div>
            )}
            <div className="flex gap-4">
              <Button data-testid="button-restart" onClick={() => window.location.reload()} size="lg">Try Again</Button>
              <Link href="/"><Button data-testid="button-menu" variant="outline" size="lg">Main Menu</Button></Link>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border p-4 shadow-2xl rounded-lg">
            <div className="flex flex-col relative">
              {visibleMap}
              {/* Enemy stat tooltip — shown on hover or keyboard inspect */}
              {(() => {
                const activeId = hoveredEnemyId ?? inspectedEnemyId;
                if (!activeId) return null;
                const hovEnemy = gameState.enemies.find(e => e.id === activeId);
                if (!hovEnemy) return null;
                const tile = gameState.map[hovEnemy.pos.y]?.[hovEnemy.pos.x];
                if (!tile?.visible) return null;
                const hvx = hovEnemy.pos.x - startX;
                const hvy = hovEnemy.pos.y - startY;
                if (hvx < 0 || hvx >= viewWidth || hvy < 0 || hvy >= viewHeight) return null;
                return (
                  <>
                    {/* Highlight ring on the inspected tile when using keyboard */}
                    {inspectedEnemyId && !hoveredEnemyId && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: hvx * 32,
                          top: hvy * 32,
                          width: 32,
                          height: 32,
                          border: '2px solid #facc15',
                          borderRadius: 4,
                          boxShadow: '0 0 6px rgba(250,204,21,0.6)',
                          zIndex: 20,
                        }}
                      />
                    )}
                    <EnemyCard
                      key={activeId}
                      enemy={hovEnemy}
                      vx={hvx}
                      vy={hvy}
                      viewWidth={viewWidth}
                      viewHeight={viewHeight}
                    />
                  </>
                );
              })()}
              {/* Persistent hunt overlays — ❓ when enemy is engaged but out of sight */}
              {gameState.enemies.map(enemy => {
                if (!enemy.engaged) return null;
                if (chebyshev(enemy.pos, player.pos) <= detectionRadius(enemy.speed)) return null;
                const tile = gameState.map[enemy.pos.y]?.[enemy.pos.x];
                if (!tile || !tile.seen || tile.visible) return null;
                const vx = enemy.pos.x - startX;
                const vy = enemy.pos.y - startY;
                if (vx < 0 || vx >= viewWidth || vy < 0 || vy >= viewHeight) return null;
                return (
                  <div
                    key={`hunt-${enemy.id}`}
                    className="absolute pointer-events-none select-none leading-none"
                    style={{
                      left: vx * 32,
                      top: vy * 32 - 10,
                      fontSize: 14,
                      zIndex: 9,
                      filter: 'drop-shadow(0 0 4px rgba(250,204,21,0.6))',
                    }}
                  >
                    ❓
                  </div>
                );
              })}
              {/* Floating alert overlays — ❗ when enemy spots the player */}
              {gameState.floatingTexts.map(ft => {
                const vx = ft.pos.x - startX;
                const vy = ft.pos.y - startY;
                if (vx < 0 || vx >= viewWidth || vy < 0 || vy >= viewHeight) return null;
                const tile = gameState.map[ft.pos.y]?.[ft.pos.x];
                if (!tile?.visible) return null;
                return (
                  <div
                    key={ft.id}
                    className="absolute pointer-events-none select-none text-sm font-bold leading-none animate-in zoom-in-50 fade-in duration-200"
                    style={{
                      left: vx * 32,
                      top: vy * 32 - 14,
                      color: ft.color ?? '#facc15',
                      textShadow: ft.color === '#ef4444'
                        ? '0 0 6px rgba(239,68,68,0.7)'
                        : ft.color === '#f97316'
                          ? '0 0 6px rgba(249,115,22,0.7)'
                          : '0 0 6px rgba(250,204,21,0.8)',
                      zIndex: 10,
                    }}
                  >
                    {ft.text}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Inspect indicator */}
        {inspectedEnemyId && !hoveredEnemyId && (() => {
          const en = gameState.enemies.find(e => e.id === inspectedEnemyId);
          return en ? (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-yellow-950/90 border border-yellow-500/60 text-yellow-300 text-xs font-semibold shadow-lg pointer-events-none select-none">
              🔍 Inspecting {en.emoji} {en.name} — Tab to cycle · Esc or move to dismiss
            </div>
          ) : null;
        })()}

        {/* Auto-rest indicator */}
        {autoRest && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-xs font-semibold shadow-lg animate-pulse pointer-events-none select-none">
            💤 Resting… (R to stop)
          </div>
        )}

        {/* Direction-pick mode indicator */}
        {blinkTargetMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-violet-950/90 border border-violet-500/60 rounded-lg px-3 py-1.5 text-xs font-bold text-violet-200 shadow-lg pointer-events-none">
            <span className="text-base leading-none">⚡</span>
            BLINK TARGET — Tab to cycle · Enter to strike · Esc to cancel
          </div>
        )}
        {dirPickMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-yellow-950/95 border border-yellow-500/80 text-yellow-200 text-sm font-bold shadow-lg animate-pulse pointer-events-none select-none flex items-center gap-2">
            <span className="text-xl">{dirPickMode === 'gun' ? '🔫' : dirPickMode === 'freeze' ? '❄️' : '🪃'}</span>
            {dirPickMode === 'gun' ? 'Gun' : dirPickMode === 'freeze' ? 'Freeze' : 'Boomerang'} — pick a direction · Esc to cancel
          </div>
        )}

        {/* Autoexplore indicator */}
        {autoExplore && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary/20 border border-primary/50 text-primary text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            ⟳ Autoexploring — press O or any direction to stop
          </div>
        )}

        {/* Combat Log */}
        <div
          onClick={() => setLogOpen(true)}
          className={`absolute left-4 right-4 h-36 bg-black/60 border border-border/60 p-3 rounded-lg overflow-hidden flex flex-col justify-end gap-0.5 cursor-pointer hover:border-border/90 transition-colors ${isMobile ? 'bottom-48' : 'bottom-4'}`}
          style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 14%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 14%)' }}
          title="Click or press / to open full log"
        >
          {gameState.logs.slice(0, 8).reverse().map((log, i) => (
            <div
              key={log.id}
              className="text-xs text-muted-foreground leading-tight animate-in fade-in slide-in-from-bottom-1"
              style={{ opacity: Math.max(0.5, 1 - i * 0.07) }}
            >{log.text}</div>
          ))}
          <span className="absolute top-1.5 right-2 text-[9px] text-muted-foreground/30 select-none pointer-events-none">/ for full log</span>
        </div>
      </div>

      {/* Full Combat Log Modal */}
      {logOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center pb-4 px-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setLogOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 shrink-0">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">📜 Combat Log</h2>
              <button onClick={() => setLogOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">ESC · /</button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1 flex flex-col-reverse">
              {gameState.logs.slice().map((log, i) => (
                <div
                  key={log.id}
                  className={`text-xs leading-snug ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  <span className="text-muted-foreground/30 mr-2 tabular-nums">T{log.turn}</span>
                  {log.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Pause Menu ───────────────────────────────────────────────────── */}
      {pauseMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setPauseMenuOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl w-72 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 border-b border-border/50 text-center">
              <div className="text-4xl mb-2">⏸</div>
              <h2 className="text-lg font-bold uppercase tracking-widest text-foreground">Paused</h2>
              <p className="text-xs text-muted-foreground/50 mt-1">Floor {gameState.currentFloor} · Turn {gameState.turn}</p>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <button
                onClick={() => setPauseMenuOpen(false)}
                className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-95 transition-all"
              >
                ▶ Resume
              </button>
              <button
                onClick={() => { setPauseMenuOpen(false); setShowRTFM(true); }}
                className="w-full py-2.5 px-4 rounded-lg bg-secondary/60 text-foreground font-medium text-sm hover:bg-secondary/80 active:scale-95 transition-all border border-border/40"
              >
                📖 RTFM
              </button>
              <button
                onClick={() => { if (gameState) saveGame(gameState); navigate('/'); }}
                className="w-full py-2.5 px-4 rounded-lg bg-destructive/20 text-destructive font-medium text-sm hover:bg-destructive/30 active:scale-95 transition-all border border-destructive/30"
              >
                💾 Save &amp; Exit
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground/30 pb-3">ESC to resume</p>
          </div>
        </div>
      )}

      {/* Tactics Menu overlay */}
      {tacticsMenuOpen && !gameState.gameOver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setTacticsMenuOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl p-5 shadow-2xl min-w-[260px] max-w-xs"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-sm font-bold uppercase tracking-widest text-center mb-4 text-muted-foreground">
              {player.characterClass} Tactics
            </div>

            {/* Wizard */}
            {player.characterClass === '🧙' && (
              <div className="space-y-1.5">
                {([
                  { n: 1, label: '🎯 Autofire — Nearest',  mode: 'nearest'  as const },
                  { n: 2, label: '🎯 Autofire — Furthest', mode: 'furthest' as const },
                  { n: 3, label: '🎯 Autofire — Manual',   mode: 'manual'   as const },
                ]).map(({ n, label, mode }) => (
                  <button key={mode}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${wizardTactics.mode === mode ? 'bg-violet-500/20 text-violet-200 font-semibold' : 'hover:bg-secondary/60'}`}
                    onClick={() => { applyWizardMode(mode); setTacticsMenuOpen(false); }}
                  >
                    <span className="font-mono text-muted-foreground w-4 shrink-0">{n}</span>
                    {label}
                    {wizardTactics.mode === mode && <span className="ml-auto text-violet-400">✓</span>}
                  </button>
                ))}
                {(() => {
                  const elapsed = gameState.turn - blinkTurn;
                  const BLINK_ACTIVE = 3, BLINK_CD = 5;
                  const isActive = wizardTactics.mode === 'holdfire' && elapsed < BLINK_ACTIVE;
                  const onCooldown = elapsed < BLINK_ACTIVE + BLINK_CD;
                  const remaining = onCooldown ? (BLINK_ACTIVE + BLINK_CD) - elapsed : 0;
                  return (
                    <button
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${isActive ? 'bg-violet-500/20 text-violet-200 font-semibold' : onCooldown ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary/60'}`}
                      onClick={() => { applyWizardMode('holdfire'); if (!onCooldown) setTacticsMenuOpen(false); }}
                    >
                      <span className="font-mono text-muted-foreground w-4 shrink-0">4</span>
                      ✨ Blink — phase through gaps &amp; enemies
                      <span className="ml-auto text-[10px] font-mono">
                        {isActive ? <span className="text-violet-300">{BLINK_ACTIVE - elapsed}t left</span> : onCooldown ? <span className="text-zinc-400">{remaining}t</span> : <span className="text-violet-400">ready</span>}
                      </span>
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Ninja */}
            {player.characterClass === '🥷' && (
              <div className="space-y-1.5">
                <button
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${(player.stats.blinkStrikeCooldown ?? 0) === 0 ? 'hover:bg-violet-500/20 text-violet-200' : 'opacity-50 cursor-default'}`}
                  onClick={() => { if ((player.stats.blinkStrikeCooldown ?? 0) === 0) { enterBlinkTargetMode(); setTacticsMenuOpen(false); } }}
                >
                  <span className="font-mono text-muted-foreground w-4 shrink-0">1</span>
                  ⚡ Blink Strike — teleport &amp; 2× damage
                  <span className="ml-auto text-[10px] font-mono">
                    {(player.stats.blinkStrikeCooldown ?? 0) === 0 ? <span className="text-violet-400">READY · X</span> : <span className="text-zinc-400">{player.stats.blinkStrikeCooldown}t</span>}
                  </span>
                </button>
                {([
                  { n: 2, label: '🤫 Stealth On — hug walls', active: !!gameState.stealthMode && !autoStealth, stealth: true  },
                  { n: 3, label: '👁️ Stealth Off — move freely', active: !gameState.stealthMode && !autoStealth, stealth: false },
                ]).map(({ n, label, active, stealth }) => (
                  <button key={n}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${active ? 'bg-slate-500/20 text-slate-200 font-semibold' : 'hover:bg-secondary/60'}`}
                    onClick={() => { applyNinjaMode(stealth); setTacticsMenuOpen(false); }}
                  >
                    <span className="font-mono text-muted-foreground w-4 shrink-0">{n}</span>
                    {label}
                    {active && <span className="ml-auto text-slate-400">✓</span>}
                  </button>
                ))}
                <button
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${autoStealth ? 'bg-violet-500/20 text-violet-200 font-semibold' : 'hover:bg-secondary/60'}`}
                  onClick={() => { toggleAutoStealth(); setTacticsMenuOpen(false); }}
                >
                  <span className="font-mono text-muted-foreground w-4 shrink-0">4</span>
                  🧱 Auto-Stealth — wall-hug explore
                  {autoStealth && <span className="ml-auto text-violet-400">✓</span>}
                </button>
              </div>
            )}

            {/* Ranger */}
            {player.characterClass === '🧝' && (
              <div className="space-y-1.5">
                {([
                  { n: 1, label: '🏹 Ranged — auto-fire bow', active: rangerMode === 'ranged', mode: 'ranged' as const },
                  { n: 2, label: '⚔️ Melee — conserve ammo',  active: rangerMode === 'melee',  mode: 'melee'  as const },
                ]).map(({ n, label, active, mode }) => (
                  <button key={mode}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${active ? 'bg-green-500/20 text-green-200 font-semibold' : 'hover:bg-secondary/60'}`}
                    onClick={() => { applyRangerMode(mode); setTacticsMenuOpen(false); }}
                  >
                    <span className="font-mono text-muted-foreground w-4 shrink-0">{n}</span>
                    {label}
                    {active && <span className="ml-auto text-green-400">✓</span>}
                  </button>
                ))}
                {(() => {
                  const elapsed = gameState.turn - trailblazeTurn;
                  const BLINK_ACTIVE = 3, BLINK_CD = 5;
                  const isActive = rangerMode === 'flee' && elapsed < BLINK_ACTIVE;
                  const onCooldown = elapsed < BLINK_ACTIVE + BLINK_CD;
                  const remaining = onCooldown ? (BLINK_ACTIVE + BLINK_CD) - elapsed : 0;
                  return (
                    <button
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${isActive ? 'bg-green-500/20 text-green-200 font-semibold' : onCooldown ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary/60'}`}
                      onClick={() => { applyRangerMode('flee'); if (!onCooldown) setTacticsMenuOpen(false); }}
                    >
                      <span className="font-mono text-muted-foreground w-4 shrink-0">3</span>
                      💨 Trailblaze — sprint 2 tiles
                      <span className="ml-auto text-[10px] font-mono">
                        {isActive ? <span className="text-green-300">{BLINK_ACTIVE - elapsed}t left</span> : onCooldown ? <span className="text-zinc-400">{remaining}t</span> : <span className="text-green-400">ready</span>}
                      </span>
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Cowboy */}
            {player.characterClass === '🤠' && (() => {
              const ready = gameState.turn - yeehawTurn >= 45;
              return (
                <div className="space-y-1.5">
                  <button
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${ready ? 'hover:bg-yellow-500/20' : 'opacity-40 cursor-not-allowed'}`}
                    onClick={() => { if (ready) { handleCowboyTactics(); setTacticsMenuOpen(false); } }}
                  >
                    <span className="font-mono text-muted-foreground w-4 shrink-0">1</span>
                    🤠 YEEHAW! (+25 mood)
                    <span className="ml-auto text-xs text-muted-foreground">
                      {ready ? 'ready!' : `${45 - (gameState.turn - yeehawTurn)}t`}
                    </span>
                  </button>
                </div>
              );
            })()}

            <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground text-center">
              press number to select · ESC or T to close
            </div>
          </div>
        </div>
      )}

      {/* Last Boat Warning */}
      {lastBoatWarnSlot !== null && gameState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setLastBoatWarnSlot(null)}>
          <div className="bg-card border border-yellow-500/60 rounded-xl p-5 max-w-xs w-full shadow-2xl shadow-yellow-900/40 text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-2">⛵</div>
            <h2 className="text-sm font-bold text-yellow-400 uppercase tracking-widest mb-1">Last Boat!</h2>
            <p className="text-xs text-white/80 mb-4">Are you sure you wanna sell your boat? You won't be able to cross water anymore!</p>
            <div className="flex gap-2">
              <button
                className="flex-1 text-xs py-2 rounded-lg bg-secondary/40 border border-border/60 text-muted-foreground hover:bg-secondary/60 transition-colors"
                onClick={() => setLastBoatWarnSlot(null)}
              >Cancel</button>
              <button
                className="flex-1 text-xs py-2 rounded-lg bg-yellow-600/80 border border-yellow-500/60 text-white font-bold hover:bg-yellow-600 transition-colors"
                onClick={() => {
                  const slot = lastBoatWarnSlot;
                  setLastBoatWarnSlot(null);
                  boatConfirmedRef.current = true;
                  handleUseSlot(slot);
                }}
              >Confirm ⛵</button>
            </div>
          </div>
        </div>
      )}

      {/* Drown Warning */}
      {drownWarnSlot !== null && gameState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setDrownWarnSlot(null)}>
          <div className="bg-card border border-red-500/60 rounded-xl p-5 max-w-xs w-full shadow-2xl shadow-red-900/40 text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-2">🌊</div>
            <h2 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-1">Danger!</h2>
            <p className="text-xs text-white/80 mb-1">You're standing on water.</p>
            <p className="text-xs text-white/60 mb-4">Consuming your ⛵ <span className="text-white font-semibold">Boat</span> here will remove your ability to swim — <span className="text-red-400 font-bold">you'll drown instantly.</span></p>
            <div className="flex gap-2">
              <button
                className="flex-1 text-xs py-2 rounded-lg bg-secondary/40 border border-border/60 text-muted-foreground hover:bg-secondary/60 transition-colors"
                onClick={() => setDrownWarnSlot(null)}
              >Cancel</button>
              <button
                className="flex-1 text-xs py-2 rounded-lg bg-red-600/80 border border-red-500/60 text-white font-bold hover:bg-red-600 transition-colors"
                onClick={() => {
                  const slot = drownWarnSlot;
                  setDrownWarnSlot(null);
                  setGameState(prev => {
                    if (!prev) return prev;
                    const bagItems = sortBagSlots(prev.player.inventory);
                    const slotItem = bagItems[slot];
                    if (!slotItem) return prev;
                    const newInventory = prev.player.inventory.filter(i => i.id !== slotItem.id);
                    addLog(`💀 You discarded your ⛵ Boat while adrift — the waves swallow you whole!`);
                    return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, hp: 0 }, inventory: newInventory }, gameOver: true };
                  });
                }}
              >Consume anyway 💀</button>
            </div>
          </div>
        </div>
      )}

      {pendingMonkeyInteraction && gameState && (() => {
        const monkey = gameState.enemies.find(e => e.id === pendingMonkeyInteraction.id);
        if (!monkey) return null;
        const { wants } = pendingMonkeyInteraction;
        const stolenCount = monkey.stolenEmojis?.length ?? 0;
        const wantsItemIdx = gameState.player.inventory.findIndex(i => !i.consumed && i.emoji === wants);
        const playerHasIt = wantsItemIdx !== -1;

        const handleGive = () => {
          if (!playerHasIt) return;
          setGameState(prev => {
            if (!prev) return prev;
            const itemIdx = prev.player.inventory.findIndex(i => !i.consumed && i.emoji === wants);
            if (itemIdx === -1) return prev;
            const remainingInv = prev.player.inventory.filter((_, i) => i !== itemIdx);
            const { inventory: _inv, bank: _bnk } = addToBag(remainingInv, prev.player.bank, ...(monkey.stolenEmojis ?? []));
            return {
              ...prev,
              player: { ...prev.player, inventory: _inv, bank: _bnk },
              enemies: prev.enemies.filter(e => e.id !== pendingMonkeyInteraction.id),
              logs: [{ id: Math.random().toString(), text: `🐒 ${monkey.name} happily takes the ${wants} and drops your emojis! 🎉`, turn: prev.turn }, ...prev.logs].slice(0, 24),
            };
          });
          setPendingMonkeyInteraction(null);
        };

        const handleAttack = () => {
          setGameState(prev => {
            if (!prev) return prev;
            const idx = prev.enemies.findIndex(e => e.id === pendingMonkeyInteraction.id);
            if (idx === -1) return prev;
            const newEnemies = [...prev.enemies];
            newEnemies[idx] = { ...newEnemies[idx], engaged: true, tag: 'Hostile' as const };
            return {
              ...prev,
              enemies: newEnemies,
              logs: [{ id: Math.random().toString(), text: `🐒 ${monkey.name} shrieks and bares its teeth — it's hostile now!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
            };
          });
          setPendingMonkeyInteraction(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-amber-400/40 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
              <div className="text-center mb-5">
                <div className="text-5xl mb-2">{monkey.emoji}</div>
                <div className="text-sm font-bold text-amber-300 mb-2">{monkey.name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed italic">
                  "Oo oo! Give {wants}... give {wants}!"
                </div>
                {stolenCount > 0 && (
                  <div className="mt-2 text-xs text-amber-400/80">
                    Holding <span className="font-semibold">{stolenCount}</span> stolen emoji{stolenCount !== 1 ? 's' : ''}: {(monkey.stolenEmojis ?? []).map(s => s.emoji).join('')}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <button
                  className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                    playerHasIt
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/35 cursor-pointer'
                      : 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
                  }`}
                  onClick={handleGive}
                  disabled={!playerHasIt}
                >
                  {playerHasIt
                    ? `Give ${wants} — get your emojis back`
                    : `Give ${wants} — you don't have one`}
                </button>
                <button
                  className="w-full py-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-semibold hover:bg-red-500/25 transition-colors"
                  onClick={handleAttack}
                >
                  ⚔️ Attack — turns it hostile
                </button>
                <button
                  className="w-full py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
                  onClick={() => setPendingMonkeyInteraction(null)}
                >
                  Back away slowly 🤫
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingFairyId && gameState && (() => {
        const fairy = gameState.enemies.find(e => e.id === pendingFairyId);
        if (!fairy) return null;
        const handleYes = () => {
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              player: { ...prev.player, stats: { ...prev.player.stats, hp: prev.player.stats.maxHp } },
              enemies: prev.enemies.filter(e => e.id !== pendingFairyId),
              logs: [{ id: Math.random().toString(), text: `🧚‍♀️ ${fairy.name} heals you to full HP! ✨`, turn: prev.turn }, ...prev.logs].slice(0, 24),
            };
          });
          setPendingFairyId(null);
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-pink-400/40 rounded-xl p-6 shadow-2xl max-w-xs w-full mx-4">
              <div className="text-center mb-5">
                <div className="text-5xl mb-2">{fairy.emoji}</div>
                <div className="text-sm font-bold text-pink-300 mb-2">{fairy.name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed italic">
                  "Hehe, you look tired~ Want me to heal you? ✨"
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-lg bg-pink-500/20 border border-pink-400/40 text-pink-200 text-sm font-semibold hover:bg-pink-500/35 transition-colors"
                  onClick={handleYes}
                >
                  Yes please 💗
                </button>
                <button
                  className="flex-1 py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
                  onClick={() => setPendingFairyId(null)}
                >
                  No thanks 🤚
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingAdventurerInteraction && gameState && (() => {
        const adv = gameState.enemies.find(e => e.id === pendingAdventurerInteraction);
        if (!adv) return null;
        const fav = adv.favoriteEmoji ?? '❓';
        const isAlreadyFriendly = adv.tag === 'Friendly';
        const playerHasIt = gameState.player.inventory.some(i => !i.consumed && i.emoji === fav);

        const ADV_LINES: Record<string, string> = {
          '🧙': `Hm, you seem capable~ I've been wandering these floors researching arcane theory. A little company wouldn't hurt. Have anything shiny for me?`,
          '🥷': `You actually spotted me. I'm impressed. I need someone worth walking alongside — prove it. What've you got?`,
          '🧝': `I've been riding solo for too long. My arrows fly true and I know these floors well. Trade me something good and I'm yours.`,
          '🤠': `Howdy, partner~ Reckon these here dungeons ain't no place to ride alone. Got anything worth a handshake deal?`,
          '🧑‍🎤': `Oh~! A protagonist! My ballad needs a hero to follow around. I'll trade my loyalty for one little trinket~`,
        };
        const flavorLine = ADV_LINES[adv.emoji] ?? `Hey, adventurer! These floors are rough alone. Got something to share?`;

        const ADV_COLORS: Record<string, string> = {
          '🧙': 'text-violet-300',
          '🥷': 'text-slate-300',
          '🧝': 'text-emerald-300',
          '🤠': 'text-amber-300',
          '🧑‍🎤': 'text-pink-300',
        };
        const nameColor = ADV_COLORS[adv.emoji] ?? 'text-cyan-300';

        const ADV_BORDER: Record<string, string> = {
          '🧙': 'border-violet-400/40',
          '🥷': 'border-slate-400/40',
          '🧝': 'border-emerald-400/40',
          '🤠': 'border-amber-400/40',
          '🧑‍🎤': 'border-pink-400/40',
        };
        const borderColor = ADV_BORDER[adv.emoji] ?? 'border-cyan-400/40';

        const ADV_FRIENDLY_LINES: Record<string, string> = {
          '🧙': `Oh, it's you! I was hoping you'd come by~ I'm ready to travel with you, no strings attached!`,
          '🥷': `I've already decided I like you. Don't make me regret it. Let's move.`,
          '🧝': `I've been waiting for the right person. Looks like that's you — shall we?`,
          '🤠': `Well, I reckon you're exactly the kind of partner I was lookin' for. Ready when you are, partner~`,
          '🧑‍🎤': `I had a good feeling about you! The ballad practically writes itself. Come on, let's go~`,
        };
        const friendlyLine = ADV_FRIENDLY_LINES[adv.emoji] ?? `I'm already on your side — let's go!`;

        const handleGive = () => {
          if (!playerHasIt) return;
          setGameState(prev => {
            if (!prev) return prev;
            const itemIdx = prev.player.inventory.findIndex(i => !i.consumed && i.emoji === fav);
            if (itemIdx === -1) return prev;
            const newInventory = prev.player.inventory.filter((_, idx) => idx !== itemIdx);
            return {
              ...prev,
              player: { ...prev.player, inventory: newInventory },
              enemies: prev.enemies.map(e =>
                e.id === pendingAdventurerInteraction
                  ? { ...e, tag: 'Friendly' as const, engaged: false, isRecruited: true }
                  : e
              ),
              logs: [{ id: Math.random().toString(), text: `🤝 ${adv.emoji} ${adv.name} beams with joy! "${fav}?! For me?!" — joins as your companion!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
            };
          });
          setPendingAdventurerInteraction(null);
        };

        const handleAcceptFriendly = () => {
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              enemies: prev.enemies.map(e =>
                e.id === pendingAdventurerInteraction
                  ? { ...e, tag: 'Friendly' as const, engaged: false, isRecruited: true }
                  : e
              ),
              logs: [{ id: Math.random().toString(), text: `🤝 ${adv.emoji} ${adv.name} grins warmly — joins as your companion!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
            };
          });
          setPendingAdventurerInteraction(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={`bg-card border ${borderColor} rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4`}>
              <div className="text-center mb-5">
                <div className="text-5xl mb-2">{adv.emoji}</div>
                <div className={`text-sm font-bold ${nameColor} mb-3`}>{adv.name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed italic px-1">
                  "{isAlreadyFriendly ? friendlyLine : flavorLine}"
                </div>
              </div>
              <div className="space-y-2">
                {isAlreadyFriendly ? (
                  <button
                    className="w-full py-2.5 rounded-lg border bg-cyan-500/20 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 text-sm font-semibold transition-colors"
                    onClick={handleAcceptFriendly}
                  >
                    Accept companion 🤝
                  </button>
                ) : (
                  <button
                    className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                      playerHasIt
                        ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 cursor-pointer'
                        : 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
                    }`}
                    onClick={handleGive}
                    disabled={!playerHasIt}
                  >
                    {playerHasIt
                      ? `Recruit — give ${fav} 🤝`
                      : `Recruit — need ${fav} (you don't have one)`}
                  </button>
                )}
                <button
                  className="w-full py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
                  onClick={() => setPendingAdventurerInteraction(null)}
                >
                  Exit dialogue 👋
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Shop Modal */}
      {shopOpen && gameState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShopOpen(false)}
        >
          <div
            className="bg-card border border-yellow-500/30 rounded-xl p-5 shadow-2xl w-96 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-yellow-300">🏪 Emoji Shop</h2>
                <div className="text-[10px] text-muted-foreground mt-0.5">Buy & sell emojis for gold</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1">
                  <span className="text-base leading-none">💰</span>
                  <span className="text-sm font-bold text-yellow-300 tabular-nums">{gameState.player.stats.gold}g</span>
                </div>
                <button onClick={() => setShopOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">ESC</button>
              </div>
            </div>

            {/* For Sale */}
            <div className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">For Sale</div>
              {shopItems.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">Sold out!</div>}
              <div className="flex flex-col gap-1.5">
                {shopItems.map(item => {
                  const price = getItemBuyPrice(item, gameState.currentFloor);
                  const canAfford = gameState.player.stats.gold >= price;
                  const nonHealBagCount = gameState.player.inventory.filter(i => i.healAmount === undefined && i.ammoAmount === undefined).length;
                  const bagFull = !item.isEquipment && item.healAmount === undefined && item.ammoAmount === undefined && nonHealBagCount >= 9;
                  return (
                    <div key={item.id} className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                      <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold leading-tight">{item.name}</div>
                        <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none">{item.description}</div>
                      </div>
                      <button
                        disabled={!canAfford || bagFull}
                        onClick={() => {
                          let sentToBank = false;
                          let shopAmmoTotal: number | null = null;
                          let autoEquippedSlot: EquipSlot | null = null;
                          setGameState(prev => {
                            if (!prev) return prev;
                            if (prev.player.stats.gold < price) return prev;
                            const boughtItem = { ...item, id: `bought-${Math.random().toString(36).slice(2)}` };
                            const newGold = prev.player.stats.gold - price;
                            if (boughtItem.ammoAmount) {
                              const newAmmo = (prev.player.ammo ?? 0) + boughtItem.ammoAmount;
                              shopAmmoTotal = newAmmo;
                              return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, ammo: newAmmo } };
                            }
                            const isUnequippable = boughtItem.isEquipment && !canEquipItem(boughtItem, prev.player.characterClass);
                            if (isUnequippable) {
                              sentToBank = true;
                              return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, bank: [...prev.player.bank, boughtItem] } };
                            }
                            if (boughtItem.isEquipment) {
                              const slots = (boughtItem.equipSlots ?? []) as EquipSlot[];
                              const emptySlot = slots.find(s => !prev.player.equipment[s]);
                              if (emptySlot) {
                                autoEquippedSlot = emptySlot;
                                return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, equipment: { ...prev.player.equipment, [emptySlot]: boughtItem } } };
                              }
                            }
                            const { inventory, bank } = addToBag(prev.player.inventory, prev.player.bank, boughtItem);
                            return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, inventory, bank } };
                          });
                          if (shopAmmoTotal !== null) {
                            const shopAmmoWord = item.emoji === '🪙' ? 'bullets' : 'arrows';
                            addLog(`🏪 ${item.emoji} +${item.ammoAmount} ${shopAmmoWord} for ${price}g — ${shopAmmoTotal} total`);
                          } else {
                            addLog(sentToBank
                              ? `🏪 Bought ${item.emoji} ${item.name} for ${price}g — your class can't equip it, sent to bank.`
                              : autoEquippedSlot
                                ? `🏪 Bought ${item.emoji} ${item.name} for ${price}g — auto-equipped to ${autoEquippedSlot} slot!`
                                : `🏪 Bought ${item.emoji} ${item.name} for ${price}g!`);
                          }
                          setShopItems(prev => prev.filter(i => i.id !== item.id));
                        }}
                        className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                          canAfford && !bagFull
                            ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/30'
                            : bagFull
                              ? 'bg-secondary/10 border-border/30 text-orange-400/60 cursor-not-allowed'
                              : 'bg-secondary/10 border-border/30 text-red-400/60 cursor-not-allowed'
                        }`}
                      >
                        {bagFull ? 'Full' : `${price}g`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sell */}
            {(() => {
              const cls = gameState.player.characterClass;
              const allSellable = [
                ...gameState.player.inventory.filter(i => !i.consumed),
                ...gameState.player.bank.filter(i => !i.consumed),
              ];
              const souls = allSellable.filter(i => !i.healAmount && !i.ammoAmount);
              const food  = allSellable.filter(i => i.healAmount !== undefined);
              const isJunk = (i: EmojiItem) =>
                (i.isEquipment && !canEquipItem(i, cls)) ||
                (i.healAmount !== undefined && !i.isCooked && !i.cookedBuff && i.healAmount <= 4);
              const junk = allSellable.filter(isJunk);
              const junkGold = junk.reduce((s, i) => s + getItemSellValue(i), 0);

              const SellRow = ({ item }: { item: EmojiItem }) => {
                const price = getItemSellValue(item);
                const inBank = gameState.player.bank.some(i => i.id === item.id);
                return (
                  <div className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                    <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold leading-tight">
                        {item.name}{inBank ? ' (bank)' : ''}
                        {item.isEquipment && !canEquipItem(item, cls) && <span className="ml-1 text-[9px] text-red-400/80 font-normal">wrong class</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none">{item.description}</div>
                    </div>
                    <button
                      onClick={() => {
                        setGameState(prev => {
                          if (!prev) return prev;
                          const inventory = prev.player.inventory.filter(i => i.id !== item.id);
                          const bank = prev.player.bank.filter(i => i.id !== item.id);
                          const equipment: Equipment = { ...prev.player.equipment };
                          (Object.keys(equipment) as EquipSlot[]).forEach(slot => {
                            if (equipment[slot]?.id === item.id) delete equipment[slot];
                          });
                          return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: prev.player.stats.gold + price }, inventory, bank, equipment } };
                        });
                        addLog(`💰 Sold ${item.emoji} ${item.name} for ${price}g.`);
                      }}
                      className="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                    >
                      +{price}g
                    </button>
                  </div>
                );
              };

              return (
                <div className="space-y-3">
                  {/* Sell All Junk */}
                  {junk.length > 0 && (
                    <button
                      onClick={() => {
                        setGameState(prev => {
                          if (!prev) return prev;
                          const junkIds = new Set(junk.map(i => i.id));
                          const inventory = prev.player.inventory.filter(i => !junkIds.has(i.id));
                          const bank = prev.player.bank.filter(i => !junkIds.has(i.id));
                          const equipment: Equipment = { ...prev.player.equipment };
                          (Object.keys(equipment) as EquipSlot[]).forEach(slot => {
                            if (equipment[slot] && junkIds.has(equipment[slot]!.id)) delete equipment[slot];
                          });
                          return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: prev.player.stats.gold + junkGold }, inventory, bank, equipment } };
                        });
                        addLog(`🗑️ Sold ${junk.length} junk item${junk.length !== 1 ? 's' : ''} for ${junkGold}g.`);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors text-xs font-bold"
                    >
                      <span>🗑️ Sell All Junk ({junk.length} item{junk.length !== 1 ? 's' : ''})</span>
                      <span className="text-emerald-300">+{junkGold}g</span>
                    </button>
                  )}

                  {/* Emojis & Equipment */}
                  {souls.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Emojis &amp; Equipment</div>
                      <div className="flex flex-col gap-1.5">
                        {souls.map(item => <SellRow key={item.id} item={item} />)}
                      </div>
                    </div>
                  )}

                  {/* Food & Healing — capped at 5 per visit */}
                  {food.length > 0 && (
                    <div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Food &amp; Healing</div>
                        <div className="text-[9px] text-amber-400/70">{Math.min(food.length, 5)}/{food.length} sellable (5 max/visit)</div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {food.slice(0, 5).map(item => <SellRow key={item.id} item={item} />)}
                      </div>
                    </div>
                  )}

                  {allSellable.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-3">Nothing to sell.</div>
                  )}
                </div>
              );
            })()}

            <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground text-center">
              Esc or B to close
            </div>
          </div>
        </div>
      )}

      {/* ── Ammo Cache Modal ───────────────────────────────────────────────── */}
      {ammoCacheOpen && gameState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setAmmoCacheOpen(false)}
        >
          <div
            className="bg-card border border-amber-600/40 rounded-xl p-5 shadow-2xl w-80 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-amber-300">📦 Ammo Cache</h2>
                <div className="text-[10px] text-muted-foreground mt-0.5">Resupply before the boss</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1">
                  <span className="text-base leading-none">💰</span>
                  <span className="text-sm font-bold text-yellow-300 tabular-nums">{gameState.player.stats.gold}g</span>
                </div>
                <button onClick={() => setAmmoCacheOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">ESC</button>
              </div>
            </div>

            {/* Stock */}
            <div className="flex flex-col gap-1.5">
              {ammoCacheItems.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  {gameState.player.characterClass === '🤠' || gameState.player.characterClass === '🧝'
                    ? 'Sold out!'
                    : 'Nothing here for your class.'}
                </div>
              )}
              {ammoCacheItems.map(item => {
                const price = getItemBuyPrice(item, gameState.currentFloor);
                const canAfford = gameState.player.stats.gold >= price;
                return (
                  <div key={item.id} className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                    <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold leading-tight">{item.name}</div>
                      <div className="text-[10px] text-muted-foreground leading-snug">{item.description}</div>
                    </div>
                    <button
                      disabled={!canAfford}
                      onClick={() => {
                        setGameState(prev => {
                          if (!prev) return prev;
                          if (prev.player.stats.gold < price) return prev;
                          const boughtItem = { ...item, id: `cache-bought-${Math.random().toString(36).slice(2)}` };
                          const newGold = prev.player.stats.gold - price;
                          const { inventory, bank } = addToBag(prev.player.inventory, prev.player.bank, boughtItem);
                          return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, inventory, bank } };
                        });
                        addLog(`📦 Bought ${item.emoji} ${item.name} for ${price}g!`);
                        setAmmoCacheItems(prev => prev.filter(i => i.id !== item.id));
                      }}
                      className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                        canAfford
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                          : 'bg-secondary/10 border-border/30 text-red-400/60 cursor-not-allowed'
                      }`}
                    >
                      {price}g
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground text-center">
              Esc or B to close
            </div>
          </div>
        </div>
      )}

      {/* ── Restaurant Modal ────────────────────────────────────────────────── */}
      {restaurantOpen && gameState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRestaurantOpen(false)}
        >
          <div
            className="bg-card border border-red-500/30 rounded-xl p-5 shadow-2xl w-96 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-red-300">🔥 Restaurant</h2>
                <div className="text-[10px] text-muted-foreground mt-0.5">Food, rest & cooking — food smell draws enemies...</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1">
                  <span className="text-base leading-none">💰</span>
                  <span className="text-sm font-bold text-yellow-300 tabular-nums">{gameState.player.stats.gold}g</span>
                </div>
                <button onClick={() => setRestaurantOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">ESC</button>
              </div>
            </div>

            {/* For Sale — food only */}
            <div className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Chef's Menu</div>
              {restaurantItems.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">Sold out!</div>}
              <div className="flex flex-col gap-1.5">
                {restaurantItems.map(item => {
                  const price = getItemBuyPrice(item, gameState.currentFloor);
                  const canAfford = gameState.player.stats.gold >= price;
                  return (
                    <div key={item.id} className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                      <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold leading-tight">{item.name}{item.isCooked ? ' ✨' : ''}</div>
                        <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none">{item.description}</div>
                      </div>
                      <button
                        disabled={!canAfford}
                        onClick={() => {
                          let restAutoEquippedSlot: EquipSlot | null = null;
                          setGameState(prev => {
                            if (!prev) return prev;
                            if (prev.player.stats.gold < price) return prev;
                            const boughtItem = { ...item, id: `rest-bought-${Math.random().toString(36).slice(2)}` };
                            const newGold = prev.player.stats.gold - price;
                            if (boughtItem.ammoAmount) {
                              return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, ammo: (prev.player.ammo ?? 0) + boughtItem.ammoAmount } };
                            }
                            const isUnequippable = boughtItem.isEquipment && !canEquipItem(boughtItem, prev.player.characterClass);
                            if (isUnequippable) {
                              return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, bank: [...prev.player.bank, boughtItem] } };
                            }
                            if (boughtItem.isEquipment) {
                              const slots = (boughtItem.equipSlots ?? []) as EquipSlot[];
                              const emptySlot = slots.find(s => !prev.player.equipment[s]);
                              if (emptySlot) {
                                restAutoEquippedSlot = emptySlot;
                                return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, equipment: { ...prev.player.equipment, [emptySlot]: boughtItem } } };
                              }
                            }
                            const { inventory, bank } = addToBag(prev.player.inventory, prev.player.bank, boughtItem);
                            return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, inventory, bank } };
                          });
                          addLog(restAutoEquippedSlot
                            ? `🔥 Bought ${item.emoji} ${item.name} for ${price}g — auto-equipped to ${restAutoEquippedSlot} slot!`
                            : `🔥 Bought ${item.emoji} ${item.name} for ${price}g!`);
                          setRestaurantItems(prev => prev.filter(i => i.id !== item.id));
                        }}
                        className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                          canAfford
                            ? 'bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30'
                            : 'bg-secondary/10 border-border/30 text-red-400/60 cursor-not-allowed'
                        }`}
                      >
                        {price}g
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sell — 250% for cooked food, 5-item limit */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Sell Your Food <span className="text-red-400">(250% for cooked!)</span>
                {restaurantSoldCount > 0 && restaurantSoldCount < 5 && (
                  <span className="ml-2 text-amber-400/80 normal-case font-normal">{restaurantSoldCount}/5 cooked sold</span>
                )}
              </div>
              {restaurantSoldCount >= 5 ? (
                <div className="text-center py-4 px-3 bg-secondary/20 border border-border/40 rounded-lg">
                  <div className="text-lg mb-1">🍽️</div>
                  <div className="text-xs font-semibold text-amber-300">Thank you for cooking for us — we're closed now!</div>
                  <div className="text-[10px] text-muted-foreground mt-1">The kitchen is full. Rest here for +2 HP/turn.</div>
                </div>
              ) : (() => {
                const sellable = [
                  ...gameState.player.inventory.filter(i => !i.consumed && i.healAmount !== undefined),
                  ...gameState.player.bank.filter(i => !i.consumed && i.healAmount !== undefined),
                ];
                if (sellable.length === 0) return <div className="text-xs text-muted-foreground text-center py-3">Nothing to sell.</div>;
                const isLastCooked = restaurantSoldCount === 4;
                return (
                  <div className="flex flex-col gap-1.5">
                    {isLastCooked && (
                      <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 leading-snug">
                        ⚠️ Selling one more cooked dish will close the kitchen!
                      </div>
                    )}
                    {sellable.map(item => {
                      const isCooked = item.isCooked || !!item.cookedBuff;
                      const sellMul = isCooked ? 2.5 : 1;
                      const price = getItemSellValue(item, sellMul);
                      const inBank = gameState.player.bank.some(i => i.id === item.id);
                      return (
                        <div key={item.id} className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                          <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold leading-tight">{item.name}{inBank ? ' (bank)' : ''}{item.isCooked ? ' ✨' : ''}</div>
                            <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none">{item.description}</div>
                          </div>
                          <button
                            onClick={() => {
                              setGameState(prev => {
                                if (!prev) return prev;
                                const inventory = prev.player.inventory.filter(i => i.id !== item.id);
                                const bank = prev.player.bank.filter(i => i.id !== item.id);
                                const equipment: Equipment = { ...prev.player.equipment };
                                (Object.keys(equipment) as EquipSlot[]).forEach(slot => {
                                  if (equipment[slot]?.id === item.id) delete equipment[slot];
                                });
                                return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: prev.player.stats.gold + price }, inventory, bank, equipment } };
                              });
                              if (isCooked) {
                                const newCount = restaurantSoldCount + 1;
                                setRestaurantSoldCount(newCount);
                                if (newCount >= 5) {
                                  addLog(`🏪 Sold ${item.emoji} ${item.name} for ${price}g ✨ — kitchen is now closed, thank you!`);
                                } else {
                                  addLog(`🔥 Sold ${item.emoji} ${item.name} for ${price}g (cooked bonus!)${newCount === 4 ? ' — 1 more until kitchen closes!' : ''}`);
                                }
                              } else {
                                addLog(`🔥 Sold ${item.emoji} ${item.name} for ${price}g!`);
                              }
                            }}
                            className="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                          >
                            +{price}g {sellMul > 1 && <span className="text-red-400">✨</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground text-center">
              Esc or B to close
            </div>
          </div>
        </div>
      )}

      {/* ── Item Stat Card (right-click / long-press) ──────────────────────── */}
      {statCardItem && (() => {
        const si = statCardItem;
        const effect = (si as any).effect as Record<string, number | boolean> | undefined;
        const consumeLines: string[] = [];
        if (effect) {
          if (effect.hpBonus)      consumeLines.push(`+${effect.hpBonus} HP`);
          if (effect.maxHpBonus)   consumeLines.push(`+${effect.maxHpBonus} max HP`);
          if (effect.attackBonus)  consumeLines.push(`+${effect.attackBonus} ATK`);
          if (effect.defenseBonus) consumeLines.push(`+${effect.defenseBonus} DEF`);
          if (effect.speedBonus)   consumeLines.push(`+${effect.speedBonus} SPD`);
          if (effect.evasionBonus) consumeLines.push(`+${effect.evasionBonus} EVA`);
          if (effect.luckBonus)    consumeLines.push(`+${effect.luckBonus} LCK`);
          if (effect.moodBonus)    consumeLines.push(`+${effect.moodBonus} mood`);
          if (effect.xpBonus)      consumeLines.push(`+${effect.xpBonus} XP`);
          if (effect.instakillNearest) consumeLines.push('⚡ Instakill nearest visible enemy');
        }
        const equipBonusLines = si.isEquipment
          ? Object.entries(si.equipBonus ?? {}).filter(([,v]) => (v ?? 0) !== 0).map(([k, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${k.toUpperCase()}`)
          : [];
        const typeLabel = si.isEquipment ? '⚔️ Equipment'
          : si.healAmount !== undefined ? '💊 Heal Item'
          : si.ammoAmount !== undefined ? '🪖 Ammo'
          : si.activeKind ? `⚡ Active — ${si.activeKind}`
          : si.bagPassive ? '✨ Soul Passive'
          : '✨ Soul';
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm"
            onClick={() => setStatCardItem(null)}
          >
            <div
              className="bg-card border border-border/80 rounded-2xl p-5 shadow-2xl w-72 max-w-[90vw] space-y-3"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="text-5xl leading-none select-none">{si.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-foreground leading-tight">{si.name}</div>
                  <div className="text-[11px] text-muted-foreground/60 mt-0.5">{typeLabel}</div>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground/80 leading-relaxed">{si.description}</p>

              {/* Equipment bonuses */}
              {si.isEquipment && equipBonusLines.length > 0 && (
                <div className="bg-black/20 rounded-lg p-2.5 space-y-1">
                  <div className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wide">Stat bonuses</div>
                  <div className="flex flex-wrap gap-1.5">
                    {equipBonusLines.map(b => (
                      <span key={b} className="text-xs text-emerald-400 font-semibold bg-emerald-900/20 border border-emerald-800/40 px-1.5 py-0.5 rounded">{b}</span>
                    ))}
                  </div>
                  {si.equipSlots && <div className="text-[10px] text-muted-foreground/40 mt-1">Slots: {si.equipSlots.join(', ')}</div>}
                </div>
              )}

              {/* Bag passive */}
              {si.bagPassive && (
                <div className="bg-black/20 rounded-lg p-2.5 space-y-1.5">
                  <div className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wide">Bag passive</div>
                  <p className="text-xs text-sky-300/80 leading-relaxed">{si.bagPassive.description}</p>
                  {isStackableBagPassive(si) ? (() => {
                    const perStack = getStackableBonusLabel(si);
                    const stackN = si.stackCount ?? 1;
                    const cumulative = getStackableCumulativeLabel(si);
                    return (
                      <div className="space-y-1 pt-0.5">
                        {perStack && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Per copy:</span>
                            <span className="text-[10px] text-emerald-400/80 font-medium bg-emerald-900/20 border border-emerald-800/30 px-1.5 py-0.5 rounded">{perStack}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Stacked:</span>
                          <span className="text-[10px] text-emerald-300/90 font-semibold">×{stackN}</span>
                          {cumulative && (
                            <span className="text-[10px] text-emerald-300/80 bg-emerald-900/25 border border-emerald-800/30 px-1.5 py-0.5 rounded font-medium">{cumulative}</span>
                          )}
                        </div>
                      </div>
                    );
                  })() : si.bagPassive.nonStackable
                    ? <div className="text-[10px] text-amber-400/60">Non-stackable — only 1 copy applies</div>
                    : <div className="text-[10px] text-emerald-400/60">Stackable — each copy adds another instance</div>
                  }
                </div>
              )}

              {/* Consume effect */}
              {consumeLines.length > 0 && (
                <div className="bg-black/20 rounded-lg p-2.5 space-y-1">
                  <div className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wide">Consume effect</div>
                  <div className="flex flex-wrap gap-1.5">
                    {consumeLines.map(l => (
                      <span key={l} className="text-xs text-violet-300/90 font-medium bg-violet-900/20 border border-violet-800/40 px-1.5 py-0.5 rounded">{l}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Heal / ammo / charges */}
              {si.healAmount !== undefined && (
                <div className="text-xs text-emerald-400/80">Restores <span className="font-bold">+{si.healAmount} HP</span> when consumed</div>
              )}
              {si.ammoAmount !== undefined && (
                <div className="text-xs text-sky-400/80">Ammo: <span className="font-bold">+{si.ammoAmount}</span></div>
              )}
              {si.charges !== undefined && si.charges >= 0 && (
                <div className="text-xs text-amber-400/80">Charges remaining: <span className="font-bold">×{si.charges}</span></div>
              )}

              <button
                onClick={() => setStatCardItem(null)}
                className="w-full text-xs py-1.5 rounded-lg bg-secondary/40 border border-border/50 text-muted-foreground hover:bg-secondary/60 transition-colors mt-1"
              >Close</button>
            </div>
          </div>
        );
      })()}

      {/* Bank / Bag Modal */}
      {bankOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { setBankOpen(false); setSelectedItemId(null); }}
        >
          <div
            className="bg-card border border-border rounded-xl p-5 shadow-2xl w-80 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">🎒 Bag</h2>
              <button onClick={() => { setBankOpen(false); setSelectedItemId(null); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">ESC</button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 mb-4 bg-black/20 rounded-lg p-1">
              {(['hotbar', 'equipment', 'bank'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setBagTab(tab)}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${bagTab === tab ? 'bg-card text-foreground shadow' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}
                >
                  {tab === 'hotbar' ? '🎒 Items' : tab === 'equipment' ? '⚔️ Equip' : (() => { const nb = player.bank.filter(i => !i.isEquipment).length; return `🏦 Bank${nb > 0 ? ` (${nb})` : ''}`; })()}
                </button>
              ))}
            </div>

            {/* ── Equipment Tab ── */}
            {bagTab === 'equipment' && (
              <EquipmentTab
                player={player}
                selectedItemId={selectedItemId}
                focusedBagIdx={focusedBagIdx}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
                onSelectItem={setSelectedItemId}
                itemInspectProps={itemInspectProps}
              />
            )}

            {/* Hotbar */}
            {bagTab === 'hotbar' && (
              <HotbarPanel
                bagSlots={bagSlots}
                bank={player.bank}
                selectedItemId={selectedItemId}
                focusedBagIdx={focusedBagIdx}
                onSelect={setSelectedItemId}
                onMove={handleBankMove}
                onShowStatCard={setStatCardItem}
              />
            )}

            {/* Bank */}
            {bagTab === 'bank' && (
              <BankPanel
                player={player}
                bagSlots={bagSlots}
                selectedItemId={selectedItemId}
                focusedBagIdx={focusedBagIdx}
                onSelect={setSelectedItemId}
                onMove={handleBankMove}
                onConsume={handleConsumeBankItem}
                onClose={() => setBankOpen(false)}
                onShowStatCard={setStatCardItem}
              />
            )}

            <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground text-center space-y-0.5">
              {bagTab === 'hotbar' && <><div>arrows/WASD/numpad navigate · Enter select · 1–9 quick-assign</div><div>select item then navigate to slot + Enter to swap</div></>}
              {bagTab === 'equipment' && <div>arrows/WASD/numpad navigate · Enter to auto-equip selected gear</div>}
              {bagTab === 'bank' && <div>click to select · Pull to Hotbar or ✨ Consume from action panel · 1–9 to assign slot</div>}
              <div className="text-muted-foreground/50">Tab/⇧Tab switch tabs · Space/Enter confirm · Shift/Esc cancel · B close</div>
            </div>
          </div>
        </div>
      )}

      {/* Virtual D-pad — touch/mobile only */}
      {isMobile && !gameState.gameOver && (
        <>
          <VirtualDpad onMove={handleMove} onWait={handleWait} />
          {isAdjacentToOpenDoor && (
            <button
              data-testid="mobile-close-door"
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/20 text-white/90 font-bold shadow-2xl transition-transform duration-75 active:scale-90 select-none touch-none"
              style={{ fontSize: '1rem' }}
              onPointerDown={e => { e.preventDefault(); handleCloseDoor(); }}
              aria-label="Close door"
              title="Close door (c)"
            >
              🚪 Close Door
            </button>
          )}
        </>
      )}

      {/* ── Right Sidebar — Bag + Map ──────────────────────────────── */}
      <RightSidebar
        player={player}
        gameState={gameState}
        bagSlots={bagSlots}
        healSlots={healSlots}
        bagPassiveSummary={bagPassiveSummary}
        equippedPlayer={applyEquipmentAndPassives(player)}
        handleUseSlot={handleUseSlot}
        handleUseHeal={handleUseHeal}
        setBankOpen={setBankOpen}
        setBagTab={setBagTab}
        setSelectedItemId={setSelectedItemId}
      />

      </div>{/* end flex main content row */}

      {/* ── Emoji-less red vignette flash ───────────────────────────── */}
      {emojilessFlashKey > 0 && (
        <div
          key={emojilessFlashKey}
          style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100,
            background: 'radial-gradient(ellipse at center, rgba(239,68,68,0) 25%, rgba(239,68,68,0.7) 100%)',
            animation: 'emojiless-flash 700ms ease-in-out forwards',
          }}
        />
      )}

      {/* ── Dungeon Pressure red vignette flash ─────────────────────── */}
      {pressureFlashKey > 0 && (
        <div
          key={`pressure-${pressureFlashKey}`}
          style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100,
            background: 'radial-gradient(ellipse at center, rgba(180,0,0,0) 20%, rgba(200,0,0,0.65) 80%, rgba(220,0,0,0.85) 100%)',
            animation: 'pressure-flash 900ms ease-in-out forwards',
          }}
        />
      )}

      {/* ── RTFM overlay (preserves game state) ─────────────────────── */}
      {showRTFM && (
        <div className="fixed inset-0 z-50 overflow-auto bg-background">
          <HowToPlay onBack={() => { setShowRTFM(false); setPauseMenuOpen(true); }} killCounts={gameState?.killCounts} />
        </div>
      )}
    </div>
  );
}
