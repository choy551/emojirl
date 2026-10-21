import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  placeAt,
  placeDecor,
  placedCount,
  placedOf,
  removeAt,
  tickCitizens,
  totalAvailableTokens,
  type CityEdge,
  type CityState,
  type PaletteEntry,
  type PaletteSection,
} from '../game/emojiCity';

type PalettePick = { kind: 'token' | 'decor'; emoji: string };
import { loadMeta, replaceEmojiConsumes, saveCity, settleCityCatchUp } from '../game/meta';

export default function CityPage() {
  const [, setLocation] = useLocation();
  const [consumes, setConsumes] = useState<Record<string, number>>({});
  const [city, setCity] = useState<CityState | null>(null);
  const [selected, setSelected] = useState<PalettePick | null>(null);
  const [note, setNote] = useState('Pick an emoji, then tap an empty lot.');
  const [away, setAway] = useState<string | null>(null);
  const killsRef = useRef<Record<string, number>>({});

  useEffect(() => {
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

  const placed = city ? placedCount(city) : 0;
  const cap = city ? citizenCapacityOf(city) : 0;
  const citizens = city?.citizens.length ?? 0;
  const tokens = city ? totalAvailableTokens(consumes, city) : 0;
  const standings = city ? districtStandings(city) : [];

  return (
    <div className="min-h-screen w-full max-w-lg mx-auto flex flex-col px-3 py-3 gap-3">
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Back to home" data-testid="city-back">
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight text-primary">🏙️ EmojiCB</h1>
          <p className="text-[11px] text-muted-foreground leading-snug">Emoji City Builder</p>
        </div>
      </div>

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

      {city && (
        <div className="flex w-full flex-col gap-1" data-testid="city-expand">
          <div className="flex justify-center">
            <ExpandEdge edge="north" city={city} tokens={tokens} onExpand={onExpand} />
          </div>
          <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
            <ExpandEdge edge="west" city={city} tokens={tokens} onExpand={onExpand} />
            <div className="min-w-0 overflow-x-auto">
        <div
          data-testid="city-grid"
          className="grid w-max gap-1"
          style={{ gridTemplateColumns: `repeat(${city.cols}, minmax(2.75rem, 1fr))` }}
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
                className="relative min-h-11 aspect-square rounded-md border border-border/70 bg-emerald-950/30 text-xl leading-none"
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

      <p className="text-[11px] text-muted-foreground leading-relaxed pb-4">{emojiCityRulesBlurb()}</p>
    </div>
  );
}

function sectionStartsOpen(section: PaletteSection): boolean {
  return section.entries.some(entry => entry.kind === 'token' && !entry.locked);
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
  const [forced, setForced] = useState<Record<string, boolean>>({});
  const decor = sections.filter(section => section.entries[0]?.kind === 'decor');
  const build = sections.filter(section => section.entries[0]?.kind !== 'decor');
  const fold = (section: PaletteSection) => (
    <PaletteFold
      key={section.id}
      section={section}
      open={section.id in forced ? forced[section.id]! : sectionStartsOpen(section)}
      onToggle={next => setForced(prev => ({ ...prev, [section.id]: next }))}
      selected={selected}
      onSelect={onSelect}
    />
  );
  return (
    <div className="space-y-1.5" data-testid="city-palette" aria-label="Build palette">
      {build.map(fold)}
      <div className="space-y-1.5" data-testid="city-decor" aria-label="Decor palette">
        {decor.map(fold)}
      </div>
    </div>
  );
}

function PaletteFold({
  section,
  open,
  onToggle,
  selected,
  onSelect,
}: {
  section: PaletteSection;
  open: boolean;
  onToggle: (open: boolean) => void;
  selected: PalettePick | null;
  onSelect: (entry: PaletteEntry) => void;
}) {
  const ready = section.entries.filter(entry => !entry.locked).length;
  const tally = section.entries.some(entry => entry.kind === 'token')
    ? `${ready}/${section.entries.length}`
    : `${section.entries.length}`;
  return (
    <section className="rounded-lg border border-border bg-card/40" data-testid={`palette-section-${section.id}`}>
      <button
        type="button"
        className="flex w-full min-h-11 items-center gap-2 px-2 text-left"
        aria-expanded={open}
        aria-controls={`palette-panel-${section.id}`}
        data-testid={`palette-toggle-${section.id}`}
        onClick={() => onToggle(!open)}
      >
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
        {section.badge && <span className="shrink-0 text-lg leading-none" aria-hidden="true">{section.badge}</span>}
        <span className="min-w-0 truncate text-xs font-semibold">{section.label}</span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{tally}</span>
      </button>
      {open && (
        <div id={`palette-panel-${section.id}`} className="flex flex-wrap gap-1.5 px-2 pb-2">
          {section.entries.map(entry => (
            <PaletteChoice key={`${entry.kind}-${entry.emoji}`} entry={entry} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}

function PaletteChoice({
  entry,
  selected,
  onSelect,
}: {
  entry: PaletteEntry;
  selected: PalettePick | null;
  onSelect: (entry: PaletteEntry) => void;
}) {
  const on = selected?.kind === entry.kind && selected.emoji === entry.emoji;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span title={entry.hint} className="inline-flex">
          <button
            type="button"
            data-testid={entry.kind === 'decor' ? `decor-${entry.emoji}` : `palette-${entry.emoji}`}
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
            className="min-h-11 min-w-11 px-2"
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
