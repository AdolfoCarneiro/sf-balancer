import test from 'node:test';
import assert from 'node:assert/strict';
import { DETAIL_ZOOM, ZOOM_MAX, ZOOM_MIN, fit, pan, screenToWorld, visible, zoomAt } from '../../src/planner/model/map/camera.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('zoomAt mantém o ponto sob o cursor', () => {
  const c = zoomAt({ x: 10, y: 20, zoom: 2 }, 1.5, 300, 200);
  const [ax, ay] = screenToWorld(c, 300, 200), [bx, by] = screenToWorld({ x: 10, y: 20, zoom: 2 }, 300, 200);
  near(ax, bx); near(ay, by);
  assert.equal(c.zoom, 3);
});

test('zoom limitado a [ZOOM_MIN, ZOOM_MAX]', () => {
  assert.equal(zoomAt({ x: 0, y: 0, zoom: 1 }, 1e6, 50, 50).zoom, ZOOM_MAX);
  assert.equal(zoomAt({ x: 0, y: 0, zoom: 1 }, 1e-6, 50, 50).zoom, ZOOM_MIN);
  // No limite, o ponto sob o cursor continua parado.
  const c = zoomAt({ x: 5, y: 5, zoom: 30 }, 10, 120, 80);
  const [ax, ay] = screenToWorld(c, 120, 80), [bx, by] = screenToWorld({ x: 5, y: 5, zoom: 30 }, 120, 80);
  near(ax, bx); near(ay, by);
  assert.ok(ZOOM_MIN < DETAIL_ZOOM && DETAIL_ZOOM < ZOOM_MAX);
});

test('fit mostra o retângulo inteiro com margem', () => {
  const r = { x: 100, y: -50, w: 400, h: 100 }, vw = 800, vh = 600, pad = 40;
  const c = fit(r, vw, vh, pad);
  // Cabe com a margem nos dois eixos, e encosta na margem no eixo que limita (aqui a largura).
  near(c.zoom, (vw - 2 * pad) / r.w);
  const [x0, y0] = [(r.x - c.x) * c.zoom, (r.y - c.y) * c.zoom];
  const [x1, y1] = [(r.x + r.w - c.x) * c.zoom, (r.y + r.h - c.y) * c.zoom];
  assert.ok(x0 >= pad - 1e-9 && y0 >= pad - 1e-9 && x1 <= vw - pad + 1e-9 && y1 <= vh - pad + 1e-9);
  // Centrado.
  near((x0 + x1) / 2, vw / 2); near((y0 + y1) / 2, vh / 2);
  // Retângulo vazio ou tela minúscula: zoom dentro dos limites, sem NaN.
  const z = fit({ x: 0, y: 0, w: 0, h: 0 }, 10, 10);
  assert.ok(Number.isFinite(z.x) && Number.isFinite(z.y) && z.zoom >= ZOOM_MIN && z.zoom <= ZOOM_MAX);
});

test('visible descarta o que está fora da tela', () => {
  const c = { x: 0, y: 0, zoom: 2 };   // tela 200 × 100 px = mundo 100 × 50 m
  assert.equal(visible({ x: 10, y: 10, w: 5, h: 5 }, c, 200, 100), true);
  assert.equal(visible({ x: 95, y: 45, w: 20, h: 20 }, c, 200, 100), true);    // parte dentro
  assert.equal(visible({ x: 101, y: 10, w: 5, h: 5 }, c, 200, 100), false);    // à direita
  assert.equal(visible({ x: 10, y: 51, w: 5, h: 5 }, c, 200, 100), false);     // abaixo
  assert.equal(visible({ x: -20, y: 10, w: 19, h: 5 }, c, 200, 100), false);   // à esquerda
  assert.equal(visible({ x: 10, y: -20, w: 5, h: 19 }, c, 200, 100), false);   // acima
});

test('pan move em px de tela, convertido pelo zoom', () => {
  const c = pan({ x: 10, y: 20, zoom: 4 }, 40, -80);
  assert.deepEqual(c, { x: 20, y: 0, zoom: 4 });
  assert.deepEqual(screenToWorld({ x: 10, y: 20, zoom: 4 }, 40, 80), [20, 40]);
});
