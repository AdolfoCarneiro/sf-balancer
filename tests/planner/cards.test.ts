import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, MapPlace, RecipeBlock, StageId } from '../../src/planner/model/types.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { disconnect, meiosOf, placeLig } from '../../src/planner/model/factory.ts';
import { solveFactory, type FlowResult } from '../../src/planner/model/solve.ts';
import { meioPlan } from '../../src/planner/model/meio.ts';
import { meioGeo } from '../../src/planner/model/map/meiogeo.ts';
import type { MeioGeo } from '../../src/planner/model/map/geo.ts';
import { buildScene, placesOf } from '../../src/planner/model/map/scene.ts';
import type { Camera } from '../../src/planner/model/map/camera.ts';
import {
  CARD_W, CHIP_H, CHIP_W, MARK_H, MARK_W, PLANT_PORT_OUT, PORT_STEP, PORT_Y0,
  MONTAR_LIMITS, MONTAR_REF, cardScale, cardSize, chipWorld, fitMontar, montarBounds, stripRows, viewGeo, viewHit, viewLimits,
} from '../../src/planner/model/map/cards.ts';

const data = game as GameData;
const ex = exampleFactory(data);
const STEEL_MEIO = 'Desc_SteelIngot_C:s2>s3,s4';
const CAM: Camera = { x: -20, y: -40, zoom: 4 };   // 4 px/m: cartão em 100 %

function geosOf(f: Factory, flow: FlowResult): Record<string, MeioGeo | null> {
  return Object.fromEntries(meiosOf(f).map(m => {
    const plan = meioPlan(m, f, flow, data);
    return [m.id, meioGeo(m, plan, plan.alternatives[0]?.key ?? '', data.items[m.item])];
  }));
}
// Cena, fluxo e a geometria de tela da fábrica.
function view(f: Factory, t: number, places?: (p: Record<StageId, MapPlace>) => Record<StageId, MapPlace>, cam = CAM) {
  const flow = solveFactory(f, data), geos = geosOf(f, flow);
  const p0 = placesOf(f, data, geos, flow), scene = buildScene(f, data, places ? places(p0) : p0, geos, flow);
  return { scene, flow, v: viewGeo(scene, cam, t, false, f, data, flow) };
}
const finite = (x: unknown): boolean => JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'BAD' : v)).indexOf('BAD') < 0;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `esperava ${b}, veio ${a}`);

test('escala do cartão: 70 % no desktop, 60 % no celular, 115 % no máximo', () => {
  assert.equal(cardScale(0.1, false), 0.7);
  assert.equal(cardScale(0.1, true), 0.6);
  assert.equal(cardScale(100, false), 1.15);
  assert.equal(cardScale(4, false), 1);
});

test('faixa: 6 fileiras como estão; 8 de 8 com última 4 vira 4 + "+3" + a última', () => {
  assert.deepEqual(stripRows([8, 8, 8, 8, 8, 4]), [8, 8, 8, 8, 8, 4].map(machines => ({ machines })));
  assert.deepEqual(stripRows([8, 8, 8, 8, 8, 8, 8, 4]),
    [{ machines: 8 }, { machines: 8 }, { machines: 8 }, { machines: 8 }, { machines: 0, repeat: 3 }, { machines: 4 }]);
  assert.equal(stripRows(Array(120).fill(40)).length, 6);
  // Tamanho: 1 entrada e 1 saída, 5 fileiras mostradas de 29 + 20 do "+ N" + 12.
  const rowH = 5 + 14 + 5 + 5;
  assert.deepEqual(cardSize('recipe', Array(120).fill(40), 1, 1), { w: CARD_W, h: 62 + 5 * rowH + 20 + 12 + 34 });
  assert.deepEqual(cardSize('recipe', [8, 8, 8, 8, 8, 8, 8, 4], 1, 1), cardSize('recipe', Array(120).fill(40), 1, 1));
  // Muitas portas: a altura acompanha as portas.
  assert.equal(cardSize('recipe', [1], 4, 1).h, 90 + 3 * 52 + 34);
  assert.deepEqual(cardSize('marker', [], 0, 1), { w: MARK_W, h: MARK_H });
});

