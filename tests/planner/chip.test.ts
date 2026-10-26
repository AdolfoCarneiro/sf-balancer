import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Block, Factory, GameData, Link, RecipeBlock } from '../../src/planner/model/types.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { groupLinks } from '../../src/planner/model/meio.ts';
import { meioResult } from '../../src/planner/model/meioresult.ts';
import { chipLabel } from '../../src/planner/model/chip.ts';
import { close } from './fixtures.ts';

const data = game as GameData;
const recipe = (id: string, r: string, machines?: number, perRow: number | null = null): RecipeBlock =>
  ({ id, kind: 'recipe', recipe: r, clock: 100, perRow, tiers: {}, ...(machines ? { limits: { machines } } : {}) });
const link = (id: string, item: string, from: string, to: string): Link => ({ id, item, from, to });
const fac = (blocks: Block[], links: Link[], alts?: Record<string, string>): Factory => ({ v: 2, blocks, links, ...(alts ? { alts } : {}) });
// O chip do único meio da fábrica, com o resultado de verdade.
function chipOf(f: Factory) {
  const flow = solveFactory(f, data), m = groupLinks(f.links)[0];
  return { m, flow, label: chipLabel(m, meioResult(m, f, flow, data), f.alts, flow, data) };
}
const PURE = 'Recipe_Alternate_PureIronIngot_C', STEEL = 'Recipe_Alternate_IngotSteel_1_C', INGOT = 'Desc_IronIngot_C';
// Caso 1 do AGENTS: 42 refinarias × 65 → 60 fundições × 40, 12 fundições por fileira: 6 linhas de 455 → 5 de 480.
const caso1 = (alt?: string): Factory => {
  const f = fac([recipe('s1', PURE, 42), recipe('s2', STEEL, 60, 12)], [link('l1', INGOT, 's1', 's2')]);
  return alt ? { ...f, alts: { [groupLinks(f.links)[0].id]: alt } } : f;
};

test('chip do caso 1: balancer com loop por padrão, sink com a montagem do sink, 6 → 5', () => {
  const a = chipOf(caso1()).label;
  assert.equal(a.kind, 'balancer');
  assert.deepEqual([a.item, a.nS, a.nD, a.short], [INGOT, 6, 5, false]);
  close(a.rate, 2400);
  assert.equal(chipOf(caso1('doadora-1-sink')).label.kind, 'sink');
  // Montagem direta (sem Splitter nem Merger) também é "direto".
  assert.equal(chipOf(caso1('direto')).label.kind, 'direct');
});

test('chip: ligação para bloco de sobra é direta', () => {
  const f = fac([recipe('s1', PURE, 7), { id: 'k1', kind: 'sink' }], [link('l1', INGOT, 's1', 'k1')]);
  const { label } = chipOf(f);
  assert.equal(label.kind, 'direct');
  assert.equal(label.short, false);
});

test('chip: fluido vira cano', () => {
  const f = fac([{ id: 'w1', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: 2 }, recipe('s1', PURE, 7)],
    [link('l1', 'Desc_Water_C', 'w1', 's1')]);
  const { label } = chipOf(f);
  assert.equal(label.kind, 'pipe');
  assert.equal(label.item, 'Desc_Water_C');
});

test('chip: sem resultado ainda é "calculando"; sem limite não tem taxa', () => {
  const f = caso1(), flow = solveFactory(f, data), m = groupLinks(f.links)[0];
  assert.equal(chipLabel(m, null, f.alts, flow, data).kind, 'calc');
  assert.equal(chipLabel(m, undefined, f.alts, flow, data).kind, 'calc');
  // Nenhum bloco com limite: o fluxo é sem limite e o meio também.
  const u = fac([recipe('s1', PURE), recipe('s2', STEEL)], [link('l1', INGOT, 's1', 's2')]);
  const { label } = chipOf(u);
  assert.equal(label.kind, 'unbounded');
  assert.equal(label.rate, null);
});

test('chip: consumidora com falta marca short', () => {
  const f = fac([recipe('s1', PURE, 2), recipe('s2', STEEL, 5)], [link('l1', INGOT, 's1', 's2')]);
  const { label } = chipOf(f);
  assert.equal(label.short, true);
  close(label.rate, 130);
});
