/**
 * CLI scrape: `npm run scrape` (all sources) or `npm run scrape -- craigslist zillow`.
 */
import { triggerScrape, waitForRun, progress } from '../scrape/runner.js';
import { SCRAPERS } from '../scrapers/index.js';

const keys = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const bad = keys.filter((k) => !SCRAPERS.some((s) => s.key === k));
if (bad.length) {
  console.error(`Unknown source(s): ${bad.join(', ')}\nAvailable: ${SCRAPERS.map((s) => s.key).join(', ')}`);
  process.exit(1);
}

const result = triggerScrape(keys.length ? keys : undefined);
if (!result.started) {
  console.error(`Could not start: ${result.reason}`);
  process.exit(1);
}

await waitForRun();
console.log('\nRun summary:');
for (const [key, p] of Object.entries(progress.sources)) {
  console.log(`  ${key.padEnd(16)} ${p.status.padEnd(15)} ${p.count} listings${p.error ? `  (${p.error})` : ''}`);
}
process.exit(0);
