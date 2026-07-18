import { db, countRealListings } from './db/index.js';

/**
 * Seed 12 realistic sample listings (clearly badged SAMPLE in the UI) so the
 * dashboard is never empty and every filter can be exercised. Only runs when
 * a full scrape produced zero real listings and no samples exist yet.
 */
export function seedSampleListingsIfEmpty(): void {
  if (countRealListings() > 0) return;
  const existing = db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE is_sample = 1`).get() as { c: number };
  if (existing.c > 0) return;

  console.log('[seed] all scrapers returned zero — seeding 12 sample listings');
  const now = new Date().toISOString();
  const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

  const samples = [
    { title: 'Oceanfront 2BR near the Boardwalk', address: '2105 Atlantic Ave', city: 'Virginia Beach', zip: '23451', price: 1895, beds: 2, baths: 2, sqft: 1050, pet: true,  lat: 36.8622, lng: -75.9779, avail: '2026-08-01', first: daysAgo(1) },
    { title: 'Cozy 1BR steps from Chick’s Beach', address: '4520 Lookout Rd', city: 'Virginia Beach', zip: '23455', price: 1350, beds: 1, baths: 1, sqft: 720,  pet: true,  lat: 36.9130, lng: -76.1000, avail: '2026-08-15', first: daysAgo(3) },
    { title: 'Renovated studio in the ViBe District', address: '512 Virginia Beach Blvd', city: 'Virginia Beach', zip: '23451', price: 1150, beds: 0, baths: 1, sqft: 480, pet: false, lat: 36.8508, lng: -75.9855, avail: '2026-07-25', first: daysAgo(0) },
    { title: 'Spacious 3BR house w/ fenced yard, Kempsville', address: '905 Kempsville Rd', city: 'Virginia Beach', zip: '23464', price: 2250, beds: 3, baths: 2.5, sqft: 1680, pet: true, lat: 36.7987, lng: -76.1735, avail: '2026-09-01', first: daysAgo(6) },
    { title: 'Town Center high-rise 2BR, pool + gym', address: '4545 Commerce St', city: 'Virginia Beach', zip: '23462', price: 2100, beds: 2, baths: 2, sqft: 1180, pet: true, lat: 36.8410, lng: -76.1350, avail: '2026-08-01', first: daysAgo(10) },
    { title: 'Great Neck 2BR townhouse, garage', address: '1320 N Great Neck Rd', city: 'Virginia Beach', zip: '23454', price: 1750, beds: 2, baths: 1.5, sqft: 1100, pet: null, lat: 36.8760, lng: -76.0330, avail: '2026-08-10', first: daysAgo(2) },
    { title: 'Ocean View bungalow, walk to the bay', address: '9510 4th View St', city: 'Ocean View', zip: '23503', price: 1495, beds: 2, baths: 1, sqft: 900, pet: true, lat: 36.9560, lng: -76.2510, avail: '2026-07-20', first: daysAgo(1) },
    { title: 'East Ocean View 1BR, beach block', address: '2314 E Ocean View Ave', city: 'Ocean View', zip: '23518', price: 1195, beds: 1, baths: 1, sqft: 650, pet: false, lat: 36.9280, lng: -76.1830, avail: '2026-08-01', first: daysAgo(8) },
    { title: 'Ghent charmer 1BR, hardwood floors', address: '811 Colonial Ave', city: 'Norfolk', zip: '23505', price: 1275, beds: 1, baths: 1, sqft: 780, pet: true, lat: 36.8680, lng: -76.2990, avail: '2026-08-15', first: daysAgo(4) },
    { title: 'Wards Corner 2BR near Navy base', address: '7620 Granby St', city: 'Norfolk', zip: '23505', price: 1400, beds: 2, baths: 1, sqft: 950, pet: null, lat: 36.9230, lng: -76.2450, avail: '2026-07-28', first: daysAgo(12) },
    { title: 'Renovated 3BR ranch, Norview', address: '3210 Norview Ave', city: 'Norfolk', zip: '23513', price: 1795, beds: 3, baths: 2, sqft: 1350, pet: true, lat: 36.8890, lng: -76.2210, avail: '2026-09-01', first: daysAgo(5) },
    { title: 'Budget studio near ODU', address: '1425 W 49th St', city: 'Norfolk', zip: '23509', price: 895, beds: 0, baths: 1, sqft: 420, pet: false, lat: 36.8850, lng: -76.2650, avail: '2026-08-01', first: daysAgo(0) },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO listings (source, external_id, url, title, address, city, zip, price, beds, baths,
      sqft, available_date, pet_friendly, photos, lat, lng, first_seen, last_seen, is_active, is_sample, raw_json)
    VALUES ('sample', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
  `);
  db.transaction(() => {
    samples.forEach((s, i) => {
      stmt.run(
        `sample-${i + 1}`,
        'https://example.com/sample-listing',
        s.title, s.address, s.city, s.zip, s.price, s.beds, s.baths, s.sqft,
        s.avail, s.pet === null ? null : s.pet ? 1 : 0,
        JSON.stringify([`https://picsum.photos/seed/apt${i + 1}/640/420`]),
        s.lat, s.lng, s.first, now,
        JSON.stringify({ sample: true }),
      );
    });
  })();
}
