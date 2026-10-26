import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, Layout, MapPlace, RecipeBlock, Stage } from '../../src/planner/model/types.ts';
import type { BlockGeo } from '../../src/planner/model/map/geo.ts';
import { type Arrangement, arrange, arrangementLines, cleanLayout, recommendedPerRow } from '../../src/planner/model/layout.ts';
import { suggestedPerRow } from '../../src/planner/model/stage.ts';
import simpleFixture from './fixtures/layout-simple.json' with { type: 'json' };
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

// ---- arrange: simple, backToBack e ajustes ----

const PURE = 'Recipe_Alternate_PureIronIngot_C', ORE = 'Desc_OreIron_C', WATER = 'Desc_Water_C', INGOT = 'Desc_IronIngot_C';
const st = (machines: number, extra: Partial<Stage> = {}): Stage =>
  ({ id: 's', recipe: PURE, machines, clock: 100, perRow: null, tiers: {}, ...extra });
const machinesOf = (a: Arrangement) => a.geo.pieces.filter(p => p.kind === 'machine');
const lifts = (a: Arrangement) => a.geo.pieces.filter(p => p.kind === 'lift');
const belt = (a: Arrangement, side: 'in' | 'out', item: string, k = 0) =>
  a.geo.belts.filter(b => b.role === side && b.item === item)[k];

interface SimpleCase {
  name: string; stage: Stage; place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>;
  geo: BlockGeo; pieces: { splitters: number; mergers: number }; area: { w: number; d: number }; rows: number[];
}

// Gravado do blockGeo/stagePieces/stageArea/stageRows da fase 3 por fixtures/layout-simple.record.ts.
test('arrange simple sem ajustes = o bloco de hoje (geo, peças, área e linhas)', () => {
  for (const c of simpleFixture as unknown as SimpleCase[]) {
    for (const layout of [undefined, { kind: 'simple' } as Layout]) {
      const a = arrange(c.stage, data, layout, c.place);
      assert.deepEqual(a.geo, c.geo, c.name);
      assert.deepEqual(a.pieces, { ...c.pieces, lifts: 0 }, c.name);
      assert.deepEqual(a.area, c.area, c.name);
      assert.equal(a.kind, 'simple');
      assert.deepEqual(a.warnings, [], c.name);
      const r = data.recipes[c.stage.recipe];
      for (const f of r.ins) assert.deepEqual(arrangementLines(a, 'in', f.item), c.rows, c.name);
      for (const f of r.outs) assert.deepEqual(arrangementLines(a, 'out', f.item), c.rows, c.name);
    }
  }
  assert.ok((simpleFixture as unknown as SimpleCase[]).some(c => c.rows.length === 120));
});

test('recommendedPerRow: simple e backToBack = suggestedPerRow', () => {
  for (const k of ['simple', 'backToBack'] as const) assert.equal(recommendedPerRow(st(42), data, k), suggestedPerRow(st(42), data));
  assert.equal(recommendedPerRow(st(42), data, 'simple'), 7);
});

