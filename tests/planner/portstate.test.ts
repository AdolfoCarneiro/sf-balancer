import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Block, Factory, GameData, Link, RecipeBlock } from '../../src/planner/model/types.ts';
import { setCollect } from '../../src/planner/model/factory.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { factoryBalance, nextProblem, portStates, type PortState } from '../../src/planner/model/portstate.ts';
import { close } from './fixtures.ts';

const data = game as GameData;
const recipe = (id: string, r: string, limits?: RecipeBlock['limits']): RecipeBlock =>
  ({ id, kind: 'recipe', recipe: r, clock: 100, perRow: null, tiers: {}, ...(limits ? { limits } : {}) });
const link = (id: string, item: string, from: string, to: string): Link => ({ id, item, from, to });
const fac = (blocks: Block[], links: Link[] = []): Factory => ({ v: 2, blocks, links });
const out = (f: Factory, id: string, item: string) =>
  portStates(solveFactory(f, data).blocks[id]).find(p => p.side === 'out' && p.item === item)!;

test('caso 1 do AGENTS: refinarias represam 330 de Iron Ingot', () => {
  const f = fac([recipe('s1', 'Recipe_Alternate_PureIronIngot_C', { machines: 42 }), recipe('s2', 'Recipe_Alternate_IngotSteel_1_C', { machines: 60 })],
    [link('l1', 'Desc_IronIngot_C', 's1', 's2')]);
  const p = out(f, 's1', 'Desc_IronIngot_C');
  assert.equal(p.kind, 'surplus'); close(p.amount, 330); close(p.rate, 2400);
});

test('entrada com falta', () => {
  const f = fac([recipe('s1', 'Recipe_Alternate_PureIronIngot_C', { machines: 2 }), recipe('s2', 'Recipe_Alternate_IngotSteel_1_C', { machines: 5 })],
    [link('l1', 'Desc_IronIngot_C', 's1', 's2')]);
  const p = portStates(solveFactory(f, data).blocks.s2).find(x => x.side === 'in' && x.item === 'Desc_IronIngot_C')!;
  assert.equal(p.kind, 'deficit'); close(p.amount, 5 * 40 - 2 * 65);
});

test('produto final sem ligação sai da fábrica', () => {
  const f = fac([recipe('s1', 'Recipe_Alternate_PureIronIngot_C', { machines: 2 })]);
  const p = out(f, 's1', 'Desc_IronIngot_C');
  assert.equal(p.kind, 'exit'); close(p.amount, 130);
});

test('subproduto sem destino trava', () => {
  const f = fac([recipe('a1', 'Recipe_AluminaSolution_C', { machines: 1 })]);
  const ps = portStates(solveFactory(f, data).blocks.a1).filter(p => p.side === 'out');
  assert.deepEqual(ps.filter(p => p.kind === 'stalled').map(p => p.item), ['Desc_Silica_C']);
  assert.equal(ps.length, 2);
  assert.notEqual(ps.find(p => p.item !== 'Desc_Silica_C')!.kind, 'stalled');
  const g = solveFactory(setCollect(f, data, 'a1', 'Desc_Silica_C', true), data);
  assert.ok(portStates(g.blocks.a1).every(p => p.kind !== 'stalled'));
});

test('sem fluxo nem limite: tudo ok, sem NaN', () => {
  const f = fac([recipe('u1', 'Recipe_IngotIron_C')]);
  const flow = solveFactory(f, data);
  for (const p of portStates(flow.blocks.u1)) {
    assert.ok(p.amount === null || !Number.isNaN(p.amount)); assert.ok(p.rate === null || !Number.isNaN(p.rate));
    assert.notEqual(p.kind, 'deficit'); assert.notEqual(p.kind, 'surplus');
  }
  const b = factoryBalance(f, flow, data);
  for (const r of [...b.ins, ...b.outs, ...b.sink]) assert.ok(r.rate === null || !Number.isNaN(r.rate));
  assert.deepEqual(b.problems, []);
  assert.ok(b.ins.every(r => r.rate === null));   // sem limite contamina
});

