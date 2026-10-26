import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, Layout, Stage } from '../../src/planner/model/types.ts';
import { arrange, cleanLayout } from '../../src/planner/model/layout.ts';
import {
  fixCut, hasEdits, joinState, moveRow, normLayout, warningFixes, resetModel, resetRowPlace, setBelt, setEven, setInvert, setKind, toggleJoin, toggleRow,
} from '../../src/planner/model/layoutedit.ts';
import { type History, exampleFactory, reduce } from '../../src/planner/model/factorystate.ts';
import { historyNew } from '../../src/logic/index.js';

const data = game as GameData;
const PURE = 'Recipe_Alternate_PureIronIngot_C', ORE = 'in:Desc_OreIron_C', INGOT = 'out:Desc_IronIngot_C';
const st = (machines: number): Stage => ({ id: 's', recipe: PURE, machines, clock: 100, perRow: null, tiers: {} });

test('normLayout e trocar de modelo: simples sem nada = null; trocar zera os ajustes', () => {
  assert.equal(normLayout({ kind: 'simple', rows: {}, belts: {}, joins: [] }), null);
  assert.equal(normLayout({ kind: 'simple', invert: true }), null);
  assert.deepEqual(normLayout({ kind: 'center', rows: { 1: {} } }), { kind: 'center' });
  assert.equal(setKind('simple'), null);
  assert.deepEqual(setKind('center'), { kind: 'center' });
  const full: Layout = { kind: 'backToBack', rows: { 0: { flip: true } }, belts: { [INGOT]: { cut: 3, exit: 'down' } }, joins: [`${INGOT}@0`] };
  assert.ok(hasEdits(full));
  assert.deepEqual(setInvert(full, true), { kind: 'backToBack', invert: true });
  assert.deepEqual(resetModel({ ...full, invert: true }), { kind: 'backToBack', invert: true });
  assert.equal(resetModel({ kind: 'simple', rows: { 2: { mirror: true } } }), null);
  assert.ok(!hasEdits(resetModel(full) ?? undefined));
});

test('fileira: virar e espelhar alternam; mover em 8 m tira as junções dela', () => {
  const a = toggleRow(undefined, 2, 'flip');
  assert.deepEqual(a, { kind: 'simple', rows: { 2: { flip: true } } });
  assert.equal(toggleRow(a!, 2, 'flip'), null);
  assert.deepEqual(toggleRow({ kind: 'center' }, 0, 'mirror'), { kind: 'center', rows: { 0: { mirror: true } } });
  const joined: Layout = { kind: 'simple', joins: [`${INGOT}@0`, `${INGOT}@1`, `${INGOT}@2`, `${ORE}@3`] };
  const m = moveRow(joined, 2, 8, 0)!;
  assert.deepEqual(m.rows, { 2: { dx: 8 } });
  assert.deepEqual(m.joins, [`${INGOT}@0`, `${ORE}@3`], 'sai a @1 (cima com ela) e a @2 (ela com a de baixo)');
  assert.deepEqual(moveRow(m, 2, 3, -10)!.rows, { 2: { dx: 8, dy: -8 } }, 'arredonda na grade de 8 m');
  assert.deepEqual(moveRow({ kind: 'simple', rows: { 0: { dx: 8 } } }, 0, -8, 0), null);
  assert.deepEqual(moveRow({ kind: 'simple', rows: { 0: { dx: 800 } } }, 0, 8, 0)!.rows, { 0: { dx: 800 } }, 'limite de 800 m');
  assert.deepEqual(resetRowPlace({ kind: 'center', rows: { 1: { dx: 8, dy: 16, flip: true } } }, 1), { kind: 'center', rows: { 1: { flip: true } } });
});

