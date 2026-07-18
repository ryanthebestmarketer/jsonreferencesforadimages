import type { NormalizedListing, ScraperModule, ScrapeContext } from '../types.js';
import { APPFOLIO_COMPANIES } from '../config/sources.config.js';
import { politeGoto } from '../lib/browser.js';
import { extractZip, parseBaths, parseBeds, parsePrice, parseSqft, resolveCity, zipInTarget } from '../lib/normalize.js';

/**
 * Generic AppFolio scraper. Every AppFolio-hosted PM company serves the same
 * page at https://{subdomain}.appfolio.com/listings — listing cards with a
 * title (the address), a dl of details (rent, bed/bath, sqft, available), and
 * a photo. Add companies in sources.config.ts.
 */
async function scrapeCompany(ctx: ScrapeContext, subdomain: string, label: string): Promise<NormalizedListing[]> {
  const page = await ctx.browserContext.newPage();
  const out: NormalizedListing[] = [];
  try {
    await politeGoto(page, `https://${subdomain}.appfolio.com/listings`);
    await page.waitForSelector('.listing-item, [class*="listing-item"]', { timeout: 15000 }).catch(() => {});

    const cards = await page.evaluate(() => {
      const results: any[] = [];
      const els = document.querySelectorAll('.listing-item, [class*="listing-item__body"], .result-item');
      const containers = els.length
        ? Array.from(new Set(Array.from(els).map((e) => (e.closest('.listing-item') || e) as Element)))
        : [];
      for (const el of containers) {
        const a = el.querySelector('a[href*="/listings/detail"], a[href*="/listings/"]') as HTMLAnchorElement | null;
        const img = el.querySelector('img') as HTMLImageElement | null;
        // background-image photos
        let bg: string | null = null;
        const bgEl = el.querySelector('[style*="background-image"]') as HTMLElement | null;
        if (bgEl) {
          const m = bgEl.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
          if (m) bg = m[1];
        }
        // details often come as dt/dd pairs
        const details: Record<string, string> = {};
        const dts = el.querySelectorAll('dt');
        for (const dt of Array.from(dts)) {
          const dd = dt.nextElementSibling;
          if (dd) details[dt.textContent?.trim().toLowerCase() || ''] = dd.textContent?.trim() || '';
        }
        results.push({
          url: a?.href || '',
          title: (el.querySelector('.listing-item__title, h2, h3')?.textContent || '').trim(),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 800),
          details,
          img: img?.src || bg,
        });
      }
      return results;
    });

    ctx.log(`appfolio/${subdomain}: ${cards.length} raw cards`);

    for (const c of cards) {
      if (!c.url && !c.title) continue;
      const d = c.details as Record<string, string>;
      const detail = (key: string) => Object.entries(d).find(([k]) => k.includes(key))?.[1] ?? null;
      const address = c.title || null;
      const zip = extractZip(address) ?? extractZip(c.text);
      // AppFolio companies manage properties across regions — keep target zips only
      if (!zipInTarget(zip)) continue;
      const price = parsePrice(detail('rent')) ?? parsePrice(c.text);
      if (!price) continue;
      const bedbath = detail('bed') ?? c.text;
      const externalId = c.url.match(/\/listings\/detail\/([\w-]+)/)?.[1] || `${subdomain}:${address}`;
      out.push({
        source: 'appfolio',
        externalId: `${subdomain}:${externalId}`,
        url: c.url || `https://${subdomain}.appfolio.com/listings`,
        title: `${address ?? 'Listing'} — ${label}`,
        address,
        city: resolveCity(zip, address, c.text),
        zip,
        price,
        beds: parseBeds(bedbath),
        baths: parseBaths(bedbath),
        sqft: parseSqft(detail('square') ?? c.text),
        availableDate: detail('available'),
        petFriendly: /dogs? & cats?|pets? (ok|allowed|welcome|considered)/i.test(c.text)
          ? true
          : /no pets/i.test(c.text) ? false : null,
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
}

export const appfolio: ScraperModule = {
  key: 'appfolio',
  name: 'AppFolio PMs',
  tier: 1,
  async fetchListings(ctx) {
    const all: NormalizedListing[] = [];
    for (const company of APPFOLIO_COMPANIES) {
      if (all.length >= ctx.cap) break;
      try {
        all.push(...(await scrapeCompany(ctx, company.subdomain, company.label)));
      } catch (e: any) {
        // one company failing must not sink the rest
        ctx.log(`appfolio/${company.subdomain} failed: ${e?.message ?? e}`);
      }
      await ctx.politeDelay();
    }
    return all.slice(0, ctx.cap);
  },
};
