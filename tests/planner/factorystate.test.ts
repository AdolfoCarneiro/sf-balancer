import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, RecipeBlock } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import {
  type History, encodeFactory, decodeFactory, migrateV1, exampleFactory, initialHistory, reduce, shouldPersist, PLANNER_STORE,
} from '../../src/planner/model/factorystate.ts';
import { historyNew, encodeShare } from '../../src/logic/index.js';

const data = game as GameData;
const ex = exampleFactory(data);
const rb = (f: Factory, id: string) => f.blocks.find(b => b.id === id) as RecipeBlock;

test('estado v2: migração v1, máquinas viram fixadas, mapa e montagens passam, política sink vira coleta', () => {
  const v1 = { ...exampleChain(data), policy: 'sink', map: { s1: { x: 0, y: 0, rot: 0 } }, alts: { 'Desc_IronIngot_C:s1>s2': 'k1' }, mapGap: 4 };
  const f = decodeFactory(encodeShare(v1), data)!;
  assert.equal(f.v, 2);
  assert.deepEqual(rb(f, 's2'), {
    id: 's2', kind: 'recipe', recipe: 'Recipe_Alternate_IngotSteel_1_C', clock: 100, perRow: 12, tiers: {},
    limits: { machines: 60 }, collect: ['Desc_SteelIngot_C'],
  });
  assert.deepEqual(rb(f, 's1').collect, ['Desc_IronIngot_C']);
  assert.equal(rb(f, 's3').collect, undefined);   // saída sem ligação: produto final, não sobra
  assert.deepEqual(f.map, { s1: { x: 0, y: 0, rot: 0 } });
  assert.deepEqual(f.alts, { 'Desc_IronIngot_C:s1>s2': 'k1' });
  assert.equal(f.mapGap, 4);
  assert.deepEqual(f.links, exampleChain(data).links);
  assert.equal('policy' in f, false);
  assert.equal(migrateV1({ v: 3 }, data), null);
  assert.equal(migrateV1('x', data), null);
});

test('estado v2: o exemplo é a migração do exemplo da v1 (represar: sem coleta)', () => {
  assert.deepEqual(ex, migrateV1(exampleChain(data), data));
  assert.deepEqual(ex.blocks.map(b => (b as RecipeBlock).limits), [{ machines: 42 }, { machines: 60 }, { machines: 30 }, { machines: 60 }]);
  assert.ok(ex.blocks.every(b => !('collect' in b)));
});

test('estado v2: link #p= antigo (v1) abre pelo initialHistory', () => {
  const h = initialHistory('#p=' + encodeShare(exampleChain(data)), null, data);
  assert.equal(h.present.v, 2);
  assert.deepEqual(h.present, ex);
  assert.deepEqual(initialHistory('', null, data).present, ex);
  assert.deepEqual(initialHistory('#p=zz', 'quebrado', data).present, ex);
  assert.equal(PLANNER_STORE, 'sf-balancer:planner');
});

function full(): Factory {
  return {
    v: 2,
    blocks: [
      { id: 's1', kind: 'recipe', recipe: 'Recipe_AluminumScrap_C', clock: 150, perRow: 3, tiers: { 'out:Desc_Water_C': 'Mk2' },
        limits: { machines: 4, inputs: { Desc_Coal_C: 300 } }, collect: ['Desc_AluminumScrap_C'] },
      { id: 's2', kind: 'miner', item: 'Desc_Coal_C', rate: 240 },
      { id: 's3', kind: 'extractor', building: 'Build_FrackingExtractor_C', item: 'Desc_Water_C', purity: 'pure', count: 6 },
      { id: 's4', kind: 'sink' }, { id: 's5', kind: 'container' }, { id: 's6', kind: 'export' },
      { id: 's7', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: null },
    ],
    links: [
      { id: 'l1', item: 'Desc_Coal_C', from: 's2', to: 's1' },
      { id: 'l2', item: 'Desc_AluminumScrap_C', from: 's1', to: 's4' },
      { id: 'l3', item: 'Desc_Water_C', from: 's1', to: 's5' },
      { id: 'l4', item: 'Desc_Water_C', from: 's3', to: 's6' },
    ],
    map: { s1: { x: 0, y: 0, rot: 1 }, s4: { x: 64, y: 8, rot: 0, gapRow: 4 } },
    alts: { 'Desc_Coal_C:s2>s1': 'a' },
    mapGap: 3,
    ligs: { 'Desc_Coal_C:s2>s1': { x: 16, y: -8, rot: 2 } },
  };
}

