import { I18N, LANGS, getLang, setLang, t, srcTag, dstTag, fmt, parseNum } from './i18n/index.js';

// LOGIC-START: funções puras, testadas em tests/logic.test.js

const BELTS = [
  { id: 'Mk1', cap: 60 }, { id: 'Mk2', cap: 120 }, { id: 'Mk3', cap: 270 },
  { id: 'Mk4', cap: 480 }, { id: 'Mk5', cap: 780 }, { id: 'Mk6', cap: 1200 },
];
// Fluido vai em cano (m³/min). Cano não tem splitter: a Pipeline Junction junta ou divide sem garantir partes iguais.
const PIPES = [{ id: 'Mk1', cap: 300 }, { id: 'Mk2', cap: 600 }];
const EPS = 1e-6;
const INF = Infinity;

// Aceita o formato novo ({ driver, count, clock, nominal, total, per }) e o antigo ({ mode, count, rate, per }).
function normalizeGroup(g) {
  if (g.driver) return g;
  if (g.mode === 'total') return { driver: 'total', total: g.rate, per: g.per };
  return { driver: 'machines', count: g.count, nominal: g.rate, per: g.per };
}

// O campo que manda define o grupo: máquinas fracionadas, inteiras com clock, ou total.
// Devolve as três equivalências e a taxa real de cada máquina.
function resolveGroup(raw) {
  const g = normalizeGroup(raw);
  const nominal = g.nominal > 0 ? g.nominal : 0;
  let n, N, total;
  if (g.driver === 'total') {
    total = g.total;
    if (!nominal) return { continuous: true, total, per: g.per || 0 };
    n = total / nominal;
    N = Math.max(1, Math.ceil(n - EPS));
  } else if (g.driver === 'clock') {
    N = Math.max(1, Math.ceil(g.count - EPS));
    total = g.count * nominal * g.clock / 100;
    n = total / nominal;
  } else {
    n = g.count;
    N = Math.max(1, Math.ceil(n - EPS));
    total = n * nominal;
  }
  const perMachine = total / N;
  return { continuous: false, n, N, total, perMachine, clock: perMachine / nominal, nominal, per: g.per || 0 };
}

// Linhas de esteira a partir de vários grupos. Cada grupo enche linhas com a taxa real por máquina;
// as máquinas que sobram de cada grupo são empacotadas juntas, maior primeiro.
// balance: no automático, divide o grupo em linhas iguais (14 → 7 + 7) em vez de encher e deixar a sobra.
// mix: false mantém as sobras de cada grupo em linhas próprias.
function buildLines(groups, cap, side = t('group'), fluid = false, { balance = false, mix = true } = {}) {
  const lines = [], info = [], warnings = [], loose = [];
  const name = gi => (groups.length > 1 ? t('groupOf', side, gi + 1) : side);
  groups.forEach((raw, gi) => {
    const r = resolveGroup(raw);
    if (r.continuous) {
      const full = Math.floor(r.total / cap + EPS);
      for (let i = 0; i < full; i++) lines.push({ machines: 0, rate: cap, partial: false, comp: [{ gi, total: true, rate: cap }] });
      const rem = r.total - full * cap;
      if (rem > EPS) lines.push({ machines: 0, rate: rem, partial: true, comp: [{ gi, total: true, rate: rem }] });
      info.push({ gi, ...r, lines: full + (rem > EPS ? 1 : 0) });
      return;
    }
    if (r.clock > 2.5 + EPS || r.clock < 0.01 - EPS) warnings.push({ level: 'warn', text: t('warnClock', name(gi), fmt(r.clock * 100, 2)) });
    const eff = Math.min(r.perMachine, cap);
    if (r.perMachine > cap + EPS) warnings.push({ level: 'warn', text: t(fluid ? 'warnMachineOverPipe' : 'warnMachineOverBelt', name(gi), fmt(r.perMachine), fmt(cap), fmt(r.perMachine - cap)) });
    const auto = Math.max(1, Math.floor(cap / eff + EPS));
    const perLine = r.per > 0 ? Math.floor(r.per) : auto;
    if (perLine * eff > cap + EPS) warnings.push({ level: 'bad', text: t(fluid ? 'warnPerLineOverPipe' : 'warnPerLineOver', name(gi), perLine, fmt(perLine * eff), fmt(cap), auto) });
    if (balance && !(r.per > 0)) {
      const n = Math.ceil(r.N / auto), k = Math.floor(r.N / n), big = r.N - k * n;
      const sizes = Array.from({ length: n }, (_, i) => (i < big ? k + 1 : k));
      for (const m of sizes) lines.push({ machines: m, rate: m * eff, partial: false, comp: [{ gi, count: m, rate: eff }] });
      info.push({ gi, ...r, auto, perLine: sizes[0], fullLines: big || n, lineRate: sizes[0] * eff, rem: 0, sizes, eff, balanced: true });
      return;
    }
    const full = Math.floor(r.N / perLine);
    for (let i = 0; i < full; i++) lines.push({ machines: perLine, rate: perLine * eff, partial: false, comp: [{ gi, count: perLine, rate: eff }] });
    const rem = r.N - full * perLine;
    for (let i = 0; i < rem; i++) loose.push({ gi, rate: eff });
    const sizes = Array(full).fill(perLine).concat(rem ? [rem] : []);
    info.push({ gi, ...r, auto, perLine, fullLines: full, lineRate: perLine * eff, rem, sizes, eff });
  });
  loose.sort((a, b) => b.rate - a.rate || a.gi - b.gi);
  const packed = [];
  for (const m of loose) {
    let line = packed.find(l => l.rate + m.rate <= cap + EPS && (mix || l.comp[0].gi === m.gi));
    if (!line) { line = { machines: 0, rate: 0, partial: true, comp: [] }; packed.push(line); }
    line.machines++;
    line.rate += m.rate;
    const c = line.comp.find(x => x.gi === m.gi);
    if (c) c.count++; else line.comp.push({ gi: m.gi, count: 1, rate: m.rate });
  }
  lines.push(...packed);
  // Sem mistura, as linhas saem na ordem dos grupos (a sobra do grupo 1 vem antes das linhas do grupo 2).
  if (!mix) lines.sort((a, b) => a.comp[0].gi - b.comp[0].gi);
  return { lines, groups: info, packed: packed.length, warnings, total: lines.reduce((a, l) => a + l.rate, 0) };
}

// Tamanhos das linhas de um grupo agrupados: [15, 15, 15, 14] → 3 de 15 + 1 de 14.
function sizeParts(sizes, eff) {
  const parts = [];
  for (const k of sizes) {
    const p = parts.find(x => x.k === k);
    if (p) p.n++; else parts.push({ n: 1, k, rate: fmt(k * eff) });
  }
  return parts;
}

// Texto curto da composição de uma linha: "12 × 39,4" ou "1 × 200 + 1 × 120".
function lineComp(l) {
  if (!l.comp) return `${l.machines} × ${fmt(l.rate / Math.max(1, l.machines))}`;
  return l.comp.map(c => (c.total ? t('continuousFlow') : `${c.count} × ${fmt(c.rate)}`)).join(' + ');
}

// Resumo das taxas: "5 × 455 + 1 × 300".
function summarizeRates(lines) {
  const counts = [];
  for (const l of lines) {
    const c = counts.find(x => Math.abs(x.rate - l.rate) < EPS);
    if (c) c.n++; else counts.push({ rate: l.rate, n: 1 });
  }
  return counts.map(c => `${c.n} × ${fmt(c.rate)}`).join(' + ');
}

// Peças de manifold (mergers na coleta, splitters na distribuição).
function manifoldPieces(lines, conv) {
  return lines.reduce((acc, l) => acc + (conv === 'k' ? l.machines : Math.max(0, l.machines - 1)), 0);
}

// Splitter só divide direto em produtos de 2 e 3.
function isDirect(n) {
  if (n < 1) return false;
  while (n % 2 === 0) n /= 2;
  while (n % 3 === 0) n /= 3;
  return n === 1;
}
function nextDirect(n) { let m = Math.max(1, n); while (!isDirect(m)) m++; return m; }

// Árvore de splitters para n partes (n direto): primeiro os 2, depois os 3. Cada nível custa o produto
// dos anteriores, então o fator menor em cima gasta menos: 6 = 2 × 3 são 3 splitters (3 × 2 seriam 4).
function splitTree(n) {
  const factors = [];
  let m = n;
  while (m % 2 === 0) { factors.push(2); m /= 2; }
  while (m % 3 === 0) { factors.push(3); m /= 3; }
  let splitters = 0, prod = 1;
  const levels = [];
  for (const f of factors) { levels.push({ count: prod, ways: f }); splitters += prod; prod *= f; }
  return { parts: n, factors, levels, splitters };
}
function describeTree(tree) {
  if (tree.parts === 1) return t('treeNone');
  return t('treeDesc', tree.levels, tree.parts);
}

// Opções para dividir uma doadora de taxa s em p partes iguais, cada uma cobrindo maxDeficit.
function divisionOptions(s, p, maxDeficit, cap) {
  if (isDirect(p)) {
    const tree = splitTree(p);
    return { direct: true, p, n: p, tree, part: s / p, ok: s / p + EPS >= maxDeficit };
  }
  const n = nextDirect(p);
  const tree = splitTree(n);
  const loopLoad = s * n / p;
  return {
    direct: false, p, n, tree,
    loop: {
      part: s / p, ok: s / p + EPS >= maxDeficit,
      recirculate: n - p, mergers: 1, beltLoad: loopLoad, beltOk: loopLoad <= cap + EPS,
    },
    sink: { part: s / n, ok: s / n + EPS >= maxDeficit, sinkParts: n - p, sinkRate: s * (n - p) / n },
  };
}

// Mergers para juntar `inputs` esteiras numa só (merger tem até 3 entradas, em cascata).
function mergersFor(inputs) { return inputs <= 1 ? 0 : Math.ceil((inputs - 1) / 2); }
// Pipeline Junctions para ligar `ports` canos num ponto só: cada junction tem 4 portas e
// cada ligação entre duas junctions gasta duas, então j junctions em cadeia dão 2j + 2 portas.
function junctionsFor(ports) { return ports <= 2 ? 0 : Math.ceil((ports - 2) / 2); }
// Quantas entradas já estão juntas na saída de cada merger da cascata: o primeiro pega 3, os outros +2.
function chainSizes(inputs) {
  const out = [];
  for (let k = 0; inputs > 1 && k < inputs;) { k = Math.min(inputs, k === 0 ? 3 : k + 2); out.push(k); }
  return out;
}
// Em qual merger da cascata entra a entrada i.
const chainSlot = i => (i < 3 ? 0 : 1 + Math.floor((i - 3) / 2));

// ---- Biblioteca de load balancers N→M ----
// Matriz: cada entrada vira M partes numa árvore de splitters e cada saída junta uma parte de cada entrada.
// Funil: junta tudo numa esteira e divide em M. Quando M não é produto de 2 e 3, divide em n (o próximo
// que é) e manda as n−M partes extras de volta pra entrada (loop) ou pro sink.
// Matriz com loop dividido: cada entrada passa antes por um splitter em 2 e cada metade tem o seu loop. Com a
// entrada cheia, o loop da matriz comum estoura a esteira (leva n/M da entrada); o de meia entrada cabe.
const DESIGN_KINDS = ['matrix', 'funnel', 'matrix-loop', 'funnel-loop', 'matrix-split-loop', 'matrix-sink', 'funnel-sink'];

function balancerDesign(kind, N, M, rates, cap) {
  const r = Array.from({ length: N }, (_, i) => rates[Math.min(i, rates.length - 1)] || 0);
  const total = r.reduce((a, b) => a + b, 0), rMax = Math.max(0, ...r);
  const direct = isDirect(M);
  const loop = kind.endsWith('-loop'), sink = kind.endsWith('-sink'), funnel = kind.startsWith('funnel');
  const halves = kind === 'matrix-split-loop', V = halves ? 2 * N : N;
  let applies = null;
  if (N < 1 || M < 2) applies = 'shape';
  else if (!loop && !sink && !direct) applies = 'notDirect';
  else if ((loop || sink) && direct) applies = 'direct';
  else if (funnel && N < 2) applies = 'oneInput';
  const n = direct ? M : nextDirect(M);
  if (!applies && halves && rMax * n / M <= cap + EPS) applies = 'loopFits';
  const tree = splitTree(n);
  const extra = n - M;
  const chain = chainSizes(V);
  const segments = [];
  const add = (key, rate, arg) => segments.push({ key, rate, arg, ok: rate <= cap + EPS });
  add('in', rMax);
  let treeIn, perOut, sinkRate = 0, splitters, mergers;
  if (funnel) {
    const sorted = r.slice().sort((a, b) => b - a);
    chain.slice(0, -1).forEach(k => add('chainIn', sorted.slice(0, k).reduce((a, b) => a + b, 0), k));
    if (N > 1) add('funnel', total);
    const fed = Math.min(total, cap);
    treeIn = loop ? total * n / M : total;
    perOut = loop ? Math.min(total, cap * M / n) / M : sink ? fed / n : fed / M;
    if (sink) sinkRate = fed * extra / n;
    splitters = tree.splitters;
    mergers = chain.length + (loop ? 1 : 0);
  } else {
    // Com metades, cada árvore recebe meia entrada.
    const part = halves ? 2 : 1;
    if (halves) add('half', rMax / 2);
    treeIn = loop ? rMax / part * n / M : rMax;
    perOut = Math.min(cap, loop ? r.reduce((a, x) => a + part * Math.min(x / part, cap * M / n), 0) / M : sink ? total / n : total / M);
    if (sink) sinkRate = total * extra / n;
    splitters = V * tree.splitters + (halves ? N : 0);
    mergers = M * chain.length + (loop ? V : 0);
  }
  if (loop) add('loop', treeIn);
  let prod = 1;
  tree.factors.slice(0, -1).forEach(f => { prod *= f; add('level', treeIn / prod, prod); });
  add('part', treeIn / n, n);
  if (!funnel) chain.slice(0, -1).forEach(k => add('chain', k * treeIn / n, k));
  add('out', funnel ? treeIn / n : (sink ? total / n : total / M));
  return { kind, N, M, n, tree, extra, rates: r, total, cap, applies, segments, perOut, sinkRate, chain, pieces: { splitters, mergers, blueprints: 0 } };
}

// Blueprint do jogador: caixa-preta N→M. Serve quando tem exatamente M saídas (saída sobrando desequilibra
// a árvore) e pelo menos N entradas (entrada vazia não atrapalha o merger).
function blueprintDesign(bp, N, M, rates, cap) {
  const r = Array.from({ length: N }, (_, i) => rates[Math.min(i, rates.length - 1)] || 0);
  const total = r.reduce((a, b) => a + b, 0);
  const segments = [{ key: 'in', rate: Math.max(0, ...r), ok: Math.max(0, ...r) <= cap + EPS }, { key: 'out', rate: total / M, ok: total / M <= cap + EPS }];
  return {
    kind: 'blueprint', bp, N, M, n: M, extra: 0, rates: r, total, cap, segments, chain: [],
    applies: bp.m !== M || bp.n < N ? 'bpShape' : null,
    perOut: Math.min(cap, total / M), sinkRate: 0, pieces: { splitters: 0, mergers: 0, blueprints: 1 },
  };
}

// Borboleta: K faixas misturadas em rodadas de blocos f→f (f = 2 ou 3, os fatores de K).
// Na rodada s, as faixas que só diferem no dígito s (base mista) formam um bloco: cada uma vai num
// splitter em f e cada merger junta uma parte de cada faixa do bloco. Depois de todas as rodadas,
// cada faixa leva 1/K de tudo que entrou.
function butterflyGroup(F, s, i) {
  const stride = F.slice(0, s).reduce((a, b) => a * b, 1);
  const base = i - (Math.floor(i / stride) % F[s]) * stride;
  return Array.from({ length: F[s] }, (_, k) => base + k * stride);
}

// K = o próximo número feito de 2 e 3 que cabe as entradas e as saídas. Faixa sem entrada fica vazia:
// sai o splitter dela, e a faixa que recebe uma parte só segue direto, sem merger. As K − M faixas que
// sobram na saída voltam pro começo da própria faixa (loop) ou vão pro sink.
const BF_KINDS = ['butterfly', 'butterfly-loop', 'butterfly-sink'];
function combos(n, k) {
  const out = [];
  const rec = (from, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = from; i <= n - (k - acc.length); i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}
function orders(F) {
  if (F.length <= 1) return [F.slice()];
  const seen = new Set(), out = [];
  F.forEach((f, i) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const rest of orders(F.filter((_, j) => j !== i))) out.push([f, ...rest]);
  });
  return out;
}
// Rodadas a partir das faixas vivas no começo: splitter só em faixa com item, merger só onde chegam 2+ partes.
function bfRounds(F, K, live0) {
  let live = live0.slice(), splitters = 0, mergers = 0;
  const rounds = F.map((f, s) => {
    const splits = [], merges = [], next = Array(K).fill(false);
    for (let l = 0; l < K; l++) if (live[l]) splits.push(l);
    for (let l = 0; l < K; l++) {
      const from = butterflyGroup(F, s, l).filter(j => live[j]);
      if (!from.length) continue;
      next[l] = true;
      merges.push({ lane: l, from });
      if (from.length > 1) mergers++;
    }
    splitters += splits.length;
    live = next;
    return { f, splits, merges };
  });
  return { rounds, splitters, mergers };
}
const BF_NETS = new Map();
function butterflyNet(kind, N, M) {
  const key = `${kind}:${N}:${M}`;
  if (BF_NETS.has(key)) return BF_NETS.get(key);
  const K = nextDirect(Math.max(N, M)), E = K - M, loop = kind === 'butterfly-loop';
  const lanes = Array.from({ length: K }, (_, l) => l);
  // Até 9 faixas dá para testar todas as posições; acima disso, entradas em cima e faixas extras embaixo.
  const all = K <= 9;
  const inSets = all ? combos(K, N) : [lanes.slice(0, N)];
  const exSets = !loop ? [lanes.slice(M)] : all ? combos(K, E) : [lanes.slice(K - E)];
  let best = null;
  for (const F of orders(splitTree(K).factors)) {
    for (const I of inSets) {
      for (const X of exSets) {
        const isIn = lanes.map(l => I.includes(l)), isX = lanes.map(l => X.includes(l));
        const r = bfRounds(F, K, lanes.map(l => isIn[l] || (loop && isX[l])));
        // Retorno numa faixa com entrada pede merger e carrega entrada + retorno: evita antes de contar peças.
        const loopMergers = loop ? X.filter(l => isIn[l]) : [];
        const pieces = r.splitters + r.mergers + loopMergers.length;
        if (best && (loopMergers.length > best.loopMergers.length || (loopMergers.length === best.loopMergers.length && pieces >= best.pieces))) continue;
        best = { K, F, inLane: I, outLane: lanes.filter(l => !isX[l]), extra: X, loopMergers, pieces, ...r, mergers: r.mergers + loopMergers.length };
      }
    }
  }
  BF_NETS.set(key, best);
  return best;
}

function butterflyDesign(N, M, rates, cap, kind = 'butterfly') {
  const r = Array.from({ length: N }, (_, i) => rates[Math.min(i, rates.length - 1)] || 0);
  const total = r.reduce((a, b) => a + b, 0);
  const K = nextDirect(Math.max(N, M, 1)), loop = kind === 'butterfly-loop', sink = kind === 'butterfly-sink';
  let applies = null;
  if (N < 2 || M < 2) applies = 'butterflyShape';
  else if (kind === 'butterfly' && K !== M) applies = 'bfExtra';
  else if (kind !== 'butterfly' && K === M) applies = 'direct';
  const net = applies ? null : butterflyNet(kind, N, M);
  const segments = [];
  const add = (key, rate, arg) => segments.push({ key, rate, arg, ok: rate <= cap + EPS });
  add('in', Math.max(0, ...r));
  let u = 0;
  if (net) {
    // Regime permanente: cada faixa que volta leva o mesmo que uma saída (total / M).
    const back = total / M;
    const v = Array(K).fill(0);
    net.inLane.forEach((l, i) => { v[l] += r[i]; });
    if (loop) {
      net.extra.forEach(l => { v[l] += back; });
      add('bfLoop', back);
      if (net.loopMergers.length) add('bfLoopIn', Math.max(...net.loopMergers.map(l => v[l])));
    }
    let cur = v;
    net.rounds.forEach((rd, s) => {
      add('bfPart', Math.max(...rd.splits.map(l => cur[l])) / rd.f, s + 1);
      const next = Array(K).fill(0);
      rd.merges.forEach(m => { next[m.lane] = m.from.reduce((a, j) => a + cur[j], 0) / rd.f; });
      cur = next;
      if (s < net.rounds.length - 1) add('bfOut', Math.max(...rd.merges.filter(m => m.from.length > 1).map(m => cur[m.lane]), 0), s + 1);
    });
    u = cur[net.outLane[0]];
    add('out', u);
  } else add('out', total / M);
  // Trecho acima da esteira: tudo anda mais devagar na mesma proporção.
  const scale = Math.min(1, ...segments.map(sg => (sg.rate > EPS ? cap / sg.rate : 1)));
  return {
    kind, N, M, n: K, extra: net ? K - M : 0, net, factors: net ? net.F : [], tree: splitTree(K), rates: r, total, cap, applies, segments, chain: [],
    perOut: net ? u * scale : Math.min(cap, total / M), sinkRate: sink && net ? u * scale * (K - M) : 0,
    pieces: { splitters: net ? net.splitters : 0, mergers: net ? net.mergers : 0, blueprints: 0 },
  };
}

// Montagem vertical: cada camada de peças num andar, ligados por lifts.
// Andar = profundidade da peça a partir das entradas (o retorno do loop não conta). Um lift por ligação
// entre peças de andares diferentes; entradas chegam e saídas saem no andar da própria peça.
// x (0..1) é a posição na fachada, para desenhar o corte.
function designFloors(d) {
  const nodes = [], edges = [];
  const node = (t, floor, x, extra = {}) => nodes.push({ id: nodes.length, t, floor, x, ...extra }) - 1;
  const edge = (a, b, inp, kind = 'n') => edges.push({ a, b, inp, kind });
  const N = d.N, M = d.M, ins = [], outs = [];
  if (d.kind === 'blueprint' || d.applies) return null;
  for (let i = 0; i < N; i++) ins.push(node('in', 0, (i + 0.5) / N, { inp: i }));
  if (d.net) {
    // Uma faixa por coluna da fachada; o merger do retorno (se houver) fica no primeiro andar.
    const net = d.net, K = net.K, x = l => (l + 0.5) / K, sh = net.loopMergers.length ? 1 : 0;
    let cur = Array(K).fill(null);
    const inp = Array(K).fill(-1), start = Array(K).fill(null);
    net.inLane.forEach((l, i) => { cur[l] = ins[i]; inp[l] = i; nodes[ins[i]].x = x(l); });
    net.loopMergers.forEach(l => { const id = node('m', 1, x(l)); edge(cur[l], id, inp[l]); cur[l] = start[l] = id; });
    net.rounds.forEach((rd, s) => {
      const sp = Array(K).fill(null), next = Array(K).fill(null);
      rd.splits.forEach(l => {
        sp[l] = node('s', sh + 2 * s + 1, x(l), { ways: rd.f });
        if (cur[l] !== null) edge(cur[l], sp[l], s ? -1 : inp[l]);
        if (start[l] === null) start[l] = sp[l];
      });
      rd.merges.forEach(m => {
        if (m.from.length === 1) { next[m.lane] = sp[m.from[0]]; return; }
        next[m.lane] = node('m', sh + 2 * s + 2, x(m.lane));
        m.from.forEach(j => edge(sp[j], next[m.lane], s ? -1 : inp[j]));
      });
      cur = next;
    });
    const top = sh + 2 * net.rounds.length + 1;
    net.outLane.forEach(l => { const o = node('out', top, x(l)); outs.push(o); edge(cur[l], o, -1, 'out'); });
    net.extra.forEach(l => {
      if (d.kind === 'butterfly-loop') edge(cur[l], start[l], -1, 'loop');
      else edge(cur[l], node('sink', nodes[cur[l]].floor, x(l)), -1, 'sink');
    });
  } else {
    const loop = d.kind.endsWith('-loop'), sink = d.kind.endsWith('-sink'), F = d.tree.factors, L = F.length, n = d.n;
    const tree = (from, f0, inp, x0, w) => {
      // Devolve, por folha, o splitter de onde ela sai.
      let level = [{ id: null, q: 0 }];
      let leaves = [];
      F.forEach((f, k) => {
        const cnt = d.tree.levels[k].count;
        const next = [];
        level.forEach((p, q) => {
          const id = node('s', f0 + k, x0 + w * (q + 0.5) / cnt, { ways: f });
          edge(p.id === null ? from : p.id, id, inp);
          for (let c = 0; c < f; c++) (k < L - 1 ? next : leaves).push({ id, q: q * f + c });
        });
        level = next;
      });
      return leaves.map(l => l.id);
    };
    const splitAt = (from, f0, inp, x0, w) => {
      let start = from, first = f0, lm = null;
      if (loop) { lm = node('m', f0, x0 + w / 2); edge(from, lm, inp); start = lm; first = f0 + 1; }
      const leaves = tree(start, first, inp, x0, w);
      leaves.forEach((s, j) => {
        if (j >= M && loop) edge(s, lm, inp, 'loop');
        if (j >= M && sink) edge(s, node('sink', nodes[s].floor, nodes[s].x), inp, 'sink');
      });
      return { leaves: leaves.slice(0, M), top: first + L - 1 };
    };
    if (d.kind.startsWith('funnel')) {
      let prev = null;
      d.chain.forEach((k, c) => {
        const id = node('m', c + 1, 0.5);
        if (prev !== null) edge(prev, id, -1);
        for (let i = c === 0 ? 0 : d.chain[c - 1]; i < k; i++) edge(ins[i], id, i);
        prev = id;
      });
      const sp = splitAt(prev, d.chain.length + 1, -1, 0, 1);
      sp.leaves.forEach((s, j) => { const o = node('out', sp.top + 1, (j + 0.5) / M); outs.push(o); edge(s, o, -1, 'out'); });
    } else {
      // Com metades: um splitter em 2 no primeiro andar e uma árvore com loop para cada metade.
      const halves = d.kind === 'matrix-split-loop', own = i => (halves ? i >> 1 : i);
      const trees = halves
        ? ins.flatMap((c, i) => {
          const h = node('s', 1, (i + 0.5) / N, { ways: 2 });
          edge(c, h, i);
          return [0, 1].map(k => splitAt(h, 2, i, (2 * i + k) / (2 * N), 1 / (2 * N)));
        })
        : ins.map((c, i) => splitAt(c, 1, i, i / N, 1 / N));
      const top = trees[0].top;
      for (let j = 0; j < M; j++) {
        let prev = null, last = trees.map(tr => tr.leaves[j]);
        d.chain.forEach((k, c) => {
          const id = node('m', top + 1 + c, (j + 0.5) / M);
          if (prev !== null) edge(prev, id, -1);
          for (let i = c === 0 ? 0 : d.chain[c - 1]; i < k; i++) edge(last[i], id, own(i));
          prev = id;
        });
        const o = node('out', top + 1 + d.chain.length, (j + 0.5) / M);
        outs.push(o);
        edge(prev === null ? last[0] : prev, o, trees.length > 1 ? -1 : 0, 'out');
      }
    }
  }
  const piece = id => nodes[id].t === 's' || nodes[id].t === 'm';
  const lifts = edges.filter(e => piece(e.a) && piece(e.b) && nodes[e.a].floor !== nodes[e.b].floor).length;
  const floors = Math.max(...nodes.filter(x => piece(x.id)).map(x => x.floor));
  return { nodes, edges, floors, lifts, ins, outs };
}

