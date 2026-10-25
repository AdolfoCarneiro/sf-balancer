// Avisos do mapa: retângulos sobrepostos e esteiras que se cruzam. A ferramenta avisa; quem resolve é o jogador.
import type { BeltPath, Pt, Rect } from './geo.ts';

// Interseção de área > 0 (encostar não conta).
export const intersects = (a: Rect, b: Rect): boolean =>
  a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Pares com interseção de área > 0 (encostar não conta), varrendo em x para não comparar todos com todos.
export function overlaps(rects: { id: string; rect: Rect }[]): [string, string][] {
  const order = rects.map((_, i) => i).sort((a, b) => rects[a].rect.x - rects[b].rect.x);
  const out: [number, number][] = [];
  for (let i = 0; i < order.length; i++) {
    const a = rects[order[i]].rect;
    for (let j = i + 1; j < order.length; j++) {
      const b = rects[order[j]].rect;
      if (b.x >= a.x + a.w) break;
      if (intersects(a, b)) {
        out.push(order[i] < order[j] ? [order[i], order[j]] : [order[j], order[i]]);
      }
    }
  }
  return out.sort((p, q) => p[0] - q[0] || p[1] - q[1]).map(([i, j]) => [rects[i].id, rects[j].id]);
}

const CELL = 64;
interface Seg { belt: number; a: number; b: number; at: number }   // a..b ao longo do eixo; at = a outra coordenada

// Pontos onde um trecho horizontal de uma esteira cruza um vertical de outra, por dentro dos dois trechos.
// Encostar numa ponta (fim de esteira ou curva, como as esteiras de um meio que chegam juntas) não conta.
// Trechos verticais indexados numa grade de 64 m: cada horizontal só olha as células por onde passa.
export function crossings(belts: BeltPath[]): Pt[] {
  const hs: Seg[] = [], vs: Seg[] = [];
  belts.forEach((bl, k) => {
    for (let i = 1; i < bl.pts.length; i++) {
      const [x0, y0] = bl.pts[i - 1], [x1, y1] = bl.pts[i];
      if (y0 === y1 && x0 !== x1) hs.push({ belt: k, a: Math.min(x0, x1), b: Math.max(x0, x1), at: y0 });
      else if (x0 === x1 && y0 !== y1) vs.push({ belt: k, a: Math.min(y0, y1), b: Math.max(y0, y1), at: x0 });
    }
  });
  const cell = (v: number) => Math.floor(v / CELL);
  const grid = new Map<string, Seg[]>();
  for (const s of vs) {
    for (let cy = cell(s.a); cy <= cell(s.b); cy++) {
      const key = `${cell(s.at)},${cy}`;
      const l = grid.get(key);
      if (l) l.push(s); else grid.set(key, [s]);
    }
  }
  const out: Pt[] = [];
  for (const h of hs) {
    const cy = cell(h.at);
    for (let cx = cell(h.a); cx <= cell(h.b); cx++) {
      for (const v of grid.get(`${cx},${cy}`) ?? []) {
        if (v.belt !== h.belt && h.a < v.at && v.at < h.b && v.a < h.at && h.at < v.b) out.push([v.at, h.at]);
      }
    }
  }
  return out;
}
