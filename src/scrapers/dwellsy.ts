import type { NormalizedListing, ScraperModule } from '../types.js';
import { extractEmbeddedJson, findListingObjects, pick, politeGoto } from '../lib/browser.js';
import { extractZip, inTargetArea, parseBaths, parseBeds, parsePrice, resolveCity } from '../lib/normalize.js';

/**
 * Dwellsy — small-landlord heavy aggregator, softer bot protection.
 * The site is a Next.js app; we prefer the embedded JSON state and fall back
 * to DOM cards.
 */
const CITY_PAGES = [
  'https://dwellsy.com/t/va/virginia-beach',
  'https://dwellsy.com/t/va/norfolk',
];

export const dwellsy: ScraperModule = {
  key: 'dwellsy',
  name: 'Dwellsy',
  tier: 1,
  async fetchListings(ctx) {
    const page = await ctx.browserContext.newPage();
    const out: NormalizedListing[] = [];
    const seen = new Set<string>();
    try {
      for (const url of CITY_PAGES) {
        if (out.length >= ctx.cap) break;
        await politeGoto(page, url);
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

        // 1) embedded app state
        const blobs = await extractEmbeddedJson(page);
        const objs = blobs.flatMap((b) => findListingObjects(b));
        ctx.log(`dwellsy: ${objs.length} listing-shaped objects in ${url}`);
        for (const o of objs) {
          if (out.length >= ctx.cap) break;
          const id = String(pick(o, 'id', 'listingId', 'listing_id', 'slug') ?? '');
          if (!id || seen.has(id)) continue;
          const addressObj = pick(o, 'address', 'location.address') ?? {};
          const addrText = typeof addressObj === 'string'
            ? addressObj
            : [pick(addressObj, 'line1', 'street', 'streetAddress', 'address1'), pick(addressObj, 'city'), pick(addressObj, 'state')].filter(Boolean).join(', ');
          const zip = extractZip(typeof addressObj === 'object' ? pick(addressObj, 'zip', 'postalCode', 'postal_code', 'zipCode') : null) ?? extractZip(addrText);
          if (!inTargetArea(zip, addrText, pick(o, 'city'))) continue;
          const price = parsePrice(String(pick(o, 'price', 'rent', 'min_price', 'minPrice') ?? ''));
          if (!price) continue;
          seen.add(id);
          const slug = pick(o, 'slug', 'urlSlug');
          const photos = ([] as string[]).concat(pick(o, 'photos', 'images', 'media') ?? [])
            .map((p: any) => (typeof p === 'string' ? p : pick(p, 'url', 'src', 'href')))
            .filter((u: any): u is string => typeof u === 'string' && u.startsWith('http'));
          out.push({
            source: 'dwellsy',
            externalId: id,
            url: slug ? `https://dwellsy.com/listing/${slug}` : url,
            title: String(pick(o, 'title', 'name', 'headline') ?? addrText ?? 'Dwellsy listing'),
            address: addrText || null,
            city: resolveCity(zip, addrText),
            zip,
            price,
            beds: numOrNull(pick(o, 'beds', 'bedrooms')),
            baths: numOrNull(pick(o, 'baths', 'bathrooms')),
            sqft: numOrNull(pick(o, 'sqft', 'squareFeet', 'square_feet', 'area')),
            availableDate: pick(o, 'availableDate', 'available_date', 'dateAvailable') ?? null,
            petFriendly: boolOrNull(pick(o, 'petsAllowed', 'pets_allowed', 'petFriendly')),
            photos: photos.slice(0, 5),
            lat: numOrNull(pick(o, 'lat', 'latitude', 'location.lat')),
            lng: numOrNull(pick(o, 'lng', 'lon', 'longitude', 'location.lng')),
            raw: o,
          });
        }

        // 2) DOM fallback if the state scan found nothing on this page
        if (!out.length) {
          const cards = await page.evaluate(() => {
            const results: any[] = [];
            for (const a of Array.from(document.querySelectorAll('a[href*="/listing/"]')) as HTMLAnchorElement[]) {
              const card = a.closest('article, li, div[class*="card"]') || a;
              results.push({
                url: a.href,
                text: (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
                img: (card.querySelector('img') as HTMLImageElement | null)?.src || null,
              });
            }
            return results;
          });
          for (const c of cards) {
            if (out.length >= ctx.cap) break;
            const id = c.url.split('/listing/')[1]?.split(/[/?#]/)[0];
            if (!id || seen.has(id)) continue;
            const zip = extractZip(c.text);
            if (!inTargetArea(zip, c.text)) continue;
            const price = parsePrice(c.text);
            if (!price) continue;
            seen.add(id);
            out.push({
              source: 'dwellsy', externalId: id, url: c.url,
              title: c.text.slice(0, 120) || 'Dwellsy listing',
              address: null, city: resolveCity(zip, c.text), zip, price,
              beds: parseBeds(c.text), baths: parseBaths(c.text), sqft: null,
              availableDate: null, petFriendly: null,
              photos: c.img ? [c.img] : [], lat: null, lng: null, raw: c,
            });
          }
        }
        await ctx.politeDelay();
      }
    } finally {
      await page.close().catch(() => {});
    }
    return out;
  },
};

function numOrNull(v: any): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
}
function boolOrNull(v: any): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
