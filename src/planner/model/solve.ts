// Fluxo físico da fábrica (fase 3), como o "Full" do Modeler: começa com tudo no máximo que os limites deixam e só
// reduz pelo que falta na entrada ou pelo que não escoa na saída. O item anda para a frente e o consumo limitado na frente
// volta para trás. Puro, sem DOM; roda no worker.
import type { Block, Factory, GameData, ItemId, StageId } from './types.ts';
import { PURITY, meiosOf } from './factory.ts';

// rate: o que passa na porta (null = sem limite); deficit (entrada, só bloco com limite): o que falta para o limite;
// held (saída): represado nesta origem; exits: o que sai da fábrica pela porta (produto final sem ligação ou coleta de
// excesso; null = sem limite).
export interface PortFlow { item: ItemId; rate: number | null; deficit: number; held: number; exits: number | null }
export interface BlockFlow {
  id: StageId; x: number | null;            // receita: máquinas-equivalentes a 100%; miner/extrator/sobra: item/min; null = sem limite
  machines: number | null; runClock: number | null;   // receita: inteiro e clock de funcionamento (%); null fora de receita ou sem limite
  extractors: number | null;                // extrator: quantos (calculado = ceil(x / vazão); fixado = count)
  unbounded: boolean; stalled: ItemId | null; ins: PortFlow[]; outs: PortFlow[];
}
// links: fluxo de cada ligação (null = sem limite).
// failed: o cálculo deu erro (o fluxo vem vazio e a página avisa, em vez de quebrar).
export interface FlowResult {
  blocks: Record<StageId, BlockFlow>; links: Record<string, number | null>; deadlock: StageId[][]; converged: boolean; iterations: number;
  failed?: true;
}

export const MAX_ITER = 1000, EPS = 1e-9;
const INF = Infinity;

interface InPort { item: ItemId; a: number; links: number[]; limit: number | null }
// free: escoa livre (produto final sem ligação, coleta, ou ligado a um bloco de sobra); stall: subproduto parado;
// linked: escoa o que as consumidoras ligadas aceitam.
interface OutPort { item: ItemId; b: number; links: number[]; mode: 'free' | 'stall' | 'linked' }
interface Node { block: Block; U0: number; outlet: boolean; limited: boolean; mult: number; ins: InPort[]; outs: OutPort[] }
interface Edge { id: string; from: number; out: number; to: number; inp: number }
// Meio: produtoras (bloco, saída), consumidoras (bloco, entrada) e os links com os índices locais delas.
interface Group { prods: [number, number][]; cons: [number, number][]; ls: { p: number; c: number; e: number }[] }

