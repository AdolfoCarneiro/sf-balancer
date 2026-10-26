// Arranjo das fileiras de um bloco: tipos, leitura segura do que vem salvo e o arranjo em si (arrange).
import type { BeltEdit, GameData, ItemId, Layout, LayoutExit, LayoutKind, MapPlace, RowEdit, Side, Stage } from './types.ts';
import { capOf, perMachine, perRowOf, portTier, stageArea, stageRows, suggestedPerRow, tierKey, tiersOf } from './stage.ts';
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

export interface ArrRow { index: number; machines: number; x: number; y: number; flip: boolean; mirror: boolean }
export interface ArrLine {                  // uma esteira/cano que entra ou sai do bloco
  side: 'in' | 'out'; item: ItemId; machines: number; rate: number;   // rate a 100 % do clock da etapa
  rows: number[];                          // fileiras que alimenta / que a alimentam
  exit: LayoutExit; at: Pt;                // ponto de entrada/saída, coordenadas locais do bloco (m)
  tier: string; cap: number; fluid: boolean;
}
export type LayoutWarning =
  | { kind: 'over'; side: 'in' | 'out'; item: ItemId; rate: number; cap: number; fixTier: string | null; fixCut: number }
  | { kind: 'merger3'; item: ItemId }                    // juntar daria Merger com mais de 3 entradas
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

export function recommendedPerRow(stage: Stage, data: GameData, _kind: LayoutKind): number {
  return suggestedPerRow(stage, data);   // center: Task 3
}

// Máquinas de cada linha do lado/item, na ordem das fileiras.
export function arrangementLines(a: Arrangement, side: 'in' | 'out', item: ItemId): number[] {
  return a.lines.filter(l => l.side === side && l.item === item).map(l => l.machines);
}

// Lado de cada fileira no modelo: true = virada (saídas em cima). gap: vão depois da fileira.
// center (Task 3) ainda cai no simple.
function modelRows(kind: LayoutKind, count: number, invert: boolean): { flip: boolean; gapAfter: boolean }[] {
  return Array.from({ length: count }, (_, i) => kind === 'backToBack'
    ? { flip: i % 2 === 1 ? !invert : invert && i + 1 < count, gapAfter: i % 2 === 1 }
    : { flip: false, gapAfter: true });
}

// Trechos da esteira de uma fileira: o corte só vale saindo por baixo/cima e nunca em cano.
function segments(n: number, cut: number | undefined): { start: number; count: number }[] {
  if (!cut || cut >= n) return [{ start: 0, count: n }];
  const out = [];
  for (let s = 0; s < n - E; s += cut) out.push({ start: s, count: Math.min(cut, n - s) });
  return out;
}

