import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Block, Factory, GameData, Link, RecipeBlock } from '../../src/planner/model/types.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { portStates, type PortState } from '../../src/planner/model/portstate.ts';
import { fixesFor, problemSentence } from '../../src/planner/model/fixes.ts';
import type { Pt } from '../../src/planner/model/map/geo.ts';
import { addLinkedBlock } from '../../src/planner/model/factory.ts';
import { close } from './fixtures.ts';

const data = game as GameData;
const recipe = (id: string, r: string, limits?: RecipeBlock['limits']): RecipeBlock =>
  ({ id, kind: 'recipe', recipe: r, clock: 100, perRow: null, tiers: {}, ...(limits ? { limits } : {}) });
const link = (id: string, item: string, from: string, to: string): Link => ({ id, item, from, to });
const fac = (blocks: Block[], links: Link[] = []): Factory => ({ v: 2, blocks, links });
const at: Pt = [8, 16];
const IRON = 'Desc_IronIngot_C', ORE = 'Desc_OreIron_C';
const port = (f: Factory, id: string, side: 'in' | 'out', item: string): PortState =>
  portStates(solveFactory(f, data).blocks[id]).find(p => p.side === side && p.item === item)!;
const run = (f: Factory, p: PortState) => {
  const flow = solveFactory(f, data);
  return { s: problemSentence(p, f, flow, data), fx: fixesFor(p, f, flow, data, at) };
};

const caso1 = () => fac([recipe('s1', 'Recipe_Alternate_PureIronIngot_C', { machines: 42 }), recipe('s2', 'Recipe_Alternate_IngotSteel_1_C', { machines: 60 })],
  [link('l1', IRON, 's1', 's2')]);

test('sobra das refinarias do caso 1: frase e consertos', () => {
  const f = caso1();
  const { s, fx } = run(f, port(f, 's1', 'out', IRON));
  assert.equal(s?.key, 'plWhySurplus');
  assert.equal(s!.args[0], 'Solid Steel Ingot'); close(s!.args[1] as number, 2400); close(s!.args[2] as number, 330);
  assert.deepEqual(fx.map(x => x.key), ['plFixSink', 'plFixReduce']);
  const sink = fx[0].action;
  assert.ok(sink?.type === 'addLinkedBlock' && sink.spec.kind === 'sink' && sink.port.side === 'out' && sink.port.block === 's1');
  assert.deepEqual(sink.at, at);
  assert.equal(fx[1].n, 37);
  assert.deepEqual(fx[1].action, { type: 'setLimits', id: 's1', limits: { machines: 37 } });
});

test('falta com Miner a montante: aumentar a fonte pela falta', () => {
  const f = fac([{ id: 'm1', kind: 'miner', item: ORE, rate: 100 }, recipe('s1', 'Recipe_IngotIron_C', { machines: 5 })], [link('l1', ORE, 'm1', 's1')]);
  const { s, fx } = run(f, port(f, 's1', 'in', ORE));
  assert.equal(s?.key, 'plWhyDeficit');
  const raise = fx.find(x => x.key === 'plFixRaise')!;
  assert.ok(raise.action?.type === 'setMinerRate'); close(raise.action.rate, 150); close(raise.n, 150);
  assert.equal(fx[0].key, 'plFixRaise');
  const red = fx.find(x => x.key === 'plFixReduce')!;
  assert.equal(red.n, 3);   // floor(5 * 100 / 150)
  assert.ok(fx.some(x => x.key === 'plFixCreate' && x.action === null));
});

test('falta com duas produtoras: sem aumentar a fonte, com criar fonte', () => {
  const f = fac([{ id: 'm1', kind: 'miner', item: ORE, rate: 50 }, { id: 'm2', kind: 'miner', item: ORE, rate: 50 }, recipe('s1', 'Recipe_IngotIron_C', { machines: 5 })],
    [link('l1', ORE, 'm1', 's1'), link('l2', ORE, 'm2', 's1')]);
  const { fx } = run(f, port(f, 's1', 'in', ORE));
  assert.ok(!fx.some(x => x.key === 'plFixRaise'));
  assert.ok(fx.some(x => x.key === 'plFixCreate'));
});

