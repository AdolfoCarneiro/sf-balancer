import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Block, Factory, GameData, Link, RecipeBlock } from '../../src/planner/model/types.ts';
import { setCollect, setLimits } from '../../src/planner/model/factory.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { blockBadges, limitView } from '../../src/planner/model/badges.ts';
import { buildScene } from '../../src/planner/model/map/scene.ts';
import { close, semFramework, vf } from './fixtures.ts';

const data = game as GameData;
const recipe = (id: string, r: string, limits?: RecipeBlock['limits']): RecipeBlock =>
  ({ id, kind: 'recipe', recipe: r, clock: 100, perRow: null, tiers: {}, ...(limits ? { limits } : {}) });
const link = (id: string, item: string, from: string, to: string): Link => ({ id, item, from, to });
const fac = (blocks: Block[], links: Link[] = []): Factory => ({ v: 2, blocks, links });

test('badges da cadeia do Framework com canos limitados: represado só na mineradora', () => {
  const flow = solveFactory(setLimits(vf(), 's4', { machines: 8 }), data);
  assert.deepEqual(blockBadges(flow.blocks.m1, flow).map(b => b.kind), ['held']);
  const [h] = blockBadges(flow.blocks.m1, flow);
  assert.equal(h.side, 'out'); assert.equal(h.item, 'Desc_OreIron_C'); close(h.amount, 280 - 35 * 240 / 65);
  assert.deepEqual(blockBadges(flow.blocks.s2, flow), []);
  // Canos fixados: o produto sai da fábrica (verde), sem falta.
  assert.deepEqual(blockBadges(flow.blocks.s4, flow).map(b => [b.kind, b.side, b.item]), [['exit', 'out', 'Desc_SteelPipe_C']]);
  close(blockBadges(flow.blocks.s4, flow)[0].amount, 160);   // 8 × 20 canos
});

test('badges: falta na entrada limitada, travado com o item, sem limite', () => {
  // Vigas fixadas acima do aço: falta de 120 na entrada de aço; as vigas saem como produto.
  const f = solveFactory(setLimits(semFramework(), 's3', { machines: 15 }), data);
  const bs = blockBadges(f.blocks.s3, f);
  assert.deepEqual(bs.map(b => [b.kind, b.side, b.item]), [['deficit', 'in', 'Desc_SteelIngot_C'], ['exit', 'out', 'Desc_SteelPlate_C']]);
  close(bs[0].amount, 120);
  // Alumina com a Silica parada: só o travado, com o item e o que produziria (sem "represado" nas saídas).
  const al = fac([recipe('a1', 'Recipe_AluminaSolution_C', { machines: 1 })]);
  const r = solveFactory(al, data);
  assert.deepEqual(blockBadges(r.blocks.a1, r), [{ kind: 'stalled', side: 'block', item: 'Desc_Silica_C', amount: 50 }]);
  // Coletando a Silica: destrava, e as duas saídas saem da fábrica.
  const g = solveFactory(setCollect(al, data, 'a1', 'Desc_Silica_C', true), data);
  assert.deepEqual(blockBadges(g.blocks.a1, g).map(b => [b.kind, b.item, b.amount]),
    [['exit', 'Desc_AluminaSolution_C', 120], ['exit', 'Desc_Silica_C', 50]]);
  // Bloco solto sem limite: só "sem limite" (a saída sem limite não vira número).
  const u = solveFactory(fac([recipe('u1', 'Recipe_IngotIron_C')]), data);
  assert.deepEqual(blockBadges(u.blocks.u1, u), [{ kind: 'unbounded', side: 'block', item: null, amount: null }]);
});

test('badges: loop travado aparece no bloco, antes das portas', () => {
  const f = fac([recipe('P', 'Recipe_Alternate_Plastic_1_C', { machines: 1 }), recipe('R', 'Recipe_Alternate_RecycledRubber_C')],
    [link('lPR', 'Desc_Plastic_C', 'P', 'R'), link('lRP', 'Desc_Rubber_C', 'R', 'P')]);
  const r = solveFactory(f, data);
  assert.equal(blockBadges(r.blocks.P, r)[0].kind, 'deadlock');
  assert.equal(blockBadges(r.blocks.R, r)[0].kind, 'deadlock');
  assert.ok(blockBadges(r.blocks.P, r).every((b, i, a) => i === 0 || b.side !== 'block' || a[i - 1].side === 'block'));
});

test('limitView: fixado marcado; voltar ao padrão tira só aquele limite', () => {
  const bloco = recipe('s2', 'Recipe_Alternate_IngotSteel_1_C');
  const flow = solveFactory(fac([bloco]), data);   // sem limite
  const bf = flow.blocks.s2;
  const b = { ...bloco, limits: { machines: 8, inputs: { Desc_IronIngot_C: 200 } } };
  assert.equal(limitView(b, bf).machines.fixed, true);
  assert.equal(limitView(b, bf).machines.value, 8);
  const v = limitView({ ...b, limits: { inputs: b.limits.inputs } }, bf);
  assert.equal(v.machines.fixed, false); assert.equal(v.inputs[0].fixed, true);
  assert.equal(v.inputs[0].item, 'Desc_IronIngot_C'); assert.equal(v.inputs[0].value, 200);
});

test('limitView: valor calculado vem do fluxo; entrada bruta marcada', () => {
  const f = setLimits(vf(), 's4', { machines: 8 });
  const flow = solveFactory(f, data);
  const s2 = f.blocks.find(b => b.id === 's2') as RecipeBlock;
  const v = limitView(s2, flow.blocks.s2, f.links);
  assert.deepEqual(v.machines, { value: 6, fixed: false });
  assert.deepEqual(v.inputs.map(p => [p.item, p.fixed, p.raw]), [['Desc_IronIngot_C', false, false], ['Desc_Coal_C', false, true]]);
  close(v.inputs[0].value, 240); close(v.inputs[1].value, 240);
  // Sem fluxo ainda (bloco recém-criado): sem número calculado.
  assert.deepEqual(limitView(s2, undefined, f.links).machines, { value: null, fixed: false });
});

test('cena: o toco da entrada bruta mostra a taxa resolvida, não a nominal', () => {
  // 8 máquinas de Solid Steel com só 200 de ferro: o carvão bruto também cai para 5 máquinas-equivalentes (200/min).
  const f = fac([recipe('s2', 'Recipe_Alternate_IngotSteel_1_C', { machines: 8, inputs: { Desc_IronIngot_C: 200 } })]);
  const flow = solveFactory(f, data);
  const s = buildScene(f, data, { s2: { x: 0, y: 0, rot: 0 } }, {}, flow);
  const sum = (item: string) => s.belts.filter(b => b.role === 'raw' && b.item === item).reduce((t, b) => t + b.rate, 0);
  close(sum('Desc_IronIngot_C'), 200); close(sum('Desc_Coal_C'), 200);
});