test('esteira: corte e saída; null volta ao padrão; fixCut faz descer quem sai pela ponta', () => {
  const a = setBelt(undefined, INGOT, { exit: 'down' });
  assert.deepEqual(a, { kind: 'simple', belts: { [INGOT]: { exit: 'down' } } });
  const b = setBelt(a!, INGOT, { cut: 4 });
  assert.deepEqual(b!.belts, { [INGOT]: { exit: 'down', cut: 4 } });
  assert.equal(setBelt(setBelt(b!, INGOT, { cut: null })!, INGOT, { exit: null }), null);
  assert.deepEqual(fixCut({ kind: 'simple' }, INGOT, 7, 'end')!.belts, { [INGOT]: { cut: 7, exit: 'down' } });
  assert.deepEqual(fixCut({ kind: 'center' }, INGOT, 6, 'up')!.belts, { [INGOT]: { cut: 6 } });
});

test('juntar: só fileiras viradas uma para a outra, sem deslocamento, fora do center', () => {
  const lay: Layout = { kind: 'backToBack' };
  const arr = arrange(st(42), data, lay);
  assert.equal(joinState(arr, lay, INGOT, 0), 'can', 'par 0-1: as saídas no corredor');
  assert.equal(joinState(arr, lay, INGOT, 1), null, 'fileira 1 e 2 se dão as costas');
  assert.equal(joinState(arr, lay, ORE, 0), null, 'as entradas ficam por fora');
  assert.equal(joinState(arr, lay, INGOT, 5), null, 'não há fileira 6');
  const j = toggleJoin(lay, `${INGOT}@0`)!;
  assert.deepEqual(j.joins, [`${INGOT}@0`]);
  assert.equal(joinState(arrange(st(42), data, j), j, INGOT, 0), 'joined');
  assert.deepEqual(toggleJoin(j, `${INGOT}@0`), { kind: 'backToBack' });
  const moved = moveRow(lay, 1, 0, 8)!;
  assert.equal(joinState(arrange(st(42), data, moved), moved, INGOT, 0), null, 'fileira deslocada não junta');
  const c: Layout = { kind: 'center' };
  assert.equal(joinState(arrange(st(42), data, c), c, INGOT, 0), null);
  // Junção que vira linha compartilhada: uma linha só para as duas fileiras.
  assert.equal(arrange(st(42), data, j).lines.filter(l => l.side === 'out' && l.rows.includes(0)).length, 1);
});

test('linhas e esteiras do desenho andam juntas (o clique na esteira acha a linha)', () => {
  for (const lay of [undefined, { kind: 'center' }, { kind: 'backToBack', joins: [`${INGOT}@0`] }, { kind: 'simple', belts: { [INGOT]: { cut: 3, exit: 'up' } } }] as (Layout | undefined)[]) {
    const a = arrange(st(42), data, lay);
    assert.equal(a.geo.belts.length, a.lines.length);
    a.lines.forEach((l, i) => { assert.equal(a.geo.belts[i].item, l.item); assert.equal(a.geo.belts[i].role, l.side); });
  }
});

test('fileiras trazem a faixa (w, h) dentro do desenho', () => {
  const a = arrange(st(42), data, { kind: 'center' });
  for (const r of a.rows) {
    assert.ok(r.w > 0 && r.h > 0);
    assert.ok(r.x + r.w <= a.geo.w + 1e-9 && r.y + r.h <= a.geo.h + 1e-9);
  }
});

