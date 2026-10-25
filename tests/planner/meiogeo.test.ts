import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Chain, GameData, Stage } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { meioFor, meioInput, meioPlan, type Meio, type Plan } from '../../src/planner/model/meio.ts';
import { meioGeo } from '../../src/planner/model/map/meiogeo.ts';
import type { MeioGeo, Piece } from '../../src/planner/model/map/geo.ts';
import { computePlan } from '../../src/logic/index.js';
import { designFloors } from '../../src/logic/layout3d.js';

const data = game as GameData;
type FullAlt = Plan['alternatives'][number] & { sinkRate: number; view: { bal?: { design: { kind: string } } } };

const st = (id: string, recipe: string, machines: number, perRow: number | null = null): Stage =>
  ({ id, recipe, machines, clock: 100, perRow, locked: false, tiers: {}, pos: { x: 0, y: 0 } });

// O plano completo do computePlan (com g, view e sim nas alternativas), não o lite do meioPlan.
function meioDe(ch: Chain, linkId: string) {
  const meio = meioFor(ch, data, linkId);
  const plan = computePlan(meioInput(meio, ch, data)) as unknown as Plan;
  return { meio, plan, ch };
}
const meioDoExemplo = (linkId: string, policy: Chain['policy'] = 'represar') => meioDe({ ...exampleChain(data), policy }, linkId);
const geoOf = (m: { meio: Meio; plan: Plan }, key = m.plan.alternatives[0].key) => meioGeo(m.meio, m.plan, key, data.items[m.meio.item]);
const count = (g: MeioGeo, k: Piece['kind']) => g.pieces.filter(p => p.kind === k).length;
const alt = (plan: Plan, key: string) => plan.alternatives.find(a => a.key === key) as FullAlt;

function assertInside(g: MeioGeo) {
  assert.ok(g.pieces.every(p => p.x >= 0 && p.y >= 0 && p.x + p.w <= g.w + 1e-9 && p.y + p.h <= g.h + 1e-9), 'peças dentro do meio');
  assert.ok(g.belts.every(b => b.pts.every(([x, y]) => x >= -1e-9 && y >= -1e-9 && x <= g.w + 1e-9 && y <= g.h + 1e-9)), 'esteiras dentro do meio');
  assert.ok(g.belts.every(b => b.pts.every((p, i) => i === 0 || p[0] === b.pts[i - 1][0] || p[1] === b.pts[i - 1][1])), 'esteiras em ângulo reto');
  assert.ok(g.ins.every(a => a.x === 0) && g.outs.every(a => a.x === g.w), 'entradas em x = 0, saídas em x = w');
}

