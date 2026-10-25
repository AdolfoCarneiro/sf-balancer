import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Block, Factory, GameData, Link, RecipeBlock } from '../../src/planner/model/types.ts';
import { removeBlock, setCollect, setExtractor, setLimits, setMinerRate } from '../../src/planner/model/factory.ts';
import { MAX_ITER, components, componentKey, solveCached, solveFactory, type FlowResult, type PortFlow } from '../../src/planner/model/solve.ts';
import { close, semFramework, vf } from './fixtures.ts';

const data = game as GameData;
const recipe = (id: string, r: string, limits?: RecipeBlock['limits']): RecipeBlock =>
  ({ id, kind: 'recipe', recipe: r, clock: 100, perRow: null, tiers: {}, ...(limits ? { limits } : {}) });
const link = (id: string, item: string, from: string, to: string): Link => ({ id, item, from, to });
const fac = (blocks: Block[], links: Link[] = []): Factory => ({ v: 2, blocks, links });
const port = (ps: PortFlow[], item: string): PortFlow => ps.find(p => p.item === item)!;

// Nenhum NaN nem Infinity em lugar nenhum do resultado.
function finite(v: unknown, path = 'r'): void {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path} = ${v}`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`);
}

test('solver: Versatile Framework consome 30 vigas: o aço livre vai para os canos', () => {
  const r = solveFactory(vf(), data);
  assert.equal(r.blocks.s3.machines, 2); close(r.links.lBeam, 120); close(r.links.lPipe, 660);
  assert.equal(r.blocks.s4.machines, 22); close(r.blocks.m1.outs[0].held, 0); assert.equal(r.converged, true);
  close(r.blocks.s1.x, 8); close(r.blocks.s2.x, 13); close(r.links.lFrame, 30);
  close(r.blocks.s4.outs[0].exits, 440); close(r.blocks.s5.outs[0].exits, 5);
  assert.deepEqual(r.deadlock, []); finite(r);
});

test('solver: canos limitados em 8: o consumo volta até a mineradora e aparece represado lá', () => {
  const r = solveFactory(setLimits(vf(), 's4', { machines: 8 }), data);
  close(r.blocks.s2.x, 6); close(r.blocks.s1.x, 240 / 65);
  close(r.blocks.m1.outs[0].held, 280 - 35 * 240 / 65);   // 150,769…
  close(r.blocks.s2.outs[0].held, 0); close(r.blocks.s1.outs[0].held, 0);
  close(r.blocks.m1.x, 35 * 240 / 65); close(r.links.lPipe, 240);
});

test('solver: duas pernas sem limite dividem por igual; com limite, uma pega o dela e a outra o resto', () => {
  const r = solveFactory(semFramework(), data);
  close(r.links.lBeam, 390); close(r.links.lPipe, 390);
  assert.equal(r.blocks.s3.machines, 7); close(r.blocks.s3.runClock, 6.5 / 7 * 100);
  const l = solveFactory(setLimits(semFramework(), 's4', { machines: 5 }), data);
  close(l.links.lPipe, 150); close(l.links.lBeam, 630);
  close(l.blocks.s4.ins[0].deficit, 0);
});

test('solver: aumentar não puxa os de trás: vigas fixadas acima do aço mostram falta', () => {
  const r = solveFactory(setLimits(semFramework(), 's3', { machines: 15 }), data);
  close(r.blocks.s1.x, 8);                               // o ferro não cresceu além da mineradora
  close(r.blocks.s3.ins[0].deficit, 900 - 780);          // a perna com limite pega tudo; os canos (livres) ficam com 0
  close(r.links.lPipe, 0);
  assert.equal(r.blocks.s3.machines, 15); close(r.blocks.s3.runClock, 780 / 900 * 100);
  close(r.blocks.m1.outs[0].held, 0);
});

