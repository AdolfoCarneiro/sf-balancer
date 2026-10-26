// Arranjo das fileiras de um bloco: tipos, leitura segura do que vem salvo e o arranjo em si (arrange).
import type { BeltEdit, GameData, ItemId, Layout, LayoutExit, LayoutKind, MapPlace, RowEdit, Side, Stage } from './types.ts';
import { capOf, defaultTier, perMachine, perRowOf, stageArea, stageRows, suggestedPerRow, tierKey, tiersOf } from './stage.ts';
import { BELT, PIECE } from './map/sizes.ts';
import type { Anchor, BeltPath, BlockGeo, Piece, Pt } from './map/geo.ts';

export type { BeltEdit, Layout, LayoutExit, LayoutKind, RowEdit } from './types.ts';

const KINDS: readonly LayoutKind[] = ['simple', 'backToBack', 'center'];
const EXITS: readonly LayoutExit[] = ['end', 'down', 'up'];
const MAX_CUT = 1000, MAX_SHIFT = 800, MAX_ROW = 999, MAX_ENTRIES = 200;
const BELT_KEY = /^(in|out):[^@\s]+$/, JOIN = /^((?:in|out):[^@\s]+)@(\d{1,3})$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const shiftOk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v % 8 === 0 && Math.abs(v) <= MAX_SHIFT;

function cleanRow(v: unknown): RowEdit | null {
  if (!isObj(v)) return null;
  const e: RowEdit = {};
  if (v.flip === true) e.flip = true;
  if (v.mirror === true) e.mirror = true;
  if (shiftOk(v.dx) && v.dx !== 0) e.dx = v.dx;
  if (shiftOk(v.dy) && v.dy !== 0) e.dy = v.dy;
  return Object.keys(e).length ? e : null;
}

function cleanBelt(v: unknown): BeltEdit | null {
  if (!isObj(v)) return null;
  const e: BeltEdit = {};
  if (typeof v.cut === 'number' && Number.isInteger(v.cut) && v.cut >= 1 && v.cut <= MAX_CUT) e.cut = v.cut;
  if (typeof v.exit === 'string' && (EXITS as readonly string[]).includes(v.exit)) e.exit = v.exit as LayoutExit;
  if (v.even === true) e.even = true;
  return Object.keys(e).length ? e : null;
}

// null = inválido (cai em simple). Campos ruins somem sem derrubar o resto.
export function cleanLayout(v: unknown): Layout | null {
  if (!isObj(v) || typeof v.kind !== 'string' || !(KINDS as readonly string[]).includes(v.kind)) return null;
  const out: Layout = { kind: v.kind as LayoutKind };
  if (v.invert === true) out.invert = true;
  if (isObj(v.rows)) {
    const rows: Record<number, RowEdit> = {};
    for (const [k, e] of Object.entries(v.rows).slice(0, MAX_ENTRIES)) {
      const i = /^\d{1,3}$/.test(k) ? Number(k) : -1, row = cleanRow(e);
      if (i >= 0 && i <= MAX_ROW && row) rows[i] = row;
    }
    if (Object.keys(rows).length) out.rows = rows;
  }
  if (isObj(v.belts)) {
    const belts: Record<string, BeltEdit> = {};
    for (const [k, e] of Object.entries(v.belts).slice(0, MAX_ENTRIES)) {
      const belt = cleanBelt(e);
      if (BELT_KEY.test(k) && belt) belts[k] = belt;
    }
    if (Object.keys(belts).length) out.belts = belts;
  }
  if (Array.isArray(v.joins)) {
    const joins = [...new Set(v.joins.slice(0, MAX_ENTRIES).filter((j): j is string => typeof j === 'string' && JOIN.test(j)))];
    if (joins.length) out.joins = joins;
  }
  return out;
}

// ---- arrange ----

