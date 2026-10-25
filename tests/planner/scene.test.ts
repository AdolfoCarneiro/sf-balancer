import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Chain, GameData, MapPlace, Stage, StageId } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { addStage, link, setMachines } from '../../src/planner/model/chain.ts';
import { meioPlan, meios } from '../../src/planner/model/meio.ts';
import { meioGeo } from '../../src/planner/model/map/meiogeo.ts';
import { blockGeo } from '../../src/planner/model/map/block.ts';
import type { MeioGeo, Rect } from '../../src/planner/model/map/geo.ts';
import { buildScene, hitTest, placesOf, proposeMap, rotSize, toWorld } from '../../src/planner/model/map/scene.ts';
import { crossings, overlaps } from '../../src/planner/model/map/checks.ts';

const data = game as GameData;
const ex = exampleChain(data);
const STEEL_MEIO = 'Desc_SteelIngot_C:s2>s3,s4';

// Geometria de cada meio na primeira montagem (ou a faixa de grande demais).
function geosOf(chain: Chain): Record<string, MeioGeo | null> {
  return Object.fromEntries(meios(chain, data).map(m => {
    const plan = meioPlan(m, chain, data);
    return [m.id, meioGeo(m, plan, plan.alternatives[0]?.key ?? '', data.items[m.item])];
  }));
}
const geosDoExemplo = () => geosOf(ex);
const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const blockOf = (s: ReturnType<typeof buildScene>, id: StageId) => s.blocks.find(b => b.stage === id)!;
const meioOf = (s: ReturnType<typeof buildScene>, id: string) => s.meios.find(m => m.meio === id)!;

test('proposta do exemplo: colunas da esquerda para a direita, tudo na grade, nada sobreposto', () => {
  const p = proposeMap(ex, data, geosDoExemplo());
  assert.ok(p.s1.x < p.s2.x && p.s2.x < p.s3.x && p.s3.x === p.s4.x);
  assert.ok(p.s3.y < p.s4.y);
  assert.ok(Object.values(p).every(q => q.x % 8 === 0 && q.y % 8 === 0 && q.rot === 0));
  const s = buildScene(ex, data, p, geosDoExemplo());
  assert.deepEqual(s.overlaps, []);
  // O meio de cada coluna cabe antes da coluna seguinte.
  const m1 = meioOf(s, 'Desc_IronIngot_C:s1>s2');
  assert.ok(m1.rect.x >= p.s1.x + blockOf(s, 's1').rect.w && m1.rect.x + m1.rect.w <= p.s2.x);
});

test('giro: rot 1 troca largura e comprimento, e as entradas passam para cima', () => {
  const g = blockGeo(ex.stages[1], data);
  assert.deepEqual(rotSize(g, 1), { w: g.h, h: g.w });
  assert.deepEqual(rotSize(g, 2), { w: g.w, h: g.h });
  const at = (rot: 0 | 1 | 2 | 3) => toWorld([0, g.h / 2], g, { x: 16, y: 8, rot });
  assert.deepEqual(at(0), [16, 8 + g.h / 2]);
  assert.deepEqual(at(1), [16 + g.h / 2, 8]);            // borda de cima
  assert.deepEqual(at(2), [16 + g.w, 8 + g.h / 2]);      // borda da direita
  assert.deepEqual(at(3), [16 + g.h / 2, 8 + g.w]);      // borda de baixo
  // Na cena, o bloco girado ocupa o retângulo girado e as esteiras da etapa chegam por cima.
  const p = { ...proposeMap(ex, data, geosDoExemplo()) };
  p.s2 = { ...p.s2, rot: 1 };
  const s = buildScene(ex, data, p, geosDoExemplo());
  assert.deepEqual(blockOf(s, 's2').rect, { x: p.s2.x, y: p.s2.y, w: g.h, h: g.w });
  const coal = s.belts.filter(b => b.role === 'raw' && b.item === 'Desc_Coal_C');
  assert.equal(coal.length, 5);
  assert.ok(coal.every(b => b.pts[b.pts.length - 1][1] === p.s2.y && b.pts[0][1] === p.s2.y - 8));
  // O meio de s2 vai junto: fica embaixo do bloco, com o mesmo giro.
  const m = meioOf(s, STEEL_MEIO);
  assert.equal(m.rot, 1);
  assert.equal(m.rect.y, p.s2.y + g.w + 2);
});

