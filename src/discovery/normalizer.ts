import { matchTargetTitle } from '../core/titleMatcher';
import type { DiscoveryJob, NormalizedJob } from './types';

export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const params = new URLSearchParams();
    const tracking = /^(utm_|fbclid|gclid|ref$|ref_|tracking|source$|mc_|cmp)/i;
    for (const [k, v] of u.searchParams) {
      if (!tracking.test(k)) params.append(k, v);
    }
    u.search = params.toString();
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

export function matchesTargetTitles(title: string, targets: string[]): boolean {
  if (!targets.length) return true;
  return matchTargetTitle(title, targets) !== null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function rawJobFromNormalized(
  n: NormalizedJob,
  sourceName: string,
  sourceId: string,
): DiscoveryJob {
  const body = n.descriptionHtml
    ? n.descriptionHtml
    : `<p>${escapeHtml(n.descriptionMarkdown ?? '')}</p>`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(n.title ?? '')}</title>
</head>
<body>
  <h1>${escapeHtml(n.title ?? '')}</h1>
  ${n.company ? `<p><strong>Company:</strong> ${escapeHtml(n.company)}</p>` : ''}
  ${n.location ? `<p><strong>Location:</strong> ${escapeHtml(n.location)}</p>` : ''}
  ${n.salaryRange ? `<p><strong>Salary:</strong> ${escapeHtml(n.salaryRange)}</p>` : ''}
  ${body}
</body>
</html>`;
  return {
    raw: { url: canonicalizeUrl(n.url), html },
    sourceId,
    sourceName,
    discoveredAt: new Date().toISOString(),
  };
}

export function dedupKey(job: DiscoveryJob): string {
  try {
    const u = new URL(job.raw.url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return job.raw.url;
  }
}
