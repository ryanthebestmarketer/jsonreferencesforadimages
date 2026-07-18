export interface Listing {
  id: number;
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
  firstSeen: string;
  lastSeen: string;
  isActive: boolean;
  isFavorite: boolean;
  isHidden: boolean;
  dupGroup: string | null;
  isSample: boolean;
  isNew: boolean;
}

export interface SourceStatus {
  key: string;
  name: string;
  tier: 1 | 2;
  activeListings: number;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    status: string;
    count: number;
    errors: string | null;
  } | null;
}

export interface ScrapeProgress {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  geocoding: boolean;
  sources: Record<string, { status: string; count: number; error: string | null }>;
}

export interface StatusResponse {
  sources: SourceStatus[];
  totals: { active: number; newSinceLastScrape: number; favorites: number };
  scrape: ScrapeProgress;
  targetZips: string[];
}

export type ViewMode = 'grid' | 'map';
export type SortKey = 'price_asc' | 'price_desc' | 'newest' | 'sqft';

export interface Filters {
  priceMin: number;
  priceMax: number;
  beds: 'any' | 0 | 1 | 2 | 3; // 3 = 3+
  bathsMin: 'any' | 1 | 1.5 | 2;
  cities: string[];
  petFriendly: boolean;
  sources: string[];
  newOnly: boolean;
  activeOnly: boolean;
  hideDuplicates: boolean;
  showHidden: boolean;
  favoritesOnly: boolean;
  search: string;
}

export const PRICE_CEIL = 4000;

export const defaultFilters: Filters = {
  priceMin: 0,
  priceMax: PRICE_CEIL,
  beds: 'any',
  bathsMin: 'any',
  cities: [],
  petFriendly: false,
  sources: [],
  newOnly: false,
  activeOnly: true,
  hideDuplicates: false,
  showHidden: false,
  favoritesOnly: false,
  search: '',
};
