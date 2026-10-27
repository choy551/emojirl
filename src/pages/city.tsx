import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CITY_NAME_MAX } from '../game/cityIdentity';
import { FLYOUT_CLOSE_MS, flyoutStyle, raiseFlyoutFrame, raisePlace } from './cityPaletteLayout';
import { getEnemyKillCounts } from '../game/discoveries';
import {
  BUILDING_EXCHANGE_COST,
  buildingOf,
} from '../game/cityBuildings';
import {
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
  expandCity,
  normalizeCity,
  paletteMenuRows,
  placedCount,
  placedOf,
  tickCitizens,
  totalAvailableTokens,
  TRAIN_LINE_HINT,
  trainLineSpansCity,
  trainLineStatusLabel,
  type CityEdge,
  type CityState,
  type PaletteEntry,
  type PaletteSection,
} from '../game/emojiCity';

type PalettePick = { kind: 'token' | 'decor'; emoji: string };

/** Lot size when the page has room. The grid widens at this size as columns are added. */
const CITY_TILE_MAX = '2.75rem';
/** Smallest lot. Narrow screens shrink toward this before a horizontal scrollbar appears. */
const CITY_TILE_MIN = '2rem';
import { ensurePlayerToken, loadShareStatus, publishMyCity } from '../game/cityShareClient';
import { ONLINE_UNAVAILABLE } from '../game/cityShareModel';
import { ensureCityProfile, loadMeta, replaceEmojiConsumes, saveCity, saveCityName, settleCityCatchUp } from '../game/meta';
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
  previewPlacement,
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
  const [erasing, setErasing] = useState(false);
  const dragRef = useRef<{ tool: CityTool | 'erase'; anchor: number; current: number } | null>(null);
  const endDragAtRef = useRef<(clientX: number, clientY: number) => void>(() => {});
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
    const first = buildPaletteSections(counts, caught.city)
      .flatMap(section => section.entries)
      .find(entry => entry.kind === 'token' && !entry.locked);
    setSelected(first ? { kind: 'token', emoji: first.emoji } : null);
    let cancel = false;
    loadShareStatus().then(status => { if (!cancel) setOnline(status.online); });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCity(prev => {
        if (!prev) return prev;
        const next = tickCitizens(prev, Math.random);
        saveCity(next);
        return next;
      });
    }, CITY_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

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
        setLocation('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLocation]);

  const sections = useMemo(
    () => (city ? buildPaletteSections(consumes, city) : []),
    [consumes, city],
  );
  const selectedBuilding = selected?.kind === 'token' ? buildingOf(selected.emoji) : undefined;

  const raiseStructure = () => {
    if (!city || !selectedBuilding) return;
    const result = exchangeForBuilding(consumes, city, selectedBuilding.emoji);
    if (!result.ok) { setNote(result.reason ?? 'Cannot raise that structure.'); return; }
    const saved = replaceEmojiConsumes(result.consumes);
    setConsumes(saved);
    const left = availableTokens(saved[selectedBuilding.emoji] ?? 0, placedOf(city, selectedBuilding.emoji));
    setNote(`Raised ${selectedBuilding.emoji} ${selectedBuilding.name}. ${left} token${left === 1 ? '' : 's'} ready to place.`);
  };

  const onExpand = (edge: CityEdge) => {
    if (!city) return;
    const result = expandCity(city, edge, consumes);
    if (!result.ok) { setNote(result.reason ?? 'Cannot expand.'); return; }
    const saved = replaceEmojiConsumes(result.consumes);
    setConsumes(saved);
    setCity(result.city);
    saveCity(result.city);
    setNote(`Expanded ${edge}. The grid is ${result.city.cols}×${result.city.rows}.`);
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
      setCity(snap.city);
      setConsumes(snap.consumes);
      saveCity(snap.city);
      replaceEmojiConsumes(snap.consumes);
      setNote('Undid the last edit.');
      return stack.slice(0, -1);
    });
  };
  undoRef.current = undo;

  const selectionIndices = () => {
    if (!city || !selection) return [];
    return indicesInRect(city.cols, city.rows, { x: selection.x0, y: selection.y0 }, { x: selection.x1, y: selection.y1 });
  };

  const finishClear = (indices: number[], verb: string) => {
    if (!city) return;
    const result = applyClear(city, indices, killsRef.current, Math.random);
    if (result.removed === 0) {
      setNote('Nothing to clear.');
      return;
    }
    remember();
    setCity(result.city);
    saveCity(result.city);
    setNote(`${verb} ${result.removed}. Refunded ${result.refunded} token${result.refunded === 1 ? '' : 's'}.`);
  };

  const doCopy = () => {
    if (!city || !selection) {
      setNote('Select a region first.');
      return;
    }
    const stamp = copyRect(city, selection);
    setClipboard(stamp);
    setNote(`Copied ${stamp.cols}×${stamp.rows}.`);
  };

  const doCut = () => {
    if (!city || !selection) {
      setNote('Select a region first.');
      return;
    }
    const stamp = copyRect(city, selection);
    const result = applyClear(city, selectionIndices(), killsRef.current, Math.random);
    if (result.removed === 0) {
      setNote('Nothing to cut.');
      return;
    }
    remember();
    setClipboard(stamp);
    setCity(result.city);
    saveCity(result.city);
    setNote(`Cut ${stamp.cols}×${stamp.rows}. Refunded ${result.refunded} token${result.refunded === 1 ? '' : 's'}.`);
  };

  const doPaste = (index: number) => {
    if (!city || !clipboard) {
      setNote('Copy or cut a region first.');
      return;
    }
    const result = applyPaste(city, clipboard, pointFromIndex(city.cols, index), consumes, killsRef.current, Math.random);
    if (result.placed === 0) {
      setNote('Nothing pasted. The lots are full or tokens ran out.');
      return;
    }
    remember();
    setCity(result.city);
    saveCity(result.city);
    setNote(`Pasted ${result.placed}.${result.skipped ? ` Skipped ${result.skipped}.` : ''}`);
  };

  const pickAt = (index: number) => {
    if (!city) return;
    const brush = brushFromLot(city, index);
    if (!brush) {
      setNote('That lot is empty.');
      return;
    }
    setSelected(brush);
    setTool('place');
    setNote(`Brush is ${brush.emoji}${brush.kind === 'decor' ? ' decor' : ''}.`);
  };

  const finishPlace = (anchor: number, current: number) => {
    if (!city) return;
    if (!selected) {
      setNote('Pick an emoji first.');
      return;
    }
    const indices = indicesInRect(city.cols, city.rows, pointFromIndex(city.cols, anchor), pointFromIndex(city.cols, current));
    const result = applyPlacement(city, selected, consumes, indices, killsRef.current, Math.random);
    if (result.placed === 0) {
      setNote('Nothing placed. Lots were full or tokens ran out.');
      return;
    }
    remember();
    setCity(result.city);
    saveCity(result.city);
    const free = selected.kind === 'decor' ? ' Decor is free.' : '';
    setNote(`Placed ${result.placed} ${selected.emoji}.${free}${result.skipped ? ` Skipped ${result.skipped}.` : ''}`);
  };

  const lotIndexAt = (clientX: number, clientY: number): number | null => {
    const el = document.elementFromPoint(clientX, clientY);
    const lot = el?.closest('[data-lot]');
    if (!lot) return null;
    const index = Number(lot.getAttribute('data-lot'));
    return Number.isInteger(index) ? index : null;
  };

  const clearLongPress = () => {
    if (!pressRef.current) return;
    window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };

  const beginDrag = (kind: CityTool | 'erase', index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { tool: kind, anchor: index, current: index };
    setErasing(kind === 'erase');
    setDragAnchor(index);
    setDragCurrent(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onGridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!city) return;
    if (event.button === 1 || event.button === 2) event.preventDefault();
    if (event.button === 1) {
      const index = lotIndexAt(event.clientX, event.clientY);
      if (index != null) pickAt(index);
      return;
    }
    const index = lotIndexAt(event.clientX, event.clientY);
    if (index == null) return;
    if (event.button === 2) {
      beginDrag('erase', index, event);
      return;
    }
    if (event.button !== 0) return;
    if (event.pointerType === 'touch') {
      const timer = window.setTimeout(() => {
        pressRef.current = null;
        if (!dragRef.current) return;
        dragRef.current.tool = 'erase';
        setErasing(true);
      }, ERASE_LONG_PRESS_MS);
      pressRef.current = { x: event.clientX, y: event.clientY, timer };
      beginDrag(tool, index, event);
      return;
    }
    if (tool === 'eyedropper') {
      pickAt(index);
      return;
    }
    if (tool === 'paste') {
      doPaste(index);
      return;
    }
    if (tool === 'place' || tool === 'select' || tool === 'delete') beginDrag(tool, index, event);
  };

  const onGridPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressRef.current && longPressMoved(pressRef.current, { x: event.clientX, y: event.clientY })) clearLongPress();
    if (!dragRef.current) return;
    const index = lotIndexAt(event.clientX, event.clientY);
    if (index == null || !dragRef.current) return;
    dragRef.current.current = index;
    setDragCurrent(index);
  };

  const endDragAt = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    clearLongPress();
    setErasing(false);
    if (!city) {
      setDragAnchor(null);
      setDragCurrent(null);
      return;
    }
    const index = lotIndexAt(clientX, clientY) ?? drag.current;
    if (drag.tool === 'erase' || drag.tool === 'delete') {
      finishClear(indicesInRect(city.cols, city.rows, pointFromIndex(city.cols, drag.anchor), pointFromIndex(city.cols, index)), 'Deleted');
    } else if (drag.tool === 'place') finishPlace(drag.anchor, index);
    else if (drag.tool === 'select') {
      const start = pointFromIndex(city.cols, drag.anchor);
      const end = pointFromIndex(city.cols, index);
      setSelection({
        x0: Math.min(start.x, end.x),
        y0: Math.min(start.y, end.y),
        x1: Math.max(start.x, end.x),
        y1: Math.max(start.y, end.y),
      });
    } else if (drag.tool === 'eyedropper') pickAt(index);
    else if (drag.tool === 'paste') doPaste(index);
    setDragAnchor(null);
    setDragCurrent(null);
  };
  endDragAtRef.current = endDragAt;

  useEffect(() => {
    const onRelease = (event: Event) => {
      if ('changedTouches' in event) {
        const touch = (event as TouchEvent).changedTouches[0];
        endDragAtRef.current(touch?.clientX ?? -1, touch?.clientY ?? -1);
        return;
      }
      const point = event as MouseEvent;
      endDragAtRef.current(point.clientX, point.clientY);
    };
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('mouseup', onRelease);
    window.addEventListener('touchend', onRelease);
    window.addEventListener('touchcancel', onRelease);
    return () => {
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('mouseup', onRelease);
      window.removeEventListener('touchend', onRelease);
      window.removeEventListener('touchcancel', onRelease);
    };
  }, []);

  const onGridPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    endDragAt(event.clientX, event.clientY);
  };

  const onGridContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const onDeleteTool = () => {
    setTool('delete');
    if (!selection) return;
    finishClear(selectionIndices(), 'Deleted');
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
    if (!city || erasing || tool !== 'place' || !selected || dragAnchor == null || dragCurrent == null) return new Map<number, string>();
    const indices = indicesInRect(
      city.cols,
      city.rows,
      pointFromIndex(city.cols, dragAnchor),
      pointFromIndex(city.cols, dragCurrent),
    );
    return new Map(previewPlacement(city, selected, consumes, indices).map(cell => [cell.index, cell.status]));
  }, [city, erasing, tool, selected, dragAnchor, dragCurrent, consumes]);

  const ants = useMemo(() => {
    if (!city) return new Set<number>();
    const rect = !erasing && tool === 'select' && dragAnchor != null && dragCurrent != null
      ? (() => {
        const start = pointFromIndex(city.cols, dragAnchor);
        const end = pointFromIndex(city.cols, dragCurrent);
        return { x0: Math.min(start.x, end.x), y0: Math.min(start.y, end.y), x1: Math.max(start.x, end.x), y1: Math.max(start.y, end.y) };
      })()
      : selection;
    if (!rect) return new Set<number>();
    return new Set(indicesInRect(city.cols, city.rows, { x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y1 }));
  }, [city, erasing, tool, dragAnchor, dragCurrent, selection]);

  const erase = useMemo(() => {
    if (!city || dragAnchor == null || dragCurrent == null || (!erasing && tool !== 'delete')) return new Set<number>();
    return new Set(indicesInRect(
      city.cols,
      city.rows,
      pointFromIndex(city.cols, dragAnchor),
      pointFromIndex(city.cols, dragCurrent),
    ));
  }, [city, erasing, tool, dragAnchor, dragCurrent]);

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
            else setTool(next);
          }}
          onCopy={doCopy}
          onCut={doCut}
          onUndo={undo}
        />
        </div>
        {city && (
          <div className="flex min-w-0 flex-col gap-1 max-lg:order-3 lg:col-start-2 lg:row-start-2" data-testid="city-expand">
            <div className="flex justify-center">
              <ExpandEdge edge="north" city={city} tokens={tokens} onExpand={onExpand} />
            </div>
            <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
              <ExpandEdge edge="west" city={city} tokens={tokens} onExpand={onExpand} />
              <div className="min-w-0 overflow-x-auto" data-testid="city-grid-scroll">
                <div
                  data-testid="city-grid"
                  data-selection={selection ? `${selection.x0},${selection.y0},${selection.x1},${selection.y1}` : undefined}
                  className="relative mx-auto grid w-fit min-w-min max-w-full touch-none select-none gap-0.5"
                  style={{ gridTemplateColumns: `repeat(${city.cols}, minmax(${CITY_TILE_MIN}, ${CITY_TILE_MAX}))` }}
                  onPointerDown={onGridPointerDown}
                  onPointerMove={onGridPointerMove}
                  onPointerUp={onGridPointerUp}
                  onPointerCancel={onGridPointerUp}
                  onContextMenu={onGridContextMenu}
                  onMouseDown={event => { if (event.button === 1 || event.button === 2) event.preventDefault(); }}
                >
                  {city.tiles.map((cell, index) => {
                    const here = city.citizens.filter(c => c.y * city.cols + c.x === index);
                    const previewStatus = placePreview.get(index);
                    return (
                      <button
                        key={index}
                        type="button"
                        data-testid={`lot-${index}`}
                        data-lot={index}
                        data-preview={previewStatus}
                        data-selected={ants.has(index) ? 'true' : undefined}
                        aria-label={cell ? `Lot with ${cell}` : `Empty lot ${index + 1}`}
                        className={`relative aspect-square w-full min-h-0 min-w-0 rounded-md border border-border/70 bg-emerald-950/30 text-xl leading-none ${erase.has(index) ? 'bg-red-950/50' : ''}`}
                      >
                        {ants.has(index) && <span className="paint-ants absolute inset-0" />}
                        {cell ?? (previewStatus === 'place' && selected
                          ? <span className="opacity-60" data-testid={`preview-${index}`}>{selected.emoji}</span>
                          : <span className="text-muted-foreground/30 text-sm">·</span>)}
                        {previewStatus === 'skip-cost' && !cell && (
                          <span className="text-[10px] font-bold text-red-300" data-testid={`preview-skip-${index}`}>×</span>
                        )}
                        {here.map(citizen => (
                          <span
                            key={citizen.id}
                            data-testid={`citizen-${citizen.id}`}
                            className="absolute bottom-0 right-0 text-[11px] leading-none"
                          >
                            {citizen.emoji}
                          </span>
                        ))}
                      </button>
                    );
                  })}
                </div>
              </div>
              <ExpandEdge edge="east" city={city} tokens={tokens} onExpand={onExpand} />
            </div>
            <div className="flex justify-center">
              <ExpandEdge edge="south" city={city} tokens={tokens} onExpand={onExpand} />
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
              setTool('place');
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

const EDGE_ICON = {
  north: ChevronUp,
  south: ChevronDown,
  east: ChevronRight,
  west: ChevronLeft,
} as const;

function ExpandEdge({
  edge,
  city,
  tokens,
  onExpand,
}: {
  edge: CityEdge;
  city: CityState;
  tokens: number;
  onExpand: (edge: CityEdge) => void;
}) {
  const blocked = expandBlockReason(city, edge, tokens);
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
            data-testid={`expand-${edge}`}
            aria-label={hint}
            onClick={() => onExpand(edge)}
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
