import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEnemyKillCounts } from '../game/discoveries';
import {
  CITY_COLS,
  CITY_TICK_MS,
  availableTokens,
  awaySummary,
  catchUpCity,
  citizenCapacity,
  dominantDistrict,
  emojiCityRulesBlurb,
  normalizeCity,
  paletteEmojis,
  placeAt,
  placedCount,
  placedOf,
  removeAt,
  tickCitizens,
  totalAvailableTokens,
  type CityState,
} from '../game/emojiCity';
import { loadMeta, saveCity, settleCityCatchUp } from '../game/meta';

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
    const palette = paletteEmojis(counts, caught.city);
    setSelected(palette.find(emoji => availableTokens(counts[emoji] ?? 0, placedOf(caught.city, emoji)) > 0) ?? palette[0] ?? null);
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
    () => (city ? paletteEmojis(consumes, city) : []),
    [consumes, city],
  );

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
  const cap = citizenCapacity(placed);
  const citizens = city?.citizens.length ?? 0;
  const tokens = city ? totalAvailableTokens(consumes, city) : 0;
  const district = city ? dominantDistrict(city) : null;

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

      <p data-testid="city-district" className="text-center text-xs font-semibold text-foreground">
        {district ? `${district.name} — ${district.className} ${district.bonus.label}` : 'No district yet — need 4 of one style'}
      </p>

      <p className="text-[11px] text-muted-foreground leading-snug min-h-8" data-testid="city-note">{note}</p>

      <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="city-palette" aria-label="Emoji palette">
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

      <div className="overflow-auto">
        <div
          data-testid="city-grid"
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${CITY_COLS}, minmax(2.75rem, 1fr))` }}
        >
          {city?.tiles.map((cell, index) => {
            const here = city.citizens.filter(c => c.y * CITY_COLS + c.x === index);
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

      <p className="text-[11px] text-muted-foreground leading-relaxed pb-4">{emojiCityRulesBlurb()}</p>
    </div>
  );
}