// Vista 3D: posições em metros (y é a altura) a partir dos níveis de designFloors.
// Andares: cada nível é um andar, peças lado a lado. Torres: cada nível vira uma torre ao longo do fluxo,
// com as peças empilhadas. Esteira entre alturas diferentes de duas peças sobe ou desce por lift.
const L3D = { cell: 4, floor: 5, gap: 8, half: { s: [1.8, 1.2, 1.8], m: [1.8, 1.2, 1.8], sink: [1.8, 1.2, 1.8], in: [2.2, 0.4, 2.2], out: [2.2, 0.4, 2.2] } };
// Faces de cada peça, como no jogo, no referencial do fluxo (frente = sentido do fluxo, direita = +z').
const PORT3D = { s: { in: ['back'], out: ['front', 'left', 'right'] }, m: { in: ['back', 'left', 'right'], out: ['front'] }, in: { in: [], out: ['front'] }, out: { in: ['back'], out: [] }, sink: { in: ['back'], out: [] } };
const NRM3 = { front: [1, 0, 0], back: [-1, 0, 0], left: [0, 0, -1], right: [0, 0, 1] };
const STUB3 = 1.2, CROSS3 = 25;
function layout3d(d, mode, spread = 1) {
  const fl = designFloors(d);
  if (!fl) return null;
  const { nodes, edges } = fl;
  const piece = n => n.t === 's' || n.t === 'm';
  const levels = [...new Set(nodes.filter(piece).map(n => n.floor))].sort((a, b) => a - b);
  const levelIdx = new Map(levels.map((f, i) => [f, i + 1]));
  const outStep = levels.length + 1;
  const pos = new Map();
  const sinkFrom = new Map(edges.filter(e => nodes[e.b].t === 'sink').map(e => [e.b, e.a]));
  if (mode === 'flat') {
    // Planta (tudo no chão, vista de cima): cada nível é uma coluna ao longo do fluxo e as peças ficam na
    // posição da fachada (as faixas da borboleta seguem retas), como Andares deitado.
    const perLevel = levels.map(f => nodes.filter(n => piece(n) && n.floor === f).length);
    const gap = L3D.gap * spread, W = Math.max(...perLevel, d.N, d.M, d.net ? d.net.K : 0) * gap;
    nodes.filter(piece).forEach(n => pos.set(n.id, [levelIdx.get(n.floor) * gap, 0, n.x * W]));
    fl.ins.forEach(id => pos.set(id, [0, 0, nodes[id].x * W]));
    fl.outs.forEach(id => pos.set(id, [(levels.length + 1) * gap, 0, nodes[id].x * W]));
  } else if (mode === 'towers') {
    for (const f of levels) {
      nodes.filter(n => piece(n) && n.floor === f).sort((a, b) => a.x - b.x)
        .forEach((n, k) => pos.set(n.id, [levelIdx.get(f) * L3D.gap * spread, k * L3D.floor, 0]));
    }
    // Entradas e saídas numa torre própria, na ordem da altura da peça em que ligam.
    const firstY = id => { const e = edges.find(x => x.a === id); return pos.get(e.b)[1]; };
    const lastY = id => { const e = edges.find(x => x.b === id); return pos.get(e.a)[1]; };
    fl.ins.slice().sort((a, b) => firstY(a) - firstY(b) || nodes[a].x - nodes[b].x)
      .forEach((id, k) => pos.set(id, [0, k * L3D.floor, 0]));
    fl.outs.slice().sort((a, b) => lastY(a) - lastY(b) || nodes[a].x - nodes[b].x)
      .forEach((id, k) => pos.set(id, [(levels.length + 1) * L3D.gap * spread, k * L3D.floor, 0]));
  } else {
    const perLevel = levels.map(f => nodes.filter(n => piece(n) && n.floor === f).length);
    const W = Math.max(...perLevel, d.N, d.M, d.net ? d.net.K : 0) * L3D.gap * spread;
    nodes.filter(piece).forEach(n => pos.set(n.id, [n.x * W, n.floor * L3D.floor, 0]));
    // Entradas na frente do primeiro andar e saídas atrás do último, para não ficarem embaixo das peças nem taparem a montagem.
    const lo = levels[0] * L3D.floor, hi = levels[levels.length - 1] * L3D.floor;
    fl.ins.forEach(id => pos.set(id, [nodes[id].x * W, lo, L3D.gap * 1.5]));
    fl.outs.forEach(id => pos.set(id, [nodes[id].x * W, hi, -L3D.gap * 1.5]));
  }
  const stepOf = n => (n.t === 'in' ? 0 : n.t === 'out' ? outStep : n.t === 'sink' ? stepOf(nodes[sinkFrom.get(n.id)]) : levelIdx.get(n.floor));
  // Daqui em diante tudo é calculado no referencial do fluxo (fluxo em +x'): Torres já é assim; Andares gira
  // (as entradas ficam em +z e as saídas em -z, então x' = -z, z' = x). As portas são as do jogo: splitter
  // entra por trás e sai pela frente e pelos lados; merger entra por trás e pelos lados e sai pela frente.
  const fr = q => (mode === 'floors' ? [-q[2], q[1], q[0]] : q.slice());
  const back = q => (mode === 'floors' ? [q[2], q[1], -q[0]] : q);
  const F = new Map([...pos].map(([id, q]) => [id, fr(q)]));
  const half = id => L3D.half[nodes[id].t];
  const outsOf = new Map(), insOf = new Map();
  edges.forEach((e, ei) => { (outsOf.get(e.a) || outsOf.set(e.a, []).get(e.a)).push(ei); (insOf.get(e.b) || insOf.set(e.b, []).get(e.b)).push(ei); });
  const fromSide = [], toSide = [];
  // Lados: quem sobe sai pela esquerda e quem desce pela direita (empate de altura: pela posição na fileira);
  // o merger recebe do mesmo lado de onde a esteira saiu, para não precisar contornar a peça.
  // Na planta tudo tem a mesma altura: quem decide o lado é a posição na fileira (z), no lugar da altura.
  const dz = (id, o) => F.get(o)[2] - F.get(id)[2];
  // Para cima no desenho (z menor) faz o papel de "sobe": sai pela esquerda.
  const dy = mode === 'flat' ? (id, o) => -dz(id, o) : (id, o) => F.get(o)[1] - F.get(id)[1];
  nodes.forEach(n => {
    const outs = outsOf.get(n.id) || [], ins = insOf.get(n.id) || [];
    if (n.t === 'm') return; // depois dos splitters, abaixo
    if (n.t !== 's') { ins.forEach(ei => { toSide[ei] = 'back'; }); outs.forEach(ei => { fromSide[ei] = 'front'; }); return; }
    ins.forEach(ei => { toSide[ei] = 'back'; });
    const free = new Set(PORT3D.s.out);
    const take = (ei, want) => { const sd = free.has(want) ? want : PORT3D.s.out.find(x => free.has(x)); fromSide[ei] = sd; free.delete(sd); };
    outs.filter(ei => nodes[edges[ei].b].t === 'sink').forEach(ei => take(ei, (mode === 'floors' ? ['front', 'left', 'right'] : ['left', 'right', 'front']).find(x => free.has(x))));
    const main = outs.filter(ei => nodes[edges[ei].b].t !== 'sink').sort((u, v) => dy(n.id, edges[u].b) - dy(n.id, edges[v].b) || dz(n.id, edges[u].b) - dz(n.id, edges[v].b));
    const flat = main.findIndex(ei => Math.abs(dy(n.id, edges[ei].b)) < 1e-9);
    if (main.length === 1) take(main[0], 'front');
    // Mesma altura para todas (Andares): pela posição na fileira, a de menor z' pela esquerda (-z').
    const level = main.every(ei => Math.abs(dy(n.id, edges[ei].b) - dy(n.id, edges[main[0]].b)) < 1e-9);
    if (main.length === 3) main.forEach((ei, k) => take(ei, (level ? ['left', 'front', 'right'] : ['right', 'front', 'left'])[k]));
    else if (main.length === 2 && flat >= 0) { take(main[flat], 'front'); const o = main[1 - flat]; take(o, dy(n.id, edges[o].b) > 0 ? 'left' : 'right'); }
    else if (main.length === 2) { take(main[0], level ? 'left' : 'right'); take(main[1], level ? 'right' : 'left'); }
  });
  nodes.filter(n => n.t === 'm').forEach(n => {
    (outsOf.get(n.id) || []).forEach(ei => { fromSide[ei] = 'front'; });
    const left = (insOf.get(n.id) || []).slice(), free = new Set(PORT3D.m.in);
    const take = (ei, sd) => { toSide[ei] = sd; free.delete(sd); left.splice(left.indexOf(ei), 1); };
    const src = ei => edges[ei].a;
    // Na planta o lado é o da geometria: o que vem reto entra por trás, o que vem de cima (z menor) pela
    // esquerda e o de baixo pela direita; se o lado já está ocupado, o que sobrar.
    if (mode === 'flat') {
      // Splitter da mesma fileira que solta pelo lado (o de cima de uma borboleta sai pela esquerda para o merger
      // da frente): entra pelo mesmo lado, num arco curto, se ninguém mais vem daquele lado. Pela traseira ela
      // contornaria o splitter e, com três entradas, empurraria quem vem de longe para o lado oposto, dando a volta
      // no merger; na fileira da ponta, a volta ainda sairia do espaço. Com duas entradas no meio, a traseira cruza menos.
      const edgeRow = (id, sg) => [...F.values()].every(q => (q[2] - F.get(id)[2]) * sg < 1e-9);
      left.filter(ei => edges[ei].kind !== 'loop' && Math.abs(dz(n.id, src(ei))) < 1e-9 && (fromSide[ei] === 'left' || fromSide[ei] === 'right')).forEach(ei => {
        const sd = fromSide[ei], sg = sd === 'left' ? -1 : 1;
        if (free.has(sd) && !left.some(o => o !== ei && dz(n.id, src(o)) * sg > 1e-9) && (left.length >= 3 || edgeRow(src(ei), sg))) take(ei, sd);
      });
      const ahead = left.filter(ei => edges[ei].kind !== 'loop' && Math.abs(dz(n.id, src(ei))) < 1e-9);
      const straight = ahead.find(ei => fromSide[ei] === 'front') ?? ahead[0];
      if (straight !== undefined) take(straight, 'back');
      left.slice().sort((u, v) => Math.abs(dz(n.id, src(v))) - Math.abs(dz(n.id, src(u)))).forEach(ei => {
        const want = dz(n.id, src(ei)) < 0 ? 'left' : 'right';
        take(ei, free.has(want) ? want : PORT3D.m.in.find(x => free.has(x)));
      });
      return;
    }
    left.slice().sort((u, v) => Math.abs(dy(n.id, src(u))) - Math.abs(dy(n.id, src(v))))
      .forEach(ei => { const sd = fromSide[ei]; if ((sd === 'left' || sd === 'right') && free.has(sd)) take(ei, sd); });
    const straight = left.find(ei => fromSide[ei] === 'front') ?? left.find(ei => Math.abs(dy(n.id, src(ei))) < 1e-9);
    if (straight !== undefined && free.has('back')) take(straight, 'back');
    left.slice().sort((u, v) => dy(n.id, src(u)) - dy(n.id, src(v))).forEach(ei => take(ei, PORT3D.m.in.find(x => free.has(x))));
  });
  // Sink: na frente da face da peça de origem, com os dois tocos (o dela e o dele) entre as duas.
  for (const [id, from] of sinkFrom) {
    const ei = edges.findIndex(e => e.b === id), nv = NRM3[fromSide[ei]], c = F.get(from), h = half(from);
    F.set(id, c.map((v, k) => v + nv[k] * (h[k] + 2 * STUB3 + L3D.half.sink[k])));
  }
  const portOf = (id, side) => { const c = F.get(id), h = half(id), nv = NRM3[side]; const q = c.map((v, k) => v + nv[k] * h[k]); return { q, s: q.map((v, k) => v + nv[k] * STUB3) }; };

  // Roteador ortogonal: porta → toco → faixa z' → coluna x' (lift) → altura do destino → toco → porta.
  // Trechos são caixas alinhadas aos eixos. Proibido: encostar numa peça (< 0,25 m) ou correr junto de outra
  // esteira (paralela a menos de 0,9 m). Cruzar outra em ângulo reto é permitido, mas caro: às vezes não tem
  // como evitar (três entradas na mesma altura indo para o mesmo merger). Candidatas em ordem de comprimento.
  const box = (a, b) => ({ lo: [0, 1, 2].map(k => Math.min(a[k], b[k])), hi: [0, 1, 2].map(k => Math.max(a[k], b[k])) });
  // Folga entre duas caixas em cada eixo (é chamada milhões de vezes nas montagens cheias).
  const G = [0, 0, 0];
  const gaps3 = (A, B) => { for (let k = 0; k < 3; k++) G[k] = Math.max(0, A.lo[k] - B.hi[k], B.lo[k] - A.hi[k]); return G; };
  const pieceBox = id => { const c = F.get(id), h = half(id); return { lo: c.map((v, k) => v - h[k]), hi: c.map((v, k) => v + h[k]) }; };
  // Colunas das peças (o sink fica de fora: ele já é obstáculo e não deve tirar as faixas da frente da fileira).
  const xcols = [...new Set(nodes.filter(n => n.t !== 'sink').map(n => F.get(n.id)[0]))].sort((a, b) => a - b);
  const zcols = [...new Set(nodes.map(n => +F.get(n.id)[2].toFixed(3)))].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < xcols.length; i++) for (let x = xcols[i - 1] + 2.4; x <= xcols[i] - 2.4 + 1e-6; x += 0.6) gaps.push(+x.toFixed(3));
  // E faixas para fora da primeira e da última coluna (montagem cheia precisa).
  const outer = [];
  for (let k = 0; k < 60; k++) outer.push(+(xcols[0] - 3 - 1.2 * k).toFixed(3), +(xcols[xcols.length - 1] + 3 + 1.2 * k).toFixed(3));
  const topY = Math.max(...[...F.values()].map(q => q[1])) + L3D.floor;
  const len = pts => pts.slice(1).reduce((s, q, i) => s + Math.abs(q[0] - pts[i][0]) + Math.abs(q[1] - pts[i][1]) + Math.abs(q[2] - pts[i][2]), 0) + pts.length * 0.6;
  const clean = raw => raw.filter((q, i) => i === 0 || q.some((v, k) => Math.abs(v - raw[i - 1][k]) > 1e-9));

  function routeAll(order) {
    // Grade espacial de 4 m para as caixas (peças, tocos reservados e trechos já roteados).
    const grid = new Map(), C = 4;
    const cells = (b, pad) => { const r = []; for (let x = Math.floor((b.lo[0] - pad) / C); x <= Math.floor((b.hi[0] + pad) / C); x++) for (let y = Math.floor((b.lo[1] - pad) / C); y <= Math.floor((b.hi[1] + pad) / C); y++) for (let z = Math.floor((b.lo[2] - pad) / C); z <= Math.floor((b.hi[2] + pad) / C); z++) r.push(((x + 512) * 1024 + y + 512) * 1024 + z + 512); return r; };
    const axis = b => [0, 1, 2].find(k => b.hi[k] - b.lo[k] > 1e-9);
    const put = it => { it.ax = axis(it.box); cells(it.box, 0).forEach(k => (grid.get(k) || grid.set(k, []).get(k)).push(it)); };
    nodes.forEach(n => put({ box: pieceBox(n.id), piece: n.id }));
    edges.forEach((e, ei) => { for (const [id, sd] of [[e.a, fromSide[ei]], [e.b, toSide[ei]]]) { const p = portOf(id, sd); put({ box: box(p.q, p.s), ei }); } });
    let stamp = 0;
    // Pontuação de um trecho: 1000 por colisão proibida, CROSS3 por cruzamento em ângulo reto.
    const hits = (b, ei, ends, limit) => {
      stamp++;
      let score = 0;
      const ax = axis(b);
      const x0 = Math.floor((b.lo[0] - 1) / C), x1 = Math.floor((b.hi[0] + 1) / C), y0 = Math.floor((b.lo[1] - 1) / C), y1 = Math.floor((b.hi[1] + 1) / C), z0 = Math.floor((b.lo[2] - 1) / C), z1 = Math.floor((b.hi[2] + 1) / C);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const list = grid.get(((x + 512) * 1024 + y + 512) * 1024 + z + 512);
        if (!list) continue;
        for (const it of list) {
          if (it.seen === stamp) continue;
          it.seen = stamp;
          if (it.piece !== undefined) {
            if (it.piece === ends[0] || it.piece === ends[1]) continue;
            const g = gaps3(b, it.box);
            if (g[0] * g[0] + g[1] * g[1] + g[2] * g[2] < 0.0625) score += 1000;
          } else if (it.ei !== ei) {
            const g = gaps3(b, it.box), ux = it.ax;
            // Na mesma direção: proibido se fica a menos de 1 m de lado nas duas outras medidas e se encosta na
            // própria direção. Em direções diferentes: cruzamento, se passa a menos de 0,9 m.
            if (ax === ux && ax !== undefined) { if ((ax === 0 ? g[0] < 0.9 : g[0] < 1) && (ax === 1 ? g[1] < 0.9 : g[1] < 1) && (ax === 2 ? g[2] < 0.9 : g[2] < 1)) score += 1000; }
            else if (g[0] * g[0] + g[1] * g[1] + g[2] * g[2] < 0.81) score += ax === undefined || ux === undefined ? 1000 : CROSS3;
          }
          if (score >= limit) return score;
        }
      }
      return score;
    };
    const out = new Map();
    let total = 0, loops = 0;
    // Uma esteira: primeiro só faixas e colunas perto das pontas; se não sair limpa, abre as de fora.
    const routeOne = (ei, ly, wide) => {
      // Na planta o retorno do loop anda no chão, contornando as peças, como as outras esteiras.
      const e = edges[ei], A = portOf(e.a, fromSide[ei]), B = portOf(e.b, toSide[ei]), s = A.s, t = B.s, loop = e.kind === 'loop' && mode !== 'flat';
      const reach = 8, lanes = 5;
      const zlo = Math.min(s[2], t[2]) - reach, zhi = Math.max(s[2], t[2]) + reach;
      // Faixas: as das pontas, as que se afastam delas e as dos vãos entre colunas de peças.
      const zs = new Set([s[2], t[2]]);
      for (const c of new Set([F.get(e.a)[2], F.get(e.b)[2]])) for (let k = 0; k < lanes; k++) { zs.add(+(c + 3 + 1.2 * k).toFixed(3)); zs.add(+(c - 3 - 1.2 * k).toFixed(3)); }
      for (let i = 1; i < zcols.length; i++) { const mz = (zcols[i - 1] + zcols[i]) / 2; if (zcols[i] - zcols[i - 1] >= 6) for (const o of [0, -0.6, 0.6, -1.2, 1.2]) zs.add(+(mz + o).toFixed(3)); }
      const cols = wide ? gaps.concat(outer) : gaps;
      const lifts = Math.abs(s[1] - t[1]) > 1e-9;
      const near = x0 => cols.filter(x => Math.abs(x - x0) <= 8);
      // A fase larga só tenta as colunas que a estreita não tentou, inclusive as de fora: é onde as esteiras
      // compridas de uma montagem cheia acham faixa própria.
      const inReach = x => x >= Math.min(s[0], t[0]) - reach && x <= Math.max(s[0], t[0]) + reach;
      const xs = [...new Set([...(lifts ? [] : [s[0], t[0]]), ...cols.filter(x => (wide ? !gaps.includes(x) || !inReach(x) : inReach(x)))])];
      // Candidata = faixa z, coluna(s) x e forma f (sai andando em z ou em x; chega andando em x ou em z).
      // O custo usado para ordenar é o comprimento em Manhattan, que não depende da forma e nunca passa do real.
      const m = (u, v) => Math.abs(u - v);
      const cz = [], cx1 = [], cx2 = [], cost = [];
      for (const z of zs) {
        if (z < zlo || z > zhi) continue;
        if (loop) {
          for (const x1 of near(s[0])) for (const x2 of near(t[0])) { cz.push(z); cx1.push(x1); cx2.push(x2); cost.push(m(x1, s[0]) + m(z, s[2]) + 2 * ly - s[1] - t[1] + m(x2, x1) + m(t[0], x2) + m(t[2], z)); }
        } else {
          for (const x of xs) { cz.push(z); cx1.push(x); cx2.push(x); cost.push(m(x, s[0]) + m(z, s[2]) + m(t[1], s[1]) + m(t[0], x) + m(t[2], z)); }
        }
      }
      // Heap de mínimo sobre os índices: só sai da fila o que for avaliado (quase sempre poucas dezenas).
      const heap = cost.map((_, i) => i);
      const less = (i, j) => cost[heap[i]] < cost[heap[j]];
      const sift = i => { for (;;) { const l = 2 * i + 1, r = l + 1; let k = i; if (l < heap.length && less(l, k)) k = l; if (r < heap.length && less(r, k)) k = r; if (k === i) return; [heap[i], heap[k]] = [heap[k], heap[i]]; i = k; } };
      for (let i = (heap.length >> 1) - 1; i >= 0; i--) sift(i);
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; sift(0); } return top; };
      const pathOf = (ci, f) => {
        const z = cz[ci], x1 = cx1[ci], x2 = cx2[ci];
        const first = f & 1 ? [[x1, s[1], s[2]], [x1, s[1], z]] : [[s[0], s[1], z], [x1, s[1], z]];
        const last = f & 2 ? [[x2, t[1], z], [x2, t[1], t[2]]] : [[x2, t[1], z], [t[0], t[1], z]];
        return clean([A.q, s, ...first, ...(loop ? [[x1, ly, z], [x2, ly, z]] : []), ...last, t, B.q]);
      };
      // Pontuação total = comprimento + colisões; como estão em ordem de comprimento, para quando a próxima
      // já é mais comprida que a melhor pontuação.
      const NOEND = [], ENDS = [e.a, e.b];
      let best = null;
      for (let n = 0; heap.length; n++) {
        const ci = pop();
        // Teto de 60 só vale quando já tem caminho sem colisão proibida; senão segue procurando (até 400, ou 4000 na fase larga).
        if (best && (cost[ci] >= best.score || n > (best.bad ? (wide ? 4000 : 400) : 60))) break;
        for (let f = 0; f < 4; f++) {
          const pts = pathOf(ci, f), base = len(pts);
          let pen = 0;
          for (let i = 1; i < pts.length && (!best || base + pen < best.score); i++) {
            pen += hits(box(pts[i - 1], pts[i]), ei, i === 1 || i === pts.length - 1 ? ENDS : NOEND, best ? best.score - base - pen : Infinity);
          }
          if (!best || base + pen < best.score) best = { pts, score: base + pen, bad: Math.floor(pen / 1000) };
        }
      }
      return best;
    };
    for (const ei of order) {
      const ly = topY + loops * 1.5;
      if (edges[ei].kind === 'loop') loops++;
      let best = routeOne(ei, ly, false);
      if (best.bad) { const wide = routeOne(ei, ly, true); if (wide.score < best.score) best = wide; }
      best.pts.slice(1).forEach((q, i) => put({ box: box(best.pts[i], q), ei }));
      out.set(ei, best);
      total += best.bad;
    }
    return { out, total };
  }
  // Mais curtas primeiro; se sobrar colisão, até 3 novas passadas com as que colidiram na frente da fila.
  let order = edges.map((_, ei) => ei).sort((u, v) => {
    const d = ei => { const a = F.get(edges[ei].a), b = F.get(edges[ei].b); return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + (edges[ei].kind === 'loop' ? 1e6 : 0); };
    return d(u) - d(v);
  });
  // Na planta as esteiras são desenhadas em curva entre as portas: basta o lado de cada uma, sem roteamento.
  let run = mode === 'flat'
    ? { out: new Map(edges.map((e, ei) => { const A = portOf(e.a, fromSide[ei]), B = portOf(e.b, toSide[ei]); return [ei, { pts: [A.q, A.s, B.s, B.q], bad: 0 }]; })), total: 0 }
    : routeAll(order);
  for (let pass = 0; pass < 1 && run.total; pass++) {
    const bad = order.filter(ei => run.out.get(ei).bad);
    order = [...bad, ...order.filter(ei => !run.out.get(ei).bad)];
    const next = routeAll(order);
    if (next.total < run.total) run = next;
  }
  // Ainda com colisão: tenta de novo com as peças mais espaçadas (na fileira em Andares, entre as torres em Torres).
  if (run.total && spread < 1.5) {
    const wider = layout3d(d, mode, spread + 0.25);
    if (wider.bad < run.total) return wider;
  }
  const pieces = nodes.map(n => ({ id: n.id, t: n.t, ways: n.ways, inp: n.inp, pos: back(F.get(n.id)), step: stepOf(n) }));
  // Esteira misturada (sem entrada única) leva a cor da saída para onde segue: a da mesma faixa, se ela chega
  // lá; senão a primeira que ela alcança.
  const reachOuts = new Map();
  const reachOf = id => {
    if (reachOuts.has(id)) return reachOuts.get(id);
    const seen = new Set([id]), found = new Set(), stack = [id];
    while (stack.length) { const n = stack.pop(); if (nodes[n].t === 'out') found.add(n); for (const ei of outsOf.get(n) || []) if (!seen.has(edges[ei].b)) { seen.add(edges[ei].b); stack.push(edges[ei].b); } }
    reachOuts.set(id, found);
    return found;
  };
  const outOf = id => {
    const r = reachOf(id), same = fl.outs.find(o => r.has(o) && Math.abs(nodes[o].x - nodes[id].x) < 1e-9);
    return fl.outs.indexOf(same ?? fl.outs.find(o => r.has(o)) ?? -1);
  };
  const belts = edges.map((e, ei) => {
    const pts = run.out.get(ei).pts.map(back);
    const b = nodes[e.b], loop = e.kind === 'loop';
    const step = e.kind === 'out' ? outStep : loop || b.t === 'sink' ? stepOf(nodes[e.a]) : stepOf(b);
    const lift = pts.slice(1).some((q, k) => Math.abs(q[1] - pts[k][1]) > 1e-9);
    return { a: e.a, b: e.b, inp: e.inp, out: outOf(e.b), kind: e.kind, pts, lift, step, fromSide: fromSide[ei], toSide: toSide[ei] };
  });
  const steps = [{ key: 'in' }];
  levels.forEach((f, i) => {
    const here = pieces.filter(p => p.step === i + 1 && (p.t === 's' || p.t === 'm'));
    const sp = here.filter(p => p.t === 's');
    steps.push({
      key: 'level', level: i + 1, sp: sp.length, ways: sp.length ? sp[0].ways : 0, mg: here.length - sp.length,
      up: belts.filter(b => b.lift && b.kind !== 'loop' && b.step === i + 1).length,
      down: belts.filter(b => b.kind === 'loop' && b.step === i + 1).length,
    });
  });
  steps.push({ key: 'out' });
  const all = pieces.map(p => p.pos).concat(...belts.map(b => b.pts));
  const bounds = { min: [0, 1, 2].map(k => Math.min(...all.map(q => q[k]))), max: [0, 1, 2].map(k => Math.max(...all.map(q => q[k]))) };
  return { mode, pieces, belts, lifts: belts.filter(b => b.lift).length, steps, bounds, bad: run.total };
}

// Caminho em foco: placa de entrada = tudo a jusante; de saída = tudo a montante; peça = ela e as esteiras ligadas.
// Devolve os ids de peça e os índices de esteira acesos.
function focus3d(lay, id) {
  const t = lay.pieces.find(p => p.id === id)?.t;
  const pieces = new Set([id]), belts = new Set();
  const walk = (n, down) => lay.belts.forEach((b, bi) => {
    if ((down ? b.a : b.b) !== n || belts.has(bi)) return;
    belts.add(bi);
    const nx = down ? b.b : b.a;
    pieces.add(nx);
    if (t === 'in' || t === 'out') walk(nx, down);
  });
  if (t !== 'out') walk(id, true);
  if (t !== 'in') walk(id, false);
  return { pieces, belts };
}

// Passo a passo peça por peça: entradas, depois cada splitter ou merger na ordem de montagem (nível de hoje;
// dentro dele de baixo para cima e da esquerda para a direita), depois as saídas. A esteira aparece quando as
// duas pontas existem; o sink, com a peça de onde sai. Cada passo traz as ligações da peça para o texto.
function byPiece3d(lay) {
  const byId = new Map(lay.pieces.map(p => [p.id, p]));
  const isPart = p => p.t === 's' || p.t === 'm';
  const parts = lay.pieces.filter(isPart).sort((a, b) => a.step - b.step || a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0] || a.pos[2] - b.pos[2]);
  const last = parts.length + 1, stepOf = new Map();
  parts.forEach((p, i) => stepOf.set(p.id, i + 1));
  lay.pieces.forEach(p => { if (p.t === 'in') stepOf.set(p.id, 0); if (p.t === 'out') stepOf.set(p.id, last); });
  lay.pieces.filter(p => p.t === 'sink').forEach(p => stepOf.set(p.id, stepOf.get(lay.belts.find(b => b.b === p.id).a)));
  // Onde fica a peça: em Torres, a torre (o nível) e a altura nela; em Andares, o andar e a posição da esquerda;
  // na Planta, a coluna e a posição de cima para baixo.
  const ax = { towers: 1, floors: 0, flat: 2 }[lay.mode];
  const rank = p => lay.pieces.filter(q => isPart(q) && q.step === p.step && q.pos[ax] < p.pos[ax] - 1e-9).length + 1;
  const where = p => ({ level: p.step, at: rank(p) });
  const ins = lay.pieces.filter(p => p.t === 'in'), outs = lay.pieces.filter(p => p.t === 'out');
  const other = q => (q.t === 'in' ? { t: 'in', idx: ins.indexOf(q) } : q.t === 'out' ? { t: 'out', idx: outs.indexOf(q) } : q.t === 'sink' ? { t: 'sink' } : { t: q.t, n: stepOf.get(q.id), ...where(q) });
  const SIDE = ['back', 'left', 'right', 'front'];
  const steps = [{ key: 'in' }, ...parts.map(p => {
    const conns = lay.belts.map((b, bi) => ({ b, bi })).filter(({ b }) => b.a === p.id || b.b === p.id).map(({ b, bi }) => {
      const out = b.a === p.id, q = byId.get(out ? b.b : b.a), dy = q.pos[1] - p.pos[1];
      return { belt: bi, dir: out ? 'out' : 'in', side: out ? b.fromSide : b.toSide, other: other(q), loop: b.kind === 'loop',
        lift: Math.abs(dy) < 1e-9 ? null : (out ? dy > 0 : dy < 0) ? 'up' : 'down', pending: stepOf.get(q.id) > stepOf.get(p.id) };
    }).sort((u, v) => (u.dir === v.dir ? 0 : u.dir === 'in' ? -1 : 1) || SIDE.indexOf(u.side) - SIDE.indexOf(v.side));
    return { key: 'piece', id: p.id, n: stepOf.get(p.id), t: p.t, ways: p.ways, nin: lay.belts.filter(b => b.b === p.id).length, ...where(p), conns };
  }), { key: 'out' }];
  return {
    ...lay,
    pieces: lay.pieces.map(p => ({ ...p, step: stepOf.get(p.id) })),
    belts: lay.belts.map(b => ({ ...b, step: Math.max(stepOf.get(b.a), stepOf.get(b.b)) })),
    steps,
  };
}

// Texto de um passo peça por peça: o que montar, onde, e cada ligação (lado, de onde vem ou para onde vai).
// Na Planta as peças levam número no desenho (#1, #2…): o passo começa por ele e chama as outras pelo número.
function pieceText3d(st, labels, mode) {
  const name = (k, ways, nin) => (k === 's' ? `Splitter 1→${ways}` : `Merger ${nin}→1`);
  const where = (lv, at) => t({ towers: 'where3dTowers', floors: 'where3dFloors', flat: 'where3dFlat' }[mode], lv, at);
  const flat = mode === 'flat';
  const otherText = (o, from) => (o.t === 'in' ? labels.ins[o.idx] : o.t === 'out' ? labels.outs[o.idx] : o.t === 'sink' ? t('other3dSink')
    : flat ? t('other2d', o.t === 's' ? 'splitter' : 'merger', o.n)
    : t(from ? 'other3dPieceFrom' : 'other3dPiece', o.t === 's' ? 'splitter' : 'merger', where(o.level, o.at)));
  const conns = st.conns.map(c => t(c.dir === 'in' ? 'conn3dIn' : 'conn3dOut', t('side3d' + c.side[0].toUpperCase() + c.side.slice(1)), otherText(c.other, c.dir === 'in'),
    (c.loop ? t('loop3d') : c.lift ? t(c.lift === 'up' ? 'lift3dUp' : 'lift3dDown') : '') + (c.pending ? t('pending3d') : '')));
  return (flat ? `#${st.n} · ` : '') + t('stPiece3d', name(st.t, st.ways, st.nin), where(st.level, st.at), conns.join(' '));
}

// Espaço da planta: só splitters, mergers e as esteiras entre eles (entradas e saídas chegam pela borda).
// Em fundações de 8 m, e o menor Blueprint Designer que comporta (Mk1 4×4, Mk2 5×5, Mk3 6×6; 0 = nenhum).
const BP_DESIGNERS = [[1, 4], [2, 5], [3, 6]];
function planFootprint(lay) {
  const part = new Set(lay.pieces.filter(p => p.t === 's' || p.t === 'm').map(p => p.id));
  const pts = lay.pieces.filter(p => part.has(p.id)).flatMap(p => [[p.pos[0] - 2, p.pos[2] - 2], [p.pos[0] + 2, p.pos[2] + 2]])
    .concat(...lay.belts.filter(b => part.has(b.a) && part.has(b.b)).map(b => b.pts.map(q => [q[0], q[2]])));
  const min = [0, 1].map(k => Math.min(...pts.map(q => q[k]))), max = [0, 1].map(k => Math.max(...pts.map(q => q[k])));
  const w = Math.ceil(max[0] - min[0] - 1e-6), d = Math.ceil(max[1] - min[1] - 1e-6);
  const fw = Math.ceil(w / 8 - 1e-9), fd = Math.ceil(d / 8 - 1e-9);
  const mk = (BP_DESIGNERS.find(([, f]) => Math.max(fw, fd) <= f) || [0])[0];
  return { min, max, w, d, fw, fd, mk };
}

// Marcações do Blueprint Designer na planta: quadrados de 4×4, 5×5 ou 6×6 fundações, presos na grade da planta
// (linhas em x = 4 + 8k e z = 8k metros, com cada peça no meio de uma fundação). Posição = canto de menor x e z.
const PLAN_GRID = [4, 0];
const designerSize = mk => (BP_DESIGNERS.find(([m]) => m === mk) || [0, 0])[1] * 8;
// step 8 prende na grade de fundações; arrastando, step 1 deixa posicionar de metro em metro.
const snapGrid = (v, axis, step = 8) => Math.round((v - PLAN_GRID[axis]) / step) * step + PLAN_GRID[axis];
// Faixa da grade (em fundações inteiras) que o espaço da planta toca, por eixo: [início, fim] em metros.
function planCells(fp) {
  return [0, 1].map(k => {
    const o = PLAN_GRID[k];
    return [Math.floor((fp.min[k] - o) / 8 + 1e-9) * 8 + o, Math.ceil((fp.max[k] - o) / 8 - 1e-9) * 8 + o];
  });
}
// Prende na grade (ou de step em step) e perto do balancer: a marcação sempre encosta na faixa que ele ocupa.
function placeMark(fp, mk, x, z, step = 8) {
  const s = designerSize(mk), cells = planCells(fp);
  const [px, pz] = [x, z].map((v, k) => Math.max(cells[k][0] - s, Math.min(cells[k][1], snapGrid(v, k, step))));
  return { mk, x: px, z: pz };
}
// Padrão: centrada no balancer e, quando ele cabe na grade dela, cobrindo tudo.
function defaultMark(fp, mk) {
  const s = designerSize(mk), cells = planCells(fp);
  const [x, z] = [0, 1].map(k => {
    const c = snapGrid((fp.min[k] + fp.max[k]) / 2 - s / 2, k), lo = cells[k][1] - s, hi = cells[k][0];
    return lo <= hi ? Math.max(lo, Math.min(hi, c)) : c;
  });
  return { mk, x, z };
}
// De início: o menor designer que comporta (#1); se não cabe em nenhum, nenhuma.
const defaultMarks = fp => (fp.mk ? [{ id: 1, ...defaultMark(fp, fp.mk) }] : []);
// Nova marcação centrada em at = [x, z] (o meio da vista), sem cair exatamente em cima de outra.
function addMark(fp, marks, mk, at) {
  const s = designerSize(mk);
  let m = placeMark(fp, mk, at[0] - s / 2, at[1] - s / 2);
  for (let i = 0; i < 12 && marks.some(o => o.x === m.x && o.z === m.z); i++) m = placeMark(fp, mk, m.x + 8, m.z + 8);
  return [...marks, { id: Math.max(0, ...marks.map(o => o.id)) + 1, ...m }];
}

