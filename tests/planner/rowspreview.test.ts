import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData, Layout, Stage } from '../../src/planner/model/types.ts';
import { arrange, rowsSummary } from '../../src/planner/model/layout.ts';
import { blockGeo } from '../../src/planner/model/map/block.ts';
import type { Piece } from '../../src/planner/model/map/geo.ts';
import { previewBox, previewPieces, rowsArrangement, rowsExitText, rowsLinesText, rowsModelText } from '../../src/planner/ui/rowspreview.ts';
import { setLang } from '../../src/i18n/index.js';

const data = game as GameData;
const inLang = <T>(l: string, fn: () => T): T => { setLang(l); try { return fn(); } finally { setLang('pt'); } };
const IRON = 'Desc_IronIngot_C', ORE = 'Desc_OreIron_C';
const refinery = (machines: number, layout?: Layout): Stage =>
  ({ id: 's1', recipe: 'Recipe_Alternate_PureIronIngot_C', machines, clock: 100, perRow: null, tiers: {}, ...(layout ? { layout } : {}) });
const texts = (st: Stage) => {
  const a = rowsArrangement(st, data);
  return [rowsModelText(a), rowsLinesText(a, st, data), rowsExitText(a, st, data)];
};

test('miniatura: o desenho é o do arranjo do bloco (sem arranjo, o blockGeo de hoje)', () => {
  const plain = refinery(42), center = refinery(42, { kind: 'center' }), place = { gapRow: 4, gapMachine: 2 };
  assert.deepEqual(rowsArrangement(plain, data, place).geo, blockGeo(plain, data, place));
  assert.deepEqual(rowsArrangement(center, data, place).geo, arrange(center, data, { kind: 'center' }, place).geo);
});

test('miniatura: nome do modelo, saídas e por onde saem, nos três idiomas', () => {
  assert.deepEqual(texts(refinery(42)), ['Fileira simples', '6 saídas de 455/min', 'pela ponta']);
  assert.deepEqual(texts(refinery(40)), ['Fileira simples', '6 saídas de 455/min, a última de 325/min', 'pela ponta']);
  assert.deepEqual(texts(refinery(42, { kind: 'center' })), ['Mergers no meio', '6 saídas de 455/min', 'descem por Conveyor Lift']);
  assert.deepEqual(texts(refinery(42, { kind: 'backToBack' })), ['Costas com costas', '6 saídas de 455/min', 'pela ponta']);
  // 40 em center: pares de 20 = 7, 7, 6 em cada par (tamanhos misturados).
  const up = refinery(40, { kind: 'center', belts: { [`out:${IRON}`]: { exit: 'up' } } });
  assert.deepEqual(texts(up), ['Mergers no meio', 'Saídas: 4 × 455/min, 2 × 390/min', 'sobem por Conveyor Lift']);
  assert.deepEqual(inLang('en', () => texts(up)), ['Mergers in the middle', 'Outputs: 4 × 455/min, 2 × 390/min', 'go up by Conveyor Lift']);
  assert.deepEqual(inLang('es', () => texts(refinery(42, { kind: 'backToBack' }))), ['Espalda con espalda', '6 salidas de 455/min', 'por la punta']);
  assert.deepEqual(inLang('es', () => texts(refinery(42, { kind: 'center' })))[2], 'bajan por Conveyor Lift');
});

test('miniatura: a caixa inclui o Conveyor Lift que passa da borda (entrada em x = -1)', () => {
  const st = refinery(14, { kind: 'simple', belts: { [`in:${ORE}`]: { exit: 'down' } } }), geo = rowsArrangement(st, data).geo;
  const box = previewBox(geo);
  assert.equal(box.x, -1); assert.equal(box.y, 0);
  assert.equal(box.w, geo.w + 1); assert.ok(box.h >= geo.h);
  assert.deepEqual(previewBox(blockGeo(refinery(14), data)), { x: 0, y: 0, w: blockGeo(refinery(14), data).w, h: blockGeo(refinery(14), data).h });
});

test('miniatura: peças demais viram uma faixa por tipo e altura', () => {
  const few: Piece[] = [{ kind: 'machine', x: 0, y: 0, w: 2, h: 2 }];
  assert.equal(previewPieces(few), few);
  const many: Piece[] = Array.from({ length: 1600 }, (_, i) => ({ kind: 'merger', x: i * 3, y: i % 2 ? 10 : 0, w: 2, h: 2 }));
  assert.deepEqual(previewPieces(many), [
    { kind: 'merger', x: 0, y: 0, w: 1598 * 3 + 2, h: 2 }, { kind: 'merger', x: 3, y: 10, w: 1598 * 3 + 2, h: 2 },
  ]);
});

test('textos do mapa: fileiras e máquinas por fileira pelo modelo do bloco', () => {
  assert.deepEqual(rowsSummary(refinery(42), data), { rows: 6, per: 7 });
  assert.deepEqual(rowsSummary(refinery(3), data), { rows: 1, per: 7 });   // como hoje: "até 7"
  assert.deepEqual(rowsSummary(refinery(42, { kind: 'center' }), data), { rows: 4, per: 11 });
  assert.deepEqual(rowsSummary(refinery(1, { kind: 'center' }), data), { rows: 1, per: 1 });
  assert.deepEqual(rowsSummary(refinery(0, { kind: 'center' }), data), { rows: 0, per: 0 });
});
