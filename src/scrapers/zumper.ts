import type { ScraperModule } from '../types.js';
import { genericMap, runTier2 } from './tier2common.js';
import { pick } from '../lib/browser.js';

/** Zumper — rentals only by nature of the /apartments-for-rent/ URLs. */
export const zumper: ScraperModule = {
  key: 'zumper',
  name: 'Zumper',
  tier: 2,
  fetchListings(ctx) {
    return runTier2(ctx, {
      source: 'zumper',
      urls: [
        'https://www.zumper.com/apartments-for-rent/virginia-beach-va',
        'https://www.zumper.com/apartments-for-rent/norfolk-va',
      ],
      map(o) {
        // Zumper state mixes buildings and listables; both are rentals.
        if (String(pick(o, 'listingType', 'listing_type') ?? '').toLowerCase().includes('sale')) return null;
        return genericMap('zumper', o, 'https://www.zumper.com', {
          idKeys: ['listing_id', 'listingId', 'id', 'building_id'],
        });
      },
    });
  },
};
