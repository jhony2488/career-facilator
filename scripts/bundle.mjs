// Bundle p/ SEA: injeta CAREER_VERSION (tag do release) no binário.
// `esbuild` CLI puro não expande env var de forma cross-platform — por isso Node.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/bundle/index.cjs',
  // pdf-parse é opcional no código (req() dinâmico c/ fallback regex em
  // pdfReaderNode) — fora do bundle, o exe usa o extrator de texto puro.
  external: ['pdf-parse'],
  define: {
    'process.env.CAREER_VERSION': JSON.stringify(process.env.CAREER_VERSION ?? 'dev'),
  },
  logLevel: 'info',
});
