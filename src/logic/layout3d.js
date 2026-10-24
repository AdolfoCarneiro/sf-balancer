// Layout 3D das peças do balancer (sem Three.js).
import { t } from '../i18n/index.js';

// Montagem vertical: cada camada de peças num andar, ligados por lifts.
// Andar = profundidade da peça a partir das entradas (o retorno do loop não conta). Um lift por ligação
// entre peças de andares diferentes; entradas chegam e saídas saem no andar da própria peça.
// x (0..1) é a posição na fachada, para desenhar o corte.
export function designFloors(d) {
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
export const L3D = { cell: 4, floor: 5, gap: 8, half: { s: [1.8, 1.2, 1.8], m: [1.8, 1.2, 1.8], sink: [1.8, 1.2, 1.8], in: [2.2, 0.4, 2.2], out: [2.2, 0.4, 2.2] } };

// Faces de cada peça, como no jogo, no referencial do fluxo (frente = sentido do fluxo, direita = +z').
export const PORT3D = { s: { in: ['back'], out: ['front', 'left', 'right'] }, m: { in: ['back', 'left', 'right'], out: ['front'] }, in: { in: [], out: ['front'] }, out: { in: ['back'], out: [] }, sink: { in: ['back'], out: [] } };

export const NRM3 = { front: [1, 0, 0], back: [-1, 0, 0], left: [0, 0, -1], right: [0, 0, 1] };

const STUB3 = 1.2, CROSS3 = 25;

export function layout3d(d, mode, spread = 1) {
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
export function focus3d(lay, id) {
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
export function byPiece3d(lay) {
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
export function pieceText3d(st, labels, mode) {
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
