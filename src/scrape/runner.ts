import { SCRAPERS, getScraper } from '../scrapers/index.js';
import { BlockedError, LoginRequiredError, type NormalizedListing, type SourceRunStatus } from '../types.js';
import { closeBrowser, newContext, politeDelay } from '../lib/browser.js';
import { deactivateUnseen, finishRun, startRun, upsertListings, countRealListings } from '../db/index.js';
import { PER_SOURCE_CAP } from '../config/sources.config.js';
import { recomputeDuplicates } from '../dedupe.js';
import { geocodePending } from '../geocode.js';
import { seedSampleListingsIfEmpty } from '../seed.js';

export type SourceProgressStatus = 'pending' | 'running' | 'ok' | 'empty' | 'blocked' | 'error' | 'login_required';

export interface ScrapeProgress {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  geocoding: boolean;
  sources: Record<string, { status: SourceProgressStatus; count: number; error: string | null }>;
}

/** In-memory live progress, polled by the UI while a scrape runs. */
export const progress: ScrapeProgress = {
  running: false,
  startedAt: null,
  finishedAt: null,
  geocoding: false,
  sources: {},
};

let runPromise: Promise<void> | null = null;

/** Kick off a scrape (all sources, or a subset). No-op if one is running. */
export function triggerScrape(sourceKeys?: string[]): { started: boolean; reason?: string } {
  if (progress.running) return { started: false, reason: 'a scrape is already running' };
  const scrapers = sourceKeys?.length
    ? sourceKeys.map((k) => getScraper(k)).filter((s): s is NonNullable<typeof s> => !!s)
    : SCRAPERS;
  if (!scrapers.length) return { started: false, reason: 'no matching sources' };

  progress.running = true;
  progress.startedAt = new Date().toISOString();
  progress.finishedAt = null;
  progress.sources = {};
  for (const s of scrapers) progress.sources[s.key] = { status: 'pending', count: 0, error: null };

  runPromise = runScrape(scrapers.map((s) => s.key)).catch((e) => {
    console.error('[scrape] run crashed unexpectedly:', e);
  }).finally(() => {
    progress.running = false;
    progress.finishedAt = new Date().toISOString();
  });
  return { started: true };
}

export function waitForRun(): Promise<void> {
  return runPromise ?? Promise.resolve();
}

async function runScrape(sourceKeys: string[]): Promise<void> {
  console.log(`[scrape] starting run for: ${sourceKeys.join(', ')}`);
  const fullRun = sourceKeys.length === SCRAPERS.length;

  for (const key of sourceKeys) {
    const scraper = getScraper(key)!;
    const p = progress.sources[key];
    p.status = 'running';
    const { id: runId, startedAt } = startRun(key);
    const errors: string[] = [];
    let listings: NormalizedListing[] = [];
    let status: SourceRunStatus = 'ok';

    // Never retry more than twice (2 attempts total), and never let a source crash the run.
    const maxAttempts = scraper.tier === 2 ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let ctxHandle: Awaited<ReturnType<typeof newContext>> | null = null;
      try {
        ctxHandle = await newContext();
        listings = await scraper.fetchListings({
          browserContext: ctxHandle,
          politeDelay,
          cap: PER_SOURCE_CAP,
          log: (m) => console.log(`[scrape] ${m}`),
        });
        status = 'ok';
        break;
      } catch (e: any) {
        if (e instanceof LoginRequiredError) {
          status = 'login_required';
          errors.push(e.message);
          break; // no point retrying a login wall
        }
        if (e instanceof BlockedError) {
          status = 'blocked';
          errors.push(`attempt ${attempt}: ${e.message}`);
        } else {
          status = 'error';
          errors.push(`attempt ${attempt}: ${e?.message ?? String(e)}`.slice(0, 300));
        }
        if (attempt < maxAttempts) await politeDelay();
      } finally {
        await ctxHandle?.close().catch(() => {});
      }
    }

    listings = listings.slice(0, PER_SOURCE_CAP);
    if (status === 'ok' && listings.length === 0) status = 'empty';

    try {
      if (listings.length) upsertListings(listings);
      // Only deactivate unseen listings when the source actually succeeded —
      // a blocked/errored run must not wipe a source's inventory.
      if (status === 'ok') {
        const deactivated = deactivateUnseen(key, startedAt);
        if (deactivated) console.log(`[scrape] ${key}: deactivated ${deactivated} stale listings`);
      }
    } catch (e: any) {
      status = 'error';
      errors.push(`db: ${e?.message ?? e}`);
    }

    finishRun(runId, status, listings.length, errors);
    p.status = status;
    p.count = listings.length;
    p.error = errors.length ? errors[errors.length - 1] : null;
    console.log(`[scrape] ${key}: ${status} (${listings.length} listings)${errors.length ? ` — ${errors[0]}` : ''}`);

    await politeDelay(); // breathe between sources
  }

  await closeBrowser();

  // Seed samples only on a full run where every scraper came back empty
  if (fullRun && countRealListings() === 0) {
    seedSampleListingsIfEmpty();
  }

  try {
    recomputeDuplicates();
  } catch (e) {
    console.error('[scrape] dedup failed:', e);
  }

  progress.geocoding = true;
  try {
    await geocodePending();
  } catch (e) {
    console.error('[scrape] geocoding failed:', e);
  } finally {
    progress.geocoding = false;
  }

  console.log('[scrape] run complete');
}
