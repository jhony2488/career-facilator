import { extractPdfText } from '../../../src/intake/pdfExtractor';
import { mockPdfReader, mockScannedPdfReader } from '../../helpers/mocks';

describe('extractPdfText', () => {
  it('extracts the text when the PDF has a text layer', async () => {
    // feature/13: Extract the resume dropped in the inbox area
    const reader = mockPdfReader();
    const result = await extractPdfText({ path: 'storage/profile_inbox/cv.pdf' }, { reader });

    expect(result.hasTextLayer).toBe(true);
    expect(result.text).toContain('Dev Tester');
    expect(result.pageCount).toBeGreaterThan(0);
  });

  it('accepts buffer input in addition to a file path', async () => {
    const reader = mockPdfReader();
    const result = await extractPdfText({ buffer: new Uint8Array([37, 80, 68, 70]) }, { reader });

    expect(reader.extract).toHaveBeenCalled();
    expect(result.hasTextLayer).toBe(true);
  });

  it('flags a scanned PDF with no text layer', async () => {
    // feature/13: Document without readable text yields no data
    const reader = mockScannedPdfReader();
    const result = await extractPdfText({ path: 'storage/profile_inbox/scanned.pdf' }, { reader });

    expect(result.hasTextLayer).toBe(false);
    expect(result.text).toBe('');
  });

  it('does not return made-up content when there is no extractable text', async () => {
    // feature/13: Document without readable text yields no data
    const reader = mockScannedPdfReader();
    const result = await extractPdfText({ buffer: new Uint8Array([1, 2, 3]) }, { reader });

    expect(result.text.trim()).toBe('');
    expect(result.hasTextLayer).toBe(false);
  });
});