// x, y, w, h: a faixa da fileira (máquinas e as esteiras dela), coordenadas locais do bloco (m).
export interface ArrRow { index: number; machines: number; x: number; y: number; w: number; h: number; flip: boolean; mirror: boolean }
export interface ArrLine {                  // uma esteira/cano que entra ou sai do bloco
  side: 'in' | 'out'; item: ItemId; machines: number; rate: number;   // rate a 100 % do clock da etapa
  rows: number[];                          // fileiras que alimenta / que a alimentam
  exit: LayoutExit; at: Pt;                // ponto de entrada/saída, coordenadas locais do bloco (m)
  tier: string; cap: number; fluid: boolean;
}
export type LayoutWarning =
  | { kind: 'over'; side: 'in' | 'out'; item: ItemId; rate: number; cap: number; fixTier: string | null; fixCut: number }
  | { kind: 'merger3'; item: ItemId; key: string }       // juntar daria Merger com mais de 3 entradas (key: a junção)
  | { kind: 'centerEnd'; item: ItemId }                  // Mergers no meio saindo pela ponta
  | { kind: 'cutPipe'; item: ItemId }                    // corte pedido num cano (ignorado)
  | { kind: 'badJoin'; key: string };                    // junção que não vale mais (fileiras não coladas, fileira sumiu)
export interface Arrangement {
  kind: LayoutKind; rows: ArrRow[]; lines: ArrLine[];
  pieces: { splitters: number; mergers: number; lifts: number };
  area: { w: number; d: number };           // m, arredondado para cima em fundações de 8 m
  warnings: LayoutWarning[]; geo: BlockGeo;  // geo: o desenho da Planta (rot 0)
}

const E = 1e-9;
const floorE = (x: number) => Math.floor(x + E);
const ceil8 = (x: number) => Math.ceil(x / 8 - E) * 8;
const LIFT = 2;
const sideOf = (s: Side): 'in' | 'out' => (s === 'ins' ? 'in' : 'out');

// Fileiras do center, na ordem do modelo (cima, baixo de cada par): R = o menor par ≥ 2 em que
// ceil(M / R) × (maior entrada sólida por máquina) cabe na esteira dela; sem entrada sólida, a maior entrada.
// Máquinas o mais igual possível, a sobra primeiro nas de cima, depois nas de baixo.
function centerCounts(stage: Stage, data: GameData): number[] {
  const M = stage.machines;
  if (!(M > 0)) return [];
  const r = data.recipes[stage.recipe];
  const solid = r.ins.filter(f => !data.items[f.item].fluid);
  const need = Math.max(0, ...(solid.length ? solid : r.ins).map(f => {
    const it = data.items[f.item];
    return perMachine(stage, data, f.item, 'ins') / capOf(it, stage.tiers[tierKey('ins', f.item)] ?? defaultTier(it));
  }));
  let R = 2;
  while (Math.ceil(M / R - E) > 1 && Math.ceil(M / R - E) * need > 1 + E) R += 2;
  const base = Math.floor(M / R + E), out: number[] = Array(R).fill(base);
  const order = Array.from({ length: R }, (_, k) => (k < R / 2 ? 2 * k : 2 * (k - R / 2) + 1));
  for (let k = 0; k < M - base * R - E; k++) out[order[k]]++;
  return out;
}

export function recommendedPerRow(stage: Stage, data: GameData, kind: LayoutKind): number {
  return kind === 'center' ? Math.max(1, ...centerCounts(stage, data)) : suggestedPerRow(stage, data);
}

// Máquinas de cada fileira do modelo do bloco (sem montar o desenho); no center pode vir fileira com 0.
const modelRows = (stage: Stage, data: GameData, kind: LayoutKind): number[] =>
  (stage.machines > 0 ? (kind === 'center' ? centerCounts(stage, data) : stageRows(stage, data)) : []);

// Quantas fileiras e até quantas máquinas por fileira, para os textos do mapa. Barato: sem montar o desenho.
export function rowsSummary(stage: Stage, data: GameData): { rows: number; per: number } {
  const kind = stage.layout?.kind ?? 'simple', rows = modelRows(stage, data, kind).filter(n => n > 0);
  return { rows: rows.length, per: kind === 'center' ? Math.max(0, ...rows) : perRowOf(stage, data) };
}

// Máquinas de cada linha do lado/item, na ordem das fileiras.
export function arrangementLines(a: Arrangement, side: 'in' | 'out', item: ItemId): number[] {
  return a.lines.filter(l => l.side === side && l.item === item).map(l => l.machines);
}