test('estado v2: ida e volta igual (todos os tipos de bloco, limites, coleta, ligs)', () => {
  const f = full();
  assert.deepEqual(decodeFactory(encodeFactory(f), data), f);
  assert.deepEqual(decodeFactory(encodeFactory(ex), data), ex);
});

test('estado v2: lixo e versão desconhecida viram null', () => {
  assert.equal(decodeFactory('%%%', data), null);
  assert.equal(decodeFactory(encodeShare({}), data), null);
  assert.equal(decodeFactory(encodeShare({ v: 3, blocks: [], links: [] }), data), null);
});

test('estado v2: hostil é descartado ou limitado', () => {
  const raw: any = full();
  raw.blocks[0].limits = { machines: NaN, inputs: { Desc_Coal_C: -1, Desc_Nope_C: 5, Desc_AluminaSolution_C: 1e7 } };
  raw.blocks[0].collect = ['Desc_Water_C', 'Desc_AluminumScrap_C', 'Desc_AluminumScrap_C', 'Desc_Coal_C'];
  raw.blocks[0].clock = 999;
  raw.blocks[1].rate = 1e9;                                      // mineradora fora do limite: some
  raw.blocks[2].count = 1001; raw.blocks[2].purity = 'mega';
  raw.blocks[6].purity = 'pure';                                // Water Extractor não tem pureza
  raw.blocks.push(
    { id: 's8', kind: 'boss' },
    { id: 's9', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_LiquidOil_C', purity: 'normal', count: null },
    { id: 's10', kind: 'miner', item: 'Desc_Water_C', rate: 60 },
    { id: '__proto__', kind: 'sink' },
    { id: 's4', kind: 'container' },                            // id repetido
    { id: 's11', kind: 'recipe', recipe: 'Recipe_SteelBeam_C', clock: 100, perRow: null, tiers: { 'in:Desc_SteelIngot_C': 'Mk9' }, limits: { machines: 2.5 } },
  );
  raw.links.push(
    { id: 'l5', item: 'Desc_Water_C', from: 's1', to: 's4' },     // fluido → sink
    { id: 'l6', item: 'Desc_Coal_C', from: 's1', to: 's1' },
  );
  raw.ligs = { 'x:y>z': { x: 0, y: 0, rot: 0 }, 'Desc_AluminumScrap_C:s1>s4': { x: 1e9, y: 3, rot: 0, gapRow: 2 }, 'Desc_Water_C:s1>s5': { x: 0, y: 0, rot: 7 } };
  const json = JSON.stringify(raw).replace('"ligs":{', '"ligs":{"__proto__":{"x":0,"y":0,"rot":0},');
  const f = decodeFactory(encodeShare(JSON.parse(json)), data)!;
  const b = rb(f, 's1');
  assert.equal(b.limits, undefined);
  assert.deepEqual(b.collect, ['Desc_AluminumScrap_C']);
  assert.equal(b.clock, 250);
  assert.deepEqual(f.blocks.map(x => x.id), ['s1', 's3', 's4', 's5', 's6', 's7', 's11']);
  assert.deepEqual(f.blocks[1], { id: 's3', kind: 'extractor', building: 'Build_FrackingExtractor_C', item: 'Desc_Water_C', purity: 'normal', count: null });
  assert.equal((f.blocks[5] as any).purity, 'normal');
  assert.deepEqual(rb(f, 's11'), { id: 's11', kind: 'recipe', recipe: 'Recipe_SteelBeam_C', clock: 100, perRow: null, tiers: {} });
  assert.deepEqual(f.links.map(l => l.id), ['l2', 'l3', 'l4']);
  assert.equal(f.alts, undefined);   // a ligação do carvão sumiu com a mineradora
  assert.deepEqual(f.ligs, { 'Desc_AluminumScrap_C:s1>s4': { x: 100000, y: 0, rot: 0 } });
  assert.equal(Object.getPrototypeOf(f.ligs), Object.prototype);
});

test('estado v2: no máximo 200 blocos e 2.000 ligações lidos', () => {
  const blocks = Array.from({ length: 205 }, (_, i) => ({ id: 'b' + i, kind: 'sink' }));
  assert.equal(decodeFactory(encodeShare({ v: 2, blocks, links: [] }), data)!.blocks.length, 200);
  const two = [{ id: 'a', kind: 'miner', item: 'Desc_Coal_C', rate: 60 }, { id: 'b', kind: 'container' }];
  const junk = Array.from({ length: 2000 }, () => ({ id: 'x', item: 'nada', from: 'a', to: 'b' }));
  const raw = { v: 2, blocks: two, links: [...junk, { id: 'l9', item: 'Desc_Coal_C', from: 'a', to: 'b' }] };
  assert.equal(decodeFactory(encodeShare(raw), data)!.links.length, 0);
});

test('estado v2: ações entram no desfazer (placeLig, setLimits, setCollect)', () => {
  let h: History<Factory> = historyNew(ex);
  h = reduce(h, { type: 'placeLig', meio: 'Desc_IronIngot_C:s1>s2', place: { x: 8, y: 8, rot: 0 } }, data);
  h = reduce(h, { type: 'setLimits', id: 's1', limits: null }, data);
  h = reduce(h, { type: 'setCollect', id: 's2', item: 'Desc_SteelIngot_C', on: true }, data);
  assert.equal(h.past.length, 3);
  assert.deepEqual(h.present.ligs, { 'Desc_IronIngot_C:s1>s2': { x: 8, y: 8, rot: 0 } });
  assert.equal(rb(h.present, 's1').limits, undefined);
  assert.deepEqual(rb(h.present, 's2').collect, ['Desc_SteelIngot_C']);
  h = reduce(reduce(reduce(h, { type: 'undo' }, data), { type: 'undo' }, data), { type: 'undo' }, data);
  assert.deepEqual(h.present, ex);
  h = reduce(h, { type: 'redo' }, data);
  assert.ok(h.present.ligs);
  // Mapa, montagem e vão como na fase 2.
  h = reduce(h, { type: 'placeBlock', id: 's1', place: { x: 3, y: 0, rot: 0 } }, data);
  assert.deepEqual(h.present.map, { s1: { x: 0, y: 0, rot: 0 } });
  h = reduce(h, { type: 'setPlaces', places: { s2: { x: 8, y: 0, rot: 1 }, nope: { x: 0, y: 0, rot: 0 } } }, data);
  assert.deepEqual(h.present.map, { s2: { x: 8, y: 0, rot: 1 } });
  h = reduce(h, { type: 'setMeioAlt', meio: 'Desc_IronIngot_C:s1>s2', key: 'k' }, data);
  assert.deepEqual(h.present.alts, { 'Desc_IronIngot_C:s1>s2': 'k' });
  h = reduce(h, { type: 'setMapGap', gap: 5 }, data);
  assert.equal(h.present.mapGap, 5);
  h = reduce(h, { type: 'addBlock', spec: { kind: 'sink' }, at: [0, 0] }, data);
  assert.equal(h.present.blocks.length, 5);
  h = reduce(h, { type: 'load', factory: ex }, data);
  assert.deepEqual(h.present, ex);
});

test('estado v2: aberto por #p=, só grava depois da primeira edição', () => {
  const h0 = initialHistory('#p=' + encodeFactory(ex), null, data);
  assert.equal(shouldPersist(h0, h0, true), false);
  assert.equal(shouldPersist(h0, reduce(h0, { type: 'setLimits', id: 's1', limits: null }, data), true), true);
  assert.equal(shouldPersist(h0, h0, false), true);
  // Link diferente do salvo entra por cima dele.
  const saved = encodeFactory(reduce(h0, { type: 'setLimits', id: 's1', limits: null }, data).present);
  const h = initialHistory('#p=' + encodeFactory(ex), saved, data);
  assert.equal(h.past.length, 1);
  assert.deepEqual(h.present, ex);
});

test('estado v2: migração da v1 lê tier na chave antiga, limita máquinas e passa a política extra como coleta', () => {
  const v1 = {
    ...exampleChain(data), policy: 'extra',
    stages: exampleChain(data).stages.map(s => (s.id === 's2' ? { ...s, machines: 1e9, tiers: { Desc_SteelIngot_C: 'Mk5', Desc_Coal_C: 'Mk9', 'in:Desc_IronIngot_C': 'Mk3' }, locked: true, pos: { x: 1, y: 2 } } : s)),
  };
  const f = migrateV1(v1, data)!;
  assert.deepEqual(rb(f, 's2').tiers, { 'out:Desc_SteelIngot_C': 'Mk5', 'in:Desc_IronIngot_C': 'Mk3' });
  assert.deepEqual(rb(f, 's2').limits, { machines: 10000 });
  assert.deepEqual(rb(f, 's2').collect, ['Desc_SteelIngot_C']);
  assert.equal('locked' in rb(f, 's2'), false);
});

test('estado v2: setMeioAlt só em ligação que existe e com chave curta; setLimits só com entradas da receita', () => {
  let h: History<Factory> = historyNew(ex);
  h = reduce(h, { type: 'setMeioAlt', meio: 'nao:existe>x', key: 'k' }, data);
  h = reduce(h, { type: 'setMeioAlt', meio: 'Desc_IronIngot_C:s1>s2', key: 'k'.repeat(41) }, data);
  assert.equal(h.present.alts, undefined);
  h = reduce(h, { type: 'setLimits', id: 's2', limits: { machines: 50, inputs: { Desc_IronIngot_C: 100, Desc_Water_C: 5 } } }, data);
  assert.deepEqual(rb(h.present, 's2').limits, { machines: 50, inputs: { Desc_IronIngot_C: 100 } });
  h = reduce(h, { type: 'setLimits', id: 's2', limits: { inputs: { Desc_Water_C: 5 } } }, data);
  assert.equal(rb(h.present, 's2').limits, undefined);
});

test('estado v2: propor o mapa de novo troca as posições e solta as ligações postas, num passo só do desfazer', () => {
  const meio = 'Desc_IronIngot_C:s1>s2';
  let h: History<Factory> = historyNew(ex);
  h = reduce(h, { type: 'placeLig', meio, place: { x: 40, y: 8, rot: 1 } }, data);
  h = reduce(h, { type: 'placeBlock', id: 's1', place: { x: 100, y: 100, rot: 0 } }, data);
  assert.deepEqual(h.present.ligs, { [meio]: { x: 40, y: 8, rot: 1 } });
  const before = h.present, steps = h.past.length;
  h = reduce(h, { type: 'proposeMap', places: { s1: { x: 0, y: 0, rot: 0 }, s2: { x: 64, y: 0, rot: 0 }, nope: { x: 0, y: 0, rot: 0 } } }, data);
  assert.equal(h.present.ligs, undefined);
  assert.ok(!('ligs' in h.present));
  assert.deepEqual(h.present.map, { s1: { x: 0, y: 0, rot: 0 }, s2: { x: 64, y: 0, rot: 0 } });
  assert.equal(h.past.length, steps + 1);
  assert.equal(reduce(h, { type: 'undo' }, data).present, before);
});

test('disconnectMeio tira todos os links e um undo volta todos', () => {
  let h: History<Factory> = historyNew(ex);
  h = reduce(h, { type: 'placeLig', meio: 'Desc_IronIngot_C:s1>s2', place: { x: 8, y: 8, rot: 0 } }, data);
  h = reduce(h, { type: 'setMeioAlt', meio: 'Desc_IronIngot_C:s1>s2', key: 'k' }, data);
  const ids = ex.links.filter(l => l.from === 's1' && l.to === 's2').map(l => l.id);
  assert.ok(ids.length > 0);
  const before = h.past.length, withLinks = h.present;
  h = reduce(h, { type: 'disconnectMeio', linkIds: ids }, data);
  assert.equal(h.past.length, before + 1);
  assert.ok(!h.present.links.some(l => ids.includes(l.id)));
  assert.equal(h.present.ligs, undefined); assert.equal(h.present.alts, undefined);
  h = reduce(h, { type: 'undo' }, data);
  assert.deepEqual(h.present, withLinks);
});