test('solver: limite na entrada bruta: falta só na porta limitada', () => {
  const f = fac([recipe('s2', 'Recipe_Alternate_IngotSteel_1_C', { machines: 8, inputs: { Desc_IronIngot_C: 200 } })]);
  const b = solveFactory(f, data).blocks.s2;
  close(b.x, 5);
  close(port(b.ins, 'Desc_IronIngot_C').deficit, 120); close(port(b.ins, 'Desc_Coal_C').deficit, 0);
  close(b.outs[0].rate, 300); close(b.outs[0].exits, 300);
  close(port(b.ins, 'Desc_IronIngot_C').rate, 200); close(port(b.ins, 'Desc_Coal_C').rate, 200);
});

test('solver: fixado não muda quando a origem encolhe', () => {
  const r = solveFactory(setMinerRate(setLimits(vf(), 's2', { machines: 8 }), 'm1', 100), data);
  const x = 100 / 35 * 65 / 40;
  assert.equal(r.blocks.s2.machines, 8); close(r.blocks.s2.x, x); close(r.blocks.s2.runClock, x / 8 * 100);
  assert.ok(r.blocks.s2.runClock! < 100);
  close(port(r.blocks.s2.ins, 'Desc_IronIngot_C').deficit, 320 - 100 / 35 * 65);
});

test('solver: subproduto fluido sem saída trava o bloco; Container resolve; coleta não vale para fluido', () => {
  const scrap = fac([recipe('a1', 'Recipe_AluminumScrap_C', { machines: 1 })]);
  const r = solveFactory(scrap, data);
  assert.equal(r.blocks.a1.x, 0); assert.equal(r.blocks.a1.stalled, 'Desc_Water_C');
  assert.equal(r.blocks.a1.machines, 1); assert.equal(r.blocks.a1.runClock, 0);
  close(port(r.blocks.a1.outs, 'Desc_Water_C').held, 120); close(port(r.blocks.a1.outs, 'Desc_AluminumScrap_C').held, 360);
  // Coleta não vale para fluido: setCollect ignora e o bloco continua travado.
  assert.equal(solveFactory(setCollect(scrap, data, 'a1', 'Desc_Water_C', true), data).blocks.a1.stalled, 'Desc_Water_C');
  const box = fac([...scrap.blocks, { id: 'c1', kind: 'container' }], [link('lW', 'Desc_Water_C', 'a1', 'c1')]);
  const g = solveFactory(box, data);
  close(g.blocks.a1.x, 1); assert.equal(g.blocks.a1.stalled, null);
  close(g.blocks.c1.ins[0].rate, 120); close(g.links.lW, 120); close(g.blocks.c1.x, 120);
  close(port(g.blocks.a1.outs, 'Desc_AluminumScrap_C').exits, 360); close(port(g.blocks.a1.outs, 'Desc_Water_C').exits, 0);
});

test('solver: subproduto sólido parado trava; coleta de excesso libera', () => {
  const f = fac([recipe('a1', 'Recipe_AluminaSolution_C', { machines: 1 })]);
  const r = solveFactory(f, data);
  assert.equal(r.blocks.a1.x, 0); assert.equal(r.blocks.a1.stalled, 'Desc_Silica_C');
  const g = solveFactory(setCollect(f, data, 'a1', 'Desc_Silica_C', true), data);
  close(g.blocks.a1.x, 1); assert.equal(g.blocks.a1.stalled, null);
  close(port(g.blocks.a1.outs, 'Desc_Silica_C').exits, 50); close(port(g.blocks.a1.outs, 'Desc_AluminaSolution_C').exits, 120);
});

test('solver: Awesome Sink, Container e Saída recebem tudo que sobra ali', () => {
  for (const kind of ['sink', 'container', 'export'] as const) {
    const f = fac([
      { id: 'm1', kind: 'miner', item: 'Desc_OreIron_C', rate: 280 },
      recipe('s1', 'Recipe_Alternate_PureIronIngot_C', { machines: 4 }),   // minério 140
      { id: 'o1', kind },
    ], [link('lA', 'Desc_OreIron_C', 'm1', 's1'), link('lB', 'Desc_OreIron_C', 'm1', 'o1')]);
    const r = solveFactory(f, data);
    close(r.links.lA, 140); close(r.links.lB, 140); close(r.blocks.o1.x, 140);
    close(r.blocks.o1.ins[0].rate, 140); assert.equal(r.blocks.o1.ins[0].item, 'Desc_OreIron_C');
    close(r.blocks.m1.outs[0].held, 0); close(r.blocks.m1.x, 280);
    assert.equal(r.blocks.o1.machines, null);
  }
});

