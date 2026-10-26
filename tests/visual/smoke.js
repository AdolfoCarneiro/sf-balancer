// uso: node tests/visual/smoke.js <url-base>   (ex.: npm run smoke -- http://localhost:4173, contra o npm run preview)
// Smoke dos gestos do builder, de ponta a ponta: canvas vazio -> duplo clique -> "Pure Iron" + Enter cria o bloco;
// arrastar da saída para o vazio -> "Solid Steel Ingot" cria o próximo já ligado; segunda perna "Steel Pipe";
// Ctrl+Z desfaz a última; clicar na ligação abre o modal e Esc fecha com o foco no canvas; /#s= antigo cai em /balancer.
// As coordenadas vêm de window.__sfPlanner (cena, câmera e portas), ligado por ?debug=1. Sai com código != 0 se um passo
// falhar.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeOrExit } from './chrome.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2];
if (!base) { console.error('uso: smoke.js <url-base>'); process.exit(2); }

// Fábrica vazia (v2) no localStorage: o canvas abre sem o exemplo.
const EMPTY = Buffer.from(JSON.stringify({ v: 2, blocks: [], links: [] })).toString('base64url');
const STORE = 'sf-balancer:planner';

const browser = await chromium.launch({ executablePath: chromeOrExit() });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'en-US', reducedMotion: 'reduce' });
await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('smoke')) { sessionStorage.setItem('smoke', '1'); localStorage.setItem(k, v); } }, [STORE, EMPTY]);
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push(m.text()); });
pg.on('response', r => { if (r.status() >= 400 && !r.url().includes('/_vercel/insights/')) errs.push(`HTTP ${r.status()} ${r.url()}`); });

let fail = 0;
async function step(name, fn) {
  try { await fn(); console.log(`ok    ${name}`); }
  catch (e) { fail++; console.log(`FALHA ${name}: ${e.message.split('\n')[0]}`); }
}
const must = (ok, msg) => { if (!ok) throw new Error(msg); };

// O que o teste lê da página: blocos, ligações (com a montagem pronta ou não), câmera e portas.
const state = () => pg.evaluate(() => {
  const p = window.__sfPlanner;
  return p && {
    blocks: p.scene.blocks.map(b => ({ id: b.stage, rect: b.rect })),
    meios: p.scene.meios.map(m => ({ id: m.meio, rect: m.rect, ready: !!m.geo })),
    cam: p.cam, ports: p.ports,
  };
});
const waitFor = (fn, arg, what) => pg.waitForFunction(fn, arg, { timeout: 10000 }).catch(() => { throw new Error('esperando ' + what); });
const nBlocks = n => waitFor(k => window.__sfPlanner?.scene.blocks.length === k, n, `${n} bloco(s)`);
const nMeios = n => waitFor(k => window.__sfPlanner?.scene.meios.length === k, n, `${n} ligação(ões)`);
const box = () => pg.locator('canvas.pl-map-canvas').boundingBox();
const toScreen = async ([wx, wy]) => { const b = await box(), c = (await state()).cam; return [b.x + (wx - c.x) * c.zoom, b.y + (wy - c.y) * c.zoom]; };
const panelTitle = () => pg.locator('#pl-inspector .pl-bp-head').innerText().catch(() => '');
const pickFirst = async query => {
  await pg.waitForSelector('.pl-pick-in', { timeout: 5000 }).catch(() => { throw new Error('o seletor não abriu'); });
  await pg.keyboard.type(query);
  await pg.waitForTimeout(150);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('.pl-pick', { state: 'detached' });
};
// Puxa a saída do bloco até 160 px à direita dela (vazio) e escolhe a primeira receita da busca.
// Antes, a cena assenta: as ligações com a montagem pronta (o tamanho delas muda o lugar derivado dos blocos).
const settled = async () => {
  await waitFor(() => window.__sfPlanner.scene.meios.every(m => m.geo), null, 'a montagem das ligações');
  await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const extend = async (blockId, query) => {
  await settled();
  const s = await state(), port = s.ports.find(p => p.block === blockId && p.side === 'out');
  must(port, 'porta de saída de ' + blockId);
  const [x, y] = await toScreen([port.x, port.y]);
  await pg.mouse.move(x, y);
  await pg.mouse.down();
  for (let i = 1; i <= 10; i++) await pg.mouse.move(x + 16 * i, y, { steps: 1 });
  await pg.mouse.up();
  await pickFirst(query);
};
let first, second;

await step('canvas vazio', async () => {
  await pg.goto(`${base}/?debug=1&lang=en`, { waitUntil: 'load' });
  await waitFor(() => !!window.__sfPlanner, null, 'window.__sfPlanner');
  must((await state()).blocks.length === 0, 'o canvas não abriu vazio');
});
await step('duplo clique no vazio + "Pure Iron" + Enter cria o bloco', async () => {
  const b = await box();
  await pg.mouse.dblclick(b.x + b.width / 3, b.y + b.height / 2);
  await pickFirst('Pure Iron');
  await nBlocks(1);
  first = (await state()).blocks[0].id;
  must((await panelTitle()).includes('Pure Iron Ingot'), 'o bloco novo não é Pure Iron Ingot: ' + await panelTitle());
});
await step('arrastar da saída para o vazio + "Solid Steel Ingot" cria o bloco ligado', async () => {
  await extend(first, 'Solid Steel Ingot');
  await nBlocks(2);
  await nMeios(1);
  second = (await state()).blocks.find(b => b.id !== first).id;
  must((await panelTitle()).includes('Solid Steel Ingot'), 'o bloco novo não é Solid Steel Ingot: ' + await panelTitle());
});
await step('segunda perna "Steel Pipe"', async () => {
  await extend(second, 'Steel Pipe');
  await nBlocks(3);
  await nMeios(2);
  must((await panelTitle()).includes('Steel Pipe'), 'o bloco novo não é Steel Pipe: ' + await panelTitle());
});
await step('Ctrl+Z desfaz a última', async () => {
  await pg.locator('canvas.pl-map-canvas').focus();
  await pg.keyboard.press('Control+z');
  await nBlocks(2);
  await nMeios(1);
});
await step('clicar na ligação abre o modal; Esc fecha com o foco no canvas', async () => {
  await settled();
  const m = (await state()).meios[0];
  const [x, y] = await toScreen([m.rect.x + m.rect.w / 2, m.rect.y + m.rect.h / 2]);
  await pg.mouse.click(x, y);
  await pg.waitForSelector('dialog.pl-lig[open]', { timeout: 10000 });
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('dialog.pl-lig', { state: 'detached' });
  must(await pg.evaluate(() => document.activeElement?.classList.contains('pl-map-canvas')), 'o foco não voltou ao canvas');
});
await step('/#s= antigo cai em /balancer', async () => {
  const { shareHash } = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));
  await pg.goto(`${base}/${shareHash}`, { waitUntil: 'load' });
  await pg.waitForURL(u => u.pathname === '/balancer' || u.pathname === '/balancer.html', { timeout: 10000 });
  // O Balancer lê o #s= e limpa o endereço: o cenário (caso 1: 42 × 65 -> 60 × 40) tem que estar nos campos.
  await pg.waitForTimeout(300);
  const v = await pg.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
  must(['42', '65', '60', '40'].every(x => v.includes(x)), 'o Balancer não abriu o cenário do link: ' + JSON.stringify(v.slice(0, 8)));
});
await step('sem erro de console', async () => must(errs.length === 0, JSON.stringify(errs)));

await browser.close();
console.log(fail ? `${fail} passo(s) falharam` : 'smoke ok');
process.exit(fail ? 1 : 0);
