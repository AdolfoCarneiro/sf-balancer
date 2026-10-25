// O meio de uma ligação em metros: as peças do flowNet na grade do flowLayout, a sobra num sink só e o fluido estimado.
import { flowNet } from '../../../logic/flownet.js';
import { flowLayout } from '../../../logic/flowlayout.js';
import { designFloors } from '../../../logic/layout3d.js';
import { lineOwner, type Meio, type Plan, type PlanLine } from '../meio.ts';
import type { Item } from '../types.ts';
import { JUNCTION, PIECE, PIECE_GAP, SINK } from './sizes.ts';
import { route, type Anchor, type BeltPath, type BeltRole, type MeioGeo, type Piece, type PieceKind, type Pt } from './geo.ts';

// O que o meio lê da alternativa completa do computePlan (o tipo `Plan` exportado é o lite).
interface LineRef { id: number }
interface FullAlt {
  key: string;
  headers?: { inputs: LineRef[]; members: LineRef[] }[];
  view: { bal?: { design: { kind: string } }; headers?: { inEdges: number[]; outEdges: number[] }[] };
  sim: { flow: number[] };
}
interface NetNode { id: number; t: string; line?: LineRef }
interface NetBelt { id: number; a: number; b: number; rate: number; role: BeltRole }
interface Net { nodes: NetNode[]; belts: NetBelt[] }
interface Layout { cols: number; nodes: Map<number, { col: number; row: number }>; belts: Map<number, { from: string; to: string }> }

const CELL = PIECE + PIECE_GAP;
const E = 1e-9;
const KIND: Record<string, PieceKind> = { s: 'splitter', m: 'merger', ov: 'smart', bp: 'bp' };

// Tira pontos repetidos e intermediários colineares.
function clean(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); }
  return out.filter((p, k) => {
    if (k === 0 || k === out.length - 1) return true;
    const q = out[k - 1], r = out[k + 1];
    return !((q[0] === p[0] && p[0] === r[0]) || (q[1] === p[1] && p[1] === r[1]));
  });
}

// Ponta de esteira: o ponto e o eixo em que ela sai (ou entra) na peça.
interface End { p: Pt; dir: 'x' | 'y' }
// Ângulo reto entre duas pontas: mesmo eixo pelo route (até 2 curvas); eixos diferentes em L (1 curva).
function path(a: End, b: End): Pt[] {
  if (a.dir === b.dir) return route(a.p, b.p, a.dir);
  return clean(a.dir === 'x' ? [a.p, [b.p[0], a.p[1]], b.p] : [a.p, [a.p[0], b.p[1]], b.p]);
}

export function meioGeo(meio: Meio, plan: Plan, altKey: string, item: Item): MeioGeo {
  const fluid = item.fluid;
  const owner = (side: 'src' | 'dst', id: number) => lineOwner(meio, side, (side === 'src' ? plan.src : plan.dst).lines[id] as PlanLine);
  if (plan.tooLarge) {
    const w = 16, h = 8;
    return {
      w, h, pieces: [], belts: [], estimate: fluid, floors: 1, tooLarge: true,
      ins: meio.producers.map(stage => ({ x: 0, y: h / 2, item: item.id, row: 0, stage })),
      outs: meio.consumers.map(stage => ({ x: w, y: h / 2, item: item.id, row: 0, stage })),
    };
  }
  const alts = plan.alternatives as unknown as FullAlt[];
  const a = alts.find(x => x.key === altKey) ?? alts[0];
  const design = a.view.bal?.design;
  const floors = design?.kind === 'butterfly-loop' ? (designFloors(design as never) as { floors: number } | null)?.floors ?? 1 : 1;
  const geo = a.headers ? headerGeo(a, plan, item, owner) : netGeo(a, plan.cap, item, owner);
  return { ...geo, floors, tooLarge: false };
}

type Owner = (side: 'src' | 'dst', id: number) => string;
type Geo = Omit<MeioGeo, 'floors' | 'tooLarge'>;

// Depois de montar: desloca tudo para y ≥ 0 e mede a altura.
function finish(w: number, pieces: Piece[], belts: BeltPath[], ins: Anchor[], outs: Anchor[], estimate: boolean): Geo {
  const ys = [...pieces.map(p => p.y), ...belts.flatMap(b => b.pts.map(p => p[1])), ...[...ins, ...outs].map(q => q.y - PIECE / 2)];
  const dy = Math.min(0, ...ys);
  if (dy < 0) {
    pieces.forEach(p => { p.y -= dy; });
    belts.forEach(b => { b.pts = b.pts.map(([x, y]) => [x, y - dy] as Pt); });
    [...ins, ...outs].forEach(q => { q.y -= dy; });
  }
  const h = Math.max(0, ...pieces.map(p => p.y + p.h), ...belts.flatMap(b => b.pts.map(p => p[1])), ...[...ins, ...outs].map(q => q.y + PIECE / 2));
  return { w, h, pieces, belts, ins, outs, estimate };
}

