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
import { buildScene, hitTest, placesOf } from '../../src/planner/model/map/scene.ts';
import { solvedStage } from '../../src/planner/model/solved.ts';
import { arrange } from '../../src/planner/model/layout.ts';
import type { Camera } from '../../src/planner/model/map/camera.ts';
import {
  CARD_W, CHIP_H, CHIP_W, MARK_H, MARK_W, PLANT_PORT_OUT, PORT_STEP, PORT_Y0,
  MONTAR_LIMITS, MONTAR_REF, PORT_LABEL_ROOM, bezierAt, cardScale, cardSize, chipWorld, fitMontar, linkBezier, fitPlanta, montarBounds, switchCam, viewGeo, viewHit, viewLimits,
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
// Um zoom de longe (35 % do cartão).
const FAR = MONTAR_REF * 0.35;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `esperava ${b}, veio ${a}`);

test('escala do cartão: segue o mapa como no Modeler, 115 % no máximo', () => {
  assert.equal(cardScale(100, false), 1.15);
  assert.equal(cardScale(4, false), 1);
  // O tamanho no mundo fica parado: afastar não amontoa os blocos (no celular, igual).
  near(cardScale(FAR, false), 0.35);
  near(cardScale(FAR, true), 0.35);
  near(cardScale(2, false), 0.5);
  assert.ok(cardScale(MONTAR_LIMITS.min, false) > 0);
});

test('a Montar é um desenho só: portas e chips na mesma escala do cartão, em qualquer zoom', () => {
  for (const zoom of [FAR, 2, 4, 8]) {
    const { v } = view(ex, 0, undefined, { ...CAM, zoom });
    const s = v.blocks[0].scale;
    near(v.k, s);
    for (const p of v.ports) near(p.r, 22 * s);
    for (const c of v.chips) { near(c.w, CHIP_W * s); near(c.h, CHIP_H * s); }
  }
});

test('cartão enxuto: só o cabeçalho, a altura acompanha as portas', () => {
  // Uma porta de cada lado: nome, número e faixa de baixo, a porta no meio da altura.
  assert.deepEqual(cardSize('recipe', 1, 1), { w: CARD_W, h: MARK_H });
  assert.equal(PORT_Y0, 38);
  assert.equal(cardSize('recipe', 2, 1).h, 2 * PORT_Y0 + PORT_STEP);
  // Muitas portas: a altura acompanha as portas, com a mesma folga em cima e embaixo.
  assert.equal(cardSize('recipe', 4, 1).h, 2 * PORT_Y0 + 3 * PORT_STEP);
  assert.deepEqual(cardSize('marker', 0, 1), { w: MARK_W, h: MARK_H });
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
      // As portas de cada lado centradas na altura do cartão.
      for (const side of ['in', 'out'] as const) {
        const ps = ports.filter(p => p.side === side), h = b.card.h / b.scale;
        ps.forEach((p, i) => near(p.y, b.card.y + ((h - (ps.length - 1) * PORT_STEP) / 2 + i * PORT_STEP) * b.scale));
      }
    }
  }
  // O cartão nasce no canto do bloco na tela, no tamanho do cartão vezes a escala (em FAR → 35 %).
  const s1 = view(ex, 0, undefined, { ...CAM, zoom: FAR }).v.blocks.find(b => b.id === 's1')!;
  near(s1.scale, 0.35);
  near(s1.card.w, CARD_W * 0.35);
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
  // Cada ponto da Montar anda até o chip da ligação dele na Planta (os extras somem só no fim).
  assert.equal(m.chips.length, a.chips.length);
  m.chips.forEach((c, i) => {
    const pb = b.chips.find(x => x.meio === c.meio)!;
    near(c.x, (a.chips[i].x + pb.x) / 2); near(c.y, (a.chips[i].y + pb.y) / 2);
  });
});

