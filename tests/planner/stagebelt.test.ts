import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData, Layout, Stage } from '../../src/planner/model/types.ts';
import { arrange } from '../../src/planner/model/layout.ts';
import { beltInfo, cutMath } from '../../src/planner/model/stagebelt.ts';
import { setLang, t } from '../../src/i18n/index.js';

const inLang = <T>(l: string, f: () => T): T => { setLang(l); try { return f(); } finally { setLang('pt'); } };

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

test('Dividir igual: a conta usa a maior saída de verdade (20 em fileiras de 10, corte 7 → 5 + 5), não o corte', () => {
  const lay = (even: boolean): Layout => ({ kind: 'simple', belts: { [INGOT]: { exit: 'down', cut: 7, ...(even ? { even: true } : {}) } } });
  const s = (even: boolean): Stage => ({ ...st(20, lay(even)), perRow: 10 });
  const off = info(s(false));
  assert.ok(off.splits);
  assert.equal(off.even, false);
  assert.equal(cutMath(off)!.n, 7);   // sem Dividir igual, a conta é a do corte
  const on = info(s(true));
  assert.ok(on.even);
  assert.deepEqual(on.lines.map(l => l.machines), [5, 5, 5, 5]);
  assert.deepEqual(cutMath(on), { n: 5, per: 65, total: 325, state: 'even' });
  // Nos três idiomas: a maior saída, sem o "com 8 passaria".
  assert.match(t('plSvCutWhy', '5', '65', '325/min', 'Mk4', 'even', '6'), /maior saída/);
  assert.doesNotMatch(t('plSvCutWhy', '5', '65', '325/min', 'Mk4', 'even', '6'), /passaria/);
  inLang('en', () => assert.match(t('plSvCutWhy', '5', '65', '325/min', 'Mk4', 'even', '6'), /largest output/));
  inLang('es', () => assert.match(t('plSvCutWhy', '5', '65', '325/min', 'Mk4', 'even', '6'), /salida más grande/));
});

test('Dividir igual: nada a dividir com uma saída por fileira (sem corte, pela ponta ou corte maior que a fileira)', () => {
  assert.equal(info(st(5, { kind: 'center' })).splits, false);                 // 5 máquinas: uma saída só
  assert.equal(info(st(42, { kind: 'center' })).splits, true);                 // 42: 3 saídas por par
  assert.equal(info(st(20)).splits, false);                                     // pela ponta
  const big = info({ ...st(20, { kind: 'simple', belts: { [INGOT]: { exit: 'down', cut: 12 } } }), perRow: 10 });
  assert.equal(big.splits, false);
  // Ligado sem ter o que dividir: não vale (a conta continua a normal).
  const stale = info(st(5, { kind: 'center', belts: { [INGOT]: { even: true } } }));
  assert.equal(stale.even, false);
});
