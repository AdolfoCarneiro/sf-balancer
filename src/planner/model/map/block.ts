import type { GameData, Stage, MapPlace } from '../types.ts';
import { perMachine, perRowOf, stageRows } from '../stage.ts';
import { BELT, PIECE } from './sizes.ts';
import type { Anchor, BeltPath, BlockGeo, Piece } from './geo.ts';

// Bloco da etapa em coordenadas locais (rot 0: entradas em x = 0, saídas em x = w).
export function blockGeo(stage: Stage, data: GameData, place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>): BlockGeo {
  const gapRow = place?.gapRow ?? 0, gapMachine = place?.gapMachine ?? 0;
  const recipe = data.recipes[stage.recipe];
  const b = data.buildings[recipe.building];
  const rows = stageRows(stage, data);
  const solidStrip = perRowOf(stage, data) > 1;
  const estimate = [...recipe.ins, ...recipe.outs].some(f => data.items[f.item].fluid);
  const rowW = (n: number) => n * b.w + Math.max(0, n - 1) * gapMachine;
  const w = rows.reduce((m, n) => Math.max(m, rowW(n)), 0);

  const pieces: Piece[] = [], belts: BeltPath[] = [], ins: Anchor[] = [], outs: Anchor[] = [];
  let y = 0;
  rows.forEach((n, row) => {
    const end = rowW(n);
    const strip = (fluid: boolean) => (!fluid && solidStrip && n > 1 ? PIECE : BELT);
    const lane = (side: 'ins' | 'outs', item: string, h: number) => {
      const fluid = data.items[item].fluid;
      const cy = y + h / 2;
      const rate = perMachine(stage, data, item, side) * n;
      belts.push({ pts: [[0, cy], [side === 'ins' ? end : w, cy]], item, rate, role: side === 'ins' ? 'in' : 'out', fluid });
      (side === 'ins' ? ins : outs).push({ x: side === 'ins' ? 0 : w, y: cy, item, row, stage: stage.id });
      if (h === PIECE) {
        for (let m = 0; m < n; m++) {
          pieces.push({ kind: side === 'ins' ? 'splitter' : 'merger', x: m * (b.w + gapMachine) + (b.w - PIECE) / 2, y, w: PIECE, h: PIECE });
        }
      }
    };
    for (const f of recipe.ins) { const h = strip(data.items[f.item].fluid); lane('ins', f.item, h); y += h; }
    for (let m = 0; m < n; m++) pieces.push({ kind: 'machine', x: m * (b.w + gapMachine), y, w: b.w, h: b.l });
    y += b.l;
    for (const f of recipe.outs) { const h = strip(data.items[f.item].fluid); lane('outs', f.item, h); y += h; }
    y += gapRow;
  });
  const h = rows.length ? y - gapRow : 0;
  return { w, h, pieces, belts, ins, outs, estimate };
}
