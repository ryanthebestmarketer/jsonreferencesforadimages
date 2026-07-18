import { LoginRequiredError, type NormalizedListing, type ScraperModule } from '../types.js';
import { extractEmbeddedJson, findListingObjects, pick, politeGoto } from '../lib/browser.js';
import { extractZip, inTargetArea, parseBaths, parseBeds, parsePrice, resolveCity } from '../lib/normalize.js';

/**
 * AHRN (ahrn.com) — the military housing network, big around Norfolk/NAS
 * Oceana. Public search often redirects to login; when that happens we fail
 * gracefully with LoginRequiredError so the run logs it and moves on.
 */
export const ahrn: ScraperModule = {
  key: 'ahrn',
  name: 'AHRN (military)',
  tier: 1,
  async fetchListings(ctx) {
    const page = await ctx.browserContext.newPage();
    const out: NormalizedListing[] = [];
    try {
      await politeGoto(page, 'https://www.ahrn.com/search?location=Norfolk%2C%20VA&type=rental');
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

      const url = page.url().toLowerCase();
      const body = ((await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')) || '').toLowerCase();
      if (url.includes('login') || url.includes('sign-in') || url.includes('signin') ||
          /log in|sign in to view|create an account to/i.test(body.slice(0, 1500))) {
        throw new LoginRequiredError('AHRN search requires an account login');
      }

      const blobs = await extractEmbeddedJson(page);
      const objs = blobs.flatMap((b) => findListingObjects(b));
      ctx.log(`ahrn: ${objs.length} listing-shaped objects`);

      const seen = new Set<string>();
      for (const o of objs) {
        if (out.length >= ctx.cap) break;
        const id = String(pick(o, 'id', 'listingId', 'propertyId') ?? '');
        if (!id || seen.has(id)) continue;
        const addr = pick(o, 'address.full', 'address.line1', 'address', 'streetAddress');
        const addrText = typeof addr === 'string' ? addr : JSON.stringify(addr ?? '');
        const zip = extractZip(pick(o, 'address.zip', 'zip', 'postalCode')) ?? extractZip(addrText);
        if (!inTargetArea(zip, addrText, pick(o, 'city', 'address.city'))) continue;
        const price = parsePrice(String(pick(o, 'rent', 'price', 'monthlyRent') ?? ''));
        if (!price) continue;
        seen.add(id);
        out.push({
          source: 'ahrn',
          externalId: id,
          url: pick(o, 'url', 'detailUrl') ?? `https://www.ahrn.com/listing/${id}`,
          title: String(pick(o, 'title', 'name') ?? addrText ?? 'AHRN listing'),
          address: typeof addr === 'string' ? addr : null,
          city: resolveCity(zip, addrText),
          zip,
          price,
          beds: parseBeds(String(pick(o, 'beds', 'bedrooms') ?? '')) ?? numOrNull(pick(o, 'beds', 'bedrooms')),
          baths: parseBaths(String(pick(o, 'baths', 'bathrooms') ?? '')) ?? numOrNull(pick(o, 'baths', 'bathrooms')),
          sqft: numOrNull(pick(o, 'sqft', 'squareFeet')),
          availableDate: pick(o, 'availableDate', 'dateAvailable') ?? null,
          petFriendly: typeof pick(o, 'petsAllowed', 'petFriendly') === 'boolean' ? pick(o, 'petsAllowed', 'petFriendly') : null,
          photos: ([] as any[]).concat(pick(o, 'photos', 'images') ?? [])
            .map((p) => (typeof p === 'string' ? p : pick(p, 'url', 'src')))
            .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
            .slice(0, 5),
          lat: numOrNull(pick(o, 'lat', 'latitude')),
          lng: numOrNull(pick(o, 'lng', 'longitude')),
          raw: o,
        });
      }
    } finally {
      await page.close().catch(() => {});
    }
    return out;
  },
};

function numOrNull(v: any): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) && n >= 0 ? n : null;
}
