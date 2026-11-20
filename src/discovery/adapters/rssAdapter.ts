import type { SourceAdapter, SourceAdapterContext, DiscoveryResult, DiscoveryJob } from '../types';
import { rawJobFromNormalized, matchesTargetTitles } from '../normalizer';

export const rssAdapter: SourceAdapter = {
  name: 'rss',
  async discover(ctx: SourceAdapterContext): Promise<DiscoveryResult> {
    const { source, fetcher, config, maxJobs } = ctx;
    const start = Date.now();
    try {
      const res = await fetcher.fetchText(source.url!);
      if (res.status !== 200) throw new Error(`${source.name} returned ${res.status}`);
      const items = parseRssItems(res.text);
      const out: DiscoveryJob[] = [];
      for (const item of items) {
        if (!matchesTargetTitles(item.title, config.discovery.targetTitles)) continue;
        out.push(
          rawJobFromNormalized(
            {
              url: item.link,
              title: item.title,
              company: '',
              location: '',
              descriptionHtml: item.description,
              postedAt: item.pubDate,
            },
            source.name,
            source.id,
          ),
        );
        if (out.length >= maxJobs) break;
      }
      return {
        jobs: out,
        errors: [],
        meta: {
          sourcesTried: 1,
          sourcesSucceeded: 1,
          totalRaw: items.length,
          afterDedup: out.length,
          afterFilters: out.length,
          durationMs: Date.now() - start,
        },
      };
    } catch (e) {
      return {
        jobs: [],
        errors: [
          {
            sourceId: source.id,
            phase: 'parse',
            message: e instanceof Error ? e.message : String(e),
          },
        ],
        meta: {
          sourcesTried: 1,
          sourcesSucceeded: 0,
          totalRaw: 0,
          afterDedup: 0,
          afterFilters: 0,
          durationMs: Date.now() - start,
        },
      };
    }
  },
};

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
}

function getTag(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = text.match(regex);
  return m ? decodeEntities(stripCdata(m[1]).trim()) : '';
}

function stripCdata(text: string): string {
  return text.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const chunks = xml.split(/<item[^>]*>/i).slice(1);
  for (const chunk of chunks) {
    const [body] = chunk.split(/<\/item>/i);
    if (!body) continue;
    const title = getTag(body, 'title');
    const link = getTag(body, 'link');
    const description = getTag(body, 'description');
    const pubDate = getTag(body, 'pubDate') || getTag(body, 'pubdate');
    if (title && link) {
      items.push({ title, link, description, pubDate });
    }
  }
  return items;
}