// Toque ou clique na cena: só conta com um ponteiro durante todo o gesto e sem andar mais de 5 px.
// Uma pinça (dois dedos) nunca vira toque, nem quando o último dedo sai parado.
function tapGesture() {
  const live = new Map();
  let multi = false;
  return {
    down(id, x, y) { live.set(id, [x, y]); if (live.size > 1) multi = true; },
    up(id, x, y) {
      const p = live.get(id);
      live.delete(id);
      const tap = !!p && !multi && Math.hypot(x - p[0], y - p[1]) <= 5;
      if (!live.size) multi = false;
      return tap;
    },
    cancel(id) { live.delete(id); if (!live.size) multi = false; },
  };
}

// Zoom do desenho 2D pelo viewBox: k > 1 aproxima no ponto (cx, cy), sem passar de 8× nem afastar além do
// desenho inteiro, e sem sair dele; panView move e prende dentro do desenho.
function panView(vb, full, dx, dy) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return { ...vb, x: clamp(vb.x + dx, full.x, full.x + full.w - vb.w), y: clamp(vb.y + dy, full.y, full.y + full.h - vb.h) };
}
function zoomView(vb, full, k, cx, cy) {
  const w = Math.max(full.w / 8, Math.min(full.w, vb.w / k)), h = w * full.h / full.w, r = w / vb.w;
  return panView({ x: cx - (cx - vb.x) * r, y: cy - (cy - vb.y) * r, w, h }, full, 0, 0);
}

// Distância da câmera para a esfera que envolve os limites caber inteira, no menor dos dois ângulos de visão.
function fitDistance(bounds, fovDeg, aspect) {
  const r = Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i])) / 2;
  const v = fovDeg * Math.PI / 180, h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return Math.max(r, 4) / Math.sin(Math.min(v, h) / 2) * 1.05;
}

function balancerCandidates(N, M, rates, cap, blueprints = []) {
  const list = DESIGN_KINDS.map(k => balancerDesign(k, N, M, rates, cap));
  for (const k of BF_KINDS) list.push(butterflyDesign(N, M, rates, cap, k));
  for (const bp of blueprints) if (bp.m === M && bp.n >= N) list.push(blueprintDesign(bp, N, M, rates, cap));
  return list;
}

const designPieces = d => d.pieces.splitters + d.pieces.mergers + d.pieces.blueprints;
const designOut = d => d.perOut * d.M;
// A borboleta mistura faixas distantes uma da outra e é bem mais difícil de montar que uma matriz ou um funil:
// ela só ganha quando economiza mais de 20% das peças (4→5: 21 contra 26 da matriz com loop não basta).
const BF_EDGE = 0.8;
const bfKind = d => d.kind.startsWith('butterfly');
const buildCost = d => designPieces(d) / (bfKind(d) ? BF_EDGE : 1);
// Os que se aplicam primeiro; depois mais vazão, blueprint seu, menos sink, menos peças.
function rankDesigns(list) {
  return list.slice().sort((a, b) => {
    if (!!a.applies !== !!b.applies) return a.applies ? 1 : -1;
    const dOut = designOut(b) - designOut(a);
    if (Math.abs(dOut) > 0.05) return dOut;
    if ((a.kind === 'blueprint') !== (b.kind === 'blueprint')) return a.kind === 'blueprint' ? -1 : 1;
    if (Math.abs(a.sinkRate - b.sinkRate) > 0.05) return a.sinkRate - b.sinkRate;
    return buildCost(a) - buildCost(b) || designPieces(a) - designPieces(b);
  });
}
// Por que o primeiro ganhou do segundo colocado: código + argumentos para o texto.
function designWhy(ranked) {
  const [a, b] = ranked.filter(d => !d.applies);
  if (!a) return { code: 'none' };
  if (a.kind === 'blueprint') return { code: 'bp', a };
  if (!b) return { code: 'only', a };
  if (designOut(a) - designOut(b) > 0.05) return { code: 'more', a, b };
  if (b.sinkRate - a.sinkRate > 0.05) return { code: 'noSink', a, b };
  if (!bfKind(a) && bfKind(b) && designPieces(b) <= designPieces(a)) return { code: 'simpler', a, b };
  if (designPieces(a) < designPieces(b)) return { code: 'fewer', a, b };
  return { code: 'tie', a, b };
}

// Tamanhos de grupo (soma m, k grupos), preferindo tamanhos divisíveis direto.
function groupSizeCandidates(m, k) {
  const equal = [];
  for (let i = 0; i < k; i++) equal.push(Math.floor(m / k) + (i < m % k ? 1 : 0));
  const cands = [];
  const direct = [];
  let rem = m;
  for (let i = 0; i < k; i++) {
    const left = k - i;
    if (left === 1) { direct.push(rem); break; }
    let g = Math.ceil(rem / left);
    while (g > 1 && !isDirect(g)) g--;
    direct.push(g); rem -= g;
  }
  if (direct.length === k && direct.every(g => g >= 1 && isDirect(g)) && direct.reduce((a, b) => a + b, 0) === m) {
    cands.push(direct.slice().sort((a, b) => b - a));
  }
  cands.push(equal);
  return cands;
}

// Tenta cobrir os déficits com k doadoras (as maiores do pool).
function tryDonors(needs, pool, k, cap) {
  const donors = pool.slice(0, k);
  for (const sizes of groupSizeCandidates(needs.length, k)) {
    if (sizes.some(g => g < 1)) continue;
    const groups = [];
    let idx = 0, ok = true;
    for (let j = 0; j < k; j++) {
      const members = needs.slice(idx, idx + sizes[j]);
      idx += sizes[j];
      const maxDef = Math.max(...members.map(d => d.deficit));
      const opt = divisionOptions(donors[j].rate, sizes[j], maxDef, cap);
      const feasible = opt.direct ? opt.ok : opt.loop.ok;
      if (!feasible) { ok = false; break; }
      groups.push({ donor: donors[j], members, maxDeficit: maxDef, division: opt });
    }
    if (ok) return groups;
  }
  return null;
}

// Divide `total` igualmente entre saídas com limite `caps` (sobra de uma vai para as outras).
function waterfill(total, caps) {
  const out = new Array(caps.length).fill(0);
  const order = caps.map((_, i) => i).sort((a, b) => caps[a] - caps[b]);
  let rem = Math.max(0, total), left = caps.length;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const share = rem / left;
    if (caps[i] <= share) { out[i] = caps[i]; rem -= caps[i]; left--; }
    else { for (let j = k; j < order.length; j++) out[order[j]] = share; break; }
  }
  return out;
}

// ---- Grafo de esteiras e simulação do regime permanente ----
function makeGraph(cap) { return { cap, nodes: [], edges: [] }; }
function addNode(g, type, props) {
  const n = { id: g.nodes.length, type, ins: [], outs: [], ...props };
  g.nodes.push(n);
  return n.id;
}
function addEdge(g, from, to) {
  const id = g.edges.length;
  g.edges.push({ id, from, to });
  g.nodes[from].outs.push(id);
  g.nodes[to].ins.push(id);
  return id;
}
function topoOrder(g) {
  const indeg = g.nodes.map(n => n.ins.length);
  const queue = g.nodes.filter(n => !n.ins.length).map(n => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(g.nodes[id]);
    for (const e of g.nodes[id].outs) if (--indeg[g.edges[e].to] === 0) queue.push(g.edges[e].to);
  }
  return order;
}

// Merger: round-robin entre entradas com item, limitado pelo que a saída aceita.
// Splitter: divide igual entre saídas que aceitam. Smart splitter (overflow): saída 1 primeiro, resto na 2.
// Balancer: divisão ideal em p partes (balancer com loop).
function simulate(g) {
  const cap = g.cap;
  const order = topoOrder(g);
  const acc = g.edges.map(() => cap), off = g.edges.map(() => 0), flow = g.edges.map(() => 0);
  const sum = (ids, arr) => ids.reduce((a, e) => a + arr[e], 0);
  for (let it = 0; it < 400; it++) {
    let delta = 0;
    for (const n of order) {
      const inFlow = sum(n.ins, flow), inOff = sum(n.ins, off);
      const set = (e, f, o) => { delta = Math.max(delta, Math.abs(flow[e] - f)); flow[e] = f; off[e] = Math.min(cap, o); };
      if (n.type === 'source') {
        for (const e of n.outs) set(e, Math.min(n.rate, cap, acc[e]), n.rate);
      } else if (n.type === 'splitter' || n.type === 'balancer') {
        const a = n.outs.map(e => acc[e]);
        const f = waterfill(n.limit === undefined ? inFlow : Math.min(inFlow, n.limit), a);
        const offIn = Math.min(inOff, n.maxIn === undefined ? INF : n.maxIn, n.limit === undefined ? INF : n.limit);
        n.outs.forEach((e, j) => {
          const a2 = a.slice(); a2[j] = INF;
          set(e, f[j], waterfill(offIn, a2)[j]);
        });
      } else if (n.type === 'overflow') {
        const [p, o] = n.outs;
        const fp = Math.min(inFlow, acc[p]);
        set(p, fp, inOff);
        set(o, Math.min(inFlow - fp, acc[o]), Math.max(0, inOff - acc[p]));
      } else if (n.type === 'merger') {
        for (const e of n.outs) set(e, Math.min(inFlow, acc[e]), inOff);
      }
    }
    for (let k = order.length - 1; k >= 0; k--) {
      const n = order[k];
      n.ins.forEach((e, idx) => {
        let a;
        if (n.type === 'consumer') a = n.demand;
        else if (n.type === 'sink' || n.type === 'extra') a = cap;
        else if (n.type === 'merger' || n.type === 'balancer') {
          // Balancer com várias entradas (blueprint) puxa como um merger; maxIn é o limite da esteira do loop.
          const caps = n.ins.map(x => (x === e ? INF : off[x]));
          a = waterfill(n.type === 'merger' ? acc[n.outs[0]] : Math.min(sum(n.outs, acc), n.limit === undefined ? INF : n.limit), caps)[idx];
          if (n.maxIn !== undefined) a = Math.min(a, n.maxIn);
        } else a = sum(n.outs, acc);
        acc[e] = Math.min(cap, a);
      });
    }
    if (it > 2 && delta < 1e-9) break;
  }
  return { flow, acc, off };
}

// Liga `froms` em `to`, com mergers em cascata quando há mais de uma entrada.
function connectMany(g, froms, to) {
  if (froms.length === 1) { const e = addEdge(g, froms[0], to); return { inEdges: [e], outEdge: e, mergers: 0, mergeNode: null }; }
  const inEdges = [];
  let prev = null, i = 0, mergers = 0;
  while (i < froms.length) {
    const m = addNode(g, 'merger');
    mergers++;
    if (prev !== null) addEdge(g, prev, m);
    const take = prev === null ? 3 : 2;
    for (let k = 0; k < take && i < froms.length; k++, i++) inEdges.push(addEdge(g, froms[i], m));
    prev = m;
  }
  return { inEdges, outEdge: addEdge(g, prev, to), mergers, mergeNode: prev };
}

// Árvore de splitters; devolve a raiz e um "slot" (nó splitter) por saída.
function buildTree(g, tree) {
  const root = addNode(g, 'splitter');
  let level = [root];
  for (let li = 0; li < tree.factors.length - 1; li++) {
    const next = [];
    for (const n of level) for (let k = 0; k < tree.factors[li]; k++) { const c = addNode(g, 'splitter'); addEdge(g, n, c); next.push(c); }
    level = next;
  }
  const last = tree.factors[tree.factors.length - 1];
  const slots = [];
  for (const n of level) for (let k = 0; k < last; k++) slots.push(n);
  return { root, slots };
}

// Monta um design N→M no grafo, das esteiras `inputs` até os consumidores `outputs`.
// O loop vira um nó de divisão ideal limitado pela esteira do loop (cap × M/n).
function buildBalancer(g, d, inputs, outputs, sink) {
  const v = { design: d, inEdges: [], outEdges: [], sinkEdges: [], ...d.pieces };
  const M = outputs.length;
  const split = () => {
    if (d.kind.endsWith('-loop')) {
      const b = addNode(g, 'balancer', { maxIn: g.cap * d.M / d.n });
      return { root: b, slots: Array(M).fill(b) };
    }
    const tr = buildTree(g, d.tree);
    tr.slots.slice(M).forEach(s => v.sinkEdges.push(addEdge(g, s, sink)));
    return { root: tr.root, slots: tr.slots.slice(0, M) };
  };
  if (d.kind === 'butterfly-loop') {
    // Com o retorno o grafo vira ciclo: entra como divisão ideal limitada pela vazão do design.
    const hub = addNode(g, 'balancer', { limit: d.perOut * d.M });
    inputs.forEach(s => v.inEdges.push(addEdge(g, s, hub)));
    outputs.forEach(c => v.outEdges.push(addEdge(g, hub, c)));
  } else if (d.net) {
    const net = d.net;
    let cur = Array(net.K).fill(null);
    const inIdx = Array(net.K).fill(-1);
    net.inLane.forEach((l, i) => { cur[l] = inputs[i]; inIdx[l] = i; });
    net.rounds.forEach((rd, s) => {
      const sp = Array(net.K).fill(null), next = Array(net.K).fill(null);
      rd.splits.forEach(l => { sp[l] = addNode(g, 'splitter'); const e = addEdge(g, cur[l], sp[l]); if (s === 0) v.inEdges[inIdx[l]] = e; });
      rd.merges.forEach(m => {
        if (m.from.length === 1) { next[m.lane] = sp[m.from[0]]; return; }
        next[m.lane] = addNode(g, 'merger');
        m.from.forEach(j => addEdge(g, sp[j], next[m.lane]));
      });
      cur = next;
    });
    net.outLane.forEach((l, j) => v.outEdges.push(addEdge(g, cur[l], outputs[j])));
    net.extra.forEach(l => v.sinkEdges.push(addEdge(g, cur[l], sink)));
  } else if (d.kind === 'blueprint') {
    const hub = addNode(g, 'balancer');
    inputs.forEach(s => v.inEdges.push(addEdge(g, s, hub)));
    outputs.forEach(c => v.outEdges.push(addEdge(g, hub, c)));
  } else if (d.kind.startsWith('funnel')) {
    const tr = split();
    v.inEdges = connectMany(g, inputs, tr.root).inEdges;
    tr.slots.forEach((s, j) => v.outEdges.push(addEdge(g, s, outputs[j])));
  } else if (d.kind === 'matrix-split-loop') {
    const trees = inputs.flatMap(s => {
      const half = addNode(g, 'splitter');
      v.inEdges.push(addEdge(g, s, half));
      return [0, 1].map(() => { const tr = split(); addEdge(g, half, tr.root); return tr; });
    });
    outputs.forEach((c, j) => v.outEdges.push(connectMany(g, trees.map(tr => tr.slots[j]), c).outEdge));
  } else {
    const trees = inputs.map(s => { const tr = split(); v.inEdges.push(addEdge(g, s, tr.root)); return tr; });
    outputs.forEach((c, j) => v.outEdges.push(connectMany(g, trees.map(tr => tr.slots[j]), c).outEdge));
  }
  return v;
}

// Feeds com `overflow` passam por um Smart Splitter: saída principal no destino,
// overflow pro sink (overflowTo vazio) ou pro merger de outro destino (overflowTo = id do destino).
function buildGraph(plan, cap) {
  const g = makeGraph(cap);
  const srcNode = new Map();
  // Linha em `drain` passa por um Smart Splitter logo na saída: o que o meio não puxa vai pro sink em vez de represar.
  const drain = new Set(plan.drain || []), drainNode = new Map();
  const addSrc = l => {
    if (srcNode.has(l.id)) return;
    const n = addNode(g, 'source', { rate: l.rate, line: l });
    if (!drain.has(l.id)) { srcNode.set(l.id, n); return; }
    const ov = addNode(g, 'overflow');
    addEdge(g, n, ov);
    srcNode.set(l.id, ov);
    drainNode.set(l.id, { line: l, node: ov });
  };
  plan.feeds.forEach(f => f.mains.forEach(addSrc));
  plan.groups.forEach(gr => addSrc(gr.donor));
  if (plan.bal) plan.bal.inputs.forEach(addSrc);
  if (plan.headers) plan.headers.forEach(h => h.inputs.forEach(addSrc));
  plan.leftovers.forEach(addSrc);
  const consumer = new Map();
  [...plan.feeds.map(f => f.dst), ...plan.unfed].forEach(d => consumer.set(d.id, addNode(g, 'consumer', { demand: d.rate, line: d })));
  const sink = addNode(g, 'sink');
  const extra = addNode(g, 'extra');
  const view = { feeds: [], groups: [], leftovers: [], drains: [], sink, extra, srcNode, consumer };

  const slotByDst = new Map();
  plan.groups.forEach((gr, gi) => {
    const donor = srcNode.get(gr.donor.id);
    const p = gr.members.length;
    const v = { gr, donorNode: donor, root: null, donorEdge: null, sinkEdges: [], splitters: 0, extraMergers: 0 };
    let slots, sinkSlots = [];
    if (p === 1) slots = [donor];
    else if (gr.mode === 'loop') {
      // A esteira que entra na árvore leva doadora + retorno (n/p da doadora): no limite, a doadora entra menos.
      v.root = addNode(g, 'balancer', { maxIn: cap * p / gr.n });
      v.donorEdge = addEdge(g, donor, v.root);
      slots = Array(p).fill(v.root);
      v.splitters = gr.tree.splitters;
      v.extraMergers = 1;
    } else {
      const tr = buildTree(g, gr.tree);
      v.root = tr.root;
      v.donorEdge = addEdge(g, donor, tr.root);
      slots = tr.slots.slice(0, p);
      sinkSlots = tr.slots.slice(p);
      v.splitters = gr.tree.splitters;
    }
    gr.members.forEach((dstId, i) => slotByDst.set(dstId, { slot: slots[i], group: gi }));
    v.sinkEdges = sinkSlots.map(s => addEdge(g, s, sink));
    view.groups.push(v);
  });

  if (plan.bal) {
    const outs = plan.feeds.map(f => consumer.get(f.dst.id));
    view.bal = buildBalancer(g, plan.bal.design, plan.bal.inputs.map(l => srcNode.get(l.id)), outs, sink);
    view.feeds = plan.feeds.map((f, j) => ({
      f, consumer: outs[j], mainEdges: [], partEdge: null, outEdge: view.bal.outEdges[j], mergers: 0, mergeNode: null,
      overflowNode: null, sinkEdge: null, overflowEdge: null, overflowTo: null, inbound: [], group: null,
    }));
  } else if (plan.headers) {
    // Cano coletor: o fluido vai para onde tem espaço, então entra como divisão ideal limitada pelo cano.
    // Cano de origem dividido entre coletores: enche o primeiro e o resto segue para o próximo
    // (no grafo, uma cadeia de nós com overflow; no jogo, uma junction).
    const hubs = plan.headers.map(() => addNode(g, 'balancer', { limit: cap }));
    const splitEdge = new Map();
    view.splits = plan.splits.map(sp => {
      let prev = srcNode.get(sp.line.id), first = null;
      sp.headers.forEach((hi, k) => {
        if (k === sp.headers.length - 1) { splitEdge.set(`${sp.line.id}:${hi}`, addEdge(g, prev, hubs[hi])); return; }
        // A parte deste coletor é o que falta nele; o resto segue pelo overflow.
        const n = addNode(g, 'overflow'), part = addNode(g, 'balancer', { limit: sp.parts[k] });
        const e = addEdge(g, prev, n);
        if (first === null) first = e;
        addEdge(g, n, part);
        splitEdge.set(`${sp.line.id}:${hi}`, addEdge(g, part, hubs[hi]));
        prev = n;
      });
      return { sp, edge: first, junctions: junctionsFor(1 + sp.headers.length) };
    });
    view.headers = plan.headers.map((h, hi) => {
      const hub = hubs[hi];
      return {
        h, hub,
        inEdges: h.inputs.map(l => splitEdge.get(`${l.id}:${hi}`) ?? addEdge(g, srcNode.get(l.id), hub)),
        outEdges: h.members.map(d => addEdge(g, hub, consumer.get(d.id))),
        junctions: junctionsFor(h.inputs.length + h.members.length),
      };
    });
    view.feeds = plan.feeds.map(f => {
      const hv = view.headers.find(x => x.h.members.includes(f.dst));
      return {
        f, consumer: consumer.get(f.dst.id), mainEdges: [], partEdge: null, outEdge: hv.outEdges[hv.h.members.indexOf(f.dst)],
        mergers: 0, mergeNode: null, overflowNode: null, sinkEdge: null, overflowEdge: null, overflowTo: null, inbound: [], group: null, header: hv,
      };
    });
  } else {
    // Primeiro os Smart Splitters, para a saída principal ser a primeira do nó.
    const fv = new Map(), ovNode = new Map();
    plan.feeds.filter(f => f.overflow).forEach(f => {
      const c = consumer.get(f.dst.id);
      const ov = addNode(g, 'overflow');
      const conn = connectMany(g, f.mains.map(l => srcNode.get(l.id)), ov);
      const outEdge = addEdge(g, ov, c);
      const toSink = f.overflowTo === undefined || f.overflowTo === null;
      ovNode.set(f.dst.id, ov);
      fv.set(f.dst.id, {
        f, consumer: c, mainEdges: conn.inEdges.slice(0, f.mains.length), partEdge: null, outEdge,
        mergers: conn.mergers, mergeNode: conn.mergeNode, overflowNode: ov,
        sinkEdge: toSink ? addEdge(g, ov, sink) : null, overflowEdge: null, overflowTo: toSink ? null : f.overflowTo,
        inbound: [], group: null,
      });
    });
    plan.feeds.filter(f => !f.overflow).forEach(f => {
      const c = consumer.get(f.dst.id);
      const froms = f.mains.map(l => srcNode.get(l.id));
      const slot = slotByDst.get(f.dst.id);
      if (slot) froms.push(slot.slot);
      const senders = plan.feeds.filter(x => x.overflow && x.overflowTo === f.dst.id);
      senders.forEach(x => froms.push(ovNode.get(x.dst.id)));
      const conn = connectMany(g, froms, c);
      const nm = f.mains.length;
      const inbound = senders.map((x, i) => ({ from: x.dst.id, edge: conn.inEdges[nm + (slot ? 1 : 0) + i] }));
      inbound.forEach(ib => { fv.get(ib.from).overflowEdge = ib.edge; });
      fv.set(f.dst.id, {
        f, consumer: c, mainEdges: conn.inEdges.slice(0, nm), partEdge: slot ? conn.inEdges[nm] : null, outEdge: conn.outEdge,
        mergers: conn.mergers, mergeNode: conn.mergeNode, overflowNode: null, sinkEdge: null, overflowEdge: null, overflowTo: null,
        inbound, group: slot ? slot.group : null,
      });
    });
    view.feeds = plan.feeds.map(f => fv.get(f.dst.id));
    view.groups.forEach((v, gi) => {
      if (v.donorEdge === null) v.donorEdge = view.feeds.find(x => x.group === gi).partEdge;
    });
  }

  plan.leftovers.forEach(l => {
    const n = srcNode.get(l.id);
    const to = plan.policy === 'sink' ? sink : plan.policy === 'extra' ? extra : null;
    view.leftovers.push({ line: l, node: n, edge: to === null ? null : addEdge(g, n, to) });
  });
  // Por último, para a saída principal do Smart Splitter ser a primeira do nó.
  drainNode.forEach(d => view.drains.push({ ...d, sinkEdge: addEdge(g, d.node, sink) }));
  return { g, view };
}

function evaluatePlan(plan, cap) {
  const { g, view } = buildGraph(plan, cap);
  const sim = simulate(g);
  const sumE = ids => ids.reduce((a, e) => a + sim.flow[e], 0);
  const sources = new Map(), dests = new Map();
  for (const n of g.nodes) {
    if (n.type === 'source') {
      const out = sumE(n.outs);
      sources.set(n.line.id, { line: n.line, out, held: Math.max(0, n.line.rate - out) });
    } else if (n.type === 'consumer') {
      const got = sumE(n.ins);
      dests.set(n.line.id, { line: n.line, got, short: Math.max(0, n.line.rate - got) });
    }
  }
  const sinkRate = sumE(g.nodes[view.sink].ins);
  const extraRate = sumE(g.nodes[view.extra].ins);
  let held = 0, served = 0, demand = 0, midHeld = 0;
  const left = new Set(plan.leftovers.map(l => l.id));
  sources.forEach(s => { held += s.held; if (!left.has(s.line.id)) midHeld += s.held; });
  dests.forEach(d => { served += d.got; demand += d.line.rate; });
  const full = [...dests.values()].every(d => d.short < 0.05);
  const bal = view.bal || { mergers: 0, splitters: 0, blueprints: 0 };
  const pieces = {
    mergers: view.feeds.reduce((a, f) => a + f.mergers, 0) + view.groups.reduce((a, v) => a + v.extraMergers, 0) + bal.mergers,
    splitters: view.groups.reduce((a, v) => a + v.splitters, 0) + bal.splitters,
    smart: view.feeds.filter(f => f.overflowNode !== null).length + view.drains.length,
    blueprints: bal.blueprints,
    junctions: (view.headers || []).reduce((a, h) => a + h.junctions, 0) + (view.splits || []).reduce((a, x) => a + x.junctions, 0),
    sinkBelts: g.nodes[view.sink].ins.length,
  };
  const warnings = [];
  for (const v of view.groups) {
    const d = v.gr.division;
    if (v.gr.mode === 'loop' && !d.loop.beltOk) warnings.push(t('warnLoopBelt', fmt(d.loop.beltLoad)));
    if (v.gr.mode === 'sink' && !d.sink.ok) warnings.push(t('warnSinkPart', srcTag(v.gr.donor.id), d.n, fmt(d.sink.part), fmt(v.gr.maxDeficit)));
  }
  let caseLabel;
  if (!full) caseLabel = t('casePartial');
  else if (plan.kind === 'direct') caseLabel = t('caseA');
  else if (plan.kind === 'merge') caseLabel = t('caseC');
  else if (plan.kind === 'overflow') caseLabel = t('caseD');
  else if (plan.kind === 'header') caseLabel = t('caseHeader');
  else if (plan.kind === 'balancer') caseLabel = t('caseBal', plan.bal.inputs.length, plan.feeds.length);
  else caseLabel = plan.multi ? t('caseCB') : t('caseB');
  return { ...plan, g, view, sim, sources, dests, sinkRate, extraRate, held, midHeld, served, demand, full, pieces, warnings, caseLabel };
}

// Gera as alternativas para ligar as linhas de origem nas de destino.
function generatePlans(srcLines, dstLines, cap, policy, blueprints = [], fluid = false) {
  const S = srcLines.map((l, i) => ({ ...l, id: i })).sort((a, b) => b.rate - a.rate || a.id - b.id);
  const D = dstLines.map((l, i) => ({ ...l, id: i })).sort((a, b) => b.rate - a.rate || a.id - b.id);
  if (!S.length || !D.length) return [];
  const plans = [];
  const mk = (key, kind, title, feeds, groups, leftovers, extra) => ({
    key, kind, title, feeds, groups, leftovers, policy,
    unfed: D.filter(d => !feeds.some(f => f.dst.id === d.id)),
    ...extra,
  });

  // Melhor encaixe: cada destino (do maior pro menor) pega a menor linha que o cobre sozinha;
  // se nenhuma cobre, pega a maior que sobrou. Com linhas iguais dá o mesmo que parear em ordem.
  const avail = S.slice();
  const fit = [];
  for (const d of D) {
    if (!avail.length) break;
    const covering = avail.filter(l => l.rate + EPS >= d.rate);
    // Entre linhas de mesma taxa, a de menor número: O1 vai pro primeiro destino que pedir.
    const smallest = covering.length ? covering[covering.length - 1].rate : null;
    const pick = covering.length ? covering.find(l => Math.abs(l.rate - smallest) < EPS) : avail[0];
    avail.splice(avail.indexOf(pick), 1);
    fit.push({ dst: d, mains: [pick], deficit: Math.max(0, d.rate - pick.rate), excess: Math.max(0, pick.rate - d.rate) });
  }
  const direct = fit.map(f => ({ dst: f.dst, mains: f.mains }));
  plans.push(mk('direto', 'direct', t('planDirect'), direct, [], avail.slice(), { sub: t('planDirectSub') }));
  // Fluido: sem splitter, Smart Splitter nem sink. Só ligar direto ou passar por canos coletores.
  if (fluid) {
    const hd = headerGroups(S, D, cap);
    if (hd.splits.length || hd.headers.some(h => h.inputs.length > 1 || h.members.length > 1)) {
      const feeds = hd.headers.flatMap(h => h.members.map(d => ({ dst: d, mains: [] })));
      plans.push(mk('coletor', 'header', t('planHeader'), feeds, [], hd.rest, { sub: t('planHeaderSub'), headers: hd.headers, splits: hd.splits }));
    }
    return plans;
  }
  if (fit.some(f => f.excess > EPS)) {
    plans.push(mk('direto-sink', 'direct', t('planDirectSink'),
      direct.map((f, i) => ({ ...f, overflow: fit[i].excess > EPS })), [], avail.slice(), { sub: t('planDirectSinkSub') }));
  }

  // Redistribuição: o excesso de uma linha (Smart Splitter com overflow) completa o destino que falta.
  const exc = fit.filter(f => f.excess > EPS).sort((a, b) => b.excess - a.excess);
  const def = fit.filter(f => f.deficit > EPS).sort((a, b) => b.deficit - a.deficit);
  if (exc.length && def.length) {
    const spare = avail.slice().sort((a, b) => b.rate - a.rate);
    const sendTo = new Map(), extraMains = new Map();
    for (const tg of def) {
      let got = 0;
      while (got + EPS < tg.deficit && exc.length) { const e = exc.shift(); sendTo.set(e.dst.id, tg.dst.id); got += e.excess; }
      const add = [];
      while (got + EPS < tg.deficit && spare.length) { const l = spare.shift(); add.push(l); got += l.rate; }
      extraMains.set(tg.dst.id, add);
    }
    if (sendTo.size) {
      const feeds = fit.map(f => (sendTo.has(f.dst.id)
        ? { dst: f.dst, mains: f.mains, overflow: true, overflowTo: sendTo.get(f.dst.id) }
        : { dst: f.dst, mains: f.mains.concat(extraMains.get(f.dst.id) || []) }));
      plans.push(mk('redistribuir', 'overflow', t('planRedist'), feeds, [], spare, { sub: t('planRedistSub') }));
    }
  }

  const s = S[0].rate;
  const full = S.filter(l => Math.abs(l.rate - s) < EPS);
  const rest = S.filter(l => Math.abs(l.rate - s) >= EPS);

  const ceilQ = D.map(d => Math.max(1, Math.ceil(d.rate / s - EPS)));
  if (ceilQ.some(q => q > 1) && ceilQ.reduce((a, b) => a + b, 0) <= full.length) {
    let i = 0;
    const feeds = D.map((d, j) => { const mains = full.slice(i, i + ceilQ[j]); i += ceilQ[j]; return { dst: d, mains }; });
    plans.push(mk('juntar', 'merge', t('planMerge'), feeds, [], full.slice(i).concat(rest), { sub: t('planMergeSub') }));
  }

  // Complemento: divide doadoras do pool entre os destinos com déficit.
  const seenSig = new Set();
  const donorPlans = (base, pool, multi, tag) => {
    pool = pool.slice().sort((a, b) => b.rate - a.rate);
    const needs = base.filter(f => f.deficit > EPS).sort((a, b) => b.deficit - a.deficit);
    let found = 0;
    for (let kd = 1; needs.length && kd <= pool.length && found < 3; kd++) {
      const groups = tryDonors(needs, pool, kd, cap);
      if (!groups) continue;
      const sig = JSON.stringify([base.map(f => [f.dst.id, f.mains.map(l => l.id)]), groups.map(gr => [gr.donor.id, gr.members.map(f => f.dst.id)])]);
      if (seenSig.has(sig)) continue;
      seenSig.add(sig);
      found++;
      const allDirect = groups.every(gr => gr.division.direct);
      const variants = allDirect ? ['direct'] : ['sink', 'loop'];
      const used = new Set(groups.map(gr => gr.donor.id));
      for (const v of variants) {
        const gs = groups.map(gr => ({
          donor: gr.donor, members: gr.members.map(f => f.dst.id), maxDeficit: gr.maxDeficit,
          division: gr.division, mode: gr.division.direct ? 'direct' : v,
          tree: gr.division.tree, p: gr.division.p, n: gr.division.n,
        }));
        const sub = t(v === 'direct' ? 'planDonorSubDirect' : v === 'sink' ? 'planDonorSubSink' : 'planDonorSubLoop');
        plans.push(mk(`doadora${tag}-${kd}-${v}`, 'donor', t('planDonor', multi, kd, v),
          base.map(f => ({ dst: f.dst, mains: f.mains, deficit: f.deficit })), gs,
          pool.filter(l => !used.has(l.id)), { sub, multi }));
      }
    }
  };

  const floorQ = D.map(d => (d.rate <= s + EPS ? 1 : Math.floor(d.rate / s + EPS)));
  if (floorQ.reduce((a, b) => a + b, 0) <= full.length) {
    let i = 0;
    const base = D.map((d, j) => {
      const mains = full.slice(i, i + floorQ[j]); i += floorQ[j];
      return { dst: d, mains, deficit: Math.max(0, d.rate - floorQ[j] * s) };
    });
    donorPlans(base, full.slice(i).concat(rest), floorQ.some(q => q > 1), '');
  }
  if (fit.length === D.length) donorPlans(fit, avail, false, '-encaixe');

  // Balancer N→M: as maiores linhas até somar a demanda entram num balancer que reparte igual entre os M destinos.
  // Uma alternativa por design aplicável; computePlan fica só com a melhor delas.
  const directFull = fit.length === D.length && fit.every(f => f.deficit < EPS);
  if (D.length >= 2 && !directFull) {
    const need = D.reduce((a, d) => a + d.rate, 0);
    const ins = [];
    let sum = 0;
    for (const l of S) { if (sum + EPS >= need) break; ins.push(l); sum += l.rate; }
    const rates = ins.map(l => l.rate);
    for (const d of balancerCandidates(ins.length, D.length, rates, cap, blueprints)) {
      if (d.applies) continue;
      plans.push(mk(`balancer-${d.kind}${d.bp ? `-${d.bp.n}x${d.bp.m}` : ''}`, 'balancer', t('planBal', ins.length, D.length, designName(d)),
        D.map(dd => ({ dst: dd, mains: [] })), [], S.filter(l => !ins.includes(l)),
        { sub: t('planBalSub'), bal: { inputs: ins, design: d } }));
    }
  }
  return plans;
}

