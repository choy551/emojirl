import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getEnemyKillCounts } from '../game/discoveries';
import {
  BUILDING_EXCHANGE_COST,
  BUILDINGS,
  buildingDistrictName,
  buildingOf,
} from '../game/cityBuildings';
import {
  CITY_EXPAND_COST,
  CITY_TICK_MS,
  availableTokens,
  awaySummary,
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
  placeAt,
  placedCount,
  placedOf,
  removeAt,
  supplyPalette,
  tickCitizens,
  totalAvailableTokens,
  type CityEdge,
  type CityState,
} from '../game/emojiCity';
import { loadMeta, replaceEmojiConsumes, saveCity, settleCityCatchUp } from '../game/meta';

export default function CityPage() {
  const [, setLocation] = useLocation();
  const [consumes, setConsumes] = useState<Record<string, number>>({});
  const [city, setCity] = useState<CityState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
    const palette = supplyPalette(counts, caught.city);
    const ownedBuilding = BUILDINGS.find(building => availableTokens(counts[building.emoji] ?? 0, placedOf(caught.city, building.emoji)) > 0);
    setSelected(palette.find(emoji => availableTokens(counts[emoji] ?? 0, placedOf(caught.city, emoji)) > 0) ?? ownedBuilding?.emoji ?? palette[0] ?? null);
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

  const palette = useMemo(
    () => (city ? supplyPalette(consumes, city) : []),
    [consumes, city],
  );
  const selectedBuilding = selected ? buildingOf(selected) : undefined;

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
      const result = removeAt(city, index, killsRef.current, Math.random);
      if (!result.ok) { setNote(result.reason ?? 'Cannot clear that lot.'); return; }
      setCity(result.city);
      saveCity(result.city);
      setNote(`Refunded ${built}.`);
      return;
    }
    if (!selected) { setNote('Pick an emoji first.'); return; }
    const result = placeAt(city, index, selected, consumes, killsRef.current, Math.random);
    if (!result.ok) { setNote(result.reason ?? 'Cannot place.'); return; }
    setCity(result.city);
    saveCity(result.city);
    setNote(`Placed ${selected}.`);
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

      <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="city-palette" aria-label="Supply palette">
        {palette.length === 0 && (
          <p className="text-xs text-muted-foreground">Consume emoji on a descent to earn tokens.</p>
        )}
        {palette.map(emoji => {
          const left = availableTokens(consumes[emoji] ?? 0, city ? placedOf(city, emoji) : 0);
          const on = selected === emoji;
          return (
            <button
              key={emoji}
              type="button"
              data-testid={`palette-${emoji}`}
              aria-pressed={on}
              onClick={() => { setSelected(emoji); setNote(`${emoji} selected. ${left} token${left === 1 ? '' : 's'} left.`); }}
              className={`shrink-0 min-h-11 min-w-11 rounded-lg border text-xl leading-none ${on ? 'border-primary bg-primary/15' : 'border-border bg-card'} ${left <= 0 ? 'opacity-50' : ''}`}
            >
              <span className="block">{emoji}</span>
              <span className="block text-[10px] font-bold tabular-nums">{left}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Structures</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="city-structures" aria-label="Structure palette">
          {BUILDINGS.map(building => {
            const left = availableTokens(consumes[building.emoji] ?? 0, city ? placedOf(city, building.emoji) : 0);
            const on = selected === building.emoji;
            return (
              <button
                key={building.emoji}
                type="button"
                data-testid={`structure-${building.emoji}`}
                aria-pressed={on}
                title={`${building.name} · ${buildingDistrictName(building)} · counts as ${building.housing}`}
                onClick={() => {
                  setSelected(building.emoji);
                  setNote(`${building.name}. ${left} token${left === 1 ? '' : 's'}. Counts as ${building.housing}. Raise costs ${BUILDING_EXCHANGE_COST} spare tokens.`);
                }}
                className={`shrink-0 min-h-11 min-w-11 rounded-lg border text-xl leading-none ${on ? 'border-primary bg-primary/15' : 'border-border bg-card'} ${left <= 0 ? 'opacity-60' : ''}`}
              >
                <span className="block">{building.emoji}</span>
                <span className="block text-[10px] font-bold tabular-nums">{left}</span>
              </button>
            );
          })}
        </div>
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
      </div>

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
