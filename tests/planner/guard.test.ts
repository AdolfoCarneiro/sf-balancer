import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData } from '../../src/planner/model/types.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { solveCached, solveSafe, type FlowResult } from '../../src/planner/model/solve.ts';
import { meioJobs, type MeioResult } from '../../src/planner/model/meioresult.ts';

const data = game as GameData;
// Bloco com receita que não existe (passou de alguma forma pela leitura): o solver quebra.
const broken: Factory = { v: 2, blocks: [{ id: 's1', kind: 'recipe', recipe: 'Nope', clock: 100, perRow: null, tiers: {} }], links: [] };

test('guarda do solver: exceção vira fluxo vazio marcado como falho, sem derrubar quem chamou', () => {
  assert.throws(() => solveCached(broken, data, new Map()));
  let r: FlowResult | undefined;
  assert.doesNotThrow(() => { r = solveSafe(broken, data, new Map()); });
  assert.deepEqual(r, { blocks: {}, links: {}, deadlock: [], converged: true, iterations: 0, failed: true });
  // Fábrica boa: o mesmo resultado do solveCached, sem a marca.
  const ex = exampleFactory(data), ok = solveSafe(ex, data, new Map());
  assert.deepEqual(ok, solveCached(ex, data, new Map()).result);
  assert.equal('failed' in ok, false);
});

test('meios: com o fluxo calculando, nenhum pedido novo ao worker; pronto, só o que falta e não está pedido', () => {
  const keys = new Map([['a', 'ka'], ['b', 'kb'], ['c', 'kc']]);
  const results = new Map<string, MeioResult | null>([['a', null], ['b', null], ['c', {} as MeioResult]]);
  assert.deepEqual(meioJobs(keys, results, new Set(), true), []);
  assert.deepEqual(meioJobs(keys, results, new Set(['kb']), false), [{ id: 'a', key: 'ka' }]);
  assert.deepEqual(meioJobs(keys, results, new Set(), false), [{ id: 'a', key: 'ka' }, { id: 'b', key: 'kb' }]);
});