test('Montar: portas na borda do cartão, 44 px, uma por item', () => {
  const { v } = view(ex, 0);
  assert.equal(v.blocks.length, ex.blocks.length);
  for (const b of v.blocks) {
    near(b.rect.x, b.card.x); near(b.rect.w, b.card.w);
    const blk = ex.blocks.find(x => x.id === b.id)!;
    const ports = v.ports.filter(p => p.block === b.id);
    for (const p of ports) near(p.x, p.side === 'in' ? b.card.x : b.card.x + b.card.w);
    if (blk.kind === 'recipe') {
      const r = data.recipes[blk.recipe];
      assert.deepEqual(ports.filter(p => p.side === 'in').map(p => p.item), r.ins.map(x => x.item));
      assert.deepEqual(ports.filter(p => p.side === 'out').map(p => p.item), r.outs.map(x => x.item));
      ports.filter(p => p.side === 'in').forEach((p, i) => near(p.y, b.card.y + (PORT_Y0 + i * PORT_STEP) * b.scale));
    }
  }
  // O cartão nasce no canto do bloco na tela, no tamanho do cartão vezes a escala (zoom 1 → 70 %).
  const s1 = view(ex, 0, undefined, { ...CAM, zoom: 1 }).v.blocks.find(b => b.id === 's1')!;
  assert.equal(s1.scale, 0.7);
  near(s1.card.w, CARD_W * 0.7);
});

test('Planta: porta 30 px por fora do bloco real', () => {
  const { scene, v } = view(ex, 1, p => ({ ...p, s2: { ...p.s2, rot: 1 } }));
  const s1 = v.blocks.find(b => b.id === 's1')!, real = scene.blocks.find(b => b.stage === 's1')!.rect;
  assert.deepEqual(s1.plant, { x: (real.x - CAM.x) * CAM.zoom, y: (real.y - CAM.y) * CAM.zoom, w: real.w * CAM.zoom, h: real.h * CAM.zoom });
  assert.deepEqual(s1.rect, s1.plant);
  for (const p of v.ports.filter(q => q.block === 's1')) {
    near(p.x, p.side === 'in' ? s1.plant.x - PLANT_PORT_OUT : s1.plant.x + s1.plant.w + PLANT_PORT_OUT);
    assert.deepEqual(p.dir, p.side === 'in' ? [-1, 0] : [1, 0]);
    assert.ok(p.lanes.length >= 1);
  }
  // Girado (rot 1): entradas por cima, saídas por baixo; as do mesmo lado afastadas pelo menos PORT_STEP.
  const s2 = v.blocks.find(b => b.id === 's2')!, ins = v.ports.filter(q => q.block === 's2' && q.side === 'in');
  assert.equal(ins.length, 2);
  for (const p of ins) { near(p.y, s2.plant.y - PLANT_PORT_OUT); assert.deepEqual(p.dir, [0, -1]); }
  assert.ok(Math.abs(ins[0].x - ins[1].x) >= PORT_STEP - 1e-6);
  for (const p of v.ports.filter(q => q.block === 's2' && q.side === 'out')) near(p.y, s2.plant.y + s2.plant.h + PLANT_PORT_OUT);
  // Uma porta só no lado: no meio das âncoras do item (as fileiras).
  const out1 = v.ports.find(q => q.block === 's1' && q.side === 'out')!;
  near(out1.y, out1.lanes.reduce((s, l) => s + l[1], 0) / out1.lanes.length);
  assert.ok(finite(v));
});

test('t = 0,5 fica no meio do caminho', () => {
  const a = view(ex, 0).v, b = view(ex, 1).v, m = view(ex, 0.5).v;
  m.blocks.forEach((x, i) => {
    for (const k of ['x', 'y', 'w', 'h'] as const) near(x.rect[k], (a.blocks[i].rect[k] + b.blocks[i].rect[k]) / 2);
  });
  assert.equal(m.ports.length, a.ports.length);
  m.ports.forEach((p, i) => { near(p.x, (a.ports[i].x + b.ports[i].x) / 2); near(p.y, (a.ports[i].y + b.ports[i].y) / 2); });
  m.chips.forEach((c, i) => { near(c.x, (a.chips[i].x + b.chips[i].x) / 2); near(c.y, (a.chips[i].y + b.chips[i].y) / 2); });
});