test('solver: extrator: quantos precisa pela vazão; pureza só onde vale; fixado vira teto com falta', () => {
  const water = fac([
    { id: 'e1', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: null },
    recipe('s1', 'Recipe_Alternate_PureIronIngot_C', { machines: 7 }),   // água 140
  ], [link('lW', 'Desc_Water_C', 'e1', 's1')]);
  const r = solveFactory(water, data);
  close(r.blocks.e1.x, 140); assert.equal(r.blocks.e1.extractors, 2); close(r.blocks.s1.x, 7);
  const one = solveFactory(setExtractor(water, data, 'e1', { count: 1 }), data);
  assert.equal(one.blocks.e1.extractors, 1); close(one.blocks.e1.x, 120);
  close(port(one.blocks.s1.ins, 'Desc_Water_C').deficit, 20); close(port(one.blocks.s1.ins, 'Desc_OreIron_C').deficit, 0);
  close(one.blocks.s1.x, 6); assert.equal(one.blocks.s1.machines, 7);
  // Oil Extractor → Plastic fixado em 4 (óleo 120); o Heavy Oil Residue vai para um Container.
  const oil = fac([
    { id: 'e1', kind: 'extractor', building: 'Build_OilPump_C', item: 'Desc_LiquidOil_C', purity: 'normal', count: null },
    recipe('s1', 'Recipe_Plastic_C', { machines: 4 }),
    { id: 'c1', kind: 'container' },
  ], [link('lO', 'Desc_LiquidOil_C', 'e1', 's1'), link('lH', 'Desc_HeavyOilResidue_C', 's1', 'c1')]);
  const count = (p: 'impure' | 'normal' | 'pure') => solveFactory(setExtractor(oil, data, 'e1', { purity: p }), data).blocks.e1.extractors;
  assert.equal(count('pure'), 1); assert.equal(count('normal'), 1); assert.equal(count('impure'), 2);
  const o = solveFactory(oil, data);
  close(o.blocks.e1.x, 120); close(o.links.lH, 40);
  // Extrator calculado sem ninguém limitando: sem limite.
  const free = solveFactory(fac([oil.blocks[0]]), data);
  assert.equal(free.blocks.e1.unbounded, true); assert.equal(free.blocks.e1.x, null); assert.equal(free.blocks.e1.extractors, null);
  finite(free);
});

// P Recycled Plastic, R Recycled Rubber, Fuel bruto; P → R (plástico), R → P (borracha), R → K (Awesome Sink).
function loop(pLimits: RecipeBlock['limits'] | undefined, sink: boolean): Factory {
  const blocks: Block[] = [recipe('P', 'Recipe_Alternate_Plastic_1_C', pLimits), recipe('R', 'Recipe_Alternate_RecycledRubber_C')];
  const links = [link('lPR', 'Desc_Plastic_C', 'P', 'R'), link('lRP', 'Desc_Rubber_C', 'R', 'P')];
  return sink ? fac([...blocks, { id: 'K', kind: 'sink' }], [...links, link('lRK', 'Desc_Rubber_C', 'R', 'K')]) : fac(blocks, links);
}

test('solver: loop de borracha e plástico reciclados estabiliza', () => {
  const r = solveFactory(loop({ machines: 1 }, true), data);
  close(r.blocks.R.x, 2); close(r.links.lRP, 30); close(r.links.lRK, 90); close(r.links.lPR, 60);
  assert.equal(r.converged, true); assert.deepEqual(r.deadlock, []);
});

test('solver: loop sem saída trava e é apontado', () => {
  const r = solveFactory(loop({ machines: 1 }, false), data);
  assert.equal(r.blocks.P.x, 0); assert.equal(r.blocks.R.x, 0);
  assert.deepEqual(r.deadlock, [['P', 'R']]);
  assert.equal(r.converged, true); finite(r);
});

