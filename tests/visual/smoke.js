// uso: node tests/visual/smoke.js <url-base>   (ex.: npm run smoke -- http://localhost:4173, contra o npm run preview)
// Smoke dos gestos do builder, de ponta a ponta: canvas vazio (o tutorial abre sozinho; Skip fecha e não volta no
// reload; o botão Tutorial reabre e Next chega ao fim pulando os passos sem alvo; Esc fecha o "? How to use") -> duplo clique -> "Pure Iron" + Enter cria o bloco;
// arrastar da saída para o vazio -> "Solid Steel Ingot" cria o próximo já ligado; segunda perna "Steel Pipe";
// Ctrl+Z desfaz a última; (na Montar) clicar no chip abre o mini painel, Ver montagem abre o modal e Esc fecha com o foco
// no canvas; Desligar some com a ligação e Ctrl+Z a traz de volta; o botão Planta em escala troca a vista e as portas
// continuam pegáveis (arrastar para o vazio abre o seletor); arrastar um bloco na Planta não mexe no cartão da Montar
// (cada vista com as suas posições); Shift + arrastar no vazio seleciona os blocos e Esc limpa;
// Ctrl+A + Delete apaga todos e um Ctrl+Z os traz de volta; a etapa do Pure Iron em "Mergers no meio" muda a ligação;
// importar duo.sfmd (input de arquivo) cria os 6 blocos e um Ctrl+Z volta;
// Camadas "Machines only" tira portas e chips; /#s= antigo cai em /balancer.
// As coordenadas vêm de window.__sfPlanner (cena, câmera, portas, vista e a geometria de tela do último quadro), ligado
// por ?debug=1. Sai com código != 0 se um passo falhar.
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
// Tutorial: abre sozinho na primeira visita (localStorage limpo); "Skip" fecha, fica lembrado e não volta no reload.
const TOUR = 'sf-balancer:planner-tour';
const tourKey = () => pg.evaluate(k => localStorage.getItem(k), TOUR);
await step('tutorial abre na primeira visita; Skip fecha e não volta no reload', async () => {
  await pg.waitForSelector('.pl-tour-box[data-ready]', { timeout: 5000 }).catch(() => { throw new Error('o tutorial não abriu'); });
  must(await tourKey() === null, 'tutorial já marcado antes de pular');
  await pg.getByRole('button', { name: 'Skip', exact: true }).click();
  await pg.waitForSelector('.pl-tour', { state: 'detached', timeout: 3000 });
  must(await tourKey() === 'skipped', 'Skip não ficou lembrado: ' + await tourKey());
  await pg.reload({ waitUntil: 'load' });
  await waitFor(() => !!window.__sfPlanner, null, 'window.__sfPlanner');
  await pg.waitForTimeout(1500);
  must(await pg.locator('.pl-tour').count() === 0, 'o tutorial voltou depois do reload');
});
await step('botão Tutorial reabre; com a fábrica vazia os passos sem alvo são pulados e Next chega ao fim', async () => {
  await pg.locator('[data-tour="map-tour"]').click();
  await pg.waitForSelector('.pl-tour-box[data-ready]', { timeout: 3000 }).catch(() => { throw new Error('o botão Tutorial não abriu'); });
  const seen = [];
  for (let k = 0; k < 25 && await pg.locator('.pl-tour').count(); k++) {
    seen.push(await pg.locator('.pl-tour-box h2').innerText());
    await pg.locator('.pl-tour-box .pl-primary').click();
    await pg.waitForTimeout(60);
  }
  must(await pg.locator('.pl-tour').count() === 0, 'o tutorial travou: ' + seen.join(' | '));
  must(!seen.includes('Connect from a port') && !seen.includes('The connection chip'), 'passo sem alvo apareceu: ' + seen.join(' | '));
  must(await tourKey() === 'done', 'Finish não marcou done: ' + await tourKey());
  // Esc pula: o "? Como mexer" do mapa abre e Esc fecha com o foco de volta no botão.
  await pg.locator('.pl-map-help').click();
  await pg.waitForSelector('.pl-tour-box[data-ready]', { timeout: 3000 }).catch(() => { throw new Error('o "? How to use" não abriu'); });
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('.pl-tour', { state: 'detached', timeout: 3000 });
  must(await pg.evaluate(() => document.activeElement?.classList.contains('pl-map-help')), 'o foco não voltou ao botão');
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
await step('clicar no chip abre o mini painel; Ver montagem abre o modal; Esc fecha com o foco no canvas', async () => {
  await settled();
  must((await pg.evaluate(() => window.__sfPlanner.mode)) === 'montar', 'o builder não abriu na Montar');
  const b = await box(), ch = await pg.evaluate(() => window.__sfPlanner.view.chips[0]);
  must(ch, 'sem chip na tela');
  await pg.mouse.click(b.x + ch.x, b.y + ch.y);
  await pg.waitForSelector('.pl-chip-pop[role=dialog]', { timeout: 5000 });
  must(await pg.evaluate(() => document.activeElement?.classList.contains('pl-primary')), 'o foco não foi para Ver montagem');
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('dialog.pl-lig[open]', { timeout: 10000 });
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('dialog.pl-lig', { state: 'detached' });
  must(await pg.evaluate(() => document.activeElement?.classList.contains('pl-map-canvas')), 'o foco não voltou ao canvas');
});
await step('Desligar no mini painel some com a ligação; Ctrl+Z volta', async () => {
  await settled();
  const b = await box(), ch = await pg.evaluate(() => window.__sfPlanner.view.chips[0]);
  must(ch, 'sem chip na tela');
  await pg.mouse.click(b.x + ch.x, b.y + ch.y);
  await pg.waitForSelector('.pl-chip-pop[role=dialog]', { timeout: 5000 });
  await pg.click('.pl-chip-pop .pl-chip-pop-unlink');
  await nMeios(0);
  await pg.waitForSelector('.pl-chip-pop', { state: 'detached' });
  await pg.locator('canvas.pl-map-canvas').focus();
  await pg.keyboard.press('Control+z');
  await nMeios(1);
  must((await state()).blocks.length === 2, 'Desligar/Ctrl+Z mexeu nos blocos');
});
await step('Planta em escala troca a vista e as portas continuam pegáveis', async () => {
  await pg.locator('.pl-view button').nth(1).click();
  await waitFor(() => window.__sfPlanner?.mode === 'planta', null, "mode === 'planta'");
  await settled();
  const b = await box(), port = await pg.evaluate(id => window.__sfPlanner.view.ports.find(p => p.block === id && p.side === 'out'), second);
  must(port, 'porta de saída de ' + second + ' na Planta');
  const x = b.x + port.x, y = b.y + port.y;
  await pg.mouse.move(x, y);
  await pg.mouse.down();
  for (let i = 1; i <= 10; i++) await pg.mouse.move(x + 16 * i, y, { steps: 1 });
  await pg.mouse.up();
  await pg.waitForSelector('.pl-pick-in', { timeout: 5000 }).catch(() => { throw new Error('a porta na Planta não abriu o seletor'); });
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('.pl-pick', { state: 'detached' });
  must((await state()).blocks.length === 2, 'o seletor fechado criou bloco');
  await pg.locator('.pl-view button').nth(0).click();
  await waitFor(() => window.__sfPlanner?.mode === 'montar', null, "mode === 'montar'");
});
await step('arrastar um bloco na Planta não mexe na Montar (Mover junto desligado)', async () => {
  await settled();
  const at = () => pg.evaluate(id => { const b = window.__sfPlanner.scene.blocks.find(x => x.stage === id); return { card: b.card, rect: b.rect }; }, first);
  const before = await at();
  must(Array.isArray(before.card), 'a cena não traz o lugar do cartão na Montar');
  await pg.locator('.pl-view button').nth(1).click();
  await waitFor(() => window.__sfPlanner?.mode === 'planta' && window.__sfPlanner.t === 1, null, "mode === 'planta'");
  await settled();
  const b = await box(), r = await pg.evaluate(id => window.__sfPlanner.view.blocks.find(x => x.id === id).rect, first);
  const x = b.x + r.x + r.w / 2, y = b.y + r.y + r.h / 2;
  await pg.mouse.move(x, y);
  await pg.mouse.down();
  for (let i = 1; i <= 10; i++) await pg.mouse.move(x, y + 12 * i, { steps: 1 });
  await pg.mouse.up();
  await waitFor(([id, y0]) => window.__sfPlanner.scene.blocks.find(s => s.stage === id).rect.y !== y0, [first, before.rect.y], 'o bloco andar na Planta');
  await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const after = await at();
  must(JSON.stringify(after.card) === JSON.stringify(before.card), `a Montar mudou: ${JSON.stringify(before.card)} → ${JSON.stringify(after.card)}`);
  await pg.keyboard.press('Escape');
  await pg.locator('.pl-view button').nth(0).click();
  await waitFor(() => window.__sfPlanner?.mode === 'montar', null, "mode === 'montar'");
  const back = await at();
  must(JSON.stringify(back.card) === JSON.stringify(before.card), 'a Montar mudou ao voltar');
});
await step('Shift + arrastar no vazio seleciona os blocos dentro do retângulo; Esc limpa', async () => {
  await settled();
  const b = await box(), rs = await pg.evaluate(() => window.__sfPlanner.view.blocks.map(x => x.rect));
  must(rs.length === 2, 'esperava 2 blocos na tela');
  const x0 = Math.min(...rs.map(r => r.x)) - 60, y0 = Math.min(...rs.map(r => r.y)) - 60;
  const x1 = Math.max(...rs.map(r => r.x + r.w)) + 20, y1 = Math.max(...rs.map(r => r.y + r.h)) + 20;
  await pg.keyboard.down('Shift');
  await pg.mouse.move(b.x + x0, b.y + y0);
  await pg.mouse.down();
  await pg.mouse.move(b.x + x1, b.y + y1, { steps: 8 });
  must(await pg.locator('.pl-marquee').count() === 1, 'o retângulo de seleção não apareceu');
  await pg.mouse.up();
  await pg.keyboard.up('Shift');
  await pg.locator('#pl-inspector .pl-sel-acts').waitFor({ timeout: 5000 }).catch(() => { throw new Error('o painel não mostrou a seleção múltipla'); });
  await pg.locator('canvas.pl-map-canvas').focus();
  await pg.keyboard.press('Escape');
  await pg.locator('#pl-inspector .pl-sel-acts').waitFor({ state: 'detached', timeout: 5000 }).catch(() => { throw new Error('Esc não limpou a seleção'); });
});
await step('Ctrl+A seleciona tudo, Delete apaga todos, um Ctrl+Z traz todos de volta', async () => {
  const n = (await state()).blocks.length;
  must(n >= 2, 'esperava 2+ blocos');
  await pg.locator('canvas.pl-map-canvas').focus();
  await pg.keyboard.press('Control+a');
  await pg.locator('#pl-inspector .pl-sel-acts').waitFor({ timeout: 5000 }).catch(() => { throw new Error('Ctrl+A não selecionou tudo'); });
  await pg.keyboard.press('Delete');
  await nBlocks(0);
  await nMeios(0);
  await pg.locator('canvas.pl-map-canvas').focus();
  await pg.keyboard.press('Control+z');
  await nBlocks(n);
  await nMeios(1);
});
await step('etapa do Pure Iron: "Mergers no meio" muda as linhas da ligação; volta ao mapa', async () => {
  await settled();
  const geoOf = () => pg.evaluate(() => { const m = window.__sfPlanner.scene.meios[0]; return m && JSON.stringify([m.rect, m.geo?.pieces.length]); });
  const before = await geoOf();
  const b = await box(), r = await pg.evaluate(id => window.__sfPlanner.view.blocks.find(x => x.id === id).rect, first);
  await pg.mouse.dblclick(b.x + r.x + r.w / 2, b.y + r.y + r.h / 2);
  await pg.waitForSelector('input[type=radio][value=center]', { timeout: 10000 }).catch(() => { throw new Error('a tela da etapa não abriu'); });
  await pg.locator('input[type=radio][value=center]').check({ force: true });
  await pg.getByRole('button', { name: 'Back to map' }).first().click();
  await pg.waitForSelector('canvas.pl-map-canvas', { timeout: 5000 });
  await settled();
  await waitFor(b0 => { const m = window.__sfPlanner.scene.meios[0]; return JSON.stringify([m.rect, m.geo?.pieces.length]) !== b0; }, before, 'a ligação mudar com o modelo Mergers no meio');
});
await step('Camadas: "Machines only" tira portas e chips; ligar de volta traz', async () => {
  await settled();
  await pg.locator('.pl-layers-btn').click();
  await pg.getByRole('button', { name: 'Machines only' }).click();
  const saved = () => pg.evaluate(() => JSON.parse(localStorage.getItem('sf-balancer:planner-layers') || '{}'));
  await waitFor(() => Object.values(JSON.parse(localStorage.getItem('sf-balancer:planner-layers') || '{}')).length === 4 && Object.values(JSON.parse(localStorage.getItem('sf-balancer:planner-layers'))).every(v => v === false), null, 'as quatro camadas desligadas');
  // Chip escondido não pega o clique: o mini painel não abre.
  const b = await box(), ch = await pg.evaluate(() => window.__sfPlanner.view.chips[0]);
  must(ch, 'sem chip na vista para conferir o clique escondido');
  await pg.mouse.click(b.x + ch.x, b.y + ch.y);
  must(await pg.locator('.pl-chip-pop').count() === 0, 'o chip escondido abriu o mini painel');
  if (!await pg.locator('.pl-layers-pop').count()) await pg.locator('.pl-layers-btn').click();
  for (const c of await pg.locator('.pl-layers-pop input[type=checkbox]').all()) await c.check();
  await pg.waitForTimeout(150);
  must(Object.values(await saved()).every(v => v === true), 'as camadas não voltaram');
  await pg.keyboard.press('Escape');
});
await step('importar duo.sfmd pelo input de arquivo cria os blocos; um Ctrl+Z volta', async () => {
  await pg.goto(`${base}/?debug=1`, { waitUntil: 'load' });
  await waitFor(() => !!window.__sfPlanner, null, 'window.__sfPlanner');
  await settled();
  const before = (await state()).blocks.length;
  await pg.setInputFiles('input[type=file][accept*=".sfmd"]', path.join(here, '../../docs/superpowers/research/2026-10-26-fase5/sfmd/duo.sfmd'));
  await pg.waitForSelector('dialog.pl-imp[open]', { timeout: 5000 }).catch(() => { throw new Error('o resumo da importação não abriu'); });
  await pg.locator('dialog.pl-imp .pl-primary').click();
  await nBlocks(6);
  await pg.locator('.pl-imp-done').waitFor({ state: 'attached' });
  await pg.keyboard.press('Control+z');
  await nBlocks(before);
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
