import { TARGET_AREAS, TARGET_ZIPS } from '../config/sources.config.js';

/** Normalize a street address for dedup + geocode caching. */
export function normalizeAddress(address: string): string {
  let a = address.toLowerCase().trim();
  // drop unit/apt designators
  a = a.replace(/\b(apt|apartment|unit|ste|suite|#)\s*\.?\s*[\w-]+/g, ' ');
  // canonicalize common suffixes/directions
  const subs: [RegExp, string][] = [
    [/\bstreet\b/g, 'st'], [/\bavenue\b/g, 'ave'], [/\bboulevard\b/g, 'blvd'],
    [/\bdrive\b/g, 'dr'], [/\broad\b/g, 'rd'], [/\blane\b/g, 'ln'],
    [/\bcourt\b/g, 'ct'], [/\bcircle\b/g, 'cir'], [/\bplace\b/g, 'pl'],
    [/\bterrace\b/g, 'ter'], [/\bhighway\b/g, 'hwy'], [/\bparkway\b/g, 'pkwy'],
    [/\bnorth\b/g, 'n'], [/\bsouth\b/g, 's'], [/\beast\b/g, 'e'], [/\bwest\b/g, 'w'],
    [/\bvirginia beach\b/g, 'vb'], [/\bnorfolk\b/g, 'nf'], [/\bvirginia\b/g, 'va'],
  ];
  for (const [re, to] of subs) a = a.replace(re, to);
  a = a.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return a;
}

/** "$1,450/mo" -> 1450. Returns null for junk or suspicious values. */
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).replace(/,/g, '').match(/\$?\s*(\d{3,5})(?:\.\d+)?/);
  if (!m) return null;
  const p = parseInt(m[1], 10);
  return p >= 200 && p <= 20000 ? p : null;
}

/** "2 bd" / "2 Beds" / "Studio" -> number of beds. */
export function parseBeds(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/\bstudio\b/.test(t)) return 0;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:br|bd|bed)/);
  return m ? parseFloat(m[1]) : null;
}

export function parseBaths(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).toLowerCase().match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/);
  return m ? parseFloat(m[1]) : null;
}

export function parseSqft(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).replace(/,/g, '').match(/(\d{3,5})\s*(?:sq\s*\.?\s*ft|sqft|ft²)/i);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 100 && v <= 20000 ? v : null;
}

/** Extract a 5-digit zip from arbitrary text (prefers 23xxx Hampton Roads zips). */
export function extractZip(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = String(text).match(/\b(23\d{3})\b/);
  if (m) return m[1];
  const any = String(text).match(/\b(\d{5})\b/);
  return any ? any[1] : null;
}

export function zipInTarget(zip: string | null): boolean {
  return zip !== null && TARGET_ZIPS.includes(zip);
}

/** Best-effort city classification from free text (hood, address, city field). */
export function classifyCity(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (t.includes('ocean view') || t.includes('oceanview')) return 'Ocean View';
  if (t.includes('virginia beach') || /\bva beach\b/.test(t) || /\bvb\b/.test(t)) return 'Virginia Beach';
  if (t.includes('norfolk')) return 'Norfolk';
  return null;
}

/**
 * Does this listing belong in our target area? True if the zip matches, or —
 * when no zip is available — if the city/neighborhood text matches a target area.
 */
export function inTargetArea(zip: string | null, ...texts: (string | null | undefined)[]): boolean {
  if (zip) return zipInTarget(zip);
  const blob = texts.filter(Boolean).join(' ').toLowerCase();
  return TARGET_AREAS.some((a) => blob.includes(a));
}

/** Ocean View zips are inside Norfolk; refine city from zip when we can. */
const OCEAN_VIEW_ZIPS = new Set(['23503', '23518']);
const NORFOLK_ZIPS = new Set(['23505', '23509', '23513']);
const VB_ZIPS = new Set(['23451', '23452', '23454', '23455', '23456', '23462', '23464']);

export function cityFromZip(zip: string | null): string | null {
  if (!zip) return null;
  if (OCEAN_VIEW_ZIPS.has(zip)) return 'Ocean View';
  if (NORFOLK_ZIPS.has(zip)) return 'Norfolk';
  if (VB_ZIPS.has(zip)) return 'Virginia Beach';
  return null;
}

/** Resolve the best city label we can from zip + free text. */
export function resolveCity(zip: string | null, ...texts: (string | null | undefined)[]): string | null {
  return cityFromZip(zip) ?? classifyCity(texts.filter(Boolean).join(' '));
}