test('meio anda com a primeira produtora', () => {
  const geos = geosDoExemplo();
  const p = proposeMap(ex, data, geos);
  const a = meioOf(buildScene(ex, data, p, geos), STEEL_MEIO).rect;
  const b = meioOf(buildScene(ex, data, { ...p, s2: { ...p.s2, x: p.s2.x + 80 } }, geos), STEEL_MEIO).rect;
  assert.deepEqual(b, { ...a, x: a.x + 80 });
  // Colado no lado de saída, a 2 m, centrado na borda.
  const s = buildScene(ex, data, p, geos), blk = blockOf(s, 's2').rect;
  assert.equal(a.x, blk.x + blk.w + 2);
  assert.equal(a.y + a.h / 2, blk.y + blk.h / 2);
});

test('esteiras do mundo: cada fileira da produtora liga à linha do meio e o meio às fileiras dos consumidores', () => {
  const geos = geosDoExemplo();
  const p = proposeMap(ex, data, geos);
  const s = buildScene(ex, data, p, geos);
  const iron = s.belts.filter(b => b.item === 'Desc_IronIngot_C');
  assert.equal(iron.length, 6 + 5);   // 6 fileiras de s1 → meio, meio → 5 fileiras de s2
  const s1 = blockOf(s, 's1').rect, m = meioOf(s, 'Desc_IronIngot_C:s1>s2').rect, s2 = blockOf(s, 's2').rect;
  assert.ok(iron.slice(0, 6).every(b => b.pts[0][0] === s1.x + s1.w && b.pts[b.pts.length - 1][0] === m.x));
  assert.ok(iron.slice(6).every(b => b.pts[0][0] === m.x + m.w && b.pts[b.pts.length - 1][0] === s2.x));
  assert.ok(s.belts.every(b => b.pts.length <= 4 && b.pts.every((q, i) => i === 0 || q[0] === b.pts[i - 1][0] || q[1] === b.pts[i - 1][1])));
  // Entradas brutas (minério e água de s1, carvão de s2) viram tocos de 8 m.
  const raw = s.belts.filter(b => b.role === 'raw');
  assert.equal(raw.length, 6 * 2 + 5);
  assert.ok(raw.every(b => Math.abs(b.pts[0][0] - b.pts[b.pts.length - 1][0]) === 8));
  // bounds cobre tudo, inclusive os tocos à esquerda de x = 0.
  assert.equal(s.bounds.x, -8);
  assert.ok(s.blocks.every(b => b.rect.x + b.rect.w <= s.bounds.x + s.bounds.w && b.rect.y + b.rect.h <= s.bounds.y + s.bounds.h));
});

test('etapa editada depois de posicionada: bloco cresce mantendo o canto e a sobreposição vira aviso', () => {
  const p = proposeMap(ex, data, geosDoExemplo());
  const ch = { ...setMachines(ex, data, 's3', 120), map: p };
  const geos = geosOf(ch);
  const q = placesOf(ch, data, geos);
  for (const id of ['s1', 's2', 's3', 's4']) assert.deepEqual(q[id], p[id]);
  const s = buildScene(ch, data, q, geos);
  assert.ok(blockOf(s, 's3').rect.h > blockOf(buildScene(ex, data, p, geosDoExemplo()), 's3').rect.h);
  assert.ok(s.overlaps.some(([a, b]) => [a, b].sort().join() === 's3,s4'));
});

test('etapa nova sem posição vai para a proposta ou para baixo de tudo, sem sobrepor', () => {
  const p = proposeMap(ex, data, geosDoExemplo());
  const ch = { ...addStage(ex, data, 'Recipe_IronPlate_C', 10), map: p };
  const geos = geosOf(ch);
  const q = placesOf(ch, data, geos);
  assert.deepEqual(q.s5, proposeMap(ch, data, geos).s5);
  assert.deepEqual(buildScene(ch, data, q, geos).overlaps, []);
  // A proposta cai em cima de um bloco posicionado: vai para baixo de tudo, em x = 0.
  const prop = proposeMap(ch, data, geos).s5;
  const ch2: Chain = { ...ch, map: { ...p, s4: { x: prop.x, y: prop.y, rot: 0 } } };
  const q2 = placesOf(ch2, data, geos);
  const s2 = buildScene(ch2, data, q2, geos);
  assert.equal(q2.s5.x, 0); assert.equal(q2.s5.y % 8, 0);
  const others = s2.blocks.filter(b => b.stage !== 's5');
  assert.ok(others.every(b => q2.s5.y >= b.rect.y + b.rect.h + 8));
  assert.ok(!s2.overlaps.some(pair => pair.includes('s5')));
  // Não grava nada.
  assert.equal(ch2.map!.s5, undefined);
});

