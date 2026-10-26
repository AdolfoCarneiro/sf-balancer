// O que a miniatura das fileiras (RowsPreview.tsx) mostra, sem React: o arranjo do bloco, as peças juntadas quando são
// muitas, a caixa do desenho e os textos (modelo, saídas, por onde saem).
import { t } from '../../i18n/index.js';
import { arrange, type Arrangement } from '../model/layout.ts';
import type { GameData, LayoutExit, LayoutKind, MapPlace, Stage } from '../model/types.ts';
import type { BlockGeo, Piece, Rect } from '../model/map/geo.ts';
import { rateText } from './format.ts';

// Acima disso as peças de uma mesma faixa viram um retângulo só (na miniatura elas têm menos de 1 px).
const MAX_PIECES = 1500;

// As fileiras do bloco como na Planta: o arranjo dele (sem arranjo, a fileira simples).
export const rowsArrangement = (stage: Stage, data: GameData, place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>): Arrangement =>
  arrange(stage, data, stage.layout, place);

// Peças demais: junta as do mesmo tipo na mesma faixa (mesmo y e altura) num retângulo de ponta a ponta.
export function previewPieces(pieces: Piece[]): Piece[] {
  if (pieces.length <= MAX_PIECES) return pieces;
  const bands = new Map<string, Piece>();
  for (const p of pieces) {
    const k = `${p.kind}|${p.y}|${p.h}`, b = bands.get(k);
    if (!b) bands.set(k, { kind: p.kind, x: p.x, y: p.y, w: p.w, h: p.h });
    else { const x1 = Math.max(b.x + b.w, p.x + p.w); b.x = Math.min(b.x, p.x); b.w = x1 - b.x; }
  }
  return [...bands.values()];
}

// Caixa do desenho: o bloco e as peças que passam da borda (o Conveyor Lift de uma entrada fica em x = -1).
export function previewBox(geo: BlockGeo): Rect {
  let x0 = 0, y0 = 0, x1 = geo.w, y1 = geo.h;
  for (const p of geo.pieces) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const MODEL: Record<LayoutKind, string> = { simple: 'plRowsModelSimple', backToBack: 'plRowsModelBackToBack', center: 'plRowsModelCenter' };
const EXIT: Record<LayoutExit, string> = { end: 'plRowsExitEnd', down: 'plRowsExitDown', up: 'plRowsExitUp' };

export const rowsModelText = (a: Arrangement): string => t(MODEL[a.kind]);

// As linhas da saída principal: "6 saídas de 455/min", "3 saídas de 455/min, a última de 390/min" ou, com tamanhos
// misturados, "Saídas: 4 × 455/min, 2 × 390/min".
export function rowsLinesText(a: Arrangement, stage: Stage, data: GameData): string {
  const main = data.recipes[stage.recipe].outs[0];
  const lines = main ? a.lines.filter(l => l.side === 'out' && l.item === main.item) : [];
  if (!lines.length) return '';
  const it = data.items[main.item], n = String(lines.length), rate = (x: number) => rateText(it, x);
  const first = lines[0].rate, last = lines[lines.length - 1].rate, same = (x: number) => Math.abs(x - first) < 1e-9;
  if (lines.every(l => same(l.rate))) return t('plRowsLines', n, rate(first));
  if (lines.slice(0, -1).every(l => same(l.rate))) return t('plRowsLinesLast', n, rate(first), rate(last));
  const bySize = new Map<number, number>();
  for (const l of lines) bySize.set(l.rate, (bySize.get(l.rate) ?? 0) + 1);
  return t('plRowsLinesMix', [...bySize].map(([r, k]) => `${k} × ${rate(r)}`).join(', '));
}

// Por onde sai a saída principal: pela ponta, desce ou sobe (Conveyor Lift).
export function rowsExitText(a: Arrangement, stage: Stage, data: GameData): string {
  const main = data.recipes[stage.recipe].outs[0];
  const line = main && a.lines.find(l => l.side === 'out' && l.item === main.item);
  return line ? t(EXIT[line.exit]) : '';
}
