import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Chain, GameData, StageId } from '../../src/planner/model/types.ts';
import {
  nextStageId, nextLinkId, addStage, removeStage, canLink, link, unlink, setMachines, setRecipe, setLocked,
  setPerRow, setPolicy, setClock, moveStage, demandOf, supplyOf, rawInputs, products, linkFlow, MAX_MACHINES,
} from '../../src/planner/model/chain.ts';
import { exampleChain } from '../../src/planner/model/example.ts';

const data = game as GameData;
const ch = exampleChain(data);
const snap = structuredClone(ch);
const m = (c: Chain, id: StageId) => c.stages.find(s => s.id === id)!.machines;

test('cadeia: fundições 60 → 70 sobe vigas e canos na proporção e as refinarias para alimentar', () => {
  const c = setMachines(ch, data, 's2', 70);
  assert.deepEqual(['s1', 's2', 's3', 's4'].map(id => m(c, id)), [44, 70, 35, 70]);
  assert.deepEqual(ch, snap);
});
test('cadeia: etapa travada não muda; a ligação mostra a falta', () => {
  const c = setMachines(setLocked(ch, 's1', true), data, 's2', 70);
  assert.equal(m(c, 's1'), 42);
  assert.equal(linkFlow(c, data, c.links[0].id), 2730);   // oferta 2.730 < demanda 2.800
  assert.equal(demandOf(c, data, 's2', 'Desc_IronIngot_C'), 2800);
});
test('cadeia: mexer numa folha recalcula só para cima', () => {
  const c = setMachines(ch, data, 's3', 40);
  assert.deepEqual(['s1', 's2', 's3', 's4'].map(id => m(c, id)), [44, 70, 40, 60]);
});
test('cadeia: junção divide a demanda pelo que cada produtor dava', () => {
  const two = link(addStage(ch, data, 'Recipe_Alternate_PureIronIngot_C', 21), data, 's5', 's2', 'Desc_IronIngot_C');
  assert.equal(two.links.length, 4);
  assert.equal(supplyOf(two, data, 's5', 'Desc_IronIngot_C'), 1365);
  const c = setMachines(two, data, 's2', 90);
  assert.deepEqual([m(c, 's1'), m(c, 's5'), m(c, 's2')], [37, 19, 90]);
});