export function arrange(stage: Stage, data: GameData, layout: Layout | undefined, place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>): Arrangement {
  const asked = layout?.kind ?? 'simple';
  const kind: LayoutKind = asked === 'center' ? 'simple' : asked;   // center: Task 3
  const gapRow = place?.gapRow ?? 0, gapMachine = place?.gapMachine ?? 0;
  const recipe = data.recipes[stage.recipe];
  const b = data.buildings[recipe.building];
  const fluidOf = (item: ItemId) => data.items[item].fluid;
  const estimate = [...recipe.ins, ...recipe.outs].some(f => fluidOf(f.item));
  const counts = stage.machines > 0 ? stageRows(stage, data) : [];
  const solidStrip = perRowOf(stage, data) > 1;
  const pitch = b.w + gapMachine;
  const rowW = (n: number) => n * b.w + Math.max(0, n - 1) * gapMachine;
  const W = counts.reduce((m, n) => Math.max(m, rowW(n)), 0);
  const ports = [...recipe.ins.map(f => ({ side: 'ins' as Side, item: f.item })), ...recipe.outs.map(f => ({ side: 'outs' as Side, item: f.item }))];

  const warnings: LayoutWarning[] = [];
  // Ajustes por esteira: saída e corte valendo para esta receita.
  const beltOf = new Map<string, { exit: LayoutExit; cut?: number }>();
  for (const p of ports) {
    const e = layout?.belts?.[tierKey(p.side, p.item)];
    if (fluidOf(p.item)) {
      if (e?.cut !== undefined) warnings.push({ kind: 'cutPipe', item: p.item });
      beltOf.set(tierKey(p.side, p.item), { exit: 'end' });
    } else {
      const exit = e?.exit ?? 'end';
      beltOf.set(tierKey(p.side, p.item), exit === 'end' ? { exit } : { exit, cut: e?.cut });
    }
  }

  const pieces: Piece[] = [], belts: BeltPath[] = [], ins: Anchor[] = [], outs: Anchor[] = [];
  const rows: ArrRow[] = [], lines: ArrLine[] = [];
  const count = { splitters: 0, mergers: 0, lifts: 0 };
  let shifted = false, y = 0, maxBottom = -Infinity;
  const model = modelRows(kind, counts.length, !!layout?.invert);

  counts.forEach((n, row) => {
    const e: RowEdit = layout?.rows?.[row] ?? {};
    const flip = model[row].flip !== !!e.flip, mirror = !!e.mirror;
    const dx = e.dx ?? 0, dy = e.dy ?? 0;
    if (dx || dy) shifted = true;
    const top = y + dy;
    // Coordenadas da fileira (largura W, entrada à esquerda) para o bloco: espelho e deslocamento.
    const tx = (x: number) => (mirror ? W - x : x) + dx;
    const pt = (x: number, py: number): Pt => [tx(x), py];
    const strip = (fluid: boolean) => (!fluid && solidStrip && n > 1 ? PIECE : BELT);
    const end = rowW(n);
    rows.push({ index: row, machines: n, x: dx, y: top, flip, mirror });
    let ly = top;
    const lane = (side: Side, item: ItemId, h: number) => {
      const fluid = fluidOf(item), cy = ly + h / 2, s = sideOf(side), pm = perMachine(stage, data, item, side);
      const { exit, cut } = beltOf.get(tierKey(side, item))!;
      const tier = portTier(stage, data, item, side), cap = capOf(data.items[item], tier);
      // Linha compartilhada (center, joins) entra aqui na Task 3; por enquanto, uma linha por trecho da fileira.
      for (const sg of segments(n, cut)) {
        let a: Pt, pts: Pt[];
        if (exit === 'end') {
          a = side === 'ins' ? pt(0, cy) : pt(W, cy);
          pts = [pt(0, cy), side === 'ins' ? pt(end, cy) : pt(W, cy)];
        } else {
          const xs = sg.start * pitch, xe = xs + rowW(sg.count);
          a = side === 'ins' ? pt(xs, cy) : pt(xe, cy);
          pts = [pt(xs, cy), pt(xe, cy)];
        }
        const rate = pm * sg.count;
        belts.push({ pts, item, rate, role: s, fluid });
        (side === 'ins' ? ins : outs).push({ x: a[0], y: a[1], item, row, stage: stage.id });
        lines.push({ side: s, item, machines: sg.count, rate, rows: [row], exit, at: a, tier, cap, fluid });
        if (!fluid) count[side === 'ins' ? 'splitters' : 'mergers'] += Math.max(0, sg.count - 1);
        if (exit !== 'end') {
          count.lifts++;
          pieces.push({ kind: 'lift', x: a[0] - LIFT / 2, y: a[1] - LIFT / 2, w: LIFT, h: LIFT, ...(exit === 'up' ? { above: true } : {}) });
        }
      }
      if (h === PIECE) {
        for (let m = 0; m < n; m++) {
          const x = m * pitch + (b.w - PIECE) / 2;
          pieces.push({ kind: side === 'ins' ? 'splitter' : 'merger', x: mirror ? W - x - PIECE + dx : x + dx, y: ly, w: PIECE, h: PIECE });
        }
      }
      ly += h;
    };
    const flows = (side: Side) => (side === 'ins' ? recipe.ins : recipe.outs).map(f => f.item);
    const order: Side[] = flip ? ['outs', 'ins'] : ['ins', 'outs'];
    for (const item of flip ? flows(order[0]).reverse() : flows(order[0])) lane(order[0], item, strip(fluidOf(item)));
    for (let m = 0; m < n; m++) {
      const x = m * pitch;
      pieces.push({ kind: 'machine', x: mirror ? W - x - b.w + dx : x + dx, y: ly, w: b.w, h: b.l });
    }
    ly += b.l;
    for (const item of flip ? flows(order[1]).reverse() : flows(order[1])) lane(order[1], item, strip(fluidOf(item)));
    maxBottom = Math.max(maxBottom, ly);
    y = ly - dy;
    if (model[row].gapAfter) y += gapRow;
  });

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

  for (const p of ports) {
    const s = sideOf(p.side), ls = lines.filter(l => l.side === s && l.item === p.item);
    const rate = ls.reduce((m, l) => Math.max(m, l.rate), 0);
    if (!ls.length || rate <= ls[0].cap + E) continue;
    const cap = ls[0].cap, pm = perMachine(stage, data, p.item, p.side);
    warnings.push({
      kind: 'over', side: s, item: p.item, rate, cap,
      fixTier: tiersOf(data.items[p.item]).find(t => t.cap >= rate - E)?.id ?? null, fixCut: Math.max(1, floorE(cap / pm)),
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
