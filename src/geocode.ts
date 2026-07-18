import { GEOCODE_MAX_PER_RUN, NOMINATIM_EMAIL } from './config/sources.config.js';
import { getGeocodeCached, listingsNeedingGeocode, putGeocodeCache, setListingLatLng } from './db/index.js';
import { normalizeAddress } from './lib/normalize.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Geocode active listings that have an address but no lat/lng, via Nominatim
 * (OpenStreetMap). Hard rate limit of ~1 request/sec per their usage policy;
 * every result (including failures) is cached in the DB so an address is only
 * ever looked up once.
 */
export async function geocodePending(): Promise<void> {
  const pending = listingsNeedingGeocode(GEOCODE_MAX_PER_RUN * 3);
  if (!pending.length) return;
  console.log(`[geocode] ${pending.length} listings need coordinates`);

  let requests = 0;
  for (const l of pending) {
    const query = [l.address, l.city ?? '', 'VA', l.zip ?? ''].filter(Boolean).join(', ');
    const norm = normalizeAddress(query);

    const cached = getGeocodeCached(norm);
    if (cached) {
      if (cached.lat != null && cached.lng != null) setListingLatLng(l.id, cached.lat, cached.lng);
      continue; // cached failure: don't retry, don't spend a request
    }

    if (requests >= GEOCODE_MAX_PER_RUN) break; // finish the tail next run
    requests++;
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', 'us');
      url.searchParams.set('email', NOMINATIM_EMAIL);
      const resp = await fetch(url, {
        headers: { 'User-Agent': `personal-apartment-aggregator/1.0 (${NOMINATIM_EMAIL})` },
      });
      if (!resp.ok) {
        console.warn(`[geocode] HTTP ${resp.status} for "${query}"`);
        if (resp.status === 429 || resp.status === 403) break; // back off entirely this run
        putGeocodeCache(norm, null, null);
      } else {
        const results = (await resp.json()) as { lat: string; lon: string }[];
        if (results.length) {
          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          putGeocodeCache(norm, lat, lng);
          setListingLatLng(l.id, lat, lng);
        } else {
          putGeocodeCache(norm, null, null);
        }
      }
    } catch (e: any) {
      console.warn(`[geocode] failed for "${query}": ${e?.message ?? e}`);
    }
    await sleep(1100); // ≥1s between requests, always
  }
  console.log(`[geocode] done (${requests} Nominatim requests)`);
}
