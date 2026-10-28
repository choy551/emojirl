import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CITY_NAME_MAX, normalizeCityName } from '../game/cityIdentity';
import { FLYOUT_CLOSE_MS, flyoutStyle, raiseFlyoutFrame, raisePlace } from './cityPaletteLayout';
import { fitZoom, stepZoom } from './cityZoom';
import { allHoods, canGrowEdge, growthBlocked, hoodIsMaxed, NEIGHBORHOOD_COST, ORIGIN_ID, spawnBlocked, worldBounds, type Neighborhood } from '../game/neighborhoods';
import { getEnemyKillCounts } from '../game/discoveries';
import {
  BUILDING_EXCHANGE_COST,
  buildingOf,
} from '../game/cityBuildings';
import {
  CITY_DIM_MAX,
  CITY_EXPAND_COST,
  CITY_TICK_MS,
  availableTokens,
  awaySummary,
  buildPaletteSections,
  catchUpCity,
  citizenCapacityOf,
  DISTRICT_BONUS_TIER_CAP,
  DISTRICT_THRESHOLD,
  districtStandings,
  emojiCityRulesBlurb,
  exchangeForBuilding,
  expandBlockReason,
  normalizeCity,
  setSquarePass,
  toggleBlockedType,
  paletteMenuRows,
  placedCount,
  placedOf,
  tickCitizens,
  totalAvailableTokens,
  TRAIN_LINE_HINT,
  trainLineSpansCity,
  decorInHood,
  editHoodLot,
  expandNeighborhood,
  placeInHood,
  removeInHood,
  spawnNeighborhood,
  trainLineStatusLabel,
  type CityEdge,
  type CityState,
  type PaletteEntry,
  type PaletteSection,
} from '../game/emojiCity';

type PalettePick = { kind: 'token' | 'decor'; emoji: string };

/** Wait this long after the last edit, then write the city. Hide and unload flush sooner. */
const CITY_AUTOSAVE_MS = 300;

function selectionFits(selection: { x0: number; y0: number; x1: number; y1: number }, cols: number, rows: number): boolean {
  return selection.x0 >= 0 && selection.y0 >= 0 && selection.x1 < cols && selection.y1 < rows
    && selection.x0 <= selection.x1 && selection.y0 <= selection.y1;
}

/** Lot size when the page has room. The grid widens at this size as columns are added. */
const CITY_TILE_MAX = '2.75rem';
/** Smallest lot. Narrow screens shrink toward this before a horizontal scrollbar appears. */
const CITY_TILE_MIN = '2rem';
import { ensurePlayerToken, loadShareStatus, publishMyCity } from '../game/cityShareClient';
import { ONLINE_UNAVAILABLE } from '../game/cityShareModel';
import { ensureCityProfile, loadMeta, replaceEmojiConsumes, saveCity, saveCityName, saveMeta, settleCityCatchUp, type CityDesk } from '../game/meta';
import {
  applyClear,
  applyPaste,
  applyPlacement,
  brushFromLot,
  copyRect,
  ERASE_LONG_PRESS_MS,
  indicesInRect,
  longPressMoved,
  pointFromIndex,
  pushUndo,
  type GridRect,
  type PaintSnapshot,
  type Stamp,
} from '../game/cityPaint';
import { CityToolPalette, type CityTool } from './cityTools';