test('Montar: um ponto por link, no meio da esteira dele; Planta: um chip por ligação, no lugar dela', () => {
  const { scene, v } = view(ex, 0);
  // O aço sai de s2 para s3 e s4: dois links, dois pontos (o segundo é extra).
  const steel = v.chips.filter(x => x.meio === STEEL_MEIO);
  assert.equal(steel.length, 2);
  assert.equal(v.chips.length, scene.meios.length + 1);
  assert.equal(steel[0].extra, undefined); assert.equal(steel[1].extra, true);
  assert.deepEqual([steel[0].w, steel[0].h], [CHIP_W, CHIP_H]);
  const out = v.ports.find(p => p.block === 's2' && p.side === 'out')!;
  for (const c of steel) {
    // Para a frente, a curva é simétrica: o meio dela é o meio entre as duas portas.
    const inp = v.ports.find(p => p.block === c.link!.to && p.side === 'in' && p.item === 'Desc_SteelIngot_C')!;
    near(c.x, (out.x + inp.x) / 2); near(c.y, (out.y + inp.y) / 2);
    assert.equal(c.link!.from, 's2');
  }
  // Planta: um chip só, no centro do retângulo do meio.
  const r = scene.meios.find(m => m.meio === STEEL_MEIO)!.rect, p1 = view(ex, 1).v.chips.filter(x => x.meio === STEEL_MEIO);
  assert.equal(p1.length, 1);
  near(p1[0].x, (r.x + r.w / 2 - CAM.x) * CAM.zoom); near(p1[0].y, (r.y + r.h / 2 - CAM.y) * CAM.zoom);
  // Com ligs: a Planta vai para o lugar salvo; a Montar continua no meio da esteira (o ponto segue os cartões).
  const placed = placeLig(ex, STEEL_MEIO, { x: 400, y: 80, rot: 0 });
  const w1 = view(placed, 1), rr = w1.scene.meios.find(m => m.meio === STEEL_MEIO)!.rect, cc = w1.v.chips.find(x => x.meio === STEEL_MEIO)!;
  assert.equal(rr.x, 400);
  near(cc.x, (rr.x + rr.w / 2 - CAM.x) * CAM.zoom); near(cc.y, (rr.y + rr.h / 2 - CAM.y) * CAM.zoom);
  const w0 = view({ ...placed, montarLigs: { [STEEL_MEIO]: { x: 40, y: 200, rot: 0 } } }, 0);
  assert.deepEqual(w0.v.chips.filter(x => x.meio === STEEL_MEIO).map(c => [c.x, c.y]), steel.map(c => [c.x, c.y]));
});

test('Montar: a volta de um subproduto passa por baixo dos dois cartões, com o ponto embaixo deles', () => {
  const a: [number, number] = [600, 100], b: [number, number] = [200, 120];
  const bz = linkBezier(a, b, 1), mid = bezierAt(bz, 0.5);
  assert.ok(mid[1] > 120 + 60, `o meio (${mid[1]}) devia ficar bem abaixo das portas`);
  near(mid[0], 400);
  // Para a frente: as alças horizontais, metade da distância.
  const f = linkBezier([0, 0], [200, 100], 1);
  assert.deepEqual(f[1], [100, 0]); assert.deepEqual(f[2], [100, 100]);
  assert.deepEqual(bezierAt(f, 0.5), [100, 50]);
  // Puxado: o meio da curva cai no ponto puxado, para a frente e na volta.
  for (const [p, q] of [[[0, 0], [200, 100]], [[600, 100], [200, 120]]] as [[number, number], [number, number]][]) {
    const m0 = bezierAt(linkBezier(p, q, 1), 0.5), m1 = bezierAt(linkBezier(p, q, 1, [30, 80]), 0.5);
    near(m1[0], m0[0] + 30); near(m1[1], m0[1] + 80);
  }
});

test('Montar: o ponto puxado (bends) fica onde foi posto em relação ao meio, e segue os cartões', () => {
  const lk = ex.links.find(l => l.from === 's2' && l.to === 's3')!.id;
  const c0 = view(ex, 0).v.chips.find(c => c.link?.id === lk)!;
  const c1 = view({ ...ex, bends: { [lk]: [10, 20] } }, 0).v.chips.find(c => c.link?.id === lk)!;
  near(c1.x, c0.x + 10 * CAM.zoom); near(c1.y, c0.y + 20 * CAM.zoom);
  assert.deepEqual(c1.link!.bend, [10 * CAM.zoom, 20 * CAM.zoom]);
  // A Planta não usa.
  const p0 = view(ex, 1).v.chips.find(c => c.meio === STEEL_MEIO)!, p1 = view({ ...ex, bends: { [lk]: [10, 20] } }, 1).v.chips.find(c => c.meio === STEEL_MEIO)!;
  assert.deepEqual([p1.x, p1.y], [p0.x, p0.y]);
});

