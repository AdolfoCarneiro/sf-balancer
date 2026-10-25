import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, MinerBlock, OutletBlock, RecipeBlock } from '../../src/planner/model/types.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { addBlock, connect, meiosOf, setLimits } from '../../src/planner/model/factory.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { factoryTotals, markerGeo, solvedStage } from '../../src/planner/model/solved.ts';
import { meioInput, meioPlan } from '../../src/planner/model/meio.ts';
import { cacheKey, meioResult } from '../../src/planner/model/meioresult.ts';
import { buildScene, placesOf } from '../../src/planner/model/map/scene.ts';
import { close } from './fixtures.ts';

const data = game as GameData;
const IRON = 'Desc_IronIngot_C:s1>s2';
const meioOf = (f: Factory, id: string) => meiosOf(f).find(m => m.id === id)!;
const supply = (gs: { count: number; clock: number; nominal: number }[]) => gs.reduce((s, g) => s + g.count * g.clock / 100 * g.nominal, 0);

test('exampleFactory: blocos derivados batem com o exemplo da fase 1', () => {
  const f = exampleFactory(data), flow = solveFactory(f, data);
  assert.equal(solvedStage(f.blocks[1] as RecipeBlock, flow.blocks.s2).machines, 60);
  close(flow.blocks.s1.outs[0].held, 2730 - 2400);           // ferro represado na refinaria fixada
  // Fileiras e tier não pulam com o fluxo: o clock é o do bloco.
  const s1 = solvedStage(f.blocks[0] as RecipeBlock, flow.blocks.s1);
  assert.deepEqual(s1, { id: 's1', recipe: 'Recipe_Alternate_PureIronIngot_C', machines: 42, clock: 100, perRow: null, tiers: {} });
  // Sem fluxo (ainda calculando) ou parado: uma máquina.
  assert.equal(solvedStage(f.blocks[0] as RecipeBlock, undefined).machines, 1);
});

test('meioInput usa a oferta real e o que a consumidora quer', () => {
  const f = exampleFactory(data), flow = solveFactory(f, data);
  const inp = meioInput(meioOf(f, IRON), f, flow, data);
  close(supply(inp.srcGroups), 2400);
  close(supply(inp.dstGroups), 2400);
  assert.equal(inp.srcGroups[0].count, 42);
  assert.equal(inp.srcGroups[0].per, 7);
  assert.deepEqual(inp.dstGroups[0], { driver: 'clock', count: 60, clock: 100, nominal: 40, per: 12 });
  assert.equal(inp.policy, 'represar');
  const p = meioPlan(meioOf(f, IRON), f, flow, data);
  close(p.supply, 2400); close(p.demand, 2400);
  // Coleta na saída da produtora: a sobra vai pro sink.
  const g = { ...f, blocks: f.blocks.map(b => (b.id === 's1' ? { ...b, collect: ['Desc_IronIngot_C'] } : b)) } as Factory;
  assert.equal(meioInput(meioOf(g, IRON), g, solveFactory(g, data), data).policy, 'sink');
  // Consumidora fixada acima do que chega (vigas e canos livres): pede o que quer (a falta aparece no meio).
  const h = setLimits(setLimits(setLimits(f, 's3', null), 's4', null), 's2', { machines: 80 }), hf = solveFactory(h, data);
  const want = meioInput(meioOf(h, IRON), h, hf, data);
  close(supply(want.dstGroups), 3200);
  const hp = meioPlan(meioOf(h, IRON), h, hf, data);
  close(hp.supply, 2730); close(hp.demand, 3200);
});

test('ligação para Awesome Sink vira linha extra; grupo só com outlet é direto', () => {
  let f = exampleFactory(data);
  f = addBlock(f, data, { kind: 'sink' }, [0, 0]);                       // s5
  f = connect(f, data, 's2', 's5', 'Desc_SteelIngot_C');
  f = addBlock(f, data, { kind: 'container' }, [0, 0]);                  // s6
  f = connect(f, data, 's3', 's6', 'Desc_SteelPlate_C');
  const flow = solveFactory(f, data);
  const steel = meiosOf(f).find(m => m.item === 'Desc_SteelIngot_C')!;
  assert.deepEqual(steel.consumers, ['s3', 's4', 's5']);
  const inp = meioInput(steel, f, flow, data);
  assert.equal(inp.policy, 'extra');
  assert.equal(inp.dstGroups.length, 2);                                 // o Sink não é destino do computePlan
  const sp = meioPlan(steel, f, flow, data);
  assert.equal(sp.direct, undefined);
  assert.ok(sp.alternatives.length > 0);
  // Vigas só para o Container: direto, sem computePlan, cada fileira reta até o Container.
  const beams = meiosOf(f).find(m => m.item === 'Desc_SteelPlate_C')!;
  const bp = meioPlan(beams, f, flow, data);
  assert.equal(bp.direct, true);
  assert.equal(bp.alternatives.length, 0);
  close(bp.supply, 450);
  const r = meioResult(beams, f, flow, data);
  const geos = { ...Object.fromEntries(meiosOf(f).map(m => [m.id, null])), [beams.id]: Object.values(r.geos)[0] };
  const g = geos[beams.id]!;
  assert.equal(g.ins.length, 4); assert.equal(g.outs.length, 4);
  assert.ok(g.outs.every(o => o.extra));
  const scene = buildScene(f, data, placesOf(f, data, geos, flow), geos, flow);
  const c = scene.blocks.find(b => b.stage === 's6')!;
  const into = scene.belts.filter(b => b.item === 'Desc_SteelPlate_C' && b.role === 'main');
  assert.equal(into.filter(b => { const [x, y] = b.pts[b.pts.length - 1]; return x === c.rect.x && y > c.rect.y && y < c.rect.y + c.rect.h; }).length, 4);
});

