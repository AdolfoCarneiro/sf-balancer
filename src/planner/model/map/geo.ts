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