test('falta com receita fixada e extrator', () => {
  const f = fac([recipe('a', 'Recipe_Alternate_PureIronIngot_C', { machines: 2 }), recipe('b', 'Recipe_Alternate_IngotSteel_1_C', { machines: 5 })], [link('l1', IRON, 'a', 'b')]);
  const raise = run(f, port(f, 'b', 'in', IRON)).fx.find(x => x.key === 'plFixRaise')!;   // falta 70, 65 por máquina
  assert.deepEqual(raise.action, { type: 'setLimits', id: 'a', limits: { machines: 4 } }); assert.equal(raise.n, 4);
  // Extrator com count null: não oferece.
  const w = fac([{ id: 'e', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: null },
    { ...recipe('s', 'Recipe_AluminaSolution_C', { machines: 1 }), collect: ['Desc_Silica_C'] }], [link('l', 'Desc_Water_C', 'e', 's')]);
  assert.ok(!run(w, port(w, 's', 'in', 'Desc_Water_C')).fx.some(x => x.key === 'plFixRaise'));
  // Extrator fixado em 1 (120 de 180): falta 60, mais 1.
  const w2 = fac([{ id: 'e', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: 1 },
    { ...recipe('s', 'Recipe_AluminaSolution_C', { machines: 1 }), collect: ['Desc_Silica_C'] }], [link('l', 'Desc_Water_C', 'e', 's')]);
  const r2 = run(w2, port(w2, 's', 'in', 'Desc_Water_C')).fx.find(x => x.key === 'plFixRaise')!;
  assert.deepEqual(r2.action, { type: 'setExtractor', id: 'e', count: 2 });
});

test('sobra de fluido: sem sink', () => {
  const f = fac([{ id: 'e', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: 2 },
    { ...recipe('s', 'Recipe_AluminaSolution_C', { machines: 1 }), collect: ['Desc_Silica_C'] }], [link('l', 'Desc_Water_C', 'e', 's')]);
  const p = port(f, 'e', 'out', 'Desc_Water_C');
  assert.equal(p.kind, 'surplus');
  const { s, fx } = run(f, p);
  assert.equal(s?.key, 'plWhySurplus');
  assert.ok(!fx.some(x => x.key === 'plFixSink'));
});

test('reduzir nunca abaixo de 1 nem igual ao atual', () => {
  // 1 máquina consumindo, sobra pequena: N = 1 = atual, não oferece.
  const f = fac([recipe('s1', 'Recipe_Alternate_PureIronIngot_C', { machines: 1 }), recipe('s2', 'Recipe_Alternate_IngotSteel_1_C', { machines: 1 })], [link('l1', IRON, 's1', 's2')]);
  const p = port(f, 's1', 'out', IRON);
  assert.equal(p.kind, 'surplus');
  assert.ok(!run(f, p).fx.some(x => x.key === 'plFixReduce'));
  // Falta com 1 máquina: floor daria 0, não oferece.
  const g = fac([{ id: 'm1', kind: 'miner', item: ORE, rate: 10 }, recipe('s1', 'Recipe_IngotIron_C', { machines: 1 })], [link('l1', ORE, 'm1', 's1')]);
  assert.ok(!run(g, port(g, 's1', 'in', ORE)).fx.some(x => x.key === 'plFixReduce'));
  // Falta com 2 máquinas e N calculado 0: clamp em 1.
  const h = fac([{ id: 'm1', kind: 'miner', item: ORE, rate: 10 }, recipe('s1', 'Recipe_IngotIron_C', { machines: 2 })], [link('l1', ORE, 'm1', 's1')]);
  assert.equal(run(h, port(h, 's1', 'in', ORE)).fx.find(x => x.key === 'plFixReduce')!.n, 1);
});

