import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData, Stage } from '../../src/planner/model/types.ts';
import { blockGeo } from '../../src/planner/model/map/block.ts';
import { route } from '../../src/planner/model/map/geo.ts';

const data = game as GameData;
const st = (recipe: string, machines: number, perRow: number | null = null): Stage =>
  ({ id: 's', recipe, machines, clock: 100, perRow, tiers: {} });
const STEEL = 'Recipe_Alternate_IngotSteel_1_C';

test('Foundry de Solid Steel, 60 máquinas, 12 por linha: 5 fileiras de 120 × 22', () => {
  const g = blockGeo(st(STEEL, 60, 12), data);
  assert.equal(g.w, 120); assert.equal(g.h, 110);
  assert.equal(g.pieces.filter(p => p.kind === 'machine').length, 60);
  assert.equal(g.pieces.filter(p => p.kind === 'splitter').length, 120);
  assert.equal(g.pieces.filter(p => p.kind === 'merger').length, 60);
  assert.equal(g.ins.length, 10); assert.equal(g.outs.length, 5);
  assert.ok(g.ins.every(a => a.x === 0) && g.outs.every(a => a.x === 120));
  assert.equal(g.estimate, false);
});
test('Refinery de Pure Iron (água fluida): faixa de 1 m e estimativa', () => {
  const g = blockGeo(st('Recipe_Alternate_PureIronIngot_C', 42), data);
  assert.equal(g.w, 70); assert.equal(g.h, 6 * (4 + 1 + 22 + 4)); assert.equal(g.estimate, true);
});
test('fileira incompleta: 61 fundições → 6ª fileira com 1 máquina e faixas de 1 m', () => {
  const g = blockGeo(st(STEEL, 61, 12), data);
  assert.equal(g.h, 110 + (1 + 1 + 10 + 1));
  assert.equal(g.pieces.filter(p => p.kind === 'machine').length, 61);
  assert.equal(g.pieces.filter(p => p.kind === 'splitter').length, 120 + 0);
});
test('vãos editáveis somam na medida', () => {
  const g = blockGeo(st(STEEL, 60, 12), data, { gapRow: 4, gapMachine: 2 });
  assert.equal(g.w, 12 * 10 + 11 * 2); assert.equal(g.h, 5 * 22 + 4 * 4);
});
test('route: ângulo reto, no máximo 2 curvas, começa e termina nos pontos', () => {
  for (const dir of ['x', 'y'] as const) for (const b of [[10, 0], [10, 7], [0, 7], [-5, -3]] as [number, number][]) {
    const p = route([0, 0], b, dir);
    assert.deepEqual(p[0], [0, 0]); assert.deepEqual(p[p.length - 1], b);
    assert.ok(p.length <= 4);
    for (let i = 1; i < p.length; i++) assert.ok(p[i][0] === p[i - 1][0] || p[i][1] === p[i - 1][1]);
  }
});
