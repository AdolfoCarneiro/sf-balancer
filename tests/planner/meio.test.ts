import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, Layout, RecipeBlock } from '../../src/planner/model/types.ts';
import { solvedStage } from '../../src/planner/model/solved.ts';
import { arrange, arrangementLines } from '../../src/planner/model/layout.ts';
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
  assert.equal(meioUrl(meioFor(f, 'l1'), f, flow, data, 'pt'), '/pt/balancer' + hash);
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

// ---- O arranjo das fileiras nas ligações (fase 4) ----
const withLayout = (f: Factory, id: string, layout: Layout): Factory =>
  ({ ...f, blocks: f.blocks.map(b => (b.id === id ? { ...(b as RecipeBlock), layout } : b)) });
const groupsOf = (inp: { srcGroups: unknown; dstGroups: unknown; cap: number; tier: string; policy: string }) =>
  ({ srcGroups: inp.srcGroups, dstGroups: inp.dstGroups, cap: inp.cap, tier: inp.tier, policy: inp.policy });

test('meio: sem arranjo, os grupos do exemplo são exatamente os de antes da fase 4', () => {
  // Gravado do meioInput no commit 3f0dabc (antes do arranjo valer nas ligações).
  const f = exampleFactory(data), flow = solveFactory(f, data);
  const iron = meioInput(meioFor(f, 'l1'), f, flow, data), steel = meioInput(meioFor(f, 'l2'), f, flow, data);
  assert.deepEqual(groupsOf(iron), {
    srcGroups: [{ driver: 'clock', count: 42, clock: 87.9120879120879, nominal: 65, per: 7 }],
    dstGroups: [{ driver: 'clock', count: 60, clock: 100, nominal: 40, per: 12 }], cap: 480, tier: 'Mk4', policy: 'represar',
  });
  assert.deepEqual(groupsOf(steel), {
    srcGroups: [{ driver: 'clock', count: 60, clock: 100, nominal: 60, per: 12 }],
    dstGroups: [{ driver: 'clock', count: 30, clock: 100, nominal: 60, per: 8 }, { driver: 'clock', count: 60, clock: 100, nominal: 30, per: 16 }],
    cap: 780, tier: 'Mk5', policy: 'represar',
  });
  assert.deepEqual(iron.owners, { src: ['s1'], dst: ['s2'] });
  assert.deepEqual(steel.owners, { src: ['s2'], dst: ['s3', 's4'] });
});

test('meio: refinaria em Mergers no meio entrega as linhas do arranjo (6 de 455), agrupadas por tamanho', () => {
  const f = withLayout(comSobra(), 's1', { kind: 'center' }), flow = solveFactory(f, data);
  const me = meioFor(f, 'l1'), inp = meioInput(me, f, flow, data);
  assert.deepEqual(inp.srcGroups, [{ driver: 'clock', count: 42, clock: 100, nominal: 65, per: 7 }]);
  assert.equal(inp.tier, 'Mk4');
  const p = meioPlan(me, f, flow, data);
  assert.deepEqual(p.src.lines.map(l => [l.machines, l.rate]), Array(6).fill([7, 455]));
  // Corte 5: a linha atravessa os pares (ceil(42 / 5) = 9 saídas, contra 5 + 5 fechando cada par de 21): trechos de
  // 5 e o resto, 2. Dois grupos, o clock igual nos dois.
  const g = withLayout(comSobra(), 's1', { kind: 'center', belts: { 'out:Desc_IronIngot_C': { cut: 5, exit: 'down' } } });
  const gi = meioInput(meioFor(g, 'l1'), g, solveFactory(g, data), data);
  assert.deepEqual(gi.srcGroups, [
    { driver: 'clock', count: 40, clock: 100, nominal: 65, per: 5 }, { driver: 'clock', count: 2, clock: 100, nominal: 65, per: 2 },
  ]);
  assert.deepEqual(gi.owners.src, ['s1', 's1']);
  const gp = meioPlan(meioFor(g, 'l1'), g, solveFactory(g, data), data);
  assert.deepEqual(gp.src.lines.map(l => l.machines).sort((a, b) => b - a), [5, 5, 5, 5, 5, 5, 5, 5, 2]);
  assert.ok(gp.src.lines.every(l => lineOwner(meioFor(g, 'l1'), 'src', l, gp) === 's1'));
});

