import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import { DELAY_RANGE_MS, USER_AGENT, VIEWPORT } from '../config/sources.config.js';
import { BlockedError } from '../types.js';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  const opts = { headless: true, args: ['--disable-blink-features=AutomationControlled'] };
  try {
    browser = await chromium.launch(opts);
  } catch (err) {
    // Fall back to a preinstalled Chromium (e.g. managed environments) if the
    // Playwright-managed download is missing.
    const fallbacks = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium'].filter(
      (p): p is string => !!p && fs.existsSync(p)
    );
    if (!fallbacks.length) throw err;
    browser = await chromium.launch({ ...opts, executablePath: fallbacks[0] });
  }
  return browser;
}

export async function newContext(): Promise<BrowserContext> {
  const b = await getBrowser();
  return b.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORT,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

export function politeDelay(): Promise<void> {
  const [min, max] = DELAY_RANGE_MS;
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

/** Navigate with a sane timeout; throws BlockedError on obvious bot walls. */
export async function politeGoto(page: Page, url: string): Promise<void> {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (resp && [403, 429, 503].includes(resp.status())) {
    throw new BlockedError(`HTTP ${resp.status()} at ${url}`);
  }
  await checkForBotWall(page);
}

const BLOCK_SIGNALS = [
  'px-captcha', 'perimeterx', 'press & hold', 'press and hold',
  'are you a human', 'verify you are a human', 'captcha',
  'access to this page has been denied', 'pardon our interruption',
  'request blocked', 'unusual activity', 'cf-challenge', 'attention required',
];

export async function checkForBotWall(page: Page): Promise<void> {
  try {
    const title = (await page.title()).toLowerCase();
    if (BLOCK_SIGNALS.some((s) => title.includes(s)) || title.includes('denied')) {
      throw new BlockedError(`bot wall detected (title: "${title}")`);
    }
    const bodyStart = ((await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')) || '')
      .slice(0, 800)
      .toLowerCase();
    if (BLOCK_SIGNALS.some((s) => bodyStart.includes(s))) {
      throw new BlockedError('bot wall detected in page body');
    }
  } catch (e) {
    if (e instanceof BlockedError) throw e;
    // page context died etc. — let the caller's normal error handling deal with it
  }
}

/**
 * Pull big JSON blobs embedded in the page (__NEXT_DATA__, preloaded redux
 * state, ld+json, etc.). Returns parsed objects, best-effort.
 */
export async function extractEmbeddedJson(page: Page): Promise<unknown[]> {
  const blobs = await page.evaluate(() => {
    const out: string[] = [];
    const next = document.getElementById('__NEXT_DATA__');
    if (next?.textContent) out.push(next.textContent);
    for (const s of Array.from(document.querySelectorAll('script[type="application/json"]'))) {
      if (s.textContent && s.textContent.length > 500) out.push(s.textContent);
    }
    for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      if (s.textContent) out.push(s.textContent);
    }
    // window.__PRELOADED_STATE__ / __INITIAL_DATA__ style globals
    for (const key of ['__PRELOADED_STATE__', '__INITIAL_DATA__', '__INITIAL_STATE__', '__REDUX_STATE__']) {
      const v = (window as any)[key];
      if (v) {
        try { out.push(JSON.stringify(v)); } catch { /* circular */ }
      }
    }
    return out;
  }).catch(() => [] as string[]);

  const parsed: unknown[] = [];
  for (const b of blobs) {
    try { parsed.push(JSON.parse(b)); } catch { /* skip */ }
  }
  return parsed;
}

/**
 * Deep-scan arbitrary JSON for "listing-shaped" objects: anything with a
 * price/rent-ish field AND a beds-ish field. Used against embedded app state
 * on Next.js/redux sites so we don't depend on fragile DOM class names.
 */
export function findListingObjects(root: unknown, maxDepth = 12): Record<string, any>[] {
  const found: Record<string, any>[] = [];
  const seen = new Set<unknown>();
  const priceKeys = ['price', 'rent', 'minPrice', 'min_price', 'unformattedPrice', 'list_price', 'listPrice', 'priceMin'];
  const bedKeys = ['beds', 'bedrooms', 'bed', 'minBeds', 'beds_min', 'numBedrooms'];

  function walk(node: unknown, depth: number): void {
    if (depth > maxDepth || node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, any>;
    const keys = Object.keys(obj);
    const hasPrice = priceKeys.some((k) => keys.includes(k) && obj[k] != null);
    const hasBeds = bedKeys.some((k) => keys.includes(k) && obj[k] != null);
    if (hasPrice && hasBeds) found.push(obj);
    for (const k of keys) walk(obj[k], depth + 1);
  }

  walk(root, 0);
  return found;
}

/** Pick the first non-null value among candidate keys (supports dotted paths). */
export function pick(obj: Record<string, any>, ...paths: string[]): any {
  for (const p of paths) {
    let v: any = obj;
    for (const part of p.split('.')) {
      v = v?.[part];
      if (v == null) break;
    }
    if (v != null && v !== '') return v;
  }
  return null;
}
