// Rede de peças do fluxo: cada peça como no jogo, ligada pelas esteiras de verdade.
import { splitTree } from './splitters.js';
import { designFloors } from './layout3d.js';

// Nós do grafo que já são peças passam direto (esteira = aresta, taxa da simulação). Os nós ideais
// (`balancer`) viram a montagem real: loop = merger do retorno + árvore; borboleta com loop pela
// montagem de designFloors; blueprint numa caixa `bp`. Sink e linha extra: um nó por esteira.
export function flowNet(a) {
  if (a.headers) return null; // cano coletor (fluido) continua desenhado à parte
  const g = a.g, v = a.view, flow = a.sim.flow;
  const nodes = [], belts = [], blocks = [];
  const add = (t, x = {}) => {
    const id = nodes.push({ id: nodes.length, t, ...x }) - 1;
    if (x.block !== undefined) blocks[x.block].nodes.push(id);
    return id;
  };
  const belt = (from, to, rate, role) => belts.push({ id: belts.length, a: from, b: to, rate, role });
  const type = id => g.nodes[id].type;
  // Nós do grafo alcançados a partir de `starts`, andando só pelos tipos `pass`.
  const reach = (starts, pass) => {
    const seen = new Set(), st = [...starts];
    while (st.length) {
      const id = st.pop();
      if (seen.has(id) || !pass.includes(type(id))) continue;
      seen.add(id);
      g.nodes[id].outs.forEach(e => st.push(g.edges[e].to));
    }
    return seen;
  };

  // Blocos: divisões das doadoras e o balancer do plano. `owner`: nó do grafo → bloco.
  const owner = new Map(), loopTree = new Map(), donorEdges = new Set();
  v.groups.forEach((gv, gi) => {
    const src = g.nodes.find(n => n.type === 'source' && n.line.id === gv.gr.donor.id);
    src.outs.forEach(e => donorEdges.add(e));
    if (gv.donorEdge !== null) donorEdges.add(gv.donorEdge);
    if (gv.root === null) return;
    const bi = blocks.push({ key: `g${gi}`, kind: 'group', nodes: [] }) - 1;
    reach([gv.root], ['splitter', 'balancer']).forEach(id => {
      owner.set(id, bi);
      g.nodes[id].outs.forEach(e => donorEdges.add(e));
    });
    if (gv.gr.mode === 'loop') loopTree.set(gv.root, gv.gr.n);
  });
  let hub = null;
  if (v.bal) {
    const d = v.bal.design, bi = blocks.push({ key: 'plan', kind: 'bal', nodes: [] }) - 1;
    reach(v.bal.inEdges.map(e => g.edges[e].to), ['splitter', 'merger', 'balancer']).forEach(id => {
      owner.set(id, bi);
      if (type(id) !== 'balancer') return;
      if (d.kind === 'blueprint' || d.kind === 'butterfly-loop') hub = id;
      else loopTree.set(id, d.n);
    });
  }

  // Pontas das arestas do grafo na rede (nós ideais trocam por peças diferentes na entrada e na saída).
  const at = new Map(), inTo = new Map(), outFrom = new Map();
  const head = e => inTo.get(e) ?? at.get(g.edges[e].to), tail = e => outFrom.get(e) ?? at.get(g.edges[e].from);
  const sum = ids => ids.reduce((s, e) => s + flow[e], 0);

  for (const n of g.nodes) {
    const bi = owner.get(n.id), blk = bi === undefined ? {} : { block: bi };
    const role = bi !== undefined && blocks[bi].kind === 'group' ? 'donor' : 'main';
    if (n.type === 'source') at.set(n.id, add('src', { line: n.line }));
    else if (n.type === 'consumer') at.set(n.id, add('dst', { line: n.line }));
    else if (n.type === 'splitter') at.set(n.id, add('s', { ways: n.outs.length, ...blk }));
    else if (n.type === 'merger') at.set(n.id, add('m', blk));
    else if (n.type === 'overflow') at.set(n.id, add('ov', blk));
    else if (n.type === 'balancer' && loopTree.has(n.id)) {
      // Merger do retorno → árvore em k; p folhas saem, k − p voltam ao merger. Entra x, a árvore leva x·k/p.
      const k = loopTree.get(n.id), p = n.outs.length, x = sum(n.ins), m = add('m', blk);
      n.ins.forEach(e => inTo.set(e, m));
      let level = [{ id: m, r: x * k / p }];
      splitTree(k).factors.forEach(f => {
        const next = [];
        level.forEach(q => {
          const s = add('s', { ways: f, ...blk });
          belt(q.id, s, q.r, role);
          for (let c = 0; c < f; c++) next.push({ id: s, r: q.r / f });
        });
        level = next;
      });
      level.forEach((lf, j) => (j < p ? outFrom.set(n.outs[j], lf.id) : belt(lf.id, m, lf.r, 'loop')));
    } else if (n.id === hub && v.bal.design.kind === 'blueprint') {
      const b = add('bp', blk);
      n.ins.forEach(e => inTo.set(e, b));
      n.outs.forEach(e => outFrom.set(e, b));
    } else if (n.id === hub) expandFloors(n, blk);
  }

  // Borboleta com loop: a montagem de designFloors; taxas internas pela divisão ideal, repetida até estabilizar.
  function expandFloors(n, blk) {
    const fl = designFloors(v.bal.design), map = fl.nodes.map(q => (q.t === 's' || q.t === 'm' ? add(q.t, q.t === 's' ? { ways: q.ways, ...blk } : blk) : null));
    const r = fl.edges.map(() => 0);
    const into = fl.nodes.map(q => fl.edges.flatMap((e, i) => (e.b === q.id ? [i] : [])));
    const from = fl.nodes.map(q => fl.edges.flatMap((e, i) => (e.a === q.id ? [i] : [])));
    for (let it = 0, delta = 1; it < 1000 && delta > 1e-9; it++) {
      delta = 0;
      for (const q of fl.nodes) {
        const tot = q.t === 'in' ? flow[v.bal.inEdges[q.inp]] : into[q.id].reduce((s, i) => s + r[i], 0);
        from[q.id].forEach(i => { const f = q.t === 's' ? tot / q.ways : tot; delta = Math.max(delta, Math.abs(r[i] - f)); r[i] = f; });
      }
    }
    fl.edges.forEach((e, i) => {
      const A = fl.nodes[e.a], B = fl.nodes[e.b];
      if (A.t === 'in') inTo.set(v.bal.inEdges[A.inp], map[e.b]);
      else if (B.t === 'out') outFrom.set(v.bal.outEdges[fl.outs.indexOf(e.b)], map[e.a]);
      else if (B.t === 'sink') belt(map[e.a], add('sink'), r[i], 'sink');
      else belt(map[e.a], map[e.b], r[i], e.kind === 'loop' ? 'loop' : 'main');
    });
  }

  // Esteiras do grafo. Sink e linha extra: um nó próprio por esteira.
  g.edges.forEach(e => {
    const to = type(e.to), from = g.nodes[e.from];
    let b = head(e.id), role = 'main';
    if (to === 'sink') { b = add('sink'); role = 'sink'; } else if (to === 'extra') { b = add('extra'); role = 'extra'; } else if (donorEdges.has(e.id)) role = 'donor';
    else if (from.type === 'overflow' && from.outs[0] !== e.id) role = 'over';
    belt(tail(e.id), b, flow[e.id], role);
  });
  return { nodes, belts, blocks };
}