test('hit: porta ganha do bloco embaixo dela; chip ganha de tudo', () => {
  const { v } = view(ex, 0);
  const b = v.blocks.find(x => x.id === 's2')!, p = v.ports.find(x => x.block === 's2' && x.side === 'in')!;
  // Um pouco para dentro do cartão: ainda é a porta.
  assert.deepEqual(viewHit(v, p.x + 10, p.y), { kind: 'port', port: p });
  assert.deepEqual(viewHit(v, b.rect.x + b.rect.w / 2, b.rect.y + 20), { kind: 'block', id: 's2' });
  const c = v.chips[0];
  assert.deepEqual(viewHit(v, c.x + CHIP_W / 2 - 2, c.y), { kind: 'chip', meio: c.meio, link: c.link!.id });
  assert.equal(viewHit(v, -1e5, -1e5), null);
});

test('hit na Planta: o corpo do bloco ganha do ponto que o cobre (o Miner pequeno); o círculo do ponto ainda pega', () => {
  const blk = { id: 'e1', rect: { x: 100, y: 100, w: 32, h: 32 }, scale: 1, card: { x: 0, y: 0, w: 1, h: 1 }, plant: { x: 100, y: 100, w: 32, h: 32 } };
  const g = { blocks: [blk], ports: [], chips: [{ meio: 'm', x: 130, y: 116, w: 64, h: 52, compact: true as const }], k: 1 };
  assert.deepEqual(viewHit(g, 110, 116, true), { kind: 'block', id: 'e1' });
  assert.deepEqual(viewHit(g, 110, 116), { kind: 'chip', meio: 'm' });   // na Montar, o ponto continua por cima
  assert.deepEqual(viewHit(g, 132, 116, true), { kind: 'chip', meio: 'm' });
  assert.deepEqual(viewHit(g, 155, 116, true), { kind: 'chip', meio: 'm' });   // fora do bloco, a área toda do ponto
});

test('hit: chip desenhado por cima de uma porta ganha dela; a porta fora do chip ainda ganha do bloco', () => {
  const { v } = view(ex, 0);
  const p = v.ports.find(x => x.block === 's1' && x.side === 'out')!, c = v.chips[0];
  // O chip em cima da porta (como no celular, no zoom mínimo da Montar).
  const over = { ...v, chips: [{ ...c, x: p.x + CHIP_W / 2 - 10, y: p.y }] };
  assert.deepEqual(viewHit(over, p.x, p.y), { kind: 'chip', meio: c.meio, link: c.link!.id });
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
    assert.deepEqual({ ...v, k: 0 }, { blocks: [], ports: [], chips: [], k: 0 });
    assert.ok(Number.isFinite(v.k));
    assert.equal(viewHit(v, 0, 0), null);
  }
});

test('bloco sem limite e bloco com 120 fileiras: cartão finito, do mesmo tamanho (sem faixa)', () => {
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
  near(a.card.h, cardSize('recipe', 1, 1).h * a.scale);
  near(b.card.h, cardSize('recipe', 1, 1).h * b.scale);
});

test('Montar: zoom de longe como o da Planta até 300 % do zoom de referência', () => {
  assert.deepEqual(MONTAR_LIMITS, { min: viewLimits(false).min, max: MONTAR_REF * 3 });
  assert.ok(MONTAR_LIMITS.min <= FAR / 20);
  assert.equal(viewLimits(true), MONTAR_LIMITS);
  assert.ok(viewLimits(false).max > MONTAR_LIMITS.max);
});

test('Montar: mostrar tudo enquadra os cartões (com as portas) dentro dos limites; vazio dá null', () => {
  const { scene, flow } = view(ex, 0);
  const vw = 1200, vh = 800, c = fitMontar(scene, ex, data, flow, vw, vh, false)!;
  assert.ok(c && c.zoom >= MONTAR_LIMITS.min && c.zoom <= MONTAR_LIMITS.max);
  // Cada cartão desse zoom cabe na tela.
  const v = viewGeo(scene, c, 0, false, ex, data, flow);
  for (const b of v.blocks) assert.ok(b.rect.x >= 0 && b.rect.y >= 0 && b.rect.x + b.rect.w <= vw && b.rect.y + b.rect.h <= vh, JSON.stringify(b.rect));
  for (const p of v.ports) assert.ok(p.x - 22 >= 0 && p.x + 22 <= vw, `porta fora: ${p.x}`);
  // E o rótulo do estado ao lado de cada porta (por fora do cartão) também cabe.
  for (const p of v.ports) assert.ok(p.x - 22 - PORT_LABEL_ROOM >= 0 && p.x + 22 + PORT_LABEL_ROOM <= vw, `rótulo fora: ${p.x}`);
  const empty: Factory = { ...ex, blocks: [], links: [] }, fe = solveFactory(empty, data);
  const se = buildScene(empty, data, {}, {}, fe);
  assert.equal(fitMontar(se, empty, data, fe, vw, vh, false), null);
  assert.deepEqual(montarBounds(se, empty, data, fe, 4, false), { x: 0, y: 0, w: 0, h: 0 });
});

