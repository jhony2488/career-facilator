// Desfaz mojibake CP1252→UTF-8 linha a linha (só toca linhas com marcadores).
import { readFileSync, writeFileSync } from 'node:fs';

const CP1252_HI = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};
const toByte = (ch) => {
  const cp = ch.codePointAt(0);
  return cp < 0x100 ? cp : CP1252_HI[cp];
};
const MOJI = /[ÃÂâ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;

const fixLine = (line) => {
  if (!MOJI.test(line)) return line;
  const bytes = [];
  for (const ch of line) {
    const b = toByte(ch);
    if (b === undefined) return line;
    bytes.push(b);
  }
  const decoded = Buffer.from(bytes).toString('utf8');
  const before = (line.match(new RegExp(MOJI.source, 'g')) || []).length;
  const after = (decoded.match(new RegExp(MOJI.source, 'g')) || []).length;
  return after < before ? decoded : line;
};

for (const f of process.argv.slice(2)) {
  const s = readFileSync(f, 'utf8');
  const out = s.split('\n').map(fixLine).join('\n').replace(/^\uFEFF/, '');
  writeFileSync(f, out);
  const left = (out.match(/Ã.|â€.|Â«|Â»/g) || []).length;
  console.log(f, '— mojibake restante:', left);
}
