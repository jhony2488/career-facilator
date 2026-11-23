// Monta dist/career-runtime: node_modules sidecar (mesmas versões do
// package.json), browsers do Playwright, tessdata (OCR) e a library de skills.
// Consumido pelo empacotamento (package-release.mjs) e pelo runtime setup.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const req = createRequire(import.meta.url);

/** Versão realmente instalada no projeto — mantém runtime e dev alinhados. */
const installedVersion = (name) => {
  try {
    return req(`${name}/package.json`).version;
  } catch {
    return pkg.dependencies?.[name] ?? 'latest';
  }
};

// Pacotes externos do bundle SEA — carregados via createRequire no exe.
const RUNTIME_PKGS = [
  'playwright',
  'playwright-extra',
  'puppeteer-extra-plugin-stealth',
  'pdf-parse',
  'tesseract.js',
];

const OUT = resolve('dist/career-runtime');
const BROWSERS = join(OUT, 'browsers');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'package.json'),
  JSON.stringify({ name: 'career-runtime', private: true }, null, 2) + '\n',
);

const specs = RUNTIME_PKGS.map((n) => `${n}@${installedVersion(n)}`);
console.log(`npm install (runtime): ${specs.join(' ')}`);
const install = spawnSync(
  'npm',
  [
    'install',
    '--prefix',
    OUT,
    '--omit=dev',
    '--no-package-lock',
    '--no-audit',
    '--no-fund',
    ...specs,
  ],
  {
    stdio: 'inherit',
    // .cmd no Windows só executa via shell; --prefix precisa de shell:true lá.
    shell: process.platform === 'win32',
    // Sem download de browsers no postinstall — instalamos só chromium abaixo.
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  },
);
if (install.status !== 0) process.exit(install.status ?? 1);

console.log('playwright install chromium → career-runtime/browsers');
// O CDN do playwright falha com timeout transitório — tenta até 2×.
for (let attempt = 1; ; attempt++) {
  try {
    execFileSync(
      process.execPath,
      [join(OUT, 'node_modules/playwright/cli.js'), 'install', 'chromium'],
      {
        stdio: 'inherit',
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS },
      },
    );
    break;
  } catch (e) {
    if (attempt === 2) throw e;
    console.log('falha transitória no download do chromium — tentando de novo…');
  }
}

// OCR offline: traineddata cru de assets/tessdata → career-runtime/tessdata.
const TESSDATA_SRC = 'assets/tessdata';
mkdirSync(join(OUT, 'tessdata'), { recursive: true });
for (const f of ['por.traineddata', 'eng.traineddata']) {
  const src = join(TESSDATA_SRC, f);
  if (existsSync(src)) {
    cpSync(src, join(OUT, 'tessdata', f));
    console.log(`tessdata: ${f}`);
  } else {
    console.log(`⚠ ${src} ausente — OCR deste idioma baixa online.`);
  }
}

//' Biblioteca de skills → dist/skills (o exe procura 'skills/' ao lado dele).
const skillsSrc = 'src/skills/library';
if (existsSync(skillsSrc)) {
  rmSync('dist/skills', { recursive: true, force: true });
  cpSync(skillsSrc, 'dist/skills', { recursive: true });
  console.log('skills: src/skills/library → dist/skills');
}

if (existsSync('.env.example')) {
  cpSync('.env.example', 'dist/.env.example');
  console.log('.env.example → dist/');
}

console.log(`Runtime sidecar pronto em ${OUT}`);