// Canos coletores: os destinos (do maior pro menor) vão para o primeiro coletor em que cabem (até `cap`).
// Os canos de origem enchem os coletores em sequência; quando um cano tem mais do que falta num coletor,
// uma Pipeline Junction divide ele e o resto segue para o próximo coletor (`splits`).
function headerGroups(S, D, cap) {
  const headers = [];
  for (const d of D) {
    let h = headers.find(x => x.need + d.rate <= cap + EPS);
    if (!h) { h = { need: 0, members: [], inputs: [] }; headers.push(h); }
    h.members.push(d);
    h.need += d.rate;
  }
  const pool = S.slice(), splits = new Map();
  let carry = null;
  headers.forEach((h, hi) => {
    let need = h.need;
    const last = hi === headers.length - 1;
    while (need > EPS) {
      if (!carry) { if (!pool.length) break; const l = pool.shift(); carry = { line: l, left: l.rate }; }
      h.inputs.push(carry.line);
      if (carry.left <= need + EPS || last) {
        if (splits.has(carry.line.id)) splits.get(carry.line.id).parts.push(carry.left);
        need -= carry.left;
        carry = null;
        continue;
      }
      if (!splits.has(carry.line.id)) splits.set(carry.line.id, { line: carry.line, headers: [hi], parts: [] });
      const sp = splits.get(carry.line.id);
      sp.headers.push(hi + 1);
      sp.parts.push(need);
      carry.left -= need;
      need = 0;
    }
  });
  return { headers: headers.filter(h => h.inputs.length), splits: [...splits.values()], rest: pool };
}

function designName(d) {
  if (d.kind === 'blueprint') return t('dkBlueprint', d.bp.n, d.bp.m);
  return t({ butterfly: 'dkButterfly', 'butterfly-loop': 'dkButterflyLoop', 'butterfly-sink': 'dkButterflySink', matrix: 'dkMatrix', funnel: 'dkFunnel', 'matrix-loop': 'dkMatrixLoop', 'matrix-split-loop': 'dkMatrixSplitLoop', 'funnel-loop': 'dkFunnelLoop', 'matrix-sink': 'dkMatrixSink', 'funnel-sink': 'dkFunnelSink' }[d.kind]);
}

// Blueprint conta como uma peça: é só colar.
// excess 'sink': entre as que enchem tudo, primeiro as que não represam nada no meio.
function rankPlans(evaluated, excess = 'represar') {
  // Balancer borboleta conta como mais peças, pelo mesmo critério de rankDesigns.
  const cost = a => a.pieces.mergers + a.pieces.splitters + a.pieces.smart + a.pieces.blueprints + a.pieces.junctions
    + (a.bal && bfKind(a.bal.design) ? buildCost(a.bal.design) - designPieces(a.bal.design) : 0);
  const holds = a => (excess === 'sink' && a.full && a.midHeld > 0.05 ? 1 : 0);
  return evaluated.slice().sort((a, b) =>
    (b.full - a.full) || (b.served - a.served) * (a.full ? 0 : 1) || holds(a) - holds(b) || cost(a) - cost(b) || a.sinkRate - b.sinkRate);
}

// A melhor alternativa que enche tudo mas represa no meio ganha uma versão sem represa:
// Smart Splitter na saída de cada linha represada, overflow pro sink.
function drainPlan(evaluated, cap) {
  const base = rankPlans(evaluated).find(a => a.full && a.midHeld > 0.05 && a.kind !== 'direct');
  if (!base) return null;
  const left = new Set(base.leftovers.map(l => l.id));
  const ids = [...base.sources.values()].filter(s => s.held > 0.05 && !left.has(s.line.id)).map(s => s.line.id);
  const { g, view, sim, sources, dests, sinkRate, extraRate, held, midHeld, served, demand, full, pieces, warnings, caseLabel, designAlts, ...plan } = base;
  const a = evaluatePlan({ ...plan, key: `${base.key}-sem-represa`, title: t('planDrain', base.title), sub: t('planDrainSub'), drain: ids }, cap);
  return a.full ? a : null;
}

// Plano completo a partir das entradas.
// srcGroups/dstGroups: [{ driver: 'machines'|'clock'|'total', count, clock, nominal, total, per }].
function computePlan(input) {
  const cap = input.cap;
  const fluid = input.medium === 'fluid';
  // O Awesome Sink não aceita fluido: a sobra represa.
  const policy = fluid && input.policy === 'sink' ? 'represar' : input.policy || 'represar';
  const conv = input.conv || 'k-1';
  const srcGroups = input.srcGroups || [{ driver: 'machines', count: input.srcCount, nominal: input.srcRate, per: input.srcPer }];
  const dstGroups = input.dstGroups || [{ driver: 'machines', count: input.dstCount, nominal: input.dstRate, per: input.dstPer }];
  const src = buildLines(srcGroups, cap, t('sideSrc'), fluid);
  const dst = buildLines(dstGroups, cap, t('sideDst'), fluid, { balance: true, mix: false });
  // O Awesome Sink não aceita fluido: no cano o excesso sempre represa.
  const excess = fluid ? 'represar' : input.excess === 'sink' ? 'sink' : 'represar';
  const evaluated = generatePlans(src.lines, dst.lines, cap, policy, input.blueprints || [], fluid).map(p => evaluatePlan(p, cap));
  const drained = fluid ? null : drainPlan(evaluated, cap);
  if (drained) evaluated.push(drained);
  const ranked = rankPlans(evaluated, excess);
  // Dos designs de balancer, só o melhor vira alternativa; os outros ficam para a comparação.
  const balAlts = ranked.filter(a => a.kind === 'balancer' && !a.drain);
  const alternatives = ranked.filter(a => a.kind !== 'balancer' || a === balAlts[0] || a.drain);
  if (balAlts.length) balAlts[0].designAlts = balAlts;
  const supply = src.total, demand = dst.total;

  const warnings = [...src.warnings, ...dst.warnings];
  if (demand > supply + EPS) {
    const one = dst.groups.length === 1 && !dst.groups[0].continuous ? dst.groups[0] : null;
    warnings.push({ level: 'bad', text: t('warnDemand', fmt(demand), fmt(supply), one ? fmt(supply / one.nominal, 2) : null) });
  }
  const mixed = l => l.partial && l.comp && l.comp.length && !l.comp[0].total;
  const mixedList = ls => ls.map(l => `${lineComp(l)} = ${fmt(l.rate)}/min`).join('; ');
  const srcMixed = src.lines.filter(mixed);
  if (srcMixed.length) warnings.push({ level: 'warn', text: t('warnCollectMixed', srcMixed.length, mixedList(srcMixed)) });
  const dstMixed = dst.lines.filter(mixed);
  if (dstMixed.length) warnings.push({ level: 'warn', text: t('warnDistMixed', dstMixed.length, mixedList(dstMixed)) });

  return {
    input, cap, conv, policy, excess, fluid, src, dst, supply, demand, alternatives, warnings,
    collectMergers: manifoldPieces(src.lines, conv),
    distSplitters: manifoldPieces(dst.lines, conv),
  };
}

// ---- Histórico de desfazer/refazer ----
// Pilha imutável: past (mais antigo primeiro), present, future (o próximo a refazer primeiro).
function historyNew(present, limit = 100) { return { past: [], present, future: [], limit }; }
const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Passo novo: igual ao atual não conta; descarta o que dava para refazer; guarda no máximo `limit` passos para trás.
function historyPush(h, state) {
  if (sameState(h.present, state)) return h;
  return { ...h, past: [...h.past, h.present].slice(-h.limit), present: state, future: [] };
}
function historyUndo(h) {
  if (!h.past.length) return h;
  return { ...h, past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
function historyRedo(h) {
  if (!h.future.length) return h;
  return { ...h, past: [...h.past, h.present].slice(-h.limit), present: h.future[0], future: h.future.slice(1) };
}
// Troca o estado atual sem criar passo (ex.: os mesmos números escritos no formato de outro idioma).
function historyReplace(h, state) { return { ...h, present: state }; }

// ---- Link do cenário ----
// O cenário vai no fragmento da URL (#s=...), que o navegador não manda para o servidor.
function encodeShare(state) {
  let bin = '';
  new TextEncoder().encode(JSON.stringify(state)).forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Devolve só o que o formulário entende, com texto curto; link quebrado ou adulterado vira null.
function decodeShare(str) {
  let raw;
  try {
    const bin = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
    raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  } catch (e) { return null; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.src) || !Array.isArray(raw.dst) || !raw.src.length || !raw.dst.length) return null;
  const str40 = v => (v === undefined || v === null ? '' : String(v).slice(0, 40));
  const row = r => {
    const o = r && typeof r === 'object' ? r : {};
    return { driver: ['machines', 'clock', 'total'].includes(o.driver) ? o.driver : 'machines', count: str40(o.count), clock: str40(o.clock), nominal: str40(o.nominal), total: str40(o.total), per: str40(o.per) };
  };
  const pick = (v, ok, def) => (ok.includes(v) ? v : def);
  return {
    item: String(raw.item || '').slice(0, 80),
    src: raw.src.slice(0, 20).map(row), dst: raw.dst.slice(0, 20).map(row),
    medium: pick(raw.medium, ['item', 'fluid'], 'item'),
    belt: pick(raw.belt, BELTS.map(b => b.id), 'Mk4'),
    pipe: pick(raw.pipe, PIPES.map(b => b.id), 'Mk2'),
    policy: pick(raw.policy, ['represar', 'sink', 'extra'], 'represar'),
    excess: pick(raw.excess, ['represar', 'sink'], 'represar'),
    conv: pick(raw.conv, ['k-1', 'k'], 'k-1'),
    selectedKey: typeof raw.selectedKey === 'string' ? raw.selectedKey.slice(0, 80) : null,
    lang: pick(raw.lang, LANGS, 'en'),
  };
}
// Issue nova no GitHub já preenchida.
const REPO = 'https://github.com/AdolfoCarneiro/sf-balancer';
function issueUrl(title, body) {
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

if (typeof module !== 'undefined') module.exports = { BELTS, PIPES, resolveGroup, buildLines, sizeParts, lineComp, summarizeRates, manifoldPieces, isDirect, nextDirect, splitTree, describeTree, divisionOptions, mergersFor, junctionsFor, chainSizes, chainSlot, DESIGN_KINDS, balancerDesign, blueprintDesign, butterflyGroup, butterflyNet, butterflyDesign, buildBalancer, makeGraph, addNode, addEdge, designFloors, L3D, PORT3D, layout3d, focus3d, byPiece3d, pieceText3d, planFootprint, PLAN_GRID, designerSize, snapGrid, planCells, placeMark, defaultMark, defaultMarks, addMark, panView, zoomView, tapGesture, fitDistance, balancerCandidates, rankDesigns, designWhy, designPieces, designOut, designName, waterfill, simulate, generatePlans, headerGroups, evaluatePlan, computePlan, encodeShare, decodeShare, issueUrl, historyNew, historyPush, historyUndo, historyRedo, historyReplace };
// LOGIC-END

const $ = id => document.getElementById(id);
const DEFAULTS = {
  get item() { return t('defaultItem'); },
  src: [{ driver: 'machines', count: '42', clock: '', nominal: '65', total: '', per: '' }],
  dst: [{ driver: 'machines', count: '60', clock: '', nominal: '40', total: '', per: '' }],
  medium: 'item', belt: 'Mk4', pipe: 'Mk2', policy: 'represar', excess: 'represar', conv: 'k-1',
};
const STORE = 'sf-balancer:v3';
const LANG_STORE = 'sf-balancer:lang';
let selectedKey = null;
let histQuiet = false;

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const O = l => srcTag(l.id);
const Dn = l => dstTag(l.id);

// ---- Idioma ----
// Cada idioma tem um endereço próprio no site (/, /pt, /es) para os buscadores; o vercel.json reescreve para o index.html.
const SITE = 'https://sf-balancer.vercel.app';
// Atalhos externos para quem não quer montar o balancer na mão: o mod e os blueprints da comunidade.
const EXT_MOD = 'https://ficsit.app/mod/LoadBalancers';
const extBpUrl = () => `https://satisfactory-calculator.com/${getLang()}/blueprints`;
const extLink = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`;
const extLinks = () => [extLink(EXT_MOD, 'Modular Load Balancers (ficsit.app)'), extLink(extBpUrl(), t('extBp'))].join(' · ');
const LANG_PATH = { en: '/', pt: '/pt', es: '/es' };
const onVercel = /(^|\.)vercel\.app$/.test(location.hostname);
// Ordem: caminho (/pt, /es), ?lang= na URL, escolha salva, inglês.
function pickLang() {
  const fromPath = (location.pathname.match(/^\/(pt|es|en)\/?$/) || [])[1];
  if (I18N[fromPath]) return fromPath;
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (I18N[fromUrl]) return fromUrl;
  let saved = null;
  try { saved = localStorage.getItem(LANG_STORE); } catch (e) { /* sem storage */ }
  if (I18N[saved]) return saved;
  return 'en';
}

// Bandeiras em SVG: emoji de bandeira não aparece no Windows.
const FLAGS = {
  pt: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#009c3b"/><path d="M10 1.8 18 7l-8 5.2L2 7z" fill="#ffdf00"/><circle cx="10" cy="7" r="3.1" fill="#002776"/><path d="M7 6.3c2-.6 4.2-.4 6 .7" stroke="#fff" stroke-width=".6" fill="none"/></svg>`,
  en: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#fff"/><path d="M0 0h20v1.08H0zm0 2.15h20v1.08H0zm0 2.16h20v1.07H0zm0 2.15h20v1.08H0zm0 2.16h20v1.07H0zm0 2.15h20v1.08H0zm0 2.15h20V14H0z" fill="#b22234"/><rect width="8.5" height="7.54" fill="#3c3b6e"/><g fill="#fff"><circle cx="1.6" cy="1.4" r=".45"/><circle cx="4.25" cy="1.4" r=".45"/><circle cx="6.9" cy="1.4" r=".45"/><circle cx="2.9" cy="3.77" r=".45"/><circle cx="5.6" cy="3.77" r=".45"/><circle cx="1.6" cy="6.1" r=".45"/><circle cx="4.25" cy="6.1" r=".45"/><circle cx="6.9" cy="6.1" r=".45"/></g></svg>`,
  es: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#aa151b"/><rect y="3.5" width="20" height="7" fill="#f1bf00"/></svg>`,
};

// Textos fixos do HTML (inclusive os dos grupos já clonados do template).
function applyStatic() {
  document.documentElement.lang = t('htmlLang');
  document.title = t('pageTitle');
  document.querySelector('meta[name=description]').content = t('metaDesc');
  let canon = document.querySelector('link[rel=canonical]');
  if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.append(canon); }
  canon.href = SITE + LANG_PATH[getLang()];
  // No site, o endereço acompanha o idioma; aberto direto do disco ou em outro servidor, fica como está.
  if (onVercel && location.pathname !== LANG_PATH[getLang()]) history.replaceState(null, '', LANG_PATH[getLang()] + location.hash);
  const roots = [document, $('grpTpl').content];
  for (const root of roots) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  }
  const belt = $('belt').value;
  $('belt').innerHTML = BELTS.map(b => `<option value="${b.id}">${b.id}, ${fmt(b.cap)}/min</option>`).join('');
  $('belt').value = belt || 'Mk4';
  const pipe = $('pipe').value;
  $('pipe').innerHTML = PIPES.map(b => `<option value="${b.id}">${esc(t('pipeOpt', b.id, fmt(b.cap)))}</option>`).join('');
  $('pipe').value = pipe || 'Mk2';
  const libBelt = $('libBelt').value;
  $('libBelt').innerHTML = $('belt').innerHTML;
  $('libBelt').value = libBelt || 'Mk4';
  $('langs').innerHTML = LANGS.map(l => `<button type="button" data-lang="${l}" lang="${I18N[l].htmlLang}" title="${I18N[l].langName}" aria-pressed="${l === getLang()}">${FLAGS[l]}${l.toUpperCase()}</button>`).join('');
  $('faqExt').innerHTML = extLinks();
  syncGroups('src');
  syncGroups('dst');
  renderScenarios();
}

// Os números digitados mudam de formato junto com o idioma ("65,5" vira "65.5").
function convertInputs(from) {
  const to = getLang();
  for (const side of ['src', 'dst']) for (const r of rows[side]) for (const k of ['count', 'clock', 'nominal', 'total', 'per']) {
    const raw = r[k].value.trim();
    if (!raw) continue;
    setLang(from);
    const v = parseNum(raw);
    setLang(to);
    if (isFinite(v)) r[k].value = v.toLocaleString(t('locale'), { maximumFractionDigits: 6, useGrouping: false });
  }
}
// Nome de exemplo acompanha o idioma; nome digitado pelo usuário fica.
const itemFor = name => (LANGS.some(x => I18N[x].defaultItem === name) ? t('defaultItem') : name);

function changeLang(l) {
  const prev = getLang();
  setLang(l);
  try { localStorage.setItem(LANG_STORE, getLang()); } catch (e) { /* sem storage */ }
  if (histTimer) histCommit();
  convertInputs(prev);
  $('item').value = itemFor($('item').value);
  applyStatic();
  render();
  if (HIST) HIST = historyReplace(HIST, histSnap());
  const rate = $('libRate').value.trim();
  if (rate) { setLang(prev); const v = parseNum(rate); setLang(l); if (isFinite(v)) $('libRate').value = fmt(v, 6); }
  renderBps();
  renderCatalog();
  renderLib();
}

// ---- Grupos de máquinas editáveis (origem e destino) ----
const rows = { src: [], dst: [] };
const CONTAINER = { src: 'srcGroups', dst: 'dstGroups' };
let groupSeq = 0;

function addGroup(side, v = { driver: 'machines', count: '', clock: '', nominal: '', total: '', per: '' }) {
  const el = $('grpTpl').content.firstElementChild.cloneNode(true);
  const q = c => el.querySelector(c);
  // O "?" fica fora do <label>, então o rótulo aponta para o campo por id.
  const uid = ++groupSeq;
  el.querySelectorAll('label[data-for]').forEach(lb => {
    const input = q('.' + lb.dataset.for);
    input.id = `${lb.dataset.for}-${uid}`;
    lb.htmlFor = input.id;
  });
  const row = { el, side, driver: v.driver || 'machines', count: q('.g-count'), clock: q('.g-clock'), nominal: q('.g-nom'), total: q('.g-total'), per: q('.g-per'), eq: q('.eq'), name: q('.grp-name'), rm: q('.rm') };
  for (const k of ['count', 'clock', 'nominal', 'total', 'per']) row[k].value = v[k] || '';
  // Quem foi preenchido por último manda; os outros viram equivalência.
  row.count.addEventListener('input', () => {
    if (row.driver === 'total') { row.total.value = ''; row.driver = row.clock.value.trim() ? 'clock' : 'machines'; }
    else row.driver = row.clock.value.trim() ? 'clock' : 'machines';
  });
  row.clock.addEventListener('input', () => {
    if (row.driver === 'total') row.total.value = '';
    row.driver = row.clock.value.trim() ? 'clock' : 'machines';
  });
  row.total.addEventListener('input', () => {
    row.driver = row.total.value.trim() ? 'total' : 'machines';
    if (row.driver === 'total') { row.count.value = ''; row.clock.value = ''; }
  });
  row.rm.addEventListener('click', () => { el.remove(); rows[side].splice(rows[side].indexOf(row), 1); syncGroups(side); render(); });
  $(CONTAINER[side]).append(el);
  rows[side].push(row);
  syncGroups(side);
  return row;
}
function syncGroups(side) {
  rows[side].forEach((r, i) => {
    r.name.textContent = rows[side].length > 1 ? t('groupN', i + 1) : '';
    r.rm.hidden = rows[side].length === 1;
    r.el.querySelector('.g-nom-label').textContent = t(side === 'src' ? 'fNomSrc' : 'fNomDst');
    r.el.querySelector('.g-nom-tip').dataset.tip = side === 'src' ? 'tipNomSrc' : 'tipNomDst';
  });
}

// ---- Ajuda: balão dos botões "?" ----
// Abre ao passar o mouse ou focar; clique fixa (no celular é o único jeito); Esc, clique fora ou rolagem fecham.
const tip = key => `<button type="button" class="tip" data-tip="${key}" aria-label="${esc(t('helpLabel'))}">?</button>`;
let tipBtn = null, tipPinned = false;
function showTip(btn, pin = false) {
  if (tipBtn && tipBtn !== btn) hideTip();
  const box = $('tipbox');
  // Dentro do diálogo modal o balão precisa morar no diálogo, senão fica atrás dele.
  const host = btn.closest('dialog') || document.body;
  if (box.parentNode !== host) host.append(box);
  box.textContent = t(btn.dataset.tip);
  box.hidden = false;
  const r = btn.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const below = r.bottom + 8 + h <= innerHeight;
  box.style.left = `${left}px`;
  box.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
  btn.setAttribute('aria-describedby', 'tipbox');
  btn.setAttribute('aria-expanded', 'true');
  tipBtn = btn;
  tipPinned = pin;
}
function hideTip() {
  if (tipBtn) { tipBtn.removeAttribute('aria-describedby'); tipBtn.setAttribute('aria-expanded', 'false'); }
  $('tipbox').hidden = true;
  tipBtn = null;
  tipPinned = false;
}

function readGroups(side, mark) {
  return rows[side].map(r => {
    const g = { driver: r.driver, per: mark(r.per, 'opt') };
    const nom = mark(r.nominal, r.driver === 'total' ? 'opt' : 'req');
    g.nominal = nom || 0;
    if (r.driver === 'total') { g.total = mark(r.total, 'req'); mark(r.count, 'skip'); mark(r.clock, 'skip'); }
    else {
      g.count = mark(r.count, 'req');
      if (r.driver === 'clock') g.clock = mark(r.clock, 'req'); else mark(r.clock, 'skip');
      mark(r.total, 'skip');
    }
    [r.count, r.clock, r.total].forEach(e => e.classList.remove('drives'));
    ({ machines: r.count, clock: r.clock, total: r.total })[r.driver].classList.add('drives');
    return g;
  });
}

function readInput() {
  let valid = true;
  const mark = (el, kind) => {
    if (kind === 'skip') { el.classList.remove('invalid'); return 0; }
    const raw = el.value.trim();
    const v = parseNum(raw);
    const bad = kind === 'opt' ? (raw !== '' && !(v > 0)) : !(v > 0);
    el.classList.toggle('invalid', bad);
    if (bad) valid = false;
    return raw === '' ? 0 : v;
  };
  const srcGroups = readGroups('src', mark);
  const dstGroups = readGroups('dst', mark);
  const medium = document.querySelector('input[name=medium]:checked').value;
  const fluid = medium === 'fluid';
  const belt = fluid ? PIPES.find(b => b.id === $('pipe').value) : BELTS.find(b => b.id === $('belt').value);
  return {
    valid,
    input: {
      item: $('item').value.trim() || t('fallbackItem'),
      srcGroups, dstGroups,
      medium, belt: belt.id, cap: belt.cap,
      policy: document.querySelector('input[name=policy]:checked').value,
      excess: document.querySelector('input[name=excess]:checked').value,
      conv: document.querySelector('input[name=conv]:checked').value,
      blueprints: BPS,
    },
  };
}

function rowState(r) { return { driver: r.driver, count: r.count.value, clock: r.clock.value, nominal: r.nominal.value, total: r.total.value, per: r.per.value }; }
function currentState() {
  return {
    item: $('item').value,
    src: rows.src.map(rowState), dst: rows.dst.map(rowState),
    medium: document.querySelector('input[name=medium]:checked').value,
    belt: $('belt').value, pipe: $('pipe').value,
    policy: document.querySelector('input[name=policy]:checked').value,
    excess: document.querySelector('input[name=excess]:checked').value,
    conv: document.querySelector('input[name=conv]:checked').value,
    selectedKey,
    lang: getLang(),
  };
}
function saveState() {
  try { localStorage.setItem(STORE, JSON.stringify(currentState())); } catch (e) { /* sem storage, segue sem lembrar */ }
}
function loadState(state) {
  $('item').value = itemFor(state.item);
  for (const side of ['src', 'dst']) {
    // Tirar do DOM um campo editado e com foco dispara change no meio da troca; o histórico ignora até terminar.
    histQuiet = true;
    try { rows[side].splice(0).forEach(r => r.el.remove()); } finally { histQuiet = false; }
    (state[side] && state[side].length ? state[side] : DEFAULTS[side]).forEach(v => addGroup(side, v));
  }
  $('belt').value = BELTS.some(b => b.id === state.belt) ? state.belt : 'Mk4';
  $('pipe').value = PIPES.some(b => b.id === state.pipe) ? state.pipe : 'Mk2';
  const med = document.querySelector(`input[name=medium][value="${state.medium === 'fluid' ? 'fluid' : 'item'}"]`);
  med.checked = true;
  const pol = document.querySelector(`input[name=policy][value="${state.policy}"]`);
  if (pol) pol.checked = true;
  const exc = document.querySelector(`input[name=excess][value="${state.excess === 'sink' ? 'sink' : 'represar'}"]`);
  exc.checked = true;
  const conv = document.querySelector(`input[name=conv][value="${state.conv}"]`);
  if (conv) conv.checked = true;
  selectedKey = state.selectedKey || null;
}

// Mostra as três equivalências embaixo do grupo e nos campos que não mandam.
function showEquivalences(side, info, cap, fluid) {
  info.forEach(g => {
    const r = rows[side][g.gi];
    if (g.continuous) {
      r.count.placeholder = ''; r.clock.placeholder = ''; r.per.placeholder = '';
      r.eq.innerHTML = t(fluid ? 'eqContinuousPipe' : 'eqContinuous', fmt(g.total, 2), g.lines, fmt(cap));
      return;
    }
    r.count.placeholder = fmt(g.n, 2);
    r.clock.placeholder = fmt(g.clock * 100, 2);
    r.total.placeholder = fmt(g.total, 2);
    r.per.placeholder = t('perAuto', g.perLine);
    r.eq.innerHTML = t('eqMachines', {
      n: fmt(g.n, 2), one: Math.abs(g.n - 1) < EPS, N: g.N, clock: fmt(g.clock * 100, 2), total: fmt(g.total, 2),
      src: side === 'src', per: fmt(g.perMachine, 2), perLine: g.perLine, lineRate: fmt(g.lineRate, 2),
      max: g.balanced ? g.auto : null, lines: g.sizes.length, parts: t('lineParts', sizeParts(g.sizes, g.eff)),
    });
  });
}

// Esteira ou cano, com a capacidade: "Mk4, 480/min" ou "Pipeline Mk2, 600/min".
const tierLabel = (input, cap) => (input.medium === 'fluid' ? t('pipeOpt', input.belt, fmt(cap)) : `${input.belt}, ${fmt(cap)}/min`);

// Com fluido: mostra o cano no lugar da esteira e tira o sink (o Awesome Sink não aceita fluido).
function syncMedium() {
  const fluid = document.querySelector('input[name=medium]:checked').value === 'fluid';
  $('beltRule').hidden = fluid;
  $('pipeRule').hidden = !fluid;
  const sink = document.querySelector('input[name=policy][value=sink]');
  sink.disabled = fluid;
  $('policySinkChoice').classList.toggle('off', fluid);
  if (fluid && sink.checked) document.querySelector('input[name=policy][value=represar]').checked = true;
  const exSink = document.querySelector('input[name=excess][value=sink]');
  exSink.disabled = fluid;
  $('excessSinkChoice').classList.toggle('off', fluid);
  if (fluid && exSink.checked) document.querySelector('input[name=excess][value=represar]').checked = true;
}

