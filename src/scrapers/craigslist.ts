import type { NormalizedListing, ScraperModule } from '../types.js';
import { politeGoto } from '../lib/browser.js';
import { classifyCity, extractZip, inTargetArea, parseBaths, parseBeds, parsePrice, parseSqft, resolveCity } from '../lib/normalize.js';

/**
 * Craigslist Norfolk (covers all of Hampton Roads) — apartments/housing for
 * rent. The search page is JS-rendered; we read the result cards and filter
 * to our target area by neighborhood/title text (the list view has no zips).
 */
export const craigslist: ScraperModule = {
  key: 'craigslist',
  name: 'Craigslist',
  tier: 1,
  async fetchListings(ctx) {
    const page = await ctx.browserContext.newPage();
    const out: NormalizedListing[] = [];
    try {
      // min_price filters out spam; bundleDuplicates collapses reposts
      const url = 'https://norfolk.craigslist.org/search/apa?min_price=400&bundleDuplicates=1#search=1~gallery~0~0';
      await politeGoto(page, url);
      await page.waitForSelector('.cl-search-result, li.cl-static-search-result, .result-info', { timeout: 20000 }).catch(() => {});

      const cards = await page.evaluate(() => {
        const results: any[] = [];
        // modern JS-rendered results
        for (const el of Array.from(document.querySelectorAll('.cl-search-result'))) {
          const a = el.querySelector('a.cl-app-anchor, a.posting-title, a[href*=".html"]') as HTMLAnchorElement | null;
          results.push({
            url: a?.href || '',
            title: (el.querySelector('.label, .posting-title .label')?.textContent || a?.textContent || '').trim(),
            price: (el.querySelector('.priceinfo, .price')?.textContent || '').trim(),
            meta: (el.querySelector('.meta, .supertitle, .housing-meta')?.textContent || el.textContent || '').trim().slice(0, 400),
            img: (el.querySelector('img') as HTMLImageElement | null)?.src || null,
            pid: el.getAttribute('data-pid') || null,
          });
        }
        // static fallback markup
        if (!results.length) {
          for (const el of Array.from(document.querySelectorAll('li.cl-static-search-result'))) {
            const a = el.querySelector('a') as HTMLAnchorElement | null;
            results.push({
              url: a?.href || '',
              title: (el.querySelector('.title')?.textContent || '').trim(),
              price: (el.querySelector('.price')?.textContent || '').trim(),
              meta: (el.querySelector('.location')?.textContent || '').trim(),
              img: null,
              pid: null,
            });
          }
        }
        return results;
      });

      ctx.log(`craigslist: ${cards.length} raw results`);

      for (const c of cards) {
        if (out.length >= ctx.cap) break;
        if (!c.url) continue;
        const pid = c.pid || c.url.match(/\/(\d+)\.html/)?.[1];
        if (!pid) continue;
        const blob = `${c.title} ${c.meta}`;
        const zip = extractZip(blob);
        // Norfolk CL covers Chesapeake/Portsmouth/Hampton too — keep only our area
        if (!inTargetArea(zip, c.title, c.meta)) continue;
        const price = parsePrice(c.price) ?? parsePrice(blob);
        if (!price) continue;
        out.push({
          source: 'craigslist',
          externalId: pid,
          url: c.url,
          title: c.title || 'Craigslist listing',
          address: null, // list view has no street address; detail pages are skipped for politeness
          city: resolveCity(zip, blob) ?? classifyCity(blob),
          zip,
          price,
          beds: parseBeds(blob),
          baths: parseBaths(blob),
          sqft: parseSqft(blob),
          availableDate: null,
          petFriendly: /pet friendly|pets ok|dogs? ok|cats? ok/i.test(blob) ? true : null,
          photos: c.img ? [c.img] : [],
          lat: null,
          lng: null,
          raw: c,
        });
      }
    } finally {
      await page.close().catch(() => {});
    }
    return out;
  },
};
