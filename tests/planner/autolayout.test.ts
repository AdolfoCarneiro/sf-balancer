import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Chain, GameData } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { addStage, link } from '../../src/planner/model/chain.ts';
import { autoLayout, nodeSize, placeNew, needsLayout, withLayout } from '../../src/planner/model/autolayout.ts';

const data = game as GameData;

test('autoLayout: da esquerda para a direita, vigas e canos na mesma coluna, um embaixo do outro', () => {
  const p = autoLayout(exampleChain(data), data);
  assert.ok(p.s1.x < p.s2.x && p.s2.x < p.s3.x, 'colunas em ordem');
  assert.equal(p.s3.x, p.s4.x);
  assert.notEqual(p.s3.y, p.s4.y);
  // Sem sobreposição entre s3 e s4.
  const ch = exampleChain(data);
  const [a, b] = [p.s3, p.s4].sort((u, v) => u.y - v.y);
  const top = a === p.s3 ? ch.stages[2] : ch.stages[3];
  assert.ok(b.y >= a.y + nodeSize(top, data).h, 'não se sobrepõem');
});

test('autoLayout: cadeia vazia dá posições vazias', () => {
  assert.deepEqual(autoLayout({ v: 1, stages: [], links: [], policy: 'represar' }, data), {});
});

test('nodeSize: largura mínima de 200 e cresce com as máquinas por fileira', () => {
  const ch = exampleChain(data);
  const s = nodeSize(ch.stages[0], data);
  assert.ok(s.w >= 200 && s.h > 100);
  const wide = nodeSize({ ...ch.stages[3], perRow: 40, machines: 80 }, data);
  assert.equal(wide.w, 40 * (8 + 2) + 24);
});

test('placeNew: consumidor novo de s4 fica à direita de s4', () => {
  let ch = exampleChain(data);
  ch = { ...ch, stages: ch.stages.map(s => ({ ...s, pos: autoLayout(ch, data)[s.id] })) };
  ch = addStage(ch, data, 'Recipe_Alternate_EncasedIndustrialBeam_C', 10);
  const id = ch.stages[ch.stages.length - 1].id;
  ch = link(ch, data, 's4', id, 'Desc_SteelPipe_C');
  assert.equal(ch.links.length, 4, 'ligou');
  const s4 = ch.stages.find(s => s.id === 's4')!;
  assert.ok(placeNew(ch, data, id).x > s4.pos.x);
});

test('placeNew: produtor novo de s1 fica à esquerda; solta fica abaixo de tudo', () => {
  let ch = exampleChain(data);
  ch = { ...ch, stages: ch.stages.map(s => ({ ...s, pos: autoLayout(ch, data)[s.id] })) };
  const c1 = link(addStage(ch, data, 'Recipe_IngotIron_C', 5), data, 's5', 's2', 'Desc_IronIngot_C');
  assert.ok(placeNew(c1, data, 's5').x < c1.stages.find(s => s.id === 's2')!.pos.x);
  const c2 = addStage(ch, data, 'Recipe_IngotIron_C', 5);
  const bottom = Math.max(...ch.stages.map(s => s.pos.y + nodeSize(s, data).h));
  assert.ok(placeNew(c2, data, 's5').y >= bottom);
});

test('needsLayout / withLayout: o exemplo (etapas empilhadas) é arrumado; posições distintas ficam', () => {
  const ch = exampleChain(data);
  assert.equal(needsLayout(ch), true);
  const laid = withLayout(ch, data);
  assert.equal(needsLayout(laid), false);
  assert.equal(withLayout(laid, data), laid);
});