// ---- Render ----
function render() {
  if (tipBtn && $('out').contains(tipBtn)) hideTip();
  syncMedium();
  const { valid, input } = readInput();
  const out = $('out');
  saveState();
  if (!valid) {
    $('ledger').innerHTML = '';
    $('warns').innerHTML = '';
    out.innerHTML = `<p class="lead" style="margin-top:24px">${t('invalid')}</p>`;
    $('report').href = issueUrl(t('issueTitle', input.item), shareLink());
    return;
  }
  const p = computePlan(input);
  showEquivalences('src', p.src.groups, p.cap, p.fluid);
  showEquivalences('dst', p.dst.groups, p.cap, p.fluid);

  const surplus = p.supply - p.demand;
  $('ledger').innerHTML = `
    <div><dt>${t('supply')}${tip('tipLedger')}</dt><dd>${fmt(p.supply)}<small>/min</small></dd></div>
    <div><dt>${t('demand')}</dt><dd>${fmt(p.demand)}<small>/min</small></dd></div>
    <div><dt>${surplus >= 0 ? t('surplus') : t('shortfall')}</dt><dd class="${surplus < 0 ? 'neg' : ''}">${fmt(Math.abs(surplus))}<small>/min</small></dd></div>`;
  $('warns').innerHTML = p.warnings.map(w => `<div class="warn ${w.level === 'bad' ? 'bad' : ''}">${esc(w.text)}</div>`).join('');

  const alts = p.alternatives;
  if (!alts.length) { out.innerHTML = `<p class="lead" style="margin-top:24px">${t('noLines')}</p>`; return; }
  const alt = alts.find(a => a.key === selectedKey) || alts[0];
  lastRender = { p, alt };
  $('report').href = issueUrl(t('issueTitle', input.item), t('issueBody', {
    link: shareLink(), item: input.item, medium: `${t(p.fluid ? 'tbPipe' : 'tbBelt')}: ${tierLabel(input, p.cap)}`,
    supply: fmt(p.supply), demand: fmt(p.demand), plan: alt.title, caseLabel: alt.caseLabel,
  }));
  const legend = p.fluid
    ? `<span><i style="background:var(--flow)"></i>${t('lgMain')}</span>
            <span><i class="held"></i>${t('lgHeld')}</span>
            <span><i class="piece"></i>${t('lgJunction')}</span>`
    : `<span><i style="background:var(--flow)"></i>${t('lgMain')}</span>
            <span><i style="background:var(--donor)"></i>${t('lgDonor')}</span>
            <span><i style="background:var(--ficsit)"></i>${t('lgExcess')}</span>
            <span><i style="background:var(--sink)"></i>${t('lgSink')}</span>
            <span><i class="held"></i>${t('lgHeld')}</span>
            <span>${PIECE_ICON.planMerger}${t('lgMerger')}</span>
            <span>${PIECE_ICON.smart}${t('lgSmart')}</span>`;

  out.innerHTML = `
    <div class="work">
      <aside>
        <h2 class="section-title">${t('alts')}${tip('tipAlts')}</h2>
        <p class="lead">${t('altsLead')}</p>
        <div class="alts" role="radiogroup" aria-label="${t('alts')}">${alts.map((a, i) => altCard(a, i, alt)).join('')}</div>
      </aside>
      <section>
        <h2 class="section-title">${esc(alt.title)}${tip('tipFlow')}</h2>
        <p class="lead">${esc(alt.sub)} ${t(p.fluid ? 'flowLeadPipe' : 'flowLead')}</p>
        <div class="sheet">
          ${flowSvg(p, alt)}
          <div class="legend">
            ${legend}
          </div>
          ${alt.warnings.map(w => `<div class="warn" style="margin-top:10px">${esc(w)}</div>`).join('')}
          <div class="titleblock num">
            <div>${t('tbItem')}<b>${esc(input.item)}</b></div>
            <div>${t(p.fluid ? 'tbPipe' : 'tbBelt')}<b>${esc(tierLabel(input, p.cap))}</b></div>
            <div>${t('tbMid')}<b>${alt.caseLabel}</b></div>
          </div>
        </div>
      </section>
    </div>
    <div class="pair">
      <section class="plate"><h2 class="section-title">${t('balanceTitle')}${tip('tipBalance')}</h2>${balanceTable(alt)}</section>
      <section class="plate"><h2 class="section-title">${t('stepsTitle')}</h2><ol class="steps">${planSteps(p, alt).map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>
    </div>
    <div class="pair">
      ${balancerSection(p, alt)}
      ${piecesTable(p, alt)}
    </div>`;
}

const planCost = a => a.pieces.mergers + a.pieces.splitters + a.pieces.smart + a.pieces.blueprints + a.pieces.junctions;

function altCard(a, i, sel) {
  const pc = a.pieces;
  const fullCount = [...a.dests.values()].filter(d => d.short < 0.05).length;
  const on = a.key === sel.key;
  return `<button class="alt ${on ? 'sel' : ''}" type="button" role="radio" aria-checked="${on}" data-key="${a.key}">
    ${i === 0 ? `<span class="rec">${t('recommended')}</span>` : ''}
    <span class="alt-title">${esc(a.title)}</span>
    <span class="alt-sub">${a.caseLabel}</span>
    <dl class="stats">
      <div><dt>${t('stFull')}</dt><dd class="${a.full ? 'ok' : 'bad'}">${fullCount}/${a.dests.size}</dd></div>
      <div><dt>${t('stSink')}</dt><dd>${fmt(a.sinkRate)}</dd></div>
      <div><dt>${t('stHeld')}</dt><dd>${fmt(a.held)}</dd></div>
      <div><dt>${t('stPieces')}</dt><dd>${planCost(a)}</dd></div>
    </dl>
  </button>`;
}

function balanceTable(a) {
  const dest = id => {
    const v = a.view;
    if (v.bal && a.bal.inputs.some(l => l.id === id)) return t('toBalancer', a.feeds.map(f => Dn(f.dst)).join(', '));
    const hvs = (v.headers || []).filter(h => h.h.inputs.some(l => l.id === id));
    if (hvs.length) return hvs.map(hv => t('toHeader', hv.h.members.map(Dn).join(', '))).join(' · ');
    const fv = v.feeds.find(f => f.f.mains.some(l => l.id === id));
    if (fv) {
      if (fv.overflowNode === null) return Dn(fv.f.dst);
      return t('destExcess', Dn(fv.f.dst), fv.overflowTo === null ? t('sinkWord') : dstTag(fv.overflowTo));
    }
    const gv = v.groups.find(g => g.gr.donor.id === id);
    if (gv) return t('donatesTo', gv.gr.members.map(dstTag).join(', '));
    return t({ represar: 'leftHold', sink: 'leftSink', extra: 'leftExtra' }[a.policy]);
  };
  const drained = id => {
    const dv = a.view.drains.find(d => d.line.id === id);
    return dv ? ` · ${t('destDrain', fmt(a.sim.flow[dv.sinkEdge]))}` : '';
  };
  const srcRows = [...a.sources.values()].sort((x, y) => x.line.id - y.line.id).map(s => `<tr>
    <td>${O(s.line)} <span class="sm">${esc(lineComp(s.line))}</span></td><td class="l">${dest(s.line.id)}${drained(s.line.id)}</td><td>${fmt(s.line.rate)}</td><td>${fmt(s.out)}</td>
    <td class="${s.held > 0.05 ? '' : 'dim'}">${fmt(s.held)}</td></tr>`).join('');
  const dstRows = [...a.dests.values()].sort((x, y) => x.line.id - y.line.id).map(d => `<tr>
    <td>${Dn(d.line)} <span class="sm">${esc(lineComp(d.line))}</span></td><td>${fmt(d.line.rate)}</td><td>${fmt(d.got)}</td>
    <td class="${d.short > 0.05 ? 'bad' : 'ok'}">${d.short > 0.05 ? t('statusShort', fmt(d.short), fmt(100 * d.got / d.line.rate)) : t('statusFull')}</td></tr>`).join('');
  return `<div class="tablewrap"><table>
    <tr><th>${t('thSrc')}</th><th class="l">${t('thGoesTo')}</th><th>${t('thProduces')}</th><th>${t('thOut')}</th><th>${t('thHeld')}</th></tr>${srcRows}
  </table></div>
  <div class="tablewrap" style="margin-top:16px"><table>
    <tr><th>${t('thDst')}</th><th>${t('thDemand')}</th><th>${t('thGets')}</th><th>${t('thStatus')}</th></tr>${dstRows}
  </table></div>
  <p class="hint">${t('balanceHint', fmt(a.sinkRate), a.pieces.sinkBelts, fmt(a.held), fmt(a.extraRate))}</p>`;
}

function groupSteps(side, built, conv, fluid) {
  const note = conv === 'k' ? 'k' : 'k−1';
  const head = t(side === 'src' ? 'headSrc' : 'headDst');
  return built.groups.map(g => {
    const lbl = t('stepLbl', head, built.groups.length > 1 ? g.gi + 1 : null);
    if (g.continuous) return lbl + t(fluid ? 'stepContinuousPipe' : 'stepContinuous', fmt(g.total, 2), g.lines);
    const clk = Math.abs(g.clock - 1) > 1e-4 ? t('stepClock', fmt(g.clock * 100, 2)) : '';
    const per = fmt(g.perMachine, 2);
    if (!g.fullLines) return lbl + t('stepNoFull', g.N, clk, per);
    if (g.balanced && g.fullLines < g.sizes.length) {
      return lbl + t('stepBalanced', { N: g.N, clk, per, lines: g.sizes.length, parts: t('lineParts', sizeParts(g.sizes, g.eff)), src: side === 'src', note, fluid });
    }
    return lbl + t('stepGroup', { N: g.N, clk, per, full: g.fullLines, perLine: g.perLine, lineRate: fmt(g.lineRate), src: side === 'src', note, rem: g.rem, fluid });
  });
}

function planSteps(p, a) {
  const steps = [];
  const fl = e => a.sim.flow[e];
  steps.push(...groupSteps('src', p.src, p.conv, p.fluid));
  const mixed = p.src.lines.map((l, i) => ({ ...l, id: i })).filter(l => l.partial && l.comp && l.comp.length > 1);
  if (mixed.length) steps.push(t('stepMixed', mixed.map(l => `${O(l)} = ${lineComp(l)} (${fmt(l.rate)}/min)`).join('; ')));
  steps.push(...groupSteps('dst', p.dst, p.conv, p.fluid));
  for (const v of a.view.groups) {
    const gr = v.gr, d = gr.division;
    const who = gr.members.map(dstTag).join(', ');
    if (gr.p === 1) steps.push(t('stepDonorWhole', O(gr.donor), who));
    else if (gr.mode === 'direct') steps.push(t('stepDonorDirect', O(gr.donor), fmt(gr.donor.rate), describeTree(d.tree), who));
    else if (gr.mode === 'sink') steps.push(t('stepDonorSink', O(gr.donor), describeTree(d.tree), gr.p, who, d.sink.sinkParts));
    else steps.push(t('stepDonorLoop', O(gr.donor), gr.p, describeTree(d.tree), d.loop.recirculate, who));
  }
  if (a.view.bal) {
    const d = a.view.bal.design;
    steps.push(t('stepBal', a.bal.inputs.map(O).join(', '), d.N, d.M, designName(d), fmt(d.perOut)));
  }
  for (const sv of a.view.splits || []) {
    steps.push(t('stepHeaderSplit', O(sv.sp.line), sv.sp.headers.map(i => a.view.headers[i].h.members.map(Dn).join(' + ')).join(' / '), sv.junctions));
  }
  for (const hv of a.view.headers || []) {
    steps.push(t('stepHeader', hv.h.inputs.map(O).join(' + '), hv.h.members.map(Dn).join(', '), hv.junctions, fmt(hv.inEdges.reduce((s, e) => s + fl(e), 0))));
  }
  for (const fv of a.view.bal || a.view.headers ? [] : a.view.feeds.slice().sort((x, y) => x.f.dst.id - y.f.dst.id)) {
    const f = fv.f, ds = a.dests.get(f.dst.id);
    const mains = f.mains.map((l, i) => {
      const held = a.sources.get(l.id).held;
      return t('stepMainPass', O(l), fmt(fl(fv.mainEdges[i])), held > 0.05 ? fmt(held) : null);
    }).join(' + ');
    let s = t('stepDstHead', Dn(f.dst), fmt(f.dst.rate));
    if (fv.overflowNode !== null) {
      const toD = fv.overflowTo === null ? null : dstTag(fv.overflowTo);
      s += t('stepOverflow', f.mains.map(O).join(' + '), fmt(fl(fv.outEdge)), fmt(fl(fv.overflowTo === null ? fv.sinkEdge : fv.overflowEdge)), toD);
    } else {
      const extras = [];
      if (fv.partEdge !== null) extras.push(t('stepPartDonor', fmt(fl(fv.partEdge))));
      fv.inbound.forEach(ib => extras.push(t('stepExcessFrom', dstTag(ib.from), fmt(fl(ib.edge)))));
      if (extras.length) s += t('stepMerged', mains, extras.join(' + '), fv.mergers);
      else if (f.mains.length > 1) s += t('stepJoined', mains, fv.mergers);
      else s += t('stepDirect', mains);
    }
    s += ds.short > 0.05 ? t('stepShort', fmt(ds.short)) : t('stepFull');
    steps.push(s);
  }
  if (a.view.drains.length) {
    const tot = a.view.drains.reduce((acc, d) => acc + fl(d.sinkEdge), 0);
    steps.push(t('stepDrain', a.view.drains.map(d => O(d.line)).join(', '), a.view.drains.length, fmt(tot)));
  }
  for (const d of a.unfed) steps.push(t('stepUnfed', Dn(d)));
  if (a.view.leftovers.length) {
    const names = a.view.leftovers.map(l => O(l.line)).join(', ');
    const tot = a.view.leftovers.reduce((s, l) => s + l.line.rate, 0);
    steps.push(t('stepLeftover', names, a.view.leftovers.length, fmt(tot), a.policy));
  }
  return steps;
}

// Balancer N→M da alternativa: design escolhido, por que ele e por que (ou não) um balancer aqui.
function balSection(p, a) {
  const d = a.view.bal.design;
  const ranked = rankDesigns(balancerCandidates(d.N, d.M, d.rates, p.cap, BPS));
  const best = p.alternatives[0];
  return `<section class="plate"><h2 class="section-title">${t('lbBalTitle', d.N, d.M)}${tip('tipLb')}</h2>
    <p style="margin:0 0 6px">${esc(t('lbBalLine', cap1(designName(d)), designPieces(d), fmt(d.perOut)))}</p>
    <p class="dim" style="margin:0 0 12px">${esc(whyText(ranked))}</p>
    ${checksTable(d, p.input.belt)}
    <h3 class="donor-title">${t('whyVsTitle')}</h3>
    <div class="opt on"><ul>
      <li>${esc(best === a ? t('whyIsBest') : t('whyVsBest', best.title, best.full, planCost(best), planCost(a)))}</li>
      <li>${t('whyBalWhen')}</li>
      <li>${t('whyOverflow')}</li>
    </ul></div>
    <div class="open-row"><button type="button" class="pbtn prim" data-open-bal="plan">${t('lbOpen')}</button></div>
  </section>`;
}

function balancerSection(p, a) {
  if (a.view.bal) return balSection(p, a);
  if (p.fluid) {
    return `<section class="plate"><h2 class="section-title">${t('pipeTitle')}${tip('tipMedium')}</h2>
      <p style="margin:0 0 8px">${t('pipeNote')}</p>
      <p class="dim" style="margin:0 0 8px">${t('pipeValve')}</p>
      ${a.view.headers ? `<p class="dim" style="margin:0">${t('pipeHeaderCap', fmt(p.cap))}</p>` : ''}
    </section>`;
  }
  const groups = a.view.groups.filter(v => v.gr.p > 1);
  const smart = a.view.feeds.filter(f => f.overflowNode !== null);
  const drains = a.view.drains;
  if (!groups.length && !smart.length && !drains.length) return `<section class="plate"><h2 class="section-title">${t('lbTitle')}${tip('tipLb')}</h2><p class="dim" style="margin:0">${t('lbNone')}</p></section>`;
  let html = `<section class="plate"><h2 class="section-title">${t('lbTitle')}${tip('tipLb')}</h2>`;
  if (smart.length || drains.length) {
    const fl = e => a.sim.flow[e];
    html += `<h3 class="donor-title">${t('lbSmartTitle')}</h3><div class="opt on"><ul>
      ${smart.map(fv => {
        const toD = fv.overflowTo === null ? null : dstTag(fv.overflowTo);
        const over = fl(fv.overflowTo === null ? fv.sinkEdge : fv.overflowEdge);
        return `<li>${t('lbSmartItem', fv.f.mains.map(O).join(' + '), Dn(fv.f.dst), toD, fmt(over))}</li>`;
      }).join('')}
      ${drains.map(d => `<li>${t('lbDrainItem', O(d.line), fmt(fl(d.sinkEdge)))}</li>`).join('')}
      </ul>
      <p class="hint">${t('lbSmartHint')}</p></div>`;
  }
  const ok = '<span class="ok">✓</span>';
  const openBtn = v => `<div class="open-row"><button type="button" class="pbtn" data-open-bal="g${a.view.groups.indexOf(v)}">${t('lbOpen')}</button></div>`;
  for (const v of groups) {
    const gr = v.gr, d = gr.division;
    const tree = esc(describeTree(d.tree));
    html += `<h3 class="donor-title">${t('lbDonorTitle', O(gr.donor), fmt(gr.donor.rate), gr.p)}</h3>`;
    if (d.direct) {
      html += `<div class="opt on"><ul>
        <li>${t('lbDirect', tree, d.tree.splitters)}</li>
        <li>${t('lbPart', fmt(d.part), fmt(gr.maxDeficit))} ${ok}</li>
      </ul>${treeSvg(d.tree, gr.p, 'none')}</div>${openBtn(v)}`;
    } else {
      html += `<div class="bal">
        <div class="opt ${gr.mode === 'loop' ? 'on' : ''}"><h4>${t('lbLoopTitle')}</h4><ul>
          <li>${t('lbLoopTree', tree, d.loop.recirculate)}</li>
          <li>${t('lbLoopPieces', d.tree.splitters)}</li>
          <li>${t('lbLoopPart', fmt(d.loop.part), fmt(gr.maxDeficit))} ${d.loop.ok ? ok : '<span class="bad">✗</span>'}</li>
          <li>${t('lbTreeIn', fmt(d.loop.beltLoad))} ${d.loop.beltOk ? `<span class="ok">${t('lbFits')}</span>` : `<span class="bad">${t('lbOver', p.input.belt)}</span>`}</li>
        </ul>${treeSvg(d.tree, gr.p, 'loop')}</div>
        <div class="opt ${gr.mode === 'sink' ? 'on' : ''}"><h4>${t('lbSinkTitle', d.n)}</h4><ul>
          <li>${t('lbSinkTree', tree, d.tree.splitters)}</li>
          <li>${t('lbSinkParts', gr.p, d.sink.sinkParts)}</li>
          <li>${t('lbSinkPart', fmt(d.sink.part), fmt(gr.maxDeficit))} ${d.sink.ok ? ok : `<span class="bad">${t('lbNotCover')}</span>`}</li>
        </ul>${treeSvg(d.tree, gr.p, 'sink')}</div>
      </div>${openBtn(v)}`;
    }
  }
  return html + `</section>`;
}

function piecesTable(p, a) {
  const conv = p.conv === 'k' ? 'k' : 'k−1';
  const pc = a.pieces;
  if (p.fluid) {
    return `<section class="plate"><h2 class="section-title">${t('pcTitle')}${tip('tipPieces')}</h2>
  <div class="tablewrap"><table>
    <tr><th>${t('thSection')}</th><th class="l">${t('thLines')}</th><th>${t('thJunctions')}</th></tr>
    <tr><td>${t('rowCollect')}</td><td class="l">${summarizeRates(p.src.lines)}</td><td>${p.collectMergers}</td></tr>
    <tr><td>${t('rowMid')}</td><td class="l">${a.caseLabel}</td><td>${pc.junctions}</td></tr>
    <tr><td>${t('rowDist')}</td><td class="l">${summarizeRates(p.dst.lines)}</td><td>${p.distSplitters}</td></tr>
    <tr class="sum"><td>${t('rowTotal')}</td><td></td><td>${p.collectMergers + pc.junctions + p.distSplitters}</td></tr>
  </table></div>
  <p class="hint">${t('pcHintPipe', conv)}</p>
  </section>`;
  }
  return `<section class="plate"><h2 class="section-title">${t('pcTitle')}${tip('tipPieces')}</h2>
  <div class="tablewrap"><table>
    <tr><th>${t('thSection')}</th><th class="l">${t('thLines')}</th><th>${t('thMergers')}</th><th>${t('thSplitters')}</th><th>${t('thSmart')}</th></tr>
    <tr><td>${t('rowCollect')}</td><td class="l">${summarizeRates(p.src.lines)}</td><td>${p.collectMergers}</td><td>0</td><td>0</td></tr>
    <tr><td>${t('rowMid')}</td><td class="l">${a.caseLabel}</td><td>${pc.mergers}</td><td>${pc.splitters}</td><td>${pc.smart}</td></tr>
    <tr><td>${t('rowDist')}</td><td class="l">${summarizeRates(p.dst.lines)}</td><td>0</td><td>${p.distSplitters}</td><td>0</td></tr>
    <tr class="sum"><td>${t('rowTotal')}</td><td></td><td>${p.collectMergers + pc.mergers}</td><td>${p.distSplitters + pc.splitters}</td><td>${pc.smart}</td></tr>
  </table></div>
  <p class="hint">${t('pcHint', conv, pc.sinkBelts)}${pc.blueprints ? ` ${t('pcBp', pc.blueprints)}` : ''}</p>
  </section>`;
}

// ---- Planta do fluxo ----
function flowSvg(p, a) {
  const cap = p.cap, v = a.view, fl = e => (e === null || e === undefined ? 0 : a.sim.flow[e]);
  const rowH = 54, boxW = 184, dstW = 224, boxH = 40, W = 960, top = 8;
  const xSrc = 0, xDst = W - dstW, xMerge = xDst - 42, xOv = xDst - 150, xDiv = 410;

  // Destinos na ordem das linhas (que é a dos grupos); cada origem fica na altura do destino que alimenta.
  const feedsInOrder = v.feeds.slice().sort((x, y) => x.f.dst.id - y.f.dst.id);
  const srcOrder = [];
  const seen = new Set();
  const push = l => { if (!seen.has(l.id)) { seen.add(l.id); srcOrder.push(l); } };
  feedsInOrder.forEach(fv => fv.f.mains.forEach(push));
  v.groups.forEach(g => push(g.gr.donor));
  if (v.bal) a.bal.inputs.forEach(push);
  (v.headers || []).forEach(hv => hv.h.inputs.forEach(push));
  v.leftovers.forEach(l => push(l.line));
  const dstOrder = [...v.feeds.map(fv => fv.f.dst), ...a.unfed].sort((x, y) => x.id - y.id);
  const hasSink = a.g.nodes[v.sink].ins.length > 0;
  const hasExtra = a.g.nodes[v.extra].ins.length > 0;
  const dstRows = dstOrder.length + (hasSink ? 1 : 0) + (hasExtra ? 1 : 0);
  const rows = Math.max(srcOrder.length, dstRows);
  const H = top * 2 + rows * rowH - (rowH - boxH);

  const ySrc = new Map(srcOrder.map((l, i) => [l.id, top + i * rowH + boxH / 2]));
  const yDst = new Map(dstOrder.map((d, i) => [d.id, top + i * rowH + boxH / 2]));
  const ySink = top + dstOrder.length * rowH + boxH / 2;
  const yExtra = ySink + (hasSink ? rowH : 0);
  const donorIds = new Set(v.groups.map(g => g.gr.donor.id));

  const back = [], front = [];
  const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const belt = (d, f, color, layer = front) => {
    if (f < 0.05) { layer.push(`<path d="${d}" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 5"/>`); return; }
    const w = 2.5 + 7 * Math.min(1, f / cap);
    // Como no jogo: a esteira anda na velocidade do tier e a vazão só muda a distância entre os itens.
    const speed = 60 * cap / 480;
    const per = Math.min(120, 12 * cap / f);
    layer.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w.toFixed(1)}" stroke-opacity=".35"/>
      <path class="items" style="--per:${per.toFixed(1)};--dur:${(per / speed).toFixed(3)}s" stroke-dasharray="2 ${(per - 2).toFixed(1)}" d="${d}" fill="none" stroke="${color}" stroke-width="${Math.max(2, w * 0.55).toFixed(1)}"/>`);
  };
  const label = (x, y, text, color, anchor = 'start') =>
    front.push(`<text class="rate" x="${x}" y="${y}" text-anchor="${anchor}" style="fill:${color}">${text}</text>`);
  const merger = (x, y) => front.push(`<rect x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>`);
  const smart = (x, y) => front.push(`<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/><path d="M${x - 4},${y - 4} l4,4 l-4,4 M${x},${y - 4} l4,4 l-4,4" stroke="var(--ficsit)" stroke-width="1.6" fill="none"/>`);

  v.groups.forEach((g, gi) => {
    const gr = g.gr;
    const y0 = ySrc.get(gr.donor.id);
    const members = gr.members.map(m => v.feeds.find(fv => fv.f.dst.id === m));
    if (gr.p === 1) {
      const fv = members[0];
      belt(curve(xSrc + boxW, y0, xMerge, yDst.get(fv.f.dst.id)), fl(fv.partEdge), 'var(--donor)');
      label(xMerge - 14, yDst.get(fv.f.dst.id) + 20, '+' + fmt(fl(fv.partEdge)), 'var(--donor)', 'end');
      return;
    }
    const ys = members.map(fv => yDst.get(fv.f.dst.id));
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2 + (ys.length % 2 ? rowH / 2 : 0);
    const sy = Math.max(top + 12, Math.min(mid, H - 14));
    belt(curve(xSrc + boxW, y0, xDiv - 22, sy), fl(g.donorEdge), 'var(--donor)');
    members.forEach(fv => {
      const y = yDst.get(fv.f.dst.id);
      belt(curve(xDiv + 22, sy, xMerge, y), fl(fv.partEdge), 'var(--donor)');
      label(xMerge - 14, y + 20, '+' + fmt(fl(fv.partEdge)), 'var(--donor)', 'end');
    });
    if (g.sinkEdges.length) {
      const f = g.sinkEdges.reduce((s, e) => s + fl(e), 0);
      belt(curve(xDiv + 22, sy, xDst, ySink), f, 'var(--sink)', back);
      label(xDiv + 30, sy + (ySink > sy ? 24 : -12), t('svgToSink', fmt(f)), 'var(--sink)');
    }
    const txt = gr.mode === 'loop' ? `÷${gr.p} ↺` : `÷${gr.mode === 'sink' ? gr.n : gr.p}`;
    front.push(`<g class="balblock" data-open-bal="g${gi}" tabindex="0" role="button" aria-label="${esc(t('blkAria', 1, gr.p))}">
      <polygon points="${xDiv - 24},${sy - 15} ${xDiv + 16},${sy - 15} ${xDiv + 24},${sy - 7} ${xDiv + 24},${sy + 15} ${xDiv - 24},${sy + 15}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
      <text class="lbl" x="${xDiv}" y="${sy + 5}" text-anchor="middle" style="fill:var(--ficsit)">${txt}</text></g>`);
  });

  // Balancer N→M: um bloco só no meio; o detalhe abre num diálogo.
  if (v.bal) {
    const d = v.bal.design;
    const ys = [...a.bal.inputs.map(l => ySrc.get(l.id)), ...dstOrder.map(dd => yDst.get(dd.id))];
    const ym = (Math.min(...ys) + Math.max(...ys)) / 2, half = Math.max((Math.max(...ys) - Math.min(...ys)) / 2 + 18, 40);
    const y1 = Math.max(2, ym - half), y2 = Math.min(H - 2, ym + half);
    const bx = 330, bw = 170;
    a.bal.inputs.forEach((l, i) => {
      const y = ySrc.get(l.id), f = fl(v.bal.inEdges[i]), held = a.sources.get(l.id).held;
      belt(curve(xSrc + boxW, y, bx, y), f, 'var(--flow)');
      front.push(`<text class="rate" x="${xSrc + boxW + 10}" y="${y - 10}" style="fill:var(--flow)">${fmt(f)}${held > 0.05 ? `<tspan class="sm" dx="6" style="fill:var(--held)">${t('svgHeld', fmt(held))}</tspan>` : ''}</text>`);
    });
    v.feeds.forEach(fv => { const y = yDst.get(fv.f.dst.id); belt(curve(bx + bw, y, xDst, y), fl(fv.outEdge), 'var(--flow)'); });
    if (v.bal.sinkEdges.length) {
      const f = v.bal.sinkEdges.reduce((acc, e) => acc + fl(e), 0);
      belt(curve(bx + bw, y2 - 10, xDst, ySink), f, 'var(--sink)', back);
      label(bx + bw + 12, y2 + 4, t('svgToSink', fmt(f)), 'var(--sink)');
    }
    front.push(`<g class="balblock" data-open-bal="plan" tabindex="0" role="button" aria-label="${esc(t('blkAria', d.N, d.M))}">
      <polygon points="${bx},${y1} ${bx + bw - 14},${y1} ${bx + bw},${y1 + 14} ${bx + bw},${y2} ${bx},${y2}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
      <text class="lbl" x="${bx + bw / 2}" y="${ym - 4}" text-anchor="middle" style="fill:var(--ficsit);font-size:26px">${d.N}→${d.M}</text>
      <text class="sm" x="${bx + bw / 2}" y="${ym + 16}" text-anchor="middle">${esc(designName(d))}</text>
      <text class="sm" x="${bx + bw / 2}" y="${ym + 31}" text-anchor="middle" style="fill:var(--holo)">${t('blkHint')}</text></g>`);
  }

  // Cano coletor: os canos de origem entram num bloco e os de destino saem dele.
  const labeled = new Set();
  (v.headers || []).forEach(hv => {
    // A altura do bloco vem só dos destinos, que não se repetem entre coletores: assim os blocos não se sobrepõem.
    const ys = hv.h.members.map(d => yDst.get(d.id));
    const ym = (Math.min(...ys) + Math.max(...ys)) / 2, half = Math.max((Math.max(...ys) - Math.min(...ys)) / 2 + 14, 22);
    const y1 = Math.max(2, ym - half), y2 = Math.min(H - 2, ym + half);
    const bx = 400, bw = 120;
    hv.h.inputs.forEach((l, i) => {
      const y = ySrc.get(l.id), f = fl(hv.inEdges[i]), held = a.sources.get(l.id).held;
      belt(curve(xSrc + boxW, y, bx, Math.min(Math.max(y, y1 + 8), y2 - 8)), f, 'var(--flow)');
      if (labeled.has(l.id)) return;
      labeled.add(l.id);
      front.push(`<text class="rate" x="${xSrc + boxW + 10}" y="${y - 10}" style="fill:var(--flow)">${fmt(a.sources.get(l.id).out)}${held > 0.05 ? `<tspan class="sm" dx="6" style="fill:var(--held)">${t('svgHeld', fmt(held))}</tspan>` : ''}</text>`);
    });
    hv.h.members.forEach((d, j) => {
      const y = yDst.get(d.id);
      belt(curve(bx + bw, Math.min(Math.max(y, y1 + 8), y2 - 8), xDst, y), fl(hv.outEdges[j]), 'var(--flow)');
    });
    front.push(`<rect x="${bx}" y="${y1}" width="${bw}" height="${y2 - y1}" rx="${Math.min(14, (y2 - y1) / 2)}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
      <text class="lbl" x="${bx + bw / 2}" y="${ym - 2}" text-anchor="middle" style="fill:var(--ficsit)">${esc(t('svgHeader'))}</text>
      <text class="sm" x="${bx + bw / 2}" y="${ym + 14}" text-anchor="middle">${hv.junctions} × Junction</text>`);
  });

  v.feeds.forEach(fv => {
    if (fv.header) return;
    const y = yDst.get(fv.f.dst.id);
    const ov = fv.overflowNode !== null;
    const via = fv.mergeNode !== null;
    const endX = ov ? xOv : via ? xMerge : xDst;
    fv.f.mains.forEach((l, i) => {
      const f = fl(fv.mainEdges[i]);
      const held = a.sources.get(l.id).held;
      belt(curve(xSrc + boxW, ySrc.get(l.id), endX, y), f, 'var(--flow)');
      front.push(`<text class="rate" x="${xSrc + boxW + 10}" y="${ySrc.get(l.id) - 10}" style="fill:var(--flow)">${fmt(f)}${held > 0.05 ? `<tspan class="sm" dx="6" style="fill:var(--held)">${t('svgHeld', fmt(held))}</tspan>` : ''}</text>`);
    });
    if (ov) {
      belt(`M${xOv},${y} L${xDst},${y}`, fl(fv.outEdge), 'var(--flow)');
      if (fv.overflowTo === null) {
        belt(curve(xOv, y, xDst, ySink), fl(fv.sinkEdge), 'var(--sink)', back);
        if (fl(fv.sinkEdge) > 0.05) label(xOv - 12, y + 22, t('svgToSink', fmt(fl(fv.sinkEdge))), 'var(--sink)', 'end');
      } else {
        const yt = yDst.get(fv.overflowTo);
        const f = fl(fv.overflowEdge);
        belt(`M${xOv},${y} C${xOv + 20},${y} ${xOv + 30},${yt} ${xMerge},${yt}`, f, 'var(--ficsit)', back);
        label(xOv - 12, y + 22, `${fmt(f)} → ${dstTag(fv.overflowTo)}`, 'var(--ficsit)', 'end');
      }
      smart(xOv, y);
    } else if (via) {
      belt(`M${xMerge},${y} L${xDst},${y}`, fl(fv.outEdge), 'var(--flow)');
      merger(xMerge, y);
    }
  });

  // Smart Splitter logo na saída da linha: o que o meio não puxa vai pro sink.
  v.drains.forEach(d => {
    const y0 = ySrc.get(d.line.id), x = xSrc + boxW + 34, f = fl(d.sinkEdge);
    belt(curve(x, y0, xDst, ySink), f, 'var(--sink)', back);
    if (f > 0.05) label(x + 14, y0 + 24, t('svgToSink', fmt(f)), 'var(--sink)');
    smart(x, y0);
  });

  v.leftovers.forEach(l => {
    const y0 = ySrc.get(l.line.id);
    if (l.edge === null) {
      front.push(`<path d="M${xSrc + boxW},${y0} l28,0 M${xSrc + boxW + 28},${y0 - 9} l0,18" stroke="var(--held)" stroke-width="3" fill="none"/>
        <text class="sm" x="${xSrc + boxW + 36}" y="${y0 + 4}">${t('svgStopped')}</text>`);
      return;
    }
    const isSink = a.g.edges[l.edge].to === v.sink;
    belt(curve(xSrc + boxW, y0, xDst, isSink ? ySink : yExtra), fl(l.edge), isSink ? 'var(--sink)' : 'var(--ink-dim)', back);
    label(xSrc + boxW + 10, y0 - 10, fmt(fl(l.edge)), isSink ? 'var(--sink)' : 'var(--ink-dim)');
  });

  const boxes = [];
  const plateBox = (x, y, stroke, w = boxW) => `<polygon points="${x},${y} ${x + w - 10},${y} ${x + w},${y + 10} ${x + w},${y + boxH} ${x},${y + boxH}" fill="var(--plate)" stroke="${stroke}" stroke-width="1.5"/>`;
  // Com mais de um grupo no destino, a caixa diz de qual grupo é a linha.
  const dstComp = d => (p.dst.groups.length > 1 && d.comp ? `${t('grpTag', d.comp[0].gi + 1)} · ` : '') + lineComp(d);
  srcOrder.forEach(l => {
    const y = ySrc.get(l.id) - boxH / 2;
    const st = a.sources.get(l.id);
    const color = donorIds.has(l.id) ? 'var(--donor)' : v.leftovers.some(x => x.line.id === l.id) ? 'var(--held)' : 'var(--flow)';
    const outW = (boxW - 16) * st.out / Math.max(l.rate, EPS);
    boxes.push(`${plateBox(xSrc, y, color)}
      <text class="lbl" x="${xSrc + 10}" y="${y + 20}">${O(l)}</text>
      <text class="sm" x="${xSrc + 40}" y="${y + 19}">${esc(lineComp(l))}</text>
      <text class="rate" x="${xSrc + boxW - 12}" y="${y + 20}" text-anchor="end">${fmt(l.rate)}</text>
      <rect x="${xSrc + 8}" y="${y + boxH - 11}" width="${boxW - 16}" height="5" fill="url(#hatch)"/>
      <rect x="${xSrc + 8}" y="${y + boxH - 11}" width="${outW.toFixed(1)}" height="5" fill="${color}"/>
      ${st.held > 0.05 ? `<title>${t('svgTitleHeld', O(l), fmt(st.out), fmt(st.held))}</title>` : ''}`);
  });
  dstOrder.forEach(d => {
    const y = yDst.get(d.id) - boxH / 2;
    const st = a.dests.get(d.id);
    const fill = (dstW - 16) * Math.min(1, st.got / d.rate);
    const short = st.short > 0.05;
    boxes.push(`${plateBox(xDst, y, short ? 'var(--sink)' : 'var(--ok)', dstW)}
      <text class="lbl" x="${xDst + 10}" y="${y + 20}">${Dn(d)}</text>
      <text class="sm" x="${xDst + 40}" y="${y + 19}">${esc(dstComp(d))}</text>
      <text class="rate" x="${xDst + dstW - 12}" y="${y + 20}" text-anchor="end" style="${short ? 'fill:var(--sink)' : ''}">${t('svgGot', fmt(st.got), fmt(d.rate))}</text>
      <rect x="${xDst + 8}" y="${y + boxH - 11}" width="${dstW - 16}" height="5" fill="var(--line)"/>
      <rect x="${xDst + 8}" y="${y + boxH - 11}" width="${fill.toFixed(1)}" height="5" fill="${short ? 'var(--sink)' : 'var(--ok)'}"/>`);
  });
  if (hasSink) {
    const y = ySink - boxH / 2;
    boxes.push(`${plateBox(xDst, y, 'var(--sink)', dstW)}
      <text class="lbl" x="${xDst + 10}" y="${y + 25}">${t('svgSink')}</text>
      <text class="rate" x="${xDst + dstW - 12}" y="${y + 25}" text-anchor="end" style="fill:var(--sink)">${fmt(a.sinkRate)}/min</text>`);
  }
  if (hasExtra) {
    const y = yExtra - boxH / 2;
    boxes.push(`${plateBox(xDst, y, 'var(--ink-dim)', dstW)}
      <text class="lbl" x="${xDst + 10}" y="${y + 25}">${t('svgExtra')}</text>
      <text class="rate" x="${xDst + dstW - 12}" y="${y + 25}" text-anchor="end" style="fill:var(--ink-dim)">${fmt(a.extraRate)}/min</text>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${t('svgAria')}">
    <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill="var(--line)"/><rect width="2" height="5" fill="var(--held)"/></pattern></defs>
    ${back.join('')}${front.join('')}${boxes.join('')}</svg>`;
}

// Árvore de splitters: as primeiras `useful` folhas vão pros destinos, o resto pro loop ou sink.
function treeSvg(tree, useful, kind) {
  const leaves = tree.parts;
  const W = Math.max(220, leaves * 36 + 20), levelH = 48;
  const H = (tree.levels.length + 1) * levelH + 26;
  const countAt = lv => tree.factors.slice(0, lv).reduce((a, b) => a * b, 1);
  const xOf = (lv, i) => 10 + ((W - 20) / countAt(lv)) * (i + 0.5);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="margin-top:10px;max-width:100%;height:auto" role="img" aria-label="${t('treeAria')}">`;
  s += `<text x="${W / 2}" y="12" text-anchor="middle" class="sm">${t(kind === 'loop' ? 'treeInLoop' : 'treeIn')}</text>`;
  for (let lv = 0; lv <= tree.levels.length; lv++) {
    const y = 28 + lv * levelH;
    for (let i = 0; i < countAt(lv); i++) {
      const x = xOf(lv, i);
      if (lv < tree.levels.length) {
        const ways = tree.factors[lv];
        for (let c = 0; c < ways; c++) s += `<line x1="${x}" y1="${y + 12}" x2="${xOf(lv + 1, i * ways + c)}" y2="${y + levelH - 4}" stroke="var(--donor)" stroke-width="2" opacity=".8"/>`;
        s += `<rect x="${x - 12}" y="${y - 4}" width="24" height="18" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="1.5"/><text x="${x}" y="${y + 10}" text-anchor="middle" class="sm" style="fill:var(--ficsit)">${ways}</text>`;
      } else {
        const extra = i >= useful;
        s += `<circle cx="${x}" cy="${y + 2}" r="6" fill="${extra ? 'var(--sink)' : 'var(--flow)'}"/><text x="${x}" y="${y + 22}" text-anchor="middle" class="sm">${extra ? (kind === 'loop' ? '↺' : t('treeSink')) : i + 1}</text>`;
      }
    }
  }
  return s + `</svg>`;
}

