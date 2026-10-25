import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, RecipeBlock } from '../../src/planner/model/types.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { meiosOf, setClock, setCollect, setLimits, setPerRow } from '../../src/planner/model/factory.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { meioFor, meioInput, meioPlan, meioSummary, lineOwner, meioHash, meioUrl, MEIO_MAX_LINES } from '../../src/planner/model/meio.ts';
import { computePlan, decodeShare } from '../../src/logic/index.js';
import { getLang, setLang, parseNum } from '../../src/i18n/index.js';

const data = game as GameData;
// O exemplo com a sobra de ferro coletada: a refinaria roda cheia (2.730) e a sobra vai pro sink, como o caso 1.
const comSobra = (): Factory => setCollect(exampleFactory(data), data, 's1', 'Desc_IronIngot_C', true);

test('meio: refinarias → fundições com a sobra coletada é o caso 1 do AGENTS.md, igual ao computePlan direto', () => {
  const f = comSobra(), flow = solveFactory(f, data);
  const me = meioFor(f, 'l1'); const p = meioPlan(me, f, flow, data);
  const direct = computePlan({ cap: 480, policy: 'sink', excess: 'represar', conv: 'k-1', medium: 'item',
    srcGroups: [{ driver: 'clock', count: 42, clock: 100, nominal: 65, per: 7 }],
    dstGroups: [{ driver: 'clock', count: 60, clock: 100, nominal: 40, per: 12 }] });
  assert.equal(p.supply, 2730); assert.equal(p.demand, 2400); assert.equal(p.policy, 'sink');
  assert.equal(p.alternatives[0].key, direct.alternatives[0].key);
  const sum = meioSummary(p);
  assert.equal(sum.caseLabel, direct.alternatives[0].caseLabel);
  assert.equal(sum.leftover, 330); assert.equal(sum.short, 0);
  assert.equal(me.id, 'Desc_IronIngot_C:s1>s2');
});

test('meio: sem coleta, a refinaria fixada só entrega o que as fundições pedem (o resto represa nela)', () => {
  const f = exampleFactory(data), flow = solveFactory(f, data);
  const p = meioPlan(meioFor(f, 'l1'), f, flow, data);
  assert.equal(p.policy, 'represar');
  assert.ok(Math.abs(p.supply - 2400) < 1e-6 && Math.abs(p.demand - 2400) < 1e-6);
  assert.equal(p.src.lines.length, 6);
});

test('meio: aço dividido entre vigas e canos é um meio só, em Mk5, com 4 linhas para cada lado', () => {
  const f = exampleFactory(data), flow = solveFactory(f, data);
  const me = meiosOf(f).find(x => x.item === 'Desc_SteelIngot_C')!;
  assert.deepEqual([me.producers, me.consumers], [['s2'], ['s3', 's4']]);
  assert.deepEqual([...me.links].sort(), ['l2', 'l3']);
  assert.equal(meiosOf(f).length, 2);
  assert.equal(meioFor(f, 'l3').id, me.id);
  const p = meioPlan(me, f, flow, data);
  assert.equal(p.cap, 780); assert.equal(p.supply, 3600); assert.equal(p.demand, 3600);
  const owners = p.dst.lines.map(l => lineOwner(me, 'dst', l));
  assert.equal(owners.filter(o => o === 's3').length, 4); assert.equal(owners.filter(o => o === 's4').length, 4);
  assert.ok(p.src.lines.every(l => lineOwner(me, 'src', l) === 's2'));
});

test('meio: link do meio completo abre com os mesmos números em pt, en e es', () => {
  const f0 = comSobra();
  const f = setPerRow(setClock(f0, 's1', 212.5), 's1', 3), flow = solveFactory(f, data);
  const hash = meioHash(meioFor(f, 'l1'), f, flow, data);
  assert.ok(hash.startsWith('#s='));
  const st = decodeShare(hash.slice(3))!;
  assert.equal(st.lang, 'en'); assert.equal(st.src[0].clock, '212.5'); assert.equal(st.src[0].per, '3'); assert.equal(st.belt, 'Mk4');
  assert.deepEqual(st.dst[0], { driver: 'clock', count: '60', clock: '100', nominal: '40', total: '', per: '12' });
  assert.equal(st.medium, 'item'); assert.equal(st.item, data.items['Desc_IronIngot_C'].name);
  assert.equal(meioUrl(meioFor(f, 'l1'), f, flow, data, 'pt'), '/pt' + hash);
  // A página lê os números no idioma do link ('en') e converte para o dela: em 'en', '2.125' é 2,125 (em 'pt' seria 2125).
  const prev = getLang(); setLang('en'); assert.equal(parseNum('2.125'), 2.125); setLang(prev);
});

test('meio: item fluido sai em modo fluido, cano, sem sink', () => {
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
  const rb = (id: string, recipe: string, machines: number, collect?: string[]): RecipeBlock =>
    ({ id, kind: 'recipe', recipe, clock: 100, perRow: null, tiers: {}, limits: { machines }, ...(collect ? { collect } : {}) });
  // Coleta marcada no fluido (estado antigo): a sobra represa mesmo assim.
  const f: Factory = { v: 2, blocks: [rb('a', 'RP', 4, ['F']), rb('b', 'RC', 8)], links: [{ id: 'l1', item: 'F', from: 'a', to: 'b' }] };
  const flow = solveFactory(f, fake), me = meioFor(f, 'l1');
  assert.equal(meioInput(me, f, flow, fake).medium, 'fluid'); assert.equal(meioPlan(me, f, flow, fake).policy, 'represar');
  const share = decodeShare(meioHash(me, f, flow, fake).slice(3))!;
  assert.equal(share.medium, 'fluid'); assert.equal(share.pipe, 'Mk2'); assert.equal(share.policy, 'represar');
  assert.equal(meioInput(me, f, flow, fake).policy, 'represar');
});

test('meio: acima de MEIO_MAX_LINES não chama o computePlan e volta rápido, com os totais', () => {
  const f0 = exampleFactory(data);
  const big = setPerRow(setLimits(f0, 's1', { machines: 3000 }), 's1', 7), flow = solveFactory(big, data);
  const me = meioFor(big, 'l1');
  const t0 = Date.now(); const p = meioPlan(me, big, flow, data); const sum = meioSummary(p);
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(p.tooLarge && p.tooLarge.src > MEIO_MAX_LINES); assert.equal(sum.tooLarge, p.tooLarge);
  assert.equal(p.alternatives.length, 0); assert.ok(p.supply > 0 && p.demand === 2400);
  const ex = meioPlan(meioFor(f0, 'l1'), f0, solveFactory(f0, data), data);
  assert.equal(ex.tooLarge, undefined); assert.equal(meioSummary(ex).tooLarge, null);
});
