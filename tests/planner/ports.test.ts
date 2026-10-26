import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { addBlock, connect } from '../../src/planner/model/factory.ts';
import { dropTarget, type ScenePort } from '../../src/planner/model/map/ports.ts';

const data = game as GameData;
const ex = exampleFactory(data);
// dropTarget só lê bloco, lado e item da porta.
const portOf = (block: string, side: 'in' | 'out', item: string): ScenePort =>
  ({ block, side, item, x: 0, y: 0, fluid: !!data.items[item]?.fluid });

test('dropTarget: porta compatível liga, vazio abre o seletor filtrado, incompatível não faz nada', () => {
  let f = addBlock(ex, data, { kind: 'recipe', recipe: 'Recipe_SteelBeam_C' }, [800, 0]);   // s5, sem ligação
  f = addBlock(f, data, { kind: 'sink' }, [800, 200]);                                      // s6
  const steelOut = portOf('s2', 'out', 'Desc_SteelIngot_C'), beamIn = portOf('s5', 'in', 'Desc_SteelIngot_C');
  assert.deepEqual(dropTarget(f, data, steelOut, beamIn), { kind: 'connect', from: 's2', to: 's5', item: 'Desc_SteelIngot_C' });
  // Ao contrário (da entrada para a saída) liga no mesmo sentido.
  assert.deepEqual(dropTarget(f, data, beamIn, steelOut), { kind: 'connect', from: 's2', to: 's5', item: 'Desc_SteelIngot_C' });
  assert.deepEqual(dropTarget(f, data, steelOut, null), { kind: 'picker', filter: { consumes: 'Desc_SteelIngot_C' } });
  assert.deepEqual(dropTarget(f, data, beamIn, null), { kind: 'picker', filter: { produces: 'Desc_SteelIngot_C' } });
  // Já ligada (s2 → s3 aço), outro item, mesmo lado, o próprio bloco.
  assert.deepEqual(dropTarget(f, data, steelOut, portOf('s3', 'in', 'Desc_SteelIngot_C')), { kind: 'none', reason: 'dup' });
  assert.deepEqual(dropTarget(f, data, steelOut, portOf('s2', 'in', 'Desc_IronIngot_C')), { kind: 'none', reason: 'self' });
  assert.deepEqual(dropTarget(f, data, portOf('s1', 'out', 'Desc_IronIngot_C'), beamIn), { kind: 'none', reason: 'item' });
  assert.deepEqual(dropTarget(f, data, steelOut, portOf('s1', 'out', 'Desc_IronIngot_C')), { kind: 'none', reason: 'item' });
  // Sobra sem item chegando: a porta é a do item arrastado no corpo do bloco; fluido no Awesome Sink não.
  const sinkPort: ScenePort = { block: 's6', item: 'Desc_SteelIngot_C', side: 'in', x: 800, y: 206, fluid: false };
  assert.deepEqual(dropTarget(f, data, steelOut, sinkPort), { kind: 'connect', from: 's2', to: 's6', item: 'Desc_SteelIngot_C' });
  const water = portOf('s1', 'in', 'Desc_Water_C');
  const g = addBlock(f, data, { kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C' }, [-200, 0]);   // s7
  const wOut: ScenePort = { block: 's7', item: 'Desc_Water_C', side: 'out', x: -192, y: 4, fluid: true };
  assert.deepEqual(dropTarget(g, data, wOut, water), { kind: 'connect', from: 's7', to: 's1', item: 'Desc_Water_C' });
  assert.deepEqual(dropTarget(g, data, wOut, { ...sinkPort, item: 'Desc_Water_C', fluid: true }), { kind: 'none', reason: 'fluidSink' });
  const h = connect(g, data, 's7', 's1', 'Desc_Water_C');
  assert.deepEqual(dropTarget(h, data, water, wOut), { kind: 'none', reason: 'dup' });
});
