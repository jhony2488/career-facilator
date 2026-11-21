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
  // pdf-parse é opcional no código (req() dinâmico c/ fallback regex em
  // pdfReaderNode) — fora do bundle, o exe usa o extrator de texto puro.
  // playwright fica de fora também: o playwright-core faz require() de
  // caminhos de filesystem (package.json, help.json, drivers) e lookups fs
  // no próprio dir — incompatível com SEA single-file. browserManager o
  // carrega por import() lazy; no exe a falha degrada p/ canal de mensagem.
  external: ['pdf-parse', 'playwright', 'playwright-core', 'playwright-extra'],
  define: {
    'process.env.CAREER_VERSION': JSON.stringify(version),
  },
  logLevel: 'info',
});
