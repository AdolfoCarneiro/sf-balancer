import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Chain, GameData } from '../../src/planner/model/types.ts';
import { exampleChain } from '../../src/planner/model/example.ts';
import { meios, meioFor, meioInput, meioPlan, meioSummary, lineOwner, meioHash, meioUrl, MEIO_MAX_LINES } from '../../src/planner/model/meio.ts';
import { computePlan, decodeShare } from '../../src/logic/index.js';
import { getLang, setLang, parseNum } from '../../src/i18n/index.js';

const data = game as GameData;

test('meio: refinarias → fundições é o caso 1 do AGENTS.md, igual ao computePlan direto', () => {
  const ch = exampleChain(data); const me = meioFor(ch, data, ch.links[0].id); const p = meioPlan(me, ch, data);
  const direct = computePlan({ cap: 480, policy: 'represar', excess: 'represar', conv: 'k-1', medium: 'item',
    srcGroups: [{ driver: 'clock', count: 42, clock: 100, nominal: 65, per: 7 }],
    dstGroups: [{ driver: 'clock', count: 60, clock: 100, nominal: 40, per: 12 }] });
  assert.equal(p.supply, 2730); assert.equal(p.demand, 2400);
  assert.equal(p.alternatives[0].key, direct.alternatives[0].key);
  const sum = meioSummary(p);
  assert.equal(sum.caseLabel, direct.alternatives[0].caseLabel);
  assert.equal(sum.leftover, 330); assert.equal(sum.short, 0);
  assert.equal(me.id, 'Desc_IronIngot_C:s1>s2');
});

test('meio: aço dividido entre vigas e canos é um meio só, em Mk5, com 4 linhas para cada lado', () => {
  const ch = exampleChain(data); const me = meios(ch, data).find(x => x.item === 'Desc_SteelIngot_C')!;
  assert.deepEqual([me.producers, me.consumers], [['s2'], ['s3', 's4']]);
  assert.deepEqual([...me.links].sort(), ['l2', 'l3']);
  assert.equal(meios(ch, data).length, 2);
  assert.equal(meioFor(ch, data, 'l3').id, me.id);
  const p = meioPlan(me, ch, data);
  assert.equal(p.cap, 780); assert.equal(p.supply, 3600); assert.equal(p.demand, 3600);
  const owners = p.dst.lines.map(l => lineOwner(me, 'dst', l));
  assert.equal(owners.filter(o => o === 's3').length, 4); assert.equal(owners.filter(o => o === 's4').length, 4);
  assert.ok(p.src.lines.every(l => lineOwner(me, 'src', l) === 's2'));
});

test('meio: link do meio completo abre com os mesmos números em pt, en e es', () => {
  const c0 = exampleChain(data);
  const ch: Chain = { ...c0, stages: c0.stages.map(s => (s.id === 's1' ? { ...s, clock: 212.5, perRow: 3 } : s)) };
  const hash = meioHash(meioFor(ch, data, ch.links[0].id), ch, data);
  assert.ok(hash.startsWith('#s='));
  const st = decodeShare(hash.slice(3))!;
  assert.equal(st.lang, 'en'); assert.equal(st.src[0].clock, '212.5'); assert.equal(st.src[0].per, '3'); assert.equal(st.belt, 'Mk4');
  assert.deepEqual(st.dst[0], { driver: 'clock', count: '60', clock: '100', nominal: '40', total: '', per: '12' });
  assert.equal(st.medium, 'item'); assert.equal(st.item, data.items['Desc_IronIngot_C'].name);
  assert.equal(meioUrl(meioFor(ch, data, 'l1'), ch, data, 'pt'), '/pt' + hash);
  // A página lê os números no idioma do link ('en') e converte para o dela: em 'en', '2.125' é 2,125 (em 'pt' seria 2125).
  const prev = getLang(); setLang('en'); assert.equal(parseNum('2.125'), 2.125); setLang(prev);
});

test('meio: item fluido sai em modo fluido, cano, sem sink', () => {
  const fake: GameData = {
    items: {
      F: { id: 'F', name: 'Fluid F', fluid: true, raw: false },
      X: { id: 'X', name: 'Thing X', fluid: false, raw: false },
    },
    recipes: {
      RP: { id: 'RP', name: 'Make F', alt: false, building: 'B', ins: [], outs: [{ item: 'F', perMin: 100 }] },
      RC: { id: 'RC', name: 'Use F', alt: false, building: 'B', ins: [{ item: 'F', perMin: 50 }], outs: [{ item: 'X', perMin: 10 }] },
    },
    extractors: {}, buildings: { B: { id: 'B', name: 'Box', w: 10, l: 10 } },
  };
  const st = (id: string, recipe: string, machines: number) =>
    ({ id, recipe, machines, clock: 100, perRow: null, locked: false, tiers: {}, pos: { x: 0, y: 0 } });
  const c: Chain = { v: 1, stages: [st('a', 'RP', 4), st('b', 'RC', 8)], links: [{ id: 'l1', item: 'F', from: 'a', to: 'b' }], policy: 'sink' };
  const me = meioFor(c, fake, 'l1');
  assert.equal(meioInput(me, c, fake).medium, 'fluid'); assert.equal(meioPlan(me, c, fake).policy, 'represar');
  const share = decodeShare(meioHash(me, c, fake).slice(3))!;
  assert.equal(share.medium, 'fluid'); assert.equal(share.pipe, 'Mk2'); assert.equal(share.policy, 'represar');
  assert.equal(meioInput(me, c, fake).policy, 'represar');
});

test('meio: acima de MEIO_MAX_LINES não chama o computePlan e volta rápido, com os totais', () => {
  const c0 = exampleChain(data);
  const big: Chain = { ...c0, stages: c0.stages.map(s => (s.id === 's1' ? { ...s, machines: 3000, perRow: 7 } : s)) };
  const me = meioFor(big, data, big.links[0].id);
  const t0 = Date.now(); const p = meioPlan(me, big, data); const sum = meioSummary(p);
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(p.tooLarge && p.tooLarge.src > MEIO_MAX_LINES); assert.equal(sum.tooLarge, p.tooLarge);
  assert.equal(p.alternatives.length, 0); assert.ok(p.supply > 0 && p.demand === 2400);
  const ex = meioPlan(meioFor(c0, data, c0.links[0].id), c0, data);
  assert.equal(ex.tooLarge, undefined); assert.equal(meioSummary(ex).tooLarge, null);
});
