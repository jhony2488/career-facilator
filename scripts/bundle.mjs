// Bundle p/ SEA: injeta CAREER_VERSION (tag do release) no binário e
// gera sea-config.json com os assets estáticos da UI (src/ui/public/**).
// `esbuild` CLI puro não expande env var de forma cross-platform — por isso Node.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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

// Assets da UI embutidos no blob SEA — `readUiAsset` resolve `ui/<rel>` no exe
// e `src/ui/public/<rel>` do disco em dev. Recurse p/ incluir i18n/ e futuros.
const UI_DIR = 'src/ui/public';
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const uiAssets = Object.fromEntries(
  walk(UI_DIR).map((f) => [
    `ui/${relative(UI_DIR, f).replaceAll('\\', '/')}`,
    f.replaceAll('\\', '/'),
  ]),
);
// `.env.example` raiz: alimenta o catálogo de variáveis da aba Config no exe.
uiAssets['ui/env.example'] = '.env.example';
writeFileSync(
  'sea-config.json',
  JSON.stringify(
    {
      main: 'dist/bundle/index.cjs',
      output: 'dist/bundle/sea-prep.blob',
      disableExperimentalSEAWarning: true,
      assets: uiAssets,
    },
    null,
    2,
  ) + '\n',
);
console.log(`sea-config.json: ${Object.keys(uiAssets).length} asset(s) da UI`);
