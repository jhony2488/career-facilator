// Prepara o app desktop Tauri: copia o exe SEA + career-runtime + skills p/
// src-tauri/binaries (nomes com target-triple) e roda `tauri build`.
// Uso: node scripts/build-desktop.mjs [--no-build]   (build do cargo é CI-only
// sem Rust local — --no-build só prepara os resources/binaries.)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const TRIPLES = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
};
const PLATFORMS = { win32: 'windows', darwin: 'macos', linux: 'linux' };

const osKey = `${process.platform}-${process.arch}`;
const platform = PLATFORMS[process.platform] ?? process.platform;
const triple = TRIPLES[osKey];
if (!triple) {
  console.error(`Plataforma sem target Tauri mapeado: ${osKey}`);
  process.exit(1);
}
const ext = process.platform === 'win32' ? '.exe' : '';
// --from <dir>: pacote CLI já extraído (exe + career-runtime + skills) —
// útil p/ empacotar um zip gerado por `npm run dist` noutra máquina.
const fromIdx = process.argv.indexOf('--from');
const FROM = fromIdx !== -1 ? process.argv[fromIdx + 1] : null;
const SRC_EXE = FROM
  ? join(FROM, `career-${platform}-${process.arch}${ext}`)
  : `dist/career-${platform}-${process.arch}${ext}`;
const SRC_RT = FROM ? join(FROM, 'career-runtime') : 'dist/career-runtime';
const SRC_SKILLS = FROM ? join(FROM, 'skills') : 'dist/skills';
const BIN = 'desktop/src-tauri/binaries';

// ── Sidecar + resources ─────────────────────────────────────────────────────
rmSync(BIN, { recursive: true, force: true });
mkdirSync(BIN, { recursive: true });
for (const [src, dest] of [
  [SRC_EXE, join(BIN, `career-${triple}${ext}`)],
  [SRC_RT, join(BIN, 'career-runtime')],
  [SRC_SKILLS, join(BIN, 'skills')],
]) {
  if (!existsSync(src)) {
    console.error(`Ausente: ${src} — rode 'npm run dist' antes (ou passe --from <dir>).`);
    process.exit(1);
  }
  cpSync(src, dest, { recursive: true });
}
console.log(`binaries staged: career-${triple}${ext} + career-runtime/ + skills/`);

// career-runtime é obrigatório e pesado — pasta vazia/ausente aqui significa
// extração falha do pacote (ex.: extrator que pula entradas do zip). Falhar
// cedo e claro em vez do erro obscuro de glob do bundler.
if (!existsSync(join(BIN, 'career-runtime')) || walkAll(join(BIN, 'career-runtime')).length === 0) {
  console.error(`career-runtime vazio/ausente em ${SRC_RT} — extração do pacote falhou.`);
  try {
    for (const e of readdirSync(FROM ?? 'dist')) console.error(`  pacote: ${e}`);
  } catch {}
  process.exit(1);
}

// O resource glob `binaries/skills/**` do bundler falha duro quando a pasta sobe
// vazia/ausente (ex.: pacote sem skills). Garante ≥1 arquivo e avisa —
// o app empacota sem skills (degrada p/ nenhuma skill ativa) em vez de quebrar.
let skillsHasFiles = false;
try {
  skillsHasFiles = readdirSync(join(BIN, 'skills'), { withFileTypes: true }).some((e) =>
    e.isDirectory() ? readdirSync(join(BIN, 'skills', e.name)).length > 0 : e.isFile(),
  );
} catch {
  mkdirSync(join(BIN, 'skills'), { recursive: true });
}
if (!skillsHasFiles) {
  console.warn('aviso: skills/ veio vazio ou ausente no pacote CLI — bundling sem library.');
  writeFileSync(join(BIN, 'skills', 'README.txt'), 'skills library ausente neste pacote\n');
}
for (const name of ['career-runtime', 'skills']) {
  const files = walkAll(join(BIN, name)).length;
  console.log(`binaries/${name}: ${files} arquivo(s)`);
}

// Garantia final contra o erro obscuro de glob do bundler: os dois dirs de
// resource precisam ter ≥1 arquivo, senão despeja o estado de binaries/ e morre.
for (const name of ['career-runtime', 'skills']) {
  const dir = join(BIN, name);
  if (!existsSync(dir) || walkAll(dir).length === 0) {
    console.error(`staging incompleto: binaries/${name} vazio ou ausente. Conteúdo de ${BIN}:`);
    try {
      for (const e of readdirSync(BIN)) console.error(`  ${e}`);
    } catch {}
    process.exit(1);
  }
}

// ── Ícone placeholder (PNG 512px flat #3ea6ff + "C") — troque por arte real. ──
function crc32(buf) {
  let c,
    table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256).map((_, n) => {
      let x = n;
      for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
      return x;
    });
  }
  c = -1;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
  return Buffer.concat([len, Buffer.from(type), data, crc]);
}
function writeIcon(path, size = 512) {
  const w = size / 8; // "C" grosso central
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const inC =
        x > size / 4 &&
        x < (3 * size) / 4 &&
        ((y > size / 4 && y < size / 4 + w) ||
          (y > (3 * size) / 4 - w && y < (3 * size) / 4) ||
          (x > size / 4 && x < size / 4 + w && y > size / 4 && y < (3 * size) / 4));
      rows[i] = inC ? 255 : 62; // R
      rows[i + 1] = inC ? 255 : 166; // G
      rows[i + 2] = inC ? 255 : 255; // B
      rows[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', deflateSync(rows)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
const iconPng = 'desktop/src-tauri/icons/icon.png';
if (!existsSync(iconPng)) {
  mkdirSync('desktop/src-tauri/icons', { recursive: true });
  writeIcon(iconPng);
  console.log('ícone placeholder gerado (desktop/src-tauri/icons/icon.png)');
}
// ico/icns a partir do png — `tauri icon` não precisa de cargo.
if (!existsSync('desktop/src-tauri/icons/icon.ico')) {
  const r = spawnSync(
    'npx',
    ['tauri', 'icon', '-o', 'src-tauri/icons', 'src-tauri/icons/icon.png'],
    {
      cwd: 'desktop',
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
  if (r.status !== 0) console.warn('aviso: tauri icon falhou — icns/ico serão gerados no CI');
}

if (process.argv.includes('--no-build')) process.exit(0);
const r = spawnSync('npx', ['tauri', 'build'], {
  cwd: 'desktop',
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (r.status !== 0) process.exit(r.status ?? 1);

// Coleta o instalador principal p/ dist/career-ui-<platform>-<arch>.<ext>.
const BUNDLE_DIR = 'desktop/src-tauri/target/release/bundle';
const EXT_BY_PLATFORM = { win32: '.exe', darwin: '.dmg', linux: '.AppImage' };
const wanted = EXT_BY_PLATFORM[process.platform];
const found = walkAll(BUNDLE_DIR).find((f) => f.endsWith(wanted));
if (!found) {
  console.error(`Instalador .${wanted} não encontrado em ${BUNDLE_DIR}`);
  process.exit(1);
}
const OUT = `dist/career-ui-${platform}-${process.arch}${wanted}`;
cpSync(found, OUT);
console.log(`Installer: ${OUT}`);

function walkAll(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkAll(p));
    else out.push(p);
  }
  return out;
}
