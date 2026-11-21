/**
 * OCR de imagens de posts (tesseract.js — WASM puro, consistente c/ o
 * single-file exe). Worker lazy singleton por+eng; traineddata (~15MB) baixa
 * na 1ª chamada e fica em cache. Falhas degradam p/ '' — o texto do post
 * continua valendo.
 */

type Worker = {
  recognize: (image: Buffer) => Promise<{ data: { text: string } }>;
  terminate(): Promise<void>;
};

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    return createWorker(['por', 'eng']) as unknown as Promise<Worker>;
  })();
  return workerPromise;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

/** media.licdn.com serve via URL assinada pública — sem cookie de sessão. */
async function fetchImageBytes(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_IMAGE_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.byteLength > MAX_IMAGE_BYTES ? null : buf;
}

export async function ocrImageUrl(url: string): Promise<string> {
  try {
    const buf = await fetchImageBytes(url);
    if (!buf) return '';
    const worker = await getWorker();
    const { data } = await worker.recognize(buf);
    return data.text ?? '';
  } catch {
    return '';
  }
}

/** Libera o worker — chamado no fim da descoberta e nos testes. */
export async function disposeOcrWorker(): Promise<void> {
  const w = workerPromise;
  workerPromise = null;
  if (w) await w.then((worker) => worker.terminate()).catch(() => {});
}