test('cena monta com etapa solta, meio fluido, meio grande demais e meio calculando', () => {
  let ch = addStage(ex, data, 'Recipe_IronPlate_C', 10);                       // s5 solta
  ch = addStage(ch, data, 'Recipe_Plastic_C', 10);                              // s6
  ch = addStage(ch, data, 'Recipe_ResidualFuel_C', 2);                          // s7
  ch = link(ch, data, 's6', 's7', 'Desc_HeavyOilResidue_C');
  ch = addStage(ch, data, 'Recipe_IngotIron_C', 5000);                          // s8
  ch = addStage(ch, data, 'Recipe_IronPlate_C', 5000);                          // s9
  ch = link(ch, data, 's8', 's9', 'Desc_IronIngot_C');
  assert.equal(ch.links.length, 5);
  const geos: Record<string, MeioGeo | null> = { ...geosOf(ch), 'Desc_IronIngot_C:s1>s2': null };
  const big = meios(ch, data).find(m => m.producers[0] === 's8')!;
  assert.equal(geos[big.id]!.tooLarge, true);
  const s = buildScene(ch, data, placesOf(ch, data, geos), geos);
  assert.equal(s.blocks.length, 9); assert.equal(s.meios.length, 4);
  for (const id of ['Desc_IronIngot_C:s1>s2', big.id]) {
    const m = meioOf(s, id);
    assert.equal(m.rect.w, 16); assert.equal(m.rect.h, 8);
    // Sem esteiras de nem para ele.
    assert.ok(!s.belts.some(b => b.pts.some(([x, y]) => inside(m.rect, x, y))));
  }
  assert.equal(meioOf(s, 'Desc_IronIngot_C:s1>s2').geo, null);
  assert.ok(s.belts.some(b => b.fluid && b.item === 'Desc_HeavyOilResidue_C' && b.role !== 'raw'));
  // A etapa solta tem tocos nas entradas.
  const s5 = blockOf(s, 's5').rect;
  assert.ok(s.belts.some(b => b.role === 'raw' && b.pts[b.pts.length - 1][0] === s5.x));
});

test('cruzamento: duas esteiras em cruz contam 1; as do mesmo meio que se tocam na ponta não contam', () => {
  const b = (pts: [number, number][]) => ({ pts, item: 'x', rate: 1, role: 'main' as const, fluid: false });
  assert.deepEqual(crossings([b([[0, 5], [10, 5]]), b([[5, 0], [5, 10]])]), [[5, 5]]);
  assert.deepEqual(crossings([b([[0, 5], [5, 5]]), b([[5, 0], [5, 5]])]), []);            // mesma ponta
  assert.deepEqual(crossings([b([[0, 5], [10, 5]]), b([[5, 0], [5, 5]])]), []);           // termina na outra
  assert.deepEqual(crossings([b([[0, 0], [1, 0], [1, 10]]), b([[0, 5], [1, 5], [1, 12]])]), []);   // leque: curva encosta
  assert.deepEqual(crossings([b([[0, 0], [10, 0], [10, 10]]), b([[5, -5], [5, 5], [15, 5]])]), [[5, 0], [10, 5]]);
  // Esteiras longas, em células diferentes da grade de 64 m.
  assert.deepEqual(crossings([b([[-500, 300], [900, 300]]), b([[700, -100], [700, 800]])]), [[700, 300]]);
  assert.deepEqual(crossings([b([[0, 0], [10, 0]]), b([[20, -5], [20, 5]])]), []);
});

