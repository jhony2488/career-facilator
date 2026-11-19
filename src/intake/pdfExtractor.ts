export interface PdfExtractionInput {
  path?: string;
  buffer?: Uint8Array;
}

export interface PdfReader {
  extract(input: { path?: string; buffer?: Uint8Array }): Promise<{ text: string; pages: number }>;
}

export interface PdfExtractionResult {
  text: string;
  hasTextLayer: boolean;
  pageCount: number;
}

/**
 * Extrai a camada de texto do PDF via leitor injetável (doc 13 §13.2).
 * PDF digitalizado/sem texto → hasTextLayer=false — nenhum OCR silencioso
 * que possa inventar dados. A implementação real do reader fica em
 * pdfReaderNode.ts; testes injetam mocks.
 */
export async function extractPdfText(
  file: PdfExtractionInput,
  deps: { reader: PdfReader },
): Promise<PdfExtractionResult> {
  const { text, pages } = await deps.reader.extract({ path: file.path, buffer: file.buffer });
  const clean = (text ?? '').trim();
  return {
    text: clean,
    hasTextLayer: clean.length > 0,
    pageCount: pages,
  };
}
