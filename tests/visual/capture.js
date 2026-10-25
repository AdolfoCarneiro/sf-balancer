// uso: node tests/visual/capture.js <url-base> <pasta> [--routes] [--fixtures]
// Salva <pasta>/<nome>-<lang>.png e <pasta>/console.json (erros de console por cenário).
// --routes também captura /pt e /es (precisam das rewrites do vercel.json).
// --only=<trecho do nome> limita os cenários.
// --fixtures grava tests/visual/fixtures.json (link #s= e localStorage reais, entradas antigas).
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios, routeScenarios, LANGS } from './scenarios.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const [base, outDir] = args;
if (!base || !outDir) { console.error('uso: capture.js <url-base> <pasta> [--routes] [--fixtures]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

// Usa o Chromium já instalado (nunca baixa browser). CHROME_PATH sobrepõe.
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(root)) throw new Error(`Chromium não encontrado: ${root} não existe. Instale um browser do Playwright ou defina CHROME_PATH.`);
  const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort();
  for (const d of dirs.reverse()) {
    const p = path.join(root, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('nenhum chromium em ' + root);
}

function chromeOrExit() {
  try { return chromePath(); } catch (e) { console.error(e.message); process.exit(1); }
}

const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;

async function openPage(browser, viewport, url, clearStore) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] });
  if (clearStore) await ctx.addInitScript(k => { try { localStorage.removeItem(k); } catch { /* sem storage */ } }, clearStore);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('response', r => { if (r.status() >= 400 && !r.url().includes('/_vercel/insights/')) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  await pg.goto(url, { waitUntil: 'load' });
  await pg.addStyleTag({ content: FREEZE });
  await pg.evaluate(() => document.fonts.ready);
  return { ctx, pg, errs };
}
// O console só diz "Failed to load resource" sem URL; as respostas ruins de verdade entram pelo handler 'response' (com URL).
const real = errs => errs.filter(e => !e.startsWith('Failed to load resource'));

if (flags.has('--fixtures-check')) {
  // Abre o #s= e o localStorage antigos (fixtures.json) e confere que o cenário aparece. Uso: capture.js <url> <pasta> --fixtures-check
  const fx = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));
  const b = await chromium.launch({ executablePath: chromeOrExit() });
  let fail = 0;
  const check = (name, ok, info) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${name} ${info}`); if (!ok) fail++; };
  const { ctx, pg, errs } = await openPage(b, { width: 1400, height: 1000 }, `${base}/${fx.shareHash}`);
  await pg.waitForTimeout(500);
  const v = await pg.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
  check('#s= abre', v.includes('42') && v.includes('60') && v.includes('65') && v.includes('40'), JSON.stringify(v.slice(0, 8)));
  check('#s= sem erros', real(errs).length === 0, JSON.stringify(real(errs)));
  await ctx.close();
  const c2 = await b.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'en-US' });
  await c2.addInitScript(ls => { if (!sessionStorage.getItem('fx')) { sessionStorage.setItem('fx', '1'); for (const [k, x] of Object.entries(ls)) localStorage.setItem(k, x); } }, fx.localStorage);
  const p2 = await c2.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto(`${base}/`, { waitUntil: 'load' });
  await p2.waitForTimeout(500);
  const v2 = await p2.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
  const lang = await p2.evaluate(() => document.documentElement.lang);
  const scen = await p2.evaluate(() => localStorage.getItem('sf-balancer:scenarios'));
  check('localStorage restaura estado', v2.includes('42') && v2.includes('60'), JSON.stringify(v2.slice(0, 8)) + ' lang=' + lang);
  check('cenários salvos preservados', !!scen && scen.length > 2, String(scen).slice(0, 60));
  check('localStorage sem erros', e2.length === 0, JSON.stringify(e2));
  await c2.close(); await b.close();
  process.exit(fail ? 1 : 0);
}
const browser = await chromium.launch({ executablePath: chromeOrExit(), args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-partial-raster'] });
const consoleLog = {};
const only = [...flags].find(f => f.startsWith('--only='))?.slice(7);
const list = [];
for (const sc of scenarios) for (const lang of LANGS) list.push({ sc, lang, url: `${base}${sc.path}?lang=${lang}` });
if (flags.has('--routes')) for (const sc of routeScenarios) list.push({ sc, lang: sc.lang, url: `${base}${sc.path}` });

for (const { sc, lang, url } of list) {
  if (only && !sc.name.includes(only)) continue;
  const key = `${sc.name}-${lang}`;
  const { ctx, pg, errs } = await openPage(browser, sc.viewport, url, sc.clearStore);
  try {
    await sc.actions(pg);
    await pg.waitForLoadState('networkidle').catch(() => {});
    await pg.evaluate(() => document.fonts.ready);
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: path.join(outDir, `${key}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
  } catch (e) { errs.push('scenario: ' + e.message.split('\n')[0]); }
  consoleLog[key] = real(errs);
  console.log(`${consoleLog[key].length ? 'ERRO ' : 'ok   '} ${key}`);
  await ctx.close();
}
fs.writeFileSync(path.join(outDir, 'console.json'), JSON.stringify(consoleLog, null, 2) + '\n');

if (flags.has('--fixtures')) {
  // Entradas antigas reais: link #s= (caso 1 + um grupo extra) e localStorage depois de salvar um cenário.
  const { ctx, pg } = await openPage(browser, { width: 1400, height: 1000 }, `${base}/?lang=pt`);
  await pg.click('[data-add="src"]');
  await pg.waitForTimeout(300);
  await pg.click('#shareCopy');
  await pg.waitForTimeout(300);
  const link = await pg.evaluate(() => navigator.clipboard.readText());
  await pg.click('#scenSave');
  await pg.waitForTimeout(300);
  const storage = await pg.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await ctx.close();
  const hash = link.slice(link.indexOf('#s='));
  fs.writeFileSync(path.join(here, 'fixtures.json'), JSON.stringify({ lang: 'pt', shareHash: hash, localStorage: storage }, null, 2) + '\n');
  console.log('fixtures.json gravado');
}
await browser.close();
const bad = Object.values(consoleLog).filter(v => v.length).length;
process.exit(bad ? 1 : 0);