test('bloco sem limite no grupo: meio unbounded, nenhum Infinity no MeioInput nem na geometria', () => {
  let f = exampleFactory(data);
  for (const id of ['s1', 's2', 's3', 's4']) f = setLimits(f, id, null);
  const flow = solveFactory(f, data);
  assert.equal(flow.blocks.s1.unbounded, true);
  const iron = meioOf(f, IRON);
  const json = JSON.stringify(meioInput(iron, f, flow, data));
  assert.ok(!json.includes('null') && !json.includes('NaN'), json);
  const p = meioPlan(iron, f, flow, data);
  assert.equal(p.unbounded, true);
  assert.equal(p.alternatives.length, 0);
  assert.deepEqual(meioResult(iron, f, flow, data).geos, {});
  const geos = Object.fromEntries(meiosOf(f).map(m => [m.id, null]));
  const scene = buildScene(f, data, placesOf(f, data, geos, flow), geos, flow);
  const nums = [scene.bounds, ...scene.blocks.map(b => b.rect), ...scene.meios.map(m => m.rect)].flatMap(r => [r.x, r.y, r.w, r.h]);
  assert.ok(nums.every(Number.isFinite));
  assert.ok(scene.belts.every(b => Number.isFinite(b.rate) && b.pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))));
  assert.ok(scene.blocks.every(b => b.geo.pieces.filter(q => q.kind === 'machine').length >= 1));
});

test('marcador de origem e de sobra: 8 × 8, Awesome Sink 16 × 13, estimate', () => {
  const miner: MinerBlock = { id: 'm1', kind: 'miner', item: 'Desc_OreIron_C', rate: 120 };
  const f: Factory = { v: 2, blocks: [miner, { id: 'k1', kind: 'sink' }], links: [{ id: 'l1', item: 'Desc_OreIron_C', from: 'm1', to: 'k1' }] };
  const flow = solveFactory(f, data);
  const m = markerGeo(miner, flow.blocks.m1, data);
  assert.deepEqual([m.w, m.h, m.estimate], [8, 8, true]);
  assert.deepEqual(m.outs.map(a => [a.x, a.y, a.item, a.stage]), [[8, 4, 'Desc_OreIron_C', 'm1']]);
  assert.equal(m.belts[0].rate, 120);
  const s = markerGeo(f.blocks[1] as OutletBlock, flow.blocks.k1, data);
  assert.deepEqual([s.w, s.h, s.estimate], [16, 13, true]);
  assert.deepEqual(s.ins.map(a => [a.x, a.item]), [[0, 'Desc_OreIron_C']]);
  assert.deepEqual(s.pieces.map(p => p.kind), ['sink']);
  const c = markerGeo({ id: 'c1', kind: 'container' }, undefined, data);
  assert.deepEqual([c.w, c.h, c.estimate, c.ins.length], [8, 8, true, 0]);
  const x = markerGeo({ id: 'x1', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: null }, undefined, data);
  assert.deepEqual([x.w, x.h, x.belts[0].rate, x.belts[0].fluid], [8, 8, 0, true]);
});

test('cacheKey muda com o fluxo do bloco e não com a posição no mapa', () => {
  const f = exampleFactory(data), flow = solveFactory(f, data), iron = meioOf(f, IRON);
  const k = cacheKey(iron, f, flow, data, 'pt');
  const moved: Factory = { ...f, map: { s1: { x: 80, y: 16, rot: 1 } }, ligs: { [IRON]: { x: 8, y: 8, rot: 0 } } };
  assert.equal(cacheKey(iron, moved, flow, data, 'pt'), k);
  assert.notEqual(cacheKey(iron, f, flow, data, 'en'), k);
  const fewer = setLimits(f, 's1', { machines: 41 });
  assert.notEqual(cacheKey(iron, fewer, solveFactory(fewer, data), data, 'pt'), k);
});

test('factoryTotals soma as máquinas resolvidas', () => {
  const f = exampleFactory(data);
  assert.deepEqual(factoryTotals(f, solveFactory(f, data)), { blocks: 4, machines: 192 });
  const g = addBlock(f, data, { kind: 'sink' }, [0, 0]);
  assert.deepEqual(factoryTotals(g, solveFactory(g, data)), { blocks: 5, machines: 192 });
});