const fake: GameData = {
  items: { A: { id: 'A', name: 'A', fluid: false, raw: false }, B: { id: 'B', name: 'B', fluid: false, raw: false } },
  recipes: {
    rAB: { id: 'rAB', name: 'A→B', alt: false, building: 'b', ins: [{ item: 'A', perMin: 30 }], outs: [{ item: 'B', perMin: 30 }] },
    rBA: { id: 'rBA', name: 'B→A', alt: false, building: 'b', ins: [{ item: 'B', perMin: 30 }], outs: [{ item: 'A', perMin: 30 }] },
  },
  buildings: { b: { id: 'b', name: 'b', w: 10, l: 10 } },
};
test('cadeia: ligação que fecha ciclo é recusada e a cadeia fica igual', () => {
  const st = (id: string, recipe: string) => ({ id, recipe, machines: 1, clock: 100, perRow: null, locked: false, tiers: {}, pos: { x: 0, y: 0 } });
  const c: Chain = { v: 1, stages: [st('x', 'rAB'), st('y', 'rBA')], links: [{ id: 'l1', item: 'B', from: 'x', to: 'y' }], policy: 'represar' };
  assert.deepEqual(canLink(c, fake, 'y', 'x', 'A'), { ok: false, reason: 'cycle' });
  assert.equal(link(c, fake, 'y', 'x', 'A'), c);
});
test('cadeia: item errado, repetida e para si mesma são recusadas', () => {
  assert.deepEqual(canLink(ch, data, 's1', 's3', 'Desc_IronIngot_C'), { ok: false, reason: 'item' });
  assert.deepEqual(canLink(ch, data, 's2', 's1', 'Desc_SteelIngot_C'), { ok: false, reason: 'item' });
  assert.deepEqual(canLink(ch, data, 's1', 's2', 'Desc_IronIngot_C'), { ok: false, reason: 'dup' });
  assert.deepEqual(canLink(ch, data, 's2', 's2', 'Desc_SteelIngot_C'), { ok: false, reason: 'self' });
  assert.equal(link(ch, data, 's2', 's2', 'Desc_SteelIngot_C'), ch);
});
test('cadeia: apagar etapa ligada tira as ligações e a entrada vira recurso bruto', () => {
  const c = removeStage(ch, data, 's1');
  assert.equal(c.links.some(l => l.from === 's1' || l.to === 's1'), false);
  assert.ok(rawInputs(c, data).some(r => r.stage === 's2' && r.item === 'Desc_IronIngot_C'));
  assert.deepEqual(ch, snap);
});
test('cadeia: trocar a receita apaga as ligações que não servem mais', () => {
  const c = setRecipe(ch, data, 's3', 'Recipe_Alternate_SteelBeam_Aluminum_C');
  assert.equal(c.links.some(l => l.from === 's2' && l.to === 's3'), false);
  assert.ok(c.links.some(l => l.from === 's2' && l.to === 's4'));
  assert.equal(m(c, 's3'), 30);
  assert.equal(m(c, 's2'), 60);
  assert.ok(rawInputs(c, data).some(r => r.stage === 's3' && r.item === 'Desc_AluminumIngot_C' && r.total === 675));
  assert.deepEqual(ch, snap);
});
test('cadeia: ids, entradas brutas, produtos e fluxo nas ligações do exemplo', () => {
  assert.equal(nextStageId(ch), 's5');
  assert.equal(nextLinkId(ch), 'l4');
  assert.deepEqual(rawInputs(ch, data), [
    { stage: 's1', item: 'Desc_OreIron_C', total: 1470 },
    { stage: 's1', item: 'Desc_Water_C', total: 840 },
    { stage: 's2', item: 'Desc_Coal_C', total: 2400 },
  ]);
  assert.deepEqual(products(ch, data), [
    { stage: 's3', item: 'Desc_SteelPlate_C', total: 450 },
    { stage: 's4', item: 'Desc_SteelPipe_C', total: 1200 },
  ]);
  assert.equal(linkFlow(ch, data, 'l1'), 2400);
  assert.equal(linkFlow(ch, data, 'l2'), 1800);
  assert.equal(linkFlow(ch, data, 'l3'), 1800);
  const u = unlink(ch, 'l3');
  assert.deepEqual(u.links.map(l => l.id), ['l1', 'l2']);
  assert.equal(linkFlow(u, data, 'l2'), 1800);
});
test('cadeia: setters simples e máquinas inteiras ≥ 1', () => {
  assert.equal(m(setMachines(ch, data, 's3', 0), 's3'), 1);
  assert.equal(setPerRow(setPerRow(ch, 's2', 8), 's2', null).stages[1].perRow, null);
  assert.equal(setPolicy(ch, 'sink').policy, 'sink');
  assert.deepEqual(moveStage(ch, 's1', { x: 5, y: 6 }).stages[0].pos, { x: 5, y: 6 });
  assert.deepEqual(ch, snap);
});
test('cadeia: ancestral por dois caminhos espera os dois consumidores (ordem topológica)', () => {
  const st = (id: string, recipe: string) => ({ id, recipe, machines: 1, clock: 100, perRow: null, locked: false, tiers: {}, pos: { x: 0, y: 0 } });
  const c: Chain = {
    v: 1, policy: 'represar',
    stages: [st('p', 'rAB'), st('z', 'rAB'), st('y1', 'rBA'), st('y2', 'rBA')],
    links: [
      { id: 'l1', item: 'B', from: 'p', to: 'y1' }, { id: 'l2', item: 'B', from: 'p', to: 'y2' },
      { id: 'l3', item: 'A', from: 'y1', to: 'z' }, { id: 'l4', item: 'A', from: 'y2', to: 'z' },
    ],
  };
  const r = setMachines(c, fake, 'z', 4);
  assert.deepEqual(['p', 'y1', 'y2', 'z'].map(id => m(r, id)), [4, 2, 2, 4]);
});
test('cadeia: clock 200 na s2 dobra vigas e canos; ferro 60 × 80 = 4.800 ÷ 65 → 74 refinarias', () => {
  const c = setClock(ch, data, 's2', 200);
  assert.deepEqual(['s1', 's2', 's3', 's4'].map(id => m(c, id)), [74, 60, 60, 120]);
  assert.deepEqual(ch, snap);
});
test('cadeia: clock fica entre 1 e 250', () => {
  assert.equal(setClock(ch, data, 's2', 0).stages[1].clock, 1);
  assert.equal(setClock(ch, data, 's2', 999).stages[1].clock, 250);
});
test('cadeia: na junção, o produtor mudado entra com a oferta nova (5.460 : 1.365 → 4.800 × 0,2 ÷ 65 → 15)', () => {
  const two = link(addStage(ch, data, 'Recipe_Alternate_PureIronIngot_C', 21), data, 's5', 's2', 'Desc_IronIngot_C');
  const c = setMachines(two, data, 's1', 84);
  assert.deepEqual([m(c, 's1'), m(c, 's5'), m(c, 's2')], [84, 15, 120]);
});
test('cadeia: receita desconhecida devolve a mesma cadeia', () => {
  assert.equal(setRecipe(ch, data, 's3', 'Recipe_NaoExiste_C'), ch);
});
test('cadeia: descendente travado não escala, o irmão sim', () => {
  const c = setMachines(setLocked(ch, 's3', true), data, 's2', 70);
  assert.deepEqual([m(c, 's3'), m(c, 's4')], [30, 70]);
});

