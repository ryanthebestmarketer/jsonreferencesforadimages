import type { Listing } from './types';

export const fmtPrice = (p: number | null) =>
  p == null ? '—' : `$${p.toLocaleString()}`;

export const fmtBeds = (b: number | null) =>
  b == null ? '? bd' : b === 0 ? 'Studio' : `${b} bd`;

export const fmtBaths = (b: number | null) => (b == null ? '' : `${b} ba`);

export function daysOnMarket(l: Listing): number {
  return Math.max(0, Math.floor((Date.now() - new Date(l.firstSeen).getTime()) / 86400_000));
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Price tier → color, used for map pins and price accents. */
export function priceTier(price: number | null): { color: string; label: string } {
  if (price == null) return { color: '#64748b', label: 'unknown' };
  if (price < 1300) return { color: '#34d399', label: 'under $1,300' };
  if (price < 1800) return { color: '#fbbf24', label: '$1,300–1,800' };
  if (price < 2400) return { color: '#fb923c', label: '$1,800–2,400' };
  return { color: '#f87171', label: 'over $2,400' };
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  craigslist:     { label: 'Craigslist', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  appfolio:       { label: 'AppFolio', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  buildium:       { label: 'Buildium', color: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
  dwellsy:        { label: 'Dwellsy', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  ahrn:           { label: 'AHRN', color: 'bg-lime-500/20 text-lime-300 border-lime-500/40' },
  zillow:         { label: 'Zillow', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  apartments_com: { label: 'Apartments.com', color: 'bg-green-500/20 text-green-300 border-green-500/40' },
  zumper:         { label: 'Zumper', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  realtor:        { label: 'Realtor.com', color: 'bg-red-500/20 text-red-300 border-red-500/40' },
  hotpads:        { label: 'HotPads', color: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
  sample:         { label: 'SAMPLE', color: 'bg-yellow-500/25 text-yellow-300 border-yellow-500/50' },
};

export function sourceMeta(key: string) {
  return SOURCE_META[key] ?? { label: key, color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' };
}