test('avisos → consertos: tier e corte; cano sem tier reduz por fileira (fora do center); centerEnd, cutPipe, badJoin', () => {
  const WATER = 'Desc_Water_C';
  const fx = (s: Stage) => { const a = arrange(s, data, s.layout); return a.warnings.map(w => ({ w, f: warningFixes(w, s, a) })); };
  // Sólido: 14 por fileira = 910 > 480 (Mk4 escolhida) → Mk6 ou fechar a cada 7 (descendo).
  const ing = fx({ ...st(42), perRow: 14, tiers: { [INGOT]: 'Mk4' } }).find(x => x.w.kind === 'over' && x.w.item === 'Desc_IronIngot_C')!;
  assert.deepEqual(ing.f, [
    { kind: 'tier', tier: 'Mk6', action: { type: 'setTier', id: 's', side: 'outs', item: 'Desc_IronIngot_C', tier: 'Mk6' } },
    { kind: 'cut', n: 7, action: { type: 'setLayout', id: 's', layout: { kind: 'simple', belts: { [INGOT]: { cut: 7, exit: 'down' } } } } },
  ]);
  // Água: 31 × 20 = 620 > 600 (Pipeline Mk2), sem cano maior → reduzir para 30 por fileira.
  const water = fx({ ...st(62), perRow: 31 }).find(x => x.w.kind === 'over' && x.w.item === WATER)!;
  assert.deepEqual(water.f, [{ kind: 'perRow', n: 30, action: { type: 'setPerRow', id: 's', perRow: 30 } }]);
  // No center o modelo divide as máquinas: sem conserto por fileira.
  const c: Stage = { ...st(68), tiers: { [ORE]: 'Mk6' }, layout: { kind: 'center' } };
  const cw = fx(c).filter(x => x.w.kind === 'over' && x.w.item === WATER);
  assert.equal(cw.length, 1);
  assert.deepEqual(cw[0].f, []);
  const end: Stage = { ...st(42), layout: { kind: 'center', belts: { [INGOT]: { exit: 'end' } } } };
  assert.deepEqual(fx(end).find(x => x.w.kind === 'centerEnd')!.f,
    [{ kind: 'down', action: { type: 'setLayout', id: 's', layout: { kind: 'center' } } }]);
  // Com corte salvo, o corte fica e a saída volta ao padrão (null, como o "Sai por").
  const endCut: Stage = { ...st(42), layout: { kind: 'center', belts: { [INGOT]: { exit: 'end', cut: 6 } } } };
  assert.deepEqual(fx(endCut).find(x => x.w.kind === 'centerEnd')!.f.map(f => f.action),
    [{ type: 'setLayout', id: 's', layout: { kind: 'center', belts: { [INGOT]: { cut: 6 } } } }]);
  const pipe: Stage = { ...st(42), layout: { kind: 'simple', belts: { [`in:${WATER}`]: { cut: 3, exit: 'down' } } } };
  assert.deepEqual(fx(pipe).find(x => x.w.kind === 'cutPipe')!.f.map(f => f.action),
    [{ type: 'setLayout', id: 's', layout: { kind: 'simple', belts: { [`in:${WATER}`]: { exit: 'down' } } } }]);
  const bj: Stage = { ...st(42), layout: { kind: 'simple', joins: [`${INGOT}@0`] } };
  assert.deepEqual(fx(bj).find(x => x.w.kind === 'badJoin')!.f.map(f => f.kind), ['unjoin']);
  assert.deepEqual(warningFixes({ kind: 'merger3', item: 'x', key: 'out:x@5' }, bj, arrange(bj, data, bj.layout)), []);
  // Juntar a 1 com a 2 quando a 1 já divide com a 0: o conserto tira a junção que sobra.
  const m3: Stage = { ...st(9), perRow: 3, layout: { kind: 'simple', rows: { 1: { flip: true } }, joins: [`${INGOT}@0`, `${INGOT}@1`] } };
  const w3 = fx(m3).find(x => x.w.kind === 'merger3')!;
  assert.deepEqual(w3.w, { kind: 'merger3', item: INGOT.slice(4), key: `${INGOT}@1` });
  assert.deepEqual(w3.f, [{ kind: 'unjoin', action: { type: 'setLayout', id: 's', layout: { kind: 'simple', rows: { 1: { flip: true } }, joins: [`${INGOT}@0`] } } }]);
});

test('um gesto = um passo do desfazer', () => {
  const ex = exampleFactory(data);
  let h: History<Factory> = historyNew(ex);
  h = reduce(h, { type: 'setLayout', id: 's1', layout: setKind('center') }, data);
  h = reduce(h, { type: 'setLayout', id: 's1', layout: moveRow({ kind: 'center' }, 0, 8, 0) }, data);
  assert.equal(h.past.length, 2);
  h = reduce(h, { type: 'undo' }, data);
  const b = h.present.blocks.find(x => x.id === 's1');
  assert.deepEqual(b && b.kind === 'recipe' ? b.layout : null, { kind: 'center' });
});

