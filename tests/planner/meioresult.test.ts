import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Chain, GameData } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { meioFor, meioHash, meios, meioSummary } from '../../src/planner/model/meio.ts';
import { cacheKey, chosenAlt, litePlan, meioResult, splitCached, type MeioResult } from '../../src/planner/model/meioresult.ts';
import { setLang } from '../../src/i18n/index.js';

const data = game as GameData;
const ex = exampleChain(data);
const inLang = <T>(l: string, f: () => T): T => { setLang(l); try { return f(); } finally { setLang('pt'); } };
const meioDoExemplo = (linkId: string, ch: Chain = ex) => meioFor(ch, data, linkId);
const keysOf = (ch: Chain, lang = 'pt') => new Map(meios(ch, data).map(m => [m.id, cacheKey(m, ch, data, lang)]));

test('meioResult: plano leve clonável e uma geometria por montagem', () => {
  const r = meioResult(meioDoExemplo('l1'), ex, data);
  assert.doesNotThrow(() => structuredClone(r));
  assert.ok(r.plan.alternatives.length > 1);
  assert.deepEqual(Object.keys(r.geos).sort(), r.plan.alternatives.map(a => a.key).sort());
  assert.equal(r.id, meioDoExemplo('l1').id);
  assert.equal(r.key, cacheKey(meioDoExemplo('l1'), ex, data, 'pt'));
  // Só os campos declarados: nada de g/view/sim.
  const a = r.plan.alternatives[0] as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(a).sort(), ['caseLabel', 'key', 'pieces', 'sinkRate', 'title', 'warnings']);
  assert.equal(r.plan.supply, 2730); assert.equal(r.plan.demand, 2400);
  assert.deepEqual(litePlan(r.plan), r.plan);
});

test('cacheKey muda com o idioma e com a etapa, não com a posição no mapa', () => {
  const me = meioDoExemplo('l1'), k = cacheKey(me, ex, data, 'pt');
  assert.equal(k, `pt|${me.id}|` + meioHash(me, ex, data));
  assert.notEqual(cacheKey(me, ex, data, 'en'), k);
  const moved: Chain = { ...ex, stages: ex.stages.map(s => ({ ...s, pos: { x: s.pos.x + 50, y: 99 } })), map: { s1: { x: 10, y: 20, rot: 1 } } };
  assert.equal(cacheKey(meioDoExemplo('l1', moved), moved, data, 'pt'), k);
  const more: Chain = { ...ex, stages: ex.stages.map(s => (s.id === 's1' ? { ...s, machines: 41 } : s)) };
  assert.notEqual(cacheKey(meioDoExemplo('l1', more), more, data, 'pt'), k);
  // Mesmo hash em outro meio (outras etapas) não divide a entrada do cache.
  const other = { ...me, id: 'Desc_IronIngot_C:s9>s8', producers: ['s9'], consumers: ['s8'] };
  assert.notEqual(cacheKey(other, { ...ex, stages: [...ex.stages, { ...ex.stages[0], id: 's9' }, { ...ex.stages[1], id: 's8' }] }, data, 'pt'), k);
});

test('splitCached: só o que mudou vai para o cálculo', () => {
  const cache = new Map<string, MeioResult>();
  for (const m of meios(ex, data)) { const r = meioResult(m, ex, data); cache.set(r.key, r); }
  const all = splitCached(keysOf(ex), cache);
  assert.equal(all.missing.length, 0); assert.equal(all.ready.size, 2);
  const ch: Chain = { ...ex, stages: ex.stages.map(s => (s.id === 's3' ? { ...s, machines: 20 } : s)) };
  const part = splitCached(keysOf(ch), cache);
  const steel = meios(ch, data).find(m => m.item === 'Desc_SteelIngot_C')!;
  assert.deepEqual(part.missing, [steel.id]);
  assert.deepEqual([...part.ready.keys()], [meioDoExemplo('l1', ch).id]);
});

test('montagem escolhida que sumiu volta para a primeira', () => {
  const { plan } = meioResult(meioDoExemplo('l1'), ex, data);
  assert.equal(chosenAlt(plan, 'nao-existe'), plan.alternatives[0].key);
  assert.equal(chosenAlt(plan, undefined), plan.alternatives[0].key);
  assert.equal(chosenAlt(plan, plan.alternatives[1].key), plan.alternatives[1].key);
  assert.equal(chosenAlt({ ...plan, alternatives: [] }, 'x'), null);
});

test('meioSummary usa a montagem escolhida', () => {
  const { plan } = meioResult(meioDoExemplo('l1'), ex, data);
  const i = plan.alternatives.findIndex(a => a.pieces.splitters !== plan.alternatives[0].pieces.splitters || a.caseLabel !== plan.alternatives[0].caseLabel);
  const a = plan.alternatives[i > 0 ? i : 1];
  const sum = meioSummary(plan, a.key);
  assert.equal(sum.caseLabel, a.caseLabel);
  assert.deepEqual(sum.pieces, { splitters: a.pieces.splitters, mergers: a.pieces.mergers, sinks: a.sinkRate > 1e-6 ? 1 : 0 });
  assert.deepEqual(meioSummary(plan, 'sumiu'), meioSummary(plan));
});

test('idioma novo: rótulo do caso vem traduzido', () => {
  const pt = meioResult(meioDoExemplo('l1'), ex, data);
  const en = inLang('en', () => meioResult(meioDoExemplo('l1'), ex, data));
  assert.notEqual(en.plan.alternatives[0].caseLabel, pt.plan.alternatives[0].caseLabel);
  assert.ok(en.key.startsWith('en|'));
});