test('cadeia: oferta e demanda do item que entra e sai pela mesma receita', () => {
  const st = { id: 's1', recipe: 'Recipe_UraniumCell_C', machines: 10, clock: 100, perRow: null, locked: false, tiers: {}, pos: { x: 0, y: 0 } };
  const c: Chain = { v: 1, stages: [st], links: [], policy: 'represar' };
  assert.equal(supplyOf(c, data, 's1', 'Desc_SulfuricAcid_C'), 100);
  assert.equal(demandOf(c, data, 's1', 'Desc_SulfuricAcid_C'), 400);
  assert.deepEqual(products(c, data).find(p => p.item === 'Desc_SulfuricAcid_C')?.total, 100);
  assert.deepEqual(rawInputs(c, data).find(p => p.item === 'Desc_SulfuricAcid_C')?.total, 400);
});

test('cadeia: máquinas ficam em 1 a 10.000, também ao escalar descendentes e ancestrais', () => {
  assert.equal(MAX_MACHINES, 10000);
  const big = setMachines(ch, data, 's2', 100000);
  assert.ok(big.stages.every(s => s.machines >= 1 && s.machines <= MAX_MACHINES), JSON.stringify(big.stages.map(s => s.machines)));
  assert.equal(m(big, 's2'), 10000);
  const down = setMachines(ch, data, 's1', 10000);
  assert.ok(down.stages.every(s => s.machines <= MAX_MACHINES), JSON.stringify(down.stages.map(s => s.machines)));
  const clk = setClock(setMachines(setLocked(ch, 's2', true), data, 's3', 10000), data, 's3', 1);
  assert.ok(clk.stages.every(s => s.machines <= MAX_MACHINES), JSON.stringify(clk.stages.map(s => s.machines)));
  assert.equal(m(addStage(ch, data, 'Recipe_SteelPipe_C', 1e9), 's5'), 10000);
});
