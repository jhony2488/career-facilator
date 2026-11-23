// Bundle p/ SEA: injeta CAREER_VERSION (tag do release) no binário.
// `esbuild` CLI puro não expande env var de forma cross-platform — por isso Node.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

// Versão embutida = package.json (fonte única da verdade). A tag do release
// é validada contra ela no workflow (release.yml) — divergência aborta o build.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version ?? 'dev';

await build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/bundle/index.cjs',
  // Pacotes que quebram em single-file (requires dinâmicos/fs internos) ficam
  // FORA do bundle: o exe os carrega do runtime sidecar
  // (`career-runtime/node_modules` — ver src/utils/runtimeModules.ts);
  // sem runtime, a degradação é a mesma de antes (mensagem/revisão).
  // - playwright*/stealth: drivers + browsers de filesystem (browserManager)
  // - pdf-parse: opcional, fallback regex em pdfReaderNode
  // - tesseract.js: worker script + tesseract.js-core por caminho real (imageOcr)
  external: [
    'pdf-parse',
    'playwright',
    'playwright-core',
    'playwright-extra',
    'puppeteer-extra-plugin-stealth',
    'tesseract.js',
  ],
  define: {
    'process.env.CAREER_VERSION': JSON.stringify(version),
  },
  logLevel: 'info',
});
