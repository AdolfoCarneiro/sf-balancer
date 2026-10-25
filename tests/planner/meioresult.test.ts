import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData } from '../../src/planner/model/types.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { addBlock, connect, meiosOf, setCollect, setLimits, setPerRow } from '../../src/planner/model/factory.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { meioFor, meioHash, meioSummary } from '../../src/planner/model/meio.ts';
import { DIRECT_KEY, cacheKey, chosenAlt, chosenGeo, evict, litePlan, meioResult, splitCached, type MeioResult } from '../../src/planner/model/meioresult.ts';
import { setLang } from '../../src/i18n/index.js';

const data = game as GameData;
// O exemplo com a sobra de ferro coletada (refinaria cheia, caso 1 com sink).
const ex = setCollect(exampleFactory(data), data, 's1', 'Desc_IronIngot_C', true);
const fx = solveFactory(ex, data);
const inLang = <T>(l: string, f: () => T): T => { setLang(l); try { return f(); } finally { setLang('pt'); } };
const meioDoExemplo = (linkId: string, f: Factory = ex) => meioFor(f, linkId);
const result = (linkId: string, f: Factory = ex) => meioResult(meioFor(f, linkId), f, solveFactory(f, data), data);
const keysOf = (f: Factory, lang = 'pt') => { const flow = solveFactory(f, data); return new Map(meiosOf(f).map(m => [m.id, cacheKey(m, f, flow, data, lang)])); };

test('meioResult: plano leve clonável e uma geometria por montagem', () => {
  const r = result('l1');
  assert.doesNotThrow(() => structuredClone(r));
  assert.ok(r.plan.alternatives.length > 1);
  assert.deepEqual(Object.keys(r.geos).sort(), r.plan.alternatives.map(a => a.key).sort());
  assert.equal(r.id, meioDoExemplo('l1').id);
  assert.equal(r.key, cacheKey(meioDoExemplo('l1'), ex, fx, data, 'pt'));
  // Só os campos declarados: nada de g/view/sim.
  const a = r.plan.alternatives[0] as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(a).sort(), ['caseLabel', 'key', 'pieces', 'sinkRate', 'title', 'warnings']);
  assert.equal(r.plan.supply, 2730); assert.equal(r.plan.demand, 2400);
  assert.deepEqual(litePlan(r.plan), r.plan);
});

test('cacheKey muda com o idioma e com o bloco, não com a posição no mapa', () => {
  const me = meioDoExemplo('l1'), k = cacheKey(me, ex, fx, data, 'pt');
  assert.equal(k, `pt|${me.id}|` + meioHash(me, ex, fx, data));
  assert.notEqual(cacheKey(me, ex, fx, data, 'en'), k);
  const moved: Factory = { ...ex, map: { s1: { x: 10, y: 20, rot: 1 } } };
  assert.equal(cacheKey(meioDoExemplo('l1', moved), moved, fx, data, 'pt'), k);
  const more = setLimits(ex, 's1', { machines: 41 });
  assert.notEqual(cacheKey(meioDoExemplo('l1', more), more, solveFactory(more, data), data, 'pt'), k);
  // Mesmo hash em outro meio (outros blocos) não divide a entrada do cache.
  const other = { ...me, id: 'Desc_IronIngot_C:s9>s8', producers: ['s9'], consumers: ['s8'] };
  const two: Factory = { ...ex, blocks: [...ex.blocks, { ...ex.blocks[0], id: 's9' }, { ...ex.blocks[1], id: 's8' }] };
  const flow2 = { ...fx, blocks: { ...fx.blocks, s9: { ...fx.blocks.s1, id: 's9' }, s8: { ...fx.blocks.s2, id: 's8' } }, links: { ...fx.links } };
  assert.notEqual(cacheKey(other, two, flow2, data, 'pt'), k);
});

test('splitCached: só o que mudou vai para o cálculo', () => {
  const cache = new Map<string, MeioResult>();
  for (const m of meiosOf(ex)) { const r = meioResult(m, ex, fx, data); cache.set(r.key, r); }
  const all = splitCached(keysOf(ex), cache);
  assert.equal(all.missing.length, 0); assert.equal(all.ready.size, 2);
  // Vigas em fileiras de 4: só o aço muda (o fluxo é o mesmo).
  const f = setPerRow(ex, 's3', 4);
  const part = splitCached(keysOf(f), cache);
  const steel = meiosOf(f).find(m => m.item === 'Desc_SteelIngot_C')!;
  assert.deepEqual(part.missing, [steel.id]);
  assert.deepEqual([...part.ready.keys()], [meioDoExemplo('l1', f).id]);
});

test('montagem escolhida que sumiu volta para a primeira', () => {
  const { plan } = result('l1');
  assert.equal(chosenAlt(plan, 'nao-existe'), plan.alternatives[0].key);
  assert.equal(chosenAlt(plan, undefined), plan.alternatives[0].key);
  assert.equal(chosenAlt(plan, plan.alternatives[1].key), plan.alternatives[1].key);
  assert.equal(chosenAlt({ ...plan, alternatives: [] }, 'x'), null);
});