test('cruzamentos com coordenadas hostis (±100 km): custo não depende do tamanho das esteiras', () => {
  const b = (pts: [number, number][]) => ({ pts, item: 'x', rate: 1, role: 'main' as const, fluid: false });
  const belts = [];
  // 3.000 horizontais à esquerda e 3.000 verticais à direita, todas de 100 a 200 km: nenhuma se cruza.
  for (let i = 0; i < 3000; i++) belts.push(b([[-100000, i * 0.01], [-1, i * 0.01]]), b([[1 + i * 0.01, -100000], [1 + i * 0.01, 100000]]));
  const t0 = performance.now();
  assert.deepEqual(crossings(belts), []);
  const dt = performance.now() - t0;
  assert.ok(dt < 150, `${dt.toFixed(0)} ms`);
  // E as que se cruzam continuam contadas, em ordem de x.
  assert.deepEqual(crossings([b([[-100000, 0], [100000, 0]]), b([[99999, -100000], [99999, 100000]]), b([[-5, -1], [-5, 1]])]), [[-5, 0], [99999, 0]]);
});

test('sobreposição: só interseção de área', () => {
  const r = (id: string, x: number, y: number, w = 10, h = 10) => ({ id, rect: { x, y, w, h } });
  assert.deepEqual(overlaps([r('a', 0, 0), r('b', 10, 0), r('c', 0, 10)]), []);
  assert.deepEqual(overlaps([r('a', 0, 0), r('b', 9, 9), r('c', 100, 0)]), [['a', 'b']]);
});

test('hitTest acha o bloco e o meio pelo ponto do mundo', () => {
  const geos = geosDoExemplo();
  const s = buildScene(ex, data, proposeMap(ex, data, geos), geos);
  const c = (r: Rect) => [r.x + r.w / 2, r.y + r.h / 2] as const;
  assert.deepEqual(hitTest(s, ...c(blockOf(s, 's1').rect)), { kind: 'block', id: 's1' });
  assert.deepEqual(hitTest(s, ...c(blockOf(s, 's4').rect)), { kind: 'block', id: 's4' });
  assert.deepEqual(hitTest(s, ...c(meioOf(s, STEEL_MEIO).rect)), { kind: 'meio', id: STEEL_MEIO });
  assert.equal(hitTest(s, -1000, -1000), null);
});

test('desempenho: cadeia de ~2.000 máquinas monta a cena em menos de 200 ms', () => {
  // Dados sintéticos: A0 → A1 → … → A10, uma receita por passo, prédio 10 × 20.
  const items: GameData['items'] = {}, recipes: GameData['recipes'] = {};
  for (let i = 0; i <= 10; i++) items[`A${i}`] = { id: `A${i}`, name: `A${i}`, fluid: false, raw: i === 0 };
  for (let i = 0; i < 10; i++) recipes[`R${i}`] = { id: `R${i}`, name: `R${i}`, alt: false, building: 'B', ins: [{ item: `A${i}`, perMin: 30 }], outs: [{ item: `A${i + 1}`, perMin: 30 }] };
  const syn: GameData = { items, recipes, buildings: { B: { id: 'B', name: 'B', w: 10, l: 20 } } };
  const stages: Stage[] = Array.from({ length: 10 }, (_, i) => ({ id: `s${i + 1}`, recipe: `R${i}`, machines: 200, clock: 100, perRow: null, locked: false, tiers: {}, pos: { x: 0, y: 0 } }));
  const ch: Chain = { v: 1, stages, links: stages.slice(1).map((s, i) => ({ id: `l${i + 1}`, item: `A${i + 1}`, from: stages[i].id, to: s.id })), policy: 'represar' };
  const rows = blockGeo(stages[0], syn).outs.length;
  const geos: Record<string, MeioGeo> = Object.fromEntries(meios(ch, syn).map(m => {
    const a = (stage: string, x: number) => Array.from({ length: rows }, (_, k) => ({ x, y: 6 * k + 2, item: m.item, row: k, stage }));
    return [m.id, { w: 40, h: 6 * rows, pieces: [], belts: [], ins: a(m.producers[0], 0), outs: a(m.consumers[0], 40), estimate: false, floors: 1, tooLarge: false }];
  }));
  const places: Record<StageId, MapPlace> = proposeMap(ch, syn, geos);
  buildScene(ch, syn, places, geos);   // aquece
  const t = performance.now();
  const s = buildScene(ch, syn, places, geos);
  const dt = performance.now() - t;
  assert.equal(s.blocks.length, 10);
  assert.equal(s.belts.length, 9 * 2 * rows + rows);
  assert.ok(dt < 200, `${dt.toFixed(1)} ms`);
});

