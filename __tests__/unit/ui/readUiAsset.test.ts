import { readUiAsset } from '../../../src/ui/readUiAsset';

describe('ui/readUiAsset (dev fs fallback)', () => {
  it('reads bundled UI files from src/ui/public', () => {
    const html = readUiAsset('index.html');
    expect(html).not.toBeNull();
    expect(html!.toString('utf8')).toContain('CareerFacilator');
    expect(readUiAsset('app.js')?.toString('utf8')).toContain('api(');
    expect(readUiAsset('i18n/pt.json')).not.toBeNull();
  });

  it('returns null for missing assets (never throws)', () => {
    expect(readUiAsset('nope.bin')).toBeNull();
    expect(readUiAsset('../package.json')).toBeNull();
  });
});
