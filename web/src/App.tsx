import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { Filters, Listing, SortKey, StatusResponse, ViewMode } from './types';
import { defaultFilters, PRICE_CEIL } from './types';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import ListingCard from './components/ListingCard';
import MapView from './components/MapView';

export default function App() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('grid');
  const [error, setError] = useState<string | null>(null);
  const wasScrapingRef = useRef(false);

  const refreshListings = useCallback(async () => {
    try {
      const { listings } = await api.listings();
      setListings(listings);
      setError(null);
    } catch (e: any) {
      setError(`Could not load listings: ${e?.message ?? e}`);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      // when a scrape just finished, pull fresh listings
      if (wasScrapingRef.current && !s.scrape.running) refreshListings();
      wasScrapingRef.current = s.scrape.running;
    } catch { /* server restarting — keep last status */ }
  }, [refreshListings]);

  useEffect(() => {
    refreshListings();
    refreshStatus();
  }, [refreshListings, refreshStatus]);

  // poll status: every 2s while scraping, every 15s otherwise
  useEffect(() => {
    const interval = status?.scrape.running ? 2000 : 15000;
    const t = setInterval(refreshStatus, interval);
    return () => clearInterval(t);
  }, [status?.scrape.running, refreshStatus]);

  const onScrape = useCallback(async (source?: string) => {
    await api.scrape(source).catch(() => {});
    wasScrapingRef.current = true;
    refreshStatus();
  }, [refreshStatus]);

  const onFavorite = useCallback(async (l: Listing) => {
    setListings((ls) => ls.map((x) => (x.id === l.id ? { ...x, isFavorite: !l.isFavorite } : x)));
    await api.favorite(l.id, !l.isFavorite).catch(() => refreshListings());
  }, [refreshListings]);

  const onHide = useCallback(async (l: Listing) => {
    setListings((ls) => ls.map((x) => (x.id === l.id ? { ...x, isHidden: !l.isHidden } : x)));
    await api.hide(l.id, !l.isHidden).catch(() => refreshListings());
  }, [refreshListings]);

  const hiddenCount = useMemo(() => listings.filter((l) => l.isHidden).length, [listings]);

  const filtered = useMemo(() => {
    const f = filters;
    const q = f.search.trim().toLowerCase();

    // when hiding dupes, keep the cheapest listing of each dup group
    const dupKeep = new Set<number>();
    if (f.hideDuplicates) {
      const best = new Map<string, Listing>();
      for (const l of listings) {
        if (!l.dupGroup) continue;
        const cur = best.get(l.dupGroup);
        if (!cur || (l.price ?? Infinity) < (cur.price ?? Infinity)) best.set(l.dupGroup, l);
      }
      for (const l of best.values()) dupKeep.add(l.id);
    }

    const out = listings.filter((l) => {
      if (f.showHidden ? !l.isHidden : l.isHidden) return false;
      if (f.activeOnly && !l.isActive) return false;
      if (f.favoritesOnly && !l.isFavorite) return false;
      if (f.newOnly && !l.isNew) return false;
      if (l.price != null && (l.price < f.priceMin || (f.priceMax < PRICE_CEIL && l.price > f.priceMax))) return false;
      if (f.beds !== 'any') {
        if (l.beds == null) return false;
        if (f.beds === 3 ? l.beds < 3 : l.beds !== f.beds) return false;
      }
      if (f.bathsMin !== 'any' && (l.baths == null || l.baths < f.bathsMin)) return false;
      if (f.cities.length && !f.cities.includes(l.city ?? '')) return false;
      if (f.petFriendly && l.petFriendly !== true) return false;
      if (f.sources.length && !f.sources.includes(l.source)) return false;
      if (f.hideDuplicates && l.dupGroup && !dupKeep.has(l.id)) return false;
      if (q && !`${l.title} ${l.address ?? ''} ${l.city ?? ''} ${l.zip ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });

    out.sort((a, b) => {
      switch (sort) {
        case 'price_asc': return (a.price ?? Infinity) - (b.price ?? Infinity);
        case 'price_desc': return (b.price ?? -1) - (a.price ?? -1);
        case 'sqft': return (b.sqft ?? -1) - (a.sqft ?? -1);
        case 'newest':
        default: return b.firstSeen.localeCompare(a.firstSeen);
      }
    });
    return out;
  }, [listings, filters, sort]);

  const sourceKeys = useMemo(() => {
    const fromStatus = status?.sources.map((s) => s.key) ?? [];
    const fromListings = [...new Set(listings.map((l) => l.source))];
    return [...new Set([...fromStatus, ...fromListings])];
  }, [status, listings]);

  return (
    <div className="dark mx-auto min-h-full max-w-[1600px] space-y-3 p-4">
      <Header status={status} view={view} onView={setView} onScrape={onScrape} />
      <FilterBar filters={filters} onChange={setFilters} sort={sort} onSort={setSort}
        sourceKeys={sourceKeys} hiddenCount={hiddenCount} />

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{filtered.length} of {listings.length} listings</span>
        {status?.scrape.running && (
          <span className="text-sky-400">
            {status.scrape.geocoding ? 'Geocoding new addresses…' : 'Scrape in progress — sources update live above'}
          </span>
        )}
      </div>

      {view === 'grid' ? (
        filtered.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((l) => (
              <ListingCard key={l.id} listing={l} onFavorite={onFavorite} onHide={onHide} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-ink-700 p-16 text-center text-slate-500">
            {listings.length === 0
              ? 'No listings yet — hit "Run scrape now" (the first scrape also starts automatically a few seconds after boot).'
              : 'Nothing matches these filters.'}
          </div>
        )
      ) : (
        <MapView listings={filtered} onFavorite={onFavorite} onHide={onHide} />
      )}

      <footer className="pb-4 pt-2 text-center text-[11px] text-slate-600">
        Personal-use apartment aggregator · data belongs to the original sources · listings link out to the source site
      </footer>
    </div>
  );
}
