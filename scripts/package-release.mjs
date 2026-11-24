// Empacota dist/ em career-<os>-<arch>.zip (exe + career-runtime + skills +
// .env.example) e career-runtime-<os>-<arch>.tar.gz (só runtime + skills).
// No CI o zip é artefato intermediário — insumo do sidecar do app desktop
// (job `desktop` do release.yml), não é publicado; o tarball só serve ao
// 'career runtime setup' de binários gerados localmente (`npm run dist`).
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { ZipArchive } from 'archiver';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const PLATFORMS = { win32: 'windows', darwin: 'macos', linux: 'linux' };
const platform = PLATFORMS[process.platform] ?? process.platform;
const suffix = `${platform}-${process.arch}`;
const asset = arg('--asset') ?? `career-${suffix}${process.platform === 'win32' ? '.exe' : ''}`;
const base = basename(asset).replace(/\.exe$/, '');
const exePath = join('dist', basename(asset));

if (!existsSync(exePath)) {
  console.error(`Binário ausente (${exePath}) — rode 'npm run build:exe' antes.`);
  process.exit(1);
}

const DIST = resolve('dist');
const zipPath = join(DIST, `${base}.zip`);
const tarPath = join(DIST, `career-runtime-${suffix}.tar.gz`);

// ZIP do pacote completo.
const zip = new ZipArchive({ zlib: { level: 9 } });
const out = createWriteStream(zipPath);
const done = new Promise((res, rej) => {
  out.on('close', res);
  zip.on('error', rej);
});
zip.pipe(out);
zip.file(exePath, { name: `${base}/${basename(exePath)}` });
if (existsSync('dist/career-runtime')) {
  zip.directory('dist/career-runtime', `${base}/career-runtime`);
}
if (existsSync('dist/skills')) zip.directory('dist/skills', `${base}/skills`);
if (existsSync('dist/.env.example')) {
  zip.file('dist/.env.example', { name: `${base}/.env.example` });
}
await zip.finalize();
await done;
console.log(`ZIP: ${zipPath}`);

// Tarball só do runtime — consumido por 'career runtime setup' no exe.
const entries = ['career-runtime', 'skills'].filter((e) => existsSync(join('dist', e)));
const tar = spawnSync('tar', ['-czf', tarPath, '-C', 'dist', ...entries], {
  stdio: 'inherit',
});
if (tar.status !== 0) {
  console.error('tar falhou — career-runtime tarball não gerado (zip segue ok).');
  process.exit(tar.status ?? 1);
}
console.log(`Tarball runtime: ${tarPath}`);
