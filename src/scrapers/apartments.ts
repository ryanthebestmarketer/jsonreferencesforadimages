import type { NormalizedListing, ScraperModule } from '../types.js';
import { pick } from '../lib/browser.js';
import { extractZip, parseBaths, parseBeds, parsePrice, resolveCity, zipInTarget, inTargetArea } from '../lib/normalize.js';
import { genericMap, runTier2 } from './tier2common.js';

/**
 * Apartments.com — rentals by definition. Server renders `article.placard`
 * cards, so we use a DOM fallback in addition to the embedded-JSON scan.
 */
export const apartmentsCom: ScraperModule = {
  key: 'apartments_com',
  name: 'Apartments.com',
  tier: 2,
  fetchListings(ctx) {
    return runTier2(ctx, {
      source: 'apartments_com',
      urls: [
        'https://www.apartments.com/virginia-beach-va/',
        'https://www.apartments.com/norfolk-va/',
      ],
      map(o) {
        // ld+json blocks describe apartments; anything with a forSale marker is skipped
        if (String(pick(o, 'type', '@type') ?? '').toLowerCase().includes('sale')) return null;
        return genericMap('apartments_com', o, 'https://www.apartments.com', {
          idKeys: ['listingId', 'id', 'key'],
        });
      },
      async domFallback(page, fctx) {
        const cards = await page.evaluate(() => {
          const results: any[] = [];
          for (const el of Array.from(document.querySelectorAll('article.placard, article[data-listingid]'))) {
            const a = el.querySelector('a.property-link, a[href*="apartments.com"]') as HTMLAnchorElement | null;
            results.push({
              id: el.getAttribute('data-listingid') || a?.href || '',
              url: a?.href || '',
              title: (el.querySelector('.property-title, .js-placardTitle')?.textContent || '').trim(),
              address: (el.querySelector('.property-address')?.textContent || el.getAttribute('data-streetaddress') || '').trim(),
              pricing: (el.querySelector('.property-pricing, .price-range, .property-rents')?.textContent || '').trim(),
              beds: (el.querySelector('.property-beds, .bed-range')?.textContent || '').trim(),
              text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
              img: (el.querySelector('img') as HTMLImageElement | null)?.src || null,
            });
          }
          return results;
        });
        fctx.log(`apartments_com: DOM fallback found ${cards.length} placards`);
        const out: NormalizedListing[] = [];
        for (const c of cards) {
          if (!c.id) continue;
          const zip = extractZip(c.address) ?? extractZip(c.text);
          if (!inTargetArea(zip, c.address, c.text)) continue;
          if (zip && !zipInTarget(zip)) continue;
          const price = parsePrice(c.pricing) ?? parsePrice(c.text);
          if (!price) continue;
          out.push({
            source: 'apartments_com',
            externalId: String(c.id).slice(0, 120),
            url: c.url,
            title: c.title || c.address || 'Apartments.com listing',
            address: c.address || null,
            city: resolveCity(zip, c.address, c.text),
            zip,
            price,
            beds: parseBeds(c.beds) ?? parseBeds(c.text),
            baths: parseBaths(c.text),
            sqft: null,
            availableDate: null,
            petFriendly: /dog friendly|cat friendly|pet friendly/i.test(c.text) ? true : null,
            photos: c.img ? [c.img] : [],
            lat: null,
            lng: null,
            raw: c,
          });
        }
        return out;
      },
    });
  },
};
