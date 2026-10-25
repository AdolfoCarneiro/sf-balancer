import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';
import { factoryTotals } from '../../src/planner/model/solved.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { setExtractor, setLimits } from '../../src/planner/model/factory.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';

const data = game as GameData;

test('totais: fábrica de exemplo tem 4 blocos e 192 máquinas', () => {
  const f = exampleFactory(data);
  assert.deepEqual(factoryTotals(f, solveFactory(f, data)), { blocks: 4, machines: 192 });
});
test('totais: bloco livre conta as máquinas calculadas; extrator conta os extratores; sem limite não conta', () => {
  const f = setLimits(exampleFactory(data), 's1', null);   // a refinaria passa a seguir as fundições: 2.400 / 65 → 37
  assert.deepEqual(factoryTotals(f, solveFactory(f, data)), { blocks: 4, machines: 37 + 60 + 30 + 60 });
  const w = {
    v: 2 as const,
    blocks: [{ id: 'x', kind: 'extractor' as const, building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal' as const, count: null }, { id: 'c', kind: 'container' as const }],
    links: [{ id: 'l1', item: 'Desc_Water_C', from: 'x', to: 'c' }],
  };
  assert.deepEqual(factoryTotals(w, solveFactory(w, data)), { blocks: 2, machines: 0 });
  const w3 = setExtractor(w, data, 'x', { count: 3 });
  assert.deepEqual(factoryTotals(w3, solveFactory(w3, data)), { blocks: 2, machines: 3 });
});
