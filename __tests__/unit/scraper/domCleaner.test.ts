import { cleanJobHtml, estimateTokens } from '../../../src/scraper/domCleaner';
import { SAMPLE_JOB_HTML } from '../../helpers/fixtures';

describe('cleanJobHtml — aggressive context cleanup', () => {
  it('extracts only the main content of the job description', () => {
    // doc 03 (5.1): converts only the main container into compact Markdown
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);

    expect(clean.markdown).toContain('Senior Full-Stack Engineer');
    expect(clean.markdown).toContain('TypeScript');
    expect(clean.markdown).toContain('PostgreSQL');
  });

  it('removes scripts, styles, svg, navigation, ads and footer', () => {
    // doc 03 (5.1): removes script, style, svg tags, menus and footers
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);

    expect(clean.markdown).not.toContain('window.tracker');
    expect(clean.markdown).not.toContain('analytics.track');
    expect(clean.markdown).not.toContain('showAds');
    expect(clean.markdown).not.toContain('Advertisement');
    expect(clean.markdown).not.toContain('Privacy · Cookies');
  });

  it('produces lean markdown output, not HTML', () => {
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);

    expect(clean.markdown).not.toMatch(/<script|<style|<nav|<footer|<svg/i);
  });

  it('drastically reduces the page token volume', () => {
    // doc 03 (5.1): average 18k-token page → ~900 tokens
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);
    const rawTokens = estimateTokens(SAMPLE_JOB_HTML);
    const cleanTokens = estimateTokens(clean.markdown);

    expect(cleanTokens).toBeLessThan(rawTokens * 0.3);
  });

  it('extracts title and company when identifiable', () => {
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);

    expect(clean.title).toMatch(/Senior Full-Stack Engineer/i);
    expect(clean.company).toMatch(/TechCorp/i);
  });
});

describe('estimateTokens', () => {
  it('estimates tokens proportionally to the text size', () => {
    const short = estimateTokens('hello world');
    const long = estimateTokens('hello world '.repeat(100));

    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(0);
  });
});