test('solver: loop que se sustenta sem limite fica sem limite e não trava', () => {
  const r = solveFactory(loop(undefined, true), data);
  for (const id of ['P', 'R']) {
    assert.equal(r.blocks[id].unbounded, true); assert.equal(r.blocks[id].x, null);
    assert.equal(r.blocks[id].machines, null); assert.equal(r.blocks[id].runClock, null);
  }
  assert.ok(r.iterations <= MAX_ITER); assert.deepEqual(r.deadlock, []);
  finite(r);
});

test('solver: apagar a âncora: os livres de baixo ficam sem limite, sem NaN', () => {
  const r = solveFactory(removeBlock(vf(), 'm1'), data);
  for (const id of ['s1', 's2', 's4']) {
    assert.equal(r.blocks[id].unbounded, true); assert.equal(r.blocks[id].x, null); assert.equal(r.blocks[id].outs[0].rate, null);
  }
  assert.equal(r.links.lIngot, null); assert.equal(r.links.lPipe, null);
  close(r.blocks.s3.x, 2); close(r.links.lBeam, 120); assert.equal(r.blocks.s3.unbounded, false);
  finite(r);
});

test('solver: componentes fracamente conexos, chave sem mapa nem ligações de mapa', () => {
  const f = fac([...vf().blocks, ...loop({ machines: 1 }, true).blocks, recipe('z9', 'Recipe_IngotIron_C')],
    [...vf().links, ...loop({ machines: 1 }, true).links]);
  assert.deepEqual(components(f), [['K', 'P', 'R'], ['m1', 's1', 's2', 's3', 's4', 's5'], ['z9']]);
  const ids = components(f)[1];
  const placed: Factory = { ...f, map: { s1: { x: 8, y: 0, rot: 0 } }, ligs: { x: { x: 0, y: 0, rot: 0 } }, alts: { a: 'b' }, mapGap: 4 };
  assert.equal(componentKey(placed, ids), componentKey(f, ids));
  assert.notEqual(componentKey(setLimits(f, 's3', { machines: 3 }), ids), componentKey(f, ids));
  assert.equal(componentKey(setLimits(f, 'P', { machines: 3 }), ids), componentKey(f, ids));
});

test('solver: cache por componente: mexer num componente não recalcula o outro; mapa e ligs fora da chave', () => {
  const f = fac([...vf().blocks, ...loop({ machines: 1 }, true).blocks], [...vf().links, ...loop({ machines: 1 }, true).links]);
  const cache = new Map<string, FlowResult>();
  const a = solveCached(f, data, cache);
  assert.equal(a.solved, 2);
  assert.deepEqual(a.result.blocks, solveFactory(f, data).blocks);
  assert.deepEqual(a.result.links, solveFactory(f, data).links);
  const b = solveCached(setLimits(f, 's3', { machines: 1 }), data, cache);
  assert.equal(b.solved, 1); close(b.result.links.lBeam, 60); close(b.result.links.lRK, 90);
  const c = solveCached({ ...setLimits(f, 's3', { machines: 1 }), map: { s1: { x: 8, y: 8, rot: 1 } }, ligs: { q: { x: 0, y: 0, rot: 0 } } }, data, cache);
  assert.equal(c.solved, 0);
});

