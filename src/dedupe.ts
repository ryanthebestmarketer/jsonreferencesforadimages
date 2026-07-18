import { db } from './db/index.js';
import { normalizeAddress } from './lib/normalize.js';

/**
 * Cross-source dedup. Several of our sources syndicate the same inventory
 * (Zillow/HotPads share a backend; PMs post to Craigslist and aggregators),
 * so we flag — never merge — listings that look like the same unit:
 * same normalized address + same beds + price within $50.
 * Flagged listings share a dup_group id and get a badge in the UI.
 */
export function recomputeDuplicates(): void {
  const rows = db
    .prepare(`SELECT id, source, address, price, beds FROM listings WHERE is_active = 1 AND address IS NOT NULL AND price IS NOT NULL`)
    .all() as { id: number; source: string; address: string; price: number; beds: number | null }[];

  // bucket by normalized address + beds
  const buckets = new Map<string, typeof rows>();
  for (const r of rows) {
    const norm = normalizeAddress(r.address);
    if (norm.length < 8) continue; // too vague to match on
    const key = `${norm}|${r.beds ?? 'x'}`;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }

  const groups = new Map<number, string>(); // listing id -> group key
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    // within a bucket, cluster listings whose prices sit within $50 of each other
    const sorted = [...bucket].sort((a, b) => a.price - b.price);
    let cluster: typeof bucket = [];
    let clusterIdx = 0;
    const flush = () => {
      const distinctSources = new Set(cluster.map((c) => c.source));
      if (cluster.length >= 2 && distinctSources.size >= 2) {
        const gid = `${key}#${clusterIdx++}`;
        for (const c of cluster) groups.set(c.id, gid);
      }
      cluster = [];
    };
    for (const r of sorted) {
      if (cluster.length && r.price - cluster[cluster.length - 1].price > 50) flush();
      cluster.push(r);
    }
    flush();
  }

  const clear = db.prepare(`UPDATE listings SET dup_group = NULL WHERE dup_group IS NOT NULL`);
  const set = db.prepare(`UPDATE listings SET dup_group = ? WHERE id = ?`);
  db.transaction(() => {
    clear.run();
    for (const [id, gid] of groups) set.run(gid, id);
  })();

  if (groups.size) console.log(`[dedup] flagged ${groups.size} listings as possible duplicates`);
}
