import express from 'express';
import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import { db, allListings, latestRuns, latestOkRunStarts, listingCountsBySource, setFavorite, setHidden } from '../db/index.js';
import { progress, triggerScrape } from '../scrape/runner.js';
import { SCRAPERS } from '../scrapers/index.js';
import { CRON_SCHEDULE, PORT, TARGET_ZIPS } from '../config/sources.config.js';

const app = express();
app.use(express.json());

// ------------------------------------------------------------------ API

app.get('/api/listings', (_req, res) => {
  const okStarts = latestOkRunStarts();
  const rows = allListings().map((r) => ({
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    url: r.url,
    title: r.title,
    address: r.address,
    city: r.city,
    zip: r.zip,
    price: r.price,
    beds: r.beds,
    baths: r.baths,
    sqft: r.sqft,
    availableDate: r.available_date,
    petFriendly: r.pet_friendly === null ? null : !!r.pet_friendly,
    photos: safeParse(r.photos) ?? [],
    lat: r.lat,
    lng: r.lng,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    isActive: !!r.is_active,
    isFavorite: !!r.is_favorite,
    isHidden: !!r.is_hidden,
    dupGroup: r.dup_group,
    isSample: !!r.is_sample,
    isNew: !!r.is_sample
      ? false
      : okStarts[r.source] !== undefined && r.first_seen >= okStarts[r.source],
  }));
  res.json({ listings: rows });
});

app.get('/api/status', (_req, res) => {
  const runs = latestRuns();
  const counts = listingCountsBySource();
  const okStarts = latestOkRunStarts();
  const sources = SCRAPERS.map((s) => ({
    key: s.key,
    name: s.name,
    tier: s.tier,
    activeListings: counts[s.key] ?? 0,
    lastRun: runs[s.key]
      ? {
          startedAt: runs[s.key].started_at,
          finishedAt: runs[s.key].finished_at,
          status: runs[s.key].status,
          count: runs[s.key].listing_count,
          errors: runs[s.key].errors,
        }
      : null,
  }));
  const totals = db
    .prepare(`SELECT COUNT(*) AS active, SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END) AS favs FROM listings WHERE is_active = 1 AND is_hidden = 0`)
    .get() as any;
  let newCount = 0;
  for (const r of db.prepare(`SELECT source, first_seen, is_sample FROM listings WHERE is_active = 1 AND is_hidden = 0`).all() as any[]) {
    if (!r.is_sample && okStarts[r.source] !== undefined && r.first_seen >= okStarts[r.source]) newCount++;
  }
  res.json({
    sources,
    totals: { active: totals.active ?? 0, newSinceLastScrape: newCount, favorites: totals.favs ?? 0 },
    scrape: progress,
    targetZips: TARGET_ZIPS,
  });
});

app.post('/api/scrape', (req, res) => {
  const source = typeof req.body?.source === 'string' ? req.body.source : undefined;
  if (source && !SCRAPERS.some((s) => s.key === source)) {
    return res.status(400).json({ error: `unknown source "${source}"` });
  }
  const result = triggerScrape(source ? [source] : undefined);
  res.status(result.started ? 202 : 409).json(result);
});

app.get('/api/scrape/progress', (_req, res) => res.json(progress));

app.post('/api/listings/:id/favorite', (req, res) => {
  setFavorite(Number(req.params.id), !!req.body?.value);
  res.json({ ok: true });
});

app.post('/api/listings/:id/hide', (req, res) => {
  setHidden(Number(req.params.id), !!req.body?.value);
  res.json({ ok: true });
});

// keep API errors from ever killing the process
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] error:', err);
  res.status(500).json({ error: 'internal error' });
});

// -------------------------------------------------------------- frontend

const webDist = path.resolve('dist/web');
app.use(express.static(webDist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  const index = path.join(webDist, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res
    .status(503)
    .type('html')
    .send('<body style="background:#0b0f19;color:#e2e8f0;font-family:sans-serif;padding:3rem"><h2>Frontend still building…</h2><p>The Vite watcher is producing its first build. Refresh in a few seconds.</p></body>');
});

// ---------------------------------------------------------------- start

app.listen(PORT, () => {
  console.log(`\n  🏠 Apartment aggregator running at http://localhost:${PORT}\n`);

  // scheduled scrape every 6 hours
  cron.schedule(CRON_SCHEDULE, () => {
    console.log('[cron] scheduled scrape starting');
    triggerScrape();
  });

  // first scrape on boot — skip if we already scraped within the last 6 hours
  const recent = db
    .prepare(`SELECT COUNT(*) AS c FROM scrape_runs WHERE started_at > ?`)
    .get(new Date(Date.now() - 6 * 3600_000).toISOString()) as { c: number };
  if (recent.c === 0) {
    console.log('[boot] no recent scrape — starting initial scrape in 5s');
    setTimeout(() => triggerScrape(), 5000);
  } else {
    console.log('[boot] recent scrape found — next run via cron (every 6h) or the "Scrape now" button');
  }
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

function safeParse(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