// ---- Balancer N→M: desenho com passo a passo ----
// Uma cor por entrada, para seguir cada árvore até os mergers.
const IN_COLORS = ['#ffd166', '#c6a6ff', '#8fe3a4', '#ff8fc7', '#a3b8ff', '#e9ff70', '#ffb3a7', '#d6c3a5'];
const inColor = i => IN_COLORS[i % IN_COLORS.length];
const designKey = d => (d.kind === 'blueprint' ? `bp-${d.bp.n}-${d.bp.m}` : d.kind);
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const segName = sg => t('seg' + cap1(sg.key), sg.arg);
const rateList = rs => (rs.every(r => Math.abs(r - rs[0]) < EPS) ? fmt(rs[0]) : rs.map(r => fmt(r)).join(' / '));
const tags = (prefix, n) => Array.from({ length: n }, (_, i) => prefix + (i + 1));

// Ícones das peças, iguais aos do desenho, para a legenda e para o passo atual.
// Na planta as peças são quadradas como no jogo: splitter laranja (com em quantas divide), merger verde-água.
const SP_COLOR = '#e8863a', MG_COLOR = '#3bb3a8';
const PIECE_ICON = {
  splitter: ways => `<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" rx="2" fill="rgba(232,134,58,.22)" stroke="${SP_COLOR}" stroke-width="1.6"/><text x="13" y="14" text-anchor="middle" style="fill:${SP_COLOR};font:700 11px var(--display)">${ways}</text></svg>`,
  merger: `<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" rx="2" fill="rgba(59,179,168,.22)" stroke="${MG_COLOR}" stroke-width="1.6"/><path d="M9,6 L13,10 L9,14 M13,10 H18" stroke="${MG_COLOR}" stroke-width="1.6" fill="none"/></svg>`,
  // Losango e quadrado com » do diagrama do plano (merger e Smart Splitter de lá).
  planMerger: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="8" y="5" width="10" height="10" transform="rotate(45 13 10)" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="1.8"/></svg>',
  smart: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/><path d="M9,6 l4,4 l-4,4 M13,6 l4,4 l-4,4" stroke="var(--ficsit)" stroke-width="1.6" fill="none"/></svg>',
  grid: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" fill="none" stroke="var(--grid-line)" stroke-width="1.4"/></svg>',
  designer: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" fill="var(--bp-floor)" stroke="var(--bp-edge)" stroke-width="1.6"/><path d="M13,1 V19 M4,10 H22" stroke="var(--bp-line)" stroke-width="1"/></svg>',
  mixed: `<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><path d="M1,6 H10 L16,10 H25 M1,14 H10 L16,10" stroke="${'#ffd166'}" stroke-width="2" fill="none"/><path d="M16,10 H25" stroke="#c6a6ff" stroke-width="2.6"/></svg>`,
  num: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><text x="13" y="14" text-anchor="middle" style="fill:var(--ink-dim);font:700 11px var(--display)">#1</text></svg>',
};
const pieceIcon = k => (k.t === 's' ? PIECE_ICON.splitter(k.ways) : PIECE_ICON.merger);

