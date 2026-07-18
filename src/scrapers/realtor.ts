import type { ScraperModule } from '../types.js';
import { pick } from '../lib/browser.js';
import { genericMap, runTier2 } from './tier2common.js';

/**
 * Realtor.com rentals. RENTALS ONLY — /apartments/ search URLs, plus a status
 * guard so for-sale objects in shared app state are rejected.
 */
export const realtor: ScraperModule = {
  key: 'realtor',
  name: 'Realtor.com',
  tier: 2,
  fetchListings(ctx) {
    return runTier2(ctx, {
      source: 'realtor',
      urls: [
        'https://www.realtor.com/apartments/Virginia-Beach_VA',
        'https://www.realtor.com/apartments/Norfolk_VA',
      ],
      map(o) {
        const status = String(pick(o, 'status', 'prop_status', 'listing_status') ?? '').toLowerCase();
        if (status.includes('sale') || status.includes('sold')) return null;
        if (status && !status.includes('rent') && status !== 'active') return null;
        return genericMap('realtor', o, 'https://www.realtor.com', {
          idKeys: ['property_id', 'listing_id', 'id'],
        });
      },
    });
  },
};
