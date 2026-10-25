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