test('Planta: mostrar tudo deixa as portas e os rótulos delas dentro da tela', () => {
  const { scene, flow } = view(ex, 1);
  const vw = 1400, vh = 860, c = fitPlanta(scene.bounds, vw, vh);
  const v = viewGeo(scene, c, 1, false, ex, data, flow);
  assert.ok(v.ports.length > 0);
  for (const p of v.ports) assert.ok(p.x - 22 - PORT_LABEL_ROOM >= 0 && p.x + 22 + PORT_LABEL_ROOM <= vw, `porta/rótulo fora: ${p.x}`);
});

test('Planta: bloco em Mergers no meio desenha o arranjo; a porta fica na borda, na média das saídas, e o leque vai à borda de cada uma', () => {
  const IRON = 'Desc_IronIngot_C';
  const f: Factory = { ...ex, blocks: ex.blocks.map(b => (b.id === 's1' ? { ...(b as RecipeBlock), layout: { kind: 'center' } } : b)) };
  const { scene, flow, v } = view(f, 1);
  const sb = scene.blocks.find(b => b.stage === 's1')!, st = solvedStage(f.blocks[0] as RecipeBlock, flow.blocks.s1);
  const a = arrange(st, data, st.layout, sb.place);
  assert.deepEqual(sb.geo, a.geo);
  // Âncoras de saída nos fins dos trechos (onde descem os Conveyor Lifts), não na borda do bloco.
  const outs = sb.geo.outs.filter(x => x.item === IRON);
  assert.deepEqual(outs.map(x => [x.x, x.y]), a.lines.filter(l => l.side === 'out' && l.item === IRON).map(l => l.at));
  assert.equal(outs.length, 6);
  assert.ok(outs.some(x => x.x > 0 && x.x < sb.geo.w));
  assert.equal(sb.geo.pieces.filter(p => p.kind === 'lift' && p.item === IRON).length, 6);
  const s1 = v.blocks.find(b => b.id === 's1')!, port = v.ports.find(p => p.block === 's1' && p.side === 'out' && p.item === IRON)!;
  const toS = (x: number, y: number) => [(sb.rect.x + x - CAM.x) * CAM.zoom, (sb.rect.y + y - CAM.y) * CAM.zoom];
  near(port.x, s1.plant.x + s1.plant.w + PLANT_PORT_OUT);
  // O leque vai onde a esteira do mapa encontra cada linha: a borda de saída, uma altura por linha (sem cruzar o bloco).
  const gates = outs.map(x => x.gate!);
  assert.ok(gates.every(g => g.at[0] === sb.geo.w && g.dir[0] === 1));
  assert.equal(new Set(gates.map(g => g.at[1])).size, 6);
  assert.deepEqual(port.lanes, gates.map(g => toS(g.at[0], g.at[1])));
  near(port.y, port.lanes.reduce((s, l) => s + l[1], 0) / port.lanes.length);
  for (const l of port.lanes) near(l[0], s1.plant.x + s1.plant.w);
  // A entrada de minério: o leque só nas linhas que chegam pela borda da esquerda (o par da direita chega pela direita).
  const ore = v.ports.find(p => p.block === 's1' && p.side === 'in' && p.item === 'Desc_OreIron_C')!;
  assert.equal(ore.lanes.length, 2);
  for (const l of ore.lanes) near(l[0], s1.plant.x);
});

test('Planta: Conveyor Lift fora da caixa do bloco (x = -1) não muda o retângulo nem o acerto do clique', () => {
  const ORE = 'Desc_OreIron_C';
  const lay = { kind: 'simple' as const, belts: { [`in:${ORE}`]: { exit: 'down' as const } } };
  const f: Factory = { ...ex, blocks: ex.blocks.map(b => (b.id === 's1' ? { ...(b as RecipeBlock), layout: lay } : b)) };
  const { scene } = view(f, 1), sb = scene.blocks.find(b => b.stage === 's1')!;
  const lifts = sb.geo.pieces.filter(p => p.kind === 'lift');
  assert.ok(lifts.length > 0 && lifts.every(p => p.x === -1 && p.item === ORE));
  assert.deepEqual([sb.rect.w, sb.rect.h], [sb.geo.w, sb.geo.h]);
  assert.deepEqual(hitTest(scene, sb.rect.x + sb.rect.w / 2, sb.rect.y + sb.rect.h / 2), { kind: 'block', id: 's1' });
  assert.ok(finite(sb.geo));
});