// Desenho 2D a partir da montagem 'flat' (vista de cima): cada esteira sai e entra pelo lado de verdade da peça
// (splitter entra por trás e sai pela frente e pelos lados; merger o contrário), nunca duas no mesmo lado, e anda em
// curva até a outra porta. Esquema: peças em tamanho fixo, colunas mais largas que as linhas, para caber na tela.
// Planta: o mesmo desenho em escala (1 m = PLAN_PX px), com a grade de fundações e duas camadas vazias para as
// marcações do Blueprint Designer (o piso embaixo das esteiras, borda e rótulo por cima), preenchidas por planMarksSvg.
// Na tela o fluxo vai para a direita: a esquerda da peça fica para cima e a direita para baixo.
// Cada peça e esteira leva data-s = passo em que aparece; data-id e data-b servem para acender um caminho.
const PORT_N = { front: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1] };
const PLAN_PX = 10;
function flatSvg(d, lay, labels, per, plan) {
  const isPart = q => q.t === 's' || q.t === 'm';
  const sx = plan ? PLAN_PX : 15, sz = plan ? PLAN_PX : 6.5, h = plan ? 1.8 * PLAN_PX : 10;
  const inW = 92, outW = 100, boxH = 30, f = v => v.toFixed(1);
  const byId = new Map(lay.pieces.map(q => [q.id, q]));
  const ins = lay.pieces.filter(q => q.t === 'in'), outs = lay.pieces.filter(q => q.t === 'out');
  const placed = lay.pieces.filter(q => q.t !== 'sink');
  const xs = placed.map(q => q.pos[0]), zs = placed.map(q => q.pos[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  // Retorno do loop: contorna tudo por cima (entra pelo lado esquerdo do merger) ou por baixo.
  const loops = lay.belts.filter(b => b.kind === 'loop');
  const up = loops.filter(b => b.toSide === 'left'), down = loops.filter(b => b.toSide !== 'left');
  const padL = inW + 16, padR = outW + 16;
  const padT = boxH / 2 + 18 + up.length * 7 + (plan ? 6 : 0), padB = boxH / 2 + 18 + down.length * 7;
  const X = x => padL + (x - minX) * sx, Y = z => padT + (z - minZ) * sz;
  const W = Math.ceil(X(maxX) + padR), H = Math.ceil(Y(maxZ) + padB);
  const out = [];
  const g = (step, svg, attr = '') => out.push(`<g data-s="${step}"${attr}>${svg}</g>`);
  if (plan) {
    // Grade: as peças ficam no meio de uma fundação (colunas a cada 8 m ao longo do fluxo).
    const grid = [];
    for (let x = Math.floor((minX - padL / sx) / 8) * 8 + 4; X(x) <= W; x += 8) if (X(x) >= 0) grid.push(`M${f(X(x))},0 V${H}`);
    for (let z = Math.floor((minZ - padT / sz) / 8) * 8; Y(z) <= H; z += 8) if (Y(z) >= 0) grid.push(`M0,${f(Y(z))} H${W}`);
    out.push(`<path d="${grid.join(' ')}" stroke="var(--grid-line)" stroke-width="1" fill="none"/><g class="bpfloor"></g>`);
  }
  const P = q => [X(q.pos[0]), Y(q.pos[2])];
  const port = (id, side) => { const q = byId.get(id), [cx, cy] = P(q), n = PORT_N[side], r = isPart(q) ? h : 0; return { x: cx + n[0] * r, y: cy + n[1] * r, n }; };
  // Cor: a esteira de uma entrada só leva a cor dela; na borboleta, a da faixa de onde sai (como no esquema
  // antigo); a misturada que sobra leva a cor da saída para onde vai.
  const laneIn = new Map(ins.map(q => [q.pos[2].toFixed(3), q.inp]));
  const color = b => {
    if (byId.get(b.b).t === 'sink') return 'var(--sink)';
    if (b.kind === 'loop') return 'var(--ink-dim)';
    if (b.inp >= 0) return inColor(b.inp);
    const lane = d.net ? laneIn.get(byId.get(b.a).pos[2].toFixed(3)) : undefined;
    return lane !== undefined ? inColor(lane) : b.out >= 0 ? inColor(b.out) : 'var(--ink-dim)';
  };
  const yUp = k => Y(minZ) - boxH / 2 - 10 - k * 7, yDown = k => Y(maxZ) + boxH / 2 + 10 + k * 7;
  lay.belts.forEach((b, bi) => {
    const a = port(b.a, b.fromSide), tgt = byId.get(b.b), c = color(b);
    let path, extra = '';
    if (tgt.t === 'sink') {
      const e = { x: a.x + a.n[0] * 20, y: a.y + a.n[1] * 20 };
      path = `M${f(a.x)},${f(a.y)} L${f(e.x)},${f(e.y)}`;
      extra = `<text class="sm" x="${f(e.x + (a.n[0] ? 4 : 0))}" y="${f(e.y + (a.n[1] > 0 ? 11 : a.n[1] < 0 ? -3 : 4))}" text-anchor="${a.n[0] ? 'start' : 'middle'}" style="fill:var(--sink)">sink</text>`;
    } else {
      const z = port(b.b, b.toSide);
      if (b.kind === 'loop') {
        const top = b.toSide === 'left', yL = top ? yUp(up.indexOf(b)) : yDown(down.indexOf(b));
        const a1 = { x: a.x + a.n[0] * 10, y: a.y + a.n[1] * 10 }, zx = z.n[0] ? z.x + z.n[0] * 12 : z.x;
        path = `M${f(a.x)},${f(a.y)} L${f(a1.x)},${f(a1.y)} L${f(a1.x)},${f(yL)} L${f(zx)},${f(yL)} L${f(zx)},${f(z.y)} L${f(z.x)},${f(z.y)}`;
      } else {
        // Arco entre duas peças da mesma fileira, saindo e entrando pelo mesmo lado: rente às peças, sem passar
        // do toco de 1,2 m (a curva sobe 3/4 de k), para ficar dentro do espaço da planta.
        const arch = a.n[0] === z.n[0] && a.n[1] === z.n[1] && Math.abs(a.y - z.y) < 1;
        const k = arch ? 1.6 * sz :Math.max(16, Math.min(70, Math.hypot(z.x - a.x, z.y - a.y) * 0.45));
        path = `M${f(a.x)},${f(a.y)} C${f(a.x + a.n[0] * k)},${f(a.y + a.n[1] * k)} ${f(z.x + z.n[0] * k)},${f(z.y + z.n[1] * k)} ${f(z.x)},${f(z.y)}`;
      }
    }
    g(b.step, `<path d="${path}" fill="none" stroke="${c}" stroke-width="${plan ? 3.2 : 2.4}" stroke-linejoin="round"${b.kind === 'loop' ? ' stroke-dasharray="6 4"' : ''}/>${extra}`, ` data-b="${bi}"`);
  });
  const plate = (x, y, w, stroke) => `<polygon points="${f(x)},${f(y)} ${f(x + w - 9)},${f(y)} ${f(x + w)},${f(y + 9)} ${f(x + w)},${f(y + boxH)} ${f(x)},${f(y + boxH)}" fill="var(--plate)" stroke="${stroke}" stroke-width="1.5"/>`;
  lay.pieces.forEach(q => {
    if (q.t === 'sink') return;
    const [cx, cy] = P(q);
    if (isPart(q)) {
      const sp = q.t === 's', c = sp ? SP_COLOR : MG_COLOR, m = h / 10;
      const mark = sp ? `<text x="${f(cx)}" y="${f(cy + 4 * m)}" text-anchor="middle" style="fill:${c};font:700 ${Math.round(11 * m)}px var(--display)">${q.ways}</text>`
        : `<path d="M${f(cx - 3 * m)},${f(cy - 4 * m)} L${f(cx + m)},${f(cy)} L${f(cx - 3 * m)},${f(cy + 4 * m)}" stroke="${c}" stroke-width="${f(1.4 * Math.sqrt(m))}" fill="none"/>`;
      g(q.step, `<rect x="${f(cx - h)}" y="${f(cy - h)}" width="${f(2 * h)}" height="${f(2 * h)}" rx="2.5" fill="${sp ? '#2a2018' : '#13282a'}" stroke="${c}" stroke-width="1.8"/>${mark}`
        + (per === 'piece' ? `<text class="pnum" x="${f(cx)}" y="${f(cy - h - 4)}" text-anchor="middle">#${q.step}</text>` : ''), ` data-id="${q.id}"`);
    } else {
      const isIn = q.t === 'in', k = isIn ? ins.indexOf(q) : outs.indexOf(q), c = inColor(isIn ? q.inp ?? k : k);
      const tag = isIn ? labels.ins[k] : labels.outs[k], rate = fmt(isIn ? d.rates[k % d.rates.length] : d.perOut);
      const x = isIn ? cx - inW : cx, w = isIn ? inW : outW;
      g(q.step, plate(x, cy - boxH / 2, w, c) + `<text class="lbl" x="${f(x + 9)}" y="${f(cy + 5)}">${esc(tag)}</text><text class="rate" x="${f(x + w - 9)}" y="${f(cy + 5)}" text-anchor="end">${rate}</text>`, ` data-id="${q.id}"`);
    }
  });
  // Na planta, data-ox/data-oz dizem onde fica o metro 0 no desenho (X(x) = ox + x · PLAN_PX).
  const org = plan ? ` data-ox="${X(0)}" data-oz="${Y(0)}"` : '';
  return `<svg class="bsvg flat${plan ? ' plan' : ''}" viewBox="0 0 ${W} ${H}" style="--w:${W}px"${org} role="img" aria-label="${esc(t('ponderAria'))}">${out.join('')}${plan ? '<g class="bpmarks"></g>' : ''}</svg>`;
}

// Marcações do Blueprint Designer na planta. Embaixo das esteiras, o piso do designer: chapa clara com a grade de
// fundações bem marcada e subdivisões de 2 m discretas. Por cima, a borda forte com cantos reforçados, a aba com
// "#1 · Mk2 5×5" e o × para remover. Só para planejar como fatiar em blueprints: não marca peça dentro ou fora.
const MARK_TAB = 20;
function planMarksSvg(marks, ox, oz) {
  const f = v => v.toFixed(1), P = PLAN_PX, floor = [], top = [];
  for (const m of marks) {
    const s = designerSize(m.mk), n = s / 8, x0 = ox + m.x * P, y0 = oz + m.z * P, w = s * P, x1 = x0 + w, y1 = y0 + w;
    const sub = [], maj = [];
    for (let i = 1; i < n * 4; i++) (i % 4 ? sub : maj).push(`M${f(x0 + i * 2 * P)},${f(y0)} V${f(y1)} M${f(x0)},${f(y0 + i * 2 * P)} H${f(x1)}`);
    floor.push(`<g data-mark="${m.id}"><rect x="${f(x0)}" y="${f(y0)}" width="${w}" height="${w}" fill="var(--bp-floor)"/>`
      + `<path d="${sub.join(' ')}" stroke="var(--bp-sub)" stroke-width="1" fill="none"/><path d="${maj.join(' ')}" stroke="var(--bp-line)" stroke-width="1.5" fill="none"/></g>`);
    const c = 18, name = t('bpMarkName', m.id, m.mk, n), tw = name.length * 7 + 16;
    const corners = `M${f(x0)},${f(y0 + c)} V${f(y0)} H${f(x0 + c)} M${f(x1 - c)},${f(y0)} H${f(x1)} V${f(y0 + c)} M${f(x1)},${f(y1 - c)} V${f(y1)} H${f(x1 - c)} M${f(x0 + c)},${f(y1)} H${f(x0)} V${f(y1 - c)}`;
    top.push(`<g data-mark="${m.id}"><rect x="${f(x0)}" y="${f(y0)}" width="${w}" height="${w}" fill="none" stroke="var(--bp-edge)" stroke-width="2"/>`
      + `<path d="${corners}" stroke="var(--bp-edge)" stroke-width="5" fill="none"/>`
      + `<rect x="${f(x0)}" y="${f(y0 - MARK_TAB)}" width="${tw}" height="${MARK_TAB}" fill="var(--bp-edge)"/>`
      + `<text class="bptag" x="${f(x0 + 8)}" y="${f(y0 - 6)}">${esc(name)}</text>`
      + `<g class="bprm" data-rm="${m.id}"><title>${esc(t('bpMarkRemove', name))}</title><rect x="${f(x1 - MARK_TAB - 4)}" y="${f(y0 - MARK_TAB)}" width="${MARK_TAB + 4}" height="${MARK_TAB}" fill="var(--bp-edge)"/>`
      + `<path d="M${f(x1 - MARK_TAB + 3)},${f(y0 - MARK_TAB + 5)} l10,10 m0,-10 l-10,10" stroke="var(--bench)" stroke-width="2.2"/></g></g>`);
  }
  return { floor: floor.join(''), top: top.join('') };
}

// Blueprint seu: o desenho é a caixa do blueprint entre as entradas e as saídas, em três passos.
function balancerBuild(d, labels) {
  const steps = [], under = [], over = [];
  const step = text => steps.push(text) - 1;
  const g = (layer, s, svg) => layer.push(`<g data-s="${s}">${svg}</g>`);
  const ins = labels.ins, outs = labels.outs;
  const N = d.N, M = d.M, top = 14, boxH = 34, inW = 92, outW = 100;
  const plate = (x, y, w, stroke) => `<polygon points="${x},${y} ${x + w - 9},${y} ${x + w},${y + 9} ${x + w},${y + boxH} ${x},${y + boxH}" fill="var(--plate)" stroke="${stroke}" stroke-width="1.5"/>`;
  const box = (x, yc, w, tag, rate, stroke) => plate(x, yc - boxH / 2, w, stroke)
    + `<text class="lbl" x="${x + 9}" y="${yc + 5}">${esc(tag)}</text><text class="rate" x="${x + w - 9}" y="${yc + 5}" text-anchor="end">${rate}</text>`;
  const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const belt = (path, color, w = 2) => `<path d="${path}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
  const inStep = () => step(t('stIn', N, ins.join(', '), rateList(d.rates)));
  const gap = 46, rows = Math.max(N, M), cH = rows * gap - (gap - boxH);
  const yAt = (i, k) => top + (cH - (k * gap - (gap - boxH))) / 2 + i * gap + boxH / 2;
  const bx = inW + 80, bw = 150, xOut = bx + bw + 80;
  const W = xOut + outW + 2, H = top * 2 + cH;
  const s0 = inStep();
  for (let i = 0; i < N; i++) g(over, s0, box(0, yAt(i, N), inW, ins[i], fmt(d.rates[i]), inColor(i)));
  const s1 = step(t('stBpBox', d.bp.n, d.bp.m, d.bp.n - N));
  for (let i = 0; i < N; i++) g(under, s1, belt(curve(inW, yAt(i, N), bx, yAt(i, N)), inColor(i), 3));
  g(over, s1, `<polygon points="${bx},${top} ${bx + bw - 12},${top} ${bx + bw},${top + 12} ${bx + bw},${top + cH} ${bx},${top + cH}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
    <text class="lbl" x="${bx + bw / 2}" y="${top + cH / 2 + 2}" text-anchor="middle" style="fill:var(--ficsit);font-size:22px">${d.bp.n}→${d.bp.m}</text>
    <text class="sm" x="${bx + bw / 2}" y="${top + cH / 2 + 20}" text-anchor="middle">blueprint</text>`);
  const s2 = step(t('stOut', M, fmt(d.perOut)));
  for (let j = 0; j < M; j++) {
    g(under, s2, belt(curve(bx + bw, yAt(j, M), xOut, yAt(j, M)), 'var(--ink)', 3));
    g(over, s2, box(xOut, yAt(j, M), outW, outs[j], fmt(d.perOut), 'var(--ok)'));
  }
  const svg = `<svg class="bsvg" viewBox="0 0 ${W} ${H}" style="--w:${W}px" role="img" aria-label="${esc(t('ponderAria'))}">${under.join('')}${over.join('')}</svg>`;
  return { svg, steps };
}

// ---- Cena 3D (Three.js sob demanda) ----
// Piso de blueprint, peças chapadas (splitter laranja, merger verde-água), setas no topo com as portas usadas,
// esteira em tubo neon na cor da faixa com contorno escuro, gola + seta (saída) ou anel (entrada) em cada porta,
// pontos de luz andando no sentido do fluxo. Passo atual em holograma pulsando; passar o mouse isola o caminho.
let THREE_P = null;
const load3d = () => (THREE_P ||= Promise.all([import(/* @vite-ignore */ 'three'), import(/* @vite-ignore */ 'three/addons/controls/OrbitControls.js'), import(/* @vite-ignore */ 'three/addons/geometries/RoundedBoxGeometry.js')])
  .then(([T, O, R]) => ({ T, OrbitControls: O.OrbitControls, RoundedBoxGeometry: R.RoundedBoxGeometry }))
  .catch(e => { THREE_P = null; throw e; }));
const SPLITTER_3D = '#e8863a', MERGER_3D = '#3bb3a8';

async function mount3d(stage, d, labels, lay, opts = {}) {
  let lib, renderer;
  try { lib = await load3d(); } catch (e) { return null; }
  const { T, OrbitControls, RoundedBoxGeometry } = lib;
  try { renderer = new T.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = c => (c.startsWith('var(') ? css(c.slice(4, -1)) : c);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  stage.append(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color(hex('var(--bench)'));
  scene.add(new T.HemisphereLight(0xffffff, 0x123050, 1.4));
  const key = new T.DirectionalLight(0xffffff, 1.7);
  key.position.set(30, 70, 45);
  const fill = new T.DirectionalLight(0x9fc2ff, 0.5);
  fill.position.set(-40, 15, -20);
  scene.add(key, fill);

  const { min, max } = lay.bounds;
  const center = new T.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tx = new T.CanvasTexture(c);
    tx.colorSpace = T.SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
  };

  // Piso de blueprint: grade das fundações (8 m) e meia grade (4 m), sumindo nas bordas.
  const span = Math.ceil((Math.max(max[0] - min[0], max[2] - min[2]) + 40) / 8) * 8;
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    const n = span / 4, cell = w / n;
    g.fillStyle = '#0f3150'; g.fillRect(0, 0, w, h);
    for (let i = 0; i <= n; i++) {
      const x = i * cell, major = i % 2 === 0;
      g.strokeStyle = major ? 'rgba(111,200,255,.38)' : 'rgba(111,200,255,.13)';
      g.lineWidth = major ? 3 : 1.2;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.moveTo(0, x); g.lineTo(w, x); g.stroke();
    }
    g.globalCompositeOperation = 'destination-in';
    const rg = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2);
    rg.addColorStop(0, '#000'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const floor = new T.Mesh(new T.PlaneGeometry(span, span), new T.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, min[1] - 1.6, center.z);
  scene.add(floor);

  const pill = (text, dot) => canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = 'rgba(8,20,34,.9)'; g.strokeStyle = dot; g.lineWidth = 4;
    g.beginPath(); g.roundRect(6, 14, w - 12, h - 28, 30); g.fill(); g.stroke();
    g.fillStyle = dot; g.beginPath(); g.arc(46, h / 2, 13, 0, 7); g.fill();
    g.fillStyle = '#e4eef8'; g.font = '700 46px "Chakra Petch", sans-serif'; g.textBaseline = 'middle';
    g.fillText(text, 74, h / 2 + 2);
  });
  const glyph = text => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.font = '700 104px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  });
  // Direção de cada face no mundo (o layout fala no referencial do fluxo; Andares é girado).
  const faceDir = side => { const n = NRM3[side]; return lay.mode === 'floors' ? new T.Vector3(n[2], n[1], -n[0]) : new T.Vector3(...n); };
  // Cor da esteira: a da entrada enquanto é de uma entrada só; misturada, a da saída para onde segue.
  const beltColor = b => (b.kind === 'loop' ? hex('var(--ink-dim)') : b.inp >= 0 ? inColor(b.inp) : b.out >= 0 ? inColor(b.out) : hex('var(--ink)'));

  const objs = [];
  const track = (root, step, kind, id) => {
    const mats = [], meshes = [];
    root.traverse(o => {
      if (o.isMesh && !o.userData.noPick) meshes.push(o);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (!m.userData.base) m.userData.base = { color: m.color?.clone(), emissive: m.emissive?.clone(), ei: m.emissiveIntensity, op: m.opacity, tr: m.transparent, dw: m.depthWrite };
        if (!mats.includes(m)) mats.push(m);
      });
    });
    const obj = { root, step, kind, id, mats, meshes };
    root.traverse(o => { o.userData.obj = obj; });
    scene.add(root);
    objs.push(obj);
    return obj;
  };

  // Peças.
  const H = L3D.half;
  const bodyG = new RoundedBoxGeometry(H.s[0] * 2, H.s[1] * 2, H.s[2] * 2, 3, 0.06);
  const plateG = new RoundedBoxGeometry(H.in[0] * 2, H.in[1] * 2, H.in[2] * 2, 2, 0.06);
  const ins = lay.pieces.filter(p => p.t === 'in'), outs = lay.pieces.filter(p => p.t === 'out');
  // Topo: uma seta por porta usada, na cor da esteira; saída do centro para fora, entrada de fora para o centro.
  // Canvas: direita = +x do mundo, baixo = +z do mundo (o plano é deitado com -π/2 em x).
  const topIcon = (p, base) => canvasTex(256, 256, (g, w) => {
    g.fillStyle = base; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, w - 6);
    const c = w / 2;
    const arrow = (side, out, color) => {
      const dir = faceDir(side), from = out ? 26 : 108, to = out ? 108 : 26;
      const x0 = c + dir.x * from, y0 = c + dir.z * from, x1 = c + dir.x * to, y1 = c + dir.z * to, a = Math.atan2(y1 - y0, x1 - x0);
      const stroke = (col, wd) => {
        g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(a) * 10, y1 - Math.sin(a) * 10); g.stroke();
        g.beginPath(); g.moveTo(x1 - Math.cos(a - 0.55) * 34, y1 - Math.sin(a - 0.55) * 34); g.lineTo(x1, y1); g.lineTo(x1 - Math.cos(a + 0.55) * 34, y1 - Math.sin(a + 0.55) * 34); g.stroke();
      };
      stroke('#04101c', 30); stroke(color, 16);
    };
    lay.belts.forEach(b => { if (b.a === p.id) arrow(b.fromSide, true, beltColor(b)); if (b.b === p.id) arrow(b.toSide, false, beltColor(b)); });
    g.fillStyle = '#04101c'; g.beginPath(); g.arc(c, c, 16, 0, 7); g.fill();
  });
  const Z = new T.Vector3(0, 0, 1);
  for (const p of lay.pieces) {
    const g = new T.Group();
    g.position.set(...p.pos);
    if (p.t === 's' || p.t === 'm') {
      const isS = p.t === 's', base = isS ? SPLITTER_3D : MERGER_3D;
      g.add(new T.Mesh(bodyG, new T.MeshLambertMaterial({ color: base })));
      const top = new T.Mesh(new T.PlaneGeometry(H.s[0] * 2, H.s[2] * 2), new T.MeshBasicMaterial({ map: topIcon(p, isS ? '#ffb877' : '#7ee5d9') }));
      top.rotation.x = -Math.PI / 2;
      top.position.y = H.s[1] + 0.005;
      g.add(top);
      const n = isS ? p.ways : lay.belts.filter(b => b.b === p.id).length;
      for (const side of ['front', 'right']) {
        const dir = faceDir(side), m = new T.Mesh(new T.PlaneGeometry(2.4, 1.6), new T.MeshBasicMaterial({ map: glyph(isS ? `1→${n}` : `${n}→1`), transparent: true, depthWrite: false }));
        m.quaternion.setFromUnitVectors(Z, dir);
        m.position.copy(dir.clone().multiplyScalar(H.s[0] + 0.005));
        m.userData.noPick = true;
        g.add(m);
      }
    } else if (p.t === 'sink') {
      g.add(new T.Mesh(bodyG, new T.MeshLambertMaterial({ color: hex('var(--sink)') })));
    } else {
      const isIn = p.t === 'in', i = isIn ? ins.indexOf(p) : outs.indexOf(p);
      const color = inColor(isIn ? p.inp ?? i : i);
      g.add(new T.Mesh(plateG, new T.MeshLambertMaterial({ color })));
      const sp = new T.Sprite(new T.SpriteMaterial({ map: pill(isIn ? labels.ins[i] : labels.outs[i], color), depthTest: false, transparent: true }));
      sp.scale.set(4.4, 1.65, 1);
      sp.position.y = 1.6;
      sp.renderOrder = 5;
      g.add(sp);
    }
    track(g, p.step, 'piece', p.id);
  }

  // Esteiras: tubo + contorno (lado de dentro de um tubo maior) + gola, seta e anel nas portas.
  const polyline = pts => {
    const segs = [];
    let tot = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = new T.Vector3(...pts[k - 1]), b = new T.Vector3(...pts[k]), len = a.distanceTo(b);
      if (len < 1e-6) continue;
      segs.push({ a, len, s0: tot, dir: b.clone().sub(a).normalize() });
      tot += len;
    }
    const at = (s, out) => { const g = segs.find(x => s <= x.s0 + x.len) || segs[segs.length - 1]; return out.copy(g.a).addScaledVector(g.dir, s - g.s0); };
    return { tot, at };
  };
  const roundedPath = (pts, r) => {
    const P = pts.map(p => new T.Vector3(...p)).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-6);
    const path = new T.CurvePath();
    let from = P[0];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1], rr = Math.min(r, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
      const p1 = b.clone().addScaledVector(a.clone().sub(b).normalize(), rr), p2 = b.clone().addScaledVector(c.clone().sub(b).normalize(), rr);
      if (from.distanceTo(p1) > 1e-6) path.add(new T.LineCurve3(from.clone(), p1));
      path.add(new T.QuadraticBezierCurve3(p1, b.clone(), p2));
      from = p2;
    }
    path.add(new T.LineCurve3(from.clone(), P[P.length - 1]));
    return path;
  };
  const coneG = new T.ConeGeometry(0.5, 1.0, 14), ringG = new T.TorusGeometry(0.46, 0.12, 8, 20), collarG = new T.BoxGeometry(1.0, 1.0, 0.16);
  const flows = [];
  lay.belts.forEach((b, bi) => {
    const color = beltColor(b), g = new T.Group();
    const line = polyline(b.pts), path = roundedPath(b.pts, 0.6), segs = Math.max(8, Math.round(line.tot * 2.5));
    g.add(new T.Mesh(new T.TubeGeometry(path, segs, 0.2, 8, false), new T.MeshBasicMaterial({ color })));
    g.add(new T.Mesh(new T.TubeGeometry(path, segs, 0.36, 8, false), new T.MeshBasicMaterial({ color: 0x03080f, side: T.BackSide })));
    const port = (q, side) => { const dir = faceDir(side), col = new T.Mesh(collarG, new T.MeshBasicMaterial({ color: 0x03080f })); col.position.set(...q); col.quaternion.setFromUnitVectors(Z, dir); col.userData.noPick = true; g.add(col); return dir; };
    const out = port(b.pts[0], b.fromSide), inn = port(b.pts[b.pts.length - 1], b.toSide);
    const cone = new T.Mesh(coneG, new T.MeshBasicMaterial({ color }));
    cone.position.set(...b.pts[0]).addScaledVector(out, 0.75);
    cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), out);
    const ring = new T.Mesh(ringG, new T.MeshBasicMaterial({ color }));
    ring.position.set(...b.pts[b.pts.length - 1]).addScaledVector(inn, 0.5);
    ring.quaternion.setFromUnitVectors(Z, inn);
    g.add(cone, ring);
    const ob = track(g, b.step, 'belt', bi);
    flows.push({ line, color: new T.Color(color), bi, ob, off: (bi * 0.37) % 2.2 });
  });

  // Pontos de luz nas esteiras: uma InstancedMesh para todas.
  let total = 0;
  for (const f of flows) { f.n = Math.max(1, Math.floor(f.line.tot / 2.2)); f.first = total; total += f.n; }
  const items = new T.InstancedMesh(new T.SphereGeometry(0.24, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff }), total);
  const white = new T.Color(0xffffff);
  for (const f of flows) for (let k = 0; k < f.n; k++) items.setColorAt(f.first + k, f.color.clone().lerp(white, 0.6));
  scene.add(items);

  const camera = new T.PerspectiveCamera(45, 1, 0.5, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduce;
  controls.maxPolarAngle = Math.PI * 0.495;
  const recenter = () => {
    const dist = fitDistance(lay.bounds, camera.fov, camera.aspect);
    camera.position.copy(center).add(new T.Vector3(0.75, 0.75, 1.1).normalize().multiplyScalar(dist));
    controls.target.copy(center);
    controls.update();
    draw();
  };

  const M4 = new T.Matrix4(), V = new T.Vector3(), Q = new T.Quaternion(), ONE = new T.Vector3(1, 1, 1), ZERO = new T.Vector3();
  // Estado de cada objeto: passo atual (holograma pulsando na própria cor), apagado (fora do foco) ou normal.
  const WHITE = new T.Color(0xffffff);
  let cur = 0, K = 0, lit = null, clock = 0;
  const apply = () => {
    const done = cur >= K, k = reduce ? 0.5 : 0.5 - 0.5 * Math.cos(clock * Math.PI * 2 / 1.15);
    for (const o of objs) {
      o.root.visible = done || o.step <= cur;
      const now = !done && o.step === cur;
      const dim = lit && !(o.kind === 'piece' ? lit.pieces.has(o.id) : lit.belts.has(o.id));
      const state = now ? 'now' : dim ? 'dim' : 'base';
      if (state === 'base' && o.st === 'base') continue;
      for (const m of o.mats) {
        const b = m.userData.base;
        if (state === 'now') {
          m.transparent = true; m.opacity = b.op * (dim ? 0.1 : 0.3 + 0.45 * k); m.depthWrite = false;
          if (m.emissive) { m.emissive.copy(b.color || WHITE); m.emissiveIntensity = 0.15 + k * 0.45; } else if (b.color) m.color.copy(b.color).lerp(WHITE, 0.1 + k * 0.3);
        } else {
          m.transparent = dim || b.tr; m.opacity = dim ? b.op * 0.1 : b.op; m.depthWrite = dim ? false : b.dw;
          if (m.emissive) { m.emissive.copy(b.emissive); m.emissiveIntensity = b.ei; } else if (b.color) m.color.copy(b.color);
        }
        if (o.st !== state) m.needsUpdate = true;
      }
      o.st = state;
    }
    for (const f of flows) {
      const on = f.ob.root.visible && !(lit && !lit.belts.has(f.bi));
      for (let i = 0; i < f.n; i++) {
        if (!on) M4.compose(V.set(0, -1e4, 0), Q, ZERO);
        else { f.line.at(((f.off + (reduce ? 0 : clock * 3.4) + i * f.line.tot / f.n) % f.line.tot), V); M4.compose(V, Q, ONE); }
        items.setMatrixAt(f.first + i, M4);
      }
    }
    items.instanceMatrix.needsUpdate = true;
  };
  const setStep = (c, k) => { cur = c; K = k; apply(); draw(); };
  // Foco: o fixado (clique ou botão Seguir) vale até soltar; sem fixado, o mouse em cima acende na hora.
  let pinned = null;
  const show = f => { lit = f; apply(); draw(); };
  const focus = id => { pinned = id ?? null; show(pinned === null ? null : focus3d(lay, pinned)); };
  const ray = new T.Raycaster(), ptr = new T.Vector2();
  const pickAt = e => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const meshes = objs.filter(o => o.root.visible).flatMap(o => o.meshes);
    return ray.intersectObjects(meshes, false)[0]?.object.userData.obj || null;
  };
  const litOf = o => (o.kind === 'piece' ? focus3d(lay, o.id) : { pieces: new Set([lay.belts[o.id].a, lay.belts[o.id].b]), belts: new Set([o.id]) });
  const el = renderer.domElement;
  const tap = tapGesture();
  el.addEventListener('pointerdown', e => tap.down(e.pointerId, e.clientX, e.clientY));
  el.addEventListener('pointercancel', e => tap.cancel(e.pointerId));
  el.addEventListener('pointermove', e => {
    if (pinned !== null || e.buttons || e.pointerType === 'touch') return;
    const o = pickAt(e);
    el.style.cursor = o ? 'pointer' : '';
    show(o ? litOf(o) : null);
  });
  el.addEventListener('pointerleave', () => { if (pinned === null) show(null); });
  // Clique ou toque sem arrastar fixa a peça (ou solta, no vazio); arrastar continua girando a câmera.
  el.addEventListener('pointerup', e => {
    if (!tap.up(e.pointerId, e.clientX, e.clientY)) return;
    const o = pickAt(e), id = o ? (o.kind === 'piece' ? o.id : lay.belts[o.id].a) : null;
    focus(id === pinned ? null : id);
    if (opts.onFocus) opts.onFocus(pinned);
  });

  const size = () => {
    const w = stage.clientWidth || 600, h = stage.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  };
  let raf = 0, last = 0, visible = true, alive = true;
  function draw() { if (alive) renderer.render(scene, camera); }
  const loop = now => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (!visible) return;
    clock += dt;
    apply();
    controls.update();
    draw();
  };
  const ro = new ResizeObserver(size);
  ro.observe(stage);
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; });
  io.observe(stage);
  if (reduce) controls.addEventListener('change', draw);
  else raf = requestAnimationFrame(loop);
  size();
  recenter();

  const dispose = () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    controls.dispose();
    scene.traverse(o => {
      o.geometry?.dispose();
      (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(m => { m.map?.dispose(); m.dispose(); });
    });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  return { setStep, recenter, dispose, focus };
}

// Montagem da planta, guardada por formato: o roteamento das esteiras pode levar segundos nos balancers grandes.
const FLAT_CACHE = new Map();
const flatLayout = d => {
  const k = `${designKey(d)}|${d.N}|${d.M}`;
  if (!FLAT_CACHE.has(k)) FLAT_CACHE.set(k, layout3d(d, 'flat'));
  return FLAT_CACHE.get(k);
};

// Passo a passo (como o Ponder do Create): a peça nova aparece como holograma, as anteriores ficam sólidas.
// view: '2d' (SVG) ou a montagem 3D ('towers' | 'floors'); opts.onMode troca a montagem 3D.
function mountPonder(root, d, labels, view = '2d', opts = {}) {
  if (root._stop) root._stop();
  const in3d = view !== '2d';
  // No 2D, o desenho vem da montagem 'flat' (vista de cima): compacto no esquema, em escala na planta.
  // O blueprint seu é uma caixa só.
  const flat2d = !in3d && d.kind !== 'blueprint', plan = flat2d && opts.view2d === 'plan', mode = in3d ? view : 'flat';
  // Por peça: um passo por splitter ou merger (byPiece3d); por nível: um por torre, andar ou coluna.
  const per = opts.per === 'piece' ? 'piece' : 'level';
  const lay0 = in3d || flat2d ? opts.lay || (flat2d ? flatLayout(d) : layout3d(d, view)) : null;
  const lay = lay0 && per === 'piece' ? byPiece3d(lay0) : lay0;
  const { svg, steps, kinds = [] } = lay
    ? { svg: flat2d ? flatSvg(d, lay, labels, per, plan) : '', kinds: lay.steps.map(st => (st.key === 'piece' ? { t: st.t, ways: st.ways } : null)), steps: lay.steps.map(st => (st.key === 'in' ? t('stIn', d.N, labels.ins.join(', '), rateList(d.rates))
      : st.key === 'out' ? t('stOut', d.M, fmt(d.perOut)) : st.key === 'piece' ? pieceText3d(st, labels, mode)
      : t('stLevel3d', mode, st.level, st.sp, st.ways, st.mg, st.up, st.down))) }
    : balancerBuild(d, labels);
  const K = steps.length;
  let cur = K, timer = null, scene = null;
  const matrix = !d.kind.startsWith('funnel');
  const ctl3d = in3d ? `<div class="s3d-ctl">
      <div class="seg" role="radiogroup" aria-label="${esc(t('mode3dLabel'))}">${['towers', 'floors'].map(m => `<button type="button" role="radio" aria-checked="${m === view}" data-mode="${m}">${t('mode3d' + cap1(m))}</button>`).join('')}</div>${tip('tip3dMode')}
      <div class="seg" role="radiogroup" aria-label="${esc(t('per3dLabel'))}">${['level', 'piece'].map(v => `<button type="button" role="radio" aria-checked="${v === per}" data-per="${v}">${t('per3d' + cap1(v))}</button>`).join('')}</div>${tip('tip3dPer')}
      <button type="button" class="pbtn" data-recenter>${t('recenter3d')}</button></div>` : '';
  // No 2D o mesmo Por nível / Por peça fica acima do desenho (o blueprint é uma peça só).
  const ctl2d = !in3d && d.kind !== 'blueprint' ? `<div class="pmode"><span>${t('view2dLabel')}</span>
      <div class="seg" role="radiogroup" aria-label="${esc(t('view2dLabel'))}">${['scheme', 'plan'].map(v => `<button type="button" role="radio" aria-checked="${v === (plan ? 'plan' : 'scheme')}" data-v2d="${v}">${t('view2d' + cap1(v))}</button>`).join('')}</div>${tip('tipView2d')}
      <span>${t('perLabel')}</span>
      <div class="seg" role="radiogroup" aria-label="${esc(t('perLabel'))}">${['level', 'piece'].map(v => `<button type="button" role="radio" aria-checked="${v === per}" data-per="${v}">${t('per3d' + cap1(v))}</button>`).join('')}</div>${tip('tipPer2d')}</div>` : '';
  // No desenho 2D a área escura inteira é o desenho: os controles ficam por cima, como no 3D.
  root.innerHTML = `<div class="ponder" tabindex="-1">${flat2d ? '' : ctl2d}
    <div class="stage${in3d ? ' stage3d' : flat2d ? ' stage2d' : ''}">${in3d ? `${ctl3d}<p class="load3d">${t('loading3d')}</p><span class="hint3d">${t('hint3dFocus')}</span>` : svg}${flat2d ? `${ctl2d}<div class="zctl">
      <button type="button" class="pbtn" data-z="in" aria-label="${esc(t('zoomIn'))}">+</button><button type="button" class="pbtn" data-z="out" aria-label="${esc(t('zoomOut'))}">−</button><button type="button" class="pbtn" data-z="fit">${t('zoomFit')}</button></div>
      <span class="hint3d hint2d">${t('hint2dZoom')}${plan ? ` ${t('hint2dMarks')}` : ''}</span>` : ''}</div>
    ${plan ? `<div class="bpbar" role="group" aria-label="${esc(t('bpMarksAria'))}"><span class="bpbar-t">Blueprint Designer</span>${tip('tipBpMarks')}
      ${[1, 2, 3].map(mk => `<button type="button" class="pbtn" data-bpadd="${mk}" aria-label="${esc(t('bpMarkAddAria', mk, designerSize(mk) / 8))}">${t('bpMarkAdd', mk)}</button>`).join('')}
      <button type="button" class="pbtn" data-bpmove aria-pressed="false">${t('bpMove')}</button>
      <span class="bplist"></span></div>` : ''}
    <div class="cap" aria-live="polite"><span class="cap-n"></span><span class="cap-i"></span><p class="cap-t"></p></div>
    <div class="pctl">
      <button type="button" class="pbtn" data-p="prev" aria-label="${esc(t('stepPrev'))}">‹</button>
      <div class="ticks${steps.length > 24 ? ' many' : ''}">${steps.map((_, i) => `<button type="button" class="tick" data-p="${i}" aria-label="${esc(t('stepGoto', i + 1))}"></button>`).join('')}</div>
      <button type="button" class="pbtn" data-p="next" aria-label="${esc(t('stepNext'))}">›</button>
      <button type="button" class="pbtn" data-p="play"></button>
      <button type="button" class="pbtn prim" data-p="toggle"></button>
      <span class="pkeys">${t('ponderKeys')}</span>
    </div>
    ${in3d ? `<div class="follow"><span>${t('follow3d')}</span>${[...lay.pieces.filter(p => p.t === 'in').map((p, i) => [p.id, labels.ins[i], inColor(p.inp ?? i)]), ...lay.pieces.filter(p => p.t === 'out').map((p, i) => [p.id, labels.outs[i], inColor(i)])]
      .map(([id, tag, c]) => `<button type="button" class="chip" data-follow="${id}" aria-pressed="false" aria-label="${esc(t('followAria', tag))}"><i style="background:${c}"></i>${esc(tag)}</button>`).join('')}</div>` : ''}
    <div class="plegend">
      ${matrix ? labels.ins.map((tag, i) => `<span><i style="background:${inColor(i)}"></i>${esc(tag)}</span>`).join('') : ''}
      ${in3d || d.kind === 'blueprint' ? '' : [
        d.pieces.splitters ? `<span>${PIECE_ICON.splitter(d.net ? d.net.rounds[0].f : d.tree.factors[0])}${t('lgSplitWays')}</span>` : '',
        d.pieces.mergers ? `<span>${PIECE_ICON.merger}${t('lgMergerJoin')}</span>` : '',
        `<span>${PIECE_ICON.mixed}${t('lgMixed')}</span>`,
        plan ? `<span>${PIECE_ICON.grid}${t('lgGrid')}</span><span>${PIECE_ICON.designer}${t('lgDesigner')}</span>` : '',
        per === 'piece' ? `<span>${PIECE_ICON.num}${t('lgPieceNum')}</span>` : '',
      ].join('')}
      <span><i class="holo"></i>${t('lgHolo')}</span>
      ${in3d ? `<span><i class="sp3"></i>${t('lgSplitter')}</span><span><i class="mg3"></i>${t('lgMerger')}</span><span><i class="pouti"></i>${t('lgPortOut')}</span><span><i class="pini"></i>${t('lgPortIn')}</span>${tip('tip3dTop')}` : ''}
      ${d.extra && d.kind.endsWith('-loop') ? `<span><i class="loopi"></i>${t('lgLoopBack')}</span>` : ''}
      ${d.extra && d.kind.endsWith('-sink') ? `<span><i style="background:var(--sink)"></i>${t('lgToSink')}</span>` : ''}
    </div>
  </div>`;
  const q = s => root.querySelector(s);
  const stop = () => { clearInterval(timer); timer = null; };
  root._stop = () => { stop(); if (scene) scene.dispose(); scene = null; root._token = null; };
  const update = () => {
    const st = q('.bsvg');
    if (scene) scene.setStep(cur, K);
    if (st) st.classList.toggle('stepping', cur < K);
    if (st) st.querySelectorAll('[data-s]').forEach(el => {
      const s = +el.dataset.s;
      el.classList.toggle('fut', cur < K && s > cur);
      el.classList.toggle('now', cur < K && s === cur);
      el.classList.toggle('past', cur < K && s < cur);
    });
    const done = cur >= K;
    q('.cap').classList.toggle('done', done);
    q('.cap-n').textContent = done ? '✓' : t('stepOf', cur + 1, K);
    q('.cap-i').innerHTML = !done && kinds[cur] ? pieceIcon(kinds[cur]) : '';
    q('.cap-t').textContent = done ? t('stepDone', designPieces(d), d.M, fmt(d.perOut)) : steps[cur];
    root.querySelectorAll('.tick').forEach((b, i) => {
      b.classList.toggle('done', done || i < cur);
      b.classList.toggle('cur', !done && i === cur);
      b.setAttribute('aria-current', !done && i === cur ? 'step' : 'false');
    });
    q('[data-p=prev]').disabled = cur === 0;
    q('[data-p=next]').disabled = done;
    q('[data-p=play]').textContent = timer ? t('stepPause') : t('stepPlay');
    q('[data-p=toggle]').textContent = done ? t('stepStart') : t('stepAll');
  };
  const go = k => { cur = Math.max(0, Math.min(K, k)); if (cur >= K) stop(); update(); };
  root.querySelector('.pctl').addEventListener('click', e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const p = b.dataset.p;
    if (p === 'prev') { stop(); go(cur - 1); }
    else if (p === 'next') { stop(); go(cur + 1); }
    else if (p === 'toggle') { stop(); go(cur >= K ? 0 : K); }
    else if (p === 'play') {
      if (timer) { stop(); update(); return; }
      if (cur >= K) cur = 0;
      timer = setInterval(() => go(cur + 1), 2600);
      update();
    } else { stop(); go(+p); }
  });
  q('.ponder').addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); stop(); go(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); go(cur - 1); }
  });
  update();
  q('.pmode')?.addEventListener('click', e => {
    const pv = e.target.closest('[data-per]');
    if (pv && pv.dataset.per !== per && opts.onPer) opts.onPer(pv.dataset.per);
    const v2 = e.target.closest('[data-v2d]');
    if (v2 && v2.dataset.v2d !== (plan ? 'plan' : 'scheme') && opts.onView2d) opts.onView2d(v2.dataset.v2d);
  });
  // Planta: passar o mouse ou tocar numa peça, entrada ou saída deixa aceso só o caminho dela (como no 3D).
  if (flat2d) {
    const st = q('.bsvg');
    const light = id => {
      const f = id === null ? null : focus3d(lay, id);
      st.classList.toggle('focusing', !!f);
      st.querySelectorAll('[data-id]').forEach(el => el.classList.toggle('lit', !!f && f.pieces.has(+el.dataset.id)));
      st.querySelectorAll('[data-b]').forEach(el => el.classList.toggle('lit', !!f && f.belts.has(+el.dataset.b)));
    };
    let pinned = null;
    const drag = new Map(), tap = tapGesture();
    st.addEventListener('pointerover', e => { if (pinned === null && !drag.size) { const el = e.target.closest('[data-id]'); light(el ? +el.dataset.id : null); } });
    st.addEventListener('pointerleave', () => { if (pinned === null) light(null); });
    // Zoom e arrastar: mexe só no viewBox (abre mostrando tudo). Roda ou pinça no ponto, botões no centro;
    // arrastar move quando há zoom. Toque parado (tapGesture) fixa ou solta o caminho aceso.
    // "Ver tudo": o desenho inteiro no meio da área livre (abaixo dos botões, acima da dica), com a proporção
    // da área; zoom e arrastar ficam dentro desse quadro. A altura da área acompanha o desenho, até 68% da tela.
    const W0 = st.viewBox.baseVal.width, H0 = st.viewBox.baseVal.height, stage = q('.stage2d');
    let full = { x: 0, y: 0, w: W0, h: H0 }, vb = { ...full }, pinch = null, fitW = -1;
    const apply = () => { st.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); st.classList.toggle('zoomed', vb.w < full.w - 1e-6); };
    // Marcações do Blueprint Designer (só na planta): valem para esta montagem; quem guarda é opts.marks, que o
    // workbench zera quando muda N→M, taxa, tier ou montagem.
    const ms = plan ? opts.marks || {} : null, fp = plan ? planFootprint(lay0) : null;
    const ox = +st.dataset.ox || 0, oz = +st.dataset.oz || 0;
    if (ms && !ms.list) ms.list = defaultMarks(fp);
    // O que "Ver tudo" enquadra: o desenho e as marcações (com a aba do rótulo).
    const content = () => {
      let x0 = 0, y0 = 0, x1 = W0, y1 = H0;
      for (const m of ms ? ms.list : []) {
        const s = designerSize(m.mk) * PLAN_PX, x = ox + m.x * PLAN_PX, y = oz + m.z * PLAN_PX;
        x0 = Math.min(x0, x - 8); y0 = Math.min(y0, y - MARK_TAB - 8); x1 = Math.max(x1, x + s + 8); y1 = Math.max(y1, y + s + 8);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const frame = resize => {
      const cw = stage.clientWidth;
      if (!cw) return false;
      const b = content(), top = stage.querySelector('.pmode').offsetHeight + 16, bot = stage.querySelector('.hint2d').offsetHeight + 16;
      if (resize) stage.style.height = `${Math.round(Math.max(340, Math.min(innerHeight * 0.68, cw * b.h / b.w + top + bot)))}px`;
      const ch = stage.clientHeight, s = Math.max(b.w / cw, b.h / Math.max(80, ch - top - bot));
      full = { x: b.x + (b.w - cw * s) / 2, y: b.y - top * s - ((ch - top - bot) * s - b.h) / 2, w: cw * s, h: ch * s };
      return true;
    };
    const fit = () => {
      if (!frame(true)) return;
      fitW = stage.clientWidth;
      vb = { ...full };
      apply();
    };
    // Depois de pôr, mover ou tirar marcação: o quadro de "Ver tudo" acompanha, sem mexer no zoom atual.
    const reframe = () => { if (frame(false)) { vb = zoomView(vb, full, 1, vb.x + vb.w / 2, vb.y + vb.h / 2); apply(); } };
    fit();
    // Só refaz quando a largura muda (a altura quem muda é o próprio fit).
    const ro = new ResizeObserver(() => requestAnimationFrame(() => { if (stage.isConnected && stage.clientWidth !== fitW) fit(); }));
    ro.observe(stage);
    const stop0 = root._stop;
    root._stop = () => { ro.disconnect(); stop0(); };
    const toSvg = (x, y) => { const m = st.getScreenCTM(); if (!m) return [vb.x + vb.w / 2, vb.y + vb.h / 2]; const pt = new DOMPoint(x, y).matrixTransform(m.inverse()); return [pt.x, pt.y]; };
    const zoom = (k, at) => { vb = zoomView(vb, full, k, ...(at || [vb.x + vb.w / 2, vb.y + vb.h / 2])); apply(); };
    q('.zctl').addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      if (b.dataset.z === 'fit') fit(); else zoom(b.dataset.z === 'in' ? 1.5 : 1 / 1.5);
    });
    // Ctrl (ou Cmd) + arrastar sobre uma marcação move só ela, presa na grade; no toque, o botão Mover marcação
    // faz o arrastar de um dedo pegar a marcação. Fora de uma marcação, arrastar continua movendo a vista.
    const toWorld = (x, y) => { const [a, b] = toSvg(x, y); return [(a - ox) / PLAN_PX, (b - oz) / PLAN_PX]; };
    const hitMark = ([x, z]) => [...(ms ? ms.list : [])].reverse().find(m => {
      const s = designerSize(m.mk);
      return x >= m.x && x <= m.x + s && z >= m.z - MARK_TAB / PLAN_PX && z <= m.z + s;
    });
    const wantsMark = e => !!ms && (e.ctrlKey || e.metaKey || !!ms.move);
    let markDrag = null;
    const bar = q('.bpbar');
    const drawMarks = () => {
      if (!ms) return;
      const { floor, top } = planMarksSvg(ms.list, ox, oz);
      st.querySelector('.bpfloor').innerHTML = floor;
      st.querySelector('.bpmarks').innerHTML = top;
      bar.querySelector('.bplist').innerHTML = ms.list.length ? ms.list.map(m => {
        const name = t('bpMarkName', m.id, m.mk, designerSize(m.mk) / 8);
        return `<span class="bpchip">${esc(name)}<button type="button" data-bprm="${m.id}" aria-label="${esc(t('bpMarkRemove', name))}">×</button></span>`;
      }).join('') : `<span class="bpnone">${t('bpMarksNone')}</span>`;
      const mv = bar.querySelector('[data-bpmove]');
      mv.disabled = !ms.list.length;
      mv.setAttribute('aria-pressed', String(!!ms.move));
      st.classList.toggle('movemode', !!ms.move);
    };
    const removeMark = (id, viaKeys) => {
      const i = ms.list.findIndex(m => m.id === id);
      if (i < 0) return;
      ms.list = ms.list.filter(m => m.id !== id);
      if (!ms.list.length) ms.move = false;
      drawMarks();
      reframe();
      if (viaKeys) (bar.querySelectorAll('[data-bprm]')[Math.min(i, ms.list.length - 1)] || bar.querySelector('[data-bpadd]')).focus();
    };
    if (ms) {
      drawMarks();
      bar.addEventListener('click', e => {
        const add = e.target.closest('[data-bpadd]'), rm = e.target.closest('[data-bprm]');
        if (add) {
          // A nova aparece no meio do que está na tela.
          const r = st.getBoundingClientRect();
          ms.list = addMark(fp, ms.list, +add.dataset.bpadd, toWorld(r.left + r.width / 2, r.top + r.height / 2));
          drawMarks();
          reframe();
        } else if (rm) removeMark(+rm.dataset.bprm, e.detail === 0);
        else if (e.target.closest('[data-bpmove]')) { ms.move = !ms.move; drawMarks(); }
      });
      st.addEventListener('click', e => { const rm = e.target.closest('[data-rm]'); if (rm) removeMark(+rm.dataset.rm, false); });
    }
    st.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015), toSvg(e.clientX, e.clientY)); }, { passive: false });
    st.addEventListener('pointerdown', e => {
      if (markDrag || e.target.closest('[data-rm]')) return;
      const m = wantsMark(e) && !drag.size ? hitMark(toWorld(e.clientX, e.clientY)) : null;
      st.setPointerCapture(e.pointerId);
      if (m) {
        e.preventDefault();
        markDrag = { pid: e.pointerId, id: m.id, at: toWorld(e.clientX, e.clientY), x: m.x, z: m.z };
        st.classList.add('moving');
        return;
      }
      drag.set(e.pointerId, [e.clientX, e.clientY]); tap.down(e.pointerId, e.clientX, e.clientY); pinch = null;
    });
    // No Mac, Ctrl + clique abre o menu de contexto: sobre uma marcação, não.
    st.addEventListener('contextmenu', e => { if (markDrag || (wantsMark(e) && hitMark(toWorld(e.clientX, e.clientY)))) e.preventDefault(); });
    const endMark = e => {
      if (!markDrag || e.pointerId !== markDrag.pid) return false;
      markDrag = null;
      st.classList.remove('moving');
      reframe();
      return true;
    };
    st.addEventListener('pointermove', e => {
      if (markDrag) {
        if (e.pointerId !== markDrag.pid) return;
        const [x, z] = toWorld(e.clientX, e.clientY), m = ms.list.find(o => o.id === markDrag.id);
        const p = placeMark(fp, m.mk, markDrag.x + x - markDrag.at[0], markDrag.z + z - markDrag.at[1], 1);
        if (p.x !== m.x || p.z !== m.z) { ms.list = ms.list.map(o => (o.id === m.id ? { ...o, x: p.x, z: p.z } : o)); drawMarks(); }
        return;
      }
      if (ms && !drag.size) st.classList.toggle('markhover', wantsMark(e) && !!hitMark(toWorld(e.clientX, e.clientY)));
      const prev = drag.get(e.pointerId);
      if (!prev) return;
      drag.set(e.pointerId, [e.clientX, e.clientY]);
      if (drag.size === 1) {
        const [x0, y0] = toSvg(...prev), [x1, y1] = toSvg(e.clientX, e.clientY);
        vb = panView(vb, full, x0 - x1, y0 - y1);
        apply();
      } else if (drag.size === 2) {
        const [a, b] = [...drag.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoom(dist / pinch, toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
        pinch = dist;
      }
    });
    st.addEventListener('pointerup', e => {
      if (endMark(e) || !drag.delete(e.pointerId)) return;
      pinch = null;
      if (!tap.up(e.pointerId, e.clientX, e.clientY)) return;
      // Com o ponteiro capturado o alvo é o próprio svg: a peça tocada vem da posição.
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]'), id = el && st.contains(el) ? +el.dataset.id : null;
      pinned = id === pinned ? null : id;
      light(pinned);
    });
    st.addEventListener('pointercancel', e => { endMark(e); drag.delete(e.pointerId); tap.cancel(e.pointerId); pinch = null; });
  }
  if (in3d) {
    const token = {};
    root._token = token;
    q('.s3d-ctl').addEventListener('click', e => {
      const m = e.target.closest('[data-mode]');
      if (m && m.dataset.mode !== view && opts.onMode) opts.onMode(m.dataset.mode);
      const pv = e.target.closest('[data-per]');
      if (pv && pv.dataset.per !== per && opts.onPer) opts.onPer(pv.dataset.per);
      if (e.target.closest('[data-recenter]') && scene) scene.recenter();
    });
    const chips = id => root.querySelectorAll('[data-follow]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.follow === id)));
    q('.follow').addEventListener('click', e => {
      const b = e.target.closest('[data-follow]');
      if (!b || !scene) return;
      const id = b.getAttribute('aria-pressed') === 'true' ? null : +b.dataset.follow;
      scene.focus(id);
      chips(id);
    });
    mount3d(q('.stage3d'), d, labels, lay, { onFocus: chips }).then(sc => {
      if (root._token !== token) { if (sc) sc.dispose(); return; }
      if (!sc) {
        mountPonder(root, d, labels, '2d');
        root.querySelector('.stage').insertAdjacentHTML('afterbegin', `<p class="hint">${t('no3d')}</p>`);
        return;
      }
      scene = sc;
      q('.load3d')?.remove();
      scene.setStep(cur, K);
    });
  }
}

function whyText(ranked) {
  const w = designWhy(ranked);
  if (w.code === 'none') return t('whyNone');
  if (w.code === 'bp') return t('whyBp', w.a.bp.n, w.a.bp.m);
  if (w.code === 'only') return t('whyOnly');
  if (w.code === 'more') return t('whyMore', fmt(w.a.perOut), designName(w.b), fmt(w.b.perOut));
  if (w.code === 'noSink') return t('whyNoSink', designName(w.b), fmt(w.b.sinkRate));
  if (w.code === 'fewer') return t('whyFewer', designPieces(w.a), designName(w.b), designPieces(w.b));
  if (w.code === 'simpler') return t('whySimpler', designName(w.b), designPieces(w.b), designPieces(w.a));
  return t('whyTie', designName(w.b));
}

function designNote(d, belt) {
  if (d.applies) return t({ notDirect: 'rNotDirect', direct: 'rDirect', oneInput: 'rOneInput', shape: 'rShape', bpShape: 'rBpShape', butterflyShape: 'rButterfly', bfExtra: 'rBfExtra', loopFits: 'rLoopFits' }[d.applies], d.M, d.n);
  const bad = d.segments.find(s => !s.ok);
  const note = bad ? t('rLimit', segName(bad), fmt(bad.rate), belt) : t('rNoLimit');
  return note + (d.sinkRate > 0.05 ? `; ${t('lgToSink')} ${fmt(d.sinkRate)}/min` : '');
}

function checksTable(d, belt) {
  const rows = d.segments.map(s => `<tr><td>${esc(segName(s))}</td><td>${fmt(s.rate)}</td><td class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '✓' : '✗'}</td></tr>`).join('');
  return `<div class="tablewrap"><table class="checks">
    <tr><th>${t('thSegment')}</th><th>${t('thLoad')}</th><th>${t('thFits', belt)}</th></tr>${rows}</table></div>
    <p class="hint">${t('checkNote', belt, fmt(d.perOut))}${d.segments.some(s => !s.ok) ? ` ${t('checkOver')}` : ''}</p>`;
}

// Bancada: passo a passo do design escolhido, a lista de designs testados e a vazão de cada trecho.
// ctx: { N, M, rates, cap, belt, blueprints, labels: { ins, outs }, style, view, inUse, onView, onStyle }
// Montagem: normal (designs planos), borboleta, ou vertical (qualquer design em andares, com lifts).
const STYLES = ['normal', 'butterfly', '3d'];
const isBf = d => d.kind.startsWith('butterfly');
const STYLE_FILTER = { normal: d => !isBf(d), butterfly: isBf, '3d': d => d.kind !== 'blueprint' };
// Para o passo a passo (e descarta a cena 3D) do palco que vai ser substituído.
const stopStage = el => { const st = el.querySelector('.wb-stage'); if (st && st._stop) st._stop(); };
function workbench(el, ctx) {
  stopStage(el);
  // Quem tinha a antiga aba Vertical salva abre no 3D.
  const style = ctx.style === 'vertical' ? '3d' : STYLES.includes(ctx.style) ? ctx.style : 'normal';
  const all = rankDesigns(balancerCandidates(ctx.N, ctx.M, ctx.rates, ctx.cap, ctx.blueprints));
  const cands = all.filter(STYLE_FILTER[style]);
  const best = cands[0];
  // Aba (normal ou borboleta) onde está o melhor design de todos: marca a aba e avisa quando é outra.
  const top = all.find(d => !d.applies);
  const topStyle = top ? (isBf(top) ? 'butterfly' : 'normal') : null;
  const better = top && style !== '3d' && topStyle !== style
    ? `<p class="wb-better">${t('styleBetter', `<button type="button" data-style="${topStyle}">${t('style' + cap1(topStyle))}</button>`, esc(designName(top)), designPieces(top), fmt(top.perOut))}</p>` : '';
  const styleBar = `<div class="wb-style"><span class="wb-style-l">${t('styleTitle')}${tip('tipStyle')}</span>
    <div class="seg" role="radiogroup" aria-label="${esc(t('styleTitle'))}">${STYLES.map(k => `<button type="button" role="radio" aria-checked="${k === style}" data-style="${k}"${k === topStyle ? ` data-best title="${esc(t('styleBestTip'))}"` : ''}>${t('style' + cap1(k))}</button>`).join('')}</div>${better}</div>`;
  const bindStyle = () => el.querySelector('.wb-style').addEventListener('click', e => {
    const b = e.target.closest('[data-style]');
    if (!b || b.dataset.style === style) return;
    ctx.style = b.dataset.style;
    if (ctx.onStyle) ctx.onStyle(ctx.style);
    workbench(el, ctx);
    el.querySelector(`[data-style="${ctx.style}"]`)?.focus();
  });
  if (!best || best.applies) {
    el.innerHTML = `${styleBar}<p class="lead">${t(style === 'butterfly' ? 'styleNone' : 'whyNone')}</p>`;
    bindStyle();
    return;
  }
  const d = cands.find(x => !x.applies && designKey(x) === ctx.view) || best;
  const pc = d.pieces;
  // A borboleta abre em Andares (uma rodada por andar, como a borboleta vertical do jogo); em Torres as
  // misturas entre faixas viram esteiras compridas por cima de tudo. A escolha de cada família fica guardada à parte.
  const bfMode = isBf(d), pref = bfMode ? ctx.mode3dBf : ctx.mode3d;
  const mode3d = pref === 'floors' || pref === 'towers' ? pref : bfMode ? 'floors' : 'towers';
  const fl = style === '3d' ? layout3d(d, mode3d) : null;
  // Normal e borboleta mostram a planta: o espaço que ocupa e o Blueprint Designer que comporta.
  const pl = style !== '3d' && d.kind !== 'blueprint' ? flatLayout(d) : null, fp = pl && ctx.view2d === 'plan' ? planFootprint(pl) : null;
  // Marcações do Blueprint Designer da planta: ficam enquanto a montagem é a mesma (trocar Por nível/Por peça ou
  // Esquema/Planta mantém); mudou N→M, taxa, tier ou montagem, voltam ao padrão. Não vão para o link.
  const markKey = [style, designKey(d), ctx.N, ctx.M, ctx.rates.join(','), ctx.cap, ctx.belt].join('|');
  // ctx.marksBox guarda entre um desenho e outro do mesmo lugar (a biblioteca refaz o ctx a cada tecla).
  const mb = ctx.marksBox || ctx;
  if (!mb.planMarks || mb.planMarks.key !== markKey) mb.planMarks = { key: markKey, list: null, move: false };
  const tag = c => (c === best ? ` <span class="ctag">${t('bestTag')}</span>` : '') + (ctx.inUse === designKey(c) ? ` <span class="ctag use">${t('inUseTag')}</span>` : '');
  el.innerHTML = `${styleBar}<div class="wb">
    <div><div class="wb-stage"></div><div class="wb-checks"><h4>${t('checksTitle')}</h4>${checksTable(d, ctx.belt)}${fl ? `<p class="hint">${t('vertNote')}</p>` : ''}${fp ? `<p class="hint">${t('planNote')}</p>` : ''}</div></div>
    <aside class="wb-side">
      <div class="wb-head"><span class="wb-shape num">${d.N}→${d.M}</span><span class="wb-name">${esc(cap1(designName(d)))}${tag(d)}</span></div>
      <dl class="pc-grid num">
        ${pc.blueprints ? `<div><dt>Blueprint</dt><dd>${pc.blueprints}</dd></div>` : `<div><dt>${t('thSplitters')}</dt><dd>${pc.splitters}</dd></div><div><dt>${t('thMergers')}</dt><dd>${pc.mergers}</dd></div>`}
        ${fl ? `<div><dt>${t('thLifts')}</dt><dd>${fl.lifts}</dd></div>` : ''}
        ${fp ? `<div class="pc-space"><dt>${t('thSpace')}${tip('tipSpace')}</dt><dd>${t('spaceVal', fp.fw, fp.fd)}<small>${t('spaceM', fp.w, fp.d)}</small></dd><dd class="${fp.mk ? 'ok' : 'bad'}">${fp.mk ? t('bpFits', fp.mk) : t('bpNone')}</dd></div>` : ''}
        <div><dt>${t('thPerOut')}</dt><dd>${fmt(d.perOut)}<small>/min</small></dd></div>
      </dl>
      <div>${d === best ? `<h4>${t('whyTitle')}</h4><p>${esc(whyText(cands))}</p>` : `<h4>${t('whyNotTitle')}</h4><p>${esc(`${cap1(designName(best))}: ${whyText([best, d])}`)}</p>`}</div>
      <div>
        <h4>${t('designsTitle')}${tip('tipDesigns')}</h4>
        <div class="cands" role="radiogroup" aria-label="${esc(t('designsTitle'))}">
          <div class="cand-h" aria-hidden="true"><span>${t('thDesign')}</span><span>${t('thPerOut')}</span><span>${t('stPieces')}</span></div>
          ${cands.map(c => `<button type="button" class="cand ${c === d ? 'sel' : ''}" role="radio" aria-checked="${c === d}" data-key="${designKey(c)}" ${c.applies ? 'disabled' : ''}>
            <span class="cn">${esc(cap1(designName(c)))}${c.applies ? '' : tag(c)}</span>
            <span class="cv">${c.applies ? '—' : fmt(c.perOut)}</span>
            <span class="cp">${c.applies ? '' : designPieces(c)}</span>
            <span class="cnote">${esc(designNote(c, ctx.belt))}</span>
          </button>`).join('')}
        </div>
      </div>
    </aside>
  </div>
  <p class="hint ext">${t('extHint', extLink(EXT_MOD, 'Modular Load Balancers'), extLink(extBpUrl(), 'Satisfactory Calculator'))}</p>`;
  mountPonder(el.querySelector('.wb-stage'), d, ctx.labels, fl ? mode3d : '2d', {
    lay: fl || pl, per: ctx.per3d, view2d: ctx.view2d, marks: mb.planMarks,
    onView2d: v => { ctx.view2d = v; if (ctx.onView2d) ctx.onView2d(v); workbench(el, ctx); el.querySelector(`[data-v2d="${v}"]`)?.focus(); },
    onMode: m => { ctx[bfMode ? 'mode3dBf' : 'mode3d'] = m; if (ctx.onMode3d) ctx.onMode3d(m, bfMode); workbench(el, ctx); el.querySelector(`[data-mode="${m}"]`)?.focus(); },
    onPer: v => { ctx.per3d = v; if (ctx.onPer3d) ctx.onPer3d(v); workbench(el, ctx); el.querySelector(`[data-per="${v}"]`)?.focus(); },
  });
  bindStyle();
  el.querySelector('.cands').addEventListener('click', e => {
    const b = e.target.closest('.cand');
    if (!b || b.disabled) return;
    ctx.view = b.dataset.key;
    if (ctx.onView) ctx.onView(ctx.view);
    workbench(el, ctx);
    el.querySelector(`.cand[data-key="${ctx.view}"]`)?.focus();
  });
}

// ---- Biblioteca: gerador, blueprints e catálogo ----
const BP_STORE = 'sf-balancer:bp';
const LIB_STORE = 'sf-balancer:lib';
let BPS = [{ n: 3, m: 4 }];
try { const s = JSON.parse(localStorage.getItem(BP_STORE) || 'null'); if (Array.isArray(s)) BPS = s.filter(b => b.n >= 1 && b.m >= 2); } catch (e) { /* sem storage */ }
const LIB = { n: '2', m: '5', rate: '240', belt: 'Mk4', view: null, style: 'normal', mode3d: 'towers', mode3dBf: 'floors', per3d: 'level', view2d: 'scheme' };
const setMode3d = (m, bf) => { LIB[bf ? 'mode3dBf' : 'mode3d'] = m; saveLib(); };
try { Object.assign(LIB, JSON.parse(localStorage.getItem(LIB_STORE) || '{}')); } catch (e) { /* sem storage */ }
if (LIB.style === 'vertical') LIB.style = '3d';
const saveBps = () => { try { localStorage.setItem(BP_STORE, JSON.stringify(BPS)); } catch (e) { /* sem storage */ } };
const saveLib = () => { try { localStorage.setItem(LIB_STORE, JSON.stringify(LIB)); } catch (e) { /* sem storage */ } };

const CATALOG = [
  { kind: 'matrix', n: 3, m: 4, rate: 240, ds: 'dsMatrix' },
  { kind: 'funnel', n: 3, m: 2, rate: 120, ds: 'dsFunnel' },
  { kind: 'matrix-loop', n: 2, m: 5, rate: 240, ds: 'dsMatrixLoop' },
  { kind: 'matrix-split-loop', n: 1, m: 5, rate: 480, ds: 'dsMatrixSplitLoop' },
  { kind: 'funnel-loop', n: 3, m: 5, rate: 60, ds: 'dsFunnelLoop' },
  { kind: 'matrix-sink', n: 1, m: 7, rate: 480, ds: 'dsMatrixSink' },
  { kind: 'funnel-sink', n: 2, m: 5, rate: 60, ds: 'dsFunnelSink' },
  { kind: 'butterfly', n: 4, m: 4, rate: 480, ds: 'dsButterfly' },
  { kind: 'butterfly-loop', n: 5, m: 5, rate: 300, ds: 'dsButterflyLoop' },
];

function renderBps() {
  $('bpList').innerHTML = (BPS.length
    ? BPS.map((b, i) => `<span class="bp-chip num">${b.n}→${b.m}<button type="button" data-bp-rm="${i}" aria-label="${esc(t('bpRemove', b.n, b.m))}">×</button></span>`).join('')
    : `<span class="dim">${t('bpEmpty')}</span>`)
    + `<span class="bp-add"><input class="field" id="bpN" type="text" inputmode="numeric" placeholder="N" aria-label="${esc(t('bpInAria'))}"><span aria-hidden="true">→</span><input class="field" id="bpM" type="text" inputmode="numeric" placeholder="M" aria-label="${esc(t('bpOutAria'))}"><button type="button" class="pbtn" id="bpAdd">${t('bpAdd')}</button></span>`;
}

function libLabels(N, M) { return { ins: tags(t('inTag'), N), outs: tags(t('outTag'), M) }; }

const LIB_MARKS = {};
function renderLib() {
  const int = (el, lo, hi) => { const v = parseNum(el.value); const ok = Number.isInteger(v) && v >= lo && v <= hi; el.classList.toggle('invalid', !ok); return ok ? v : null; };
  const N = int($('libN'), 1, 12), M = int($('libM'), 2, 12);
  const belt = BELTS.find(b => b.id === $('libBelt').value) || BELTS[3];
  const rv = parseNum($('libRate').value);
  const rateOk = $('libRate').value.trim() === '' || rv > 0;
  $('libRate').classList.toggle('invalid', !rateOk);
  $('libRate').placeholder = fmt(belt.cap);
  Object.assign(LIB, { n: $('libN').value, m: $('libM').value, rate: $('libRate').value, belt: belt.id });
  saveLib();
  if (!N || !M || !rateOk) { stopStage($('libOut')); $('libOut').innerHTML = `<p class="lead">${t('invalid')}</p>`; return; }
  workbench($('libOut'), {
    N, M, rates: [rv > 0 ? rv : belt.cap], cap: belt.cap, belt: belt.id, blueprints: BPS,
    labels: libLabels(N, M), view: LIB.view, onView: v => { LIB.view = v; saveLib(); }, marksBox: LIB_MARKS,
    style: LIB.style, onStyle: st => { LIB.style = st; LIB.view = null; saveLib(); },
    mode3d: LIB.mode3d, mode3dBf: LIB.mode3dBf, onMode3d: setMode3d,
    per3d: LIB.per3d, onPer3d: v => { LIB.per3d = v; saveLib(); }, view2d: LIB.view2d, onView2d: v => { LIB.view2d = v; saveLib(); },
  });
}

function renderCatalog() {
  $('catGrid').innerHTML = CATALOG.map((c, i) => {
    const d = c.kind.startsWith('butterfly') ? butterflyDesign(c.n, c.m, [c.rate], 480, c.kind) : balancerDesign(c.kind, c.n, c.m, [c.rate], 480);
    return `<div class="plate cat">
      <div class="thumb" aria-hidden="true">${flatSvg(d, flatLayout(d), libLabels(c.n, c.m), 'level', false)}</div>
      <h4>${esc(cap1(designName(d)))}</h4>
      <p>${t(c.ds)}</p>
      <button type="button" class="pbtn" data-cat="${i}">${t('catExample', c.n, c.m)}</button>
    </div>`;
  }).join('');
}

function openCatalog(i) {
  const c = CATALOG[i];
  $('libN').value = c.n; $('libM').value = c.m; $('libRate').value = fmt(c.rate);
  LIB.view = c.kind;
  if (c.kind.startsWith('butterfly')) LIB.style = 'butterfly';
  else if (LIB.style === 'butterfly') LIB.style = 'normal';
  renderLib();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('gen').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

// ---- Diálogo com a montagem do balancer do plano ----
let lastRender = null;
function openDesign(ctx) {
  $('dlgTitle').textContent = t('lbBalTitle', ctx.N, ctx.M);
  workbench($('dlgBody'), ctx);
  $('balDlg').showModal();
  $('dlgBody').querySelector('.ponder').focus();
}
// key: 'plan' para o balancer N→M da alternativa, 'g<i>' para a árvore de uma doadora.
function openFromPlan(key) {
  if (!lastRender) return;
  const { p, alt } = lastRender;
  const base = { cap: p.cap, belt: p.input.belt, blueprints: BPS, mode3d: LIB.mode3d, mode3dBf: LIB.mode3dBf, onMode3d: setMode3d, per3d: LIB.per3d, onPer3d: v => { LIB.per3d = v; saveLib(); }, view2d: LIB.view2d, onView2d: v => { LIB.view2d = v; saveLib(); } };
  if (key === 'plan' && alt.view.bal) {
    const d = alt.view.bal.design;
    openDesign({ ...base, N: d.N, M: d.M, rates: d.rates, labels: { ins: alt.bal.inputs.map(O), outs: alt.feeds.map(f => Dn(f.dst)) }, inUse: designKey(d), view: designKey(d), style: d.kind.startsWith('butterfly') ? 'butterfly' : 'normal' });
  } else if (key[0] === 'g') {
    const gr = alt.view.groups[+key.slice(1)].gr;
    const kind = { direct: 'matrix', loop: 'matrix-loop', sink: 'matrix-sink' }[gr.mode];
    openDesign({ ...base, blueprints: [], N: 1, M: gr.p, rates: [gr.donor.rate], labels: { ins: [O(gr.donor)], outs: gr.members.map(dstTag) }, inUse: kind, view: kind });
  }
}

// ---- Cenários salvos e link ----
// Os cenários ficam só neste navegador; o link leva o cenário inteiro no fragmento (#s=...).
const SCEN_STORE = 'sf-balancer:scenarios';
let SCENS = [];
try { const sc = JSON.parse(localStorage.getItem(SCEN_STORE) || '[]'); if (Array.isArray(sc)) SCENS = sc.filter(x => x && typeof x.name === 'string' && x.state && Array.isArray(x.state.src)); } catch (e) { /* sem storage */ }
const saveScens = () => { try { localStorage.setItem(SCEN_STORE, JSON.stringify(SCENS)); } catch (e) { /* sem storage */ } };
function renderScenarios(sel) {
  const cur = sel === undefined ? $('scenList').value : String(sel);
  $('scenList').innerHTML = `<option value="">${esc(t('scenPick'))}</option>` + SCENS.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('');
  $('scenList').value = cur !== '' && SCENS[+cur] ? cur : '';
  $('scenDel').disabled = $('scenList').value === '';
}
let msgTimer = null;
function scenMsg(text) {
  clearTimeout(msgTimer);
  $('scenMsg').textContent = text;
  msgTimer = setTimeout(() => { $('scenMsg').textContent = ''; }, 5000);
}
function shareLink() {
  const base = onVercel ? SITE + LANG_PATH[getLang()] : location.href.split('#')[0];
  return `${base}#s=${encodeShare(currentState())}`;
}
// Estado salvo em outro idioma tem os números no formato daquele idioma.
function openState(state) {
  loadState(state);
  const from = state.lang || 'pt';
  if (from !== getLang()) convertInputs(from);
  render();
}

// ---- Desfazer e refazer ----
// Só as entradas do planejador, só nesta sessão. Idioma e alternativa escolhida ficam de fora.
let HIST = null, histTimer = null;
const histSnap = () => { const s = currentState(); delete s.selectedKey; return s; };
function syncHist() {
  if (!HIST) return;
  // Digitação ainda sem passo fechado já pode ser desfeita; refazer some porque o passo novo vai descartar.
  $('undo').disabled = !HIST.past.length && !histTimer;
  $('redo').disabled = !HIST.future.length || !!histTimer;
}
function histCommit() {
  if (histQuiet) return;
  clearTimeout(histTimer);
  histTimer = null;
  if (HIST) HIST = historyPush(HIST, histSnap());
  syncHist();
}
// Digitação seguida vira um passo só: fecha após uma pausa curta ou ao sair do campo.
function histSoon() {
  clearTimeout(histTimer);
  histTimer = setTimeout(histCommit, 500);
  syncHist();
}
// Campo de grupo com foco: os grupos são recriados ao restaurar, então o foco volta para o campo equivalente.
function focusSpot() {
  const a = document.activeElement;
  for (const side of ['src', 'dst']) for (const [i, r] of rows[side].entries()) {
    for (const k of ['count', 'clock', 'nominal', 'total', 'per']) if (r[k] === a) return { side, i, k };
  }
  return null;
}
function histStep(dir) {
  histCommit();
  const next = dir < 0 ? historyUndo(HIST) : historyRedo(HIST);
  if (next === HIST) return;
  HIST = next;
  const spot = focusSpot(), keep = selectedKey, state = HIST.present;
  loadState(state);
  if (state.lang !== getLang()) {
    convertInputs(state.lang);
    HIST = historyReplace(HIST, histSnap());
  }
  selectedKey = keep;
  render();
  const r = spot && (rows[spot.side][spot.i] || rows[spot.side][rows[spot.side].length - 1]);
  if (r) r[spot.k].focus();
  syncHist();
}
$('undo').addEventListener('click', () => histStep(-1));
$('redo').addEventListener('click', () => histStep(1));
// Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Y e Ctrl/Cmd+Shift+Z refazem, no lugar do desfazer nativo dos campos.
// Campos de texto fora do planejador (biblioteca, diálogo) mantêm o desfazer nativo.
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  const undo = k === 'z' && !e.shiftKey, redo = k === 'y' || (k === 'z' && e.shiftKey);
  if (!undo && !redo) return;
  if (document.querySelector('dialog[open]')) return;
  const el = e.target;
  const typing = el.closest && el.closest('input:not([type=radio]):not([type=checkbox]), textarea, [contenteditable=""], [contenteditable=true]');
  if (typing && !el.closest('#form') && el.id !== 'item') return;
  e.preventDefault();
  histStep(undo ? -1 : 1);
});

