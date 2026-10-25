// Roda com: node --test tests/logic.test.js
// Testa a lógica pura de src/logic com os casos do AGENTS.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as logic from '../src/logic/index.js';
import * as I from '../src/i18n/index.js';

// L junta a lógica pura com o que vem de src/i18n (I18N, LANGS, setLang, t, fmt, parseNum…), como no bloco antigo.
const L = { ...logic, ...I };

const base = { cap: 480, belt: 'Mk4', policy: 'represar', conv: 'k-1', srcPer: 0, dstPer: 0 };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg || ''} ${a} ≈ ${b}`);
const alt = (p, key) => {
  const a = p.alternatives.find(x => x.key === key);
  assert.ok(a, `alternativa ${key} existe (tem: ${p.alternatives.map(x => x.key).join(', ')})`);
  return a;
};
// Conservação: tudo que é produzido sai para destino, sink, linha extra ou represa.
const conserves = (p, a) => close(a.served + a.sinkRate + a.extraRate + a.held, p.supply, `conservação em ${a.key}`);

test('caso 1: 42 × 65 → 60 × 40, Mk4', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40 });
  assert.equal(p.src.groups[0].perLine, 7);
  assert.equal(p.src.lines.length, 6);
  assert.equal(p.src.groups[0].lineRate, 455);
  assert.equal(p.collectMergers, 36);
  assert.equal(p.dst.lines.length, 5);
  assert.equal(p.dst.total, 2400);
  assert.equal(p.distSplitters, 55);

  const sink = alt(p, 'doadora-1-sink');
  const g = sink.groups[0];
  assert.equal(g.p, 5);
  assert.equal(g.n, 6);
  assert.equal(g.tree.splitters, 3, '1 splitter em 2 + 2 splitters em 3');
  assert.deepEqual(g.tree.factors, [2, 3]);
  assert.ok(sink.full);
  assert.equal(sink.pieces.mergers, 5);
  assert.equal(sink.pieces.splitters, 3);
  close(sink.sinkRate, 455 / 6, 'sink recebe 1/6 da doadora');
  sink.dests.forEach(d => close(d.got, 480));
  conserves(p, sink);

  const loop = alt(p, 'doadora-1-loop');
  assert.ok(loop.full);
  close(loop.sinkRate, 0);
  close(loop.held, 330, 'no loop a sobra toda represa');
  assert.equal(loop.pieces.mergers, 6);
  conserves(p, loop);

  const direct = alt(p, 'direto');
  assert.equal(direct.full, false);
  direct.dests.forEach(d => close(d.got, 455));
  conserves(p, direct);

  assert.equal(p.alternatives[0].key, 'doadora-1-sink', 'recomendada: menos peças entre as que enchem tudo');
});

test('caso 2: 42 × 65 → 4 linhas de 440 = ligação direta', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 4, dstRate: 440, dstPer: 1, policy: 'sink' });
  const a = p.alternatives[0];
  assert.equal(a.key, 'direto');
  assert.equal(a.caseLabel, 'caso A');
  a.dests.forEach(d => close(d.got, 440));
  close(a.held, 60, '15 represa em cada uma das 4');
  close(a.sinkRate, 910, 'as 2 linhas que sobram vão pro sink');
  conserves(p, a);

  const ov = alt(p, 'direto-sink');
  assert.equal(ov.pieces.smart, 4);
  close(ov.sinkRate, 910 + 60, 'excesso das 4 também vai pro sink');
  close(ov.held, 0);
  conserves(p, ov);
});

test('caso 3: caso 1 com 6 refinarias por linha', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40, srcPer: 6 });
  assert.equal(p.src.lines.length, 7);
  assert.equal(p.src.groups[0].lineRate, 390);
  assert.equal(p.collectMergers, 35);
  const a = p.alternatives[0];
  assert.equal(a.kind, 'donor');
  assert.equal(a.groups.length, 2);
  assert.deepEqual(a.groups.map(g => g.p).sort(), [2, 3]);
  assert.ok(a.groups.every(g => g.mode === 'direct'));
  assert.ok(a.full);
  conserves(p, a);
});

test('3×480 + 320 com doadora ÷3: a linha principal represa, não a doadora', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 44, dstRate: 40, dstPer: 12, policy: 'sink' });
  assert.deepEqual(p.dst.lines.map(l => l.rate), [480, 480, 480, 320]);
  const a = alt(p, 'doadora-1-direct');
  assert.ok(a.full);
  const donorId = a.groups[0].donor.id;
  close(a.sources.get(donorId).out, 455, 'doadora sai inteira');
  for (const fv of a.view.feeds.filter(f => f.partEdge !== null)) {
    close(a.sim.flow[fv.partEdge], 455 / 3, 'parte da doadora');
    close(a.sim.flow[fv.mainEdges[0]], 480 - 455 / 3, 'principal só completa o resto');
  }
  const d4 = a.view.feeds.find(f => f.f.dst.rate === 320);
  close(a.sources.get(d4.f.mains[0].id).held, 135, 'linha do D4 represa 135');
  close(a.sinkRate, 455, 'linha que sobra vai pro sink');
  conserves(p, a);
});

test('vários grupos: 3 × 600 + 1 × 300 em Mk5', () => {
  const src = L.buildLines([{ mode: 'machines', count: 3, rate: 600 }, { mode: 'machines', count: 1, rate: 300 }], 780);
  assert.deepEqual(src.lines.map(l => l.rate), [600, 600, 600, 300]);
  assert.equal(src.total, 2100);
});

test('origens diferentes: a linha menor cobre o destino pequeno e a grande vira doadora', () => {
  const p = L.computePlan({ ...base, cap: 780, belt: 'Mk5', dstCount: 45, dstRate: 40, dstPer: 19,
    srcGroups: [{ mode: 'machines', count: 3, rate: 600 }, { mode: 'machines', count: 1, rate: 300 }] });
  assert.deepEqual(p.dst.lines.map(l => l.rate), [760, 760, 280]);
  const a = p.alternatives[0];
  assert.ok(a.full, `recomendada enche tudo (${a.key})`);
  const d3 = a.view.feeds.find(f => f.f.dst.rate === 280);
  assert.equal(d3.f.mains[0].rate, 300);
  assert.equal(a.groups[0].donor.rate, 600);
  assert.equal(a.groups[0].p, 2);
  conserves(p, a);
});

test('sobras de grupos diferentes dividem uma linha', () => {
  // 3 × 200 em Mk4: uma linha de 2 (400) e sobra 1; a máquina de 120 junta com ela.
  const src = L.buildLines([{ mode: 'machines', count: 3, rate: 200 }, { mode: 'machines', count: 1, rate: 120 }], 480);
  assert.deepEqual(src.lines.map(l => l.rate), [400, 320]);
  const mixed = src.lines[1];
  assert.equal(L.lineComp(mixed), '1 × 200 + 1 × 120');
  assert.equal(mixed.machines, 2);
});

test('origem por total contínuo: 3.500 em Mk5', () => {
  const src = L.buildLines([{ mode: 'total', rate: 3500 }], 780);
  assert.deepEqual(src.lines.map(l => l.rate), [780, 780, 780, 780, 380]);
  const p = L.computePlan({ ...base, cap: 780, belt: 'Mk5', srcGroups: [{ mode: 'total', rate: 3500 }], dstCount: 60, dstRate: 40 });
  assert.equal(p.collectMergers, 0);
  assert.ok(p.alternatives[0].full);
  conserves(p, p.alternatives[0]);
});

test('máquina acima da esteira fica sozinha e avisa', () => {
  const src = L.buildLines([{ mode: 'machines', count: 2, rate: 600 }], 480);
  assert.deepEqual(src.lines.map(l => l.rate), [480, 480]);
  assert.ok(src.warnings.length);
});

test('caso C: linhas de 120 alimentando 480', () => {
  const p = L.computePlan({ ...base, srcCount: 8, srcRate: 120, dstCount: 2, dstRate: 480, srcPer: 1, dstPer: 1 });
  const a = p.alternatives[0];
  assert.equal(a.key, 'juntar');
  assert.ok(a.full);
  assert.ok(a.view.feeds.every(f => f.f.mains.length === 4 && f.mergers === 2));
  conserves(p, a);
});

test('demanda maior que oferta: avisa e nenhuma alternativa enche tudo', () => {
  const p = L.computePlan({ ...base, srcCount: 10, srcRate: 65, dstCount: 60, dstRate: 40 });
  assert.ok(p.warnings.some(w => w.text.includes('demanda')));
  assert.ok(p.alternatives.length > 0);
  assert.ok(p.alternatives.every(a => !a.full));
});

test('agrupamento acima da esteira avisa', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40, srcPer: 8 });
  assert.ok(p.warnings.some(w => w.text.includes('acima da esteira')));
});

test('simulação: merger round-robin e splitter igual', () => {
  assert.deepEqual(L.waterfill(480, [Infinity, 100]), [380, 100]);
  assert.deepEqual(L.waterfill(480, [Infinity, Infinity]), [240, 240]);
  assert.deepEqual(L.waterfill(90, [480, 480, 480]), [30, 30, 30]);
});

test('splitTree e divisões diretas', () => {
  assert.equal(L.splitTree(6).splitters, 3, '2 × 3: 1 + 2');
  assert.equal(L.splitTree(12).splitters, 7, '2 × 2 × 3: 1 + 2 + 4 (3 × 2 × 2 seriam 10)');
  assert.equal(L.splitTree(18).splitters, 9);
  assert.equal(L.splitTree(9).splitters, 4);
  assert.equal(L.splitTree(4).splitters, 3);
  assert.equal(L.isDirect(5), false);
  assert.equal(L.nextDirect(7), 8);
});

test('parseNum aceita formato brasileiro', () => {
  assert.equal(L.parseNum('65'), 65);
  assert.equal(L.parseNum('65,5'), 65.5);
  assert.equal(L.parseNum('1.200'), 1200);
  assert.equal(L.parseNum('22.5'), 22.5);
  assert.ok(Number.isNaN(L.parseNum('abc')));
});

test('equivalências: fracionado, inteiro com clock e total', () => {
  const a = L.resolveGroup({ driver: 'machines', count: 43.38, nominal: 40 });
  assert.equal(a.N, 44);
  close(a.total, 1735.2);
  close(a.clock * 100, 98.59);
  const b = L.resolveGroup({ driver: 'clock', count: 44, clock: 98.6, nominal: 40 });
  close(b.total, 1735.36);
  close(b.n, 43.384);
  const c = L.resolveGroup({ driver: 'total', total: 1735.14, nominal: 40 });
  assert.equal(c.N, 44);
  close(c.n, 43.38);
  close(c.perMachine, 1735.14 / 44);
  assert.ok(L.resolveGroup({ driver: 'total', total: 1440 }).continuous);
});

test('destino fracionado usa a taxa real por máquina nas linhas', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstGroups: [{ driver: 'total', total: 1735.14, nominal: 40 }] });
  close(p.demand, 1735.14);
  const g = p.dst.groups[0];
  assert.equal(g.auto, 12, '480 / 39,43 = cabem 12 por linha');
  assert.deepEqual(p.dst.lines.map(l => l.machines), [11, 11, 11, 11], '44 em 4 linhas iguais');
  close(p.dst.lines[0].rate, 11 * 1735.14 / 44);
});

test('carvão: excesso de 3 linhas cobre a falta da quarta via overflow', () => {
  const p = L.computePlan({ ...base,
    srcGroups: [{ driver: 'total', total: 1440 }, { driver: 'machines', count: 1, nominal: 300, per: 1 }],
    dstGroups: [{ driver: 'machines', count: 43, nominal: 40, per: 11 }] });
  assert.deepEqual(p.dst.lines.map(l => l.rate), [440, 440, 440, 400]);
  const a = p.alternatives[0];
  assert.equal(a.key, 'redistribuir');
  assert.ok(a.full);
  assert.equal(a.pieces.smart, 3);
  a.dests.forEach(d => close(d.got, d.line.rate));
  const d4 = a.view.feeds.find(f => f.f.dst.rate === 400);
  assert.equal(d4.inbound.length, 3);
  conserves(p, a);
});

// ---- Cenários do jogo ----
// Cada cenário real que aparecer entra aqui: entradas como vêm do planner e o que a ferramenta tem que entregar.

test('cenário: concreto 15 × 80 → 13,06 × 20 + 30,6 × 20, excesso pro sink sem represa', () => {
  const input = { ...base, policy: 'sink',
    srcGroups: [{ driver: 'machines', count: 15, nominal: 80 }],
    dstGroups: [{ driver: 'machines', count: 13.06, nominal: 20 }, { driver: 'machines', count: 30.6, nominal: 20 }] };
  // Represando (padrão), a recomendada continua a redistribuição com represa.
  const held = L.computePlan(input);
  assert.equal(held.alternatives[0].key, 'redistribuir');
  assert.ok(held.alternatives[0].midHeld > 300);
  const d = alt(held, 'redistribuir-sem-represa');
  assert.ok(d.full);
  close(d.held, 0);
  close(d.sinkRate, 1200 - 873.2);
  assert.equal(d.pieces.smart, held.alternatives[0].pieces.smart + 3);
  d.dests.forEach(x => close(x.got, x.line.rate));
  conserves(held, d);
  // Com o excesso pro sink, ela vira a recomendada.
  const p = L.computePlan({ ...input, excess: 'sink' });
  assert.equal(p.alternatives[0].key, 'redistribuir-sem-represa');
  assert.equal(p.excess, 'sink');
  // Fluido não tem sink: a preferência não vale.
  const f = L.computePlan({ ...input, medium: 'fluid', cap: 600, excess: 'sink' });
  assert.equal(f.excess, 'represar');
  assert.ok(!f.alternatives.some(a => a.drain));
});

test('link do cenário guarda o excesso', () => {
  const st = { item: 'x', src: [{ count: '1' }], dst: [{ count: '1' }], excess: 'sink' };
  assert.equal(L.decodeShare(L.encodeShare(st)).excess, 'sink');
  assert.equal(L.decodeShare(L.encodeShare({ ...st, excess: 'nada' })).excess, 'represar');
});

test('cenário: 44 × 60 → 59 × 30 + 14 × 60, destino em linhas iguais por grupo', () => {
  const p = L.computePlan({ ...base,
    srcGroups: [{ driver: 'machines', count: 44, nominal: 60 }],
    dstGroups: [{ driver: 'machines', count: 59, nominal: 30 }, { driver: 'machines', count: 14, nominal: 60 }] });
  // Origem enche a esteira: 5 linhas de 8 e a sobra de 4.
  assert.deepEqual(p.src.lines.map(l => l.machines), [8, 8, 8, 8, 8, 4]);
  // Destino divide cada grupo igual: 14 → 7 + 7, nunca 8 + 6; 59 → 15 + 15 + 15 + 14.
  const [g1, g2] = p.dst.groups;
  assert.deepEqual(g1.sizes, [15, 15, 15, 14]);
  assert.deepEqual(g2.sizes, [7, 7]);
  assert.equal(g2.auto, 8, 'cabem 8, mas a divisão usa 7');
  // Nenhuma linha do destino mistura máquinas de grupos diferentes.
  assert.ok(p.dst.lines.every(l => l.comp.length === 1), 'cada linha do destino é de um grupo só');
  assert.deepEqual(p.dst.lines.map(l => l.rate), [450, 450, 450, 420, 420, 420]);
  close(p.demand, 2610);
  close(p.supply, 2640);
  assert.ok(!p.warnings.some(w => w.text.startsWith('Distribuição')), 'linhas equilibradas não são incompletas');
  // O meio fecha: todo destino cheio e o que sobra (30) só represa.
  const a = p.alternatives[0];
  assert.ok(a.full, `recomendada enche tudo (${a.key})`);
  a.dests.forEach(d => close(d.got, d.line.rate));
  close(a.held, 30);
  conserves(p, a);
});

test('cenário: linhas por grupo aparecem no texto do grupo', () => {
  const p = L.computePlan({ ...base,
    srcGroups: [{ driver: 'machines', count: 44, nominal: 60 }],
    dstGroups: [{ driver: 'machines', count: 59, nominal: 30 }, { driver: 'machines', count: 14, nominal: 60 }] });
  const parts = g => L.t('lineParts', L.sizeParts(g.sizes, g.eff));
  assert.equal(parts(p.src.groups[0]), '5 de 8 (480/min) + 1 de 4 (240/min)');
  assert.equal(parts(p.dst.groups[0]), '3 de 15 (450/min) + 1 de 14 (420/min)');
  assert.equal(parts(p.dst.groups[1]), '2 de 7 (420/min)');
});

test('cenário: 43,38 × 60 → 1.762,71 a 30 + 14 × 60, falta cai no destino menor e O1 vai pro D1', () => {
  const p = L.computePlan({ ...base,
    srcGroups: [{ driver: 'machines', count: 43.38, nominal: 60 }],
    dstGroups: [{ driver: 'total', total: 1762.71, nominal: 30 }, { driver: 'machines', count: 14, nominal: 60 }] });
  assert.deepEqual(p.dst.lines.map(l => l.machines), [15, 15, 15, 14, 7, 7]);
  assert.deepEqual(p.dst.lines.map(l => l.comp[0].gi), [0, 0, 0, 0, 1, 1], 'G1 junto, depois G2');
  const a = p.alternatives[0];
  assert.equal(a.key, 'redistribuir');
  assert.ok(a.full);
  const main = dstId => a.view.feeds.find(f => f.f.dst.id === dstId).f.mains[0];
  // Linhas de origem iguais vão em ordem: O1 → D1, O2 → D2, O3 → D3; a linha curta (O6) fica com o D4, o menor.
  assert.deepEqual([0, 1, 2, 3].map(i => main(i).id), [0, 1, 2, 5]);
  assert.equal(a.view.feeds.find(f => f.f.dst.id === 3).inbound.length, 5, 'D4 recebe o excesso das outras 5');
  conserves(p, a);
});

test('destino com por linha digitado usa o valor exato e não mistura grupos', () => {
  const p = L.computePlan({ ...base, srcCount: 44, srcRate: 60,
    dstGroups: [{ driver: 'machines', count: 59, nominal: 30, per: 16 }, { driver: 'machines', count: 14, nominal: 60, per: 8 }] });
  assert.deepEqual(p.dst.lines.map(l => l.machines), [16, 16, 16, 11, 8, 6], 'linhas na ordem dos grupos, sobra junto do seu grupo');
  assert.ok(p.dst.lines.every(l => l.comp.length === 1));
});

// ---- Idiomas ----
test('histórico: passo, desfazer, refazer, limite e estado repetido', () => {
  let h = L.historyNew({ v: 0 }, 3);
  assert.equal(L.historyUndo(h), h, 'sem passo, desfazer não muda nada');
  assert.equal(L.historyRedo(h), h, 'sem passo, refazer não muda nada');
  h = L.historyPush(h, { v: 1 });
  assert.equal(L.historyPush(h, { v: 1 }), h, 'estado igual ao atual não vira passo');
  h = L.historyPush(h, { v: 2 });
  h = L.historyUndo(h);
  assert.deepEqual(h.present, { v: 1 });
  h = L.historyUndo(h);
  assert.deepEqual(h.present, { v: 0 });
  assert.equal(h.past.length, 0);
  h = L.historyRedo(h);
  assert.deepEqual(h.present, { v: 1 });
  assert.deepEqual(h.future, [{ v: 2 }]);
  h = L.historyPush(h, { v: 9 });
  assert.deepEqual(h.future, [], 'passo novo descarta o que dava para refazer');
  for (let i = 10; i < 20; i++) h = L.historyPush(h, { v: i });
  assert.equal(h.past.length, 3, 'guarda no máximo o limite');
  assert.deepEqual(h.past[0], { v: 16 });
  const r = L.historyReplace(h, { v: 'x' });
  assert.deepEqual(r.present, { v: 'x' });
  assert.equal(r.past, h.past, 'trocar o atual não mexe na pilha');
});

// Roda o bloco em outro idioma e sempre volta pro português, que é o padrão dos outros testes.
const inLang = (lang, fn) => { L.setLang(lang); try { return fn(); } finally { L.setLang('pt'); } };

test('idiomas: as mesmas chaves, do mesmo tipo, nos três', () => {
  const ref = L.I18N.pt;
  assert.deepEqual(L.LANGS, ['pt', 'en', 'es']);
  for (const lang of L.LANGS) {
    const dict = L.I18N[lang];
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(ref).sort(), `chaves de ${lang}`);
    for (const k of Object.keys(ref)) assert.equal(typeof dict[k], typeof ref[k], `${lang}.${k}`);
  }
});

test('idiomas: caso 1 em inglês e espanhol', () => {
  const input = { ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40 };
  const en = inLang('en', () => {
    const p = L.computePlan(input);
    const a = p.alternatives.find(x => x.key === 'doadora-1-sink');
    return { title: a.title, sub: a.sub, caseLabel: a.caseLabel, tree: L.describeTree(a.groups[0].tree), total: L.fmt(2730) };
  });
  assert.equal(en.title, 'Top-up with 1 donor, extra parts to the sink');
  assert.equal(en.caseLabel, 'case B');
  assert.equal(en.tree, '1 splitter into 2, then 2 splitters into 3 (one on each output) = 6 parts');
  assert.equal(en.total, '2,730');
  const es = inLang('es', () => L.computePlan(input).alternatives[0]);
  assert.equal(es.title, 'Complemento con 1 donante, partes de más al sink');
  assert.equal(es.caseLabel, 'caso B');
});

test('idiomas: avisos traduzidos', () => {
  const w = inLang('en', () => L.computePlan({ ...base, srcCount: 10, srcRate: 65, dstCount: 60, dstRate: 40 }).warnings);
  assert.ok(w.some(x => x.text.startsWith('Demand (')), w.map(x => x.text).join(' | '));
  assert.ok(!w.some(x => /demanda|oferta/i.test(x.text)));
});

test('parseNum em inglês: vírgula é milhar, ponto é decimal', () => {
  inLang('en', () => {
    assert.equal(L.parseNum('1,200'), 1200);
    assert.equal(L.parseNum('1,200.5'), 1200.5);
    assert.equal(L.parseNum('22.5'), 22.5);
    assert.equal(L.parseNum('1.200'), 1.2);
    assert.equal(L.parseNum('65,5'), 65.5);
  });
  inLang('es', () => {
    assert.equal(L.parseNum('65,5'), 65.5);
    assert.equal(L.parseNum('1.200'), 1200);
  });
});

// ---- Biblioteca de load balancers ----
const best = (n, m, r, cap, bps) => L.rankDesigns(L.balancerCandidates(n, m, [r], cap, bps));
const kind = (list, k) => list.find(d => d.kind === k);

test('balancer: cascata de mergers bate com mergersFor', () => {
  assert.deepEqual(L.chainSizes(6), [3, 5, 6]);
  assert.deepEqual(L.chainSizes(1), []);
  for (let n = 1; n <= 12; n++) assert.equal(L.chainSizes(n).length, L.mergersFor(n), `n=${n}`);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(L.chainSlot), [0, 0, 0, 1, 1, 2, 2]);
});

test('balancer: matriz 3→4 = 3 árvores de 1→4 + 4 mergers', () => {
  const d = L.balancerDesign('matrix', 3, 4, [240], 480);
  assert.equal(d.applies, null);
  assert.equal(d.pieces.splitters, 9);
  assert.equal(d.pieces.mergers, 4);
  close(d.perOut, 180);
  assert.ok(d.segments.every(s => s.ok));
  assert.equal(L.balancerDesign('matrix', 3, 5, [240], 480).applies, 'notDirect');
  assert.equal(L.balancerDesign('matrix-loop', 3, 4, [240], 480).applies, 'direct');
  assert.equal(L.balancerDesign('funnel', 1, 4, [240], 480).applies, 'oneInput');
});

test('balancer: 2→5 a 240 na Mk4 escolhe matriz com loop porque o funil engargala', () => {
  const r = best(2, 5, 240, 480, []).filter(d => !d.kind.startsWith('butterfly'));
  assert.equal(r[0].kind, 'matrix-loop');
  close(r[0].perOut, 96);
  assert.equal(r[0].pieces.splitters, 6);
  assert.equal(r[0].pieces.mergers, 7, '2 de loop + 5 saídas');
  const f = kind(r, 'funnel-loop');
  close(f.perOut, 80, 'esteira do loop do funil (576) limita a 480');
  assert.ok(f.segments.some(s => s.key === 'loop' && !s.ok));
  assert.equal(L.designWhy(r).code, 'more');
});

test('balancer: em baixa vazão o funil com loop ganha por ter menos peças', () => {
  const r = best(2, 5, 60, 480, []);
  assert.equal(r[0].kind, 'funnel-loop');
  assert.equal(L.designPieces(r[0]), 5);
  assert.equal(L.designWhy(r).code, 'fewer');
});

test('balancer: sink só perde para o loop no desempate', () => {
  const r = best(1, 7, 480, 480, []).filter(d => d.kind !== 'matrix-split-loop');
  close(kind(r, 'matrix-loop').perOut, kind(r, 'matrix-sink').perOut);
  assert.equal(r[0].kind, 'matrix-loop');
  assert.equal(L.designWhy(r).code, 'noSink');
});

// Vazão que sai de cada saída simulando o design no grafo, com as entradas a `rates`.
const simOut = (d, rates, cap) => {
  const g = L.makeGraph(cap);
  const ins = rates.map(r => L.addNode(g, 'source', { rate: r }));
  const outs = Array.from({ length: d.M }, () => L.addNode(g, 'consumer', { demand: cap }));
  const v = L.buildBalancer(g, d, ins, outs, L.addNode(g, 'sink'));
  const sim = L.simulate(g);
  return v.outEdges.map(e => sim.flow[e]);
};

test('loop dividido: 1→5 e 1→7 com a esteira cheia, como os da comunidade', () => {
  const r5 = best(1, 5, 480, 480, []);
  assert.equal(r5[0].kind, 'matrix-split-loop', 'ganha por vazão');
  assert.equal(L.designPieces(r5[0]), 14, '1 + 2 × 3 splitters, 2 mergers de loop, 5 de saída');
  close(r5[0].perOut, 96, 'esteira cheia: 480 / 5');
  assert.ok(r5[0].segments.every(sg => sg.ok), 'nenhum trecho estoura a Mk4');
  close(kind(r5, 'matrix-loop').perOut, 80, 'o loop comum (576) estrangula');
  assert.equal(L.designWhy(r5).code, 'more');
  simOut(r5[0], [480], 480).forEach(f => close(f, 96));
  const r7 = best(1, 7, 480, 480, []);
  assert.equal(r7[0].kind, 'matrix-split-loop');
  assert.equal(L.designPieces(r7[0]), 24);
  simOut(r7[0], [480], 480).forEach(f => close(f, 480 / 7));
});

test('loop dividido: com várias entradas desiguais as saídas saem iguais', () => {
  const d = L.balancerDesign('matrix-split-loop', 2, 5, [480, 300], 480);
  assert.equal(d.applies, null);
  assert.equal(d.pieces.splitters, 2 + 4 * 3);
  assert.equal(d.pieces.mergers, 4 + 5 * L.chainSizes(4).length);
  simOut(d, [480, 300], 480).forEach(f => close(f, 156));
});

test('loop dividido: só aparece quando o loop comum estoura', () => {
  assert.equal(L.balancerDesign('matrix-split-loop', 1, 5, [300], 480).applies, 'loopFits');
  assert.equal(L.balancerDesign('matrix-split-loop', 1, 6, [480], 480).applies, 'direct');
  for (const l of ['pt', 'en', 'es']) inLang(l, () => {
    assert.ok(L.designName(L.balancerDesign('matrix-split-loop', 1, 5, [480], 480)).length > 5);
    for (const k of ['dsMatrixSplitLoop', 'segHalf']) assert.ok(L.t(k).length > 5, `${l} ${k}`);
    assert.ok(L.t('stHalves', 1, '240').length > 20);
    assert.ok(L.t('rLoopFits').length > 10);
  });
});

test('loop dividido: 3D sem colisão, com um splitter em 2 por entrada', () => {
  for (const [N, M] of [[1, 5], [1, 7], [2, 5], [3, 5]]) {
    const d = L.balancerDesign('matrix-split-loop', N, M, [480], 480);
    for (const mode of ['floors', 'towers']) {
      const lay = lay3d(d, mode);
      assert.equal(lay.bad, 0, `${N}→${M} ${mode}`);
      assert.equal(lay.pieces.filter(p => p.t === 's' || p.t === 'm').length, L.designPieces(d), `${N}→${M} ${mode}: peças batem`);
    }
  }
});

test('balancer: blueprint do jogador é preferido quando o formato bate', () => {
  const r = best(3, 4, 240, 480, [{ n: 3, m: 4 }]);
  assert.equal(r[0].kind, 'blueprint');
  assert.equal(L.designWhy(r).code, 'bp');
  assert.equal(best(2, 4, 240, 480, [{ n: 3, m: 4 }])[0].kind, 'blueprint', 'entrada sobrando serve');
  assert.ok(!best(3, 5, 240, 480, [{ n: 3, m: 4 }]).some(d => d.kind === 'blueprint'), 'saída diferente não serve');
});

test('balancer no plano: caso 1 tem a alternativa 6→5 e a recomendada não muda', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40 });
  const bal = p.alternatives.filter(a => a.kind === 'balancer');
  assert.equal(bal.length, 1, 'só o melhor design vira alternativa');
  const a = bal[0];
  assert.equal(a.bal.design.kind, 'matrix-loop');
  assert.ok(a.full, 'loop limita cada entrada a 400, e 6 × 400 ainda cobre 2.400');
  assert.equal(a.pieces.splitters, 18);
  assert.equal(a.pieces.mergers, 21);
  a.sources.forEach(s => close(s.out, 400));
  conserves(p, a);
  assert.ok(a.designAlts.length > 1);
  assert.equal(p.alternatives[0].key, 'doadora-1-sink');
});

test('balancer no plano: com blueprint 6→5 ele vira a recomendada', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40, blueprints: [{ n: 6, m: 5 }] });
  const a = p.alternatives[0];
  assert.equal(a.kind, 'balancer');
  assert.equal(a.bal.design.kind, 'blueprint');
  assert.equal(a.pieces.blueprints, 1);
  assert.ok(a.full);
  conserves(p, a);
});

test('balancer no plano: ligação direta cheia não gera balancer', () => {
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 4, dstRate: 440, dstPer: 1 });
  assert.ok(!p.alternatives.some(a => a.kind === 'balancer'));
});

test('balancer: nomes nos três idiomas', () => {
  const d = L.balancerDesign('funnel-loop', 3, 5, [60], 480);
  assert.equal(L.designName(d), 'funil com loop');
  assert.equal(inLang('en', () => L.designName(d)), 'looped funnel');
  assert.equal(inLang('es', () => L.designName(d)), 'embudo con loop');
});

test('borboleta: blocos por rodada e peças', () => {
  assert.deepEqual([0, 1, 2, 3].map(i => L.butterflyGroup([2, 2], 0, i)), [[0, 1], [0, 1], [2, 3], [2, 3]]);
  assert.deepEqual([0, 1, 2, 3].map(i => L.butterflyGroup([2, 2], 1, i)), [[0, 2], [1, 3], [0, 2], [1, 3]]);
  const pieces = m => L.designPieces(L.butterflyDesign(m, m, [480], 480));
  assert.equal(pieces(4), 16);
  assert.equal(pieces(8), 48);
  assert.equal(pieces(6), 24);
  assert.equal(L.designPieces(L.balancerDesign('matrix', 4, 4, [480], 480)), 20);
  assert.equal(L.butterflyDesign(3, 4, [480], 480).applies, null, '3→4 usa a borboleta de 4 com uma faixa vazia');
  assert.equal(L.butterflyDesign(5, 5, [480], 480).applies, 'bfExtra', '5 não é feito de 2 e 3: só com loop ou sink');
  assert.equal(L.butterflyDesign(1, 4, [480], 480).applies, 'butterflyShape');
  assert.equal(L.butterflyDesign(4, 1, [480], 480, 'butterfly-loop').applies, 'butterflyShape');
  assert.equal(L.butterflyDesign(4, 4, [480], 480, 'butterfly-loop').applies, 'direct');
});

test('borboleta generalizada: peças dos casos que motivaram', () => {
  const pc = (n, m, k = 'butterfly') => L.designPieces(L.butterflyDesign(n, m, [100], 480, k));
  assert.equal(pc(3, 4), 13, '3 splitters + 2 mergers na 1ª rodada, 4 + 4 na 2ª');
  assert.equal(pc(5, 5, 'butterfly-loop'), 24, 'borboleta de 6, a 6ª faixa volta pra ela mesma');
  assert.equal(L.designPieces(L.balancerDesign('matrix-loop', 5, 5, [100], 480)), 30);
  assert.equal(pc(7, 7, 'butterfly-loop'), 48);
  assert.equal(pc(2, 5, 'butterfly-loop'), 9, '2 entradas + retorno num 3→3, cada um em 2');
  const r = best(2, 5, 240, 480, []);
  assert.equal(r[0].kind, 'butterfly-loop');
  close(r[0].perOut, 96);
  assert.equal(L.designWhy(r).code, 'fewer');
});

test('borboleta com loop: retorno acima da esteira avisa e reduz a vazão', () => {
  // Caso 1: 6 linhas de 455 → 5 saídas; o retorno levaria 546/min numa Mk4.
  const d = L.butterflyDesign(6, 5, [455], 480, 'butterfly-loop');
  assert.ok(d.segments.some(s => s.key === 'bfLoop' && !s.ok));
  assert.ok(d.perOut < 480 * 0.9);
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40 });
  assert.equal(p.alternatives.find(a => a.kind === 'balancer').bal.design.kind, 'matrix-loop');
});

test('borboleta: 4→4 cheio ganha da matriz por ter menos peças', () => {
  const r = best(4, 4, 480, 480, []);
  assert.equal(r[0].kind, 'butterfly');
  assert.equal(L.designWhy(r).code, 'fewer');
  assert.ok(r[0].segments.every(s => s.ok));
});

test('borboleta no plano: entradas desiguais saem iguais', () => {
  // Origem: 3 linhas de 480 e 1 de 300; destino: 4 linhas de 430.
  const p = L.computePlan({ ...base, srcGroups: [{ driver: 'total', total: 1440 }, { driver: 'total', total: 300 }], dstCount: 4, dstRate: 430, dstPer: 1 });
  const a = p.alternatives.find(x => x.kind === 'balancer');
  assert.equal(a.bal.design.kind, 'matrix', 'a borboleta economiza só 4 de 20 peças: a matriz é mais fácil de montar');
  assert.ok(a.full);
  a.dests.forEach(d => close(d.got, 430));
  const bf = a.designAlts.find(x => x.bal.design.kind === 'butterfly');
  assert.ok(bf.full);
  bf.dests.forEach(d => close(d.got, 430));
  assert.equal(bf.pieces.splitters, 8);
  assert.equal(bf.pieces.mergers, 8);
  conserves(p, bf);
});

test('borboleta só ganha quando economiza mais de 20% das peças', () => {
  const r45 = best(4, 5, 125, 480, []);
  assert.equal(r45[0].kind, 'matrix-loop', '4→5: borboleta com loop 21 contra 26, não basta');
  assert.equal(L.designWhy(r45).code, 'simpler');
  for (const l of ['pt', 'en', 'es']) inLang(l, () => assert.ok(L.t('whySimpler', 'x', 21, 26).includes('20%'), l));
  const r88 = best(8, 8, 480, 480, []);
  assert.ok(r88[0].kind.startsWith('butterfly'), '8→8: 48 contra 88, a borboleta vale');
});

test('vertical: andares e lifts', () => {
  const bf = L.designFloors(L.butterflyDesign(4, 4, [480], 480));
  assert.equal(bf.floors, 4, '2 rodadas × (splitters, mergers)');
  assert.equal(bf.lifts, 20, '8 + 4 + 8');
  const mx = L.designFloors(L.balancerDesign('matrix', 3, 4, [240], 480));
  assert.equal(mx.floors, 3, '2 níveis de árvore + 1 merger');
  assert.equal(mx.lifts, 6 + 12, '3 árvores × 2 lifts até o 2º nível + 12 partes até os mergers');
  const loop = L.designFloors(L.balancerDesign('matrix-loop', 1, 5, [240], 480));
  assert.ok(loop.edges.some(e => e.kind === 'loop'));
  assert.equal(L.designFloors(L.blueprintDesign({ n: 3, m: 4 }, 3, 4, [240], 480)), null, 'blueprint não tem andares');
});

// ---- Borboleta: todos os formatos de 1→1 a 9→9 ----
// Faz o fluxo passar pela rede faixa por faixa, sem usar as contas do design: com loop, repete até estabilizar.
function laneFlow(d, rates) {
  const net = d.net, K = net.K, loop = d.kind === 'butterfly-loop';
  let back = Array(K).fill(0), out = null;
  for (let it = 0; it < 2000; it++) {
    let v = Array(K).fill(0);
    net.inLane.forEach((l, i) => { v[l] += rates[i]; });
    if (loop) net.extra.forEach(l => { v[l] += back[l]; });
    for (const rd of net.rounds) {
      const next = Array(K).fill(0);
      for (const m of rd.merges) next[m.lane] = m.from.reduce((a, j) => a + v[j], 0) / rd.f;
      v = next;
    }
    out = v;
    if (!loop) break;
    const nb = Array(K).fill(0);
    net.extra.forEach(l => { nb[l] = v[l]; });
    const diff = Math.max(...nb.map((x, l) => Math.abs(x - back[l])));
    back = nb;
    if (diff < 1e-9) break;
  }
  return out;
}

test('borboleta: todos os formatos N→M de 1 a 9', () => {
  const big = 1e9;
  const shapes = [];
  for (let N = 1; N <= 9; N++) for (let M = 1; M <= 9; M++) {
    const rates = Array.from({ length: N }, (_, i) => 7 + 3 * i);
    const S = rates.reduce((a, b) => a + b, 0);
    const K = L.nextDirect(Math.max(N, M));
    const ds = Object.fromEntries(['butterfly', 'butterfly-loop', 'butterfly-sink'].map(k => [k, L.butterflyDesign(N, M, rates, big, k)]));
    const tag = `${N}→${M}`;
    if (N < 2 || M < 2) {
      Object.values(ds).forEach(d => assert.equal(d.applies, 'butterflyShape', `${tag} ${d.kind}`));
      shapes.push(`${tag}: —`);
      continue;
    }
    if (K === M) {
      assert.equal(ds.butterfly.applies, null, tag);
      assert.equal(ds['butterfly-loop'].applies, 'direct', tag);
      assert.equal(ds['butterfly-sink'].applies, 'direct', tag);
    } else {
      assert.equal(ds.butterfly.applies, 'bfExtra', tag);
      assert.equal(ds['butterfly-loop'].applies, null, tag);
      assert.equal(ds['butterfly-sink'].applies, null, tag);
    }
    for (const d of Object.values(ds).filter(x => !x.applies)) {
      const net = d.net, at = `${tag} ${d.kind}`, loop = d.kind === 'butterfly-loop', E = K - M;
      // Forma: K faixas feitas de 2 e 3, entradas e saídas em faixas distintas, extras = o resto.
      assert.equal(net.K, K, at);
      assert.equal(net.F.reduce((a, b) => a * b, 1), K, at);
      assert.ok(net.F.every(f => f === 2 || f === 3), at);
      assert.equal(new Set(net.inLane).size, N, at);
      assert.equal(net.outLane.length, M, at);
      assert.equal(net.extra.length, E, at);
      assert.deepEqual([...net.outLane, ...net.extra].sort((a, b) => a - b), Array.from({ length: K }, (_, l) => l), at);
      // Peças: splitter só em faixa com item, merger com 2 ou 3 entradas do mesmo bloco, toda faixa viva no fim.
      let live = Array.from({ length: K }, (_, l) => net.inLane.includes(l) || (loop && net.extra.includes(l)));
      let sp = 0, mg = 0;
      net.rounds.forEach((rd, s) => {
        assert.deepEqual(rd.splits, live.map((x, l) => (x ? l : -1)).filter(l => l >= 0), `${at} rodada ${s + 1}`);
        sp += rd.splits.length;
        const next = Array(K).fill(false);
        for (const m of rd.merges) {
          const block = L.butterflyGroup(net.F, s, m.lane);
          assert.ok(m.from.length >= 1 && m.from.length <= 3, at);
          assert.ok(m.from.every(j => block.includes(j) && live[j]), at);
          assert.deepEqual(m.from, block.filter(j => live[j]), at);
          if (m.from.length > 1) mg++;
          next[m.lane] = true;
        }
        live = next;
      });
      assert.ok(live.every(Boolean), `${at}: toda faixa sai com item`);
      assert.deepEqual(net.loopMergers, loop ? net.extra.filter(l => net.inLane.includes(l)) : [], at);
      mg += net.loopMergers.length;
      assert.equal(d.pieces.splitters, sp, at);
      assert.equal(d.pieces.mergers, mg, at);
      // Fluxo: todas as saídas iguais, nada se perde.
      const flow = laneFlow(d, rates);
      const each = loop ? S / M : S / K;
      net.outLane.forEach(l => close(flow[l], each, `${at} saída na faixa ${l + 1}`));
      close(d.perOut, each, `${at} perOut`);
      const sunk = d.kind === 'butterfly-sink' ? E * S / K : 0;
      close(d.sinkRate, sunk, `${at} sink`);
      close(each * M + sunk, S, `${at} conservação`);
      // Simulação com splitters e mergers de verdade (com loop, a divisão ideal limitada).
      const g = L.makeGraph(big);
      const srcs = rates.map(r => L.addNode(g, 'source', { rate: r }));
      const cons = Array.from({ length: M }, () => L.addNode(g, 'consumer', { demand: big }));
      const sinkNode = L.addNode(g, 'sink');
      const v = L.buildBalancer(g, d, srcs, cons, sinkNode);
      const sim = L.simulate(g);
      v.outEdges.forEach((e, j) => close(sim.flow[e], each, `${at} simulação saída ${j + 1}`));
      close(v.sinkEdges.reduce((a, e) => a + sim.flow[e], 0), sunk, `${at} simulação sink`);
      // Vertical: um andar por camada, as entradas, saídas e retornos/sinks no lugar.
      const fl = L.designFloors(d);
      assert.ok(fl, at);
      assert.equal(fl.ins.length, N, at);
      assert.equal(fl.outs.length, M, at);
      assert.equal(fl.edges.filter(e => e.kind === 'loop').length, loop ? E : 0, at);
      assert.equal(fl.nodes.filter(n => n.t === 'sink').length, d.kind === 'butterfly-sink' ? E : 0, at);
      assert.equal(fl.nodes.filter(n => n.t === 's').length, sp, at);
      assert.equal(fl.nodes.filter(n => n.t === 'm').length, mg, at);
    }
    const r = L.rankDesigns(L.balancerCandidates(N, M, rates, big)).filter(d => d.kind.startsWith('butterfly'));
    assert.ok(!r[0].applies, `${tag}: sempre tem uma borboleta`);
    shapes.push(`${tag}: ${r[0].kind} ${L.designPieces(r[0])}`);
  }
  assert.equal(shapes.length, 81);
});

test('borboleta acima de 9: posições fixas, mas as saídas continuam iguais', () => {
  for (let N = 2; N <= 12; N++) for (let M = 10; M <= 12; M++) for (const k of ['butterfly', 'butterfly-loop', 'butterfly-sink']) {
    const rates = Array.from({ length: N }, (_, i) => 5 + i);
    const d = L.butterflyDesign(N, M, rates, 1e9, k);
    if (d.applies) continue;
    const S = rates.reduce((a, b) => a + b, 0);
    const flow = laneFlow(d, rates);
    d.net.outLane.forEach(l => close(flow[l], k === 'butterfly-loop' ? S / M : S / d.net.K, `${N}→${M} ${k}`));
  }
});

// ---- Vista 3D ----
// O roteamento das esteiras é a parte cara: cada montagem é calculada uma vez para todos os testes.
const LAY3 = new Map();
const lay3d = (d, mode) => { const k = JSON.stringify(d) + mode; if (!LAY3.has(k)) LAY3.set(k, L.layout3d(d, mode)); return LAY3.get(k); };
test('3D: andares batem com designFloors', () => {
  const d = L.butterflyDesign(4, 4, [480], 480);
  const fl = L.designFloors(d), lay = lay3d(d, 'floors');
  assert.equal(lay.lifts, fl.lifts);
  assert.equal(lay.steps.length, fl.floors + 2, 'entradas + 4 andares + saídas');
  assert.equal(lay.pieces.filter(p => p.t === 's').length, 8);
  assert.equal(lay3d(L.blueprintDesign({ n: 3, m: 4 }, 3, 4, [240], 480), 'towers'), null);
});

test('3D: torres empilham cada camada numa coluna', () => {
  const d = L.balancerDesign('matrix', 3, 4, [240], 480);
  const lay = lay3d(d, 'towers');
  const xsOfLevel = lv => new Set(lay.pieces.filter(p => p.step === lv + 1).map(p => p.pos[0]));
  for (let lv = 0; lv < lay.steps.length - 2; lv++) assert.equal(xsOfLevel(lv).size, 1, `nível ${lv + 1} numa torre só`);
  assert.ok(lay.belts.every(b => b.pts.length >= 2));
});

test('3D: todos os formatos de 2 a 9, nas duas montagens', () => {
  for (let N = 2; N <= 9; N++) for (let M = 2; M <= 9; M++) {
    for (const d of L.balancerCandidates(N, M, [100], 1e9).filter(x => !x.applies && x.kind !== 'blueprint')) {
      for (const mode of ['floors', 'towers']) {
        const lay = lay3d(d, mode), at = `${N}→${M} ${d.kind} ${mode}`;
        const key = p => p.pos.map(v => v.toFixed(2)).join(',');
        assert.equal(new Set(lay.pieces.map(key)).size, lay.pieces.length, `${at}: peças não se sobrepõem`);
        assert.equal(lay.pieces.filter(p => p.t === 'in').length, N, at);
        assert.equal(lay.pieces.filter(p => p.t === 'out').length, M, at);
        assert.equal(lay.belts.filter(b => b.kind === 'loop').length, L.designFloors(d).edges.filter(e => e.kind === 'loop').length, at);
        assert.ok(lay.pieces.concat(lay.belts).every(x => x.step >= 0 && x.step < lay.steps.length), at);
        assert.equal(lay.lifts, lay.belts.filter(b => b.lift).length, at);
        const [mn, mx] = [lay.bounds.min, lay.bounds.max];
        assert.ok(lay.pieces.every(p => p.pos.every((v, i) => v >= mn[i] - 1e-9 && v <= mx[i] + 1e-9)), at);
      }
    }
  }
});

test('idiomas: textos do 3D', () => {
  for (const l of ['pt', 'en', 'es']) inLang(l, () => {
    assert.equal(L.t('style3d'), '3D');
    assert.ok(L.t('stLevel3d', 'towers', 2, 4, 2, 0, 3, 0).length > 10);
    assert.ok(L.t('stLevel3d', 'floors', 2, 4, 2, 0, 3, 0).length > 10);
  });
});

// ---- Vista 3D: esteiras legíveis, lifts e enquadramento ----
const HALF = { s: [1.8, 1.2, 1.8], m: [1.8, 1.2, 1.8], sink: [1.8, 1.2, 1.8], in: [2.2, 0.4, 1.8], out: [2.2, 0.4, 1.8] };
const inBox = (q, p, pad = 0) => q.every((v, k) => Math.abs(v - p.pos[k]) <= HALF[p.t][k] + pad);
// Trecho [a, b] (eixo único) cruza a caixa da peça p? Amostra o trecho, que é reto e alinhado aos eixos.
const hits = (a, b, p) => { const ax = [0, 1, 2].find(k => Math.abs(a[k] - b[k]) > 1e-9); const h = HALF[p.t]; return [0, 1, 2].every(k => (k === ax ? Math.min(a[k], b[k]) < p.pos[k] + h[k] - 0.05 && Math.max(a[k], b[k]) > p.pos[k] - h[k] + 0.05 : Math.abs(a[k] - p.pos[k]) < h[k] - 0.05)); };
const segsOf = (lay, b) => b.pts.slice(1).map((q, i) => [b.pts[i], q]);

test('3D: esteira não atravessa peça e não corre por cima de outra esteira', () => {
  for (const [N, M] of [[4, 4], [2, 2], [3, 4], [5, 5], [2, 5], [9, 9]]) {
    for (const d of L.balancerCandidates(N, M, [100], 1e9).filter(x => !x.applies && x.kind !== 'blueprint')) {
      for (const mode of ['floors', 'towers']) {
        const lay = lay3d(d, mode), at = `${N}→${M} ${d.kind} ${mode}`;
        const byId = new Map(lay.pieces.map(p => [p.id, p]));
        const outer = []; // trechos fora das peças das pontas
        lay.belts.forEach((b, bi) => {
          const A = byId.get(b.a), B = byId.get(b.b);
          for (const [p, q] of segsOf(lay, b)) {
            const mid = p.map((v, i) => (v + q[i]) / 2);
            if (inBox(mid, A) || inBox(mid, B)) continue;
            for (const o of lay.pieces) if (o !== A && o !== B) assert.ok(!hits(p, q, o), `${at}: esteira ${bi} atravessa peça ${o.id} (${o.t})`);
            outer.push({ bi, p, q });
          }
        });
        for (let i = 0; i < outer.length; i++) for (let j = i + 1; j < outer.length; j++) {
          const s = outer[i], u = outer[j];
          if (s.bi === u.bi) continue;
          const ax = [0, 1, 2].find(k => Math.abs(s.p[k] - s.q[k]) > 1e-9), ux = [0, 1, 2].find(k => Math.abs(u.p[k] - u.q[k]) > 1e-9);
          if (ax !== ux) continue;
          if ([0, 1, 2].some(k => k !== ax && Math.abs(s.p[k] - u.p[k]) >= 1.0)) continue;
          const lo = Math.max(Math.min(s.p[ax], s.q[ax]), Math.min(u.p[ax], u.q[ax])), hi = Math.min(Math.max(s.p[ax], s.q[ax]), Math.max(u.p[ax], u.q[ax]));
          assert.ok(hi - lo < 0.3, `${at}: esteiras ${s.bi} e ${u.bi} correm uma sobre a outra`);
        }
      }
    }
  }
});

test('3D: a contagem de lifts é o número de esteiras com trecho vertical', () => {
  for (const d of [L.balancerDesign('funnel', 2, 2, [100], 1e9), L.butterflyDesign(4, 4, [100], 1e9), L.balancerDesign('matrix-loop', 2, 5, [100], 1e9)]) {
    for (const mode of ['floors', 'towers']) {
      const lay = lay3d(d, mode);
      const vertical = lay.belts.filter(b => segsOf(lay, b).some(([p, q]) => Math.abs(p[1] - q[1]) > 1e-9)).length;
      assert.equal(lay.lifts, vertical, `${d.kind} ${mode}`);
    }
  }
});

test('3D: o enquadramento inicial cabe a montagem inteira na tela', () => {
  const dir = [0.75, 0.75, 1.1], n = Math.hypot(...dir), f = dir.map(v => v / n);
  for (const [d, mode] of [[L.balancerDesign('matrix', 9, 9, [100], 1e9), 'towers'], [L.butterflyDesign(9, 2, [100], 1e9, 'butterfly-loop'), 'floors'], [L.butterflyDesign(4, 3, [100], 1e9, 'butterfly-loop'), 'floors']]) {
    for (const aspect of [16 / 10, 390 / 600]) {
      const { min, max } = lay3d(d, mode).bounds;
      const c = min.map((v, i) => (v + max[i]) / 2), dist = L.fitDistance({ min, max }, 45, aspect);
      const cam = c.map((v, i) => v + f[i] * dist);
      // Base da câmera olhando para o centro.
      const fw = f.map(v => -v), up0 = [0, 1, 0];
      const rt = [fw[1] * up0[2] - fw[2] * up0[1], fw[2] * up0[0] - fw[0] * up0[2], fw[0] * up0[1] - fw[1] * up0[0]];
      const rn = Math.hypot(...rt), r = rt.map(v => v / rn);
      const up = [r[1] * fw[2] - r[2] * fw[1], r[2] * fw[0] - r[0] * fw[2], r[0] * fw[1] - r[1] * fw[0]];
      const t = Math.tan(45 * Math.PI / 360);
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
        const v = [x - cam[0], y - cam[1], z - cam[2]], depth = v.reduce((a, b, i) => a + b * fw[i], 0);
        const sx = v.reduce((a, b, i) => a + b * r[i], 0) / (depth * t * aspect), sy = v.reduce((a, b, i) => a + b * up[i], 0) / (depth * t);
        assert.ok(Math.abs(sx) <= 1 && Math.abs(sy) <= 1, `${d.kind} ${mode} aspect ${aspect.toFixed(2)}: canto fora da tela (${sx.toFixed(2)}, ${sy.toFixed(2)})`);
      }
    }
  }
});

// ---- Vista 3D: portas como no jogo ----
// Referencial do fluxo: Torres é o próprio mundo; Andares gira (x' = -z, z' = x).
const NRM3 = { front: [1, 0, 0], back: [-1, 0, 0], left: [0, 0, -1], right: [0, 0, 1] };
const toWorld = (mode, v) => (mode === 'floors' ? [v[2], v[1], -v[0]] : v);
const toFrame = (mode, v) => (mode === 'floors' ? [-v[2], v[1], v[0]] : v);
const faceOf = (mode, p, side) => {
  const c = toFrame(mode, p.pos), h = L.L3D.half[p.t], n = NRM3[side];
  return toWorld(mode, c.map((v, k) => v + n[k] * h[k]));
};
const near = (a, b, eps = 1e-6) => a.every((v, k) => Math.abs(v - b[k]) < eps);

test('3D: portas como no jogo, uma esteira por face', () => {
  for (let N = 2; N <= 9; N++) for (let M = 2; M <= 9; M++) {
    for (const d of L.balancerCandidates(N, M, [100], 1e9).filter(x => !x.applies && x.kind !== 'blueprint')) {
      for (const mode of ['floors', 'towers']) {
        const lay = lay3d(d, mode), at = `${N}→${M} ${d.kind} ${mode}`;
        const byId = new Map(lay.pieces.map(p => [p.id, p]));
        const used = new Set();
        lay.belts.forEach((b, bi) => {
          const A = byId.get(b.a), B = byId.get(b.b);
          assert.ok(L.PORT3D[A.t].out.includes(b.fromSide), `${at}: esteira ${bi} sai de ${A.t} por ${b.fromSide}`);
          assert.ok(L.PORT3D[B.t].in.includes(b.toSide), `${at}: esteira ${bi} entra em ${B.t} por ${b.toSide}`);
          for (const key of [`${b.a}:${b.fromSide}`, `${b.b}:${b.toSide}`]) {
            assert.ok(!used.has(key), `${at}: duas esteiras na face ${key}`);
            used.add(key);
          }
          const n = b.pts.length, f0 = faceOf(mode, A, b.fromSide), f1 = faceOf(mode, B, b.toSide);
          assert.ok(near(b.pts[0], f0), `${at}: esteira ${bi} começa no centro da face`);
          assert.ok(near(b.pts[n - 1], f1), `${at}: esteira ${bi} termina no centro da face`);
          const out0 = toWorld(mode, NRM3[b.fromSide]), in1 = toWorld(mode, NRM3[b.toSide]);
          assert.ok(near(b.pts[1], f0.map((v, k) => v + out0[k] * 1.2)), `${at}: esteira ${bi} sai perpendicular, 1,2 m`);
          assert.ok(near(b.pts[n - 2], f1.map((v, k) => v + in1[k] * 1.2)), `${at}: esteira ${bi} entra perpendicular, 1,2 m`);
        });
      }
    }
  }
});

test('3D: sink encostado na peça, sem sobrepor', () => {
  for (const d of [L.balancerDesign('matrix-sink', 2, 5, [100], 1e9), L.balancerDesign('funnel-sink', 3, 5, [100], 1e9), L.butterflyDesign(9, 2, [100], 1e9, 'butterfly-sink')]) {
    for (const mode of ['floors', 'towers']) {
      const lay = lay3d(d, mode), at = `${d.kind} ${mode}`;
      const byId = new Map(lay.pieces.map(p => [p.id, p]));
      const sinks = lay.pieces.filter(p => p.t === 'sink');
      for (const s of sinks) {
        const b = lay.belts.find(x => x.b === s.id), A = byId.get(b.a);
        assert.ok(Math.hypot(...s.pos.map((v, k) => v - A.pos[k])) <= 6 + 1e-6, `${at}: sink perto da peça de origem`);
        assert.ok(['front', 'left', 'right'].includes(b.fromSide), at);
      }
      const box = p => { const c = toFrame(mode, p.pos), h = L.L3D.half[p.t]; return { lo: c.map((v, k) => v - h[k]), hi: c.map((v, k) => v + h[k]) }; };
      for (let i = 0; i < lay.pieces.length; i++) for (let j = i + 1; j < lay.pieces.length; j++) {
        const u = box(lay.pieces[i]), v = box(lay.pieces[j]);
        assert.ok(![0, 1, 2].every(k => u.lo[k] < v.hi[k] - 1e-6 && v.lo[k] < u.hi[k] - 1e-6), `${at}: peças ${i} e ${j} se sobrepõem`);
      }
    }
  }
});

test('3D: montagem cheia continua rápida', () => {
  const d = L.balancerDesign('matrix', 9, 9, [100], 1e9);
  for (const mode of ['floors', 'towers']) {
    const t0 = Date.now();
    L.layout3d(d, mode);
    // Andares 9→9 em matriz é o caso mais cheio da ferramenta (153 esteiras numa fileira de 72 m): até 0,8 s.
    assert.ok(Date.now() - t0 < (mode === 'floors' ? 800 : 400), `${mode}: ${Date.now() - t0} ms`);
  }
});

test('3D: seguir caminho a partir de entrada, saída ou peça', () => {
  const lay = lay3d(L.butterflyDesign(4, 4, [100], 1e9), 'towers');
  const ins = lay.pieces.filter(p => p.t === 'in'), outs = lay.pieces.filter(p => p.t === 'out');
  const fromIn = L.focus3d(lay, ins[0].id);
  assert.ok(outs.every(o => fromIn.pieces.has(o.id)), 'a entrada chega em todas as saídas');
  assert.ok(ins.slice(1).every(i => !fromIn.pieces.has(i.id)), 'não acende as outras entradas');
  const fromOut = L.focus3d(lay, outs[0].id);
  assert.ok(ins.every(i => fromOut.pieces.has(i.id)), 'a saída vem de todas as entradas');
  const sp = lay.pieces.find(p => p.t === 's');
  const own = L.focus3d(lay, sp.id);
  assert.deepEqual([...own.belts].sort((a, b) => a - b), lay.belts.map((b, bi) => (b.a === sp.id || b.b === sp.id ? bi : -1)).filter(x => x >= 0));
});

test('idiomas: textos de seguir caminho no 3D', () => {
  for (const l of ['pt', 'en', 'es']) inLang(l, () => {
    for (const k of ['follow3d', 'hint3dFocus', 'tip3dTop', 'lgPortOut', 'lgPortIn']) assert.ok(L.t(k).length > 2, `${l}: ${k}`);
    assert.ok(L.t('followAria', 'E1').includes('E1'), l);
  });
});

test('3D: toque só conta com um dedo e sem arrastar', () => {
  const g = L.tapGesture();
  g.down(1, 10, 10);
  assert.equal(g.up(1, 12, 11), true, 'um dedo, parado: toque');
  g.down(1, 10, 10);
  assert.equal(g.up(1, 40, 10), false, 'arrastou: não é toque');
  // Pinça: dois dedos; o segundo sai quase parado e não pode contar como toque, nem o primeiro depois.
  g.down(1, 10, 10); g.down(2, 100, 100);
  assert.equal(g.up(2, 101, 100), false, 'segundo dedo de uma pinça');
  assert.equal(g.up(1, 10, 10), false, 'primeiro dedo de uma pinça');
  // Cancelado (o navegador tomou o gesto): não sobra estado.
  g.down(3, 0, 0); g.cancel(3);
  assert.equal(g.up(3, 0, 0), false, 'depois de cancelar');
  g.down(4, 5, 5);
  assert.equal(g.up(4, 5, 5), true, 'depois de tudo, um toque normal volta a contar');
});

test('3D: esteira misturada leva a cor da saída para onde segue', () => {
  for (const d of [L.balancerDesign('matrix', 4, 4, [100], 1e9), L.butterflyDesign(4, 4, [100], 1e9), L.butterflyDesign(5, 5, [100], 1e9, 'butterfly-loop')]) {
    for (const mode of ['floors', 'towers']) {
      const lay = lay3d(d, mode), at = `${d.kind} ${mode}`;
      const outs = lay.pieces.filter(p => p.t === 'out');
      const reach = (id, seen = new Set()) => { for (const b of lay.belts) if (b.a === id && !seen.has(b.b)) { seen.add(b.b); reach(b.b, seen); } return seen; };
      lay.belts.forEach((b, bi) => {
        if (b.inp >= 0 || b.kind === 'loop') return;
        if (lay.pieces.find(p => p.id === b.b).t === 'sink') return;
        assert.ok(b.out >= 0 && b.out < outs.length, `${at}: esteira ${bi} sem saída`);
        const dest = outs[b.out].id;
        assert.ok(b.b === dest || reach(b.b).has(dest), `${at}: esteira ${bi} não chega na saída ${b.out}`);
      });
    }
  }
});

// ---- Vista 3D: passo a passo peça por peça ----
test('3D peça por peça: um passo por splitter ou merger, na ordem de montagem', () => {
  for (const d of [L.balancerDesign('matrix', 4, 4, [100], 1e9), L.butterflyDesign(4, 4, [100], 1e9), L.balancerDesign('matrix-sink', 2, 5, [100], 1e9), L.balancerDesign('matrix-loop', 2, 5, [100], 1e9)]) {
    for (const mode of ['floors', 'towers']) {
      const lay = lay3d(d, mode), pp = L.byPiece3d(lay), at = `${d.kind} ${mode}`;
      const parts = lay.pieces.filter(p => p.t === 's' || p.t === 'm');
      assert.equal(pp.steps.length, parts.length + 2, at);
      assert.equal(pp.steps[0].key, 'in');
      assert.equal(pp.steps[pp.steps.length - 1].key, 'out');
      const stepOf = new Map(pp.pieces.map(p => [p.id, p.step]));
      pp.steps.slice(1, -1).forEach((st, i) => {
        assert.equal(st.key, 'piece', at);
        assert.equal(stepOf.get(st.id), i + 1, `${at}: a peça do passo ${i + 1} aparece nele`);
      });
      assert.equal(new Set(parts.map(p => stepOf.get(p.id))).size, parts.length, `${at}: cada peça num passo só`);
      // Ordem: nível de hoje primeiro; dentro dele, de baixo para cima e da esquerda para a direita.
      const order = pp.steps.slice(1, -1).map(st => lay.pieces.find(p => p.id === st.id));
      for (let i = 1; i < order.length; i++) {
        const a = order[i - 1], b = order[i];
        assert.ok(a.step < b.step || (a.step === b.step && (a.pos[1] < b.pos[1] || (a.pos[1] === b.pos[1] && a.pos[0] <= b.pos[0]))), `${at}: ordem de montagem`);
      }
      lay.pieces.filter(p => p.t === 'sink').forEach(s => {
        const from = lay.belts.find(b => b.b === s.id).a;
        assert.equal(stepOf.get(s.id), stepOf.get(from), `${at}: sink junto da peça de onde sai`);
      });
      pp.belts.forEach((b, bi) => assert.equal(b.step, Math.max(stepOf.get(b.a), stepOf.get(b.b)), `${at}: esteira ${bi} aparece quando as duas pontas existem`));
      // Ligações do passo: uma por esteira da peça, com o lado e se a outra ponta ainda falta.
      pp.steps.slice(1, -1).forEach(st => {
        const mine = lay.belts.filter(b => b.a === st.id || b.b === st.id);
        assert.equal(st.conns.length, mine.length, at);
        for (const c of st.conns) {
          const b = lay.belts[c.belt], out = b.a === st.id;
          assert.equal(c.dir, out ? 'out' : 'in');
          assert.equal(c.side, out ? b.fromSide : b.toSide);
          assert.equal(c.pending, stepOf.get(out ? b.b : b.a) > stepOf.get(st.id));
        }
      });
    }
  }
});

test('idiomas: texto do passo peça por peça', () => {
  const lay = lay3d(L.butterflyDesign(4, 4, [100], 1e9), 'towers'), pp = L.byPiece3d(lay);
  const labels = { ins: ['E1', 'E2', 'E3', 'E4'], outs: ['S1', 'S2', 'S3', 'S4'] };
  for (const l of ['pt', 'en', 'es']) inLang(l, () => {
    for (const mode of ['towers', 'floors']) {
      const txt = L.pieceText3d(pp.steps[1], labels, mode);
      assert.ok(/Splitter|Merger/.test(txt) && txt.length > 30, `${l} ${mode}: ${txt}`);
    }
    for (const k of ['per3dLevel', 'per3dPiece', 'per3dLabel', 'tip3dPer']) assert.ok(L.t(k).length > 2, `${l}: ${k}`);
  });
  inLang('pt', () => {
    const txt = L.pieceText3d(pp.steps[1], labels, 'towers');
    assert.match(txt, /E\d/, 'diz de qual entrada vem');
    assert.match(txt, /por trás/, 'splitter entra por trás');
  });
});

test('desenho 2D: zoom no ponto e arrastar sem sair do desenho', () => {
  const full = { x: 0, y: 0, w: 800, h: 400 };
  const z = L.zoomView(full, full, 2, 200, 100);
  assert.deepEqual([z.w, z.h], [400, 200], 'aproxima mantendo a proporção');
  assert.deepEqual([z.x, z.y], [100, 50], 'o ponto do cursor fica no lugar');
  assert.equal(L.zoomView(full, full, 0.5, 400, 200).w, 800, 'não afasta além do desenho inteiro');
  assert.equal(L.zoomView(full, full, 100, 400, 200).w, 100, 'no máximo 8×');
  const p = L.panView(z, full, 1000, -1000);
  assert.deepEqual([p.x, p.y], [400, 0], 'arrastar prende na borda');
});

// ---- Planta (2D vista de cima) ----
test('planta: tudo no chão, peças sem encostar, lados de acordo com a geometria', () => {
  for (const d of [L.balancerDesign('matrix-loop', 2, 5, [100], 1e9), L.balancerDesign('funnel-sink', 3, 5, [100], 1e9), L.butterflyDesign(4, 4, [100], 1e9), L.butterflyDesign(5, 5, [100], 1e9, 'butterfly-loop')]) {
    const lay = lay3d(d, 'flat'), at = d.kind;
    assert.equal(lay.bad, 0, `${at}: sem esteira encostada`);
    assert.ok(lay.pieces.every(p => p.pos[1] === 0) && lay.belts.every(b => b.pts.every(q => q[1] === 0)), `${at}: tudo no chão`);
    assert.equal(lay.lifts, 0, `${at}: sem lift`);
    const parts = lay.pieces.filter(p => p.t === 's' || p.t === 'm');
    for (let i = 0; i < parts.length; i++) for (let k = i + 1; k < parts.length; k++) {
      const a = parts[i].pos, b = parts[k].pos;
      assert.ok(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[2] - b[2])) >= 4, `${at}: peças de 4 m sem sobrepor`);
    }
    // Lados na ordem da geometria: a saída da esquerda vai para um destino acima do da direita
    // (esquerda = z menor, para cima no desenho); com três saídas todas para um lado, a ordem se mantém.
    const byId = new Map(lay.pieces.map(p => [p.id, p]));
    parts.filter(p => p.t === 's').forEach(p => {
      const dz = side => { const b = lay.belts.find(x => x.a === p.id && x.fromSide === side); return b ? byId.get(b.b).pos[2] - p.pos[2] : null; };
      const [l, f, r] = ['left', 'front', 'right'].map(dz);
      if (l !== null && r !== null) assert.ok(l < r, `${at}: esquerda acima da direita`);
      if (l !== null && f !== null) assert.ok(l <= f, `${at}: esquerda acima da frente`);
      if (f !== null && r !== null) assert.ok(f <= r, `${at}: frente acima da direita`);
    });
  }
});

test('planta: borboleta sem volta nas pontas (merger recebe do lado de onde a esteira vem)', () => {
  for (const d of [L.butterflyDesign(6, 6, Array(6).fill(455), 480), L.butterflyDesign(3, 3, [100, 100, 100], 1e9), L.butterflyDesign(9, 9, Array(9).fill(100), 1e9)]) {
    const lay = lay3d(d, 'flat'), byId = new Map(lay.pieces.map(p => [p.id, p])), at = `${d.N}→${d.M}`;
    const inner = lay.belts.filter(b => byId.get(b.a).t === 's' && byId.get(b.b).t === 'm');
    inner.forEach(b => {
      const dz = byId.get(b.a).pos[2] - byId.get(b.b).pos[2];
      // Vindo de baixo (z maior) não entra pela esquerda (em cima); vindo de cima não entra pela direita.
      if (dz > 0) assert.notEqual(b.toSide, 'left', `${at}: esteira de baixo entrando por cima`);
      if (dz < 0) assert.notEqual(b.toSide, 'right', `${at}: esteira de cima entrando por baixo`);
      // Saiu pelo lado para o merger da mesma fileira: entra pelo mesmo lado (arco), sem contornar o splitter.
      if (dz === 0 && b.fromSide !== 'front') assert.equal(b.toSide, b.fromSide, `${at}: arco pelo mesmo lado`);
    });
    assert.ok(inner.some(b => b.fromSide === 'left' && b.toSide === 'left') && inner.some(b => b.fromSide === 'right' && b.toSide === 'right'), `${at}: arcos nas duas pontas`);
  }
});

test('planta: espaço em fundações e qual Blueprint Designer comporta', () => {
  const lay = lay3d(L.balancerDesign('matrix-loop', 1, 5, [100], 1e9), 'flat'), fp = L.planFootprint(lay);
  assert.ok(fp.w > 0 && fp.d > 0);
  assert.equal(fp.fw, Math.ceil(fp.w / 8));
  assert.equal(fp.fd, Math.ceil(fp.d / 8));
  assert.equal(fp.mk, Math.max(fp.fw, fp.fd) <= 4 ? 1 : Math.max(fp.fw, fp.fd) <= 5 ? 2 : Math.max(fp.fw, fp.fd) <= 6 ? 3 : 0);
  const at = (w, d) => L.planFootprint({ pieces: [{ id: 0, t: 's', pos: [0, 0, 0] }, { id: 1, t: 'm', pos: [w - 4, 0, d - 4] }], belts: [] });
  assert.equal(at(32, 32).mk, 1, '4×4 fundações: Mk1');
  assert.equal(at(33, 8).mk, 2, '5 fundações: Mk2');
  assert.equal(at(48, 40).mk, 3, '6×5: Mk3');
  assert.equal(at(49, 8).mk, 0, 'mais de 6: nenhum');
});

test('planta: marcações do Blueprint Designer presas na grade de fundações', () => {
  assert.deepEqual([1, 2, 3].map(L.designerSize), [32, 40, 48], 'Mk1 4×4, Mk2 5×5, Mk3 6×6 fundações de 8 m');
  // Grade da planta: linhas em x = 4 + 8k e z = 8k (cada peça fica no meio de uma fundação).
  assert.equal(L.snapGrid(5, 0), 4);
  assert.equal(L.snapGrid(9, 0), 12);
  assert.equal(L.snapGrid(-3.9, 0), -4);
  assert.equal(L.snapGrid(5, 1), 8);
  assert.equal(L.snapGrid(3.9, 1), 0);
  const inside = (m, fp) => [0, 1].every(k => m[k ? 'z' : 'x'] <= fp.min[k] && m[k ? 'z' : 'x'] + L.designerSize(m.mk) >= fp.max[k]);
  const onGrid = m => (m.x - 4) % 8 === 0 && m.z % 8 === 0;
  // 6 → 6 borboleta: cabe no Mk3, e a marcação padrão (#1, Mk3) cobre o balancer inteiro.
  const fp6 = L.planFootprint(lay3d(L.butterflyDesign(6, 6, [240], 480), 'flat'));
  assert.equal(fp6.mk, 3);
  const [m6, ...rest] = L.defaultMarks(fp6);
  assert.equal(rest.length, 0);
  assert.equal(m6.id, 1);
  assert.equal(m6.mk, 3);
  assert.ok(onGrid(m6), JSON.stringify(m6));
  assert.ok(inside(m6, fp6), `cobre ${JSON.stringify(m6)} ${JSON.stringify(fp6)}`);
  // Não cabe em nenhum: nenhuma marcação de início.
  const fp9 = L.planFootprint(lay3d(L.butterflyDesign(9, 9, [240], 480), 'flat'));
  assert.equal(fp9.mk, 0);
  assert.deepEqual(L.defaultMarks(fp9), []);
  // Todo designer que cabe, na posição padrão, fica na grade e cobre o balancer. A exceção é quando a planta
  // não cai alinhada na grade (alguns normais de 7 saídas: 46 m de fundo ocupando 7 fundações): aí fica
  // centrada e corta no máximo uma fundação numa ponta.
  const designs = [[3, 3], [4, 4], [6, 6]].map(([n, m]) => L.butterflyDesign(n, m, [240], 480))
    .concat([[1, 5], [2, 5], [1, 7], [4, 7]].map(([n, m]) => L.balancerDesign(n === 4 ? 'funnel-loop' : 'matrix-loop', n, m, [100], 1e9)));
  for (const des of designs) {
    const fp = L.planFootprint(lay3d(des, 'flat')), n = des.N, m = des.M;
    for (const mk of [1, 2, 3].filter(k => k >= fp.mk && fp.mk)) {
      const d = L.defaultMark(fp, mk), s = L.designerSize(mk), cells = L.planCells(fp);
      const fits = cells.every(([a, b]) => b - a <= s), msg = `${n}→${m} Mk${mk}: ${JSON.stringify(d)} ${JSON.stringify(fp)}`;
      assert.ok(onGrid(d), msg);
      if (fits) assert.ok(inside(d, fp), msg);
      else assert.ok([0, 1].every(k => { const v = k ? d.z : d.x; return v <= fp.min[k] + 8 && v + s >= fp.max[k] - 8; }), msg);
    }
  }
  // Adicionar: numera em sequência, na grade, e nunca exatamente em cima de outra.
  let marks = L.defaultMarks(fp9);
  const c = [(fp9.min[0] + fp9.max[0]) / 2, (fp9.min[1] + fp9.max[1]) / 2];
  for (const mk of [2, 2, 1]) marks = L.addMark(fp9, marks, mk, c);
  assert.deepEqual(marks.map(m => [m.id, m.mk]), [[1, 2], [2, 2], [3, 1]]);
  assert.ok(marks.every(onGrid));
  assert.notDeepEqual([marks[0].x, marks[0].z], [marks[1].x, marks[1].z]);
  // Mover: encaixa na grade e não se afasta do balancer (sempre encosta na faixa que ele ocupa).
  const moved = L.placeMark(fp9, 2, marks[0].x + 13, marks[0].z - 3);
  assert.deepEqual([moved.x, moved.z], [marks[0].x + 16, marks[0].z]);
  // Arrastando (step 1): de metro em metro, fora da grade de fundações.
  const free = L.placeMark(fp9, 2, marks[0].x + 2.4, marks[0].z - 3.2, 1);
  assert.deepEqual([free.x, free.z], [marks[0].x + 2, marks[0].z - 3]);
  const far = L.placeMark(fp9, 2, 1e4, -1e4), cells = L.planCells(fp9);
  assert.equal(far.x, cells[0][1]);
  assert.equal(far.z, cells[1][0] - 40);
  assert.ok(onGrid(far));
});

test('planta: passo por peça numerado, chamando as outras pelo número', () => {
  const lay = L.byPiece3d(lay3d(L.butterflyDesign(4, 4, [100], 1e9), 'flat'));
  const labels = { ins: ['E1', 'E2', 'E3', 'E4'], outs: ['S1', 'S2', 'S3', 'S4'] };
  for (const l of ['pt', 'en', 'es']) inLang(l, () => {
    const txt = L.pieceText3d(lay.steps[1], labels, 'flat');
    assert.match(txt, /^#1 · Splitter 1→2/, `${l}: ${txt}`);
    assert.match(txt, /E\d/, `${l}: diz de qual entrada vem`);
    assert.match(txt, /merger #\d/, `${l}: aponta a peça pelo número`);
    assert.match(L.t('stLevel3d', 'flat', 1, 2, 2, 0, 0, 0), /\d/);
    for (const k of ['perLabel', 'tipPer2d', 'tipSpace', 'planNote', 'lgGrid']) assert.ok(L.t(k).length > 2, `${l}: ${k}`);
  });
});

// ---- Fluido ----
const fluid = { ...base, medium: 'fluid', belt: 'Mk2', cap: 600 };

test('fluido: junctionsFor conta as portas de uma cadeia de Pipeline Junctions', () => {
  assert.equal(L.junctionsFor(2), 0, '1 cano entra, 1 sai: liga direto');
  assert.equal(L.junctionsFor(3), 1);
  assert.equal(L.junctionsFor(4), 1, 'uma junction tem 4 portas');
  assert.equal(L.junctionsFor(5), 2);
  assert.equal(L.junctionsFor(6), 2);
});

test('fluido: sem splitter, Smart Splitter nem balancer no meio', () => {
  const p = L.computePlan({ ...fluid, srcCount: 8, srcRate: 120, dstCount: 12, dstRate: 75 });
  assert.ok(p.fluid);
  for (const a of p.alternatives) {
    assert.ok(['direct', 'header'].includes(a.kind), `tipo ${a.kind}`);
    assert.equal(a.pieces.splitters, 0);
    assert.equal(a.pieces.smart, 0);
    close(a.sinkRate, 0, 'fluido não vai pro sink');
    conserves(p, a);
  }
});

test('fluido: 3 canos de 400 → 4 de 300, coletores com um cano dividido entre os dois', () => {
  const p = L.computePlan({ ...fluid, srcCount: 12, srcRate: 100, srcPer: 4, dstCount: 16, dstRate: 75, dstPer: 4 });
  assert.equal(p.src.lines.length, 3);
  assert.equal(p.dst.lines.length, 4);
  const d = alt(p, 'direto');
  assert.equal(d.full, false, 'direto deixa um destino sem nada');
  const h = alt(p, 'coletor');
  assert.ok(h.full, 'os coletores enchem os 4 destinos');
  assert.equal(p.alternatives[0].key, 'coletor');
  assert.equal(h.view.headers.length, 2, '2 × 300 por coletor de 600');
  assert.equal(h.view.splits.length, 1, 'um cano de origem se divide entre os dois coletores');
  h.view.headers.forEach(hv => assert.ok(hv.inEdges.reduce((s, e) => s + h.sim.flow[e], 0) <= 600 + 1e-6, 'coletor dentro do cano'));
  // 2 coletores com 2 entradas e 2 saídas (1 junction cada) + 1 junction de divisão.
  assert.equal(h.pieces.junctions, 3);
  conserves(p, h);
});

test('fluido: 6 canos de 455 → 5 de 480 enchem tudo com coletores em cadeia', () => {
  const p = L.computePlan({ ...fluid, srcCount: 6, srcRate: 455, dstCount: 5, dstRate: 480 });
  const h = p.alternatives[0];
  assert.equal(h.key, 'coletor');
  assert.ok(h.full);
  conserves(p, h);
});

test('fluido: cano dividido entre três coletores enche na ordem', () => {
  const p = L.computePlan({ ...fluid, srcCount: 15, srcRate: 120, srcPer: 5, dstCount: 4, dstRate: 350 });
  const h = alt(p, 'coletor');
  assert.ok(h.view.splits.some(x => x.sp.headers.length === 3), 'um cano passa por 3 coletores');
  assert.ok(h.full);
  conserves(p, h);
});

test('fluido: o sink vira represar e a coleta conta Pipeline Junctions', () => {
  const p = L.computePlan({ ...fluid, policy: 'sink', srcCount: 10, srcRate: 120, dstCount: 4, dstRate: 120 });
  assert.equal(p.policy, 'represar');
  p.alternatives.forEach(a => close(a.sinkRate, 0));
  assert.equal(p.collectMergers, 8, '2 canos de 5 máquinas, k−1');
});

test('fluido: textos nos três idiomas', () => {
  for (const l of ['pt', 'en', 'es']) inLang(l, () => {
    const p = L.computePlan({ ...fluid, srcCount: 12, srcRate: 100, srcPer: 4, dstCount: 16, dstRate: 75, dstPer: 4 });
    assert.ok(p.alternatives.some(a => a.title === L.t('planHeader')), l);
    assert.match(L.t('stepGroup', { N: 4, clk: '', per: '100', full: 1, perLine: 4, lineRate: '400', src: true, note: 'k−1', rem: 0, fluid: true }), /Pipeline Junctions/);
    assert.ok(L.t('warnPerLineOverPipe', 'x', 7, '700', '600', 6).length > 20);
  });
});

// ---- Link do cenário e issue ----
test('link: ida e volta do cenário, com acento', () => {
  const st = { item: 'Óleo pesado', src: [{ driver: 'machines', count: '42', clock: '', nominal: '65', total: '', per: '' }], dst: [{ driver: 'clock', count: '10', clock: '250', nominal: '40', total: '', per: '6' }], medium: 'fluid', belt: 'Mk4', pipe: 'Mk1', policy: 'extra', excess: 'sink', conv: 'k', selectedKey: 'coletor', lang: 'pt' };
  const enc = L.encodeShare(st);
  assert.match(enc, /^[A-Za-z0-9_-]+$/, 'seguro para URL');
  assert.deepEqual(L.decodeShare(enc), st);
});

test('link: quebrado ou adulterado não carrega lixo', () => {
  assert.equal(L.decodeShare('nada-disso'), null);
  assert.equal(L.decodeShare(L.encodeShare({ src: [], dst: [] })), null);
  const bad = L.decodeShare(L.encodeShare({ item: 'x'.repeat(500), src: [{ driver: 'evil', count: { a: 1 } }], dst: [{}], belt: 'Mk9', policy: 'boom', lang: 'xx', medium: 'gas' }));
  assert.equal(bad.item.length, 80);
  assert.equal(bad.src[0].driver, 'machines');
  assert.equal(typeof bad.src[0].count, 'string');
  assert.equal(bad.belt, 'Mk4');
  assert.equal(bad.policy, 'represar');
  assert.equal(bad.lang, 'en');
  assert.equal(bad.medium, 'item');
});

test('issue: URL do GitHub com título e corpo codificados', () => {
  const u = L.issueUrl('Caso & teste', 'linha 1\nlinha 2 #s=abc');
  assert.ok(u.startsWith('https://github.com/AdolfoCarneiro/sf-balancer/issues/new?title='));
  const q = new URL(u).searchParams;
  assert.equal(q.get('title'), 'Caso & teste');
  assert.equal(q.get('body'), 'linha 1\nlinha 2 #s=abc');
  for (const l of ['pt', 'en', 'es']) inLang(l, () => {
    const body = L.t('issueBody', { link: 'L', item: 'I', medium: 'M', supply: '1', demand: '2', plan: 'P', caseLabel: 'C' });
    for (const x of ['L', 'I', 'M', 'P', 'C']) assert.ok(body.includes(x), `${l}: ${x}`);
  });
});

// Rede de peças do fluxo: cada peça do jeito do jogo e as contas batem com a alternativa.
// extraM: mergers a mais da cascata do retorno (loop com 3+ retornos), que a lógica conta como 1.
const checkNet = (a, extraM = 0) => {
  const n = L.flowNet(a);
  const ins = id => n.belts.filter(b => b.b === id), outs = id => n.belts.filter(b => b.a === id);
  for (const q of n.nodes) {
    if (q.t === 'm') { assert.ok(ins(q.id).length >= 2 && ins(q.id).length <= 3, `merger ${q.id} entradas`); assert.equal(outs(q.id).length, 1); }
    if (q.t === 's') { assert.equal(ins(q.id).length, 1, `splitter ${q.id} entrada`); assert.equal(outs(q.id).length, q.ways); assert.ok(q.ways === 2 || q.ways === 3); }
    if (q.t === 'ov') { assert.equal(ins(q.id).length, 1); assert.ok(outs(q.id).length >= 1 && outs(q.id).length <= 3); }
    if (q.t === 'sink' || q.t === 'extra') assert.equal(ins(q.id).length, 1);
    if (['s', 'm', 'ov'].includes(q.t)) close(ins(q.id).reduce((s, b) => s + b.rate, 0), outs(q.id).reduce((s, b) => s + b.rate, 0), `conserva em ${q.t}${q.id}`);
  }
  const count = t => n.nodes.filter(q => q.t === t).length;
  assert.equal(count('s'), a.pieces.splitters, `splitters em ${a.key}`);
  assert.equal(count('m'), a.pieces.mergers + extraM, `mergers em ${a.key}`);
  assert.equal(count('ov'), a.pieces.smart, `smart em ${a.key}`);
  for (const q of n.nodes.filter(q => q.t === 'dst')) close(ins(q.id).reduce((s, b) => s + b.rate, 0), a.dests.get(q.line.id).got, `destino ${q.line.id}`);
  close(n.nodes.filter(q => q.t === 'sink').reduce((s, q) => s + ins(q.id)[0].rate, 0), a.sinkRate, 'sink');
  return n;
};
const caso1 = () => L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40 });

test('rede de peças: caso 1, todas as alternativas', () => {
  const p = caso1();
  p.alternatives.forEach(a => checkNet(a));
  const a = p.alternatives.find(x => x.groups.some(g => g.mode === 'sink' && g.n === 6));
  const n = L.flowNet(a), blk = n.blocks.find(b => b.key === 'g0');
  assert.equal(blk.kind, 'group');
  assert.equal(blk.nodes.filter(id => n.nodes[id].t === 's').length, 3);
  const sinks = n.nodes.filter(q => q.t === 'sink');
  assert.equal(sinks.length, 1);
  assert.ok(blk.nodes.includes(n.belts.find(b => b.b === sinks[0].id).a), 'o sink sai de uma folha da árvore');
  assert.equal(n.belts.filter(b => b.role === 'donor').length, 1 + 2 + 5, 'doadora, dentro da árvore e as 5 partes');
  // Uma origem por linha de origem e um destino por linha de destino.
  assert.equal(n.nodes.filter(q => q.t === 'src').length, p.src.lines.length);
  assert.equal(n.nodes.filter(q => q.t === 'dst').length, p.dst.lines.length);
});

test('rede de peças: caso 2 e caso 3', () => {
  for (const p of [
    L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 4, dstRate: 440, dstPer: 1, policy: 'sink' }),
    L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40, srcPer: 6 }),
  ]) p.alternatives.forEach(a => checkNet(a));
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 4, dstRate: 440, dstPer: 1, policy: 'sink' });
  const n = checkNet(alt(p, 'direto-sink'));
  assert.equal(n.nodes.filter(q => q.t === 'sink').length, 6, '4 overflows + 2 linhas que sobram, um sink cada');
  assert.ok(n.belts.filter(b => b.role === 'sink').length === 6);
  // Origem parada entra sem esteira.
  const held = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 4, dstRate: 440, dstPer: 1 });
  const hn = checkNet(held.alternatives[0]);
  const srcs = hn.nodes.filter(q => q.t === 'src');
  assert.equal(srcs.length, 6);
  assert.equal(srcs.filter(q => !hn.belts.some(b => b.a === q.id)).length, 2);
});

test('rede de peças: loop de doadora', () => {
  const p = caso1();
  const a = alt(p, 'doadora-1-loop'), gr = a.groups[0], v = a.view.groups[0];
  assert.equal(gr.mode, 'loop');
  const n = checkNet(a), blk = n.blocks.find(b => b.key === 'g0');
  assert.equal(blk.nodes.filter(id => n.nodes[id].t === 'm').length, 1);
  assert.equal(blk.nodes.filter(id => n.nodes[id].t === 's').length, gr.tree.splitters);
  const x = a.sim.flow[v.donorEdge], loops = n.belts.filter(b => b.role === 'loop');
  assert.equal(loops.length, gr.n - gr.p);
  loops.forEach(b => close(b.rate, x / gr.p, 'retorno'));
  const m = blk.nodes.find(id => n.nodes[id].t === 'm');
  close(n.belts.find(b => b.a === m).rate, x * gr.n / gr.p, 'entrada da árvore');
});

test('rede de peças: balancers', () => {
  const plans = [
    caso1(),
    L.computePlan({ ...base, srcGroups: [{ driver: 'total', total: 1440 }, { driver: 'total', total: 300 }], dstCount: 4, dstRate: 430, dstPer: 1 }),
    L.computePlan({ ...base, srcCount: 2, srcRate: 480, srcPer: 1, dstCount: 5, dstRate: 192, dstPer: 1 }),
  ];
  const seen = new Set();
  for (const p of plans) {
    for (const a of p.alternatives.find(x => x.designAlts).designAlts) {
      const n = checkNet(a), blk = n.blocks.find(b => b.key === 'plan');
      assert.equal(blk.kind, 'bal');
      assert.equal(blk.nodes.length, a.pieces.splitters + a.pieces.mergers, 'todas as peças no bloco');
      seen.add(a.bal.design.kind);
    }
  }
  for (const k of [...L.DESIGN_KINDS, 'butterfly', 'butterfly-loop', 'butterfly-sink']) assert.ok(seen.has(k), `design ${k} testado`);
  const bp = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40, blueprints: [{ n: 6, m: 5 }] });
  const a = bp.alternatives[0];
  assert.equal(a.bal.design.kind, 'blueprint');
  const n = checkNet(a), blk = n.blocks.find(b => b.key === 'plan');
  assert.deepEqual(blk.nodes.map(id => n.nodes[id].t), ['bp']);
  const b = blk.nodes[0];
  assert.equal(n.belts.filter(x => x.b === b).length, 6);
  assert.equal(n.belts.filter(x => x.a === b).length, 5);
});

test('rede de peças: caso C com 5 linhas num destino', () => {
  const p = L.computePlan({ ...base, srcCount: 10, srcRate: 100, dstCount: 2, dstRate: 480, srcPer: 1, dstPer: 1 });
  const a = alt(p, 'juntar');
  assert.ok(a.view.feeds.every(f => f.f.mains.length === 5));
  p.alternatives.forEach(x => checkNet(x));
  const n = L.flowNet(a);
  // Cada destino recebe de uma cascata de 2 mergers (3 + 2), nenhum com mais de 3 entradas.
  assert.equal(n.nodes.filter(q => q.t === 'm').length, 4);
  for (const d of n.nodes.filter(q => q.t === 'dst')) {
    const last = n.belts.find(b => b.b === d.id).a;
    assert.equal(n.nodes[last].t, 'm');
    const prev = n.belts.filter(b => b.b === last).map(b => n.nodes[b.a].t);
    assert.deepEqual(prev.sort(), ['m', 'src', 'src']);
  }
});

test('rede de peças: retorno com 3+ esteiras vira cascata de mergers', () => {
  // Doadora ÷13 → árvore de 16, 3 retornos: 4 entradas no retorno = 2 mergers (a lógica conta 1).
  const p = L.computePlan({ ...base, srcCount: 14, srcRate: 470, srcPer: 1, dstCount: 13, dstRate: 480, dstPer: 1 });
  const a = alt(p, 'doadora-1-loop');
  assert.deepEqual([a.groups[0].p, a.groups[0].n], [13, 16]);
  const n = checkNet(a, 1), blk = n.blocks.find(b => b.key === 'g0');
  assert.equal(blk.nodes.filter(id => n.nodes[id].t === 'm').length, 2);
  assert.equal(n.belts.filter(b => b.role === 'loop').length, 3);
  // Balancer 1→20 com loop dividido: 2 árvores de 24, 4 retornos cada = 1 merger a mais por árvore.
  const q = L.computePlan({ ...base, srcCount: 1, srcRate: 480, srcPer: 1, dstCount: 20, dstRate: 23.52, dstPer: 1 });
  const b = alt(q, 'balancer-matrix-split-loop');
  checkNet(b, 2);
});

// Layout do fluxo: colunas pela profundidade, linhas sem empilhar e portas como no jogo.
const checkLayout = a => {
  const n = L.flowNet(a), lay = L.flowLayout(n), pos = id => lay.nodes.get(id);
  const ins = id => n.belts.filter(b => b.b === id), outs = id => n.belts.filter(b => b.a === id);
  n.belts.filter(b => b.role !== 'loop').forEach(b => assert.ok(pos(b.b).col > pos(b.a).col, `esteira ${b.id} anda para a direita em ${a.key}`));
  const dsts = n.nodes.filter(q => q.t === 'dst');
  dsts.forEach(q => assert.equal(pos(q.id).col, lay.cols - 1, 'destino na última coluna'));
  n.nodes.filter(q => q.t !== 'dst').forEach(q => assert.ok(pos(q.id).col <= lay.cols - 1));
  const byLine = dsts.slice().sort((x, y) => x.line.id - y.line.id);
  byLine.forEach((q, i) => i && assert.ok(pos(q.id).row > pos(byLine[i - 1].id).row, 'destinos pela ordem das linhas'));
  n.nodes.filter(q => q.t === 'src').forEach(q => assert.equal(pos(q.id).col, 0));
  const seen = new Set();
  for (const q of n.nodes) {
    const k = `${pos(q.id).col}:${pos(q.id).row}`;
    assert.ok(!seen.has(k), `duas peças em ${k} em ${a.key}`);
    seen.add(k);
    const fs = outs(q.id).map(b => lay.belts.get(b.id).from), ts = ins(q.id).map(b => lay.belts.get(b.id).to);
    fs.forEach(s => assert.ok(['front', 'left', 'right'].includes(s)));
    ts.forEach(s => assert.ok(['back', 'left', 'right'].includes(s)));
    if (q.t === 'bp') continue;
    assert.equal(new Set(fs).size, fs.length, `lados de saída distintos em ${q.t}${q.id}`);
    assert.equal(new Set(ts).size, ts.length, `lados de entrada distintos em ${q.t}${q.id}`);
    if (q.t === 's' || q.t === 'ov') assert.deepEqual(ts, ['back']);
    if (q.t === 'm') assert.deepEqual(fs, ['front']);
    if (['dst', 'sink', 'extra'].includes(q.t)) assert.ok(ts.length <= 1);
  }
  return { n, lay };
};

test('layout do fluxo: colunas e portas', () => {
  caso1().alternatives.forEach(checkLayout);
  for (const p of [
    caso1(),
    L.computePlan({ ...base, srcGroups: [{ driver: 'total', total: 1440 }, { driver: 'total', total: 300 }], dstCount: 4, dstRate: 430, dstPer: 1 }),
    L.computePlan({ ...base, srcCount: 2, srcRate: 480, srcPer: 1, dstCount: 5, dstRate: 192, dstPer: 1 }),
  ]) p.alternatives.find(x => x.designAlts).designAlts.forEach(checkLayout);
  checkLayout(L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40, blueprints: [{ n: 6, m: 5 }] }).alternatives[0]);
  checkLayout(alt(L.computePlan({ ...base, srcCount: 14, srcRate: 470, srcPer: 1, dstCount: 13, dstRate: 480, dstPer: 1 }), 'doadora-1-loop'));
  checkLayout(alt(L.computePlan({ ...base, srcCount: 1, srcRate: 480, srcPer: 1, dstCount: 20, dstRate: 23.52, dstPer: 1 }), 'balancer-matrix-split-loop'));
  L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 4, dstRate: 440, dstPer: 1, policy: 'sink' }).alternatives.forEach(checkLayout);
  L.computePlan({ ...base, srcCount: 10, srcRate: 100, dstCount: 2, dstRate: 480, srcPer: 1, dstPer: 1 }).alternatives.forEach(checkLayout);
  // Caso A direto: cada origem na linha do destino que alimenta, 2 colunas.
  const { n, lay } = checkLayout(alt(L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 4, dstRate: 440, dstPer: 1 }), 'direto'));
  assert.equal(lay.cols, 2);
  n.belts.filter(b => n.nodes[b.b].t === 'dst').forEach(b => assert.equal(lay.nodes.get(b.a).row, lay.nodes.get(b.b).row));
});

// Desenho do fluxo: cada peça da rede vira uma peça no SVG, com o bloco clicável.
test('fluxo desenhado em peças', async () => {
  const { flowSvg } = await import('../src/ui/flow.js');
  const p = caso1(), count = (s, t) => (s.match(new RegExp(`data-piece="${t}"`, 'g')) || []).length;
  const alts = [...p.alternatives, ...p.alternatives.find(x => x.designAlts).designAlts];
  const bp = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 60, dstRate: 40, blueprints: [{ n: 6, m: 5 }] });
  for (const a of [...alts, bp.alternatives[0]]) {
    const svg = flowSvg(a === bp.alternatives[0] ? bp : p, a);
    assert.ok(!/NaN|undefined/.test(svg), `NaN/undefined em ${a.key}`);
    assert.equal(count(svg, 's'), a.pieces.splitters, `splitters em ${a.key}`);
    assert.equal(count(svg, 'm'), a.pieces.mergers, `mergers em ${a.key}`);
    assert.equal(count(svg, 'ov'), a.pieces.smart, `smart em ${a.key}`);
    L.flowNet(a).blocks.forEach(b => assert.ok(svg.includes(`data-open-bal="${b.key}"`), `bloco ${b.key} em ${a.key}`));
  }
  assert.equal(count(flowSvg(bp, bp.alternatives[0]), 'bp'), 1);
  // Caso 2 direto: pequeno, sem rolagem.
  const p2 = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 4, dstRate: 440, dstPer: 1 });
  assert.match(flowSvg(p2, alt(p2, 'direto')), /viewBox="0 0 960 /);
  // Modo fluido: o desenho de antes (coletor com Junction), sem peças.
  const f = L.computePlan({ ...base, medium: 'fluid', belt: 'Mk2', cap: 600, srcCount: 12, srcRate: 100, srcPer: 4, dstCount: 16, dstRate: 75, dstPer: 4 });
  f.alternatives.forEach(a => { const s = flowSvg(f, a); assert.ok(!s.includes('data-piece')); });
  assert.ok(f.alternatives.some(a => flowSvg(f, a).includes('Junction')));
});
