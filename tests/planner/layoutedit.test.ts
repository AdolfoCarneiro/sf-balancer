import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, Layout, Stage } from '../../src/planner/model/types.ts';
import { arrange } from '../../src/planner/model/layout.ts';
import {
  fixCut, hasEdits, joinState, moveRow, normLayout, resetModel, resetRowPlace, setBelt, setInvert, setKind, toggleJoin, toggleRow,
} from '../../src/planner/model/layoutedit.ts';
import { type History, exampleFactory, reduce } from '../../src/planner/model/factorystate.ts';
import { historyNew } from '../../src/logic/index.js';

const data = game as GameData;
const PURE = 'Recipe_Alternate_PureIronIngot_C', ORE = 'in:Desc_OreIron_C', INGOT = 'out:Desc_IronIngot_C';
const st = (machines: number): Stage => ({ id: 's', recipe: PURE, machines, clock: 100, perRow: null, tiers: {} });

test('normLayout e trocar de modelo: simples sem nada = null; trocar zera os ajustes', () => {
  assert.equal(normLayout({ kind: 'simple', rows: {}, belts: {}, joins: [] }), null);
  assert.equal(normLayout({ kind: 'simple', invert: true }), null);
  assert.deepEqual(normLayout({ kind: 'center', rows: { 1: {} } }), { kind: 'center' });
  assert.equal(setKind('simple'), null);
  assert.deepEqual(setKind('center'), { kind: 'center' });
  const full: Layout = { kind: 'backToBack', rows: { 0: { flip: true } }, belts: { [INGOT]: { cut: 3, exit: 'down' } }, joins: [`${INGOT}@0`] };
  assert.ok(hasEdits(full));
  assert.deepEqual(setInvert(full, true), { kind: 'backToBack', invert: true });
  assert.deepEqual(resetModel({ ...full, invert: true }), { kind: 'backToBack', invert: true });
  assert.equal(resetModel({ kind: 'simple', rows: { 2: { mirror: true } } }), null);
  assert.ok(!hasEdits(resetModel(full) ?? undefined));
});

test('fileira: virar e espelhar alternam; mover em 8 m tira as junções dela', () => {
  const a = toggleRow(undefined, 2, 'flip');
  assert.deepEqual(a, { kind: 'simple', rows: { 2: { flip: true } } });
  assert.equal(toggleRow(a!, 2, 'flip'), null);
  assert.deepEqual(toggleRow({ kind: 'center' }, 0, 'mirror'), { kind: 'center', rows: { 0: { mirror: true } } });
  const joined: Layout = { kind: 'simple', joins: [`${INGOT}@0`, `${INGOT}@1`, `${INGOT}@2`, `${ORE}@3`] };
  const m = moveRow(joined, 2, 8, 0)!;
  assert.deepEqual(m.rows, { 2: { dx: 8 } });
  assert.deepEqual(m.joins, [`${INGOT}@0`, `${ORE}@3`], 'sai a @1 (cima com ela) e a @2 (ela com a de baixo)');
  assert.deepEqual(moveRow(m, 2, 3, -10)!.rows, { 2: { dx: 8, dy: -8 } }, 'arredonda na grade de 8 m');
  assert.deepEqual(moveRow({ kind: 'simple', rows: { 0: { dx: 8 } } }, 0, -8, 0), null);
  assert.deepEqual(moveRow({ kind: 'simple', rows: { 0: { dx: 800 } } }, 0, 8, 0)!.rows, { 0: { dx: 800 } }, 'limite de 800 m');
  assert.deepEqual(resetRowPlace({ kind: 'center', rows: { 1: { dx: 8, dy: 16, flip: true } } }, 1), { kind: 'center', rows: { 1: { flip: true } } });
});

