// Cenários fixos da linha de base visual. Cada um roda nos três idiomas (?lang=pt|en|es).
// As ações usam só ids e data-attributes, nunca texto, para valer em qualquer idioma.
// fuzzy: true = não compara pixels (3D/WebGL); só precisa existir e não ter erro de console.

const DESKTOP = { width: 1400, height: 1000 };
const MOBILE = { width: 390, height: 844 };

const setLib = async (pg, n, m, rate, style, view, per) => {
  await pg.fill('#libN', String(n));
  await pg.fill('#libM', String(m));
  await pg.fill('#libRate', String(rate));
  await pg.waitForTimeout(300);
  if (style) { await pg.click(`#libOut [data-style="${style}"]`); await pg.waitForTimeout(300); }
  if (view) { await pg.click(`#libOut [data-v2d="${view}"]`); await pg.waitForTimeout(300); }
  if (per) { await pg.click(`#libOut [data-per="${per}"]`); await pg.waitForTimeout(300); }
};
// Espera o planejador assentar: o histórico confirma a edição 500 ms depois (habilita o desfazer), então a captura
// só vale quando #out e os botões desfazer/refazer ficam iguais em duas leituras seguidas.
const settle = async pg => {
  const snap = () => pg.evaluate(() => document.getElementById('out').innerHTML + '|' + document.getElementById('undo').disabled + '|' + document.getElementById('redo').disabled);
  await pg.waitForTimeout(700);
  let prev = await snap();
  for (let i = 0; i < 50; i++) {
    await pg.waitForTimeout(100);
    const cur = await snap();
    if (cur === prev) return;
    prev = cur;
  }
};
// Builder pronto: a cena exposta com ?debug=1 e todas as ligações com a montagem calculada.
const BUILDER_STORE = ['sf-balancer:planner', 'sf-balancer:planner-map-hint', 'sf-balancer:planner-legend'];
const builderReady = async pg => {
  await pg.waitForFunction(() => window.__sfPlanner && window.__sfPlanner.scene.meios.every(m => m.geo), null, { timeout: 15000 });
  await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pg.waitForTimeout(300);
};
const blockRect = (pg, id) => pg.evaluate(i => window.__sfPlanner.scene.blocks.find(b => b.stage === i).rect, id);
const blockCenter = async (pg, id) => { const r = await blockRect(pg, id); return [r.x + r.w / 2, r.y + r.h / 2]; };
// Ponto do mundo (m) -> clique na tela, pela câmera do último quadro.
const clickWorld = async (pg, [wx, wy], opts) => {
  const box = await pg.locator('canvas.pl-map-canvas').boundingBox();
  const c = await pg.evaluate(() => window.__sfPlanner.cam);
  await pg.mouse.click(box.x + (wx - c.x) * c.zoom, box.y + (wy - c.y) * c.zoom, opts);
};
const toLibrary = pg => pg.locator('#library').scrollIntoViewIfNeeded();

