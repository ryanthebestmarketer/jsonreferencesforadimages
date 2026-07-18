import { useState } from 'react';
import type { StatusResponse, ViewMode } from '../types';
import { sourceMeta, timeAgo } from '../lib';

interface Props {
  status: StatusResponse | null;
  view: ViewMode;
  onView(v: ViewMode): void;
  onScrape(source?: string): void;
}

function runDot(status: string | undefined, running: boolean): string {
  if (running) return 'bg-sky-400 animate-pulse';
  switch (status) {
    case 'ok': return 'bg-emerald-400';
    case 'empty': return 'bg-slate-500';
    case 'blocked': case 'error': case 'login_required': return 'bg-red-500';
    default: return 'bg-slate-600';
  }
}

export default function Header({ status, view, onView, onScrape }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const scraping = status?.scrape.running ?? false;

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-extrabold tracking-tight">
          🏠 Hampton Roads <span className="text-sky-400">Rentals</span>
        </h1>

        {status && (
          <div className="flex items-baseline gap-4 text-sm">
            <span><b className="text-lg text-slate-100">{status.totals.active}</b> <span className="text-slate-400">active</span></span>
            <span><b className="text-lg text-sky-400">{status.totals.newSinceLastScrape}</b> <span className="text-slate-400">new</span></span>
            <span><b className="text-lg text-yellow-400">{status.totals.favorites}</b> <span className="text-slate-400">⭐</span></span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* view toggle */}
          <div className="flex overflow-hidden rounded-lg border border-ink-700">
            {(['grid', 'map'] as const).map((v) => (
              <button key={v} onClick={() => onView(v)}
                className={`px-3 py-1.5 text-xs font-semibold ${view === v ? 'bg-sky-500/25 text-sky-200' : 'bg-ink-850 text-slate-400 hover:text-slate-200'}`}>
                {v === 'grid' ? '▦ Cards' : '🗺 Map'}
              </button>
            ))}
          </div>

          {/* scrape controls */}
          <div className="relative">
            <div className="flex overflow-hidden rounded-lg">
              <button
                onClick={() => onScrape()}
                disabled={scraping}
                className={`px-3 py-1.5 text-xs font-bold ${scraping ? 'cursor-wait bg-ink-700 text-slate-400' : 'bg-sky-500 text-white hover:bg-sky-400'}`}
              >
                {scraping ? (status?.scrape.geocoding ? '📍 Geocoding…' : '⟳ Scraping…') : '⟳ Run scrape now'}
              </button>
              <button
                onClick={() => setPickerOpen((o) => !o)}
                disabled={scraping}
                title="Run a single source"
                className={`border-l border-black/30 px-2 py-1.5 text-xs font-bold ${scraping ? 'cursor-wait bg-ink-700 text-slate-400' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
              >▾</button>
            </div>
            {pickerOpen && !scraping && status && (
              <div className="absolute right-0 z-[1100] mt-1 w-48 overflow-hidden rounded-lg border border-ink-700 bg-ink-900 py-1 shadow-xl">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Run one source</div>
                {status.sources.map((s) => (
                  <button key={s.key}
                    onClick={() => { setPickerOpen(false); onScrape(s.key); }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-ink-800 hover:text-white">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* per-source status row */}
      {status && (
        <div className="flex flex-wrap gap-1.5">
          {status.sources.map((s) => {
            const live = status.scrape.sources[s.key];
            const isRunning = status.scrape.running && live?.status === 'running';
            const lastStatus = isRunning ? 'running' : (live && status.scrape.running ? live.status : s.lastRun?.status);
            const bad = ['blocked', 'error', 'login_required'].includes(lastStatus ?? '');
            const title = [
              s.lastRun ? `Last run: ${timeAgo(s.lastRun.finishedAt)} — ${s.lastRun.status} (${s.lastRun.count} found)` : 'Never scraped',
              s.lastRun?.errors ? `Errors: ${s.lastRun.errors}` : '',
            ].filter(Boolean).join('\n');
            return (
              <div key={s.key} title={title}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${bad ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-ink-700 bg-ink-850 text-slate-400'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${runDot(lastStatus, !!isRunning)}`} />
                <span className="font-semibold text-slate-300">{sourceMeta(s.key).label}</span>
                <span className="tabular-nums">{isRunning ? '…' : s.activeListings}</span>
                <span className="text-slate-600">{s.lastRun ? timeAgo(s.lastRun.finishedAt) : '—'}</span>
                {bad && <span className="font-bold uppercase">{lastStatus === 'login_required' ? 'login' : lastStatus}</span>}
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}
