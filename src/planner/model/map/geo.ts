import type { ItemId, StageId } from '../types.ts';

export type Pt = [number, number];
export interface Rect { x: number; y: number; w: number; h: number }
export type PieceKind = 'machine' | 'splitter' | 'merger' | 'smart' | 'sink' | 'junction' | 'bp';
export interface Piece extends Rect { kind: PieceKind; label?: string }
export type BeltRole = 'main' | 'donor' | 'loop' | 'sink' | 'extra' | 'over' | 'in' | 'out' | 'raw';
export interface BeltPath { pts: Pt[]; item: ItemId; rate: number; role: BeltRole; fluid: boolean }
export interface Anchor { x: number; y: number; item: ItemId; row: number; stage?: StageId; extra?: boolean }  // extra: saída de linha extra do meio
export interface BlockGeo { w: number; h: number; pieces: Piece[]; belts: BeltPath[]; ins: Anchor[]; outs: Anchor[]; estimate: boolean }
export interface MeioGeo extends BlockGeo { floors: number; tooLarge: boolean }

export interface PieceCount { splitters: number; mergers: number; smart: number; sinks: number; junctions: number }
// As peças que o mapa desenha.
export function countPieces(geo: BlockGeo): PieceCount {
  const n: PieceCount = { splitters: 0, mergers: 0, smart: 0, sinks: 0, junctions: 0 };
  for (const p of geo.pieces) {
    if (p.kind === 'splitter') n.splitters++;
    else if (p.kind === 'merger') n.mergers++;
    else if (p.kind === 'smart') n.smart++;
    else if (p.kind === 'sink') n.sinks++;
    else if (p.kind === 'junction') n.junctions++;
  }
  return n;
}

// Tira pontos repetidos e intermediários colineares.
export function clean(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); }
  return out.filter((p, k) => {
    if (k === 0 || k === out.length - 1) return true;
    const q = out[k - 1], r = out[k + 1];
    return !((q[0] === p[0] && p[0] === r[0]) || (q[1] === p[1] && p[1] === r[1]));
  });
}

// O trecho reto a–b passa por dentro do retângulo? Encostar na borda não conta.
export function cutsRect(a: Pt, b: Pt, r: Rect): boolean {
  if (a[1] === b[1]) return r.y < a[1] && a[1] < r.y + r.h && Math.min(a[0], b[0]) < r.x + r.w && Math.max(a[0], b[0]) > r.x;
  return r.x < a[0] && a[0] < r.x + r.w && Math.min(a[1], b[1]) < r.y + r.h && Math.max(a[1], b[1]) > r.y;
}

// Caminho em ângulo reto, no máximo 2 curvas; sai de `a` no eixo dirA.
export function route(a: Pt, b: Pt, dirA: 'x' | 'y'): Pt[] {
  const i = dirA === 'x' ? 0 : 1, j = 1 - i;
  const mid = (a[i] + b[i]) / 2;
  const p1: Pt = [0, 0], p2: Pt = [0, 0];
  p1[i] = mid; p1[j] = a[j];
  p2[i] = mid; p2[j] = b[j];
  const out: Pt[] = [a];
  for (const p of [p1, p2, b]) {
    const l = out[out.length - 1];
    if (l[0] !== p[0] || l[1] !== p[1]) out.push(p);
  }
  // tira pontos intermediários colineares
  return out.filter((p, k) => {
    if (k === 0 || k === out.length - 1) return true;
    const q = out[k - 1], r = out[k + 1];
    return !((q[0] === p[0] && p[0] === r[0]) || (q[1] === p[1] && p[1] === r[1]));
  });
}
