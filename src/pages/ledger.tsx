import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listSharedCities, type LedgerRow } from '../game/cityShareClient';
import { mergeLedgerPages, ONLINE_UNAVAILABLE, type SortDir, type SortKey } from '../game/cityShareModel';
import { TRAIN_LINE_HINT, normalizeCity, trainLineSpansCity } from '../game/emojiCity';
import { loadMeta } from '../game/meta';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'player', label: 'Player' },
  { key: 'city', label: 'City' },
  { key: 'structures', label: 'Structures' },
  { key: 'citizens', label: 'Citizens' },
  { key: 'updated', label: 'Updated' },
];

export default function LedgerPage() {
  const [, setLocation] = useLocation();
  const unlocked = trainLineSpansCity(normalizeCity(loadMeta().city));
  const [sort, setSort] = useState<SortKey>('updated');
  const [dir, setDir] = useState<SortDir>('desc');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (nextCursor: string | null, replace: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const page = await listSharedCities({ sort, dir, cursor: nextCursor, limit: 20 });
    loadingRef.current = false;
    setLoading(false);
    if (!page.online) {
      setOffline(true);
      setError(ONLINE_UNAVAILABLE);
      return;
    }
    if (!page.ok) {
      setError(page.error);
      return;
    }
    setOffline(false);
    setError(null);
    setRows(prev => replace ? page.cities : mergeLedgerPages(prev, page.cities));
    setCursor(page.nextCursor);
  }, [sort, dir]);

  useEffect(() => {
    if (!unlocked) return;
    let cancel = false;
    loadingRef.current = false;
    setRows([]);
    setCursor(null);
    setLoading(true);
    listSharedCities({ sort, dir, limit: 20 }).then(page => {
      if (cancel) return;
      setLoading(false);
      if (!page.online) {
        setOffline(true);
        setError(ONLINE_UNAVAILABLE);
        return;
      }
      if (!page.ok) {
        setError(page.error);
        return;
      }
      setOffline(false);
      setError(null);
      setRows(page.cities);
      setCursor(page.nextCursor);
    });
    return () => { cancel = true; };
  }, [sort, dir, unlocked]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor || offline) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadPage(cursor, false);
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, offline, loadPage]);

  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-3">
        <div className="flex items-center gap-2">
          <Link href="/city">
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Back to your city">
              <ChevronLeft className="w-6 h-6" />
            </Button>
          </Link>
          <h1 className="text-xl font-black tracking-tight text-primary">Visit Cities</h1>
        </div>

        {!unlocked && (
          <p data-testid="ledger-locked" className="rounded-lg border border-border bg-card px-3 py-3 text-sm">
            Visit Cities is locked. {TRAIN_LINE_HINT}
          </p>
        )}

        {unlocked && offline && (
          <p data-testid="ledger-unavailable" className="rounded-lg border border-border bg-card px-3 py-3 text-sm font-semibold">
            {ONLINE_UNAVAILABLE}
          </p>
        )}

        {unlocked && error && !offline && (
          <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>
        )}

        {unlocked && !offline && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table data-testid="city-ledger" className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead className="bg-card text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {COLUMNS.map(column => (
                      <th key={column.key} scope="col" className="whitespace-nowrap px-3 py-2 align-middle font-semibold">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span>{column.label}</span>
                          <button
                            type="button"
                            className="inline-flex min-h-11 min-w-8 items-center justify-center px-1"
                            aria-label={`Sort ${column.label} ascending`}
                            aria-pressed={sort === column.key && dir === 'asc'}
                            data-testid={`sort-${column.key}-asc`}
                            onClick={() => { setSort(column.key); setDir('asc'); }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="inline-flex min-h-11 min-w-8 items-center justify-center px-1"
                            aria-label={`Sort ${column.label} descending`}
                            aria-pressed={sort === column.key && dir === 'desc'}
                            data-testid={`sort-${column.key}-desc`}
                            onClick={() => { setSort(column.key); setDir('desc'); }}
                          >
                            ↓
                          </button>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr
                      key={row.id}
                      data-testid={`ledger-row-${row.id}`}
                      tabIndex={0}
                      className="cursor-pointer border-t border-border hover:bg-primary/10"
                      onClick={() => setLocation(`/visit/${row.id}`)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setLocation(`/visit/${row.id}`);
                        }
                      }}
                    >
                      <td className="px-3 py-3 font-medium">{row.username}</td>
                      <td className="px-3 py-3">{row.cityName}</td>
                      <td className="px-3 py-3 tabular-nums">{row.structures}</td>
                      <td className="px-3 py-3 tabular-nums">{row.citizens}</td>
                      <td className="px-3 py-3 text-muted-foreground">{new Date(row.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && !loading && !error && (
              <p data-testid="ledger-empty" className="text-sm text-muted-foreground">No cities have been shared yet.</p>
            )}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              data-testid="ledger-more"
              disabled={!cursor || loading}
              onClick={() => void loadPage(cursor, false)}
            >
              {loading ? 'Loading…' : 'Load more'}
            </Button>
            <div ref={sentinelRef} data-testid="ledger-sentinel" className="h-1" />
          </>
        )}
      </div>
    </div>
  );
}
