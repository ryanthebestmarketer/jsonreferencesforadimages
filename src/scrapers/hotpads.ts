import type { ScraperModule } from '../types.js';
import { pick } from '../lib/browser.js';
import { genericMap, runTier2 } from './tier2common.js';

/** HotPads — rentals-only site (Zillow group). Reads preloaded redux state. */
export const hotpads: ScraperModule = {
  key: 'hotpads',
  name: 'HotPads',
  tier: 2,
  fetchListings(ctx) {
    return runTier2(ctx, {
      source: 'hotpads',
      urls: [
        'https://hotpads.com/virginia-beach-va/apartments-for-rent',
        'https://hotpads.com/norfolk-va/apartments-for-rent',
      ],
      map(o) {
        const type = String(pick(o, 'listingType', 'propertyType') ?? '').toLowerCase();
        if (type.includes('sale')) return null;
        return genericMap('hotpads', o, 'https://hotpads.com', {
          idKeys: ['alias', 'maloneLotIdEncoded', 'listingId', 'id'],
        });
      },
    });
  },
};
