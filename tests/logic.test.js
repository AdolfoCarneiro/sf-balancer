// Roda com: node --test tests/logic.test.js
// Extrai o bloco de lógica pura do index.html e testa com os casos do AGENTS.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf('// LOGIC-START'), html.indexOf('// LOGIC-END'));
const mod = { exports: {} };
new Function('module', src)(mod);
const L = mod.exports;

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
  assert.equal(g.tree.splitters, 4);
  assert.deepEqual(g.tree.factors, [3, 2]);
  assert.ok(sink.full);
  assert.equal(sink.pieces.mergers, 5);
  assert.equal(sink.pieces.splitters, 4);
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
  const p = L.computePlan({ ...base, srcCount: 42, srcRate: 65, dstCount: 44, dstRate: 40, policy: 'sink' });
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
  const p = L.computePlan({ ...base, cap: 780, belt: 'Mk5', dstCount: 45, dstRate: 40,
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
  assert.equal(L.splitTree(6).splitters, 4);
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
  assert.equal(g.perLine, 12, '480 / 39,43 = 12 por linha');
  assert.deepEqual(p.dst.lines.map(l => l.machines), [12, 12, 12, 8]);
  close(p.dst.lines[0].rate, 12 * 1735.14 / 44);
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

// ---- Idiomas ----
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
  assert.equal(en.tree, '1 splitter into 3, then 3 splitters into 2 (one on each output) = 6 parts');
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
  const r = best(2, 5, 240, 480, []);
  assert.equal(r[0].kind, 'matrix-loop');
  close(r[0].perOut, 96);
  assert.equal(r[0].pieces.splitters, 8);
  assert.equal(r[0].pieces.mergers, 7, '2 de loop + 5 saídas');
  const f = kind(r, 'funnel-loop');
  close(f.perOut, 80, 'esteira do loop do funil (576) limita a 480');
  assert.ok(f.segments.some(s => s.key === 'loop' && !s.ok));
  assert.equal(L.designWhy(r).code, 'more');
});

test('balancer: em baixa vazão o funil com loop ganha por ter menos peças', () => {
  const r = best(2, 5, 60, 480, []);
  assert.equal(r[0].kind, 'funnel-loop');
  assert.equal(L.designPieces(r[0]), 6);
  assert.equal(L.designWhy(r).code, 'fewer');
});

test('balancer: sink só perde para o loop no desempate', () => {
  const r = best(1, 7, 480, 480, []);
  close(kind(r, 'matrix-loop').perOut, kind(r, 'matrix-sink').perOut);
  assert.equal(r[0].kind, 'matrix-loop');
  assert.equal(L.designWhy(r).code, 'noSink');
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
  assert.equal(a.pieces.splitters, 24);
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
  assert.equal(L.butterflyDesign(3, 4, [480], 480).applies, 'butterflyShape', 'entradas ≠ saídas');
  assert.equal(L.butterflyDesign(5, 5, [480], 480).applies, 'butterflyShape', '5 não é feito de 2 e 3');
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
  assert.equal(a.bal.design.kind, 'butterfly');
  assert.ok(a.full);
  a.dests.forEach(d => close(d.got, 430));
  assert.equal(a.pieces.splitters, 8);
  assert.equal(a.pieces.mergers, 8);
  conserves(p, a);
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
