// Injeta o blob SEA no binário do Node local → dist/career-<os>-<arch>[.exe].
// Mesmo comando do CI (release.yml) — agora `npm run build:exe` produz o exe.
import { copyFileSync, existsSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const PLATFORMS = { win32: 'windows', darwin: 'macos', linux: 'linux' };
const platform = PLATFORMS[process.platform] ?? process.platform;
const ext = process.platform === 'win32' ? '.exe' : '';
const name = arg('--name') ?? `career-${platform}-${process.arch}${ext}`;
const blob = 'dist/bundle/sea-prep.blob';
const out = `dist/${name}`;

if (!existsSync(blob)) {
  console.error(`Blob ausente (${blob}) — rode 'npm run bundle && npm run sea' antes.`);
  process.exit(1);
}

copyFileSync(process.execPath, out);
if (process.platform !== 'win32') chmodSync(out, 0o755);

const postjectArgs = [
  'postject',
  out,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (process.platform === 'darwin') postjectArgs.push('--macho-segment-name', 'NODE_SEA');

const r = spawnSync('npx', postjectArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (r.status !== 0) process.exit(r.status ?? 1);

if (process.platform === 'darwin') {
  // Assinatura ad-hoc — o blob invalida a assinatura original do binário.
  spawnSync('codesign', ['--remove-signature', out], { stdio: 'ignore' });
  spawnSync('codesign', ['--sign', '-', out], { stdio: 'inherit' });
}

console.log(`Binário SEA pronto: ${out}`);
