import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, RecipeBlock } from '../../src/planner/model/types.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { addBlock, connect, setCollect, setLimits } from '../../src/planner/model/factory.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { meioFor, meioPlan, meioUrl } from '../../src/planner/model/meio.ts';
import { balancerUrl, flowView } from '../../src/planner/model/ligacao.ts';
import { setLang, t } from '../../src/i18n/index.js';
import { decodeShare } from '../../src/logic/index.js';

const data = game as GameData;
// O exemplo com a sobra de ferro coletada (refinaria cheia, caso 1 com sink).
const f = setCollect(exampleFactory(data), data, 's1', 'Desc_IronIngot_C', true);
const flow = solveFactory(f, data);
const inLang = <T>(l: string, fn: () => T): T => { setLang(l); try { return fn(); } finally { setLang('pt'); } };
const meioDoExemplo = (linkId: string) => meioFor(f, linkId);
// As montagens completas (com view) do meio de ferro: uma com o balancer N→M e uma sem.
type FullAlt = { key: string; caseLabel: string; view: { bal?: { design: { N: number; M: number } } }; groups: unknown[] };
const fullAlts = () => (meioPlan(meioDoExemplo('l1'), f, flow, data) as unknown as { alternatives: FullAlt[] }).alternatives;
const altComBalancer = fullAlts().find(a => a.view.bal)!.key;
const altSemBalancer = fullAlts().find(a => !a.view.bal)!;

test('flowView da ligação de ferro do exemplo: SVG, título e balancer para o passo a passo', () => {
  const v = flowView(meioDoExemplo('l1'), f, flow, data, altComBalancer);
  assert.ok(v.svg.startsWith('<svg')); assert.equal(v.fluid, false);
  assert.match(v.title, /balancer \d+→\d+/); assert.ok(v.benches.length >= 1);
  assert.doesNotThrow(() => structuredClone(v));
  // O primeiro passo a passo é o balancer N→M da montagem, com os rótulos O1…/D1… de sempre.
  const d = fullAlts().find(a => a.key === altComBalancer)!.view.bal!.design;
  const b = v.benches[0];
  assert.equal(b.label, `balancer ${d.N}→${d.M}`); assert.equal(b.key, 'plan');
  assert.equal(b.ctx.N, d.N); assert.equal(b.ctx.M, d.M); assert.equal(b.ctx.belt, 'Mk4'); assert.equal(b.ctx.cap, 480);
  assert.equal(b.ctx.labels.ins.length, d.N); assert.equal(b.ctx.labels.outs.length, d.M);
  assert.match(b.ctx.labels.ins[0], /^O\d+$/); assert.match(b.ctx.labels.outs[0], /^D\d+$/);
  assert.equal(b.ctx.view, b.ctx.inUse);
});

test('montagem sem balancer: título com o caso, uma árvore por doadora', () => {
  const v = flowView(meioDoExemplo('l1'), f, flow, data, altSemBalancer.key);
  assert.equal(v.title, t('plLigTitle', altSemBalancer.caseLabel));
  assert.equal(v.benches.length, altSemBalancer.groups.length);
  assert.ok(v.benches.length >= 1);
  v.benches.forEach((b, i) => assert.equal(b.key, 'g' + i));
  for (const b of v.benches) { assert.equal(b.ctx.N, 1); assert.ok(b.ctx.M >= 2); assert.match(b.label, /^O\d+ ÷\d+/); }
  // Montagem que não existe mais: a primeira.
  assert.equal(flowView(meioDoExemplo('l1'), f, flow, data, 'sumiu').title, flowView(meioDoExemplo('l1'), f, flow, data, fullAlts()[0].key).title);
});

