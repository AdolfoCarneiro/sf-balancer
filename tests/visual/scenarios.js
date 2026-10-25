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
const toLibrary = pg => pg.locator('#library').scrollIntoViewIfNeeded();

export const scenarios = [
  { name: 'padrao', path: '/', viewport: DESKTOP, actions: async () => {} },
  {
    name: 'caso2-destino-440', path: '/', viewport: DESKTOP,
    // 44 máquinas x 40/min, 11 por linha = 4 linhas de 440
    actions: async pg => {
      await pg.fill('#dstGroups .g-count', '44');
      await pg.fill('#dstGroups .g-per', '11');
      await settle(pg);
    },
  },
  {
    name: 'caso3-6-por-linha', path: '/', viewport: DESKTOP,
    actions: async pg => { await pg.fill('#srcGroups .g-per', '6'); await settle(pg); },
  },
  {
    name: 'modo-fluido', path: '/', viewport: DESKTOP,
    actions: async pg => { await pg.check('input[name="medium"][value="fluid"]'); await pg.waitForTimeout(300); },
  },
  {
    name: 'lib-6x6-borboleta-esquema', path: '/', viewport: DESKTOP,
    actions: async pg => { await setLib(pg, 6, 6, 240, 'butterfly', 'scheme'); await toLibrary(pg); },
  },
  {
    name: 'lib-6x6-borboleta-planta', path: '/', viewport: DESKTOP,
    actions: async pg => { await setLib(pg, 6, 6, 240, 'butterfly', 'plan'); await toLibrary(pg); },
  },
  {
    name: 'lib-6x6-borboleta-planta-por-peca', path: '/', viewport: DESKTOP,
    actions: async pg => { await setLib(pg, 6, 6, 240, 'butterfly', 'plan', 'piece'); await toLibrary(pg); },
  },
  {
    name: 'lib-9x9', path: '/', viewport: DESKTOP,
    actions: async pg => { await setLib(pg, 9, 9, 240); await toLibrary(pg); },
  },
  {
    name: 'balao-de-ajuda', path: '/', viewport: DESKTOP,
    actions: async pg => { await pg.click('#form .tip[data-tip="tipSrc"]'); await pg.waitForTimeout(300); },
  },
  { name: 'mobile-390', path: '/', viewport: MOBILE, actions: async () => {} },
  {
    name: 'aba-3d', path: '/', viewport: DESKTOP, fuzzy: true,
    actions: async pg => {
      await setLib(pg, 6, 6, 240, '3d');
      await toLibrary(pg);
      await pg.waitForTimeout(2500);
    },
  },
  // Planner 2D (/planner.html: o vite preview não serve /planner sem a extensão). localStorage limpo = exemplo carregado.
  { name: 'planner', path: '/planner.html', viewport: DESKTOP, clearStore: 'sf-balancer:planner', actions: async pg => { await pg.waitForSelector('.react-flow__node-stage'); } },
  {
    name: 'planner-etapa', path: '/planner.html', viewport: DESKTOP, clearStore: 'sf-balancer:planner',
    actions: async pg => {
      await pg.waitForSelector('.react-flow__node-stage');
      const f = pg.locator('.react-flow__node-stage', { hasText: 'Foundry' });
      await (await f.count() ? f.first() : pg.locator('.react-flow__node-stage').last()).dblclick();
      await pg.waitForTimeout(500);
    },
  },
];

// Rotas reais (/pt e /es): só existem com o servidor aplicando as rewrites do vercel.json.
export const routeScenarios = [
  { name: 'rota-pt', path: '/pt', lang: 'pt', viewport: DESKTOP, actions: async () => {} },
  { name: 'rota-es', path: '/es', lang: 'es', viewport: DESKTOP, actions: async () => {} },
];

export const LANGS = ['pt', 'en', 'es'];
