import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { meios } from '../../src/planner/model/meio.ts';
import { encodeChain, decodeChain, reduce, newHistory } from '../../src/planner/model/persist.ts';
import { encodeShare } from '../../src/logic/index.js';

const data = game as GameData;
const ex = exampleChain(data);
const rt = (c: unknown) => decodeChain(encodeShare(c), data)!;

test('placeBlock grava a posição presa na grade de 8 m', () => {
  const h = reduce(newHistory(ex), { type: 'placeBlock', id: 's2', place: { x: 13, y: -5, rot: 1 } }, data);
  assert.deepEqual(h.present.map!.s2, { x: 16, y: -8, rot: 1 });
});

test('setPlaces substitui o mapa inteiro e entra no desfazer', () => {
  let h = reduce(newHistory(ex), { type: 'placeBlock', id: 's2', place: { x: 8, y: 8, rot: 0 } }, data);
  const before = h.present.map;
  h = reduce(h, { type: 'setPlaces', places: { s1: { x: 0, y: 0, rot: 0 } } }, data);
  assert.deepEqual(h.present.map, { s1: { x: 0, y: 0, rot: 0 } });
  h = reduce(h, { type: 'undo' }, data);
  assert.deepEqual(h.present.map, before);
});

test('setMeioAlt grava e null remove', () => {
  let h = reduce(newHistory(ex), { type: 'setMeioAlt', meio: 'x', key: 'k' }, data);
  assert.equal(h.present.alts!.x, 'k');
  h = reduce(h, { type: 'setMeioAlt', meio: 'x', key: null }, data);
  assert.equal(h.present.alts?.x, undefined);
});

test('removeStage leva junto a posição no mapa', () => {
  let h = reduce(newHistory(ex), { type: 'setPlaces', places: { s3: { x: 0, y: 0, rot: 0 }, s4: { x: 8, y: 0, rot: 0 } } }, data);
  h = reduce(h, { type: 'removeStage', id: 's4' }, data);
  assert.deepEqual(Object.keys(h.present.map!), ['s3']);
});

test('decodeChain: mapa e montagens válidos voltam iguais', () => {
  const m = meios(ex, data)[0].id;
  const c = { ...ex, map: { s1: { x: 0, y: 8, rot: 2, gapRow: 4, gapMachine: 0 }, s2: { x: -16, y: 24, rot: 0 } }, alts: { [m]: 'abc' } };
  const back = decodeChain(encodeChain(c as any), data)!;
  assert.deepEqual(back.map, c.map);
  assert.deepEqual(back.alts, c.alts);
});

test('decodeChain: mapa hostil é descartado ou limitado', () => {
  const map = JSON.parse(`{
    "s1": {"x": null, "y": 0, "rot": 0},
    "s2": {"x": 1e12, "y": 8, "rot": 0},
    "s3": {"x": 0, "y": 0, "rot": 7},
    "s4": {"x": 0, "y": 0, "rot": 0, "gapRow": 65, "gapMachine": -1},
    "zz": {"x": 0, "y": 0, "rot": 0},
    "__proto__": {"x": 0, "y": 0, "rot": 0}
  }`);
  const c = rt({ ...ex, map });
  assert.equal(c.map!.s1, undefined);
  assert.deepEqual(c.map!.s2, { x: 100000, y: 8, rot: 0 });
  assert.equal(c.map!.s3, undefined);
  assert.deepEqual(c.map!.s4, { x: 0, y: 0, rot: 0 });
  assert.equal(c.map!.zz, undefined);
  assert.equal(Object.keys(c.map!).includes('__proto__'), false);
  assert.equal(c.map!.x, undefined);
  assert.equal(rt({ ...ex, map: { s1: { x: NaN, y: 0, rot: 0 } } }).map, undefined);
  assert.equal(rt({ ...ex, map: { s2: { x: 5, y: 0, rot: 7 } } }).map, undefined);
});

test('decodeChain: alts só com id de meio existente e key string até 40 chars', () => {
  const m = meios(ex, data)[0].id;
  const c = rt({ ...ex, alts: { [m]: 'ok', nope: 'x', [meios(ex, data)[1]?.id ?? 'q']: 'k'.repeat(41), } });
  assert.deepEqual(c.alts, { [m]: 'ok' });
  assert.equal(rt({ ...ex, alts: { [m]: 5 } }).alts, undefined);
});

test('cadeia salva antes da fase 2 (sem map/alts) continua lendo', () => {
  const c = decodeChain(encodeChain(ex), data)!;
  assert.deepEqual(c, ex);
  assert.equal('map' in c, false);
  assert.equal('alts' in c, false);
});