// Peças do flowNet na grade do flowLayout: coluna c em x = c · 6, linha r em y = r · 6 (a menor linha em 0).
function netGeo(a: FullAlt, cap: number, item: Item, owner: Owner): Geo {
  const net = flowNet(a as never) as Net;
  const lay = flowLayout(net as never) as Layout;
  const fluid = item.fluid;
  const { nodes, belts } = net;
  const isEnd = (t: string) => t === 'sink' || t === 'extra';
  // Linhas fracionárias arredondadas: peças de uma coluna ficam a ≥ 1 linha uma da outra, e round(r + 1) = round(r) + 1.
  const rowOf = (id: number) => Math.round(lay.nodes.get(id)!.row);
  const colOf = (id: number) => lay.nodes.get(id)!.col;
  const grid = nodes.filter(q => !isEnd(q.t));
  const minRow = Math.min(...grid.map(q => rowOf(q.id)));
  let maxRow = Math.max(...grid.map(q => rowOf(q.id)));
  const yOf = (r: number) => (r - minRow) * CELL;
  const extras = nodes.filter(q => q.t === 'extra');
  const extraRow = new Map(extras.map((q, k) => [q.id, maxRow + 1 + k]));
  maxRow += extras.length;
  const gridBottom = yOf(maxRow) + PIECE;
  let w = (lay.cols - 1) * CELL;

  const pieces: Piece[] = [], out: BeltPath[] = [], ins: Anchor[] = [], outs: Anchor[] = [];
  const rect = new Map<number, Piece>();
  for (const q of nodes) {
    const kind = KIND[q.t];
    if (!kind) continue;
    const p: Piece = { kind, x: colOf(q.id) * CELL, y: yOf(rowOf(q.id)), w: PIECE, h: PIECE, ...(kind === 'bp' ? { label: 'Blueprint' } : {}) };
    pieces.push(p);
    rect.set(q.id, p);
  }

  // Sobra num sink só: as esteiras de sobra em k grupos (k = esteiras cheias), cada grupo numa cascata de Mergers
  // (3 entradas; cada seguinte pega o anterior e mais 2) e num Awesome Sink, numa faixa abaixo da grade.
  const sinkBelts = belts.filter(b => nodes[b.b].t === 'sink');
  const total = sinkBelts.reduce((s, b) => s + b.rate, 0);
  const k = sinkBelts.length ? Math.max(1, Math.ceil(total / cap - E)) : 0;
  const groups = Array.from({ length: k }, () => ({ load: 0, belts: [] as NetBelt[] }));
  [...sinkBelts].sort((x, y) => y.rate - x.rate || x.id - y.id).forEach(b => {
    const g = groups.reduce((m, x) => (x.load < m.load ? x : m));
    g.belts.push(b);
    g.load += b.rate;
  });
  const bandY = gridBottom + PIECE_GAP;
  let cursor = CELL;
  const band = groups.map(g => {
    g.belts.sort((x, y) => colOf(x.a) - colOf(y.a) || rowOf(x.a) - rowOf(y.a));
    const n = g.belts.length, mc = n > 1 ? Math.ceil((n - 1) / 2) : 0;
    const ms = Array.from({ length: mc }, (_, j) => ({ kind: 'merger' as const, x: cursor + j * CELL, y: bandY + (SINK.l - PIECE) / 2, w: PIECE, h: PIECE }));
    const sink: Piece = { kind: 'sink', x: cursor + mc * CELL, y: bandY, w: SINK.w, h: SINK.l };
    pieces.push(...ms, sink);
    cursor = sink.x + sink.w + PIECE_GAP;
    return { ...g, ms, sink };
  });
  if (band.length) w = Math.max(w, cursor - PIECE_GAP);

  // Pontas: origem em x = 0, destino e linha extra em x = w; peças pelos lados do flowLayout
  // (na tela a esquerda da peça é para cima e a direita para baixo).
  const anchorAt = new Map<number, Anchor>();
  for (const q of nodes) {
    if (q.t === 'src') ins.push(anchorAt.set(q.id, { x: 0, y: yOf(rowOf(q.id)) + PIECE / 2, item: item.id, row: q.line!.id, stage: owner('src', q.line!.id) }).get(q.id)!);
    else if (q.t === 'dst') outs.push(anchorAt.set(q.id, { x: w, y: yOf(rowOf(q.id)) + PIECE / 2, item: item.id, row: q.line!.id, stage: owner('dst', q.line!.id) }).get(q.id)!);
    else if (q.t === 'extra') {
      const row = extras.indexOf(q);
      outs.push(anchorAt.set(q.id, { x: w, y: yOf(extraRow.get(q.id)!) + PIECE / 2, item: item.id, row, extra: true }).get(q.id)!);
    }
  }
  const sideOf = (r: Piece, s: string, exit: boolean): End => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (s === 'left') return { p: [cx, r.y], dir: 'y' };
    if (s === 'right') return { p: [cx, r.y + r.h], dir: 'y' };
    return { p: [exit ? r.x + r.w : r.x, cy], dir: 'x' };
  };
  const tailOf = (b: NetBelt): End => {
    const r = rect.get(b.a);
    if (r) return sideOf(r, lay.belts.get(b.id)!.from, true);
    const q = anchorAt.get(b.a)!;
    return { p: [q.x, q.y], dir: 'x' };
  };
  const headOf = (b: NetBelt): End => {
    const r = rect.get(b.b);
    if (r) return sideOf(r, lay.belts.get(b.id)!.to, false);
    const q = anchorAt.get(b.b)!;
    return { p: [q.x, q.y], dir: 'x' };
  };
  const push = (pts: Pt[], rate: number, role: BeltRole) => out.push({ pts, item: item.id, rate, role, fluid });

  // Loops por cima da grade, uma faixa por loop, do topo da peça de saída ao topo da de entrada.
  let loops = 0;
  for (const b of belts) {
    if (nodes[b.b].t === 'sink') continue;
    if (b.role === 'loop') {
      const ra = rect.get(b.a)!, rb = rect.get(b.b)!, ly = -PIECE_GAP * ++loops;
      const ax = ra.x + ra.w / 2, bx = rb.x + rb.w / 2;
      push(clean([[ax, ra.y], [ax, ly], [bx, ly], [bx, rb.y]]), b.rate, 'loop');
      continue;
    }
    push(path(tailOf(b), headOf(b)), b.rate, b.role);
  }
  for (const g of band) {
    const { ms, sink } = g;
    const sinkIn: End = { p: [sink.x, sink.y + sink.h / 2], dir: 'x' };
    if (!ms.length) { const b = g.belts[0]; push(path(tailOf(b), sinkIn), b.rate, 'sink'); continue; }
    g.belts.forEach((b, i) => {
      const m = ms[i < 3 ? 0 : Math.floor((i - 1) / 2)];
      push(path(tailOf(b), { p: [m.x + m.w / 2, m.y], dir: 'y' }), b.rate, 'sink');
    });
    ms.forEach((m, j) => {
      const acc = g.belts.slice(0, 3 + 2 * j).reduce((s, b) => s + b.rate, 0);
      const to: End = j + 1 < ms.length ? { p: [ms[j + 1].x, ms[j + 1].y + PIECE / 2], dir: 'x' } : sinkIn;
      push(path({ p: [m.x + m.w, m.y + PIECE / 2], dir: 'x' }, to), acc, 'sink');
    });
  }
  return finish(w, pieces, out, ins, outs, fluid);
}