// Rede pronta para iterar: portas com coeficientes, ligações válidas e grupos (meios) por item.
function build(f: Factory, d: GameData) {
  const idx = new Map<StageId, number>();
  f.blocks.forEach((b, i) => idx.set(b.id, i));
  const nodes: Node[] = f.blocks.map(b => {
    switch (b.kind) {
      case 'recipe': {
        const r = d.recipes[b.recipe];
        const lim = b.limits;
        return {
          block: b, U0: lim?.machines !== undefined ? lim.machines * b.clock / 100 : INF, outlet: false, limited: !!lim, mult: 1,
          ins: r.ins.map(x => ({ item: x.item, a: x.perMin, links: [], limit: lim?.inputs && Object.hasOwn(lim.inputs, x.item) ? lim.inputs[x.item] : null })),
          outs: r.outs.map(x => ({ item: x.item, b: x.perMin, links: [], mode: 'stall' as const })),
        };
      }
      case 'miner':
        return { block: b, U0: b.rate, outlet: false, limited: false, mult: 1, ins: [], outs: [{ item: b.item, b: 1, links: [], mode: 'stall' }] };
      case 'extractor': {
        const e = d.extractors[b.building];
        const mult = e.perMin * (e.purity ? PURITY[b.purity] : 1);
        return { block: b, U0: b.count === null ? INF : b.count * mult, outlet: false, limited: false, mult, ins: [], outs: [{ item: b.item, b: 1, links: [], mode: 'stall' }] };
      }
      default:
        return { block: b, U0: INF, outlet: true, limited: false, mult: 1, ins: [], outs: [] };
    }
  });
  const edges: Edge[] = [], edgeOf = new Map<string, number>();
  for (const l of f.links) {
    const fi = idx.get(l.from), ti = idx.get(l.to);
    if (fi === undefined || ti === undefined) continue;
    const src = nodes[fi], dst = nodes[ti];
    const out = src.outs.findIndex(p => p.item === l.item);
    if (out < 0) continue;
    let inp = dst.ins.findIndex(p => p.item === l.item);
    if (inp < 0) {
      if (!dst.outlet) continue;
      inp = dst.ins.push({ item: l.item, a: 1, links: [], limit: null }) - 1;   // bloco de sobra: uma entrada por item ligado
    }
    edgeOf.set(l.id, edges.length);
    src.outs[out].links.push(edges.length); dst.ins[inp].links.push(edges.length);
    edges.push({ id: l.id, from: fi, out, to: ti, inp });
  }
  // Limite numa entrada ligada é teto do bloco; sem ligação, é o que existe ali (fica no suprimento).
  for (const n of nodes) for (const p of n.ins) if (p.links.length && p.limit !== null) n.U0 = Math.min(n.U0, p.limit / p.a);
  for (const n of nodes) n.outs.forEach((p, j) => {
    const collect = n.block.kind === 'recipe' && (n.block.collect ?? []).includes(p.item);
    if (p.links.some(e => nodes[edges[e].to].outlet) || collect || (!p.links.length && (j === 0 || n.block.kind !== 'recipe'))) p.mode = 'free';
    else p.mode = p.links.length ? 'linked' : 'stall';
  });
  const groups: Group[] = [];
  for (const m of meiosOf(f)) {
    const es = m.links.map(id => edgeOf.get(id)).filter((e): e is number => e !== undefined);
    if (!es.length) continue;
    const prods: [number, number][] = [], cons: [number, number][] = [];
    const pm = new Map<string, number>(), cm = new Map<string, number>();
    const local = (m: Map<string, number>, list: [number, number][], a: number, j: number) => {
      const k = `${a}:${j}`;
      if (!m.has(k)) m.set(k, list.push([a, j]) - 1);
      return m.get(k)!;
    };
    const ls = es.map(e => ({ p: local(pm, prods, edges[e].from, edges[e].out), c: local(cm, cons, edges[e].to, edges[e].inp), e }));
    groups.push({ prods, cons, ls });
  }
  return { nodes, edges, groups };
}

// Alocação max-min justa (enchimento progressivo) nos links `ls` (índices locais `p`, `c`), com sobras `remP`/`remC`.
function fill(ls: { p: number; c: number; e: number }[], remP: number[], remC: number[], flow: Float64Array): void {
  let active = ls.filter(l => remP[l.p] > 0 && remC[l.c] > 0);
  while (active.length) {
    const nP = new Map<number, number>(), nC = new Map<number, number>();
    for (const l of active) { nP.set(l.p, (nP.get(l.p) ?? 0) + 1); nC.set(l.c, (nC.get(l.c) ?? 0) + 1); }
    let delta = INF;
    for (const [p, k] of nP) delta = Math.min(delta, remP[p] / k);
    for (const [c, k] of nC) delta = Math.min(delta, remC[c] / k);
    if (delta === INF) { for (const l of active) flow[l.e] = INF; return; }
    for (const l of active) flow[l.e] += delta;
    for (const [p, k] of nP) remP[p] = remP[p] / k <= delta * (1 + 1e-12) ? 0 : remP[p] - delta * k;
    for (const [c, k] of nC) remC[c] = remC[c] / k <= delta * (1 + 1e-12) ? 0 : remC[c] - delta * k;
    active = active.filter(l => remP[l.p] > 0 && remC[l.c] > 0);
  }
}

const same = (a: number, b: number) =>
  a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b)));
