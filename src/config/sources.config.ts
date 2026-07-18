/**
 * Central config. Edit zips, areas, and property-management companies here —
 * nothing else needs to change.
 */

/** Target zip codes: Virginia Beach, Norfolk, Ocean View. */
export const TARGET_ZIPS = [
  '23451', '23452', '23454', '23455', '23456', '23462', '23464',
  '23503', '23505', '23509', '23513', '23518',
];

/** City/area names we accept when a source only gives us a city or neighborhood. */
export const TARGET_AREAS = [
  'virginia beach',
  'norfolk',
  'ocean view',
];

/**
 * AppFolio-hosted property managers. Adding a company is one line:
 * the subdomain of https://{subdomain}.appfolio.com/listings
 */
export const APPFOLIO_COMPANIES: { subdomain: string; label: string }[] = [
  { subdomain: 'druckerandfalk', label: 'Drucker + Falk' },
  // { subdomain: 'anothercompany', label: 'Another Company' },
];

/**
 * Buildium-hosted property managers. Adding a company is one line:
 * the subdomain of https://{subdomain}.managebuilding.com/Resident/public/rentals
 */
export const BUILDIUM_COMPANIES: { subdomain: string; label: string }[] = [
  { subdomain: 'gatewaymanagement', label: 'Gateway Management' },
  // { subdomain: 'anothercompany', label: 'Another Company' },
];

/** Per-source hard cap of listings per run (etiquette). */
export const PER_SOURCE_CAP = 200;

/** Random delay range between page loads, ms. */
export const DELAY_RANGE_MS: [number, number] = [2000, 3000];

/** Scrape schedule (node-cron): every 6 hours. */
export const CRON_SCHEDULE = '0 */6 * * *';

/** Server port. */
export const PORT = Number(process.env.PORT || 4321);

/** SQLite file location. */
export const DB_PATH = process.env.DB_PATH || 'data/aggregator.db';

/** Nominatim geocoding: identify ourselves and stay ≤ 1 req/sec. */
export const NOMINATIM_EMAIL = process.env.NOMINATIM_EMAIL || 'personal-apartment-search@example.com';
export const GEOCODE_MAX_PER_RUN = 100;

/** Realistic desktop browser fingerprint for Playwright. */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const VIEWPORT = { width: 1440, height: 900 };
