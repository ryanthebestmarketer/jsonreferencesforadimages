import type { ScraperModule } from '../types.js';
import { craigslist } from './craigslist.js';
import { appfolio } from './appfolio.js';
import { buildium } from './buildium.js';
import { dwellsy } from './dwellsy.js';
import { ahrn } from './ahrn.js';
import { zillow } from './zillow.js';
import { apartmentsCom } from './apartments.js';
import { zumper } from './zumper.js';
import { realtor } from './realtor.js';
import { hotpads } from './hotpads.js';

/** All sources, run sequentially in this order (Tier 1 first). */
export const SCRAPERS: ScraperModule[] = [
  craigslist,
  appfolio,
  buildium,
  dwellsy,
  ahrn,
  zillow,
  apartmentsCom,
  zumper,
  realtor,
  hotpads,
];

export function getScraper(key: string): ScraperModule | undefined {
  return SCRAPERS.find((s) => s.key === key);
}