test('chip no meio da esteira; com ligs, no lugar salvo; ligs de grupo que mudou é ignorado', () => {
  const { scene, v } = view(ex, 0);
  assert.equal(v.chips.length, scene.meios.length);
  const c = v.chips.find(x => x.meio === STEEL_MEIO)!;
  assert.deepEqual([c.w, c.h], [CHIP_W, CHIP_H]);
  // Montar sem ligs: no meio entre a saída do aço de s2 e a média das entradas de aço de s3 e s4.
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const out = v.ports.find(p => p.block === 's2' && p.side === 'out')!;
  const ins = v.ports.filter(p => (p.block === 's3' || p.block === 's4') && p.side === 'in' && p.item === 'Desc_SteelIngot_C');
  assert.equal(ins.length, 2);
  near(c.x, (out.x + mean(ins.map(p => p.x))) / 2); near(c.y, (out.y + mean(ins.map(p => p.y))) / 2);
  // Planta: no centro do retângulo do meio.
  const r = scene.meios.find(m => m.meio === STEEL_MEIO)!.rect, c1 = view(ex, 1).v.chips.find(x => x.meio === STEEL_MEIO)!;
  near(c1.x, (r.x + r.w / 2 - CAM.x) * CAM.zoom); near(c1.y, (r.y + r.h / 2 - CAM.y) * CAM.zoom);
  // Com ligs: no centro do retângulo salvo, nas duas vistas.
  const placed = placeLig(ex, STEEL_MEIO, { x: 400, y: 80, rot: 0 });
  for (const t of [0, 1]) {
    const w = view(placed, t), rr = w.scene.meios.find(m => m.meio === STEEL_MEIO)!.rect, cc = w.v.chips.find(x => x.meio === STEEL_MEIO)!;
    assert.equal(rr.x, 400);
    near(cc.x, (rr.x + rr.w / 2 - CAM.x) * CAM.zoom); near(cc.y, (rr.y + rr.h / 2 - CAM.y) * CAM.zoom);
  }
  // Grupo que mudou (uma ligação a menos): a posição guardada no id velho não vale para o novo; volta ao meio da esteira.
  const gone = ex.links.find(l => l.from === 's2' && l.to === 's4')!.id;
  const stale: Factory = { ...disconnect(placed, gone), ligs: { [STEEL_MEIO]: { x: 400, y: 80, rot: 0 } } };
  const w = view(stale, 0), id = meiosOf(stale).find(m => m.item === 'Desc_SteelIngot_C')!.id;
  const cs = w.v.chips.find(x => x.meio === id)!;
  const o2 = w.v.ports.find(p => p.block === 's2' && p.side === 'out')!, i3 = w.v.ports.find(p => p.block === 's3' && p.side === 'in' && p.item === 'Desc_SteelIngot_C')!;
  near(cs.x, (o2.x + i3.x) / 2); near(cs.y, (o2.y + i3.y) / 2);
});

test('hit: porta ganha do bloco embaixo dela; chip ganha de tudo', () => {
  const { v } = view(ex, 0);
  const b = v.blocks.find(x => x.id === 's2')!, p = v.ports.find(x => x.block === 's2' && x.side === 'in')!;
  // Um pouco para dentro do cartão: ainda é a porta.
  assert.deepEqual(viewHit(v, p.x + 10, p.y), { kind: 'port', port: p });
  assert.deepEqual(viewHit(v, b.rect.x + b.rect.w / 2, b.rect.y + 20), { kind: 'block', id: 's2' });
  const c = v.chips[0];
  assert.deepEqual(viewHit(v, c.x + CHIP_W / 2 - 2, c.y), { kind: 'chip', meio: c.meio });
  assert.equal(viewHit(v, -1e5, -1e5), null);
});