test('exemplo l1 (6×455 → 5×480, caso B): peças 4×4, entradas e saídas nas bordas', () => {
  const m = meioDoExemplo('l1');
  const a = m.plan.alternatives[0];
  const g = geoOf(m);
  assert.equal(g.ins.length, 6); assert.equal(g.outs.filter(o => !o.extra).length, 5);
  assert.ok(g.pieces.every(p => (p.kind === 'sink' ? p.w === 16 && p.h === 13 : p.w === 4 && p.h === 4)));
  assertInside(g);
  // A primeira alternativa manda 1 parte pro sink por uma esteira só: nenhum Merger de cascata.
  assert.equal(count(g, 'splitter'), a.pieces.splitters);
  assert.equal(count(g, 'merger'), a.pieces.mergers);
  assert.equal(count(g, 'sink'), 1);
  assert.equal(g.floors, 1); assert.equal(g.tooLarge, false); assert.equal(g.estimate, false);
  assert.deepEqual(g.ins.map(x => x.row).sort(), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(g.outs.map(x => x.row).sort(), [0, 1, 2, 3, 4]);
  assert.ok(g.ins.every(x => x.stage === 's1' && x.item === 'Desc_IronIngot_C') && g.outs.every(x => x.stage === 's2'));
  assert.ok(g.belts.every(b => !b.fluid && b.item === 'Desc_IronIngot_C'));
  assert.ok(g.belts.some(b => b.role === 'donor') && g.belts.some(b => b.role === 'sink'));
});

test('cada montagem do plano gera geometria diferente quando as peças diferem', () => {
  const m = meioDoExemplo('l1');
  const [a0, a1] = m.plan.alternatives;
  assert.notDeepEqual(a0.pieces, a1.pieces);
  const g0 = geoOf(m, a0.key), g1 = geoOf(m, a1.key);
  assert.notDeepEqual(g0.pieces, g1.pieces);
  assert.equal(count(g1, 'merger'), a1.pieces.mergers);
  // O loop da doadora volta por cima da grade e tudo continua com y ≥ 0.
  assert.ok(g1.belts.some(b => b.role === 'loop'));
  assertInside(g1);
  // Montagem que não existe: a primeira.
  assert.deepEqual(geoOf(m, 'nao-existe'), g0);
});

test('sobra de várias esteiras vira 1 Merger em cascata + 1 sink (política sink)', () => {
  const m = meioDoExemplo('l1', 'sink');
  const a = alt(m.plan, 'doadora-1-sink-sem-represa');
  assert.equal(a.pieces.sinkBelts, 6);
  const g = geoOf(m, a.key);
  assert.equal(count(g, 'sink'), 1);
  // 6 esteiras de sobra numa cascata de 3 entradas (o primeiro pega 3, cada seguinte o anterior e mais 2): 3 Mergers a mais.
  assert.equal(count(g, 'merger'), a.pieces.mergers + 3);
  assert.equal(count(g, 'smart'), a.pieces.smart);
  assertInside(g);
  // A faixa do sink fica abaixo da grade de peças.
  const sink = g.pieces.find(p => p.kind === 'sink')!;
  const grid = g.pieces.filter(p => p.kind !== 'sink' && p.y + p.h <= sink.y);
  assert.ok(grid.length >= a.pieces.splitters + a.pieces.mergers);
  // A esteira que entra no sink leva toda a sobra.
  const into = g.belts.filter(b => b.role === 'sink' && b.pts[b.pts.length - 1][0] === sink.x);
  assert.equal(into.length, 1);
  assert.ok(Math.abs(into[0].rate - a.sinkRate) < 1e-6);
});

test('sobra acima da esteira abre mais um sink por esteira cheia', () => {
  const c0 = { ...exampleChain(data), policy: 'sink' as const };
  const m = meioDe({ ...c0, stages: c0.stages.map(s => (s.id === 's1' ? { ...s, machines: 56 } : s)) }, 'l1');
  const a = alt(m.plan, 'doadora-1-sink');
  assert.ok(a.sinkRate > 960 && a.sinkRate < 1000);
  const g = geoOf(m, a.key);
  assert.equal(count(g, 'sink'), 3);
  assertInside(g);
  // Nenhuma esteira que chega num sink passa da capacidade da ligação.
  const sinks = g.pieces.filter(p => p.kind === 'sink');
  const into = g.belts.filter(b => sinks.some(s => b.pts[b.pts.length - 1][0] === s.x && b.pts[b.pts.length - 1][1] === s.y + s.h / 2));
  assert.equal(into.length, 3);
  assert.ok(into.every(b => b.rate <= m.plan.cap + 1e-6));
  assert.ok(Math.abs(into.reduce((s, b) => s + b.rate, 0) - a.sinkRate) < 1e-6);
});

test('meio fluido: canos de 1 m e estimativa', () => {
  const ch: Chain = {
    v: 1, policy: 'sink',
    stages: [st('a', 'Recipe_Alternate_ElectroAluminumScrap_C', 12), st('b', 'Recipe_Alternate_DilutedFuel_C', 10)],
    links: [{ id: 'l1', item: 'Desc_Water_C', from: 'a', to: 'b' }],
  };
  const m = meioDe(ch, 'l1');
  const head = m.plan.alternatives.find(a => (a as { headers?: unknown }).headers) as FullAlt & { headers: { inputs: unknown[]; members: unknown[] }[] };
  assert.ok(head, 'tem alternativa com cano coletor');
  const g = geoOf(m, head.key);
  assert.equal(g.estimate, true);
  assert.equal(count(g, 'junction'), head.headers.length);
  assert.ok(g.pieces.every(p => p.kind === 'junction' && p.w === 2 && p.h === 2));
  assert.equal(g.ins.length, m.plan.src.lines.length); assert.equal(g.outs.length, m.plan.dst.lines.length);
  assert.ok(g.belts.length > 0 && g.belts.every(b => b.fluid && b.item === 'Desc_Water_C'));
  // Um cano por entrada e por saída de cada coletor.
  assert.equal(g.belts.length, head.headers.reduce((s, h) => s + h.inputs.length + h.members.length, 0));
  assertInside(g);
  // Sem coletor: cano reto de cada origem ao destino da linha, sem peças.
  const dir = m.plan.alternatives.find(a => a.key === 'direto')!;
  const gd = geoOf(m, dir.key);
  assert.equal(gd.pieces.length, 0); assert.equal(gd.estimate, true);
  assert.ok(gd.belts.length > 0 && gd.belts.every(b => b.fluid));
  assertInside(gd);
});

test('meio grande demais: faixa 16 × 8 sem peças', () => {
  const c0 = exampleChain(data);
  const ch = { ...c0, stages: c0.stages.map(s => (s.id === 's1' ? { ...s, machines: 3000 } : s)) };
  const meio = meioFor(ch, data, 'l1');
  const plan = meioPlan(meio, ch, data);
  assert.ok(plan.tooLarge);
  const g = meioGeo(meio, plan, '', data.items[meio.item]);
  assert.equal(g.tooLarge, true);
  assert.equal(g.w, 16); assert.equal(g.h, 8);
  assert.equal(g.pieces.length, 0); assert.equal(g.belts.length, 0);
  assert.equal(g.ins.length, 0); assert.equal(g.outs.length, 0);
});

test('borboleta com loop: andares de designFloors', () => {
  const meio: Meio = { id: 'x', item: 'Desc_IronIngot_C', producers: ['a'], consumers: ['b'], links: ['l1'] };
  const plan = computePlan({ cap: 480, policy: 'represar', excess: 'represar', conv: 'k-1', medium: 'item',
    srcGroups: [{ driver: 'clock', count: 2, clock: 100, nominal: 400, per: 1 }],
    dstGroups: [{ driver: 'clock', count: 5, clock: 100, nominal: 160, per: 1 }] }) as unknown as Plan;
  const a = alt(plan, 'balancer-butterfly-loop');
  assert.equal(a.view.bal!.design.kind, 'butterfly-loop');
  const g = meioGeo(meio, plan, a.key, data.items[meio.item]);
  const fl = designFloors(a.view.bal!.design)!;
  assert.ok(fl.floors > 1);
  assert.equal(g.floors, fl.floors);
  assertInside(g);
  assert.equal(meioGeo(meio, plan, 'direto', data.items[meio.item]).floors, 1);
});

test('peças não se sobrepõem', () => {
  const overlap = (p: Piece, q: Piece) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 1e-9 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 1e-9;
  const c0 = exampleChain(data);
  const cases = [
    meioDoExemplo('l1'), meioDoExemplo('l2'), meioDoExemplo('l1', 'sink'), meioDoExemplo('l2', 'sink'), meioDoExemplo('l1', 'extra'),
    meioDe({ ...c0, policy: 'sink', stages: c0.stages.map(s => (s.id === 's1' ? { ...s, machines: 56 } : s)) }, 'l1'),
    meioDe({ ...c0, stages: c0.stages.map(s => (s.id === 's1' ? { ...s, perRow: 6 } : s)) }, 'l1'),
  ];
  let n = 0;
  for (const m of cases) for (const a of m.plan.alternatives) {
    const g = geoOf(m, a.key);
    assertInside(g);
    for (let i = 0; i < g.pieces.length; i++) for (let j = i + 1; j < g.pieces.length; j++) {
      assert.ok(!overlap(g.pieces[i], g.pieces[j]), `${a.key}: ${JSON.stringify(g.pieces[i])} × ${JSON.stringify(g.pieces[j])}`);
    }
    n++;
  }
  assert.ok(n > 15);
});

test('linha extra vira saída a mais com a esteira extra', () => {
  const m = meioDoExemplo('l1', 'extra');
  const withExtra = m.plan.alternatives.find(a => geoOf(m, a.key).outs.some(o => o.extra));
  assert.ok(withExtra, 'alguma montagem tem linha extra');
  const g = geoOf(m, withExtra!.key);
  const ex = g.outs.filter(o => o.extra);
  assert.equal(g.belts.filter(b => b.role === 'extra').length, ex.length);
  assert.ok(ex.every(o => o.x === g.w));
});

test('sobra em sinks: nenhuma esteira de sobra nem saída da cascata passa da esteira (3×330 → 1×60, Mk4)', () => {
  const meio: Meio = { id: 'x', item: 'Desc_IronIngot_C', producers: ['a'], consumers: ['b'], links: ['l1'] };
  const plan = computePlan({ cap: 480, policy: 'sink', excess: 'sink', conv: 'k-1', medium: 'item',
    srcGroups: [{ driver: 'clock', count: 3, clock: 100, nominal: 330, per: 1 }],
    dstGroups: [{ driver: 'clock', count: 1, clock: 100, nominal: 60, per: 1 }] }) as unknown as Plan;
  let checked = 0;
  for (const a of plan.alternatives as FullAlt[]) {
    const g = meioGeo(meio, plan, a.key, data.items[meio.item]);
    assertInside(g);
    const sinks = count(g, 'sink');
    if (!sinks) continue;
    checked++;
    assert.ok(g.belts.filter(b => b.role === 'sink').every(b => b.rate <= plan.cap + 1e-6), `${a.key}: esteira de sobra acima de ${plan.cap}`);
    assert.ok(sinks >= Math.ceil(a.sinkRate / plan.cap - 1e-9));
  }
  assert.ok(checked > 0);
});
