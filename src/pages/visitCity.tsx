import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSharedCity, type SharedCityView } from '../game/cityShareClient';
import { ONLINE_UNAVAILABLE } from '../game/cityShareModel';
import { allHoods, worldBounds } from '../game/neighborhoods';

const TILE_MAX = '2.75rem';
const TILE_MIN = '2rem';

export default function VisitCityPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const [city, setCity] = useState<SharedCityView | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCity(null);
    setMessage(null);
    if (!id) return;
    getSharedCity(id).then(result => {
      if (cancel) return;
      if (!result.online) {
        setMessage(ONLINE_UNAVAILABLE);
        return;
      }
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setCity(result.city);
    });
    return () => { cancel = true; };
  }, [id]);

  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3 py-3">
        <div className="flex items-center gap-2">
          <Link href="/ledger">
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Back to the ledger">
              <ChevronLeft className="w-6 h-6" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black tracking-tight text-primary" data-testid="visit-city-name">
              {city ? city.cityName : 'Shared city'}
            </h1>
            <p className="text-[11px] text-muted-foreground" data-testid="visit-player">
              {city ? city.username : 'Read only'}
            </p>
          </div>
        </div>

        {message && (
          <p data-testid="visit-message" className="rounded-lg border border-border bg-card px-3 py-3 text-sm font-semibold">
            {message}
          </p>
        )}

        {city && (
          <p className="text-xs text-muted-foreground" data-testid="visit-counts">
            {city.structures} structures · {city.citizens} citizens
          </p>
        )}
      </div>

      {city && (
        <div className="w-full px-1 pb-3 sm:px-3" data-testid="visit-map">
          <div className="min-w-0 overflow-x-auto" data-testid="visit-grid-scroll">
            <VisitWorld grid={city.grid} />
          </div>
        </div>
      )}

      {city && (
        <div className="mx-auto w-full max-w-lg px-3 pb-4">
          <p className="text-[11px] text-muted-foreground">This city is read only.</p>
        </div>
      )}
    </div>
  );
}

function VisitWorld({ grid }: { grid: SharedCityView['grid'] }) {
  const bounds = worldBounds(grid);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const step = `(${TILE_MAX} + 0.125rem)`;
  return (
    <div
      data-testid="visit-grid"
      className="relative mx-auto w-fit min-w-min max-w-full"
      style={{
        width: `calc(${spanX} * ${step} - 0.125rem)`,
        height: `calc(${spanY} * ${step} - 0.125rem)`,
      }}
    >
      {allHoods(grid).map(hood => (
        <div
          key={hood.id}
          data-testid={`visit-neighborhood-${hood.id}`}
          className="absolute grid w-fit gap-0.5"
          style={{
            left: `calc(${hood.ox - bounds.minX} * ${step})`,
            top: `calc(${hood.oy - bounds.minY} * ${step})`,
            gridTemplateColumns: `repeat(${hood.cols}, minmax(${TILE_MIN}, ${TILE_MAX}))`,
          }}
        >
          {hood.tiles.map((cell, index) => {
            const lx = index % hood.cols;
            const ly = Math.floor(index / hood.cols);
            const here = grid.citizens.filter(citizen => citizen.x === hood.ox + lx && citizen.y === hood.oy + ly);
            return (
              <div
                key={`${hood.id}-${index}`}
                data-testid={hood.id === 'origin' ? `visit-lot-${index}` : `visit-lot-${hood.id}-${index}`}
                aria-label={cell ? cell : `Empty lot ${index + 1}`}
                className="relative aspect-square min-h-0 min-w-0 rounded-md border border-border/70 bg-emerald-950/30 text-xl leading-none"
              >
                {cell ?? <span className="text-sm text-muted-foreground/30">·</span>}
                {here.map(citizen => (
                  <span key={citizen.id} className="absolute bottom-0 right-0 text-[11px] leading-none">{citizen.emoji}</span>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