test('meioSummary usa a montagem escolhida', () => {
  const { plan } = result('l1');
  const i = plan.alternatives.findIndex(a => a.pieces.splitters !== plan.alternatives[0].pieces.splitters || a.caseLabel !== plan.alternatives[0].caseLabel);
  const a = plan.alternatives[i > 0 ? i : 1];
  const sum = meioSummary(plan, a.key);
  assert.equal(sum.caseLabel, a.caseLabel);
  // Sem geometria (meio grande demais, por exemplo): as contas do plano.
  assert.deepEqual(sum.pieces, { splitters: a.pieces.splitters, mergers: a.pieces.mergers, smart: a.pieces.smart, sinks: a.sinkRate > 1e-6 ? 1 : 0, junctions: a.pieces.junctions });
  assert.deepEqual(meioSummary(plan, 'sumiu'), meioSummary(plan));
});

test('meioSummary conta as peças da geometria que o mapa desenha (com a cascata e os sinks)', () => {
  const r = result('l1');
  const key = 'doadora-1-sink-sem-represa', a = r.plan.alternatives.find(x => x.key === key)!;
  const g = r.geos[key], n = (k: string) => g.pieces.filter(p => p.kind === k).length;
  const sum = meioSummary(r.plan, key, r.geos);
  assert.deepEqual(sum.pieces, { splitters: n('splitter'), mergers: n('merger'), smart: n('smart'), sinks: n('sink'), junctions: n('junction') });
  // A cascata de Mergers da sobra entra na conta (o plano não a conta).
  assert.equal(sum.pieces.mergers, a.pieces.mergers + 3);
  // Montagem sem geometria no resultado: volta para as contas do plano.
  assert.deepEqual(meioSummary(r.plan, key, {}).pieces.mergers, a.pieces.mergers);
});

test('idioma novo: rótulo do caso vem traduzido', () => {
  const pt = result('l1');
  const en = inLang('en', () => result('l1'));
  assert.notEqual(en.plan.alternatives[0].caseLabel, pt.plan.alternatives[0].caseLabel);
  assert.ok(en.key.startsWith('en|'));
});

test('cacheKey muda com o vão entre peças do meio; o resultado usa o vão da fábrica', () => {
  const me = meioDoExemplo('l1');
  const k = cacheKey(me, ex, fx, data, 'pt'), wide: Factory = { ...ex, mapGap: 6 };
  assert.notEqual(cacheKey(me, wide, fx, data, 'pt'), k);
  assert.equal(cacheKey(me, { ...ex, mapGap: 2 }, fx, data, 'pt'), k);   // 2 é o padrão
  const a = meioResult(me, ex, fx, data), b = meioResult(me, wide, fx, data);
  const key = a.plan.alternatives[0].key;
  assert.ok(b.geos[key].w > a.geos[key].w);
});

test('cache cheio: sai primeiro o que ninguém mostra; o que está na tela nunca sai', () => {
  const r = (key: string) => ({ id: key, key } as unknown as MeioResult);
  const cache = new Map<string, MeioResult>();
  for (const k of ['a', 'b', 'c', 'd']) cache.set(k, r(k));
  evict(cache, 2, new Set(['a', 'b']));
  assert.deepEqual([...cache.keys()], ['a', 'b']);
  // Tudo na tela e acima do limite: fica tudo (tirar um faria recalcular sem fim).
  cache.set('e', r('e'));
  evict(cache, 2, new Set(['a', 'b', 'e']));
  assert.deepEqual([...cache.keys()], ['a', 'b', 'e']);
  // Sem nada na tela: os mais antigos saem.
  evict(cache, 1, new Set());
  assert.deepEqual([...cache.keys()], ['e']);
});

test('chosenGeo: a montagem escolhida, a do meio direto, nada sem limite', () => {
  const r = result('l1');
  assert.equal(chosenGeo(r, undefined), r.geos[r.plan.alternatives[0].key]);
  assert.equal(chosenGeo(r, r.plan.alternatives[1].key), r.geos[r.plan.alternatives[1].key]);
  let f = addBlock(ex, data, { kind: 'container' }, [0, 0]);
  f = connect(f, data, 's3', 's5', 'Desc_SteelPlate_C');
  const d = result(meiosOf(f).find(m => m.item === 'Desc_SteelPlate_C')!.links[0], f);
  assert.equal(d.plan.direct, true);
  assert.deepEqual(Object.keys(d.geos), [DIRECT_KEY]);
  assert.equal(chosenGeo(d, 'qualquer'), d.geos[DIRECT_KEY]);
  const free = setLimits(setLimits(setLimits(setLimits(ex, 's1', null), 's2', null), 's3', null), 's4', null);
  const u = result('l1', free);
  assert.equal(u.plan.unbounded, true);
  assert.ok(u.key.endsWith('|u'));
  assert.equal(chosenGeo(u, undefined), null);
});