test('esteira: corte e saída; null volta ao padrão; fixCut faz descer quem sai pela ponta', () => {
  const a = setBelt(undefined, INGOT, { exit: 'down' });
  assert.deepEqual(a, { kind: 'simple', belts: { [INGOT]: { exit: 'down' } } });
  const b = setBelt(a!, INGOT, { cut: 4 });
  assert.deepEqual(b!.belts, { [INGOT]: { exit: 'down', cut: 4 } });
  assert.equal(setBelt(setBelt(b!, INGOT, { cut: null })!, INGOT, { exit: null }), null);
  assert.deepEqual(fixCut({ kind: 'simple' }, INGOT, 7, 'end')!.belts, { [INGOT]: { cut: 7, exit: 'down' } });
  assert.deepEqual(fixCut({ kind: 'center' }, INGOT, 6, 'up')!.belts, { [INGOT]: { cut: 6 } });
});

test('juntar: só fileiras viradas uma para a outra, sem deslocamento, fora do center', () => {
  const lay: Layout = { kind: 'backToBack' };
  const arr = arrange(st(42), data, lay);
  assert.equal(joinState(arr, lay, INGOT, 0), 'can', 'par 0-1: as saídas no corredor');
  assert.equal(joinState(arr, lay, INGOT, 1), null, 'fileira 1 e 2 se dão as costas');
  assert.equal(joinState(arr, lay, ORE, 0), null, 'as entradas ficam por fora');
  assert.equal(joinState(arr, lay, INGOT, 5), null, 'não há fileira 6');
  const j = toggleJoin(lay, `${INGOT}@0`)!;
  assert.deepEqual(j.joins, [`${INGOT}@0`]);
  assert.equal(joinState(arrange(st(42), data, j), j, INGOT, 0), 'joined');
  assert.deepEqual(toggleJoin(j, `${INGOT}@0`), { kind: 'backToBack' });
  const moved = moveRow(lay, 1, 0, 8)!;
  assert.equal(joinState(arrange(st(42), data, moved), moved, INGOT, 0), null, 'fileira deslocada não junta');
  const c: Layout = { kind: 'center' };
  assert.equal(joinState(arrange(st(42), data, c), c, INGOT, 0), null);
  // Junção que vira linha compartilhada: uma linha só para as duas fileiras.
  assert.equal(arrange(st(42), data, j).lines.filter(l => l.side === 'out' && l.rows.includes(0)).length, 1);
});

test('linhas e esteiras do desenho andam juntas (o clique na esteira acha a linha)', () => {
  for (const lay of [undefined, { kind: 'center' }, { kind: 'backToBack', joins: [`${INGOT}@0`] }, { kind: 'simple', belts: { [INGOT]: { cut: 3, exit: 'up' } } }] as (Layout | undefined)[]) {
    const a = arrange(st(42), data, lay);
    assert.equal(a.geo.belts.length, a.lines.length);
    a.lines.forEach((l, i) => { assert.equal(a.geo.belts[i].item, l.item); assert.equal(a.geo.belts[i].role, l.side); });
  }
});

test('fileiras trazem a faixa (w, h) dentro do desenho', () => {
  const a = arrange(st(42), data, { kind: 'center' });
  for (const r of a.rows) {
    assert.ok(r.w > 0 && r.h > 0);
    assert.ok(r.x + r.w <= a.geo.w + 1e-9 && r.y + r.h <= a.geo.h + 1e-9);
  }
});

test('um gesto = um passo do desfazer', () => {
  const ex = exampleFactory(data);
  let h: History<Factory> = historyNew(ex);
  h = reduce(h, { type: 'setLayout', id: 's1', layout: setKind('center') }, data);
  h = reduce(h, { type: 'setLayout', id: 's1', layout: moveRow({ kind: 'center' }, 0, 8, 0) }, data);
  assert.equal(h.past.length, 2);
  h = reduce(h, { type: 'undo' }, data);
  const b = h.present.blocks.find(x => x.id === 's1');
  assert.deepEqual(b && b.kind === 'recipe' ? b.layout : null, { kind: 'center' });
});