export const scenarios = [
  { name: 'padrao', path: '/balancer.html', viewport: DESKTOP, actions: async () => {} },
  {
    name: 'caso2-destino-440', path: '/balancer.html', viewport: DESKTOP,
    // 44 máquinas x 40/min, 11 por linha = 4 linhas de 440
    actions: async pg => {
      await pg.fill('#dstGroups .g-count', '44');
      await pg.fill('#dstGroups .g-per', '11');
      await settle(pg);
    },
  },
  {
    name: 'caso3-6-por-linha', path: '/balancer.html', viewport: DESKTOP,
    actions: async pg => { await pg.fill('#srcGroups .g-per', '6'); await settle(pg); },
  },
  {
    name: 'modo-fluido', path: '/balancer.html', viewport: DESKTOP,
    actions: async pg => { await pg.check('input[name="medium"][value="fluid"]'); await pg.waitForTimeout(300); },
  },
  {
    name: 'lib-6x6-borboleta-esquema', path: '/balancer.html', viewport: DESKTOP,
    actions: async pg => { await setLib(pg, 6, 6, 240, 'butterfly', 'scheme'); await toLibrary(pg); },
  },
  {
    name: 'lib-6x6-borboleta-planta', path: '/balancer.html', viewport: DESKTOP,
    actions: async pg => { await setLib(pg, 6, 6, 240, 'butterfly', 'plan'); await toLibrary(pg); },
  },
  {
    name: 'lib-6x6-borboleta-planta-por-peca', path: '/balancer.html', viewport: DESKTOP,
    actions: async pg => { await setLib(pg, 6, 6, 240, 'butterfly', 'plan', 'piece'); await toLibrary(pg); },
  },
  {
    name: 'lib-9x9', path: '/balancer.html', viewport: DESKTOP,
    actions: async pg => { await setLib(pg, 9, 9, 240); await toLibrary(pg); },
  },
  {
    name: 'balao-de-ajuda', path: '/balancer.html', viewport: DESKTOP,
    actions: async pg => { await pg.click('#form .tip[data-tip="tipSrc"]'); await pg.waitForTimeout(300); },
  },
  { name: 'mobile-390', path: '/balancer.html', viewport: MOBILE, actions: async () => {} },
  {
    name: 'aba-3d', path: '/balancer.html', viewport: DESKTOP, fuzzy: true,
    actions: async pg => {
      await setLib(pg, 6, 6, 240, '3d');
      await toLibrary(pg);
      await pg.waitForTimeout(2500);
    },
  },
  // Builder (/, index.html; o Balancer fica em /balancer.html porque o vite preview não serve /balancer sem a extensão).
  // localStorage limpo = exemplo carregado. ?debug=1 liga window.__sfPlanner (cena, câmera e portas) para achar o ponto.
  { name: 'builder', path: '/?debug=1', viewport: DESKTOP, clearStore: BUILDER_STORE, actions: async pg => { await builderReady(pg); } },
  {
    // Bloco selecionado (Solid Steel Ingot, o s2 do exemplo): painel do bloco e cantoneiras.
    name: 'builder-bloco', path: '/?debug=1', viewport: DESKTOP, clearStore: BUILDER_STORE,
    actions: async pg => { await builderReady(pg); await clickWorld(pg, await blockCenter(pg, 's2')); await builderReady(pg); },
  },
  {
    // Seletor aberto por duplo clique no vazio (abaixo do primeiro bloco).
    name: 'builder-seletor', path: '/?debug=1', viewport: DESKTOP, clearStore: BUILDER_STORE,
    actions: async pg => {
      await builderReady(pg);
      const r = await blockRect(pg, 's1');
      await clickWorld(pg, [r.x + r.w / 2, r.y + r.h + 24], { clickCount: 2 });
      await pg.waitForSelector('.pl-pick');
      await pg.waitForTimeout(300);
    },
  },
  {
    // Seletor só no teclado: o botão "+ bloco" (Enter), busca digitada e setas.
    name: 'builder-seletor-teclado', path: '/?debug=1', viewport: DESKTOP, clearStore: BUILDER_STORE,
    actions: async pg => {
      await builderReady(pg);
      await pg.focus('.pl-map-add');
      await pg.keyboard.press('Enter');
      await pg.waitForSelector('.pl-pick-in');
      await pg.keyboard.type('iron');
      await pg.keyboard.press('ArrowDown');
      await pg.keyboard.press('ArrowDown');
      await pg.waitForTimeout(300);
    },
  },
  {
    // Clique na ligação do ferro (s1 > s2): o modal com o desenho do fluxo.
    name: 'builder-ligacao', path: '/?debug=1', viewport: DESKTOP, clearStore: BUILDER_STORE,
    actions: async pg => {
      await builderReady(pg);
      const r = await pg.evaluate(() => window.__sfPlanner.scene.meios.find(m => m.meio.startsWith('Desc_IronIngot_C')).rect);
      await clickWorld(pg, [r.x + r.w / 2, r.y + r.h / 2]);
      await pg.waitForSelector('dialog.pl-lig[open] .pl-lig-svg svg', { timeout: 10000 });
      await pg.waitForTimeout(300);
    },
  },
];

// Rotas reais (/pt, /es e /pt/balancer, /es/balancer): só existem com o servidor aplicando as rewrites do vercel.json
// (docker compose, ou o site).
export const routeScenarios = [
  { name: 'rota-pt', path: '/pt?debug=1', lang: 'pt', viewport: DESKTOP, clearStore: BUILDER_STORE, actions: builderReady },
  { name: 'rota-es', path: '/es?debug=1', lang: 'es', viewport: DESKTOP, clearStore: BUILDER_STORE, actions: builderReady },
  { name: 'rota-pt-balancer', path: '/pt/balancer', lang: 'pt', viewport: DESKTOP, actions: async () => {} },
  { name: 'rota-es-balancer', path: '/es/balancer', lang: 'es', viewport: DESKTOP, actions: async () => {} },
];

export const LANGS = ['pt', 'en', 'es'];
