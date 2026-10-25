// Layout do fluxo em peças: coluna pela profundidade, linha pelo vizinho, porta pelo lado do jogo.
// Na tela a esquerda da peça é para cima e a direita para baixo (fluxo da esquerda para a direita).

// Lados de cima para baixo: saída (frente no meio) e entrada (trás no meio).
const OUT = ['left', 'front', 'right'], IN = ['left', 'back', 'right'];
const EPS = 1e-9;

// Custo de um lado para uma esteira que vai `dy` linhas para baixo: o natural 0, o do meio por um lado 1, o oposto 2.
const cost = (k, dy) => { const want = Math.abs(dy) < EPS ? 1 : dy < 0 ? 0 : 2; return Math.abs(k - want); };

// Melhor escolha de lados, mantendo a ordem de cima para baixo (esteiras já ordenadas por dy).
function pick(dys, n) {
  let best = null, bc = Infinity;
  const go = (i, from, acc, c) => {
    if (i === dys.length) { if (c < bc) { bc = c; best = acc; } return; }
    for (let k = from; k < n; k++) go(i + 1, k + 1, [...acc, k], c + cost(k, dys[i]));
  };
  go(0, 0, [], 0);
  return best;
}

export function flowLayout(net) {
  const { nodes, belts } = net;
  const ins = nodes.map(() => []), outs = nodes.map(() => []);
  belts.forEach(b => { outs[b.a].push(b); ins[b.b].push(b); });
  const flat = list => list.filter(b => b.role !== 'loop');

  // Colunas: maior distância desde uma origem, sem os loops; destinos na última, sink/extra logo depois da peça de onde saem.
  const col = nodes.map(() => 0);
  const relax = () => {
    for (let it = 0, ch = true; ch && it <= nodes.length; it++) {
      ch = false;
      belts.forEach(b => { if (b.role !== 'loop' && col[b.b] < col[b.a] + 1) { col[b.b] = col[b.a] + 1; ch = true; } });
    }
  };
  relax();
  // Peça que só recebe o retorno do loop (splitter da borboleta com loop): logo antes da primeira peça que alimenta.
  nodes.forEach(q => {
    if (q.t !== 'src' && !flat(ins[q.id]).length && flat(outs[q.id]).length) col[q.id] = Math.max(1, Math.min(...flat(outs[q.id]).map(b => col[b.b])) - 1);
  });
  relax();
  const end = ['dst', 'sink', 'extra'];
  const last = Math.max(0, ...nodes.filter(q => !end.includes(q.t)).map(q => col[q.id])) + 1;
  nodes.forEach(q => {
    if (q.t === 'src') col[q.id] = 0;
    else if (q.t === 'dst') col[q.id] = last;
    else if (q.t === 'sink' || q.t === 'extra') col[q.id] = col[ins[q.id][0].a] + 1;
  });

  // Linhas fixas: destinos pelo id da linha; origens pelo primeiro destino que alimentam (as de esteira principal
  // primeiro, depois as doadoras, depois as que sobram), como o srcOrder de antes.
  const row = nodes.map(() => 0), fixed = new Set();
  const dsts = nodes.filter(q => q.t === 'dst').sort((x, y) => x.line.id - y.line.id);
  const di = new Map(dsts.map((q, i) => [q.id, i]));
  const firstDst = id => {
    const seen = new Set(), st = [id];
    let m = Infinity;
    while (st.length) {
      const x = st.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      if (di.has(x)) m = Math.min(m, di.get(x));
      flat(outs[x]).forEach(b => st.push(b.b));
    }
    return m;
  };
  const kind = q => { const r = outs[q.id][0]?.role; return r === 'main' && firstDst(q.id) < Infinity ? 0 : r === 'donor' ? 1 : 2; };
  const srcs = nodes.filter(q => q.t === 'src').map(q => ({ q, k: kind(q), d: firstDst(q.id) }))
    .sort((x, y) => x.k - y.k || x.d - y.d || x.q.line.id - y.q.line.id).map(x => x.q);
  srcs.forEach((q, i) => { row[q.id] = i; fixed.add(q.id); });
  dsts.forEach((q, i) => { row[q.id] = i; fixed.add(q.id); });

  // Peças do meio (e sinks): baricentro dos vizinhos, passadas para frente e para trás; numa coluna, sem empilhar
  // (a mais próxima do desejado que fique a pelo menos 1 linha de quem já está lá). Sink e extra escolhem por último.
  const cols = last + 1, byCol = Array.from({ length: cols }, () => []);
  nodes.forEach(q => byCol[col[q.id]].push(q.id));
  const late = id => +(nodes[id].t === 'sink' || nodes[id].t === 'extra');
  const mean = list => list.reduce((s, x) => s + row[x], 0) / list.length;
  // Esteira reta que atravessa a coluna: a peça fica a pelo menos meia linha dela, para não ser desenhada em cima.
  // Só conta esteira com as duas pontas já posicionadas (`done`); antes disso a linha é o 0 inicial.
  const done = new Set(fixed);
  const place = (c, want) => {
    const placed = byCol[c].filter(id => fixed.has(id)).map(id => row[id]);
    const thru = belts.filter(b => b.role !== 'loop' && col[b.a] < c && col[b.b] > c && done.has(b.a) && done.has(b.b) && Math.abs(row[b.a] - row[b.b]) < EPS).map(b => row[b.a]);
    byCol[c].filter(id => !fixed.has(id) && want.has(id)).sort((x, y) => late(x) - late(y) || want.get(x) - want.get(y) || x - y).forEach(id => {
      const w = want.get(id), ok = r => placed.every(p => Math.abs(p - r) > 1 - EPS) && thru.every(p => Math.abs(p - r) > 0.5 - EPS);
      const cand = [w, ...placed.flatMap(p => [p - 1, p + 1]), ...thru.flatMap(p => [p - 0.5, p + 0.5])].filter(ok).sort((x, y) => Math.abs(x - w) - Math.abs(y - w) || x - y);
      row[id] = cand[0];
      placed.push(cand[0]);
      done.add(id);
    });
  };
  const pass = (order, nb) => order.forEach(c => {
    const want = new Map();
    byCol[c].forEach(id => { if (fixed.has(id)) return; const l = nb(id); want.set(id, l.length ? mean(l) : row[id]); });
    place(c, want);
  });
  const fwd = [...Array(cols).keys()].slice(1), back = fwd.slice().reverse();
  // Sink e linha extra não puxam a peça: ela fica com o destino e o toco do sink se ajeita perto.
  const preds = id => flat(ins[id]).map(b => b.a), succs = id => flat(outs[id]).map(b => b.b).filter(x => !late(x));
  pass(fwd, preds);
  for (let i = 0; i < 3; i++) {
    pass(back, id => (succs(id).length ? succs(id) : preds(id)));
    pass(fwd, id => [...preds(id), ...succs(id)]);
  }
  pass(back, id => (succs(id).length ? succs(id) : preds(id)));

  // Balancer do plano: dentro de cada coluna as peças trocam de linha (as mesmas linhas) pela ordem de montagem,
  // como na planta da biblioteca: entrada a entrada, cada árvore na ordem das folhas. Assim as árvores não se cruzam.
  net.blocks.filter(bk => bk.kind === 'bal').forEach(bk => {
    const inB = new Set(bk.nodes), order = new Map();
    const starts = bk.nodes.filter(id => flat(ins[id]).some(b => !inB.has(b.a)))
      .sort((x, y) => Math.min(...flat(ins[x]).map(b => row[b.a])) - Math.min(...flat(ins[y]).map(b => row[b.a])));
    const visit = id => { if (order.has(id) || !inB.has(id)) return; order.set(id, order.size); flat(outs[id]).forEach(b => visit(b.b)); };
    starts.forEach(visit);
    bk.nodes.forEach(id => visit(id));
    // A cascata de mergers que termina num destino e as peças que a alimentam ficam onde estão (o baricentro já as
    // alinha com o destino); trocar estas faz a cascata receber tudo de um lado só.
    const toDst = id => nodes[id].t === 'dst' || (nodes[id].t === 'm' && flat(outs[id]).some(b => toDst(b.b)));
    for (let c = 0; c < cols; c++) {
      const ids = byCol[c].filter(id => inB.has(id) && !flat(outs[id]).some(b => toDst(b.b)));
      const rs = ids.map(id => row[id]).sort((x, y) => x - y);
      ids.sort((x, y) => order.get(x) - order.get(y)).forEach((id, i) => { row[id] = rs[i]; });
    }
  });

  // Portas: splitter (e Smart Splitter) entra por trás e sai pela frente e pelos lados; merger entra por trás e pelos
  // lados e sai pela frente. Quem vai para cima usa a esquerda, para baixo a direita, reto frente/trás; o retorno do
  // loop pega um lado livre (o do sentido, se der). Caixa de blueprint: tudo entra por trás e sai pela frente.
  const side = new Map(belts.map(b => [b.id, { from: 'front', to: 'back' }]));
  const sides = (id, list, names, end, other) => {
    const main = flat(list).sort((x, y) => row[x[other]] - row[id] - (row[y[other]] - row[id]));
    const ks = pick(main.map(b => row[b[other]] - row[id]), 3), free = new Set([0, 1, 2]);
    main.forEach((b, i) => { side.get(b.id)[end] = names[ks[i]]; free.delete(ks[i]); });
    list.filter(b => b.role === 'loop').forEach(b => {
      const want = row[b[other]] < row[id] ? 0 : 2, k = free.has(want) ? want : [2, 0, 1].find(x => free.has(x));
      side.get(b.id)[end] = names[k];
      free.delete(k);
    });
  };
  nodes.forEach(q => {
    if (q.t === 's' || q.t === 'ov') sides(q.id, outs[q.id], OUT, 'from', 'b');
    if (q.t === 'm') sides(q.id, ins[q.id], IN, 'to', 'a');
  });

  return {
    cols,
    nodes: new Map(nodes.map(q => [q.id, { col: col[q.id], row: row[q.id] }])),
    belts: side,
  };
}
