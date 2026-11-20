// Valida UTF-8 + detecta mojibake residual nos arquivos modificados do git.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

const files = execSync('git status --short')
  .toString()
  .split('\n')
  .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
  .filter(Boolean);

const d = new TextDecoder('utf-8', { fatal: true });
let bad = 0;
for (const f of files) {
  if (!existsSync(f) || !statSync(f).isFile()) continue;
  if (/\.(pdf|png|jpg|jpeg|ico|woff2?|sqlite|db)$/i.test(f)) continue;
  try {
    d.decode(readFileSync(f));
  } catch {
    console.log('NON-UTF8:', f);
    bad++;
    continue;
  }
  const s = readFileSync(f, 'utf8');
  const fffd = (s.match(/�/g) || []).length;
  // mojibake real: Ã/â/Â seguidos de byte latino alto — não "Ã" + vogal ASCII
  const moji = (s.match(/[ÃÂâ][-¿]/g) || []).length;
  if (fffd || moji) console.log('SUSPEITO:', f, 'fffd:' + fffd, 'moji:' + moji);
}
console.log(bad ? bad + ' arquivos com erro' : 'varredura UTF-8 OK');