test('Dividir igual: liga e desliga sem mexer no corte e na saída; desligado some do layout', () => {
  const a = setEven(undefined, INGOT, true);
  assert.deepEqual(a, { kind: 'simple', belts: { [INGOT]: { even: true } } });
  assert.equal(setEven(a!, INGOT, false), null);
  const cut: Layout = { kind: 'center', belts: { [INGOT]: { cut: 6, exit: 'up' } } };
  assert.deepEqual(setEven(cut, INGOT, true), { kind: 'center', belts: { [INGOT]: { cut: 6, exit: 'up', even: true } } });
  assert.deepEqual(setEven(setEven(cut, INGOT, true)!, INGOT, false), cut);
  assert.deepEqual(setEven({ kind: 'center' }, INGOT, false), { kind: 'center' });
});

test('mover com a posição atual: o destino encaixa na grade de 8 m do bloco, e fileiras de alturas diferentes ficam na mesma linha', () => {
  // Fileira simples de Polymer Resin: 14 fileiras a cada 28 m (28 não é múltiplo de 8).
  const stage = { id: 's1', recipe: 'Recipe_Alternate_PolymerResin_C', machines: 42, clock: 100, perRow: null, tiers: {} };
  const rowsOf = (lay: Layout | null) => arrange({ ...stage, ...(lay ? { layout: lay } : {}) }, data, lay ?? undefined).rows;
  const r0 = rowsOf(null);
  assert.deepEqual([r0[1].y, r0[2].y], [28, 56]);
  // Arrasta as duas para a direita da primeira, na altura 0 (o arraste soltou com 3 m de sobra).
  let lay = moveRow(undefined, 1, 40, -25, r0[1]);
  lay = moveRow(lay ?? undefined, 2, 80, -59, rowsOf(lay)[2]);
  const r = rowsOf(lay);
  assert.deepEqual([r[0].y, r[1].y, r[2].y], [0, 0, 0]);
  assert.deepEqual([r[1].x % 8, r[2].x % 8], [0, 0]);
  // Lê de volta o deslocamento que não é múltiplo de 8.
  assert.deepEqual(cleanLayout(JSON.parse(JSON.stringify(lay)))?.rows?.[1], { dx: 40, dy: -28 });
});

test('Mergers no meio: mover uma fileira leva o par junto e a linha de Mergers continua dividida; voltar ao lugar volta as duas', () => {
  const stage = { id: 's1', recipe: 'Recipe_Alternate_PolymerResin_C', machines: 42, clock: 100, perRow: null, tiers: {} };
  const arr = (lay: Layout) => arrange({ ...stage, layout: lay }, data, lay);
  const base: Layout = { kind: 'center' };
  const a0 = arr(base);
  const lay = moveRow(base, 5, 64, 16, a0.rows.find(r => r.index === 5))!;
  // As duas com o mesmo deslocamento (o destino encaixa na grade de 8 m do bloco).
  assert.deepEqual(lay.rows?.[4], lay.rows?.[5]);
  assert.equal(lay.rows?.[5]?.dx, 64);
  const a1 = arr(lay);
  // A mesma quantidade de saídas de Polymer Resin e de Mergers: o par segue com a linha do meio.
  const outs = (a: ReturnType<typeof arr>) => a.lines.filter(l => l.side === 'out' && l.item === 'Desc_PolymerResin_C').length;
  assert.equal(outs(a1), outs(a0));
  assert.equal(a1.pieces.mergers, a0.pieces.mergers);
  assert.ok(!a1.warnings.some(w => w.kind === 'badJoin'));
  // Uma fileira sozinha fora do lugar (estado antigo) e depois colada de volta: a linha volta a ser dividida.
  const alone: Layout = { kind: 'center', rows: { 5: { dy: 16 } } };
  assert.ok(arr(alone).warnings.some(w => w.kind === 'badJoin'));
  assert.equal(outs(arr(resetRowPlace(alone, 5) ?? base)), outs(a0));
  assert.deepEqual(resetRowPlace(lay, 4), { kind: 'center' });
});