// Máquinas de cada trecho de uma esteira de n máquinas cortada a cada `cut` (sem corte: um trecho só). even ("Dividir
// igual"): o mesmo número de trechos, de floor(n / S) ou uma a mais, os maiores primeiro.
function cutSizes(n: number, cut: number | undefined, even: boolean): number[] {
  if (!cut || cut >= n) return [n];
  const S = Math.ceil(n / cut - E);
  if (!even) return Array.from({ length: S }, (_, k) => Math.min(cut, n - k * cut));
  const q = Math.floor(n / S + E), r = n - q * S;
  return Array.from({ length: S }, (_, k) => q + (k < r - E ? 1 : 0));
}

// Trechos da esteira de uma fileira: o corte só vale saindo por baixo/cima e nunca em cano.
function segments(n: number, cut: number | undefined, even: boolean): { start: number; count: number }[] {
  let start = 0;
  return cutSizes(n, cut, even).map(count => { const sg = { start, count }; start += count; return sg; });
}

// Linha compartilhada: as máquinas contam coluna a coluna (sizes: máquinas de cada coluna, na ordem do fluxo),
// de cima para baixo, fechando cada trecho com as máquinas dele (segSizes). Cada coluna de um trecho: a partir de qual
// máquina (from) e quantas (k).
interface SharedSeg { machines: number; cols: { ci: number; from: number; k: number }[] }
function sharedSegments(sizes: number[], segSizes: number[]): SharedSeg[] {
  const segs: SharedSeg[] = [];
  let cur: SharedSeg = { machines: 0, cols: [] };
  sizes.forEach((size, ci) => {
    for (let j = 0; j < size; j++) {
      if (cur.machines >= segSizes[segs.length] && segs.length < segSizes.length - 1) { segs.push(cur); cur = { machines: 0, cols: [] }; }
      const last = cur.cols[cur.cols.length - 1];
      if (last?.ci === ci) last.k++; else cur.cols.push({ ci, from: j, k: 1 });
      cur.machines++;
    }
  });
  if (cur.machines) segs.push(cur);
  return segs;
}
// Colunas com peça: um Merger (Splitter) por coluna, menos a ponta que fica com uma máquina só (k−1):
// na saída, a primeira coluna (a máquina inicia a esteira); na entrada, a última (a esteira termina nela).
const pieceCols = (sg: SharedSeg, side: Side) => {
  const free = side === 'ins' ? sg.cols.length - 1 : 0;
  return sg.cols.filter((c, k) => k !== free || c.k > 1);
};

interface RowPlan { index: number; n: number; flip: boolean; mirror: boolean; bx: number; dx: number; dy: number; gapAfter: boolean; pairStart: boolean }
interface Shared { key: string; side: Side; item: ItemId; top: RowPlan; bot: RowPlan }

