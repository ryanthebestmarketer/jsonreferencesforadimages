import type { NormalizedListing, ScraperModule, ScrapeContext } from '../types.js';
import { BUILDIUM_COMPANIES } from '../config/sources.config.js';
import { politeGoto } from '../lib/browser.js';
import { extractZip, parseBaths, parseBeds, parsePrice, parseSqft, resolveCity, zipInTarget } from '../lib/normalize.js';

/**
 * Generic Buildium scraper. Buildium-hosted PM sites expose public rentals at
 * https://{subdomain}.managebuilding.com/Resident/public/rentals — a list of
 * cards each linking to /Resident/public/rentals/{id}. We anchor on those
 * links (stable across themes) and regex the card text for the details.
 * Add companies in sources.config.ts.
 */
async function scrapeCompany(ctx: ScrapeContext, subdomain: string, label: string): Promise<NormalizedListing[]> {
  const page = await ctx.browserContext.newPage();
  const out: NormalizedListing[] = [];
  try {
    await politeGoto(page, `https://${subdomain}.managebuilding.com/Resident/public/rentals`);
    await page.waitForSelector('a[href*="/Resident/public/rentals/"]', { timeout: 15000 }).catch(() => {});

    const cards = await page.evaluate(() => {
      const results: any[] = [];
      const anchors = Array.from(document.querySelectorAll('a[href*="/Resident/public/rentals/"]')) as HTMLAnchorElement[];
      const seen = new Set<string>();
      for (const a of anchors) {
        const idMatch = a.href.match(/\/Resident\/public\/rentals\/(\d+)/i);
        if (!idMatch || seen.has(idMatch[1])) continue;
        seen.add(idMatch[1]);
        // walk up to the card container (the nearest ancestor with a decent text block)
        let card: Element = a;
        for (let i = 0; i < 5 && card.parentElement; i++) {
          card = card.parentElement;
          if ((card.textContent || '').length > 80) break;
        }
        const img = card.querySelector('img') as HTMLImageElement | null;
        results.push({
          id: idMatch[1],
          url: a.href,
          title: (card.querySelector('h1,h2,h3,h4,.unit-title,[class*="title"]')?.textContent || a.textContent || '').replace(/\s+/g, ' ').trim(),
          text: (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 800),
          img: img?.src || null,
        });
      }
      return results;
    });

    ctx.log(`buildium/${subdomain}: ${cards.length} raw cards`);

    for (const c of cards) {
      const zip = extractZip(c.text);
      if (!zipInTarget(zip)) continue;
      const price = parsePrice(c.text);
      if (!price) continue;
      // address is usually the leading chunk of the title/text before a dash or price
      const address = (c.title.split(/ [-–|] /)[0] || c.title).replace(/\$.*$/, '').trim() || null;
      out.push({
        source: 'buildium',
        externalId: `${subdomain}:${c.id}`,
        url: c.url,
        title: `${c.title || address || 'Listing'} — ${label}`,
        address,
        city: resolveCity(zip, c.text),
        zip,
        price,
        beds: parseBeds(c.text),
        baths: parseBaths(c.text),
        sqft: parseSqft(c.text),
        availableDate: c.text.match(/available\s*:?\s*([\w/ ,]+?)(?:\s{2,}|$)/i)?.[1]?.trim() ?? null,
        petFriendly: /pets? (ok|allowed|welcome|considered)/i.test(c.text) ? true : /no pets/i.test(c.text) ? false : null,
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

export const buildium: ScraperModule = {
  key: 'buildium',
  name: 'Buildium PMs',
  tier: 1,
  async fetchListings(ctx) {
    const all: NormalizedListing[] = [];
    for (const company of BUILDIUM_COMPANIES) {
      if (all.length >= ctx.cap) break;
      try {
        all.push(...(await scrapeCompany(ctx, company.subdomain, company.label)));
      } catch (e: any) {
        ctx.log(`buildium/${company.subdomain} failed: ${e?.message ?? e}`);
      }
      await ctx.politeDelay();
    }
    return all.slice(0, ctx.cap);
  },
};