test('porta ok: sem frase nem consertos; travada: sink só em sólido', () => {
  const f = fac([recipe('a1', 'Recipe_AluminaSolution_C', { machines: 1 })]);
  const ps = portStates(solveFactory(f, data).blocks.a1);
  const st = ps.find(p => p.kind === 'stalled')!;
  const r = run(f, st);
  assert.equal(r.s?.key, 'plWhyStalled');
  assert.deepEqual(r.fx.map(x => x.key), ['plFixSink']);
  const ok: PortState = { block: 'a1', side: 'in', item: ORE, kind: 'ok', amount: null, rate: 1 };
  assert.equal(problemSentence(ok, f, solveFactory(f, data), data), null);
  assert.deepEqual(fixesFor(ok, f, solveFactory(f, data), data, at), []);
});

test('sobra de fluido: mandar para uma Saída', () => {
  const f = fac([{ id: 'e', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: 2 },
    { ...recipe('s', 'Recipe_AluminaSolution_C', { machines: 1 }), collect: ['Desc_Silica_C'] }], [link('l', 'Desc_Water_C', 'e', 's')]);
  const fx = run(f, port(f, 'e', 'out', 'Desc_Water_C')).fx;
  assert.equal(fx[0].key, 'plFixExport');
  assert.deepEqual(fx[0].action, { type: 'addLinkedBlock', spec: { kind: 'export' }, port: { block: 'e', item: 'Desc_Water_C', side: 'out' }, at });
});

// Heavy Oil Residue fixada em 42, as duas saídas indo para Residual Fuel e Residual Rubber, e as duas para a Recycled
// Plastic (Rubber + Fuel meio a meio). Só 37,5 % da Heavy Oil Residue escoa; a refinaria desacelera e a cadeia vai junto até 0.
const HOR = 'Desc_HeavyOilResidue_C', RESIN = 'Desc_PolymerResin_C';
const entope = () => fac([recipe('h', 'Recipe_Alternate_HeavyOilResidue_C', { machines: 42 }), recipe('f', 'Recipe_ResidualFuel_C'),
  recipe('r', 'Recipe_ResidualRubber_C'), recipe('p', 'Recipe_Alternate_Plastic_1_C')],
[link('l1', HOR, 'h', 'f'), link('l2', RESIN, 'h', 'r'), link('l3', 'Desc_LiquidFuel_C', 'f', 'p'), link('l4', 'Desc_Rubber_C', 'r', 'p')]);

test('saída que entope a cadeia até parar: a frase diz quanto escoa, e só nela', () => {
  const f = entope();
  close(solveFactory(f, data).blocks.h.x, 0);
  const { s, fx } = run(f, port(f, 'h', 'out', HOR));
  assert.equal(s?.key, 'plWhyChoke');
  assert.equal(s!.args[0], 'Heavy Oil Residue');
  close(s!.args[1] as number, 630); close(s!.args[2] as number, 1680); close(s!.args[3] as number, 37.5);
  assert.deepEqual(fx.map(x => x.key), ['plFixExport', 'plFixCreate']);
  // A resina não é o problema: sem frase.
  assert.equal(run(f, port(f, 'h', 'out', RESIN)).s, null);
});

test('o conserto da Saída destrava a cadeia', () => {
  const f = entope();
  const fx = run(f, port(f, 'h', 'out', HOR)).fx[0];
  const a = fx.action!;
  assert.equal(a.type, 'addLinkedBlock');
  const g = a.type === 'addLinkedBlock' ? addLinkedBlock(f, data, a.spec, a.port, a.at) : f;
  const r = solveFactory(g, data);
  close(r.blocks.h.x, 42); close(r.blocks.p.x, 14); close(r.blocks.f.x, 10.5);
});

test('sobra comum (sem parar a cadeia) continua com a frase de sobra', () => {
  const f = caso1();
  assert.equal(run(f, port(f, 's1', 'out', IRON)).s?.key, 'plWhySurplus');
});
