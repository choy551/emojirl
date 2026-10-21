import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CITY_NAME_MAX } from '../game/cityIdentity';
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
  isDecorLot,
  normalizeCity,
  paletteMenuRows,
  placeAt,
  placeDecor,
  placedCount,
  placedOf,
  removeAt,
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
import { ensureCityProfile, loadMeta, replaceEmojiConsumes, saveCity, saveCityName, settleCityCatchUp } from '../game/meta';

export default function CityPage() {
  const [, setLocation] = useLocation();
  const [consumes, setConsumes] = useState<Record<string, number>>({});
  const [city, setCity] = useState<CityState | null>(null);
  const [selected, setSelected] = useState<PalettePick | null>(null);
  const [note, setNote] = useState('Pick an emoji, then tap an empty lot.');
  const [away, setAway] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [visitor, setVisitor] = useState('');
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

  const onLot = (index: number) => {
    if (!city) return;
    const built = city.tiles[index];
    if (built) {
      const decor = isDecorLot(city, index);
      const result = removeAt(city, index, killsRef.current, Math.random);
      if (!result.ok) { setNote(result.reason ?? 'Cannot clear that lot.'); return; }
      setCity(result.city);
      saveCity(result.city);
      setNote(decor ? `Cleared ${built}.` : `Refunded ${built}.`);
      return;
    }
    if (!selected) { setNote('Pick an emoji first.'); return; }
    if (selected.kind === 'decor') {
      const result = placeDecor(city, index, selected.emoji);
      if (!result.ok) { setNote(result.reason ?? 'Cannot place decor.'); return; }
      setCity(result.city);
      saveCity(result.city);
      setNote(`Placed ${selected.emoji}. Decor is free.`);
      return;
    }
    const result = placeAt(city, index, selected.emoji, consumes, killsRef.current, Math.random);
    if (!result.ok) { setNote(result.reason ?? 'Cannot place.'); return; }
    setCity(result.city);
    saveCity(result.city);
    setNote(`Placed ${selected.emoji}.`);
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

  const placed = city ? placedCount(city) : 0;
  const cap = city ? citizenCapacityOf(city) : 0;
  const citizens = city?.citizens.length ?? 0;
  const tokens = city ? totalAvailableTokens(consumes, city) : 0;
  const standings = city ? districtStandings(city) : [];

  return (
    <div className="min-h-screen w-full">
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3 py-3">
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11 flex-1 text-xs"
            disabled
            aria-disabled="true"
            title="Coming soon. This build stays on this device."
            data-testid="visit-cities"
          >
            Visit Cities (coming soon)
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 text-xs"
            disabled
            aria-disabled="true"
            title="Coming soon. This build stays on this device."
            data-testid="share-city"
          >
            Share
          </Button>
        </div>
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

      {selectedBuilding && (
        <Button
          type="button"
          variant="outline"
          className="w-full min-h-11"
          data-testid="raise-structure"
          onClick={raiseStructure}
        >
          Raise {selectedBuilding.emoji} · {BUILDING_EXCHANGE_COST} tokens
        </Button>
      )}
      <BuildPalette
        sections={sections}
        selected={selected}
        onSelect={entry => {
          const structure = entry.kind === 'token' && Boolean(buildingOf(entry.emoji));
          if (entry.locked && !structure) {
            setNote(entry.hint);
            return;
          }
          setSelected({ kind: entry.kind, emoji: entry.emoji });
          setNote(entry.kind === 'decor' ? `${entry.emoji} decor. Free, and it does not count.` : entry.hint);
        }}
      />
    </div>

      {city && (
        <div className="flex w-full flex-col gap-1 px-1 sm:px-3" data-testid="city-expand">
          <div className="flex justify-center">
            <ExpandEdge edge="north" city={city} tokens={tokens} onExpand={onExpand} />
          </div>
          <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
            <ExpandEdge edge="west" city={city} tokens={tokens} onExpand={onExpand} />
            <div className="min-w-0 overflow-x-auto" data-testid="city-grid-scroll">
        <div
          data-testid="city-grid"
          className="mx-auto grid w-fit min-w-min max-w-full gap-0.5"
          style={{ gridTemplateColumns: `repeat(${city.cols}, minmax(${CITY_TILE_MIN}, ${CITY_TILE_MAX}))` }}
        >
          {city.tiles.map((cell, index) => {
            const here = city.citizens.filter(c => c.y * city.cols + c.x === index);
            return (
              <button
                key={index}
                type="button"
                data-testid={`lot-${index}`}
                onClick={() => onLot(index)}
                aria-label={cell ? `Remove ${cell}` : `Empty lot ${index + 1}`}
                className="relative aspect-square w-full min-h-0 min-w-0 rounded-md border border-border/70 bg-emerald-950/30 text-xl leading-none"
              >
                {cell ?? <span className="text-muted-foreground/30 text-sm">·</span>}
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

      <div className="mx-auto w-full max-w-lg px-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed pb-4">{emojiCityRulesBlurb()}</p>
      </div>
    </div>
  );
}

/** District bands. Each section inside a band is still its own full-width row. */
const PALETTE_MENU_ROWS = 5;

function flyoutStyle(anchor: DOMRect): { layout: 'side' | 'sheet'; style: CSSProperties } {
  const gap = 8;
  const want = 384;
  const spaceRight = window.innerWidth - anchor.right - gap;
  const spaceLeft = anchor.left - gap;
  const narrow = window.innerWidth < 640 || (spaceRight < 240 && spaceLeft < 240);
  if (narrow) {
    const top = Math.min(anchor.bottom + gap, Math.max(8, window.innerHeight - 220));
    return {
      layout: 'sheet',
      style: {
        position: 'fixed',
        left: 8,
        right: 8,
        top,
        maxHeight: Math.max(160, window.innerHeight - top - 8),
        zIndex: 50,
      },
    };
  }
  const placeRight = spaceRight >= spaceLeft;
  const width = Math.min(want, placeRight ? spaceRight : spaceLeft);
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 220));
  return {
    layout: 'side',
    style: {
      position: 'fixed',
      top,
      width,
      maxHeight: Math.max(200, window.innerHeight - top - 8),
      zIndex: 50,
      left: placeRight ? anchor.right + gap : Math.max(8, anchor.left - gap - width),
    },
  };
}

function BuildPalette({
  sections,
  selected,
  onSelect,
}: {
  sections: PaletteSection[];
  selected: PalettePick | null;
  onSelect: (entry: PaletteEntry) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef('');
  const closeTimer = useRef<number | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [flyout, setFlyout] = useState<{ layout: 'side' | 'sheet'; style: CSSProperties } | null>(null);
  const rows = paletteMenuRows(sections);
  const openId = pinned ?? hovered;
  const openSection = sections.find(section => section.id === openId) ?? null;

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
    closeTimer.current = window.setTimeout(() => setHovered(null), 140);
  };

  useEffect(() => () => clearClose(), []);

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
      const box = menuRef.current?.getBoundingClientRect();
      if (!box) return;
      setFlyout(flyoutStyle(box));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [openSection]);

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
              onSelect={onSelect}
              onPointerDown={event => { pointerRef.current = event.pointerType; }}
              onDotsEnter={event => { if (event.pointerType === 'mouse') holdOpen(section.id); }}
              onDotsLeave={event => { if (event.pointerType === 'mouse') scheduleClose(); }}
              onDotsClick={event => togglePinned(section.id, event)}
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
      {openSection && flyout && (
        <div
          role="dialog"
          aria-label={openSection.label}
          data-testid="palette-flyout"
          data-section={openSection.id}
          data-layout={flyout.layout}
          style={flyout.style}
          onPointerEnter={event => { if (event.pointerType === 'mouse' && openId) holdOpen(openId); }}
          onPointerLeave={event => { if (event.pointerType === 'mouse') scheduleClose(); }}
          className="overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-lg"
        >
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
      )}
    </div>
  );
}

function PaletteStrip({
  section,
  selected,
  open,
  onSelect,
  onPointerDown,
  onDotsEnter,
  onDotsLeave,
  onDotsClick,
}: {
  section: PaletteSection;
  selected: PalettePick | null;
  open: boolean;
  onSelect: (entry: PaletteEntry) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDotsEnter: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDotsLeave: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDotsClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <section
      data-testid={`palette-section-${section.id}`}
      aria-label={section.label}
      className="relative flex w-full min-w-0 items-start gap-1"
    >
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
        className="absolute bottom-0 right-0 z-10 flex h-8 w-8 items-end justify-end text-lg font-black leading-none text-purple-400"
      >
        …
      </button>
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