export default function CityPage() {
  const [, setLocation] = useLocation();
  const [consumes, setConsumes] = useState<Record<string, number>>({});
  const [city, setCity] = useState<CityState | null>(null);
  const [selected, setSelected] = useState<PalettePick | null>(null);
  const [note, setNote] = useState('Pick an emoji, then drag across empty lots.');
  const [tool, setTool] = useState<CityTool>('place');
  const [selection, setSelection] = useState<GridRect | null>(null);
  const [clipboard, setClipboard] = useState<Stamp | null>(null);
  const [undoStack, setUndoStack] = useState<PaintSnapshot[]>([]);
  const [dragAnchor, setDragAnchor] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const [dragHood, setDragHood] = useState(ORIGIN_ID);
  const [selectionHood, setSelectionHood] = useState(ORIGIN_ID);
  const [erasing, setErasing] = useState(false);
  const [passMode, setPassMode] = useState<'type' | 'square'>('type');
  const [passSquare, setPassSquare] = useState<boolean | null>(true);
  const [zoom, setZoom] = useState(1);
  const [portWidth, setPortWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const dragRef = useRef<{ tool: CityTool | 'erase'; hood: string; anchor: number; current: number } | null>(null);
  const pressRef = useRef<{ x: number; y: number; timer: number } | null>(null);
  const undoRef = useRef<() => void>(() => {});
  const [away, setAway] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [visitor, setVisitor] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const killsRef = useRef<Record<string, number>>({});
  const deskReady = useRef(false);
  const deskRef = useRef({
    city: null as CityState | null,
    consumes,
    tool,
    selected,
    selection,
    clipboard,
    passMode,
    passSquare,
    nameDraft,
  });
  const flushCityRef = useRef(() => {});
  deskRef.current = {
    city: city ?? deskRef.current.city,
    consumes,
    tool,
    selected,
    selection,
    clipboard,
    passMode,
    passSquare,
    nameDraft,
  };
  flushCityRef.current = () => {
    if (!deskReady.current) return;
    const desk = deskRef.current;
    if (!desk.city) return;
    const meta = loadMeta();
    const named = normalizeCityName(desk.nameDraft);
    const cityDesk: CityDesk = {
      tool: desk.tool,
      brush: desk.selected,
      selection: desk.selection,
      clipboard: desk.clipboard,
      passMode: desk.passMode,
      passSquare: desk.passSquare,
    };
    saveMeta({
      ...meta,
      city: desk.city,
      emojiConsumes: desk.consumes,
      cityName: named.ok ? named.name : meta.cityName,
      cityDesk,
    });
  };

  useEffect(() => {
    const profile = ensureCityProfile();
    setNameDraft(profile.cityName);
    setVisitor(profile.anonymousName);
    const meta = loadMeta();
    const kills = getEnemyKillCounts();
    killsRef.current = kills;
    const counts = meta.emojiConsumes ?? {};
    const caught = catchUpCity({
      city: normalizeCity(meta.city),
      consumes: counts,
      kills,
      pendingTurns: meta.pendingCityTurns ?? 0,
      growthRemainder: meta.cityGrowthRemainder ?? 0,
    });
    settleCityCatchUp(caught.city, caught.growthRemainder);
    setConsumes(counts);
    setCity(caught.city);
    if (caught.turns > 0) setAway(awaySummary(caught.turns, caught.citizensGained));
    const desk = meta.cityDesk;
    const first = buildPaletteSections(counts, caught.city)
      .flatMap(section => section.entries)
      .find(entry => entry.kind === 'token' && !entry.locked);
    const brush = desk?.brush ?? (first ? { kind: 'token' as const, emoji: first.emoji } : null);
    const restoredSelection = desk?.selection && selectionFits(desk.selection, caught.city.cols, caught.city.rows) ? desk.selection : null;
    const restoredTool = desk?.tool ?? 'place';
    setSelected(brush);
    setTool(restoredTool);
    setSelection(restoredSelection);
    setClipboard(desk?.clipboard ?? null);
    setPassMode(desk?.passMode ?? 'type');
    setPassSquare(desk?.passSquare === false || desk?.passSquare === null ? desk.passSquare : true);
    deskRef.current = {
      city: caught.city,
      consumes: counts,
      tool: restoredTool,
      selected: brush,
      selection: restoredSelection,
      clipboard: desk?.clipboard ?? null,
      passMode: desk?.passMode ?? 'type',
      passSquare: desk?.passSquare === false || desk?.passSquare === null ? desk.passSquare : true,
      nameDraft: profile.cityName,
    };
    deskReady.current = true;
    let cancel = false;
    loadShareStatus().then(status => { if (!cancel) setOnline(status.online); });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!deskReady.current || !city) return;
    const id = window.setTimeout(() => flushCityRef.current(), CITY_AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [city, consumes, tool, selected, selection, clipboard, passMode, passSquare, nameDraft]);

  useEffect(() => {
    const flush = () => flushCityRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCity(prev => {
        if (!prev) return prev;
        const next = tickCitizens(prev, Math.random);
        deskRef.current.city = next;
        saveCity(next);
        return next;
      });
    }, CITY_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const grid = gridRef.current;
    if (!scroller || !grid) return;
    const measure = () => {
      const width = scroller.clientWidth;
      setPortWidth(prev => prev === width ? prev : width);
      void grid;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [city?.cols, city?.rows, portWidth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        undoRef.current();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (selection) {
          setSelection(null);
          return;
        }
        setLocation('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, setLocation]);

  useEffect(() => {
    if (!selection || !city) return;
    const onPointerDown = (event: PointerEvent) => {
      const el = event.target instanceof Element ? event.target : null;
      if (el?.closest('[data-testid="city-tool-copy"], [data-testid="city-tool-cut"], [data-testid="city-tool-delete"], [data-testid="city-tool-pass"], [data-testid="pass-options"], [data-testid="city-tool-zoom"], [data-testid="zoom-options"]')) return;
      const lot = el?.closest('[data-lot]');
      if (lot) {
        const index = Number(lot.getAttribute('data-lot'));
        if (Number.isInteger(index)) {
          const point = pointFromIndex(city.cols, index);
          if (point.x >= selection.x0 && point.x <= selection.x1 && point.y >= selection.y0 && point.y <= selection.y1) return;
        }
      }
      setSelection(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [selection, city]);

  const sections = useMemo(
    () => (city ? buildPaletteSections(consumes, city) : []),
    [consumes, city],
  );
  const selectedBuilding = selected?.kind === 'token' ? buildingOf(selected.emoji) : undefined;

  const raiseStructure = () => {
    if (!city || !selectedBuilding) return;
    const result = exchangeForBuilding(consumes, city, selectedBuilding.emoji);
    if (!result.ok) { setNote(result.reason ?? 'Cannot raise that structure.'); return; }
    const saved = storeConsumes(result.consumes);
    const left = availableTokens(saved[selectedBuilding.emoji] ?? 0, placedOf(city, selectedBuilding.emoji));
    setNote(`Raised ${selectedBuilding.emoji} ${selectedBuilding.name}. ${left} token${left === 1 ? '' : 's'} ready to place.`);
  };

  const onExpand = (hoodId: string, edge: CityEdge) => {
    if (!city) return;
    const result = expandNeighborhood(city, hoodId, edge, consumes);
    if (!result.ok) { setNote(result.reason ?? 'Cannot expand.'); return; }
    storeConsumes(result.consumes);
    storeCity(result.city);
    setNote(`Expanded ${edge}.`);
  };

  const onSpawn = (hoodId: string, edge: CityEdge) => {
    if (!city) return;
    const result = spawnNeighborhood(city, hoodId, edge, consumes);
    if (!result.ok) { setNote(result.reason ?? 'Cannot add a neighborhood.'); return; }
    storeConsumes(result.consumes);
    storeCity(result.city);
    setNote('New neighborhood. It grows on the sides that face away from its parent.');
  };

  const remember = () => {
    if (!city) return;
    setUndoStack(stack => pushUndo(stack, { city, consumes }));
  };

  const undo = () => {
    setUndoStack(stack => {
      const snap = stack[stack.length - 1];
      if (!snap) {
        setNote('Nothing to undo.');
        return stack;
      }
      storeCity(snap.city);
      storeConsumes(snap.consumes);
      setNote('Undid the last edit.');
      return stack.slice(0, -1);
    });
  };
  undoRef.current = undo;

  const storeCity = (next: CityState) => {
    deskRef.current.city = next;
    saveCity(next);
    setCity(next);
  };
  const storeConsumes = (next: Record<string, number>) => {
    const saved = replaceEmojiConsumes(next);
    deskRef.current.consumes = saved;
    setConsumes(saved);
    return saved;
  };

  const hoodGrid = (source: CityState, id: string) => {
    if (id === ORIGIN_ID) {
      return { cols: source.cols, rows: source.rows, tiles: source.tiles, decor: source.decor, passOverride: source.passOverride, blockedTypes: source.blockedTypes };
    }
    return source.neighborhoods?.find(hood => hood.id === id)
      ?? { cols: source.cols, rows: source.rows, tiles: source.tiles, decor: source.decor, passOverride: source.passOverride, blockedTypes: source.blockedTypes };
  };

  const selectionIndices = () => {
    if (!city || !selection) return [];
    const grid = hoodGrid(city, selectionHood);
    return indicesInRect(grid.cols, grid.rows, { x: selection.x0, y: selection.y0 }, { x: selection.x1, y: selection.y1 });
  };

  const chooseTool = (next: CityTool) => {
    if (next !== tool && next !== 'select' && next !== 'pass' && next !== 'zoom') setSelection(null);
    setTool(next);
  };

  const finishClear = (hoodId: string, indices: number[], verb: string) => {
    if (!city) return;
    if (hoodId === ORIGIN_ID) {
      const result = applyClear(city, indices, killsRef.current, Math.random);
      if (result.removed === 0) {
        setNote('Nothing to clear.');
        return;
      }
      remember();
      storeCity(result.city);
      setNote(`${verb} ${result.removed}. Refunded ${result.refunded} token${result.refunded === 1 ? '' : 's'}.`);
      return;
    }
    let next = city;
    let removed = 0;
    let refunded = 0;
    for (const index of indices) {
      const grid = hoodGrid(next, hoodId);
      if (!grid.tiles[index]) continue;
      const decor = grid.decor?.[index] === true;
      const result = removeInHood(next, hoodId, index, killsRef.current, Math.random);
      if (!result.ok) continue;
      next = result.city;
      removed += 1;
      if (!decor) refunded += 1;
    }
    if (removed === 0) {
      setNote('Nothing to clear.');
      return;
    }
    remember();
    storeCity(next);
    setNote(`${verb} ${removed}. Refunded ${refunded} token${refunded === 1 ? '' : 's'}.`);
  };

  const doCopy = () => {
    if (!city || !selection) {
      setNote('Select a region first.');
      return;
    }
    const grid = hoodGrid(city, selectionHood);
    const stamp = copyRect({ ...city, cols: grid.cols, rows: grid.rows, tiles: grid.tiles, decor: grid.decor }, selection);
    setClipboard(stamp);
    setSelection(null);
    setNote(`Copied ${stamp.cols}×${stamp.rows}.`);
  };

  const doCut = () => {
    if (!city || !selection) {
      setNote('Select a region first.');
      return;
    }
    const grid = hoodGrid(city, selectionHood);
    const stamp = copyRect({ ...city, cols: grid.cols, rows: grid.rows, tiles: grid.tiles, decor: grid.decor }, selection);
    const clearing = selectionIndices();
    let result: { city: CityState; removed: number; refunded: number };
    if (selectionHood === ORIGIN_ID) {
      result = applyClear(city, clearing, killsRef.current, Math.random);
    } else {
      let next = city;
      let removed = 0;
      let refunded = 0;
      for (const index of clearing) {
        const lots = hoodGrid(next, selectionHood);
        if (!lots.tiles[index]) continue;
        const decor = lots.decor?.[index] === true;
        const cleared = removeInHood(next, selectionHood, index, killsRef.current, Math.random);
        if (!cleared.ok) continue;
        next = cleared.city;
        removed += 1;
        if (!decor) refunded += 1;
      }
      result = { city: next, removed, refunded };
    }
    if (result.removed === 0) {
      setNote('Nothing to cut.');
      return;
    }
    remember();
    setClipboard(stamp);
    storeCity(result.city);
    setSelection(null);
    setNote(`Cut ${stamp.cols}×${stamp.rows}. Refunded ${result.refunded} token${result.refunded === 1 ? '' : 's'}.`);
  };

  const placeHood = (source: CityState, hoodId: string, indices: number[]) => {
    let next = source;
    let placed = 0;
    let skipped = 0;
    for (const index of indices) {
      const lots = hoodGrid(next, hoodId);
      if (lots.tiles[index]) { skipped += 1; continue; }
      const result = selected?.kind === 'decor'
        ? decorInHood(next, hoodId, index, selected.emoji)
        : placeInHood(next, hoodId, index, selected?.emoji ?? '', consumes, killsRef.current, Math.random);
      if (!result.ok) { skipped += 1; continue; }
      next = result.city;
      placed += 1;
    }
    return { city: next, placed, skipped };
  };

  const pasteHood = (source: CityState, hoodId: string, cols: number, index: number) => {
    const origin = pointFromIndex(cols, index);
    let next = source;
    let placed = 0;
    let skipped = 0;
    clipboard?.cells.forEach((cell, offset) => {
      if (!cell.emoji || !clipboard) return;
      const x = origin.x + (offset % clipboard.cols);
      const y = origin.y + Math.floor(offset / clipboard.cols);
      const lots = hoodGrid(next, hoodId);
      if (x < 0 || y < 0 || x >= lots.cols || y >= lots.rows || lots.tiles[y * lots.cols + x]) { skipped += 1; return; }
      const at = y * lots.cols + x;
      const result = cell.decor
        ? decorInHood(next, hoodId, at, cell.emoji)
        : placeInHood(next, hoodId, at, cell.emoji, consumes, killsRef.current, Math.random);
      if (!result.ok) { skipped += 1; return; }
      next = result.city;
      placed += 1;
    });
    return { city: next, placed, skipped };
  };

  const doPaste = (hoodId: string, index: number) => {
    if (!city || !clipboard) {
      setNote('Copy or cut a region first.');
      return;
    }
    const grid = hoodGrid(city, hoodId);
    const result = hoodId === ORIGIN_ID
      ? applyPaste(city, clipboard, pointFromIndex(city.cols, index), consumes, killsRef.current, Math.random)
      : pasteHood(city, hoodId, grid.cols, index);
    if (result.placed === 0) {
      setNote('Nothing pasted. The lots are full or tokens ran out.');
      return;
    }
    remember();
    storeCity(result.city);
    setNote(`Pasted ${result.placed}.${result.skipped ? ` Skipped ${result.skipped}.` : ''}`);
  };

  const pickAt = (hoodId: string, index: number) => {
    if (!city) return;
    const grid = hoodGrid(city, hoodId);
    const brush = brushFromLot({ ...city, tiles: grid.tiles, decor: grid.decor }, index);
    if (!brush) {
      setNote('That lot is empty.');
      return;
    }
    setSelected(brush);
    chooseTool('place');
    setNote(`Brush is ${brush.emoji}${brush.kind === 'decor' ? ' decor' : ''}.`);
  };

  const finishPlace = (hoodId: string, anchor: number, current: number) => {
    if (!city) return;
    if (!selected) {
      setNote('Pick an emoji first.');
      return;
    }
    const grid = hoodGrid(city, hoodId);
    const indices = indicesInRect(grid.cols, grid.rows, pointFromIndex(grid.cols, anchor), pointFromIndex(grid.cols, current));
    const result = hoodId === ORIGIN_ID
      ? applyPlacement(city, selected, consumes, indices, killsRef.current, Math.random)
      : placeHood(city, hoodId, indices);
    if (result.placed === 0) {
      setNote('Nothing placed. Lots were full or tokens ran out.');
      return;
    }
    remember();
    storeCity(result.city);
    const free = selected.kind === 'decor' ? ' Decor is free.' : '';
    setNote(`Placed ${result.placed} ${selected.emoji}.${free}${result.skipped ? ` Skipped ${result.skipped}.` : ''}`);
  };

  const lotIndexAt = (clientX: number, clientY: number): { hood: string; index: number } | null => {
    const el = document.elementFromPoint(clientX, clientY);
    const lot = el?.closest('[data-lot]');
    if (!lot) return null;
    const index = Number(lot.getAttribute('data-lot'));
    if (!Number.isInteger(index)) return null;
    return { hood: lot.getAttribute('data-hood') || ORIGIN_ID, index };
  };

  const clearLongPress = () => {
    if (!pressRef.current) return;
    window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };

  const beginDrag = (kind: CityTool | 'erase', lot: { hood: string; index: number }, event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { tool: kind, hood: lot.hood, anchor: lot.index, current: lot.index };
    setDragHood(lot.hood);
    setErasing(kind === 'erase');
    setDragAnchor(lot.index);
    setDragCurrent(lot.index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const passNote = (value: boolean | null, count: number) => {
    const what = value === null ? 'the type rule' : value ? 'unpassable' : 'passable';
    return `Set ${count} square${count === 1 ? '' : 's'} to ${what}.`;
  };

  const applyPassAt = (hoodId: string, index: number) => {
    if (!city) return;
    const grid = hoodGrid(city, hoodId);
    if (passMode === 'type') {
      const emoji = grid.tiles[index];
      if (!emoji) {
        setNote('That lot is empty.');
        return;
      }
      const wasBlocked = grid.blockedTypes.includes(emoji);
      const next = hoodId === ORIGIN_ID
        ? toggleBlockedType(city, emoji)
        : editHoodLot(city, hoodId, index, hood => {
          const blocked = new Set(hood.blockedTypes);
          if (blocked.has(emoji)) blocked.delete(emoji);
          else blocked.add(emoji);
          return { ...hood, blockedTypes: [...blocked] };
        });
      remember();
      storeCity(next);
      setNote(`${emoji} is ${wasBlocked ? 'passable' : 'unpassable'} for wandering citizens.`);
      return;
    }
    const next = hoodId === ORIGIN_ID
      ? setSquarePass(city, [index], passSquare)
      : editHoodLot(city, hoodId, index, hood => {
        const passOverride = hood.passOverride.slice();
        passOverride[index] = passSquare;
        return { ...hood, passOverride };
      });
    remember();
    storeCity(next);
    setNote(passNote(passSquare, 1));
  };

  const applyPassMarquee = (value: boolean | null) => {
    setPassSquare(value);
    if (!city || !selection) {
      setNote(value === null ? 'Click a square to use its emoji type.' : value ? 'Click a square to block it.' : 'Click a square to open it.');
      return;
    }
    const indices = selectionIndices();
    const next = selectionHood === ORIGIN_ID
      ? setSquarePass(city, indices, value)
      : editHoodLot(city, selectionHood, indices[0] ?? 0, hood => {
        const passOverride = hood.passOverride.slice();
        for (const index of indices) if (index >= 0 && index < passOverride.length) passOverride[index] = value;
        return { ...hood, passOverride };
      });
    remember();
    storeCity(next);
    setNote(passNote(value, indices.length));
  };

  const onGridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!city) return;
    if (event.button === 1 || event.button === 2) event.preventDefault();
    if (event.button === 1) {
      const lot = lotIndexAt(event.clientX, event.clientY);
      if (lot) pickAt(lot.hood, lot.index);
      return;
    }
    const lot = lotIndexAt(event.clientX, event.clientY);
    if (!lot) return;
    if (event.button === 2) {
      beginDrag('erase', lot, event);
      return;
    }
    if (event.button !== 0) return;
    if (tool === 'zoom') return;
    if (tool === 'pass') {
      applyPassAt(lot.hood, lot.index);
      return;
    }
    if (event.pointerType === 'touch') {
      const timer = window.setTimeout(() => {
        pressRef.current = null;
        if (!dragRef.current) return;
        dragRef.current.tool = 'erase';
        setErasing(true);
      }, ERASE_LONG_PRESS_MS);
      pressRef.current = { x: event.clientX, y: event.clientY, timer };
      beginDrag(tool, lot, event);
      return;
    }
    if (tool === 'eyedropper') {
      pickAt(lot.hood, lot.index);
      return;
    }
    if (tool === 'paste') {
      doPaste(lot.hood, lot.index);
      return;
    }
    if (tool === 'place' || tool === 'select' || tool === 'delete') beginDrag(tool, lot, event);
  };

  const onGridPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressRef.current && longPressMoved(pressRef.current, { x: event.clientX, y: event.clientY })) clearLongPress();
    if (!dragRef.current) return;
    const lot = lotIndexAt(event.clientX, event.clientY);
    if (!lot || !dragRef.current || lot.hood !== dragRef.current.hood) return;
    dragRef.current.current = lot.index;
    setDragCurrent(lot.index);
  };

  const onGridPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    clearLongPress();
    const drag = dragRef.current;
    dragRef.current = null;
    setErasing(false);
    if (!drag || !city) {
      setDragAnchor(null);
      setDragCurrent(null);
      return;
    }
    const lot = lotIndexAt(event.clientX, event.clientY);
    const index = lot && lot.hood === drag.hood ? lot.index : drag.current;
    const grid = hoodGrid(city, drag.hood);
    if (drag.tool === 'erase' || drag.tool === 'delete') {
      finishClear(drag.hood, indicesInRect(grid.cols, grid.rows, pointFromIndex(grid.cols, drag.anchor), pointFromIndex(grid.cols, index)), 'Deleted');
    } else if (drag.tool === 'place') finishPlace(drag.hood, drag.anchor, index);
    else if (drag.tool === 'select') {
      const start = pointFromIndex(grid.cols, drag.anchor);
      const end = pointFromIndex(grid.cols, index);
      setSelectionHood(drag.hood);
      setSelection({
        x0: Math.min(start.x, end.x),
        y0: Math.min(start.y, end.y),
        x1: Math.max(start.x, end.x),
        y1: Math.max(start.y, end.y),
      });
    } else if (drag.tool === 'eyedropper') pickAt(drag.hood, index);
    else if (drag.tool === 'paste') doPaste(drag.hood, index);
    setDragAnchor(null);
    setDragCurrent(null);
  };

  const onGridContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const onDeleteTool = () => {
    const indices = selectionIndices();
    setTool('delete');
    setSelection(null);
    if (indices.length === 0) return;
    finishClear(selectionHood, indices, 'Deleted');
  };

  const onShare = async () => {
    if (!city || !visitor) return;
    const named = saveCityName(nameDraft);
    if (!named.ok) { setNameError(named.reason); return; }
    setNameDraft(named.name);
    setSharing(true);
    setShareNote(null);
    const token = ensurePlayerToken(localStorage);
    const result = await publishMyCity({ username: visitor, cityName: named.name, city, token });
    setSharing(false);
    if (!result.online) {
      setOnline(false);
      setShareLink(null);
      setShareNote(ONLINE_UNAVAILABLE);
      return;
    }
    if (!result.ok) {
      setShareNote(result.error);
      return;
    }
    const link = `${window.location.origin}${result.path}`;
    setShareLink(link);
    setShareNote('Copied cities can open this read-only link.');
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try { await navigator.clipboard.writeText(shareLink); setShareNote('Link copied.'); }
    catch { setShareNote('Select the link and copy it.'); }
  };

  const commitName = () => {
    const result = saveCityName(nameDraft);
    if (!result.ok) {
      setNameError(result.reason);
      return;
    }
    setNameError(null);
    setNameDraft(result.name);
  };

  const placePreview = useMemo(() => {
    if (!city || erasing || tool !== 'place' || !selected || dragAnchor == null || dragCurrent == null) return new Map<string, string>();
    const grid = hoodGrid(city, dragHood);
    const indices = indicesInRect(grid.cols, grid.rows, pointFromIndex(grid.cols, dragAnchor), pointFromIndex(grid.cols, dragCurrent));
    let budget = selected.kind === 'decor' ? Number.POSITIVE_INFINITY : availableTokens(consumes[selected.emoji] ?? 0, placedOf(city, selected.emoji));
    const marks = new Map<string, string>();
    for (const index of indices) {
      if (grid.tiles[index]) marks.set(`${dragHood}:${index}`, 'skip-occupied');
      else if (budget <= 0) marks.set(`${dragHood}:${index}`, 'skip-cost');
      else {
        budget -= 1;
        marks.set(`${dragHood}:${index}`, 'place');
      }
    }
    return marks;
  }, [city, erasing, tool, selected, dragAnchor, dragCurrent, dragHood, consumes]);

  const ants = useMemo(() => {
    if (!city) return new Set<string>();
    const grid = hoodGrid(city, dragAnchor != null ? dragHood : selectionHood);
    const rect = !erasing && tool === 'select' && dragAnchor != null && dragCurrent != null
      ? (() => {
        const start = pointFromIndex(grid.cols, dragAnchor);
        const end = pointFromIndex(grid.cols, dragCurrent);
        return { x0: Math.min(start.x, end.x), y0: Math.min(start.y, end.y), x1: Math.max(start.x, end.x), y1: Math.max(start.y, end.y) };
      })()
      : selection;
    if (!rect) return new Set<string>();
    const hood = dragAnchor != null && tool === 'select' && !erasing ? dragHood : selectionHood;
    return new Set(indicesInRect(grid.cols, grid.rows, { x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y1 }).map(index => `${hood}:${index}`));
  }, [city, erasing, tool, dragAnchor, dragCurrent, dragHood, selection, selectionHood]);

  const erase = useMemo(() => {
    if (!city || dragAnchor == null || dragCurrent == null || (!erasing && tool !== 'delete')) return new Set<string>();
    const grid = hoodGrid(city, dragHood);
    return new Set(indicesInRect(
      grid.cols,
      grid.rows,
      pointFromIndex(grid.cols, dragAnchor),
      pointFromIndex(grid.cols, dragCurrent),
    ).map(index => `${dragHood}:${index}`));
  }, [city, erasing, tool, dragAnchor, dragCurrent, dragHood]);

  const trainUnlocked = city ? trainLineSpansCity(city) : false;
  const canShare = trainUnlocked && online === true;
  const placed = city ? placedCount(city) : 0;
  const cap = city ? citizenCapacityOf(city) : 0;
  const citizens = city?.citizens.length ?? 0;
  const tokens = city ? totalAvailableTokens(consumes, city) : 0;
  const standings = city ? districtStandings(city) : [];

  return (
    <div data-testid="city-workbench" className="grid min-h-screen w-full grid-cols-1 items-start gap-2 px-1 py-3 sm:px-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-rows-[auto_auto_auto] lg:px-3 xl:pr-64">
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 max-lg:order-1 lg:col-start-2 lg:row-start-1 lg:mx-0 lg:max-w-none">
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Back to home" data-testid="city-back">
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black tracking-tight text-primary">🏙️ EmojiCB</h1>
          <label className="mt-1 block" htmlFor="city-name">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">City name</span>
            <Input
              id="city-name"
              data-testid="city-name"
              aria-label="City name"
              value={nameDraft}
              maxLength={CITY_NAME_MAX}
              spellCheck={false}
              autoComplete="off"
              className="mt-0.5 min-h-11 text-base font-semibold"
              onChange={event => {
                setNameDraft(event.target.value);
                if (nameError) setNameError(null);
              }}
              onBlur={commitName}
              onKeyDown={event => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
          {nameError && (
            <p role="alert" data-testid="city-name-error" className="mt-1 text-[11px] font-semibold text-destructive">
              {nameError}
            </p>
          )}
        </div>
      </div>

      <section data-testid="city-share" className="space-y-2 rounded-lg border border-border bg-card px-3 py-2">
        <p className="text-xs text-muted-foreground" data-testid="city-visitor">
          Visitor <span className="font-semibold text-foreground">{visitor}</span>
        </p>
        <p className="text-xs font-semibold" data-testid="city-train-status">
          {trainLineStatusLabel(city ? trainLineSpansCity(city) : false)}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground" data-testid="city-train-hint">
          {TRAIN_LINE_HINT}
        </p>
        {online === false && (
          <p data-testid="share-offline" className="text-[11px] font-semibold text-muted-foreground">
            {ONLINE_UNAVAILABLE}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {canShare ? (
            <Button asChild className="min-h-11 flex-1 text-xs">
              <Link href="/ledger" data-testid="visit-cities">Visit Cities</Link>
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11 flex-1 text-xs"
              disabled
              aria-disabled="true"
              data-testid="visit-cities"
            >
              Visit Cities
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 text-xs"
            disabled={!canShare || sharing}
            aria-disabled={!canShare || sharing}
            data-testid="share-city"
            onClick={() => { void onShare(); }}
          >
            {sharing ? 'Sharing…' : 'Share'}
          </Button>
        </div>
        {shareLink && (
          <div className="flex gap-2">
            <Input readOnly data-testid="share-link" aria-label="Public city link" value={shareLink} className="min-h-11 text-xs" />
            <Button type="button" variant="outline" className="min-h-11" data-testid="share-copy" onClick={() => { void copyShareLink(); }}>
              Copy
            </Button>
          </div>
        )}
        {shareNote && <p data-testid="share-note" className="text-[11px] text-muted-foreground">{shareNote}</p>}
      </section>

      <div
        data-testid="city-hud"
        className="grid grid-cols-3 gap-1.5 text-center text-xs"
      >
        <div className="rounded-lg border border-border bg-card px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Placed</div>
          <div className="font-bold tabular-nums" data-testid="city-placed">{placed}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Citizens</div>
          <div className="font-bold tabular-nums" data-testid="city-citizens">{citizens}/{cap}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tokens</div>
          <div className="font-bold tabular-nums" data-testid="city-tokens">{tokens}</div>
        </div>
      </div>

      {away && (
        <p
          role="status"
          data-testid="city-away"
          className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary"
        >
          {away}
        </p>
      )}

      {city && (
        <div className="space-y-1.5" data-testid="city-district">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground" data-testid="city-district-rule">
            Districts stack. Weight {DISTRICT_THRESHOLD} is tier 1. Each doubling raises the bonus, through tier {DISTRICT_BONUS_TIER_CAP}.
          </p>
          <ul className="space-y-1" aria-label="Districts">
            {standings.map(row => (
              <li
                key={row.id}
                data-testid={`city-district-${row.id}`}
                className={`flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-lg border px-2 py-1.5 text-xs ${row.tier > 0 ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground'}`}
              >
                <span className="min-w-0 font-semibold leading-snug">{row.name}</span>
                <span className="text-right tabular-nums leading-snug">
                  <span data-testid={`city-district-${row.id}-count`}>{row.count} placed</span>
                  <span className="text-muted-foreground"> · </span>
                  <span data-testid={`city-district-${row.id}-weight`}>weight {row.weight}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-semibold" data-testid={`city-district-${row.id}-bonus`}>{row.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-snug min-h-8" data-testid="city-note">{note}</p>
    </div>

        <div className="max-lg:order-2 lg:col-start-1 lg:row-span-full lg:sticky lg:top-3 lg:self-start">
        <CityToolPalette
          tool={tool}
          canCopy={selection !== null}
          canPaste={clipboard !== null}
          canUndo={undoStack.length > 0}
          onTool={next => {
            if (next === 'delete') onDeleteTool();
            else chooseTool(next);
          }}
          onCopy={doCopy}
          onCut={doCut}
          onUndo={undo}
        />
        {tool === 'zoom' && (
          <div data-testid="zoom-options" className="paint-box mt-1 grid grid-cols-3 gap-1 p-1" aria-label="Zoom">
            <button type="button" className="paint-btn h-9 text-sm font-bold" data-testid="zoom-out" aria-label="Zoom out" onClick={() => setZoom(scale => stepZoom(scale, 'out'))}>−</button>
            <button type="button" className="paint-btn h-9 text-[10px] font-bold" data-testid="zoom-fit" aria-label="Fit the whole city" onClick={() => {
              const scroller = scrollRef.current;
              const grid = gridRef.current;
              if (!scroller || !grid) return;
              setZoom(fitZoom(scroller.clientWidth, scroller.clientHeight, grid.offsetWidth, grid.offsetHeight));
            }}>Fit</button>
            <button type="button" className="paint-btn h-9 text-sm font-bold" data-testid="zoom-in" aria-label="Zoom in" onClick={() => setZoom(scale => stepZoom(scale, 'in'))}>+</button>
          </div>
        )}
        {tool === 'pass' && (
          <div data-testid="pass-options" className="paint-box mt-1 grid grid-cols-2 gap-1 p-1" aria-label="Passability">
            <button type="button" className="paint-btn h-9 text-[10px] font-bold" data-testid="pass-mode-type" aria-pressed={passMode === 'type'} onClick={() => setPassMode('type')}>Type</button>
            <button type="button" className="paint-btn h-9 text-[10px] font-bold" data-testid="pass-mode-square" aria-pressed={passMode === 'square'} onClick={() => setPassMode('square')}>Square</button>
            {passMode === 'square' && (
              <>
                <button type="button" className="paint-btn h-9 text-[10px] font-bold" data-testid="pass-set-block" aria-pressed={passSquare === true} onClick={() => applyPassMarquee(true)}>Block</button>
                <button type="button" className="paint-btn h-9 text-[10px] font-bold" data-testid="pass-set-open" aria-pressed={passSquare === false} onClick={() => applyPassMarquee(false)}>Open</button>
                <button type="button" className="paint-btn col-span-2 h-9 text-[10px] font-bold" data-testid="pass-set-clear" aria-pressed={passSquare === null} onClick={() => applyPassMarquee(null)}>Type rule</button>
              </>
            )}
          </div>
        )}
        </div>
        {city && (
          <div className="flex min-w-0 flex-col gap-1 max-lg:order-3 lg:col-start-2 lg:row-start-2" data-testid="city-expand">
            <div className="min-w-0">
              <div
                ref={scrollRef}
                className="min-h-0 min-w-0 max-h-[70dvh] overflow-auto"
                data-testid="city-grid-scroll"
                onPointerDown={event => {
                  if (tool !== 'zoom' || event.button !== 0) return;
                  if ((event.target as Element).closest('button')) return;
                  const scroller = event.currentTarget;
                  panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
                  scroller.setPointerCapture(event.pointerId);
                }}
                onPointerMove={event => {
                  const pan = panRef.current;
                  if (!pan || pan.pointerId !== event.pointerId) return;
                  event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x);
                  event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y);
                }}
                onPointerUp={event => { if (panRef.current?.pointerId === event.pointerId) panRef.current = null; }}
                onPointerCancel={event => { if (panRef.current?.pointerId === event.pointerId) panRef.current = null; }}
              >
                <WorldMap
                  city={city}
                  zoom={zoom}
                  portWidth={portWidth}
                  gridRef={gridRef}
                  tokens={tokens}
                  tool={tool}
                  selected={selected}
                  placePreview={placePreview}
                  ants={ants}
                  erase={erase}
                  onPointerDown={onGridPointerDown}
                  onPointerMove={onGridPointerMove}
                  onPointerUp={onGridPointerUp}
                  onExpand={onExpand}
                  onSpawn={onSpawn}
                  onContextMenu={onGridContextMenu}
                />
              </div>
            </div>
          </div>
        )}
        <div className="min-w-0 w-full max-lg:order-4 lg:col-start-3 lg:row-span-full lg:sticky lg:top-3 lg:max-h-[calc(100dvh-1.5rem)] lg:w-80 lg:self-start lg:overflow-y-auto xl:w-96" data-testid="city-structures">
          <BuildPalette
            sections={sections}
            selected={selected}
            raise={selectedBuilding ? {
              emoji: selectedBuilding.emoji,
              cost: BUILDING_EXCHANGE_COST,
              onRaise: raiseStructure,
            } : null}
            onSelect={entry => {
              const structure = entry.kind === 'token' && Boolean(buildingOf(entry.emoji));
              if (entry.locked && !structure) {
                setNote(entry.hint);
                return;
              }
              setSelected({ kind: entry.kind, emoji: entry.emoji });
              chooseTool('place');
              setNote(entry.kind === 'decor' ? `${entry.emoji} decor. Free, and it does not count.` : entry.hint);
            }}
          />
        </div>

      <div className="mx-auto w-full max-w-lg max-lg:order-5 lg:col-start-2 lg:row-start-3 lg:mx-0 lg:max-w-none">
        <p className="text-[11px] text-muted-foreground leading-relaxed pb-4">{emojiCityRulesBlurb()}</p>
      </div>
    </div>
  );
}

/** District bands. Each section inside a band is still its own full-width row. */
const PALETTE_MENU_ROWS = 5;

function BuildPalette({
  sections,
  selected,
  raise,
  onSelect,
}: {
  sections: PaletteSection[];
  selected: PalettePick | null;
  raise: { emoji: string; cost: number; onRaise: () => void } | null;
  onSelect: (entry: PaletteEntry) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef('');
  const closeTimer = useRef<number | null>(null);
  const rowClose = useRef<number | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [tappedRow, setTappedRow] = useState<string | null>(null);
  const [flyout, setFlyout] = useState<{ layout: 'side' | 'sheet'; style: CSSProperties } | null>(null);
  const [beside, setBeside] = useState<CSSProperties | null>(null);
  const rows = paletteMenuRows(sections);
  const openId = pinned ?? hovered;
  const openSection = sections.find(section => section.id === openId) ?? null;
  const raiseRow = hoveredRow ?? openId ?? tappedRow;
  const flyoutFrame = openSection && flyout
    ? raiseFlyoutFrame(flyout.style, flyout.layout, window.innerHeight, raise !== null)
    : null;

  const clearClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const holdOpen = (id: string) => {
    clearClose();
    setHovered(id);
  };
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = window.setTimeout(() => setHovered(null), FLYOUT_CLOSE_MS);
  };
  const holdRow = (id: string) => {
    if (rowClose.current !== null) window.clearTimeout(rowClose.current);
    rowClose.current = null;
    setHoveredRow(id);
  };
  const scheduleRowClose = (id: string) => {
    if (rowClose.current !== null) window.clearTimeout(rowClose.current);
    rowClose.current = window.setTimeout(() => {
      rowClose.current = null;
      setHoveredRow(current => current === id ? null : current);
    }, FLYOUT_CLOSE_MS);
  };

  useEffect(() => () => {
    clearClose();
    if (rowClose.current !== null) window.clearTimeout(rowClose.current);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pinned]);

  useLayoutEffect(() => {
    if (!openSection) return;
    const place = () => {
      const menu = menuRef.current?.getBoundingClientRect();
      const section = rootRef.current?.querySelector(`[data-testid="palette-section-${openSection.id}"]`)?.getBoundingClientRect();
      const dots = rootRef.current?.querySelector(`[data-testid="palette-more-${openSection.id}"]`)?.getBoundingClientRect();
      if (!menu) return;
      setFlyout(flyoutStyle(section ?? menu, menu, { width: window.innerWidth, height: window.innerHeight }, dots ?? undefined));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [openSection]);

  useLayoutEffect(() => {
    if (!raise || !raiseRow || openSection) {
      setBeside(null);
      return;
    }
    const place = () => {
      const menu = menuRef.current?.getBoundingClientRect();
      const section = rootRef.current?.querySelector(`[data-testid="palette-section-${raiseRow}"]`)?.getBoundingClientRect();
      if (!menu || !section) {
        setBeside(null);
        return;
      }
      const placed = raisePlace(section, menu, { width: window.innerWidth, height: window.innerHeight });
      setBeside(placed.mode === 'beside' ? placed.style ?? null : null);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [raise, raiseRow, openSection]);

  const togglePinned = (id: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (event.detail !== 0 && fineHover && pointerRef.current === 'mouse') return;
    setPinned(current => current === id ? null : id);
  };

  return (
    <div ref={rootRef} data-testid="city-palette" className="relative min-w-0">
      <div
        ref={menuRef}
        id="palette-menu"
        data-testid="palette-menu"
        data-rows={PALETTE_MENU_ROWS}
        aria-label="Structures"
        className="flex flex-col gap-1 overflow-x-hidden rounded-lg border border-border bg-card p-1.5"
      >
        {rows.map((row, index) => {
          const decorStart = row.findIndex(section => section.entries[0]?.kind === 'decor');
          const lead = decorStart === -1 ? row : row.slice(0, decorStart);
          const decor = decorStart === -1 ? [] : row.slice(decorStart);
          const strip = (section: PaletteSection) => (
            <PaletteStrip
              key={section.id}
              section={section}
              selected={selected}
              open={openId === section.id}
              raiseBelow={raise && raiseRow === section.id && !openSection && !beside ? (
                <div className="flex justify-end">
                  <RaiseControl raise={raise} place="below" />
                </div>
              ) : null}
              onSelect={onSelect}
              onPointerDown={event => { pointerRef.current = event.pointerType; }}
              onDotsEnter={event => { if (event.pointerType === 'mouse') holdOpen(section.id); }}
              onDotsLeave={event => { if (event.pointerType === 'mouse') scheduleClose(); }}
              onDotsClick={event => togglePinned(section.id, event)}
              onRowEnter={event => { if (event.pointerType === 'mouse') holdRow(section.id); }}
              onRowLeave={event => {
                if (event.pointerType !== 'mouse') return;
                scheduleRowClose(section.id);
              }}
              onRowTap={() => setTappedRow(section.id)}
            />
          );
          return (
            <div key={row.map(section => section.id).join('-') || index} data-testid={`palette-row-${index + 1}`} className="flex min-w-0 flex-col gap-1">
              {lead.map(strip)}
              {decor.length > 0 && (
                <div data-testid="city-decor" aria-label="Decor palette" className="flex flex-col gap-1">
                  {decor.map(strip)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {raise && beside && raiseRow && !openSection && (
        <RaiseControl
          raise={raise}
          style={beside}
          place="beside"
          onPointerEnter={event => { if (event.pointerType === 'mouse') holdRow(raiseRow); }}
          onPointerLeave={event => { if (event.pointerType === 'mouse') scheduleRowClose(raiseRow); }}
        />
      )}
      {openSection && flyout && flyoutFrame && (
        <div
          style={flyoutFrame.frame}
          onPointerEnter={event => { if (event.pointerType === 'mouse' && openId) holdOpen(openId); }}
          onPointerLeave={event => { if (event.pointerType === 'mouse') scheduleClose(); }}
        >
          {raise && flyoutFrame.parkAbove && (
            <RaiseControl raise={raise} className="absolute bottom-full left-0" place="above" />
          )}
        <div
          role="dialog"
          aria-label={openSection.label}
          data-testid="palette-flyout"
          data-section={openSection.id}
          data-layout={flyout.layout}
          style={flyoutFrame.panel}
          className="overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-lg"
        >
          {raise && !flyoutFrame.parkAbove && (
            <RaiseControl raise={raise} className="mb-1.5" place="inside" />
          )}
          <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold">
            {openSection.badge && <span aria-hidden="true">{openSection.badge}</span>}
            <span>{openSection.label}</span>
          </div>
          <div
            data-testid="palette-flyout-grid"
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(2.75rem, 1fr))' }}
          >
            {openSection.entries.map(entry => (
              <PaletteChoice
                key={`${entry.kind}-${entry.emoji}`}
                entry={entry}
                selected={selected}
                onSelect={onSelect}
                testIdPrefix="flyout-"
              />
            ))}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

function RaiseControl({
  raise,
  className = '',
  style,
  place,
  onPointerEnter,
  onPointerLeave,
}: {
  raise: { emoji: string; cost: number; onRaise: () => void };
  className?: string;
  style?: CSSProperties;
  place: 'beside' | 'above' | 'inside' | 'below';
  onPointerEnter?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerLeave?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      style={style}
      data-raise={place}
      className={`h-8 min-h-0 gap-0.5 whitespace-nowrap px-1.5 text-[10px] shadow-sm ${className}`}
      data-testid="raise-structure"
      aria-label={`Raise ${raise.emoji} · ${raise.cost} tokens`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={event => {
        event.stopPropagation();
        raise.onRaise();
      }}
    >
      <span>Raise</span>
      <span className="text-sm leading-none">{raise.emoji}</span>
      <span className="tabular-nums">{raise.cost}</span>
    </Button>
  );
}

function PaletteStrip({
  section,
  selected,
  open,
  raiseBelow,
  onSelect,
  onPointerDown,
  onDotsEnter,
  onDotsLeave,
  onDotsClick,
  onRowEnter,
  onRowLeave,
  onRowTap,
}: {
  section: PaletteSection;
  selected: PalettePick | null;
  open: boolean;
  raiseBelow: ReactNode;
  onSelect: (entry: PaletteEntry) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDotsEnter: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDotsLeave: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDotsClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onRowEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onRowLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onRowTap: () => void;
}) {
  return (
    <section
      data-testid={`palette-section-${section.id}`}
      aria-label={section.label}
      className="flex w-full min-w-0 flex-col gap-1"
      onPointerEnter={onRowEnter}
      onPointerLeave={onRowLeave}
      onPointerDown={onRowTap}
    >
      <div className="relative flex w-full min-w-0 items-start gap-1">
        <div className="flex w-[7.25rem] shrink-0 items-center gap-0.5 pt-2">
          {section.badge && <span className="shrink-0 text-base leading-none" aria-hidden="true">{section.badge}</span>}
          <span className="min-w-0 truncate text-[10px] font-semibold">{section.label}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-hidden pr-8">
          {section.entries.map(entry => (
            <PaletteChoice key={`${entry.kind}-${entry.emoji}`} entry={entry} selected={selected} onSelect={onSelect} />
          ))}
        </div>
        <button
          type="button"
          data-testid={`palette-more-${section.id}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Show all ${section.label}`}
          onPointerDown={onPointerDown}
          onPointerEnter={onDotsEnter}
          onPointerLeave={onDotsLeave}
          onClick={onDotsClick}
          className="absolute bottom-0 right-0 z-30 flex h-8 w-8 items-end justify-end text-lg font-black leading-none text-purple-400"
        >
          …
        </button>
      </div>
      {raiseBelow}
    </section>
  );
}

function PaletteChoice({
  entry,
  selected,
  onSelect,
  testIdPrefix = '',
}: {
  entry: PaletteEntry;
  selected: PalettePick | null;
  onSelect: (entry: PaletteEntry) => void;
  testIdPrefix?: string;
}) {
  const on = selected?.kind === entry.kind && selected.emoji === entry.emoji;
  const testId = `${testIdPrefix}${entry.kind === 'decor' ? `decor-${entry.emoji}` : `palette-${entry.emoji}`}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span title={entry.hint} className="inline-flex">
          <button
            type="button"
            data-testid={testId}
            data-locked={entry.locked ? 'true' : 'false'}
            aria-pressed={on}
            aria-disabled={entry.locked && entry.kind === 'token' && !buildingOf(entry.emoji)}
            onClick={() => onSelect(entry)}
            className={`shrink-0 min-h-11 min-w-11 rounded-lg border px-1 text-xl leading-none ${on ? 'border-primary bg-primary/15' : 'border-border bg-card'} ${entry.locked ? 'opacity-40' : ''}`}
          >
            <span className="block">{entry.emoji}</span>
            {entry.kind === 'token' && (
              <span className="block text-[10px] font-bold tabular-nums">{entry.tokens}</span>
            )}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{entry.hint}</TooltipContent>
    </Tooltip>
  );
}

function cellBlocked(hood: { tiles: (string | null)[]; passOverride: (boolean | null)[]; blockedTypes: string[] }, index: number): boolean {
  const override = hood.passOverride[index];
  if (override === true) return true;
  if (override === false) return false;
  const emoji = hood.tiles[index];
  return !!emoji && hood.blockedTypes.includes(emoji);
}

function WorldMap({
  city,
  zoom,
  portWidth,
  gridRef,
  tokens,
  tool,
  selected,
  placePreview,
  ants,
  erase,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onExpand,
  onSpawn,
  onContextMenu,
}: {
  city: CityState;
  zoom: number;
  portWidth: number;
  gridRef: RefObject<HTMLDivElement | null>;
  tokens: number;
  tool: CityTool;
  selected: PalettePick | null;
  placePreview: Map<string, string>;
  ants: Set<string>;
  erase: Set<string>;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onExpand: (hoodId: string, edge: CityEdge) => void;
  onSpawn: (hoodId: string, edge: CityEdge) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const bounds = worldBounds(city);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const tile = portWidth > 0 ? Math.max(32, Math.min(44, Math.floor((portWidth - 2 * (spanX - 1)) / spanX))) : 44;
  const gap = 2;
  const pad = 64;
  const worldW = spanX * tile + Math.max(0, spanX - 1) * gap + pad * 2;
  const worldH = spanY * tile + Math.max(0, spanY - 1) * gap + pad * 2;
  const place = (ox: number, oy: number) => ({
    left: pad + (ox - bounds.minX) * (tile + gap),
    top: pad + (oy - bounds.minY) * (tile + gap),
  });
  return (
    <div className="relative w-fit min-w-min max-w-full" style={{ width: worldW * zoom, height: worldH * zoom }}>
      <div
        ref={gridRef}
        data-testid="city-grid"
        data-zoom={zoom}
        className="relative"
        style={{ width: worldW, height: worldH, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
        onMouseDown={event => { if (event.button === 1 || event.button === 2) event.preventDefault(); }}
      >
        {allHoods(city).map(hood => {
          const at = place(hood.ox, hood.oy);
          return (
            <div key={hood.id} data-testid={`neighborhood-${hood.id}`} className="absolute" style={at}>
              <div className="absolute z-20 -translate-x-1/2" style={{ top: 2, left: '50%' }}>
                <HoodEdge edge="north" hood={hood} city={city} tokens={tokens} onExpand={onExpand} onSpawn={onSpawn} />
              </div>
              <div className="absolute z-20 -translate-y-1/2" style={{ left: 2, top: '50%' }}>
                <HoodEdge edge="west" hood={hood} city={city} tokens={tokens} onExpand={onExpand} onSpawn={onSpawn} />
              </div>
              <div className="absolute z-20 -translate-y-1/2" style={{ right: 2, top: '50%' }}>
                <HoodEdge edge="east" hood={hood} city={city} tokens={tokens} onExpand={onExpand} onSpawn={onSpawn} />
              </div>
              <div className="absolute z-20 -translate-x-1/2" style={{ bottom: 2, left: '50%' }}>
                <HoodEdge edge="south" hood={hood} city={city} tokens={tokens} onExpand={onExpand} onSpawn={onSpawn} />
              </div>
              <div className="relative z-0 grid gap-0.5" style={{ gridTemplateColumns: portWidth > 0 ? `repeat(${hood.cols}, ${tile}px)` : `repeat(${hood.cols}, minmax(${CITY_TILE_MIN}, ${CITY_TILE_MAX}))` }}>
                {hood.tiles.map((cell, index) => {
                  const lx = index % hood.cols;
                  const ly = Math.floor(index / hood.cols);
                  const key = `${hood.id}:${index}`;
                  const here = city.citizens.filter(citizen => citizen.x === hood.ox + lx && citizen.y === hood.oy + ly);
                  const previewStatus = placePreview.get(key);
                  const blocked = cellBlocked(hood, index);
                  return (
                    <button
                      key={key}
                      type="button"
                      data-testid={hood.id === ORIGIN_ID ? `lot-${index}` : `lot-${hood.id}-${index}`}
                      data-lot={index}
                      data-hood={hood.id}
                      data-preview={previewStatus}
                      data-selected={ants.has(key) ? 'true' : undefined}
                      data-unpassable={tool === 'pass' && blocked ? 'true' : undefined}
                      aria-label={cell ? `Lot with ${cell}` : `Empty lot ${index + 1}`}
                      className={`relative aspect-square w-full min-h-0 min-w-0 rounded-md border border-border/70 bg-emerald-950/30 text-xl leading-none ${erase.has(key) ? 'bg-red-950/50' : ''}`}
                      style={{ width: tile, height: tile }}
                    >
                      {ants.has(key) && <span className="paint-ants absolute inset-0" />}
                      {tool === 'pass' && blocked && (
                        <span className="pointer-events-none absolute inset-0 rounded-md bg-rose-500/25" />
                      )}
                      {cell ?? (previewStatus === 'place' && selected
                        ? <span className="opacity-60">{selected.emoji}</span>
                        : <span className="text-muted-foreground/30 text-sm">·</span>)}
                      {previewStatus === 'skip-cost' && !cell && (
                        <span className="text-[10px] font-bold text-red-300">×</span>
                      )}
                      {here.map(citizen => (
                        <span key={citizen.id} data-testid={`citizen-${citizen.id}`} className="absolute bottom-0 right-0 text-[11px] leading-none">
                          {citizen.emoji}
                        </span>
                      ))}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HoodEdge({
  edge,
  hood,
  city,
  tokens,
  onExpand,
  onSpawn,
}: {
  edge: CityEdge;
  hood: Neighborhood;
  city: CityState;
  tokens: number;
  onExpand: (hoodId: string, edge: CityEdge) => void;
  onSpawn: (hoodId: string, edge: CityEdge) => void;
}) {
  if (!canGrowEdge(hood, edge)) return null;
  const span = edge === 'east' || edge === 'west' ? hood.cols : hood.rows;
  if (span >= CITY_DIM_MAX && hoodIsMaxed(hood, CITY_DIM_MAX)) {
    if (spawnBlocked(city, hood, edge)) return null;
    return (
      <button type="button" data-testid={`spawn-${hood.id}-${edge}`} className="paint-btn h-12 w-16 px-1 text-[9px] font-bold leading-tight" onClick={() => onSpawn(hood.id, edge)}>
        New neighborhood
        <span className="mt-0.5 block tabular-nums">{NEIGHBORHOOD_COST}</span>
      </button>
    );
  }
  if (growthBlocked(city, hood, edge)) return null;
  return <ExpandEdge edge={edge} hoodId={hood.id} city={{ ...city, cols: hood.cols, rows: hood.rows }} tokens={tokens} onExpand={onExpand} />;
}

const EDGE_ICON = {
  north: ChevronUp,
  south: ChevronDown,
  east: ChevronRight,
  west: ChevronLeft,
} as const;

function ExpandEdge({
  edge,
  hoodId,
  city,
  tokens,
  onExpand,
}: {
  edge: CityEdge;
  hoodId: string;
  city: CityState;
  tokens: number;
  onExpand: (hoodId: string, edge: CityEdge) => void;
}) {
  const blocked = expandBlockReason(city, edge, tokens);
  if (blocked === 'This edge cannot grow further.') {
    return (
      <div
        data-testid={`expand-${hoodId}-${edge}`}
        data-max-size="true"
        aria-label="Max size"
        className="flex h-11 w-9 items-center justify-center px-0.5 text-center text-[9px] font-bold leading-tight text-muted-foreground sm:w-11"
      >
        Max size
      </div>
    );
  }
  const hint = blocked ?? `Expand ${edge} for ${CITY_EXPAND_COST} tokens`;
  const Icon = EDGE_ICON[edge];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span title={hint} className="inline-flex shrink-0" data-testid={`expand-${edge}-wrap`}>
          <Button
            type="button"
            variant="outline"
            className="flex h-11 w-9 flex-col gap-0 whitespace-normal px-0.5 sm:w-11"
            disabled={blocked !== null}
            data-testid={`expand-${hoodId}-${edge}`}
            aria-label={hint}
            onClick={() => onExpand(hoodId, edge)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="text-[10px] font-bold tabular-nums">{CITY_EXPAND_COST}</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
