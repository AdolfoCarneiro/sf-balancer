import type { MapPlace, Rot } from '../types.ts';
// Medidas em metros.
export const FOUNDATION = 8;
export const PIECE = 4;
export const BELT = 1;
export const PIECE_GAP = 2;   // vão padrão entre peças ligadas do meio (Chain.mapGap muda)
export const PIECE_GAP_MIN = 1, PIECE_GAP_MAX = 8;
export const validPieceGap = (g: unknown): g is number =>
  typeof g === 'number' && Number.isInteger(g) && g >= PIECE_GAP_MIN && g <= PIECE_GAP_MAX;
// O vão da cadeia, ou o padrão.
export const pieceGap = (chain: { mapGap?: number }): number => (validPieceGap(chain.mapGap) ? chain.mapGap : PIECE_GAP);
export const MEIO_GAP = 2;
export const SINK = { w: 16, l: 13 };
export const JUNCTION = 2;
export const VALVE = 2;
export const RAW_STUB = 8;

// Posição no mapa: x/y limitados a ±MAP_LIMIT m e presos na grade de 8 m.
export const MAP_LIMIT = 100000, MAP_GRID = 8, MAP_GAP_MAX = 64;
const snap = (v: number) => Math.round(v / MAP_GRID) * MAP_GRID + 0; // + 0 troca -0 por 0
const clampTo = (n: number, lim: number) => Math.min(lim, Math.max(-lim, n));
// Posição de mapa saneada: x/y limitados e presos na grade de 8 m; rot fora de 0..3 ou x/y inválidos = null.
export function cleanPlace(v: unknown): MapPlace | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const { x, y, rot } = v as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (rot !== 0 && rot !== 1 && rot !== 2 && rot !== 3) return null;
  const p: MapPlace = { x: snap(clampTo(x, MAP_LIMIT)), y: snap(clampTo(y, MAP_LIMIT)), rot: rot as Rot };
  for (const k of ['gapRow', 'gapMachine'] as const) {
    const g = (v as Record<string, unknown>)[k];
    if (typeof g === 'number' && Number.isFinite(g) && g >= 0 && g <= MAP_GAP_MAX) p[k] = g;
  }
  return p;
}