test('solver: desempenho: 10 blocos encadeados de 200 máquinas + um loop resolvem em menos de 50 ms', () => {
  const m = { machines: 200 };
  const f = fac([
    { id: 'm1', kind: 'miner', item: 'Desc_OreIron_C', rate: 1e6 },
    recipe('b1', 'Recipe_IngotIron_C', m), recipe('b2', 'Recipe_IronRod_C', m), recipe('b3', 'Recipe_Screw_C', m),
    recipe('b4', 'Recipe_IronPlate_C', m), recipe('b5', 'Recipe_IronPlateReinforced_C', m), recipe('b6', 'Recipe_ModularFrame_C', m),
    recipe('b7', 'Recipe_IngotIron_C', m), recipe('b8', 'Recipe_IronRod_C', m), recipe('b9', 'Recipe_Rotor_C', m),
    recipe('b10', 'Recipe_IronPlate_C', m),
    ...loop({ machines: 200 }, true).blocks,
  ], [
    link('x1', 'Desc_OreIron_C', 'm1', 'b1'), link('x2', 'Desc_IronIngot_C', 'b1', 'b2'), link('x3', 'Desc_IronRod_C', 'b2', 'b3'),
    link('x4', 'Desc_IronIngot_C', 'b1', 'b4'), link('x5', 'Desc_IronPlate_C', 'b4', 'b5'), link('x6', 'Desc_IronScrew_C', 'b3', 'b5'),
    link('x7', 'Desc_IronPlateReinforced_C', 'b5', 'b6'), link('x8', 'Desc_IronRod_C', 'b2', 'b6'),
    link('x9', 'Desc_OreIron_C', 'm1', 'b7'), link('x10', 'Desc_IronIngot_C', 'b7', 'b8'), link('x11', 'Desc_IronRod_C', 'b8', 'b9'),
    link('x12', 'Desc_IronScrew_C', 'b3', 'b9'), link('x13', 'Desc_IronIngot_C', 'b7', 'b10'),
    ...loop({ machines: 200 }, true).links,
  ]);
  solveFactory(f, data);   // aquece o JIT
  const t0 = performance.now();
  const r = solveFactory(f, data);
  const ms = performance.now() - t0;
  assert.ok(ms < 50, `${ms} ms`);
  assert.equal(r.converged, true); finite(r);
});

test('solver: s1 com limite de 100 de minério ligado: x = 100/35, mineradora represa 180', () => {
  const r = solveFactory(setLimits(vf(), 's1', { inputs: { Desc_OreIron_C: 100 } }), data);
  close(r.blocks.s1.x, 100 / 35); close(r.links.lOre, 100);
  close(r.blocks.m1.outs[0].held, 180); close(port(r.blocks.s1.ins, 'Desc_OreIron_C').deficit, 0);
});

test('solver: duas entradas ligadas, só uma curta: a falta aparece só nela', () => {
  const f = fac([
    { id: 'mi', kind: 'miner', item: 'Desc_IronIngot_C', rate: 200 } as Block,   // fonte de teste (não é minério de verdade)
    { id: 'mc', kind: 'miner', item: 'Desc_Coal_C', rate: 1000 },
    recipe('s2', 'Recipe_Alternate_IngotSteel_1_C', { machines: 8 }),
  ], [link('li', 'Desc_IronIngot_C', 'mi', 's2'), link('lc', 'Desc_Coal_C', 'mc', 's2')]);
  const r = solveFactory(f, data);
  close(r.blocks.s2.x, 5);
  close(port(r.blocks.s2.ins, 'Desc_IronIngot_C').deficit, 120); assert.equal(port(r.blocks.s2.ins, 'Desc_Coal_C').deficit, 0);
  close(r.blocks.mc.outs[0].held, 800);
});

test('solver: o resto do ponto fixo não vira máquina a mais nem falta minúscula (loop da alumina)', () => {
  // A Alumina Solution fixado em 20 (Silica coletada), S Aluminum Scrap livre; a água do S volta para o A, o resto vem do extrator.
  const f = fac([
    { ...recipe('A', 'Recipe_AluminaSolution_C', { machines: 20 }), collect: ['Desc_Silica_C'] },
    recipe('S', 'Recipe_AluminumScrap_C'),
    { id: 'w', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: null },
  ], [link('l1', 'Desc_AluminaSolution_C', 'A', 'S'), link('l2', 'Desc_Water_C', 'S', 'A'), link('l3', 'Desc_Water_C', 'w', 'A')]);
  const r = solveFactory(f, data);
  // Água: 20·180 = 3600; o S (10 máquinas) devolve 1200; o extrator dá 2400 = 20 extratores.
  assert.equal(r.blocks.w.extractors, 20); assert.equal(r.blocks.S.machines, 10);
  for (const p of r.blocks.A.ins) assert.equal(p.deficit, 0);
  assert.equal(r.converged, true);
});
