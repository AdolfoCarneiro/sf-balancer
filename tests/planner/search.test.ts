import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Chain, GameData } from '../../src/planner/model/types.ts';
import { searchRecipes, recipesFor, recipeLine } from '../../src/planner/model/search.ts';
import { addLinkedStage, removeStage } from '../../src/planner/model/chain.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { setLang } from '../../src/i18n/index.js';

const data = game as GameData;
const inLang = <T>(l: string, f: () => T): T => { setLang(l); try { return f(); } finally { setLang('pt'); } };
const ids = (rs: { id: string }[]) => rs.map(r => r.id);

test('busca: item exato primeiro, normal antes da alternativa, e acha a alternativa', () => {
  const r = ids(searchRecipes(data, 'iron ingot'));
  assert.ok(r.indexOf('Recipe_IngotIron_C') >= 0);
  assert.ok(r.indexOf('Recipe_IngotIron_C') < r.indexOf('Recipe_Alternate_PureIronIngot_C'));
  assert.ok(r.includes('Recipe_Alternate_IronIngot_Basic_C'));
});
test('busca: sem maiúsculas e filtro por consumo', () => {
  assert.ok(ids(searchRecipes(data, 'IRON INGOT')).includes('Recipe_IngotIron_C'));
  assert.ok(ids(searchRecipes(data, '', { consumes: 'Desc_SteelIngot_C' })).includes('Recipe_SteelBeam_C'));
  assert.ok(searchRecipes(data, '', { produces: 'Desc_IronIngot_C' }).every(r => r.outs.some(f => f.item === 'Desc_IronIngot_C')));
});
test('busca: recipesFor segue a mesma ordem', () => {
  const r = recipesFor(data, 'Desc_IronIngot_C');
  assert.equal(r[0].id, 'Recipe_IngotIron_C');
  assert.ok(r.length >= 3);
});
test('busca: recipeLine com nomes e números', () => {
  inLang('en', () => assert.equal(recipeLine(data.recipes['Recipe_Alternate_PureIronIngot_C'], data), '35 Iron Ore + 20 Water → 65 Iron Ingot'));
});

const noPipe = (): Chain => removeStage(exampleChain(data), data, 's4');
test('addLinkedStage: consumidora recebe a sobra e liga', () => {
  const c = addLinkedStage(noPipe(), data, 'Recipe_SteelPipe_C', { item: 'Desc_SteelIngot_C', side: 'consumes', stage: 's2' });
  const n = c.stages[c.stages.length - 1];
  assert.equal(n.recipe, 'Recipe_SteelPipe_C');
  assert.equal(n.machines, 60);
  assert.deepEqual(c.links.at(-1), { id: 'l3', item: 'Desc_SteelIngot_C', from: 's2', to: n.id });
  assert.ok(n.pos.x > c.stages.find(s => s.id === 's2')!.pos.x);
});
test('addLinkedStage: produtora cobre a falta', () => {
  const base: Chain = { v: 1, policy: 'represar', links: [], stages: [{ ...exampleChain(data).stages[1], id: 's1', pos: { x: 400, y: 0 } }] };
  const c = addLinkedStage(base, data, 'Recipe_Alternate_PureIronIngot_C', { item: 'Desc_IronIngot_C', side: 'produces', stage: 's1' });
  assert.equal(c.stages[1].machines, 37);
  assert.deepEqual(c.links[0], { id: 'l1', item: 'Desc_IronIngot_C', from: c.stages[1].id, to: 's1' });
  assert.ok(c.stages[1].pos.x < 400);
});
test('addLinkedStage: receita sem o item não muda nada', () => {
  const c = noPipe();
  assert.equal(addLinkedStage(c, data, 'Recipe_SteelPipe_C', { item: 'Desc_IronIngot_C', side: 'consumes', stage: 's2' }), c);
});
