import type { Filters, SortKey } from '../types';
import { PRICE_CEIL } from '../types';
import { sourceMeta } from '../lib';
import DualSlider from './DualSlider';

interface Props {
  filters: Filters;
  onChange(f: Filters): void;
  sort: SortKey;
  onSort(s: SortKey): void;
  sourceKeys: string[];
  hiddenCount: number;
}

const CITIES = ['Virginia Beach', 'Norfolk', 'Ocean View'];

function Toggle({ on, label, title, onClick, activeClass = 'bg-sky-500/25 border-sky-400/60 text-sky-200' }: {
  on: boolean; label: string; title?: string; onClick(): void; activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? activeClass : 'border-ink-700 bg-ink-850 text-slate-400 hover:border-slate-500'}`}
    >{label}</button>
  );
}

export default function FilterBar({ filters: f, onChange, sort, onSort, sourceKeys, hiddenCount }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });
  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-ink-700 bg-ink-900/80 p-3 text-sm backdrop-blur">
      {/* price */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price</span>
        <DualSlider min={0} max={PRICE_CEIL} step={50} lo={f.priceMin} hi={f.priceMax}
          onChange={(lo, hi) => set({ priceMin: lo, priceMax: hi })} />
        <span className="w-28 text-xs tabular-nums text-slate-300">
          ${f.priceMin.toLocaleString()}–{f.priceMax >= PRICE_CEIL ? `$${PRICE_CEIL.toLocaleString()}+` : `$${f.priceMax.toLocaleString()}`}
        </span>
      </div>

      {/* beds */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Beds</span>
        {([['any', 'Any'], [0, 'Studio'], [1, '1'], [2, '2'], [3, '3+']] as const).map(([v, label]) => (
          <Toggle key={String(v)} on={f.beds === v} label={label} onClick={() => set({ beds: v })} />
        ))}
      </div>

      {/* baths */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Baths</span>
        {([['any', 'Any'], [1, '1+'], [1.5, '1.5+'], [2, '2+']] as const).map(([v, label]) => (
          <Toggle key={String(v)} on={f.bathsMin === v} label={label} onClick={() => set({ bathsMin: v })} />
        ))}
      </div>

      {/* cities */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Area</span>
        {CITIES.map((c) => (
          <Toggle key={c} on={f.cities.includes(c)} label={c.replace('Virginia Beach', 'Va Beach')}
            onClick={() => set({ cities: toggleIn(f.cities, c) })} />
        ))}
      </div>

      {/* text search */}
      <input
        value={f.search}
        onChange={(e) => set({ search: e.target.value })}
        placeholder="Search address / title…"
        className="w-48 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
      />

      {/* sort */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort</span>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
        >
          <option value="newest">Newest first</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
          <option value="sqft">Sqft ↓</option>
        </select>
      </div>

      {/* toggles */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Toggle on={f.petFriendly} label="🐾 Pets" title="Pet friendly only" onClick={() => set({ petFriendly: !f.petFriendly })} />
        <Toggle on={f.newOnly} label="✨ New" title="New since last scrape" onClick={() => set({ newOnly: !f.newOnly })} />
        <Toggle on={f.activeOnly} label="Active only" onClick={() => set({ activeOnly: !f.activeOnly })} />
        <Toggle on={f.hideDuplicates} label="Hide dupes" title="Hide possible cross-source duplicates (keeps the cheapest of each group)" onClick={() => set({ hideDuplicates: !f.hideDuplicates })} />
        <Toggle on={f.favoritesOnly} label="⭐ Favs" onClick={() => set({ favoritesOnly: !f.favoritesOnly })} activeClass="bg-yellow-500/25 border-yellow-400/60 text-yellow-200" />
        <Toggle on={f.showHidden} label={`🚫 Hidden (${hiddenCount})`} title="Review hidden listings" onClick={() => set({ showHidden: !f.showHidden })} activeClass="bg-red-500/25 border-red-400/60 text-red-200" />
      </div>

      {/* sources */}
      <div className="flex w-full flex-wrap items-center gap-1 border-t border-ink-800 pt-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sources</span>
        {sourceKeys.map((k) => (
          <Toggle key={k} on={f.sources.includes(k)} label={sourceMeta(k).label}
            title={f.sources.length ? undefined : 'Click to filter to specific sources'}
            onClick={() => set({ sources: toggleIn(f.sources, k) })} />
        ))}
        {f.sources.length > 0 && (
          <button onClick={() => set({ sources: [] })} className="ml-1 text-xs text-slate-500 underline hover:text-slate-300">clear</button>
        )}
      </div>
    </div>
  );
}
