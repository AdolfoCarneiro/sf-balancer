import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { meioPlan, meios } from '../../src/planner/model/meio.ts';
import { meioGeo } from '../../src/planner/model/map/meiogeo.ts';
import { buildScene, placesOf } from '../../src/planner/model/map/scene.ts';
import { centerOn } from '../../src/planner/model/map/camera.ts';
import { dragged, nudged, rotated, warningRect, withPlace } from '../../src/planner/model/map/edit.ts';

const data = game as GameData;
const ex = exampleChain(data);

test('arrastar prende na grade de 8 m (arredonda), mantendo giro e vãos', () => {
  const p = { x: 16, y: 8, rot: 1 as const, gapRow: 4 };
  assert.deepEqual(dragged(p, 3.9, -4.1), { x: 16, y: 0, rot: 1, gapRow: 4 });
  assert.deepEqual(dragged(p, 4.1, 11.9), { x: 24, y: 16, rot: 1, gapRow: 4 });
  assert.deepEqual(dragged({ x: 0, y: 0, rot: 0 }, -1, -3), { x: 0, y: 0, rot: 0 });   // sem -0
  assert.ok(!Object.is(dragged({ x: 0, y: 0, rot: 0 }, -1, -3).x, -0));
});

test('setas movem 8 m; outra tecla não move', () => {
  const p = { x: 8, y: 8, rot: 0 as const };
  assert.deepEqual(nudged(p, 'ArrowLeft'), { x: 0, y: 8, rot: 0 });
  assert.deepEqual(nudged(p, 'ArrowRight'), { x: 16, y: 8, rot: 0 });
  assert.deepEqual(nudged(p, 'ArrowUp'), { x: 8, y: 0, rot: 0 });
  assert.deepEqual(nudged(p, 'ArrowDown'), { x: 8, y: 16, rot: 0 });
  assert.equal(nudged(p, 'a'), null);
});

test('girar 90°: rot + 1, volta a 0 depois de 3', () => {
  assert.equal(rotated({ x: 0, y: 0, rot: 0 }).rot, 1);
  assert.equal(rotated({ x: 0, y: 0, rot: 3, gapMachine: 2 }).rot, 0);
  assert.equal(rotated({ x: 0, y: 0, rot: 3, gapMachine: 2 }).gapMachine, 2);
});

test('withPlace: todas as posições mais a mudança, sem mexer no original', () => {
  const all = { a: { x: 0, y: 0, rot: 0 as const }, b: { x: 8, y: 8, rot: 2 as const } };
  const out = withPlace(all, 'b', { x: 16, y: 8, rot: 2 });
  assert.deepEqual(out, { a: { x: 0, y: 0, rot: 0 }, b: { x: 16, y: 8, rot: 2 } });
  assert.deepEqual(all.b, { x: 8, y: 8, rot: 2 });
});

test('warningRect: união dos dois retângulos (bloco e meio); id desconhecido = null', () => {
  const geos = Object.fromEntries(meios(ex, data).map(m => {
    const plan = meioPlan(m, ex, data);
    return [m.id, meioGeo(m, plan, plan.alternatives[0]?.key ?? '', data.items[m.item])];
  }));
  const scene = buildScene(ex, data, placesOf(ex, data, geos), geos);
  const a = scene.blocks[0], m = scene.meios[0];
  const r = warningRect(scene, [a.stage, m.meio])!;
  const x0 = Math.min(a.rect.x, m.rect.x), y0 = Math.min(a.rect.y, m.rect.y);
  const x1 = Math.max(a.rect.x + a.rect.w, m.rect.x + m.rect.w), y1 = Math.max(a.rect.y + a.rect.h, m.rect.y + m.rect.h);
  assert.deepEqual(r, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  assert.equal(warningRect(scene, [a.stage, 'nada']), null);
});

test('centerOn: centraliza mantendo o zoom; se não cabe nesse zoom, enquadra', () => {
  const c = centerOn({ x: 0, y: 0, zoom: 2 }, { x: 100, y: 50, w: 10, h: 10 }, 400, 300);
  assert.equal(c.zoom, 2);
  assert.equal(c.x + 400 / 2 / c.zoom, 105);
  assert.equal(c.y + 300 / 2 / c.zoom, 55);
  // Ponto (crossing): sempre cabe.
  const p = centerOn({ x: 0, y: 0, zoom: 30 }, { x: 7, y: 9, w: 0, h: 0 }, 400, 300);
  assert.equal(p.zoom, 30);
  assert.equal(p.x + 200 / 30, 7);
  // 500 m num zoom 2 não cabe em 400 px: o zoom diminui até caber.
  const f = centerOn({ x: 0, y: 0, zoom: 2 }, { x: 0, y: 0, w: 500, h: 10 }, 400, 300);
  assert.ok(f.zoom < 2);
  assert.ok(500 * f.zoom <= 400);
});

test('medida em metros e fundações: um texto só para bloco, meio e área', async () => {
  const { sizeText, foundations } = await import('../../src/planner/ui/format.ts');
  assert.equal(foundations(16), 2); assert.equal(foundations(16.5), 3); assert.equal(foundations(0), 0);
  assert.equal(sizeText({ w: 40, h: 13 }), '40 × 13 m · 5 × 2 fundações');
});
