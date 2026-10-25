import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData } from '../../src/planner/model/types.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { addBlock, connect } from '../../src/planner/model/factory.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { buildScene, placesOf } from '../../src/planner/model/map/scene.ts';
import { dropTarget, portAt, scenePorts, type ScenePort } from '../../src/planner/model/map/ports.ts';

const data = game as GameData;
const ex = exampleFactory(data);
const sceneOf = (f: Factory) => { const flow = solveFactory(f, data); return buildScene(f, data, placesOf(f, data, {}, flow), {}, flow); };
const portOf = (ps: ScenePort[], block: string, side: 'in' | 'out', item: string) =>
  ps.find(p => p.block === block && p.side === side && p.item === item)!;

test('scenePorts: uma por bloco, lado e item, no meio das âncoras daquele item', () => {
  const sc = sceneOf(ex), ps = scenePorts(sc, ex, data);
  // s1 Pure Iron Ingot: entradas minério e água, saída lingote; s2 aço: entradas ferro e carvão, saída aço.
  assert.deepEqual(ps.filter(p => p.block === 's1').map(p => [p.side, p.item]).sort(),
    [['in', 'Desc_OreIron_C'], ['in', 'Desc_Water_C'], ['out', 'Desc_IronIngot_C']]);
  const s2 = sc.blocks.find(b => b.stage === 's2')!, out = portOf(ps, 's2', 'out', 'Desc_SteelIngot_C');
  assert.equal(out.x, s2.rect.x + s2.rect.w);   // rot 0: saída na borda direita
  const ys = s2.geo.outs.filter(a => a.item === 'Desc_SteelIngot_C').map(a => a.y + s2.rect.y);
  assert.ok(Math.abs(out.y - ys.reduce((a, b) => a + b, 0) / ys.length) < 1e-9);
  assert.equal(portOf(ps, 's1', 'in', 'Desc_Water_C').fluid, true);
  assert.equal(out.fluid, false);
});

test('portAt acha a porta de saída do aço no exemplo e nada no vazio', () => {
  const sc = sceneOf(ex), ps = scenePorts(sc, ex, data), out = portOf(ps, 's2', 'out', 'Desc_SteelIngot_C');
  assert.equal(portAt(ps, out.x + 2, out.y - 1, 4), out);
  assert.equal(portAt(ps, out.x + 10, out.y, 4), null);
  assert.equal(portAt(ps, sc.bounds.x - 500, sc.bounds.y - 500, 4), null);
});

test('dropTarget: porta compatível liga, vazio abre o seletor filtrado, incompatível não faz nada', () => {
  let f = addBlock(ex, data, { kind: 'recipe', recipe: 'Recipe_SteelBeam_C' }, [800, 0]);   // s5, sem ligação
  f = addBlock(f, data, { kind: 'sink' }, [800, 200]);                                      // s6
  const ps = scenePorts(sceneOf(f), f, data);
  const steelOut = portOf(ps, 's2', 'out', 'Desc_SteelIngot_C'), beamIn = portOf(ps, 's5', 'in', 'Desc_SteelIngot_C');
  assert.deepEqual(dropTarget(f, data, steelOut, beamIn), { kind: 'connect', from: 's2', to: 's5', item: 'Desc_SteelIngot_C' });
  // Ao contrário (da entrada para a saída) liga no mesmo sentido.
  assert.deepEqual(dropTarget(f, data, beamIn, steelOut), { kind: 'connect', from: 's2', to: 's5', item: 'Desc_SteelIngot_C' });
  assert.deepEqual(dropTarget(f, data, steelOut, null), { kind: 'picker', filter: { consumes: 'Desc_SteelIngot_C' } });
  assert.deepEqual(dropTarget(f, data, beamIn, null), { kind: 'picker', filter: { produces: 'Desc_SteelIngot_C' } });
  // Já ligada (s2 → s3 aço), outro item, mesmo lado, o próprio bloco.
  assert.deepEqual(dropTarget(f, data, steelOut, portOf(ps, 's3', 'in', 'Desc_SteelIngot_C')), { kind: 'none', reason: 'dup' });
  assert.deepEqual(dropTarget(f, data, steelOut, portOf(ps, 's2', 'in', 'Desc_IronIngot_C')), { kind: 'none', reason: 'self' });
  assert.deepEqual(dropTarget(f, data, portOf(ps, 's1', 'out', 'Desc_IronIngot_C'), beamIn), { kind: 'none', reason: 'item' });
  assert.deepEqual(dropTarget(f, data, steelOut, portOf(ps, 's1', 'out', 'Desc_IronIngot_C')), { kind: 'none', reason: 'item' });
  // Sobra sem item chegando: a porta é a do item arrastado no corpo do bloco; fluido no Awesome Sink não.
  const sinkPort: ScenePort = { block: 's6', item: 'Desc_SteelIngot_C', side: 'in', x: 800, y: 206, fluid: false };
  assert.deepEqual(dropTarget(f, data, steelOut, sinkPort), { kind: 'connect', from: 's2', to: 's6', item: 'Desc_SteelIngot_C' });
  const water = portOf(ps, 's1', 'in', 'Desc_Water_C');
  const g = addBlock(f, data, { kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C' }, [-200, 0]);   // s7
  const wOut: ScenePort = { block: 's7', item: 'Desc_Water_C', side: 'out', x: -192, y: 4, fluid: true };
  assert.deepEqual(dropTarget(g, data, wOut, water), { kind: 'connect', from: 's7', to: 's1', item: 'Desc_Water_C' });
  assert.deepEqual(dropTarget(g, data, wOut, { ...sinkPort, item: 'Desc_Water_C', fluid: true }), { kind: 'none', reason: 'fluidSink' });
  const h = connect(g, data, 's7', 's1', 'Desc_Water_C');
  assert.deepEqual(dropTarget(h, data, water, wOut), { kind: 'none', reason: 'dup' });
});