test('ligação fluida: desenho de canos e nenhum passo a passo', () => {
  const fake: GameData = {
    items: {
      F: { id: 'F', name: 'Fluid F', fluid: true, raw: false },
      X: { id: 'X', name: 'Thing X', fluid: false, raw: false },
    },
    recipes: {
      RP: { id: 'RP', name: 'Make F', alt: false, building: 'B', ins: [], outs: [{ item: 'F', perMin: 100 }] },
      RC: { id: 'RC', name: 'Use F', alt: false, building: 'B', ins: [{ item: 'F', perMin: 50 }], outs: [{ item: 'X', perMin: 10 }] },
    },
    extractors: {}, buildings: { B: { id: 'B', name: 'Box', w: 10, l: 10 } },
  };
  const rb = (id: string, recipe: string, machines: number): RecipeBlock =>
    ({ id, kind: 'recipe', recipe, clock: 100, perRow: null, tiers: {}, limits: { machines } });
  const ff: Factory = { v: 2, blocks: [rb('a', 'RP', 4), rb('b', 'RC', 8)], links: [{ id: 'l1', item: 'F', from: 'a', to: 'b' }] };
  const fl = solveFactory(ff, fake), me = meioFor(ff, 'l1');
  const alt = (meioPlan(me, ff, fl, fake) as unknown as { alternatives: { key: string }[] }).alternatives[0].key;
  const v = flowView(me, ff, fl, fake, alt);
  assert.ok(v.svg.startsWith('<svg')); assert.equal(v.fluid, true);
  assert.deepEqual(v.benches, []); assert.equal(v.loop, false);
});

test('ligação direta (só para a sobra) e sem limite: sem desenho nem passo a passo', () => {
  let d = addBlock(f, data, { kind: 'container' }, [0, 0]);
  d = connect(d, data, 's3', 's5', 'Desc_SteelPlate_C');
  const dme = meioFor(d, d.links[d.links.length - 1].id), dfl = solveFactory(d, data);
  assert.equal(meioPlan(dme, d, dfl, data).direct, true);
  const v = flowView(dme, d, dfl, data, '');
  assert.equal(v.svg, ''); assert.deepEqual(v.benches, []);
  assert.equal(v.title, t('plLigTitle', data.items.Desc_SteelPlate_C.name));
  const free = setLimits(setLimits(setLimits(setLimits(f, 's1', null), 's2', null), 's3', null), 's4', null);
  const u = flowView(meioFor(free, 'l1'), free, solveFactory(free, data), data, '');
  assert.equal(u.svg, ''); assert.deepEqual(u.benches, []); assert.equal(u.title, t('plLigTitle', t('plUnbounded')));
});

test('idioma: título e legenda no idioma pedido', () => {
  const v = inLang('es', () => flowView(meioDoExemplo('l1'), f, flow, data, altComBalancer));
  assert.match(v.title, /^Conexión/);
  assert.ok(v.svg.includes(inLang('es', () => t('svgAria'))));
  const en = inLang('en', () => flowView(meioDoExemplo('l1'), f, flow, data, altComBalancer));
  assert.match(en.title, /^Connection/); assert.match(en.benches[0].ctx.labels.ins[0], /^S\d+$/);
  assert.match(flowView(meioDoExemplo('l1'), f, flow, data, altComBalancer).title, /^Ligação/);
});

test('balancerUrl: o link do Balancer com esta ligação', () => {
  const me = meioDoExemplo('l1');
  assert.equal(balancerUrl(me, f, flow, data, 'es'), meioUrl(me, f, flow, data, 'es'));
  assert.match(balancerUrl(me, f, flow, data, 'en'), /^\/#s=/);
  // A montagem escolhida vai no link como selectedKey (a página Balancer abre com ela escolhida).
  const url = balancerUrl(me, f, flow, data, 'en', altComBalancer);
  const st = decodeShare(url.slice(url.indexOf('#s=') + 3))!;
  assert.equal(st.selectedKey, altComBalancer);
  assert.equal(decodeShare(balancerUrl(me, f, flow, data, 'en').split('#s=')[1])!.selectedKey, null);
});