test('Montar e Planta com posições próprias: o cartão no lugar da Montar, o bloco no da Planta, a transição entre eles', () => {
  const base = view(ex, 0).scene.blocks.find(b => b.stage === 's2')!.place;
  const f: Factory = { ...ex, montar: { s2: { x: base.x + 80, y: base.y + 40, rot: 0 } } };
  const toS = (x: number, y: number) => [(x - CAM.x) * CAM.zoom, (y - CAM.y) * CAM.zoom];
  const at = (t: number) => view(f, t).v.blocks.find(b => b.id === 's2')!;
  // Montar: o cartão onde a Montar diz; Planta: o bloco onde a Planta diz (igual à fábrica sem montar).
  assert.deepEqual([at(0).rect.x, at(0).rect.y], toS(base.x + 80, base.y + 40));
  assert.deepEqual([at(1).rect.x, at(1).rect.y], toS(base.x, base.y));
  assert.deepEqual(view(f, 1).scene.blocks.find(b => b.stage === 's2')!.rect, view(ex, 1).scene.blocks.find(b => b.stage === 's2')!.rect);
  near(at(0.5).rect.x, (at(0).rect.x + at(1).rect.x) / 2);
  // Os outros seguem a Planta.
  assert.deepEqual(view(f, 0).v.blocks.find(b => b.id === 's1')!.rect, view(ex, 0).v.blocks.find(b => b.id === 's1')!.rect);
  // Chip: ligs na Planta; na Montar o ponto fica no meio da esteira (montarLigs antigo não vale mais lá).
  const g: Factory = { ...ex, ligs: { [STEEL_MEIO]: { x: 400, y: 80, rot: 0 } }, montarLigs: { [STEEL_MEIO]: { x: 40, y: 200, rot: 0 } } };
  const w1 = view(g, 1), r = w1.scene.meios.find(m => m.meio === STEEL_MEIO)!.rect, c1 = w1.v.chips.find(x => x.meio === STEEL_MEIO)!;
  assert.equal(r.x, 400);
  near(c1.x, (400 + r.w / 2 - CAM.x) * CAM.zoom);
  const c0 = view(g, 0).v.chips.find(x => x.meio === STEEL_MEIO)!, free = view(ex, 0).v.chips.find(x => x.meio === STEEL_MEIO)!;
  near(c0.x, free.x); near(c0.y, free.y);
  // Mostrar tudo da Montar enquadra os cartões nos lugares dela.
  const wf = view(f, 0), b1 = montarBounds(wf.scene, f, data, wf.flow, MONTAR_REF, false);
  assert.ok(b1.x + b1.w >= base.x + 80 + CARD_W / MONTAR_REF);
  assert.ok(b1.y + b1.h > base.y + 40);
});

test('trocar de vista: a câmera fica se algum bloco aparece; senão vai ao selecionado na nova vista, ou enquadra (null)', () => {
  // A Montar longe da Planta (como depois de importar): a câmera da Planta cai no vazio da Montar.
  const f: Factory = { ...ex, montar: Object.fromEntries(ex.blocks.map((b, i) => [b.id, { x: 2000 + i * 80, y: 2000, rot: 0 }])) };
  const W = 1280, H = 720;
  const { v: planta } = view(f, 1);
  assert.ok(planta.blocks.some(b => b.rect.x < W && b.rect.x + b.rect.w > 0 && b.rect.y < H && b.rect.y + b.rect.h > 0));
  assert.equal(switchCam(planta, CAM, W, H, null), CAM);
  const { v: montar } = view(f, 0);
  assert.equal(switchCam(montar, CAM, W, H, null), null);
  // Com s1 selecionado: o cartão dele no meio da tela, no mesmo zoom.
  const c = switchCam(montar, CAM, W, H, 's1')!;
  assert.equal(c.zoom, CAM.zoom);
  const { v: after } = view(f, 0, undefined, c);
  const r = after.blocks.find(b => b.id === 's1')!.rect;
  near(r.x + r.w / 2, W / 2);
  near(r.y + r.h / 2, H / 2);
  // Fábrica vazia: nada a procurar, a câmera fica.
  assert.equal(switchCam({ blocks: [], ports: [], chips: [], k: 1 }, CAM, W, H, null), CAM);
});
