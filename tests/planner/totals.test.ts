import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';
import { chainTotals } from '../../src/planner/model/totals.ts';
import { exampleChain } from '../../src/planner/model/example.ts';

const data = game as GameData;

test('totais: cadeia de exemplo tem 4 etapas e 192 máquinas', () => {
  assert.deepEqual(chainTotals(exampleChain(data), data), { stages: 4, machines: 192 });
});
