import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from '../config/sources.config.js';
import type { NormalizedListing, SourceRunStatus } from '../types.js';

fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS listings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  url           TEXT NOT NULL,
  title         TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  zip           TEXT,
  price         INTEGER,
  beds          REAL,
  baths         REAL,
  sqft          INTEGER,
  available_date TEXT,
  pet_friendly  INTEGER,
  photos        TEXT NOT NULL DEFAULT '[]',
  lat           REAL,
  lng           REAL,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  is_favorite   INTEGER NOT NULL DEFAULT 0,
  is_hidden     INTEGER NOT NULL DEFAULT 0,
  dup_group     TEXT,
  is_sample     INTEGER NOT NULL DEFAULT 0,
  raw_json      TEXT,
  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(is_active);
CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  listing_count INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'running',
  errors        TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_source ON scrape_runs(source, started_at);

CREATE TABLE IF NOT EXISTS geocode_cache (
  norm_address  TEXT PRIMARY KEY,
  lat           REAL,
  lng           REAL,
  resolved_at   TEXT NOT NULL,
  failed        INTEGER NOT NULL DEFAULT 0
);
`);

const now = () => new Date().toISOString();

// ---------------------------------------------------------------- listings

const upsertStmt = db.prepare(`
INSERT INTO listings (source, external_id, url, title, address, city, zip, price, beds, baths,
                      sqft, available_date, pet_friendly, photos, lat, lng,
                      first_seen, last_seen, is_active, raw_json)
VALUES (@source, @external_id, @url, @title, @address, @city, @zip, @price, @beds, @baths,
        @sqft, @available_date, @pet_friendly, @photos, @lat, @lng,
        @now, @now, 1, @raw_json)
ON CONFLICT(source, external_id) DO UPDATE SET
  url = excluded.url,
  title = excluded.title,
  address = COALESCE(excluded.address, listings.address),
  city = COALESCE(excluded.city, listings.city),
  zip = COALESCE(excluded.zip, listings.zip),
  price = COALESCE(excluded.price, listings.price),
  beds = COALESCE(excluded.beds, listings.beds),
  baths = COALESCE(excluded.baths, listings.baths),
  sqft = COALESCE(excluded.sqft, listings.sqft),
  available_date = COALESCE(excluded.available_date, listings.available_date),
  pet_friendly = COALESCE(excluded.pet_friendly, listings.pet_friendly),
  photos = CASE WHEN excluded.photos = '[]' THEN listings.photos ELSE excluded.photos END,
  lat = COALESCE(excluded.lat, listings.lat),
  lng = COALESCE(excluded.lng, listings.lng),
  last_seen = excluded.last_seen,
  is_active = 1,
  raw_json = excluded.raw_json
`);

export function upsertListing(l: NormalizedListing): void {
  upsertStmt.run({
    source: l.source,
    external_id: l.externalId,
    url: l.url,
    title: l.title.slice(0, 300),
    address: l.address,
    city: l.city,
    zip: l.zip,
    price: l.price,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    available_date: l.availableDate,
    pet_friendly: l.petFriendly === null ? null : l.petFriendly ? 1 : 0,
    photos: JSON.stringify(l.photos.slice(0, 10)),
    lat: l.lat,
    lng: l.lng,
    now: now(),
    raw_json: safeJson(l.raw),
  });
}

function safeJson(v: unknown): string | null {
  try {
    const s = JSON.stringify(v);
    return s && s.length > 100_000 ? s.slice(0, 100_000) : s;
  } catch {
    return null;
  }
}

export const upsertListings = db.transaction((listings: NormalizedListing[]) => {
  for (const l of listings) upsertListing(l);
});

/** Mark listings from `source` not seen since `runStartedAt` as inactive. */
export function deactivateUnseen(source: string, runStartedAt: string): number {
  const res = db
    .prepare(`UPDATE listings SET is_active = 0 WHERE source = ? AND last_seen < ? AND is_sample = 0`)
    .run(source, runStartedAt);
  return res.changes;
}

export function countListings(activeOnly = false): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM listings ${activeOnly ? 'WHERE is_active = 1' : ''}`)
    .get() as { c: number };
  return row.c;
}