test('backToBack: 42 Pure Iron → 3 pares, a de baixo virada, 6 saídas de 7 separadas no corredor', () => {
  const a = arrange(st(42), data, { kind: 'backToBack' });
  assert.equal(a.kind, 'backToBack');
  assert.deepEqual(a.rows.map(r => r.machines), [7, 7, 7, 7, 7, 7]);
  assert.deepEqual(a.rows.map(r => r.flip), [false, true, false, true, false, true]);
  assert.deepEqual(arrangementLines(a, 'out', INGOT), [7, 7, 7, 7, 7, 7]);
  assert.ok(a.lines.filter(l => l.side === 'out').every(l => l.rate === 455 && l.exit === 'end' && l.rows.length === 1));
  assert.deepEqual(a.pieces, { splitters: 36, mergers: 36, lifts: 0 });
  // Par 0: a saída da fileira 0 embaixo dela, a da fileira 1 em cima dela, coladas no corredor.
  const m = machinesOf(a), top = m[0], bot = m[7];
  const o0 = belt(a, 'out', INGOT, 0).pts[0][1], o1 = belt(a, 'out', INGOT, 1).pts[0][1];
  assert.ok(top.y + top.h < o0 && o0 < o1 && o1 < bot.y);
  const i1 = belt(a, 'in', ORE, 1).pts[0][1];
  assert.ok(i1 > bot.y + bot.h, 'entrada da fileira de baixo por fora');
  assert.deepEqual(a.warnings, []);
  // Vão entre fileiras só entre os pares (31 m = 4 + 1 + 22 + 4 de cada fileira).
  const g = arrange(st(42), data, { kind: 'backToBack' }, { gapRow: 8 });
  assert.deepEqual(g.rows.map(r => r.y), [0, 31, 70, 101, 140, 171]);
  assert.equal(g.geo.h, 202);
  assert.ok(a.area.w % 8 === 0 && a.area.d % 8 === 0 && a.area.d >= a.geo.h && a.area.w >= a.geo.w);
});

test('backToBack com invert: as entradas no corredor, saídas por fora', () => {
  const a = arrange(st(42), data, { kind: 'backToBack', invert: true });
  assert.deepEqual(a.rows.map(r => r.flip), [true, false, true, false, true, false]);
  const m = machinesOf(a), top = m[0], bot = m[7];
  const i0 = belt(a, 'in', ORE, 0).pts[0][1], i1 = belt(a, 'in', ORE, 1).pts[0][1];
  assert.ok(top.y + top.h < i0 && i0 < i1 && i1 < bot.y);
  assert.ok(belt(a, 'out', INGOT, 0).pts[0][1] < top.y);
  assert.deepEqual(arrangementLines(a, 'in', ORE), [7, 7, 7, 7, 7, 7]);
});

test('backToBack: número ímpar de fileiras e 1 máquina não quebram', () => {
  const a = arrange(st(29), data, { kind: 'backToBack' });   // 4 de 7 + 1: a última fica sozinha, sem virar
  assert.deepEqual(a.rows.map(r => r.machines), [7, 7, 7, 7, 1]);
  assert.deepEqual(a.rows.map(r => r.flip), [false, true, false, true, false]);
  assert.deepEqual(arrange(st(29), data, { kind: 'backToBack', invert: true }).rows.map(r => r.flip), [true, false, true, false, false]);
  const one = arrange(st(1), data, { kind: 'backToBack' });
  assert.deepEqual(arrangementLines(one, 'out', INGOT), [1]);
  assert.ok(!JSON.stringify(one).includes('null'));
});

test('ajustes: flip troca as faixas, mirror troca as pontas, dx desloca, fileira inexistente é ignorada', () => {
  const base = arrange(st(42), data, { kind: 'simple' });
  const m0 = machinesOf(base)[0];
  assert.ok(belt(base, 'in', ORE, 0).pts[0][1] < m0.y);

  const f = arrange(st(42), data, { kind: 'simple', rows: { 0: { flip: true } } });
  const fm = machinesOf(f)[0];
  assert.ok(belt(f, 'in', ORE, 0).pts[0][1] > fm.y + fm.h && belt(f, 'out', INGOT, 0).pts[0][1] < fm.y);
  assert.deepEqual(f.rows.map(r => r.flip), [true, false, false, false, false, false]);

  const mi = arrange(st(42), data, { kind: 'simple', rows: { 0: { mirror: true } } });
  assert.equal(mi.geo.w, 70);
  assert.deepEqual(mi.geo.ins.filter(p => p.row === 0).map(p => p.x), [70, 70]);
  assert.deepEqual(mi.geo.outs.filter(p => p.row === 0).map(p => p.x), [0]);
  assert.equal(mi.rows[0].mirror, true);
  // 6 máquinas na última fileira de 41: espelhada, encosta na direita.
  const mr = arrange(st(41), data, { kind: 'simple', rows: { 5: { mirror: true } } });
  assert.equal(Math.max(...machinesOf(mr).slice(35).map(p => p.x + p.w)), 70);

  const d = arrange(st(42), data, { kind: 'simple', rows: { 1: { dx: 16 } } });
  assert.deepEqual(machinesOf(d).slice(7, 14).map(p => p.x), machinesOf(base).slice(7, 14).map(p => p.x + 16));
  assert.deepEqual(machinesOf(d).slice(0, 7), machinesOf(base).slice(0, 7));
  assert.equal(d.geo.w, 86); assert.equal(d.rows[1].x, 16);
  assert.ok(d.area.w >= 88);

  const dy = arrange(st(42), data, { kind: 'simple', rows: { 0: { dy: -16 } } });
  assert.equal(Math.min(...dy.geo.pieces.map(p => p.y)), 0, 'normaliza para o canto (0, 0)');

  const orphan = arrange(st(42), data, { kind: 'simple', rows: { 99: { flip: true, dx: 8 } } });
  assert.deepEqual(orphan.geo, base.geo);
  assert.deepEqual(orphan.area, base.area);
});

