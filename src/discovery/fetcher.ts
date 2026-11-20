import { fetch } from 'undici';
import type { RateLimiter } from './rateLimiter';
import type { Fetcher } from './types';

export interface CreateFetcherOptions {
  rateLimiter: RateLimiter;
  userAgent?: string;
}

export function createFetcher({ rateLimiter, userAgent }: CreateFetcherOptions): Fetcher {
  const ua = userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  async function request(
    url: string,
    opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<{ url: string; text: string; status: number }> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    const host = u.hostname;
    await rateLimiter.acquire(host);
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'User-Agent': ua,
        Accept: 'application/json, text/html, application/rss+xml, */*',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
        ...(opts.headers ?? {}),
      },
      body: opts.body,
    });
    const text = await res.text();
    return { url: res.url, text, status: res.status };
  }

  return {
    async fetchText(url, opts = {}) {
      return request(url, opts);
    },
    async fetchJson<T = unknown>(
      url: string,
      opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
    ) {
      const { text, status } = await request(url, opts);
      try {
        return { url, data: JSON.parse(text) as T, status };
      } catch (e) {
        throw new Error(
          `Failed to parse JSON from ${url}: ${e instanceof Error ? e.message : String(e)}`,
          { cause: e },
        );
      }
    },
  };
}
