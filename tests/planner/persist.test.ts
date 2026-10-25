import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Chain, GameData } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { encodeChain, decodeChain, reduce, initialChain, newHistory, PLANNER_STORE } from '../../src/planner/model/persist.ts';
import { encodeShare } from '../../src/logic/index.js';

const data = game as GameData;
const ex = exampleChain(data);

test('salvar: ida e volta do exemplo', () => assert.deepEqual(decodeChain(encodeChain(ex), data), ex));

test('salvar: lixo, JSON sem v e base64 quebrado viram null', () => {
  assert.equal(decodeChain('xx', data), null);
  assert.equal(decodeChain(encodeShare({}), data), null);
  assert.equal(decodeChain('%%%', data), null);
  assert.equal(decodeChain(encodeShare({ ...ex, v: 2 }), data), null);
});

test('salvar: receita que não existe some com as ligações; clock 999 vira 250', () => {
  const bad = JSON.parse(JSON.stringify(ex)) as Chain;
  bad.stages[0].recipe = 'Nope'; bad.stages[1].clock = 999;
  const c = decodeChain(encodeShare(bad), data)!;
  assert.equal(c.stages.length, 3);
  assert.equal(c.stages.find(s => s.id === 's1'), undefined);
  assert.deepEqual(c.links.map(l => l.id), ['l2', 'l3']);
  assert.equal(c.stages.find(s => s.id === 's2')!.clock, 250);
});

test('salvar: limpa machines, perRow, pos, tiers, policy e id longo', () => {
  const bad = JSON.parse(JSON.stringify(ex)) as any;
  bad.stages[0].machines = 99999; bad.stages[1].machines = 0.4;
  bad.stages[0].perRow = 2.5; bad.stages[1].perRow = 501;
  bad.stages[2].pos = { x: 'a', y: 1 };
  bad.stages[0].tiers = { Desc_IronIngot_C: 'Mk4', Desc_SteelIngot_C: 'Mk9' };
  bad.policy = 'x';
  bad.stages[3].id = 'x'.repeat(41);
  const c = decodeChain(encodeShare(bad), data)!;
  assert.equal(c.stages[0].machines, 10000); assert.equal(c.stages[1].machines, 1);
  assert.equal(c.stages[0].perRow, null); assert.equal(c.stages[1].perRow, null);
  assert.deepEqual(c.stages[2].pos, { x: 0, y: 0 });
  assert.deepEqual(c.stages[0].tiers, { 'out:Desc_IronIngot_C': 'Mk4' });
  assert.equal(c.policy, 'represar');
  assert.equal(c.stages[3].id.length, 40);
});

test('desfazer: setMachines e undo voltam ao exemplo; redo refaz', () => {
  let h = newHistory(ex);
  h = reduce(h, { type: 'setMachines', id: 's1', n: 10 }, data);
  assert.equal(h.present.stages[0].machines, 10);
  h = reduce(h, { type: 'undo' }, data);
  assert.deepEqual(h.present, ex);
  h = reduce(h, { type: 'redo' }, data);
  assert.equal(h.present.stages[0].machines, 10);
  h = reduce(h, { type: 'load', chain: ex }, data);
  assert.deepEqual(h.present, ex);
  assert.equal(h.past.length, 2);
});

test('abrir: #p= válido ganha do salvo; salvo quebrado cai no exemplo', () => {
  const other: Chain = { ...ex, policy: 'sink' };
  const r = initialChain('#p=' + encodeChain(other), encodeChain(ex), data);
  assert.equal(r.fromLink, true); assert.equal(r.chain.policy, 'sink');
  const s = initialChain('', encodeChain(other), data);
  assert.equal(s.fromLink, false); assert.equal(s.chain.policy, 'sink');
  const e = initialChain('#p=zz', 'quebrado', data);
  assert.deepEqual(e.chain, ex); assert.equal(e.fromLink, false);
  assert.equal(PLANNER_STORE, 'sf-balancer:planner');
});

test('salvar: tier antigo (só o item) vai para o lado onde o item está; nos dois lados, para a saída', () => {
  const raw = { v: 1, policy: 'represar', links: [], stages: [
    { id: 's1', recipe: 'Recipe_UraniumCell_C', machines: 1, clock: 100, tiers: { Desc_SulfuricAcid_C: 'Mk1', Desc_Cement_C: 'Mk3', Desc_UraniumCell_C: 'Mk2' } },
    { id: 's2', recipe: 'Recipe_UraniumCell_C', machines: 1, clock: 100, tiers: { 'in:Desc_SulfuricAcid_C': 'Mk2', 'out:Desc_Cement_C': 'Mk3', 'in:X': 'Mk1' } },
  ] };
  const c = decodeChain(encodeShare(raw), data)!;
  assert.deepEqual(c.stages[0].tiers, { 'out:Desc_SulfuricAcid_C': 'Mk1', 'in:Desc_Cement_C': 'Mk3', 'out:Desc_UraniumCell_C': 'Mk2' });
  assert.deepEqual(c.stages[1].tiers, { 'in:Desc_SulfuricAcid_C': 'Mk2' });
});
