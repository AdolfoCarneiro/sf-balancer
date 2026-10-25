import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';
import { searchRecipes, recipesFor, recipeLine } from '../../src/planner/model/search.ts';
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
