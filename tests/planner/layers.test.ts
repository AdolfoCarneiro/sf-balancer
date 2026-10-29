import test from 'node:test';
import assert from 'node:assert/strict';
import { viewHit, type ViewGeo } from '../../src/planner/model/map/cards.ts';
import { ALL_LAYERS, DOT_H, DOT_W, NO_LAYERS, cleanLayers, cleanViewLayers, compactChips, hitGeo } from '../../src/planner/model/map/layers.ts';

// Um cartão com uma porta na borda e um chip ao lado.
const V: ViewGeo = {
  blocks: [{ id: 's1', rect: { x: 0, y: 0, w: 200, h: 100 }, scale: 1, card: { x: 0, y: 0, w: 200, h: 100 }, plant: { x: 0, y: 0, w: 10, h: 10 } }],
  ports: [{ block: 's1', side: 'out', item: 'Desc_IronIngot_C', x: 200, y: 50, r: 22, dir: [1, 0], lanes: [] }],
  chips: [{ meio: 'm1', x: 400, y: 50, w: 120, h: 56 }],
  k: 1,
};

test('camadas: padrão tudo ligado; lixo do storage cai no padrão por chave', () => {
  assert.deepEqual(cleanLayers(null), ALL_LAYERS);
  assert.deepEqual(cleanLayers('x'), ALL_LAYERS);
  assert.deepEqual(cleanLayers({ icons: false, names: 'no', links: 0, ports: false }), { icons: false, names: true, links: true, ports: false, compact: true });
  assert.equal(cleanLayers({ compact: false }).compact, false);
  assert.deepEqual(cleanLayers(NO_LAYERS), NO_LAYERS);
});

test('camadas: tudo ligado e perto, a geometria do clique é a mesma', () => {
  assert.equal(hitGeo(V, ALL_LAYERS, true, true), V);
  assert.equal(viewHit(hitGeo(V, ALL_LAYERS, true, true), 200, 50)?.kind, 'port');
  assert.equal(viewHit(hitGeo(V, ALL_LAYERS, true, true), 400, 50)?.kind, 'chip');
});

test('camadas: porta escondida não pega o clique (cai no cartão); chip escondido não pega nada', () => {
  const noPorts = hitGeo(V, { ...ALL_LAYERS, ports: false }, true, true);
  assert.deepEqual(viewHit(noPorts, 198, 50), { kind: 'block', id: 's1' });
  assert.equal(viewHit(noPorts, 206, 50), null);
  assert.equal(viewHit(noPorts, 400, 50)?.kind, 'chip');
  const noLinks = hitGeo(V, { ...ALL_LAYERS, links: false }, true, true);
  assert.equal(viewHit(noLinks, 400, 50), null);
  assert.equal(viewHit(noLinks, 200, 50)?.kind, 'port');
  const none = hitGeo(V, NO_LAYERS, true, true);
  assert.deepEqual([none.ports.length, none.chips.length, none.blocks.length], [0, 0, 1]);
});

test('camadas: de longe (portas e chips fora) continua escondendo, com as camadas ligadas', () => {
  const far = hitGeo(V, ALL_LAYERS, false, false);
  assert.deepEqual([far.ports.length, far.chips.length], [0, 0]);
  const plantFar = hitGeo(V, ALL_LAYERS, false, true);
  assert.deepEqual([plantFar.ports.length, plantFar.chips.length], [0, 1]);
});

test('camadas por vista: o formato antigo vale para as duas; cada vista guarda a sua', () => {
  assert.deepEqual(cleanViewLayers(null), { montar: ALL_LAYERS, planta: ALL_LAYERS });
  assert.deepEqual(cleanViewLayers(NO_LAYERS), { montar: NO_LAYERS, planta: NO_LAYERS });
  assert.deepEqual(cleanViewLayers({ montar: NO_LAYERS }), { montar: NO_LAYERS, planta: ALL_LAYERS });
  assert.deepEqual(cleanViewLayers({ montar: 1, planta: { names: false } }), { montar: ALL_LAYERS, planta: { ...ALL_LAYERS, names: false } });
});

test('ligações compactas: o chip fechado vira o ponto (menor no clique); o aberto fica com o tamanho do chip', () => {
  assert.equal(compactChips(V, false, () => false), V);
  const c = compactChips(V, true, () => false).chips[0];
  assert.deepEqual([c.w, c.h, c.compact], [DOT_W, DOT_H, true]);
  assert.equal(viewHit(compactChips(V, true, () => false), 400 + 50, 50)?.kind, undefined);
  assert.equal(viewHit(compactChips(V, true, () => false), 400, 50)?.kind, 'chip');
  assert.deepEqual(compactChips(V, true, id => id === 'm1').chips[0], V.chips[0]);
});