const fin = (v: number) => (Number.isFinite(v) ? v : null);
const snap = (v: number) => (v < EPS ? 0 : v);
// Tolerância relativa do resultado: o resto do ponto fixo não vira máquina a mais nem falta de 1e-7.
const REL = 1e-7;
const tidy = (v: number, scale: number) => (v <= REL * Math.max(1, Math.abs(scale)) ? 0 : v);
const ceilTol = (v: number) => Math.ceil(v * (1 - REL));

type Net = ReturnType<typeof build>;

// Ponto fixo a partir do máximo, todo bloco com o estado da volta anterior (Jacobi). damp: fração do passo que o tamanho
// anda por volta (1 = inteiro). Para cedo quando o estado volta exatamente ao de duas voltas atrás (ciclo de período 2:
// não converge nunca).
function iterate({ nodes, edges, groups }: Net, damp: number) {
  const n = nodes.length;
  // Estado: começa no máximo. intake/accOut por porta; o que não é ligado não muda.
  const x = new Float64Array(n);
  const intake = nodes.map(nd => nd.ins.map(p => (p.links.length ? INF : (p.limit ?? INF))));
  const accOut = nodes.map(nd => nd.outs.map(p => (p.mode === 'stall' ? 0 : INF)));
  const cap = nodes.map(nd => nd.ins.map(() => INF));
  let flow = new Float64Array(edges.length);
  const supOf = (i: number) => nodes[i].ins.reduce((m, p, k) => Math.min(m, intake[i][k] / p.a), INF);
  const accOf = (i: number) => nodes[i].outs.reduce((m, p, j) => Math.min(m, accOut[i][j] / p.b), INF);
  const xOf = (i: number) => {
    const nd = nodes[i];
    if (nd.outlet) return intake[i].reduce((s, v) => s + v, 0);
    return snap(Math.min(nd.U0, supOf(i), accOf(i)));
  };
  for (let i = 0; i < n; i++) x[i] = nodes[i].outlet ? 0 : nodes[i].U0;
  const snapshot = () => [...x, ...intake.flat(), ...accOut.flat()];
  let back2: number[] | null = null, back1: number[] | null = null;

  let iterations = 0, converged = false;
  while (iterations < MAX_ITER) {
    iterations++;
    // 1. Capacidade de cada entrada ligada: o máximo que o bloco consome com as outras entradas e as saídas de agora.
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      if (nd.outlet) continue;
      const acc = accOf(i);
      nd.ins.forEach((p, k) => {
        if (!p.links.length) return;
        let supEx = INF;
        nd.ins.forEach((q, m) => { if (m !== k) supEx = Math.min(supEx, intake[i][m] / q.a); });
        cap[i][k] = p.a * Math.min(nd.U0, supEx, acc);
      });
    }
    // 2. Fluxo dos links: fase 1 para consumidoras com limite, fase 2 o resto para as sem limite.
    const next = new Float64Array(edges.length);
    for (const g of groups) {
      const remP = g.prods.map(([a, j]) => (x[a] === INF ? INF : nodes[a].outs[j].b * x[a]));
      const remC = g.cons.map(([a, j]) => cap[a][j]);
      fill(g.ls.filter(l => remC[l.c] !== INF), remP, remC, next);
      fill(g.ls.filter(l => remC[l.c] === INF), remP, remC, next);
    }
    // 3. O que chega e o que escoa em cada porta ligada.
    for (let i = 0; i < n; i++) nodes[i].ins.forEach((p, k) => { if (p.links.length) intake[i][k] = p.links.reduce((s, e) => s + next[e], 0); });
    for (let i = 0; i < n; i++) nodes[i].outs.forEach((p, j) => {
      if (p.mode !== 'linked') return;
      let acc = 0;
      const seen = new Set<string>();
      for (const e of p.links) {
        acc += next[e];
        const E = edges[e], k = `${E.to}:${E.inp}`;
        if (!seen.has(k)) { seen.add(k); acc += cap[E.to][E.inp] === INF ? INF : cap[E.to][E.inp] - intake[E.to][E.inp]; }
      }
      accOut[i][j] = Math.max(0, acc);
    });
    // 4. Novo tamanho de cada bloco (com `damp` < 1, anda só uma fração do caminho; o ponto fixo é o mesmo).
    let stable = true;
    for (let i = 0; i < n; i++) {
      const v = xOf(i);
      if (!same(v, x[i])) stable = false;
      x[i] = damp < 1 && Number.isFinite(v) && Number.isFinite(x[i]) ? x[i] + damp * (v - x[i]) : v;
    }
    for (let e = 0; e < edges.length && stable; e++) if (!same(next[e], flow[e])) stable = false;
    flow = next;
    if (stable) { converged = true; break; }
    const now = snapshot();
    if (back2 && now.every((v, k) => v === back2![k])) break;
    back2 = back1; back1 = now;
  }
  return { x, intake, accOut, flow, converged, iterations, supOf, accOf };
}