export function arrange(stage: Stage, data: GameData, layout: Layout | undefined, place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>): Arrangement {
  const kind: LayoutKind = layout?.kind ?? 'simple';
  const center = kind === 'center', invert = !!layout?.invert;
  const gapRow = place?.gapRow ?? 0, gapMachine = place?.gapMachine ?? 0;
  const recipe = data.recipes[stage.recipe];
  const b = data.buildings[recipe.building];
  const fluidOf = (item: ItemId) => data.items[item].fluid;
  const estimate = [...recipe.ins, ...recipe.outs].some(f => fluidOf(f.item));
  const counts = modelRows(stage, data, kind);
  const pitch = b.w + gapMachine;
  const rowW = (n: number) => n * b.w + Math.max(0, n - 1) * gapMachine;
  const W = counts.reduce((m, n) => Math.max(m, rowW(n)), 0);
  const ports = [...recipe.ins.map(f => ({ side: 'ins' as Side, item: f.item })), ...recipe.outs.map(f => ({ side: 'outs' as Side, item: f.item }))];
  const flows = (side: Side) => (side === 'ins' ? recipe.ins : recipe.outs).map(f => f.item);
  const pm = (side: Side, item: ItemId) => perMachine(stage, data, item, side);

  // center: a principal sólida do corredor (saída; com invert, entrada) vira uma linha compartilhada por par.
  const sharedSide: Side = invert ? 'ins' : 'outs';
  const sharedItem = center ? (sharedSide === 'ins' ? recipe.ins : recipe.outs).find(f => !fluidOf(f.item))?.item : undefined;
  const sharedKey = sharedItem ? tierKey(sharedSide, sharedItem) : null;
  const chosenCap = (side: Side, item: ItemId) => capOf(data.items[item], stage.tiers[tierKey(side, item)] ?? defaultTier(data.items[item]));
  const centerCut = sharedItem ? Math.max(1, floorE(chosenCap(sharedSide, sharedItem) / pm(sharedSide, sharedItem))) : 1;

  // Tier de cada porta: o escolhido, ou o menor a partir do padrão que cabe a maior linha do modelo sem ajustes
  // (fileira inteira; no center, o trecho padrão da compartilhada). Simples sem ajustes = portTier.
  const maxN = counts.reduce((m, n) => Math.max(m, n), 0);
  const maxPair = counts.reduce((m, n, i) => (i % 2 ? Math.max(m, counts[i - 1] + n) : Math.max(m, n)), 0);
  const tierOf = (side: Side, item: ItemId): string => {
    const it = data.items[item], chosen = stage.tiers[tierKey(side, item)];
    if (chosen) return chosen;
    const rate = (tierKey(side, item) === sharedKey ? Math.min(centerCut, maxPair) : maxN) * pm(side, item);
    const list = tiersOf(it), cands = list.slice(Math.max(0, list.findIndex(t => t.id === defaultTier(it))));
    return (cands.find(t => t.cap >= rate - E) ?? cands[cands.length - 1]).id;
  };

  const warnings: LayoutWarning[] = [];
  // Ajustes por esteira: saída, corte e "Dividir igual" valendo para esta receita (cano: só pela ponta).
  const beltOf = new Map<string, { exit: LayoutExit; cut?: number; even?: boolean }>();
  for (const p of ports) {
    const key = tierKey(p.side, p.item), e = layout?.belts?.[key];
    if (fluidOf(p.item)) {
      if (e?.cut !== undefined) warnings.push({ kind: 'cutPipe', item: p.item });
      beltOf.set(key, { exit: 'end' });
    } else if (key === sharedKey) {
      const exit = e?.exit ?? 'down';
      if (exit === 'end') warnings.push({ kind: 'centerEnd', item: p.item });
      beltOf.set(key, exit === 'end' ? { exit } : { exit, cut: e?.cut ?? centerCut, even: !!e?.even });
    } else {
      const exit = e?.exit ?? 'end';
      beltOf.set(key, exit === 'end' ? { exit } : { exit, cut: e?.cut, even: !!e?.even });
    }
  }

  // Fileiras do modelo. simple: empilhadas. backToBack: pares, a de baixo virada. center: faixas de até 2 pares (como o
  // 2×2 do dono), o da esquerda alimentado pela esquerda e o da direita espelhado (pela direita), as faixas empilhadas;
  // toda entrada fica numa borda de fora. Vão entre pares e entre faixas = gapRow, no mínimo o do elevador.
  const pairGap = Math.max(PIECE, gapRow), pairs = Math.ceil(counts.length / 2);
  const plans: RowPlan[] = [];
  counts.forEach((n, i) => {
    if (n <= 0) return;
    const e: RowEdit = layout?.rows?.[i] ?? {};
    const pairFlip = i % 2 === 1 ? !invert : invert;
    const model = kind === 'backToBack' ? { flip: pairFlip && (i % 2 === 1 || i + 1 < counts.length), gapAfter: i % 2 === 1 }
      : center ? { flip: pairFlip, gapAfter: false } : { flip: false, gapAfter: true };
    const p = Math.floor(i / 2), right = center && pairs > 1 && p % 2 === 1;
    plans.push({
      index: i, n, flip: model.flip !== !!e.flip, mirror: right !== !!e.mirror,
      bx: right ? W + pairGap : 0, dx: e.dx ?? 0, dy: e.dy ?? 0, gapAfter: model.gapAfter, pairStart: center && i % 2 === 0,
    });
  });
  const planOf = new Map(plans.map(rp => [rp.index, rp]));

  // Junções: a esteira do item da fileira r (embaixo dela) e a da r+1 (em cima dela), sem deslocamento, viram uma só.
  const shared = new Map<string, Shared>(), skip = new Set<string>();
  const parse = (key: string) => {
    const side: Side = key.startsWith('in:') ? 'ins' : 'outs', item = key.slice(key.indexOf(':') + 1);
    return flows(side).includes(item) && !fluidOf(item) ? { side, item } : null;
  };
  const joinable = (key: string, r: number): Shared | null => {
    const f = parse(key), top = planOf.get(r), bot = planOf.get(r + 1);
    if (!f || !top || !bot || top.dx || top.dy || bot.dx || bot.dy) return null;
    if (center && r % 2 === 1) return null;   // no center só o par divide o corredor
    const faces = f.side === 'outs' ? !top.flip && bot.flip : top.flip && !bot.flip;
    return faces ? { key, ...f, top, bot } : null;
  };
  const accept = (g: Shared) => { shared.set(`${g.top.index}|${g.key}`, g); skip.add(`${g.bot.index}|${g.key}`); };
  if (sharedKey) {
    for (const rp of plans) {
      if (!rp.pairStart || !planOf.has(rp.index + 1)) continue;
      const g = joinable(sharedKey, rp.index);
      if (g) accept(g); else warnings.push({ kind: 'badJoin', key: `${sharedKey}@${rp.index}` });
    }
  }
  // Por fileira, para a cadeia @r−1 → @r se ver já decidida.
  const rowOf = (j: string) => Number(j.slice(j.lastIndexOf('@') + 1));
  for (const j of [...layout?.joins ?? []].sort((u, v) => rowOf(u) - rowOf(v))) {
    const at = j.lastIndexOf('@'), key = j.slice(0, at), r = rowOf(j);
    if (center) {
      if (!(key === sharedKey && shared.has(`${r}|${key}`))) warnings.push({ kind: 'badJoin', key: j });
      continue;
    }
    const f = parse(key);
    if (f && planOf.has(r + 1) && skip.has(`${r}|${key}`)) {
      warnings.push({ kind: 'merger3', item: f.item, key: j });   // a r já divide com a r−1: 3 fileiras numa linha
      continue;
    }
    const g = joinable(key, r);
    if (g) accept(g); else warnings.push({ kind: 'badJoin', key: j });
  }

  // Faixa do center com dois pares: a linha compartilhada atravessa os dois (uma esteira só no corredor, da ponta da
  // esquerda à da direita, passando pelo vão) quando isso dá menos saídas que fechar cada par. Precisa do corredor na
  // mesma altura nos dois pares (a faixa de peças só existe com mais de 1 máquina na fileira).
  const cross = new Map<number, Shared>(), crossed = new Set<number>();   // fileira de cima do par esquerdo → o direito
  const sharedBelt = sharedKey ? beltOf.get(sharedKey) : undefined;
  if (center && sharedKey && sharedBelt?.cut) {
    const cut = sharedBelt.cut;
    for (let r = 0; r < counts.length; r += 4) {
      const gl = shared.get(`${r}|${sharedKey}`), gr = shared.get(`${r + 2}|${sharedKey}`);
      if (!gl || !gr || (gl.top.n > 1) !== (gr.top.n > 1)) continue;
      const nl = gl.top.n + gl.bot.n, nr = gr.top.n + gr.bot.n;
      if (Math.ceil((nl + nr) / cut - E) < Math.ceil(nl / cut - E) + Math.ceil(nr / cut - E)) { cross.set(r, gr); crossed.add(r + 2); }
    }
  }

  const pieces: Piece[] = [], belts: BeltPath[] = [], ins: Anchor[] = [], outs: Anchor[] = [];
  const rows: ArrRow[] = [], lines: ArrLine[] = [];
  const count = { splitters: 0, mergers: 0, lifts: 0 };
  let shifted = false, y = 0, maxBottom = -Infinity, bandTop = 0, bandBottom = 0;
  const machX = (rp: RowPlan, m: number) => (rp.mirror ? W - m * pitch - b.w : m * pitch) + rp.bx + rp.dx;
  const lift = (a: Pt, exit: LayoutExit, item: ItemId) => {
    count.lifts++;
    pieces.push({ kind: 'lift', x: a[0] - LIFT / 2, y: a[1] - LIFT / 2, w: LIFT, h: LIFT, item, ...(exit === 'up' ? { above: true } : {}) });
  };

  // A linha compartilhada de um par (ou de dois, atravessando a faixa da esquerda para a direita), numa faixa de
  // Mergers (Splitters) em ly.
  const drawShared = (gs: Shared[], ly: number) => {
    const { side, item, top } = gs[0], s = sideOf(side), cy = ly + PIECE / 2, p = pm(side, item);
    const { exit, cut, even } = beltOf.get(gs[0].key)!;
    const tier = tierOf(side, item), cap = capOf(data.items[item], tier);
    const dir = gs.length === 1 && top.mirror ? -1 : 1;
    const byX = new Map<number, number[]>();
    for (const rp of gs.flatMap(g => [g.top, g.bot])) {
      for (let m = 0; m < rp.n; m++) {
        const x = machX(rp, m);
        byX.set(x, [...(byX.get(x) ?? []), rp.index]);
      }
    }
    const cols = [...byX].sort((u, v) => (u[0] - v[0]) * dir).map(([x, rs]) => ({ x, rows: rs }));
    const ends = (ci: number) => (dir > 0 ? [cols[ci].x, cols[ci].x + b.w] : [cols[ci].x + b.w, cols[ci].x]);
    const mid = (ci: number) => cols[ci].x + b.w / 2;
    const rowStart = top.bx + (dir > 0 ? 0 : W), rowEnd = top.bx + (dir > 0 ? W : 0);
    const sizes = cols.map(c => c.rows.length), total = sizes.reduce((u, v) => u + v, 0);
    const segs = sharedSegments(sizes, cutSizes(total, exit === 'end' ? undefined : cut, !!even));
    const perCol = new Map<number, number>();
    for (const sg of segs) {
      const first = sg.cols[0], last = sg.cols[sg.cols.length - 1];
      // Corte no meio da coluna: o elevador anda uma peça ao longo da esteira, para fora da peça da coluna (depois dela
      // na saída, antes dela na entrada), e a esteira vai até ele.
      const xs = exit === 'end' ? rowStart : first.from > 0 ? mid(first.ci) - (side === 'ins' ? dir * PIECE : 0) : ends(first.ci)[0];
      const xe = exit === 'end' ? rowEnd : last.from + last.k < cols[last.ci].rows.length ? mid(last.ci) + (side === 'outs' ? dir * PIECE : 0) : ends(last.ci)[1];
      const a: Pt = side === 'ins' ? [xs, cy] : [xe, cy];
      const rate = p * sg.machines;
      const segRows = [...new Set(sg.cols.flatMap(c => cols[c.ci].rows.slice(c.from, c.from + c.k)))].sort((u, v) => u - v);
      belts.push({ pts: [[xs, cy], [xe, cy]], item, rate, role: s, fluid: false });
      (side === 'ins' ? ins : outs).push({ x: a[0], y: a[1], item, row: segRows[0], stage: stage.id, ...(exit !== 'end' ? { exit } : {}) });
      lines.push({ side: s, item, machines: sg.machines, rate, rows: segRows, exit, at: a, tier, cap, fluid: false });
      const withPiece = pieceCols(sg, side);
      count[side === 'ins' ? 'splitters' : 'mergers'] += withPiece.length;
      for (const c of withPiece) perCol.set(c.ci, (perCol.get(c.ci) ?? 0) + 1);
      if (exit !== 'end') lift(a, exit, item);
    }
    // Coluna cortada no meio leva duas peças, uma de cada trecho, lado a lado.
    for (const [ci, k] of perCol) {
      for (let j = 0; j < k; j++) {
        const cx = mid(ci) + dir * (j - (k - 1) / 2) * PIECE;
        pieces.push({ kind: side === 'ins' ? 'splitter' : 'merger', x: cx - PIECE / 2, y: ly, w: PIECE, h: PIECE });
      }
    }
  };

  for (const rp of plans) {
    const { index: row, n, flip, mirror, bx, dx, dy } = rp;
    if (dx || dy) shifted = true;
    if (rp.pairStart) {
      const p = rp.index / 2;
      if (p % 2 === 0) bandTop = p === 0 ? 0 : bandBottom + pairGap;   // faixa nova embaixo da anterior
      y = bandTop;
    }
    const top = y + dy;
    // Coordenadas da fileira (largura W, entrada à esquerda) para o bloco: espelho e deslocamento.
    const tx = (x: number) => (mirror ? W - x : x) + bx + dx;
    const pt = (x: number, py: number): Pt => [tx(x), py];
    const strip = (fluid: boolean) => (!fluid && n > 1 ? PIECE : BELT);
    const end = rowW(n);
    const arow: ArrRow = { index: row, machines: n, x: bx + dx, y: top, w: W, h: 0, flip, mirror };
    rows.push(arow);
    let ly = top;
    const lane = (side: Side, item: ItemId) => {
      const key = tierKey(side, item), fluid = fluidOf(item);
      if (skip.has(`${row}|${key}`)) return;
      const g = shared.get(`${row}|${key}`);
      if (g) {
        if (!crossed.has(row)) drawShared(cross.has(row) ? [g, cross.get(row)!] : [g], ly);
        ly += PIECE; return;
      }
      const h = strip(fluid), cy = ly + h / 2, s = sideOf(side), p = pm(side, item);
      const { exit, cut, even } = beltOf.get(key)!;
      const tier = tierOf(side, item), cap = capOf(data.items[item], tier);
      for (const sg of segments(n, cut, !!even)) {
        let a: Pt, pts: Pt[];
        if (exit === 'end') {
          a = side === 'ins' ? pt(0, cy) : pt(W, cy);
          pts = [pt(0, cy), side === 'ins' ? pt(end, cy) : pt(W, cy)];
        } else {
          const xs = sg.start * pitch, xe = xs + rowW(sg.count);
          a = side === 'ins' ? pt(xs, cy) : pt(xe, cy);
          pts = [pt(xs, cy), pt(xe, cy)];
        }
        const rate = p * sg.count;
        belts.push({ pts, item, rate, role: s, fluid });
        (side === 'ins' ? ins : outs).push({ x: a[0], y: a[1], item, row, stage: stage.id, ...(exit !== 'end' ? { exit } : {}) });
        lines.push({ side: s, item, machines: sg.count, rate, rows: [row], exit, at: a, tier, cap, fluid });
        if (!fluid) count[side === 'ins' ? 'splitters' : 'mergers'] += Math.max(0, sg.count - 1);
        if (exit !== 'end') lift(a, exit, item);
      }
      if (h === PIECE) {
        for (let m = 0; m < n; m++) {
          const x = m * pitch + (b.w - PIECE) / 2;
          pieces.push({ kind: side === 'ins' ? 'splitter' : 'merger', x: tx(mirror ? x + PIECE : x), y: ly, w: PIECE, h: PIECE });
        }
      }
      ly += h;
    };
    // Faixas de um lado, de cima para baixo; a esteira compartilhada vai para a ponta de fora (colada na outra fileira).
    const sideItems = (side: Side, onTop: boolean) => {
      const items = flip ? flows(side).reverse() : flows(side);
      const sh = items.find(it => shared.has(`${row}|${tierKey(side, it)}`) || skip.has(`${row}|${tierKey(side, it)}`));
      if (!sh) return items;
      const rest = items.filter(it => it !== sh);
      return onTop ? [sh, ...rest] : [...rest, sh];
    };
    const order: Side[] = flip ? ['outs', 'ins'] : ['ins', 'outs'];
    for (const item of sideItems(order[0], true)) lane(order[0], item);
    for (let m = 0; m < n; m++) pieces.push({ kind: 'machine', x: machX(rp, m), y: ly, w: b.w, h: b.l });
    ly += b.l;
    for (const item of sideItems(order[1], false)) lane(order[1], item);
    arow.h = ly - top;
    maxBottom = Math.max(maxBottom, ly);
    y = ly - dy;
    bandBottom = Math.max(bandBottom, y);
    if (rp.gapAfter) y += gapRow;
  }

  // Onde a esteira do mapa encontra cada linha (Gate). Elevador: na borda do lado padrão (a linha passa por baixo ou
  // por cima das máquinas), as linhas do mesmo corredor espalhadas ao longo da borda na ordem delas. Fileira
  // espelhada: pela borda do outro lado, para fora dela. Ponta no vão entre os pares do center: pelo vão (a metade do
  // lado da fileira) até a borda de cima ou de baixo, a mais perto.
  function gates(minX: number) {
    const rowById = new Map(rows.map(r => [r.index, r]));
    const gapL = W - minX, gapR = W + pairGap - minX, gap = center && pairs > 1 && !shifted;
    for (const side of ['ins', 'outs'] as const) {
      const list = side === 'ins' ? ins : outs, ls = lines.filter(l => l.side === sideOf(side));
      const out = side === 'ins' ? -1 : 1, edge = side === 'ins' ? 0 : w;
      const lifts = new Map<string, { a: Anchor; l: ArrLine }[]>();
      list.forEach((a, k) => {
        if (a.exit) {
          const key = `${a.item}|${a.y}`;
          lifts.set(key, [...(lifts.get(key) ?? []), { a, l: ls[k] }]);
          return;
        }
        const face = rowById.get(a.row)?.mirror ? -out : out;
        if (Math.abs(a.x - (face < 0 ? 0 : w)) < 1e-6) {
          if (face !== out) a.gate = { at: [a.x, a.y], dir: [face, 0] };
        } else if (gap && a.x > gapL - 1e-6 && a.x < gapR + 1e-6) {
          const cx = (gapL + gapR) / 2 - face * (gapR - gapL) / 4, ey = a.y < h / 2 ? 0 : h;
          a.gate = { at: [cx, ey], dir: [0, ey === 0 ? -1 : 1], path: [[a.x, a.y], [cx, a.y], [cx, ey]] };
        } else a.gate = { at: [a.x, a.y], dir: [face, 0] };
      });
      for (const g of lifts.values()) {
        const rs = g.flatMap(x => x.l.rows).map(i => rowById.get(i)).filter((r): r is ArrRow => !!r);
        const top = Math.min(...rs.map(r => r.y)), bottom = Math.max(...rs.map(r => r.y + r.h)), n = g.length;
        const stepY = Math.min(2, (bottom - top) / n), cy = g[0].a.y;
        const y0 = Math.max(top + stepY / 2, Math.min(bottom - stepY / 2 - (n - 1) * stepY, cy - (n - 1) / 2 * stepY));
        g.forEach(({ a }, k) => { a.gate = { at: [edge, y0 + k * stepY], dir: [out, 0] }; });
      }
    }
  }

  // Ajustes podem levar fileiras para x/y negativos: o bloco recomeça no canto (0, 0).
  const minX = rows.reduce((m, r) => Math.min(m, r.x), Infinity), minY = rows.reduce((m, r) => Math.min(m, r.y), Infinity);
  const w = rows.length ? rows.reduce((m, r) => Math.max(m, r.x + W), -Infinity) - minX : 0;
  const h = rows.length ? maxBottom - minY : 0;
  if (rows.length && (minX !== 0 || minY !== 0)) {
    for (const r of rows) { r.x -= minX; r.y -= minY; }
    for (const p of pieces) { p.x -= minX; p.y -= minY; }
    for (const bp of belts) bp.pts = bp.pts.map(([x, py]) => [x - minX, py - minY]);
    for (const a of [...ins, ...outs]) { a.x -= minX; a.y -= minY; }
    for (const l of lines) l.at = [l.at[0] - minX, l.at[1] - minY];
  }

  gates(minX);

  for (const p of ports) {
    const s = sideOf(p.side), ls = lines.filter(l => l.side === s && l.item === p.item);
    const rate = ls.reduce((m, l) => Math.max(m, l.rate), 0);
    if (!ls.length || rate <= ls[0].cap + E) continue;
    const cap = ls[0].cap;
    warnings.push({
      kind: 'over', side: s, item: p.item, rate, cap,
      fixTier: tiersOf(data.items[p.item]).find(t => t.cap >= rate - E)?.id ?? null, fixCut: Math.max(1, floorE(cap / pm(p.side, p.item))),
    });
  }

  // Simples sem deslocar fileiras: a área de hoje (estimativa com folga para as esteiras); senão, o que o desenho ocupa.
  const drawn = { w: ceil8(w), d: ceil8(h) };
  const today = rows.length && kind === 'simple' ? stageArea(stage, data) : null;
  const area = !rows.length ? { w: 0, d: 0 }
    : today && !shifted ? today
      : today ? { w: Math.max(today.w, drawn.w), d: Math.max(today.d, drawn.d) } : drawn;

  return { kind, rows, lines, pieces: count, area, warnings, geo: { w, h, pieces, belts, ins, outs, estimate } };
}

// Peças da etapa pelo arranjo do bloco: Splitters, Mergers (k−1 por linha) e Conveyor Lifts.
export const stagePieces = (stage: Stage, data: GameData): Arrangement['pieces'] => arrange(stage, data, stage.layout).pieces;
