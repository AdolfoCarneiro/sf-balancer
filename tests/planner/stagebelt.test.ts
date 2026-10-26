import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData, Layout, Stage } from '../../src/planner/model/types.ts';
import { arrange } from '../../src/planner/model/layout.ts';
import { beltInfo, cutMath } from '../../src/planner/model/stagebelt.ts';

const data = game as GameData;
const PURE = 'Recipe_Alternate_PureIronIngot_C', INGOT = 'out:Desc_IronIngot_C';
const st = (machines: number, layout?: Layout): Stage => ({ id: 's', recipe: PURE, machines, clock: 100, perRow: null, tiers: {}, layout });
const info = (s: Stage) => beltInfo(s, data, arrange(s, data, s.layout), INGOT)!;

test('beltInfo: Pure Iron 42 em center fecha a cada 7 (7 × 65 = 455, com 8 passaria da Mk4)', () => {
  const s = st(42, { kind: 'center' });
  const i = info(s);
  assert.ok(i.shared);
  assert.equal(i.per, 65);
  assert.equal(i.rec, 7);
  assert.equal(i.defCut, 7);
  assert.equal(i.cut, 7);
  assert.deepEqual(cutMath(i), { n: 7, per: 65, total: 455, state: 'max' });
  // Já no padrão: Recomendado não muda nada.
  assert.deepEqual(i.recLayout(), { kind: 'center' });
});

test('beltInfo: corte manual em 8 passa do limite; menor que 7 cabe com folga; Recomendado volta ao padrão', () => {
  const over = info(st(42, { kind: 'center', belts: { [INGOT]: { cut: 8 } } }));
  assert.deepEqual(cutMath(over), { n: 8, per: 65, total: 520, state: 'over' });
  assert.deepEqual(over.recLayout(), { kind: 'center' });
  const small = info(st(42, { kind: 'center', belts: { [INGOT]: { cut: 5 } } }));
  assert.equal(cutMath(small)!.state, 'fits');
});

test('beltInfo: sem máquinas não há corte recomendado nem conta (nada de ∞)', () => {
  const s = st(42, { kind: 'center' });
  const arr = arrange(s, data, s.layout);
  const zero = { ...arr, lines: arr.lines.map(l => ({ ...l, machines: 0, rate: 0 })) };
  const i = beltInfo(s, data, zero, INGOT)!;
  assert.equal(i.per, 0);
  assert.equal(i.rec, null);
  assert.equal(i.defCut, null);
  assert.equal(cutMath(i), null);
  assert.ok(Number.isFinite(i.longest));
});

test('beltInfo: esteira que não existe na etapa dá null', () => {
  assert.equal(beltInfo(st(42), data, arrange(st(42), data, undefined), 'out:Nada'), null);
});