export function countRealListings(): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE is_sample = 0`).get() as { c: number };
  return row.c;
}

export function setFavorite(id: number, value: boolean): void {
  db.prepare(`UPDATE listings SET is_favorite = ? WHERE id = ?`).run(value ? 1 : 0, id);
}

export function setHidden(id: number, value: boolean): void {
  db.prepare(`UPDATE listings SET is_hidden = ? WHERE id = ?`).run(value ? 1 : 0, id);
}

export function allListings(): any[] {
  return db.prepare(`SELECT * FROM listings ORDER BY first_seen DESC`).all();
}

// ------------------------------------------------------------- scrape runs

export function startRun(source: string): { id: number; startedAt: string } {
  const startedAt = now();
  const res = db
    .prepare(`INSERT INTO scrape_runs (source, started_at, status) VALUES (?, ?, 'running')`)
    .run(source, startedAt);
  return { id: Number(res.lastInsertRowid), startedAt };
}

export function finishRun(id: number, status: SourceRunStatus, count: number, errors: string[]): void {
  db.prepare(`UPDATE scrape_runs SET finished_at = ?, status = ?, listing_count = ?, errors = ? WHERE id = ?`)
    .run(now(), status, count, errors.length ? errors.join(' | ').slice(0, 2000) : null, id);
}

/** Most recent finished run per source. */
export function latestRuns(): Record<string, any> {
  const rows = db
    .prepare(
      `SELECT r.* FROM scrape_runs r
       JOIN (SELECT source, MAX(id) AS mid FROM scrape_runs WHERE finished_at IS NOT NULL GROUP BY source) m
         ON r.id = m.mid`
    )
    .all() as any[];
  const map: Record<string, any> = {};
  for (const r of rows) map[r.source] = r;
  return map;
}

/** Start time of the latest successful ('ok') run per source — used for the NEW badge. */
export function latestOkRunStarts(): Record<string, string> {
  const rows = db
    .prepare(
      `SELECT source, MAX(started_at) AS s FROM scrape_runs WHERE status = 'ok' GROUP BY source`
    )
    .all() as { source: string; s: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.source] = r.s;
  return map;
}

export function listingCountsBySource(): Record<string, number> {
  const rows = db
    .prepare(`SELECT source, COUNT(*) AS c FROM listings WHERE is_active = 1 GROUP BY source`)
    .all() as { source: string; c: number }[];
  const map: Record<string, number> = {};
  for (const r of rows) map[r.source] = r.c;
  return map;
}

// ------------------------------------------------------------ geocode cache

export function getGeocodeCached(normAddress: string): { lat: number | null; lng: number | null; failed: number } | undefined {
  return db.prepare(`SELECT lat, lng, failed FROM geocode_cache WHERE norm_address = ?`).get(normAddress) as any;
}

export function putGeocodeCache(normAddress: string, lat: number | null, lng: number | null): void {
  db.prepare(
    `INSERT INTO geocode_cache (norm_address, lat, lng, resolved_at, failed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(norm_address) DO UPDATE SET lat = excluded.lat, lng = excluded.lng,
       resolved_at = excluded.resolved_at, failed = excluded.failed`
  ).run(normAddress, lat, lng, now(), lat === null ? 1 : 0);
}

export function listingsNeedingGeocode(limit: number): { id: number; address: string; city: string | null; zip: string | null }[] {
  return db
    .prepare(
      `SELECT id, address, city, zip FROM listings
       WHERE is_active = 1 AND lat IS NULL AND address IS NOT NULL AND address != ''
       ORDER BY first_seen DESC LIMIT ?`
    )
    .all(limit) as any[];
}

export function setListingLatLng(id: number, lat: number, lng: number): void {
  db.prepare(`UPDATE listings SET lat = ?, lng = ? WHERE id = ?`).run(lat, lng, id);
}
