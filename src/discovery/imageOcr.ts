/**
 * OCR de imagens de posts (tesseract.js — WASM puro, consistente c/ o
 * single-file exe). Worker lazy singleton por+eng; no exe o módulo vem do
 * runtime sidecar (createRequire) e o traineddata da pasta `tessdata` —
 * em dev, import normal + download/cache do próprio pacote.
 * Falhas degradam p/ '' — o texto do post continua valendo.
 */
import { isSea, loadRuntimeModule, tessdataDir } from '../utils/runtimeModules';

type Worker = {
  recognize: (image: Buffer) => Promise<{ data: { text: string } }>;
  terminate(): Promise<void>;
};

let workerPromise: Promise<Worker> | null = null;

type CreateWorker = (
  langs: string[],
  oem?: number,
  opts?: { langPath?: string; gzip?: boolean },
) => Promise<Worker>;

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await loadRuntimeModule<{ createWorker: CreateWorker }>(
      'tesseract.js',
    );
    const langPath = isSea() ? (tessdataDir() ?? undefined) : undefined;
    // tessdata do pacote é .traineddata cru — gzip:false evita procurar o .gz.
    const opts = langPath ? { langPath, gzip: false } : undefined;
    return createWorker(['por', 'eng'], undefined, opts);
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
