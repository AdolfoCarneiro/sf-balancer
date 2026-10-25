import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import icons from '../../src/planner/data/icons.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';
import { iconUrl, SPECIAL_ICON } from '../../src/planner/ui/icons.ts';

const data = game as GameData;

test('ícones: todo id listado tem arquivo webp pequeno em public/icons', () => {
  for (const id of icons) { const s = statSync(`public/icons/${id}.webp`); assert.ok(s.size > 0 && s.size < 12_000, id); }
});
test('ícones: produto principal de toda receita e os prédios especiais têm ícone', () => {
  for (const r of Object.values(data.recipes)) assert.ok(icons.includes(r.outs[0].item), r.id);
  for (const id of Object.values(SPECIAL_ICON)) assert.ok(icons.includes(id), id);
});
test('iconUrl: caminho local ou null', () => {
  assert.equal(iconUrl('Desc_IronIngot_C'), '/icons/Desc_IronIngot_C.webp');
  assert.equal(iconUrl('Nope'), null);
});