// Fluido com cano coletor: uma Pipeline Junction por coletor, cano de cada origem até ela e dela a cada destino.
function headerGeo(a: FullAlt, plan: Plan, item: Item, owner: Owner): Geo {
  const headers = a.headers!, flow = a.sim.flow, hv = a.view.headers ?? [];
  const nSrc = plan.src.lines.length, nDst = plan.dst.lines.length;
  const yOf = (r: number) => r * CELL + PIECE / 2, w = 2 * CELL;
  const ins: Anchor[] = Array.from({ length: nSrc }, (_, i) => ({ x: 0, y: yOf(i), item: item.id, row: i, stage: owner('src', i) }));
  const outs: Anchor[] = Array.from({ length: nDst }, (_, j) => ({ x: w, y: yOf(j), item: item.id, row: j, stage: owner('dst', j) }));
  const pieces: Piece[] = [], belts: BeltPath[] = [];
  let free = -Infinity;
  headers.forEach((h, hi) => {
    const ys = [...h.inputs.map(l => ins[l.id].y), ...h.members.map(l => outs[l.id].y)];
    const y = Math.max(ys.reduce((s, v) => s + v, 0) / ys.length - JUNCTION / 2, free);
    const jn: Piece = { kind: 'junction', x: CELL + (PIECE - JUNCTION) / 2, y, w: JUNCTION, h: JUNCTION };
    pieces.push(jn);
    free = y + JUNCTION + PIECE_GAP;
    const cy = y + JUNCTION / 2;
    const rate = (edges: number[] | undefined, k: number) => (edges ? flow[edges[k]] ?? 0 : 0);
    h.inputs.forEach((l, k) => belts.push({ pts: route([0, ins[l.id].y], [jn.x, cy], 'x'), item: item.id, rate: rate(hv[hi]?.inEdges, k), role: 'main', fluid: true }));
    h.members.forEach((l, k) => belts.push({ pts: route([jn.x + jn.w, cy], [w, outs[l.id].y], 'x'), item: item.id, rate: rate(hv[hi]?.outEdges, k), role: 'main', fluid: true }));
  });
  return finish(w, pieces, belts, ins, outs, true);
}
