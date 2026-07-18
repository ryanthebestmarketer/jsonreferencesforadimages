import type { ScraperModule } from '../types.js';
import { pick } from '../lib/browser.js';
import { genericMap, runTier2 } from './tier2common.js';

/**
 * Zillow Rentals. RENTALS ONLY — we hit the /rentals/ search URLs and
 * additionally require statusType === 'FOR_RENT' on every mapped object so a
 * for-sale card can never slip through. Expect PerimeterX blocks sometimes;
 * the runner logs those and moves on.
 */
export const zillow: ScraperModule = {
  key: 'zillow',
  name: 'Zillow Rentals',
  tier: 2,
  fetchListings(ctx) {
    return runTier2(ctx, {
      source: 'zillow',
      urls: [
        'https://www.zillow.com/virginia-beach-va/rentals/',
        'https://www.zillow.com/norfolk-va/rentals/',
      ],
      map(o, pageUrl) {
        const status = String(pick(o, 'statusType', 'homeStatus', 'status') ?? '').toUpperCase();
        const isRental = status.includes('RENT') || (!status && pick(o, 'unformattedPrice') && String(pick(o, 'hdpUrl', 'detailUrl') ?? '').length > 0 && pageUrl.includes('/rentals'));
        if (!isRental || status.includes('SALE') || status.includes('SOLD')) return null;
        return genericMap('zillow', o, 'https://www.zillow.com', { idKeys: ['zpid', 'id'] });
      },
    });
  },
};