export function solveFactory(f: Factory, d: GameData): FlowResult {
  const net = build(f, d), { nodes, edges } = net;
  // Passo inteiro primeiro (o resultado de sempre). Se não converge (duas produtoras dividindo consumidoras limitadas
  // podem pular entre dois pontos fixos, uma volta em cada), de novo com meio passo: amortece a oscilação.
  let st = iterate(net, 1), iterations = st.iterations;
  if (!st.converged) {
    const alt = iterate(net, 0.5);
    iterations += alt.iterations;
    if (alt.converged) st = alt;
  }
  const { x, intake, flow, converged, supOf, accOf } = st;

  // Resultado.
  const blocks: Record<StageId, BlockFlow> = {};
  const links: Record<string, number | null> = {};
  for (const l of f.links) links[l.id] = 0;
  edges.forEach((E, e) => { links[E.id] = fin(snap(flow[e])); });
  const delivered = (p: OutPort) => p.links.reduce((s, e) => s + flow[e], 0);
  const tops = nodes.map((nd, i) => Math.min(nd.U0, supOf(i)));
  // O que a produtora ainda daria nesta saída e não foi entregue (represado ou saindo livre).
  const spare = (i: number, j: number) => {
    const p = nodes[i].outs[j];
    return tops[i] === INF ? INF : Math.max(0, p.b * tops[i] - delivered(p));
  };
  nodes.forEach((nd, i) => {
    const b = nd.block, xi = x[i], acc = accOf(i), top = tops[i], want = Math.min(nd.U0, acc);
    const ins: PortFlow[] = nd.ins.map((p, k) => {
      // Falta só o que as produtoras ligadas não tinham para dar: a entrada que não está curta mostra 0.
      let avail = intake[i][k];
      const seen = new Set<string>();
      for (const e of p.links) {
        const E = edges[e], key = `${E.from}:${E.out}`;
        if (!seen.has(key)) { seen.add(key); avail += spare(E.from, E.out); }
      }
      const need = p.a * want;
      const deficit = nd.limited && Number.isFinite(need) ? tidy(Math.max(0, need - avail), need) : 0;
      return { item: p.item, rate: fin(snap(nd.outlet ? avail : p.a * xi)), deficit, held: 0, exits: 0 };
    });
    const outs: PortFlow[] = nd.outs.map(p => {
      const held = Number.isFinite(top) ? tidy(p.b * (top - xi), p.b * top) : 0;
      const exits = p.mode === 'free' ? fin(xi === INF ? INF : tidy(p.b * xi - delivered(p), p.b * xi)) : 0;
      return { item: p.item, rate: fin(snap(p.b * xi)), deficit: 0, held, exits };
    });
    const stalled = nd.outs.find(p => p.mode === 'stall')?.item ?? null;
    let machines: number | null = null, runClock: number | null = null, extractors: number | null = null;
    if (b.kind === 'recipe' && xi !== INF) {
      machines = b.limits?.machines ?? (xi === 0 ? 0 : ceilTol(xi * 100 / b.clock));
      runClock = machines ? 100 * xi / machines : 0;
    }
    if (b.kind === 'extractor') extractors = b.count ?? (xi === INF ? null : ceilTol(xi / nd.mult));
    blocks[b.id] = { id: b.id, x: fin(xi), machines, runClock, extractors, unbounded: xi === INF, stalled, ins, outs };
  });
  return { blocks, links, deadlock: deadlocks(nodes, edges, x), converged, iterations };
}