test('meio: fundição em Mergers no meio invertido recebe as linhas de entrada do arranjo; os donos seguem os grupos', () => {
  const f = withLayout(comSobra(), 's2', { kind: 'center', invert: true }), flow = solveFactory(f, data);
  const st = solvedStage(f.blocks[1] as RecipeBlock, flow.blocks.s2);
  const lines = arrangementLines(arrange(st, data, st.layout), 'in', 'Desc_IronIngot_C');
  const me = meioFor(f, 'l1'), inp = meioInput(me, f, flow, data), p = meioPlan(me, f, flow, data);
  const sizes = [...new Set(lines)];
  assert.deepEqual(inp.dstGroups.map(x => [x.count, x.per]), sizes.map(k => [k * lines.filter(n => n === k).length, k]));
  assert.ok(sizes.length > 1, `linhas ${lines}`);
  assert.deepEqual(p.dst.lines.map(l => l.machines).sort((a, b) => b - a), [...lines].sort((a, b) => b - a));
  // O aço sai da fundição s2 em center (a saída por fileira): as consumidoras s3 e s4 continuam donas das linhas delas.
  const h = withLayout(exampleFactory(data), 's3', { kind: 'center' }), hf = solveFactory(h, data);
  const steel = meioFor(h, 'l2'), sp = meioPlan(steel, h, hf, data), si = meioInput(steel, h, hf, data);
  assert.ok(si.owners.dst.length > 2, `donos ${si.owners.dst}`);
  const mine = (id: string) => sp.dst.lines.filter(l => lineOwner(steel, 'dst', l, sp) === id).reduce((s, l) => s + l.machines, 0);
  assert.equal(mine('s3'), hf.blocks.s3.machines); assert.equal(mine('s4'), hf.blocks.s4.machines);
});

test('meio: simples (ou costas com costas) só com fileiras viradas/deslocadas dá os grupos e as linhas de sem arranjo', () => {
  // s3 (Steel Beam) tem 30 máquinas de 8: a última fileira de 6 continua "partial" no plano, como sem arranjo.
  const base = exampleFactory(data), flow = solveFactory(base, data);
  const steel = (f: Factory) => { const me = meioFor(f, 'l2'); return { inp: meioInput(me, f, flow, data), plan: meioPlan(me, f, flow, data) }; };
  const ref = steel(base);
  assert.ok(ref.plan.dst.lines.some(l => l.partial));
  for (const layout of [
    { kind: 'simple', rows: { 1: { flip: true }, 2: { mirror: true, dx: 8 } } },
    { kind: 'backToBack', invert: true },
  ] as Layout[]) {
    const f = withLayout(withLayout(base, 's3', layout), 's2', layout), got = steel(f);
    assert.deepEqual(got.inp, ref.inp, layout.kind);
    assert.deepEqual(got.plan.src.lines, ref.plan.src.lines); assert.deepEqual(got.plan.dst.lines, ref.plan.dst.lines);
  }
  // Com esteira editada já vale o arranjo.
  const cut = withLayout(base, 's3', { kind: 'simple', belts: { 'in:Desc_SteelIngot_C': { cut: 4, exit: 'down' } } });
  assert.notDeepEqual(steel(cut).inp.dstGroups, ref.inp.dstGroups);
});

// ---- Saídas espertas (fase 5): a linha atravessando os pares chega na ligação ----
test('meio: Copper Ingot 40 em Mergers no meio entrega 16, 16 e 8 (Dividir igual: 14, 13, 13), agrupadas por tamanho', () => {
  const COPPER = 'Desc_CopperIngot_C';
  const base: Factory = { v: 2, links: [{ id: 'l1', item: COPPER, from: 's1', to: 's2' }], blocks: [
    { id: 's1', kind: 'recipe', recipe: 'Recipe_IngotCopper_C', clock: 100, perRow: null, tiers: {}, limits: { machines: 40 } },
    { id: 's2', kind: 'recipe', recipe: 'Recipe_Wire_C', clock: 100, perRow: null, tiers: {} },
  ] };
  const groups = (belt: object) => {
    const f = withLayout(base, 's1', { kind: 'center', belts: { [`out:${COPPER}`]: belt } }), flow = solveFactory(f, data);
    assert.equal(flow.blocks.s1.machines, 40);
    const me = meioFor(f, 'l1');
    return { inp: meioInput(me, f, flow, data), plan: meioPlan(me, f, flow, data) };
  };
  const plain = groups({});
  assert.deepEqual(plain.inp.srcGroups.map(g => [g.count, g.per]), [[32, 16], [8, 8]]);
  assert.deepEqual(plain.plan.src.lines.map(l => l.machines).sort((a, b) => b - a), [16, 16, 8]);
  const even = groups({ even: true });
  assert.deepEqual(even.inp.srcGroups.map(g => [g.count, g.per]), [[14, 14], [26, 13]]);
  assert.deepEqual(even.plan.src.lines.map(l => l.machines).sort((a, b) => b - a), [14, 13, 13]);
});