// ---- Eventos ----
$('scenList').addEventListener('change', () => {
  const sc = SCENS[+$('scenList').value];
  $('scenDel').disabled = !sc;
  if ($('scenList').value !== '' && sc) { openState(sc.state); histCommit(); }
});
$('scenSave').addEventListener('click', () => {
  const name = $('item').value.trim() || t('fallbackItem');
  let i = SCENS.findIndex(x => x.name === name);
  if (i < 0) { SCENS.push({ name, state: null }); i = SCENS.length - 1; }
  SCENS[i].state = currentState();
  saveScens();
  renderScenarios(i);
  scenMsg(t('scenSaved', name));
});
$('scenDel').addEventListener('click', () => {
  const i = +$('scenList').value;
  if ($('scenList').value === '' || !SCENS[i]) return;
  const [gone] = SCENS.splice(i, 1);
  saveScens();
  renderScenarios('');
  scenMsg(t('scenDeleted', gone.name));
});
$('shareCopy').addEventListener('click', async () => {
  const link = shareLink();
  try {
    await navigator.clipboard.writeText(link);
    scenMsg(t('shareCopied'));
  } catch (e) {
    clearTimeout(msgTimer);
    $('scenMsg').innerHTML = `${esc(t('shareFail'))} <a href="${esc(link)}">${esc(link)}</a>`;
  }
});
for (const ev of ['input', 'change']) {
  $('form').addEventListener(ev, render);
  $('item').addEventListener(ev, render);
}
// Histórico: digitação espera a pausa; seleção, rádio e saída do campo fecham o passo na hora.
for (const el of [$('form'), $('item')]) {
  el.addEventListener('input', histSoon);
  el.addEventListener('change', histCommit);
  el.addEventListener('focusout', () => { if (histTimer) histCommit(); });
}
$('form').addEventListener('click', e => {
  const side = e.target.dataset && e.target.dataset.add;
  if (side) { addGroup(side).count.focus(); render(); histCommit(); }
  else if (e.target.closest('.rm')) histCommit();
});
// Etapa seguinte: as máquinas do destino viram a origem; a taxa do item novo e o destino ficam para preencher.
$('dstToSrc').addEventListener('click', () => {
  const next = rows.dst.map(r => {
    const v = { driver: r.driver === 'clock' ? 'clock' : 'machines', count: r.count.value, clock: r.driver === 'clock' ? r.clock.value : '', nominal: '', total: '', per: '' };
    if (r.driver === 'total') {
      const total = parseNum(r.total.value), nom = parseNum(r.nominal.value);
      v.count = total > 0 && nom > 0 ? fmt(total / nom, 4) : '';
    }
    return v;
  });
  loadState({ ...currentState(), item: '', src: next, dst: [], selectedKey: null });
  rows.dst.splice(0).forEach(r => r.el.remove());
  addGroup('dst');
  render();
  histCommit();
  rows.src[0].nominal.focus();
});
$('out').addEventListener('click', e => {
  const open = e.target.closest('[data-open-bal]');
  if (open) { openFromPlan(open.dataset.openBal); return; }
  const card = e.target.closest('.alt');
  if (card) { selectedKey = card.dataset.key; render(); document.querySelector(`.alt[data-key="${selectedKey}"]`)?.focus(); }
});
document.addEventListener('mouseover', e => { const b = e.target.closest('.tip'); if (b && !tipPinned) showTip(b); });
document.addEventListener('mouseout', e => { const b = e.target.closest('.tip'); if (b && b === tipBtn && !tipPinned && !b.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('focusin', e => { if (e.target.classList.contains('tip')) showTip(e.target); });
document.addEventListener('focusout', e => { if (e.target === tipBtn) hideTip(); });
document.addEventListener('click', e => {
  const b = e.target.closest('.tip');
  if (b) { e.preventDefault(); if (b === tipBtn && tipPinned) hideTip(); else showTip(b, true); }
  else if (tipBtn) hideTip();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tipBtn) hideTip(); });
addEventListener('scroll', () => { if (tipBtn) hideTip(); }, { passive: true, capture: true });
addEventListener('resize', () => { if (tipBtn) hideTip(); });
$('out').addEventListener('keydown', e => {
  const open = e.target.closest('g[data-open-bal]');
  if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFromPlan(open.dataset.openBal); }
});
$('gen').addEventListener('input', e => {
  if (e.target.closest('.bp-add')) return;
  LIB.view = null;
  renderLib();
});
$('libBelt').addEventListener('change', () => { LIB.view = null; renderLib(); });
function bpChanged() { saveBps(); renderBps(); renderLib(); render(); }
function addBp() {
  const n = parseNum($('bpN').value), m = parseNum($('bpM').value);
  const okN = Number.isInteger(n) && n >= 1 && n <= 12, okM = Number.isInteger(m) && m >= 2 && m <= 12;
  $('bpN').classList.toggle('invalid', !okN);
  $('bpM').classList.toggle('invalid', !okM);
  if (!okN || !okM) return;
  if (!BPS.some(b => b.n === n && b.m === m)) BPS.push({ n, m });
  bpChanged();
  $('bpN').focus();
}
$('bpList').addEventListener('click', e => {
  const rm = e.target.closest('[data-bp-rm]');
  if (rm) { BPS.splice(+rm.dataset.bpRm, 1); bpChanged(); $('bpN').focus(); }
  else if (e.target.id === 'bpAdd') addBp();
});
$('bpList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.bp-add')) addBp(); });
$('catGrid').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) openCatalog(+b.dataset.cat); });
$('dlgClose').addEventListener('click', () => $('balDlg').close());
$('balDlg').addEventListener('click', e => { if (e.target === $('balDlg')) $('balDlg').close(); });
$('balDlg').addEventListener('close', () => { const st = $('dlgBody').querySelector('.wb-stage'); if (st && st._stop) st._stop(); hideTip(); });
$('reset').addEventListener('click', () => { loadState(DEFAULTS); render(); histCommit(); });
$('langs').addEventListener('click', e => {
  const btn = e.target.closest('[data-lang]');
  if (btn && btn.dataset.lang !== getLang()) { changeLang(btn.dataset.lang); $('langs').querySelector(`[data-lang="${getLang()}"]`).focus(); }
});

setLang(pickLang());
applyStatic();
let saved = null;
try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
// Link compartilhado ganha do que estava salvo; depois o endereço volta a ficar limpo.
const shared = location.hash.startsWith('#s=') ? decodeShare(location.hash.slice(3)) : null;
if (shared) {
  loadState(shared);
  if (shared.lang !== getLang()) convertInputs(shared.lang);
  history.replaceState(null, '', location.pathname + location.search);
  scenMsg(t('sharedLoaded'));
} else if (saved && saved.src) {
  loadState(saved);
  // Estados salvos antes dos idiomas foram digitados em português.
  if ((saved.lang || 'pt') !== getLang()) convertInputs(saved.lang || 'pt');
} else loadState(DEFAULTS);
$('libN').value = LIB.n; $('libM').value = LIB.m; $('libRate').value = LIB.rate; $('libBelt').value = LIB.belt;
renderBps();
renderCatalog();
render();
renderLib();
HIST = historyNew(histSnap());
syncHist();
