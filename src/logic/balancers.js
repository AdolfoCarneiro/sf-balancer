// Biblioteca de load balancers N→M (matriz, funil, butterfly).
import { EPS } from './belts.js';
import { isDirect, nextDirect, splitTree, chainSizes, mergersFor } from './splitters.js';

// Matriz: cada entrada vira M partes numa árvore de splitters e cada saída junta uma parte de cada entrada.
// Funil: junta tudo numa esteira e divide em M. Quando M não é produto de 2 e 3, divide em n (o próximo
// que é) e manda as n−M partes extras de volta pra entrada (loop) ou pro sink.
// Matriz com loop dividido: cada entrada passa antes por um splitter em 2 e cada metade tem o seu loop. Com a
// entrada cheia, o loop da matriz comum estoura a esteira (leva n/M da entrada); o de meia entrada cabe.
export const DESIGN_KINDS = ['matrix', 'funnel', 'matrix-loop', 'funnel-loop', 'matrix-split-loop', 'matrix-sink', 'funnel-sink'];

export function balancerDesign(kind, N, M, rates, cap) {
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
  // Merger do retorno de cada árvore com loop: entrada + n − M retornos (3+ retornos = cascata).
  const back = loop ? mergersFor(1 + extra) : 0;
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
    mergers = chain.length + back;
  } else {
    // Com metades, cada árvore recebe meia entrada.
    const part = halves ? 2 : 1;
    if (halves) add('half', rMax / 2);
    treeIn = loop ? rMax / part * n / M : rMax;
    perOut = Math.min(cap, loop ? r.reduce((a, x) => a + part * Math.min(x / part, cap * M / n), 0) / M : sink ? total / n : total / M);
    if (sink) sinkRate = total * extra / n;
    splitters = V * tree.splitters + (halves ? N : 0);
    mergers = M * chain.length + V * back;
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
export function blueprintDesign(bp, N, M, rates, cap) {
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
export function butterflyGroup(F, s, i) {
  const stride = F.slice(0, s).reduce((a, b) => a * b, 1);
  const base = i - (Math.floor(i / stride) % F[s]) * stride;
  return Array.from({ length: F[s] }, (_, k) => base + k * stride);
}

// K = o próximo número feito de 2 e 3 que cabe as entradas e as saídas. Faixa sem entrada fica vazia:
// sai o splitter dela, e a faixa que recebe uma parte só segue direto, sem merger. As K − M faixas que
// sobram na saída voltam pro começo da própria faixa (loop) ou vão pro sink.
export const BF_KINDS = ['butterfly', 'butterfly-loop', 'butterfly-sink'];

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

export function butterflyNet(kind, N, M) {
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

export function butterflyDesign(N, M, rates, cap, kind = 'butterfly') {
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
