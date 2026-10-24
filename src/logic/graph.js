// Grafo de esteiras e simulação do regime permanente.
import { INF } from './belts.js';

// Divide `total` igualmente entre saídas com limite `caps` (sobra de uma vai para as outras).
export function waterfill(total, caps) {
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

export function makeGraph(cap) { return { cap, nodes: [], edges: [] }; }

export function addNode(g, type, props) {
  const n = { id: g.nodes.length, type, ins: [], outs: [], ...props };
  g.nodes.push(n);
  return n.id;
}

export function addEdge(g, from, to) {
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
export function simulate(g) {
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
export function connectMany(g, froms, to) {
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
export function buildTree(g, tree) {
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
export function buildBalancer(g, d, inputs, outputs, sink) {
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
