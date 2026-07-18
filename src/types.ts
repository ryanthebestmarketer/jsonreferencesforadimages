/** A listing as returned by every scraper, before it hits the DB. */
export interface NormalizedListing {
  source: string;
  externalId: string;
  url: string;
  title: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  availableDate: string | null;
  petFriendly: boolean | null;
  photos: string[];
  lat: number | null;
  lng: number | null;
  raw: unknown;
}

export type SourceTier = 1 | 2;

export interface ScraperModule {
  /** Stable key used in the DB `source` column and the UI. */
  key: string;
  /** Human-readable name shown in the dashboard. */
  name: string;
  tier: SourceTier;
  fetchListings(ctx: ScrapeContext): Promise<NormalizedListing[]>;
}

import type { BrowserContext } from 'playwright';

export interface ScrapeContext {
  /** Fresh Playwright context with realistic UA/viewport. */
  browserContext: BrowserContext;
  /** Polite random delay (2-3s) — call between page loads. */
  politeDelay(): Promise<void>;
  /** Max listings this source may return; runner also enforces it. */
  cap: number;
  log(msg: string): void;
}

export type SourceRunStatus = 'ok' | 'empty' | 'blocked' | 'error' | 'login_required';

export interface ScrapeRunRow {
  id: number;
  source: string;
  started_at: string;
  finished_at: string | null;
  listing_count: number;
  status: SourceRunStatus | 'running';
  errors: string | null;
}

/** Thrown by scrapers when they positively detect bot-blocking. */
export class BlockedError extends Error {
  constructor(msg = 'blocked by bot protection') {
    super(msg);
    this.name = 'BlockedError';
  }
}

/** Thrown by scrapers when the source requires a login we don't have. */
export class LoginRequiredError extends Error {
  constructor(msg = 'login required') {
    super(msg);
    this.name = 'LoginRequiredError';
  }
}
