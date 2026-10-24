// uso: node tests/visual/compare.js <pasta-a> <pasta-b>
// Sai com código != 0 se algum PNG diferir (byte a byte), faltar, ou houver erro de console.
// Cenários "fuzzy" (3D) só precisam existir nos dois lados e ter console limpo.
import fs from 'node:fs';
import path from 'node:path';
import { scenarios, routeScenarios, LANGS } from './scenarios.js';

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('uso: compare.js <pasta-a> <pasta-b>'); process.exit(2); }
const fuzzy = new Set([...scenarios, ...routeScenarios].filter(s => s.fuzzy).map(s => s.name));
const readJson = d => { try { return JSON.parse(fs.readFileSync(path.join(d, 'console.json'), 'utf8')); } catch { return null; } };
const ca = readJson(a), cb = readJson(b);
let fail = 0;
const bad = msg => { fail++; console.log('FALHA ' + msg); };

const pngs = d => fs.readdirSync(d).filter(f => f.endsWith('.png')).sort();
const fa = pngs(a), fb = pngs(b);
const all = new Set([...fa, ...fb]);
// PNG que só um lado tem é falha, exceto os cenários extras de --routes (aviso).
let same = 0, skipped = 0;
const routeNames = new Set(routeScenarios.map(s => s.name));
for (const f of [...all].sort()) {
  const name = f.replace(/-(pt|en|es)\.png$/, '');
  if (!fa.includes(f) || !fb.includes(f)) {
    if (routeNames.has(name)) { console.log(`aviso: ${f} (rota extra) só existe de um lado`); continue; }
    bad(`${f} só existe de um lado`); continue;
  }
  if (fuzzy.has(name)) { skipped++; continue; }
  if (Buffer.compare(fs.readFileSync(path.join(a, f)), fs.readFileSync(path.join(b, f))) === 0) same++;
  else bad(`${f} difere`);
}
if (same + skipped === 0) bad('nenhum PNG comparado (pastas vazias?)');
for (const [label, c] of [['a', ca], ['b', cb]]) {
  if (!c) { bad(`console.json ausente em ${label}`); continue; }
  for (const [k, v] of Object.entries(c)) if (v.length) bad(`console de ${label} em ${k}: ${v.join(' | ')}`);
}
console.log(`${same} iguais, ${skipped} fuzzy (só existência), ${fail} falhas`);
process.exit(fail ? 1 : 0);