test('hit: chip desenhado por cima de uma porta ganha dela; a porta fora do chip ainda ganha do bloco', () => {
  const { v } = view(ex, 0);
  const p = v.ports.find(x => x.block === 's1' && x.side === 'out')!, c = v.chips[0];
  // O chip em cima da porta (como no celular, no zoom mínimo da Montar).
  const over = { ...v, chips: [{ ...c, x: p.x + CHIP_W / 2 - 10, y: p.y }] };
  assert.deepEqual(viewHit(over, p.x, p.y), { kind: 'chip', meio: c.meio });
  // Do outro lado da porta, fora do chip: a porta.
  assert.deepEqual(viewHit(over, p.x - 20, p.y), { kind: 'port', port: p });
});

test('chipWorld: o canto do meio na grade para o centro ficar no ponto', () => {
  const cam: Camera = { x: 10, y: 20, zoom: 2 };
  // Centro (100, 60) do mundo = tela (180, 80); meio 16 × 8 → canto (92, 56) → grade (96, 56).
  assert.deepEqual(chipWorld(cam, 180, 80, { w: 16, h: 8 }), { x: 96, y: 56, rot: 0 });
});

test('fábrica vazia: listas vazias, sem NaN', () => {
  const f: Factory = { v: 2, blocks: [], links: [] };
  for (const t of [0, 0.5, 1]) {
    const { v } = view(f, t);
    assert.deepEqual(v, { blocks: [], ports: [], chips: [] });
    assert.equal(viewHit(v, 0, 0), null);
  }
});

test('bloco sem limite e bloco com 120 fileiras: cartão finito, faixa de no máximo 6 linhas', () => {
  const free: RecipeBlock = { id: 's1', kind: 'recipe', recipe: 'Recipe_IronPlate_C', clock: 100, perRow: null, tiers: {} };
  const big: RecipeBlock = { id: 's2', kind: 'recipe', recipe: 'Recipe_IronPlate_C', clock: 100, perRow: 40, tiers: {}, limits: { machines: 4800 } };
  const f: Factory = { v: 2, blocks: [free, big], links: [] };
  for (const t of [0, 1]) {
    const { v } = view(f, t);
    assert.ok(finite(v));
    assert.equal(v.blocks.length, 2);
  }
  const { v } = view(f, 0);
  const a = v.blocks.find(b => b.id === 's1')!, b = v.blocks.find(x => x.id === 's2')!;
  near(a.card.h, cardSize('recipe', [1], 1, 1).h * a.scale);
  near(b.card.h, cardSize('recipe', Array(120).fill(40), 1, 1).h * b.scale);
});

test('Montar: limites de zoom de 35 % a 300 % do zoom de referência; Planta, os globais', () => {
  assert.deepEqual(MONTAR_LIMITS, { min: MONTAR_REF * 0.35, max: MONTAR_REF * 3 });
  assert.equal(viewLimits(true), MONTAR_LIMITS);
  assert.ok(viewLimits(false).min < MONTAR_LIMITS.min && viewLimits(false).max > MONTAR_LIMITS.max);
});

test('Montar: mostrar tudo enquadra os cartões (com as portas) dentro dos limites; vazio dá null', () => {
  const { scene, flow } = view(ex, 0);
  const vw = 1200, vh = 800, c = fitMontar(scene, ex, data, flow, vw, vh, false)!;
  assert.ok(c && c.zoom >= MONTAR_LIMITS.min && c.zoom <= MONTAR_LIMITS.max);
  // Cada cartão desse zoom cabe na tela.
  const v = viewGeo(scene, c, 0, false, ex, data, flow);
  for (const b of v.blocks) assert.ok(b.rect.x >= 0 && b.rect.y >= 0 && b.rect.x + b.rect.w <= vw && b.rect.y + b.rect.h <= vh, JSON.stringify(b.rect));
  for (const p of v.ports) assert.ok(p.x - 22 >= 0 && p.x + 22 <= vw, `porta fora: ${p.x}`);
  const empty: Factory = { ...ex, blocks: [], links: [] }, fe = solveFactory(empty, data);
  const se = buildScene(empty, data, {}, {}, fe);
  assert.equal(fitMontar(se, empty, data, fe, vw, vh, false), null);
  assert.deepEqual(montarBounds(se, empty, data, fe, 4, false), { x: 0, y: 0, w: 0, h: 0 });
});
