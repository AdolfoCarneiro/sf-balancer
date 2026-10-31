// A área da seleção na Planta, ajustável: nasce do que os blocos selecionados ocupam e a pessoa a arrasta ou puxa pelas
// bordas e cantos para ver quanto terreno vai precisar no jogo. Sempre na grade de 8 m. Puro.
import type { Rect } from './geo.ts';
import { FOUNDATION } from './sizes.ts';

// Onde o ponteiro pegou a área: um canto, uma borda ou o meio (move).
export type AreaGrip = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

// Folga, em px de tela, para pegar uma borda ou um canto.
export const AREA_GRIP_PX = 8;

// O que está sob o ponto (sx, sy) no retângulo r, os dois em px de tela; fora (além da folga): null. Os cantos ganham
// das bordas e as bordas ganham do meio.
export function areaGrip(r: Rect, sx: number, sy: number, tol = AREA_GRIP_PX): AreaGrip | null {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  if (sx < x0 - tol || sx > x1 + tol || sy < y0 - tol || sy > y1 + tol) return null;
  const w = Math.abs(sx - x0) <= tol, e = Math.abs(sx - x1) <= tol, n = Math.abs(sy - y0) <= tol, s = Math.abs(sy - y1) <= tol;
  const v = n ? 'n' : s ? 's' : '', h = w ? 'w' : e ? 'e' : '';
  if (v || h) return (v + h) as AreaGrip;
  return 'move';
}

const snap = (v: number) => Math.round(v / FOUNDATION) * FOUNDATION + 0;

// A área depois de puxar a pega por (dx, dy) metros desde r (o retângulo do começo do arraste): bordas na grade, no
// mínimo uma fundação de cada lado; mover leva o canto para a grade e mantém o tamanho.
export function dragArea(r: Rect, grip: AreaGrip, dx: number, dy: number): Rect {
  if (grip === 'move') return { x: snap(r.x + dx), y: snap(r.y + dy), w: r.w, h: r.h };
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  if (grip.includes('w')) x0 = Math.min(snap(x0 + dx), x1 - FOUNDATION);
  if (grip.includes('e')) x1 = Math.max(snap(x1 + dx), x0 + FOUNDATION);
  if (grip.includes('n')) y0 = Math.min(snap(y0 + dy), y1 - FOUNDATION);
  if (grip.includes('s')) y1 = Math.max(snap(y1 + dy), y0 + FOUNDATION);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Cursor do CSS para cada pega.
export const AREA_CURSOR: Record<AreaGrip, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move',
};