test('corte por fileira: só com saída por baixo/cima; elevadores nos fins', () => {
  const s = st(7);
  const a = arrange(s, data, { kind: 'simple', belts: { [`in:${ORE}`]: { cut: 3, exit: 'down' } } });
  const ins = a.lines.filter(l => l.side === 'in' && l.item === ORE);
  assert.deepEqual(ins.map(l => l.machines), [3, 3, 1]);
  assert.deepEqual(ins.map(l => l.rate), [105, 105, 35]);
  assert.ok(ins.every(l => l.exit === 'down'));
  assert.equal(a.pieces.lifts, 3);
  assert.equal(a.pieces.splitters, 2 + 2 + 0);
  assert.equal(a.pieces.mergers, 6);
  const lf = lifts(a);
  assert.equal(lf.length, 3);
  assert.ok(lf.every(p => p.w === 2 && p.h === 2 && !p.above));
  // O elevador fica no ponto da linha, que também é a âncora.
  ins.forEach((l, k) => {
    assert.deepEqual([lf[k].x + 1, lf[k].y + 1], l.at);
    assert.ok(a.geo.ins.some(p => p.x === l.at[0] && p.y === l.at[1] && p.item === ORE));
  });
  assert.deepEqual(ins.map(l => l.at[0]), [0, 30, 60], 'entra pelo começo de cada trecho');
  assert.deepEqual(a.area, arrange(s, data, undefined).area, 'elevador não entra na área');

  const up = arrange(s, data, { kind: 'simple', belts: { [`out:${INGOT}`]: { exit: 'up' } } });
  assert.deepEqual(arrangementLines(up, 'out', INGOT), [7]);
  assert.equal(up.lines.find(l => l.side === 'out')!.at[0], 70, 'sai no fim do trecho');
  assert.ok(lifts(up)[0].above);

  const end = arrange(s, data, { kind: 'simple', belts: { [`in:${ORE}`]: { cut: 3, exit: 'end' } } });
  assert.deepEqual(arrangementLines(end, 'in', ORE), [7]);
  assert.equal(end.pieces.lifts, 0);
  assert.deepEqual(end.geo, arrange(s, data, undefined).geo);

  const one = arrange(s, data, { kind: 'simple', belts: { [`out:${INGOT}`]: { cut: 1, exit: 'down' } } });
  assert.deepEqual(arrangementLines(one, 'out', INGOT), [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(one.pieces.mergers, 0); assert.equal(one.pieces.lifts, 7);

  const big = arrange(s, data, { kind: 'simple', belts: { [`out:${INGOT}`]: { cut: 50, exit: 'down' } } });
  assert.deepEqual(arrangementLines(big, 'out', INGOT), [7]);

  // Corte em cada fileira de 42 (6 × 7): 3, 3, 1 por fileira.
  const all = arrange(st(42), data, { kind: 'backToBack', belts: { [`in:${ORE}`]: { cut: 3, exit: 'down' } } });
  assert.deepEqual(arrangementLines(all, 'in', ORE), Array(6).fill([3, 3, 1]).flat());
  assert.equal(all.pieces.lifts, 18);
});

test('corte num cano é ignorado com cutPipe; chave de item fora da receita é ignorada', () => {
  const a = arrange(st(7), data, { kind: 'simple', belts: { [`in:${WATER}`]: { cut: 2, exit: 'down' }, 'out:Desc_Nope_C': { cut: 1, exit: 'down' } } });
  assert.deepEqual(arrangementLines(a, 'in', WATER), [7]);
  assert.equal(a.pieces.lifts, 0);
  assert.deepEqual(a.warnings, [{ kind: 'cutPipe', item: WATER }]);
  assert.equal(a.lines.find(l => l.item === WATER)!.fluid, true);
});

test('aviso over: tier forçado pequeno dá o conserto (tier e corte)', () => {
  const a = arrange(st(42, { tiers: { [`in:${ORE}`]: 'Mk1' } }), data, undefined);
  assert.deepEqual(a.warnings, [{ kind: 'over', side: 'in', item: ORE, rate: 245, cap: 60, fixTier: 'Mk3', fixCut: 1 }]);
  const l = a.lines.find(x => x.item === ORE)!;
  assert.equal(l.tier, 'Mk1'); assert.equal(l.cap, 60);
  // Cortando a cada 1 (sai por baixo) o aviso some.
  const ok = arrange(st(42, { tiers: { [`in:${ORE}`]: 'Mk1' } }), data, { kind: 'simple', belts: { [`in:${ORE}`]: { cut: 1, exit: 'down' } } });
  assert.deepEqual(ok.warnings, []);
  // Saída de 455 em Mk1: fixCut nunca abaixo de 1.
  const o = arrange(st(42, { tiers: { [`out:${INGOT}`]: 'Mk1' } }), data, undefined);
  assert.deepEqual(o.warnings, [{ kind: 'over', side: 'out', item: INGOT, rate: 455, cap: 60, fixTier: 'Mk4', fixCut: 1 }]);
});

test('0 máquinas: arranjo vazio, sem NaN', () => {
  for (const kind of ['simple', 'backToBack', 'center'] as const) {
    const a = arrange(st(0), data, { kind, rows: { 0: { flip: true } }, belts: { [`out:${INGOT}`]: { cut: 3, exit: 'down' } } });
    assert.deepEqual(a.rows, []); assert.deepEqual(a.lines, []);
    assert.deepEqual(a.area, { w: 0, d: 0 });
    assert.deepEqual(a.pieces, { splitters: 0, mergers: 0, lifts: 0 });
    assert.equal(a.geo.w, 0); assert.equal(a.geo.h, 0);
    assert.ok(!/null|NaN/.test(JSON.stringify(a)));
  }
});

// ---- arrange: center (Mergers no meio), linha compartilhada e junções ----

const outLines = (a: Arrangement, item = INGOT) => a.lines.filter(l => l.side === 'out' && l.item === item);

test('center: a fábrica do dono (42 Pure Iron, 2 pares, 6 saídas de 455 descendo)', () => {
  const a = arrange(st(42), data, { kind: 'center' });
  assert.equal(a.kind, 'center');
  assert.deepEqual(a.rows.map(r => r.machines), [11, 10, 11, 10]);
  assert.deepEqual(a.rows.map(r => r.flip), [false, true, false, true]);
  assert.deepEqual(a.rows.map(r => r.mirror), [false, false, true, true], 'par da direita alimentado pela direita');
  assert.equal(recommendedPerRow(st(42), data, 'center'), 11);
  assert.deepEqual(arrangementLines(a, 'out', INGOT), [7, 7, 7, 7, 7, 7]);
  assert.ok(outLines(a).every(l => l.rate === 455 && l.exit === 'down' && l.tier === 'Mk4' && l.cap === 480));
  assert.deepEqual(outLines(a).map(l => l.rows), [[0, 1], [0, 1], [0, 1], [2, 3], [2, 3], [2, 3]]);
  assert.equal(a.pieces.lifts, 6);
  // Minério pelas pontas de fora: par esquerdo em x = 0, direito em x = w.
  const ore = a.lines.filter(l => l.item === ORE);
  assert.deepEqual(ore.map(l => l.machines), [11, 10, 11, 10]);
  assert.ok(ore.every(l => l.exit === 'end' && l.rows.length === 1));
  assert.deepEqual(ore.map(l => l.at[0]), [0, 0, a.geo.w, a.geo.w]);
  // Água: 4 canos, sem corte, pela mesma ponta do minério.
  const water = a.lines.filter(l => l.item === WATER);
  assert.deepEqual(water.map(l => l.machines), [11, 10, 11, 10]);
  assert.ok(water.every(l => l.fluid && l.exit === 'end'));
  assert.deepEqual(water.map(l => l.at[0]), [0, 0, a.geo.w, a.geo.w]);
  // Mergers da linha compartilhada, por par (colunas de 10 m a partir da ponta de fora, de cima para baixo):
  //   trecho 1: colunas 0-2 (6) + a de cima da 3 (7) → 4 colunas, a primeira dá 2 → 4 Mergers;
  //   trecho 2: a de baixo da 3 + colunas 4-6 (7) → 4 colunas, a primeira dá 1 (inicia a esteira) → 3 Mergers;
  //   trecho 3: colunas 7-9 (6) + a 10, só em cima (7) → 4 colunas, a primeira dá 2 → 4 Mergers.
  //   4 + 3 + 4 = 11 por par, × 2 pares = 22.
  assert.equal(a.pieces.mergers, 22);
  assert.equal(a.geo.pieces.filter(p => p.kind === 'merger').length, 22);
  // Splitters: o minério continua por fileira, k−1: 10 + 9 + 10 + 9.
  assert.equal(a.pieces.splitters, 38);
  // Elevadores no fim de cada trecho: o corte no meio da coluna 3 fica no meio dela (35 m).
  const w = a.geo.w;   // 2 × 110 + 4 do vão entre os pares
  assert.equal(w, 224);
  assert.deepEqual(outLines(a).map(l => l.at[0]), [35, 70, 110, w - 35, w - 70, w - 110]);
  lifts(a).forEach((p, k) => assert.deepEqual([p.x + 1, p.y + 1], outLines(a)[k].at));
  // A linha passa no corredor, entre as máquinas de cima e as de baixo.
  const m = machinesOf(a), top = m[0], bot = m[11];
  const cy = outLines(a)[0].at[1];
  assert.ok(top.y + top.h < cy && cy < bot.y);
  assert.equal(a.geo.outs.length, 6);
  assert.deepEqual(a.warnings, []);
  assert.deepEqual(a.area, { w: Math.ceil(a.geo.w / 8) * 8, d: Math.ceil(a.geo.h / 8) * 8 });
});

test('center: saída pela ponta avisa centerEnd; corte 8 estoura com o conserto 7', () => {
  const end = arrange(st(42), data, { kind: 'center', belts: { [`out:${INGOT}`]: { exit: 'end' } } });
  assert.ok(end.warnings.some(w => w.kind === 'centerEnd' && w.item === INGOT));
  assert.deepEqual(arrangementLines(end, 'out', INGOT), [21, 21]);
  assert.equal(end.pieces.lifts, 0);

  const c8 = arrange(st(42), data, { kind: 'center', belts: { [`out:${INGOT}`]: { cut: 8 } } });
  assert.deepEqual(arrangementLines(c8, 'out', INGOT), [8, 8, 5, 8, 8, 5]);
  assert.deepEqual(c8.warnings, [{ kind: 'over', side: 'out', item: INGOT, rate: 520, cap: 480, fixTier: 'Mk5', fixCut: 7 }]);
});

test('center com invert: a entrada principal no corredor, saídas por fileira', () => {
  const a = arrange(st(42), data, { kind: 'center', invert: true });
  assert.deepEqual(a.rows.map(r => r.flip), [true, false, true, false]);
  // Minério: 35/min, corte padrão floor(480 / 35) = 13 → 21 por par = 13 + 8.
  assert.deepEqual(arrangementLines(a, 'in', ORE), [13, 8, 13, 8]);
  assert.ok(a.lines.filter(l => l.item === ORE).every(l => l.exit === 'down' && l.rows.length === 2));
  assert.deepEqual(arrangementLines(a, 'out', INGOT), [11, 10, 11, 10]);
  const m = machinesOf(a), top = m[0], bot = m[11];
  const cy = a.lines.find(l => l.item === ORE)!.at[1];
  assert.ok(top.y + top.h < cy && cy < bot.y, 'minério no corredor');
  assert.ok(belt(a, 'out', INGOT, 0).pts[0][1] < top.y, 'saída de cima por fora');
  // Entrada: o elevador fica no começo do trecho (ponta de fora).
  assert.equal(a.lines.find(l => l.item === ORE)!.at[0], 0);
  assert.equal(a.pieces.splitters, 2 * (7 + 4));   // 13: colunas 0-5 + a de cima da 6 → 7; 8: a de baixo da 6 + 7-9 + a 10 → 5 − 1
  assert.deepEqual(a.warnings, []);
});

test('center com subproduto: a saída principal compartilhada, o subproduto por fileira', () => {
  const RUBBER = 'Desc_Rubber_C', HOR = 'Desc_HeavyOilResidue_C', OIL = 'Desc_LiquidOil_C';
  const s: Stage = { id: 'r', recipe: 'Recipe_Rubber_C', machines: 40, clock: 100, perRow: null, tiers: {} };
  const a = arrange(s, data, { kind: 'center' });
  // Sem entrada sólida: o petróleo (30/min, cano Mk2 600) decide: 2 fileiras de 20 cabem.
  assert.deepEqual(a.rows.map(r => r.machines), [20, 20]);
  assert.deepEqual(arrangementLines(a, 'out', RUBBER), [24, 16]);   // 20/min: corte floor(480 / 20) = 24
  assert.deepEqual(arrangementLines(a, 'out', HOR), [20, 20]);
  assert.ok(a.lines.filter(l => l.item === HOR).every(l => l.fluid && l.exit === 'end' && l.rows.length === 1));
  assert.deepEqual(arrangementLines(a, 'in', OIL), [20, 20]);
  assert.deepEqual(a.warnings, []);
  // A borracha passa no meio do corredor, com o resíduo de cada fileira entre ela e as máquinas.
  const ry = a.lines.find(l => l.item === RUBBER)!.at[1];
  const [h0, h1] = a.geo.belts.filter(b => b.item === HOR).map(b => b.pts[0][1]);
  assert.ok(h0 < ry && ry < h1);
});

test('joins no simple: fileiras coladas dividem a esteira; avisos badJoin, over e merger3', () => {
  const s = st(6, { perRow: 3 });
  const a = arrange(s, data, { kind: 'simple', rows: { 1: { flip: true } }, joins: [`out:${INGOT}@0`] });
  assert.deepEqual(arrangementLines(a, 'out', INGOT), [6]);
  assert.deepEqual(outLines(a)[0].rows, [0, 1]);
  assert.equal(outLines(a)[0].rate, 390);
  assert.equal(a.pieces.mergers, 3);   // 3 colunas de 2: um Merger por coluna
  assert.equal(a.pieces.splitters, 4);
  assert.deepEqual(a.warnings, []);
  const m = machinesOf(a), cy = outLines(a)[0].at[1];
  assert.ok(m[0].y + m[0].h < cy && cy < m[3].y);
  assert.ok(a.geo.h < arrange(s, data, { kind: 'simple', rows: { 1: { flip: true } } }).geo.h, 'uma faixa a menos');

  // Não coladas (as duas com a saída embaixo) e fileira que não existe: badJoin, ignoradas.
  const bad = arrange(s, data, { kind: 'simple', joins: [`out:${INGOT}@0`, `out:${INGOT}@7`, `in:${WATER}@0`] });
  assert.deepEqual(arrangementLines(bad, 'out', INGOT), [3, 3]);
  assert.deepEqual(bad.warnings, [
    { kind: 'badJoin', key: `out:${INGOT}@0` }, { kind: 'badJoin', key: `out:${INGOT}@7` }, { kind: 'badJoin', key: `in:${WATER}@0` },
  ]);
  assert.deepEqual(bad.geo, arrange(s, data, { kind: 'simple' }).geo);

  // Juntar 7 + 7: 910 > 480.
  const big = arrange(st(14), data, { kind: 'simple', rows: { 1: { flip: true } }, joins: [`out:${INGOT}@0`] });
  assert.deepEqual(arrangementLines(big, 'out', INGOT), [14]);
  assert.deepEqual(big.warnings, [{ kind: 'over', side: 'out', item: INGOT, rate: 910, cap: 480, fixTier: 'Mk6', fixCut: 7 }]);
  // Cortando a linha juntada (sai por baixo) volta a caber.
  const cut = arrange(st(14), data, { kind: 'simple', rows: { 1: { flip: true } }, joins: [`out:${INGOT}@0`], belts: { [`out:${INGOT}`]: { cut: 7, exit: 'down' } } });
  assert.deepEqual(arrangementLines(cut, 'out', INGOT), [7, 7]);
  assert.deepEqual(cut.warnings, []);

  // A 1 já divide com a 0; juntar também com a 2 poria 3 fileiras na linha (Merger com 4 entradas).
  const three = arrange(st(9, { perRow: 3 }), data, { kind: 'simple', rows: { 1: { flip: true } }, joins: [`out:${INGOT}@0`, `out:${INGOT}@1`] });
  assert.deepEqual(arrangementLines(three, 'out', INGOT), [6, 3]);
  assert.deepEqual(three.warnings, [{ kind: 'merger3', item: INGOT }]);
});

test('joins no backToBack: o par junta as saídas do corredor', () => {
  const a = arrange(st(14), data, { kind: 'backToBack', joins: [`out:${INGOT}@0`], belts: { [`out:${INGOT}`]: { cut: 7, exit: 'down' } } });
  assert.deepEqual(arrangementLines(a, 'out', INGOT), [7, 7]);
  assert.ok(outLines(a).every(l => l.rows.length === 2));
  // 7 + 7 cortado em 7: colunas 0-2 + a de cima da 3 → 4 Mergers; a de baixo da 3 + 4-6 → 3.
  assert.equal(a.pieces.mergers, 7);
  assert.deepEqual(a.warnings, []);
});

test('center órfão: salvo com 42, a etapa recalculada para 20 máquinas', () => {
  const layout: Layout = {
    kind: 'center', rows: { 3: { flip: true }, 2: { dx: 8 } },
    belts: { [`out:${INGOT}`]: { cut: 7, exit: 'down' } }, joins: [`out:${INGOT}@2`],
  };
  const a = arrange(st(20), data, layout);
  assert.deepEqual(a.rows.map(r => r.machines), [10, 10]);
  assert.deepEqual(arrangementLines(a, 'out', INGOT), [7, 7, 6]);
  assert.deepEqual(a.warnings, [{ kind: 'badJoin', key: `out:${INGOT}@2` }]);
  assert.ok(!/null|NaN/.test(JSON.stringify(a)));
  // 1 máquina: só a fileira de cima.
  const one = arrange(st(1), data, layout);
  assert.deepEqual(one.rows.map(r => r.machines), [1]);
  assert.deepEqual(arrangementLines(one, 'out', INGOT), [1]);
  assert.ok(!/null|NaN/.test(JSON.stringify(one)));
});
