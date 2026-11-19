import { extractPdfText } from '../../../src/intake/pdfExtractor';
import { mockPdfReader, mockScannedPdfReader } from '../../helpers/mocks';

describe('extractPdfText', () => {
  it('extrai o texto quando o PDF tem camada de texto', async () => {
    // feature/13: Extrair currículo depositado na área de entrada
    const reader = mockPdfReader();
    const result = await extractPdfText({ path: 'storage/profile_inbox/cv.pdf' }, { reader });

    expect(result.hasTextLayer).toBe(true);
    expect(result.text).toContain('Dev Tester');
    expect(result.pageCount).toBeGreaterThan(0);
  });

  it('aceita entrada por buffer além de caminho de arquivo', async () => {
    const reader = mockPdfReader();
    const result = await extractPdfText({ buffer: new Uint8Array([37, 80, 68, 70]) }, { reader });

    expect(reader.extract).toHaveBeenCalled();
    expect(result.hasTextLayer).toBe(true);
  });

  it('sinaliza PDF digitalizado sem camada de texto', async () => {
    // feature/13: Documento sem texto legível não gera dados
    const reader = mockScannedPdfReader();
    const result = await extractPdfText({ path: 'storage/profile_inbox/scanned.pdf' }, { reader });

    expect(result.hasTextLayer).toBe(false);
    expect(result.text).toBe('');
  });

  it('não retorna conteúdo inventado quando não há texto extraível', async () => {
    // feature/13: Documento sem texto legível não gera dados
    const reader = mockScannedPdfReader();
    const result = await extractPdfText({ buffer: new Uint8Array([1, 2, 3]) }, { reader });

    expect(result.text.trim()).toBe('');
    expect(result.hasTextLayer).toBe(false);
  });
});
