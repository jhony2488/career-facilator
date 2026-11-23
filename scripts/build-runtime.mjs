// Monta dist/career-runtime: node_modules sidecar (mesmas versões do
// package.json), browsers do Playwright, tessdata (OCR) e a library de skills.
// Consumido pelo empacotamento (package-release.mjs) e pelo runtime setup.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

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
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'package.json'),
  JSON.stringify({ name: 'career-runtime', private: true }, null, 2) + '\n',
);

const specs = RUNTIME_PKGS.map((n) => `${n}@${pkg.dependencies?.[n] ?? 'latest'}`);
console.log(`npm install (runtime): ${specs.join(' ')}`);
execFileSync(
  npmCmd,
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
    // Sem download de browsers no postinstall — instalamos só chromium abaixo.
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  },
);

console.log('playwright install chromium → career-runtime/browsers');
execFileSync(
  process.execPath,
  [join(OUT, 'node_modules/playwright/cli.js'), 'install', 'chromium'],
  {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS },
  },
);

// OCR offline: traineddata cru do repo → career-runtime/tessdata.
mkdirSync(join(OUT, 'tessdata'), { recursive: true });
for (const f of ['por.traineddata', 'eng.traineddata']) {
  if (existsSync(f)) {
    cpSync(f, join(OUT, 'tessdata', f));
    console.log(`tessdata: ${f}`);
  } else {
    console.log(`⚠ ${f} ausente na raiz — OCR deste idioma baixa online.`);
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
