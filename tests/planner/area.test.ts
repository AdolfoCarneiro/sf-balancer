import test from 'node:test';
import assert from 'node:assert/strict';
import { areaGrip, dragArea } from '../../src/planner/model/map/area.ts';

const R = { x: 100, y: 100, w: 200, h: 100 };

test('área: a pega sob o ponteiro (cantos, bordas, meio, fora)', () => {
  assert.equal(areaGrip(R, 102, 98), 'nw');
  assert.equal(areaGrip(R, 300, 200), 'se');
  assert.equal(areaGrip(R, 297, 103), 'ne');
  assert.equal(areaGrip(R, 200, 100), 'n');
  assert.equal(areaGrip(R, 200, 205), 's');
  assert.equal(areaGrip(R, 95, 150), 'w');
  assert.equal(areaGrip(R, 200, 150), 'move');
  assert.equal(areaGrip(R, 80, 150), null);
  assert.equal(areaGrip(R, 200, 230), null);
});

test('área: puxar e mover ficam na grade de 8 m, com uma fundação no mínimo', () => {
  const r = { x: 0, y: 0, w: 40, h: 24 };
  // 13 m para a direita cai em 16; 5 m para cima, em -8.
  assert.deepEqual(dragArea(r, 'move', 13, -5), { x: 16, y: -8, w: 40, h: 24 });
  // Canto de baixo à direita: 10 m e 3 m viram 48 × 24.
  assert.deepEqual(dragArea(r, 'se', 10, 3), { x: 0, y: 0, w: 48, h: 24 });
  // Borda de cima puxada além da de baixo: para numa fundação.
  assert.deepEqual(dragArea(r, 'n', 0, 100), { x: 0, y: 16, w: 40, h: 8 });
  // Borda da esquerda puxada para fora.
  assert.deepEqual(dragArea(r, 'w', -20, 0), { x: -16, y: 0, w: 56, h: 24 });
});
