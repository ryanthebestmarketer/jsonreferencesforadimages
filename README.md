# 🏠 Hampton Roads Rentals — personal apartment aggregator

A single-command, local apartment aggregator for **Virginia Beach / Norfolk / Ocean View, VA**.
Scrapes 10 rental sources into one SQLite file, dedups cross-source listings, geocodes
addresses, and serves a fast dark-mode dashboard with card + map views.

> **Disclaimer:** this is for **personal use only**. It scrapes low-volume, sequentially,
> with 2–3 s delays and a 200-listing-per-source cap, and always links back to the original
> listing. Respect each site's terms of service; don't run it at high frequency or
> redistribute the data.

## Setup

```bash
npm install
npx playwright install chromium   # one-time browser download
npm run dev
```

Then open **http://localhost:4321**.

`npm run dev` runs the Express server and the Vite build watcher together. On first boot
(and whenever there's been no scrape in the last 6 hours) a full scrape starts
automatically ~5 s after the server is up; after that, node-cron re-scrapes **every 6
hours**. You can also:

- click **⟳ Run scrape now** in the header (or the **▾** next to it to run a single source — handy for testing one scraper),
- run from the CLI: `npm run scrape` or `npm run scrape -- craigslist zillow`.

The database is a single file at `data/aggregator.db` — delete it to start fresh.

## Sources

| Tier | Source | Key | Notes |
|---|---|---|---|
| 1 | Craigslist Norfolk | `craigslist` | Filtered to target areas by neighborhood text (list view has no zips) |
| 1 | AppFolio PMs | `appfolio` | Generic — one scraper for every `*.appfolio.com/listings` site |
| 1 | Buildium PMs | `buildium` | Generic — one scraper for every `*.managebuilding.com` public rentals page |
| 1 | Dwellsy | `dwellsy` | Small-landlord aggregator, soft bot protection |
| 1 | AHRN | `ahrn` | Military housing network; logs `login_required` if it demands an account |
| 2 | Zillow Rentals | `zillow` | Rentals only (`FOR_RENT` status guard) |
| 2 | Apartments.com | `apartments_com` | |
| 2 | Zumper | `zumper` | |
| 2 | Realtor.com | `realtor` | Rentals only (`/apartments/` + status guard) |
| 2 | HotPads | `hotpads` | |

### Which sources get blocked, and what it looks like

Tier 2 aggregators (Zillow, Apartments.com, Zumper, Realtor.com, HotPads) run aggressive
bot protection (PerimeterX "Press & Hold", Cloudflare, captchas). Expect them to be
**blocked some or most of the time** — that's normal and harmless:

- the source's chip in the header status row turns **red** with a `BLOCKED` label,
- the run is logged to the `scrape_runs` table with `status = 'blocked'`,
- the rest of the run continues untouched; a blocked source **never** deactivates its
  previously scraped listings and is retried at most **once** per run.

AHRN shows a red `LOGIN` chip if its search requires an account. Tier 1 sources should
work reliably; if one breaks, its chip goes red with `ERROR` and the tooltip shows the
message.

## Adding an AppFolio or Buildium company (one line)

Edit `src/config/sources.config.ts`:

```ts
export const APPFOLIO_COMPANIES = [
  { subdomain: 'druckerandfalk', label: 'Drucker + Falk' },
  { subdomain: 'newcompany', label: 'New Company' },   // ← https://newcompany.appfolio.com/listings
];

export const BUILDIUM_COMPANIES = [
  { subdomain: 'gatewaymanagement', label: 'Gateway Management' },
  { subdomain: 'newcompany', label: 'New Company' },   // ← https://newcompany.managebuilding.com/Resident/public/rentals
];
```

## Adjusting zips / areas

Also in `src/config/sources.config.ts`:

- `TARGET_ZIPS` — the single source of truth for zip filtering (all 12 target zips live here),
- `TARGET_AREAS` — city/neighborhood names used when a source doesn't expose a zip,
- other knobs: `PER_SOURCE_CAP`, `DELAY_RANGE_MS`, `CRON_SCHEDULE`, `PORT`.

Tier-2 search URLs are per-scraper in `src/scrapers/*.ts` (they encode city names) — if
you change target cities, update those URL lists too.

## How it works

- **Scrape runs** are sequential (one source at a time, 2–3 s random delays). Each run
  upserts on `(source, external_id)`, refreshes `last_seen`, marks listings that vanished
  from a *successful* run `is_active = false`, and logs to `scrape_runs`.
- **NEW badge** = `first_seen` within the source's most recent successful run.
- **Cross-source dedup**: same normalized address + same beds + price within $50 across
  different sources ⇒ listings share a `dup_group` and get a purple **POSSIBLE DUPE**
  badge. Nothing is auto-merged; the "Hide dupes" filter keeps the cheapest of each group.
- **Geocoding**: Nominatim (OpenStreetMap), ≤ 1 request/sec, capped at 100 lookups per
  run, cached forever in the `geocode_cache` table (failures too). The map shows how many
  listings are still waiting for coordinates.
- **Sample data**: if a *full* scrape ends with zero real listings ever collected, 12
  fake Virginia Beach/Norfolk listings are seeded so the UI and filters can be exercised.
  They're badged **SAMPLE** everywhere; filter them out via the Sources row once real
  data arrives.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server + frontend watcher (+ auto first scrape) |
| `npm run build` | Typecheck + production frontend build |
| `npm start` | Server only (serves the last-built frontend) |
| `npm run scrape` | One-off scrape of all sources |
| `npm run scrape -- <keys…>` | Scrape specific sources (see keys in the table above) |