// Algum trecho da esteira passa por dentro do retângulo (encostar na borda não conta)?
const cuts = (pts: [number, number][], r: Rect) => pts.some((q, i) => {
  if (!i) return false;
  const [x0, y0] = pts[i - 1], [x1, y1] = q;
  if (y0 === y1) return r.y < y0 && y0 < r.y + r.h && Math.min(x0, x1) < r.x + r.w && Math.max(x0, x1) > r.x;
  return r.x < x0 && x0 < r.x + r.w && Math.min(y0, y1) < r.y + r.h && Math.max(y0, y1) > r.y;
});

test('meio → consumidora girada: a esteira chega pelo eixo da entrada, de fora, sem atravessar o bloco nem o meio', () => {
  const geos = geosDoExemplo();
  const p0 = proposeMap(ex, data, geos);
  const IRON = 'Desc_IronIngot_C:s1>s2';
  for (const rot of [0, 1, 2, 3] as const) {
    const p = { ...p0, s2: { ...p0.s2, rot } };
    const s = buildScene(ex, data, p, geos);
    const blk = blockOf(s, 's2').rect, m = meioOf(s, IRON).rect;
    const toS2 = s.belts.filter(b => b.item === 'Desc_IronIngot_C' && b.role === 'main' && inside(blk, ...b.pts[b.pts.length - 1]));
    assert.equal(toS2.length, 5, `rot ${rot}`);
    for (const b of toS2) {
      assert.ok(!cuts(b.pts, blk), `rot ${rot}: ${JSON.stringify(b.pts)} atravessa o bloco`);
      assert.ok(!cuts(b.pts, m), `rot ${rot}: ${JSON.stringify(b.pts)} atravessa o meio`);
      // Último trecho no eixo da entrada (x para rot 0/2, y para 1/3).
      const [a, z] = b.pts.slice(-2);
      assert.equal(rot % 2 ? a[0] === z[0] : a[1] === z[1], true, `rot ${rot}: ${JSON.stringify(b.pts)}`);
      assert.ok(b.pts.every((q, i) => i === 0 || q[0] === b.pts[i - 1][0] || q[1] === b.pts[i - 1][1]));
    }
  }
});

test('proposta do exemplo com os meios de verdade: nenhum cruzamento e nada sobreposto', () => {
  const geos = geosDoExemplo();
  const s = buildScene(ex, data, proposeMap(ex, data, geos), geos);
  assert.deepEqual(s.crossings, []);
  assert.deepEqual(s.overlaps, []);
  // A esteira do meio para a consumidora vira logo na saída do meio (1 m), não no meio do caminho.
  const m = meioOf(s, 'Desc_IronIngot_C:s1>s2').rect;
  const out = s.belts.filter(b => b.item === 'Desc_IronIngot_C' && b.pts[0][0] === m.x + m.w && b.pts.length > 2);
  assert.ok(out.length > 0 && out.every(b => b.pts[1][0] === m.x + m.w + 1));
});

test('etapa nova: o meio colado nela também não pode cair em cima de algo já posicionado', () => {
  const geos = geosDoExemplo();
  const p = proposeMap(ex, data, geos);
  const steel = meioOf(buildScene(ex, data, p, geos), STEEL_MEIO).rect;
  // s3 em cima do meio de aço de s2, mas sem tocar o bloco de s2; s2 sem posição.
  const s3 = { x: Math.ceil(steel.x / 8) * 8, y: Math.floor(steel.y / 8) * 8, rot: 0 as const };
  const ch: Chain = { ...ex, map: { s1: p.s1, s3, s4: { ...p.s4, y: 1000 } } };
  const s2rect = blockOf(buildScene(ex, data, p, geos), 's2').rect;
  assert.ok(s3.x >= s2rect.x + s2rect.w, 's3 não encosta no bloco de s2');
  const q = placesOf(ch, data, geos);
  assert.notDeepEqual(q.s2, p.s2);
  assert.equal(q.s2.x, 0);
  assert.ok(!buildScene(ch, data, q, geos).overlaps.some(pair => pair.includes('s2') || pair.includes(STEEL_MEIO)));
});
