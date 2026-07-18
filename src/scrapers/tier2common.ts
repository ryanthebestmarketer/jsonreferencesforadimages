import type { Page } from 'playwright';
import type { NormalizedListing, ScrapeContext } from '../types.js';
import { extractEmbeddedJson, findListingObjects, pick, politeGoto } from '../lib/browser.js';
import { extractZip, inTargetArea, parsePrice, resolveCity } from '../lib/normalize.js';

/**
 * Shared machinery for Tier-2 aggregators (Zillow, Zumper, Realtor, HotPads…).
 * They are all JS apps that embed their search state as JSON, so the reliable
 * path is: load search page → harvest embedded JSON → deep-scan for
 * listing-shaped objects → map with a per-site adapter. DOM scraping on these
 * sites breaks weekly; JSON state does not.
 */
export interface Tier2Adapter {
  source: string;
  urls: string[];
  /** Map one raw listing-shaped object to a NormalizedListing (or null to skip). */
  map(o: Record<string, any>, pageUrl: string): NormalizedListing | null;
  /** Optional extra DOM fallback when no JSON state is found. */
  domFallback?(page: Page, ctx: ScrapeContext): Promise<NormalizedListing[]>;
}

export async function runTier2(ctx: ScrapeContext, adapter: Tier2Adapter): Promise<NormalizedListing[]> {
  const page = await ctx.browserContext.newPage();
  const out: NormalizedListing[] = [];
  const seen = new Set<string>();
  try {
    for (const url of adapter.urls) {
      if (out.length >= ctx.cap) break;
      await politeGoto(page, url);
      await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
      // politeGoto checks the initial response; re-check after hydration
      const { checkForBotWall } = await import('../lib/browser.js');
      await checkForBotWall(page);

      const blobs = await extractEmbeddedJson(page);
      const objs = blobs.flatMap((b) => findListingObjects(b));
      ctx.log(`${adapter.source}: ${objs.length} listing-shaped objects at ${url}`);

      for (const o of objs) {
        if (out.length >= ctx.cap) break;
        let mapped: NormalizedListing | null = null;
        try {
          mapped = adapter.map(o, url);
        } catch {
          continue;
        }
        if (!mapped || seen.has(mapped.externalId)) continue;
        seen.add(mapped.externalId);
        out.push(mapped);
      }

      if (!objs.length && adapter.domFallback) {
        const extra = await adapter.domFallback(page, ctx).catch(() => [] as NormalizedListing[]);
        for (const l of extra) {
          if (out.length >= ctx.cap) break;
          if (seen.has(l.externalId)) continue;
          seen.add(l.externalId);
          out.push(l);
        }
      }
      await ctx.politeDelay();
    }
  } finally {
    await page.close().catch(() => {});
  }
  return out;
}

/** Common field mapping shared by several Tier-2 adapters. */
export function genericMap(source: string, o: Record<string, any>, baseUrl: string, opts: {
  idKeys?: string[];
  rentalOnly?: (o: Record<string, any>) => boolean;
} = {}): NormalizedListing | null {
  const id = String(pick(o, ...(opts.idKeys ?? ['id', 'zpid', 'listingId', 'listing_id', 'propertyId', 'property_id'])) ?? '');
  if (!id) return null;
  if (opts.rentalOnly && !opts.rentalOnly(o)) return null;

  const addr = pick(o, 'address');
  const addrText = typeof addr === 'string'
    ? addr
    : [pick(o, 'address.streetAddress', 'address.line', 'address.street', 'address.address1', 'streetAddress', 'street'),
       pick(o, 'address.city', 'city'),
       pick(o, 'address.state', 'state')].filter(Boolean).join(', ');
  const zip = extractZip(pick(o, 'address.zipcode', 'address.postal_code', 'address.postalCode', 'addressZipcode', 'zipcode', 'zip', 'postalCode', 'postal_code'))
    ?? extractZip(addrText);
  if (!inTargetArea(zip, addrText, pick(o, 'city', 'address.city'))) return null;

  const rawPrice = pick(o, 'unformattedPrice', 'price', 'list_price', 'listPrice', 'min_price', 'minPrice', 'rent', 'priceMin');
  const price = typeof rawPrice === 'number' && rawPrice > 100 && rawPrice < 20000
    ? Math.round(rawPrice)
    : parsePrice(String(rawPrice ?? ''));
  if (!price) return null;

  const detailUrl = pick(o, 'detailUrl', 'url', 'href', 'permalink', 'canonicalUrl');
  const fullUrl = typeof detailUrl === 'string'
    ? (detailUrl.startsWith('http') ? detailUrl : new URL(detailUrl, baseUrl).toString())
    : baseUrl;

  const photos = ([] as any[])
    .concat(pick(o, 'photos', 'images', 'carouselPhotos', 'media.photos') ?? [], pick(o, 'imgSrc', 'photo.href', 'primary_photo.href', 'thumbnailUrl', 'image_url') ?? [])
    .flat()
    .map((p) => (typeof p === 'string' ? p : pick(p ?? {}, 'url', 'href', 'src', 'image')))
    .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
    .slice(0, 5);

  const bedsRaw = pick(o, 'beds', 'bedrooms', 'minBeds', 'description.beds', 'beds_min');
  const bathsRaw = pick(o, 'baths', 'bathrooms', 'minBaths', 'description.baths', 'baths_min');
  const sqftRaw = pick(o, 'area', 'sqft', 'livingArea', 'squareFeet', 'description.sqft', 'square_feet');

  return {
    source,
    externalId: id,
    url: fullUrl,
    title: String(pick(o, 'statusText', 'title', 'name', 'buildingName', 'building_name') ?? addrText ?? `${source} listing`),
    address: addrText || null,
    city: resolveCity(zip, addrText, pick(o, 'address.city', 'city')),
    zip,
    price,
    beds: toNum(bedsRaw),
    baths: toNum(bathsRaw),
    sqft: toNum(sqftRaw) ? Math.round(toNum(sqftRaw)!) : null,
    availableDate: pick(o, 'availableDate', 'available_date', 'dateAvailable') ?? null,
    petFriendly: typeof pick(o, 'petsAllowed', 'petFriendly', 'pet_friendly') === 'boolean'
      ? pick(o, 'petsAllowed', 'petFriendly', 'pet_friendly') : null,
    photos,
    lat: toNum(pick(o, 'latLong.latitude', 'lat', 'latitude', 'location.lat', 'coordinates.lat', 'address.coordinate.lat')),
    lng: toNum(pick(o, 'latLong.longitude', 'lng', 'lon', 'longitude', 'location.lng', 'coordinates.lng', 'address.coordinate.lon')),
    raw: o,
  };
}

export function toNum(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && isFinite(n) ? n : null;
}
