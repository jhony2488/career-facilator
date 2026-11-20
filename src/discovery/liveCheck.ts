import type { Fetcher } from './types';

export async function isJobLive(fetcher: Fetcher, url: string): Promise<boolean> {
  try {
    const { status } = await fetcher.fetchText(url, { method: 'HEAD' });
    return status >= 200 && status < 400;
  } catch {
    return false;
  }
}
