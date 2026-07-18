import { useState } from 'react';
import type { Listing } from '../types';
import { daysOnMarket, fmtBaths, fmtBeds, fmtPrice, priceTier, sourceMeta } from '../lib';

interface Props {
  listing: Listing;
  onFavorite(l: Listing): void;
  onHide(l: Listing): void;
  compact?: boolean;
}

export default function ListingCard({ listing: l, onFavorite, onHide, compact }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = sourceMeta(l.source);
  const tier = priceTier(l.price);
  const dom = daysOnMarket(l);

  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow transition hover:border-sky-500/50 hover:shadow-lg ${l.isHidden ? 'opacity-50' : ''}`}>
      {/* photo */}
      {!compact && (
        <a href={l.url} target="_blank" rel="noreferrer" className="relative block h-40 overflow-hidden bg-ink-800">
          {l.photos[0] && !imgFailed ? (
            <img src={l.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105"
                 onError={() => setImgFailed(true)} />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl opacity-30">🏠</div>
          )}
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {l.isNew && <span className="rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">NEW</span>}
            {l.isSample && <span className="rounded bg-yellow-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black shadow">SAMPLE</span>}
            {l.dupGroup && <span className="rounded bg-fuchsia-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow" title="Same address, beds, and a price within $50 as a listing on another source">POSSIBLE DUPE</span>}
            {!l.isActive && <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shadow">INACTIVE</span>}
          </div>
        </a>
      )}

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          {/* price = visual anchor */}
          <a href={l.url} target="_blank" rel="noreferrer" className="text-2xl font-extrabold tracking-tight" style={{ color: tier.color }}>
            {fmtPrice(l.price)}<span className="text-xs font-medium text-slate-500">/mo</span>
          </a>
          <span className={`mt-1 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.color}`}>{meta.label}</span>
        </div>

        <div className="text-sm font-medium text-slate-300">
          {fmtBeds(l.beds)}{l.baths != null && <> · {fmtBaths(l.baths)}</>}{l.sqft != null && <> · {l.sqft.toLocaleString()} ft²</>}
          {l.petFriendly && <span title="Pet friendly"> · 🐾</span>}
        </div>

        <a href={l.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-xs text-slate-400 hover:text-sky-300">
          {l.address ?? l.title}
        </a>

        <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-slate-500">
          <span>
            {l.city ?? l.zip ?? ''}{l.availableDate ? ` · avail ${l.availableDate}` : ''}
          </span>
          <span title={`First seen ${new Date(l.firstSeen).toLocaleString()}`}>
            {dom === 0 ? 'today' : `${dom}d on market`}
          </span>
        </div>
      </div>

      {/* actions */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100" style={compact ? { opacity: 1, position: 'static', justifyContent: 'flex-end', padding: '0 8px 8px' } : undefined}>
        <button
          onClick={() => onFavorite(l)}
          title={l.isFavorite ? 'Unfavorite' : 'Favorite'}
          className={`rounded-md px-1.5 py-1 text-sm shadow backdrop-blur ${l.isFavorite ? 'bg-yellow-500/90' : 'bg-black/50 hover:bg-black/70'}`}
        >⭐</button>
        <button
          onClick={() => onHide(l)}
          title={l.isHidden ? 'Unhide' : 'Hide'}
          className={`rounded-md px-1.5 py-1 text-sm shadow backdrop-blur ${l.isHidden ? 'bg-red-500/80' : 'bg-black/50 hover:bg-black/70'}`}
        >🚫</button>
      </div>
      {l.isFavorite && !compact && <div className="absolute -left-1 top-0 text-lg drop-shadow">⭐</div>}
    </div>
  );
}
