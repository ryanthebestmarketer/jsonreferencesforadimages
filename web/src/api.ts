import type { Listing, ScrapeProgress, StatusResponse } from './types';

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}

export const api = {
  listings: () => fetch('/api/listings').then((r) => json<{ listings: Listing[] }>(r)),
  status: () => fetch('/api/status').then((r) => json<StatusResponse>(r)),
  progress: () => fetch('/api/scrape/progress').then((r) => json<ScrapeProgress>(r)),
  scrape: (source?: string) =>
    fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source ? { source } : {}),
    }),
  favorite: (id: number, value: boolean) =>
    fetch(`/api/listings/${id}/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
  hide: (id: number, value: boolean) =>
    fetch(`/api/listings/${id}/hide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
};
