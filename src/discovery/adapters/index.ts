import type { SourceAdapter } from '../types';
import { apiAdapter } from './apiAdapter';
import { rssAdapter } from './rssAdapter';
import { atsAdapter } from './atsAdapter';
import { htmlAdapter } from './htmlAdapter';
import { searchAdapter } from './searchAdapter';
import { linkedinAdapter } from './linkedinAdapter';

export const ADAPTERS: Record<string, SourceAdapter> = {
  api: apiAdapter,
  rss: rssAdapter,
  ats: atsAdapter,
  html: htmlAdapter,
  search: searchAdapter,
  linkedin: linkedinAdapter,
};

export function getAdapter(adapter: string): SourceAdapter | undefined {
  return ADAPTERS[adapter];
}
