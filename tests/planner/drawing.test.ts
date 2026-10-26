import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData, RecipeBlock } from '../../src/planner/model/types.ts';
import { stageDrawing } from '../../src/planner/model/drawing.ts';
import { setTier } from '../../src/planner/model/factory.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { solvedStage } from '../../src/planner/model/solved.ts';

const data = game as GameData;
const ex = exampleFactory(data), flow = solveFactory(ex, data);
const [s1, s2] = ex.blocks.map(b => solvedStage(b as RecipeBlock, flow.blocks[b.id]));

test('desenho: Foundry com 5 fileiras de 12 e faixas com k−1 peças', () => {
  const d = stageDrawing(s2, data);
  assert.equal(d.rows.length, 5);
  for (const r of d.rows) {
    assert.equal(r.machines, 12);
    assert.deepEqual(r.lanes.map(l => [l.item, l.side, l.marks]),
      [['Desc_IronIngot_C', 'in', 11], ['Desc_Coal_C', 'in', 11], ['Desc_SteelIngot_C', 'out', 11]]);
  }
});
test('desenho: fluido não tem peças', () => {
  const w = stageDrawing(s1, data).rows[0].lanes.find(l => l.item === 'Desc_Water_C')!;
  assert.equal(w.fluid, true); assert.equal(w.marks, 0);
});
test('setTier com null volta ao automático', () => {
  const a = setTier(ex, data, 's2', 'outs', 'Desc_SteelIngot_C', 'Mk4');
  assert.equal((a.blocks[1] as RecipeBlock).tiers['out:Desc_SteelIngot_C'], 'Mk4');
  assert.deepEqual((setTier(a, data, 's2', 'outs', 'Desc_SteelIngot_C', null).blocks[1] as RecipeBlock).tiers, {});
});
