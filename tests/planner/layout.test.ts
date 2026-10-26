import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, Layout, RecipeBlock } from '../../src/planner/model/types.ts';
import { cleanLayout } from '../../src/planner/model/layout.ts';
import {
  type History, decodeFactory, encodeFactory, exampleFactory, reduce,
} from '../../src/planner/model/factorystate.ts';
import { historyNew, encodeShare } from '../../src/logic/index.js';

const data = game as GameData;
const ex = exampleFactory(data);
const rb = (f: Factory, id: string) => f.blocks.find(b => b.id === id) as RecipeBlock;
const FULL: Layout = {
  kind: 'center', invert: true, rows: { 1: { flip: true, dx: 8 } },
  belts: { 'out:Desc_IronIngot_C': { cut: 7, exit: 'down' } }, joins: ['out:Desc_IronIngot_C@0'],
};

test('cleanLayout: aceita um layout válido igual e rejeita kind desconhecido', () => {
  assert.deepEqual(cleanLayout(FULL), FULL);
  assert.deepEqual(cleanLayout({ kind: 'simple' }), { kind: 'simple' });
  assert.equal(cleanLayout({ kind: 'diagonal' }), null);
  assert.equal(cleanLayout(null), null);
  assert.equal(cleanLayout([]), null);
  assert.equal(cleanLayout('center'), null);
});

test('cleanLayout: campos inválidos somem sem derrubar o todo', () => {
  const l = cleanLayout({
    kind: 'backToBack',
    rows: { 0: { dx: 3, flip: true }, '-1': { flip: true }, 2: { dy: 808 }, x: { flip: true } },
    belts: {
      'out:A': { cut: 0 }, 'out:B': { cut: 1.5, exit: 'left' }, 'out:C': { cut: 1001 }, 'out:D': { cut: 4, exit: 'up' }, nokey: { cut: 3 },
    },
    joins: ['out:A@0', 'out:A', 'A@1', 'out:A@-1', 7],
  })!;
  assert.deepEqual(l, { kind: 'backToBack', rows: { 0: { flip: true } }, belts: { 'out:D': { cut: 4, exit: 'up' } }, joins: ['out:A@0'] });
});

test('setLayout: grava, desfaz, null remove o campo', () => {
  let h: History<Factory> = historyNew(ex);
  h = reduce(h, { type: 'setLayout', id: 's1', layout: FULL }, data);
  assert.deepEqual(rb(h.present, 's1').layout, FULL);
  assert.equal(h.past.length, 1);
  h = reduce(h, { type: 'undo' }, data);
  assert.equal(rb(h.present, 's1').layout, undefined);
  h = reduce(h, { type: 'redo' }, data);
  h = reduce(h, { type: 'setLayout', id: 's1', layout: null }, data);
  assert.equal('layout' in rb(h.present, 's1'), false);
  // Inválido ou bloco que não é receita: não muda nada.
  const same = reduce(h, { type: 'setLayout', id: 's1', layout: { kind: 'x' } as unknown as Layout }, data);
  assert.deepEqual(same.present, h.present);
});

test('setLayout: sobrevive a outras edições do bloco e ao encode/decode', () => {
  let h: History<Factory> = historyNew(ex);
  h = reduce(h, { type: 'setLayout', id: 's1', layout: FULL }, data);
  h = reduce(h, { type: 'setClock', id: 's1', clock: 90 }, data);
  h = reduce(h, { type: 'setLimits', id: 's1', limits: null }, data);
  assert.deepEqual(rb(h.present, 's1').layout, FULL);
  assert.deepEqual(rb(decodeFactory(encodeFactory(h.present), data)!, 's1').layout, FULL);
});

test('decode: layout inválido deixa o bloco sem layout; sem layout decodifica como hoje', () => {
  const raw = JSON.parse(JSON.stringify(ex));
  raw.blocks.find((b: { id: string }) => b.id === 's1').layout = { kind: 'zig' };
  assert.equal('layout' in rb(decodeFactory(encodeShare(raw), data)!, 's1'), false);
  assert.deepEqual(decodeFactory(encodeFactory(ex), data), ex);
});
