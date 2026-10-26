import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData, RecipeBlock } from '../../src/planner/model/types.ts';
import { perMachine, stageTotals, suggestedPerRow, stageRows, portTier, portWarnings, stageArea, tierKey } from '../../src/planner/model/stage.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { solvedStage } from '../../src/planner/model/solved.ts';
import { stagePieces } from '../../src/planner/model/layout.ts';

const data = game as GameData;
const ex = exampleFactory(data), flow = solveFactory(ex, data);
const [s1, s2, s3, s4] = ex.blocks.map(b => solvedStage(b as RecipeBlock, flow.blocks[b.id]));

test('etapa: Pure Iron 42 → 1.470 ore, 840 water, 2.730 ingot; sugere 7 por linha', () => {
  assert.deepEqual(stageTotals(s1, data).outs, [{ item: 'Desc_IronIngot_C', total: 2730 }]);
  assert.equal(suggestedPerRow(s1, data), 7);
  assert.deepEqual(stageRows(s1, data), [7, 7, 7, 7, 7, 7]);
});
test('etapa: Foundry sugere 8; com 12 por linha a saída vira Mk5 sozinha', () => {
  assert.equal(suggestedPerRow(s2, data), 8);
  assert.deepEqual(stageRows(s2, data), [12, 12, 12, 12, 12]);
  assert.equal(portTier(s2, data, 'Desc_SteelIngot_C', 'outs'), 'Mk5');
  assert.deepEqual(portWarnings(s2, data), []);
});
test('etapa: tier escolhido que estoura vira aviso com as duas saídas', () => {
  const w = portWarnings({ ...s2, tiers: { 'out:Desc_SteelIngot_C': 'Mk4' } }, data);
  assert.deepEqual(w, [{ item: 'Desc_SteelIngot_C', side: 'outs', rowRate: 720, tier: 'Mk4', cap: 480, fixTier: 'Mk5', fixPerRow: 8 }]);
});
test('etapa: fileira acima de Mk6 não tem tier que resolva', () => {
  const s = { ...s2, perRow: 25 };
  assert.deepEqual(stageRows(s, data), [25, 25, 10]);
  assert.deepEqual(portWarnings(s, data), [{ item: 'Desc_SteelIngot_C', side: 'outs', rowRate: 1500, tier: 'Mk6', cap: 1200, fixTier: null, fixPerRow: 20 }]);
});
test('etapa: peças da Foundry 110 Splitters e 55 Mergers; a água da Refinery não conta', () => {
  assert.deepEqual(stagePieces(s2, data), { splitters: 110, mergers: 55, lifts: 0 });
  assert.deepEqual(stagePieces(s1, data), { splitters: 36, mergers: 36, lifts: 0 });
});
test('etapa: fileiras incompletas e clock', () => {
  assert.deepEqual(stageRows(s3, data), [8, 8, 8, 6]);
  assert.deepEqual(stageRows(s4, data), [16, 16, 16, 12]);
  assert.equal(perMachine({ ...s1, clock: 212.5 }, data, 'Desc_IronIngot_C', 'outs'), 138.125);
});
test('etapa: área da Foundry 120 × 96 m', () => assert.deepEqual(stageArea(s2, data), { w: 120, d: 96 }));

// Recipe_UraniumCell_C: Sulfuric Acid entra 40 e sai 10 por máquina.
const cell = { id: 'u1', recipe: 'Recipe_UraniumCell_C', machines: 10, clock: 100, perRow: null, tiers: {} };
const ACID = 'Desc_SulfuricAcid_C';
test('etapa: mesmo item na entrada e na saída lê o lado certo', () => {
  assert.equal(perMachine(cell, data, ACID, 'ins'), 40);
  assert.equal(perMachine(cell, data, ACID, 'outs'), 10);
  const t = stageTotals(cell, data);
  assert.deepEqual(t.ins.find(f => f.item === ACID), { item: ACID, total: 400 });
  assert.deepEqual(t.outs.find(f => f.item === ACID), { item: ACID, total: 100 });
});
test('etapa: tier por lado; o da entrada não vale para a saída', () => {
  const s = { ...cell, machines: 30, perRow: 30, tiers: { [tierKey('ins', ACID)]: 'Mk1' } };
  assert.equal(portTier(s, data, ACID, 'ins'), 'Mk1');
  assert.equal(portTier(s, data, ACID, 'outs'), 'Mk2');
  const w = portWarnings(s, data).filter(x => x.item === ACID);
  assert.deepEqual(w.map(x => [x.side, x.rowRate, x.tier]), [['ins', 1200, 'Mk1']]);
});