test('balanço: entra, sai, sink e problemas', () => {
  const f = fac([{ id: 'm1', kind: 'miner', item: 'Desc_OreIron_C', rate: 120 }, recipe('s1', 'Recipe_IngotIron_C')],
    [link('l1', 'Desc_OreIron_C', 'm1', 's1')]);
  const b = factoryBalance(f, solveFactory(f, data), data);
  assert.deepEqual(b.ins, [{ item: 'Desc_OreIron_C', rate: 120 }]);
  assert.deepEqual(b.outs, [{ item: 'Desc_IronIngot_C', rate: 120 }]);
  assert.deepEqual(b.sink, []); assert.deepEqual(b.problems, []);
  const g = fac([{ id: 'm1', kind: 'miner', item: 'Desc_OreIron_C', rate: 120 }, { id: 'k1', kind: 'sink' }],
    [link('l1', 'Desc_OreIron_C', 'm1', 'k1')]);
  const c = factoryBalance(g, solveFactory(g, data), data);
  assert.deepEqual(c.sink, [{ item: 'Desc_OreIron_C', rate: 120 }]);
  assert.deepEqual(c.outs, []);
  // Problemas: a sobra do caso 1.
  const h = fac([recipe('s1', 'Recipe_Alternate_PureIronIngot_C', { machines: 42 }), recipe('s2', 'Recipe_Alternate_IngotSteel_1_C', { machines: 60 })],
    [link('l1', 'Desc_IronIngot_C', 's1', 's2')]);
  const d = factoryBalance(h, solveFactory(h, data), data);
  assert.deepEqual(d.problems.map(p => [p.block, p.kind]), [['s1', 'surplus']]);
});

for (const kind of ['export', 'container'] as const) {
  test(`balanço: o que chega a ${kind} conta em Sai, não em Sink`, () => {
    const f = fac([{ id: 'm1', kind: 'miner', item: 'Desc_OreIron_C', rate: 120 }, recipe('s1', 'Recipe_IngotIron_C'), { id: 'x1', kind }],
      [link('l1', 'Desc_OreIron_C', 'm1', 's1'), link('l2', 'Desc_IronIngot_C', 's1', 'x1')]);
    const b = factoryBalance(f, solveFactory(f, data), data);
    assert.deepEqual(b.outs, [{ item: 'Desc_IronIngot_C', rate: 120 }]);
    assert.deepEqual(b.sink, []);
    assert.deepEqual(b.problems, []);
  });
}

test('nextProblem: circular, por tipo, travada conta como falta', () => {
  const p = (kind: PortState['kind'], block: string): PortState => ({ block, side: kind === 'deficit' ? 'in' : 'out', item: 'x', kind, amount: 1, rate: 1 });
  const ps = [p('surplus', 'a'), p('deficit', 'b'), p('stalled', 'c'), p('surplus', 'd')];
  assert.equal(nextProblem([], 'deficit', -1), null);
  assert.equal(nextProblem([p('surplus', 'a')], 'deficit', -1), null);
  assert.equal(nextProblem(ps, 'deficit', -1)?.index, 0);
  assert.equal(nextProblem(ps, 'deficit', -1)?.problem.block, 'b');
  assert.equal(nextProblem(ps, 'deficit', 0)?.problem.block, 'c');
  assert.equal(nextProblem(ps, 'deficit', 1)?.index, 0);   // volta ao primeiro
  assert.equal(nextProblem(ps, 'surplus', 0)?.problem.block, 'd');
  assert.equal(nextProblem(ps, 'surplus', 7)?.index, 0);   // índice velho depois de a lista encolher
});

test('balanço da fábrica vazia', () => {
  assert.deepEqual(factoryBalance(fac([]), solveFactory(fac([]), data), data), { ins: [], outs: [], sink: [], problems: [] });
});