// Componentes fortemente conexos (Tarjan) com 2+ blocos e todos parados.
function deadlocks(nodes: Node[], edges: Edge[], x: Float64Array): StageId[][] {
  const adj = nodes.map(() => [] as number[]);
  for (const E of edges) adj[E.from].push(E.to);
  const index = new Array<number>(nodes.length).fill(-1), low = new Array<number>(nodes.length).fill(0);
  const on = new Array<boolean>(nodes.length).fill(false), stack: number[] = [], out: StageId[][] = [];
  let next = 0;
  const visit = (v: number) => {
    index[v] = low[v] = next++; stack.push(v); on[v] = true;
    for (const w of adj[v]) {
      if (index[w] < 0) { visit(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], index[w]);
    }
    if (low[v] !== index[v]) return;
    const scc: number[] = [];
    for (let w = -1; w !== v;) { w = stack.pop()!; on[w] = false; scc.push(w); }
    if (scc.length > 1 && scc.every(i => x[i] === 0)) out.push(scc.map(i => nodes[i].block.id).sort());
  };
  for (let v = 0; v < nodes.length; v++) if (index[v] < 0) visit(v);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// Fracamente conexas pelas ligações; ids ordenados, componentes pelo primeiro id.
export function components(f: Factory): StageId[][] {
  const parent = new Map<StageId, StageId>(f.blocks.map(b => [b.id, b.id]));
  const find = (a: StageId): StageId => { let r = a; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(a, r); return r; };
  for (const l of f.links) if (parent.has(l.from) && parent.has(l.to)) parent.set(find(l.from), find(l.to));
  const by = new Map<StageId, StageId[]>();
  for (const b of f.blocks) {
    const r = find(b.id), ids = by.get(r);
    if (ids) ids.push(b.id); else by.set(r, [b.id]);
  }
  return [...by.values()].map(ids => ids.sort()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// JSON com as chaves em ordem: a mesma fábrica dá a mesma chave, venha de onde vier.
const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
};

// Blocos e ligações do componente; mapa, ligs, alts e mapGap não mudam o fluxo.
export function componentKey(f: Factory, ids: StageId[]): string {
  const set = new Set(ids);
  const blocks = f.blocks.filter(b => set.has(b.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const links = f.links.filter(l => set.has(l.from)).sort((a, b) => (a.id < b.id ? -1 : 1));
  return stable({ blocks, links });
}

// Resolve componente por componente, reaproveitando o cache; o cache fica só com os componentes de agora.
export function solveCached(f: Factory, d: GameData, cache: Map<string, FlowResult>): { result: FlowResult; solved: number } {
  const result: FlowResult = { blocks: {}, links: {}, deadlock: [], converged: true, iterations: 0 };
  const used = new Set<string>();
  let solved = 0;
  for (const ids of components(f)) {
    const key = componentKey(f, ids);
    used.add(key);
    let r = cache.get(key);
    if (!r) {
      const set = new Set(ids);
      r = solveFactory({ v: 2, blocks: f.blocks.filter(b => set.has(b.id)), links: f.links.filter(l => set.has(l.from)) }, d);
      cache.set(key, r);
      solved++;
    }
    Object.assign(result.blocks, r.blocks); Object.assign(result.links, r.links);
    result.deadlock.push(...r.deadlock);
    result.converged &&= r.converged;
    result.iterations = Math.max(result.iterations, r.iterations);
  }
  for (const k of [...cache.keys()]) if (!used.has(k)) cache.delete(k);
  result.deadlock.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { result, solved };
}

// O solveCached sem exceção: um erro no cálculo vira fluxo vazio com `failed` (a página segue de pé e avisa).
export function solveSafe(f: Factory, d: GameData, cache: Map<string, FlowResult>): FlowResult {
  try { return solveCached(f, d, cache).result; } catch { return { blocks: {}, links: {}, deadlock: [], converged: true, iterations: 0, failed: true }; }
}
