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

interface Seg { belt: number; a: number; b: number; at: number }   // a..b ao longo do eixo; at = a outra coordenada

// Pontos onde um trecho horizontal de uma esteira cruza um vertical de outra, por dentro dos dois trechos.
// Encostar numa ponta (fim de esteira ou curva, como as esteiras de um meio que chegam juntas) não conta.
// Varredura em x: as horizontais abertas ficam ordenadas por y e cada vertical pega só as do seu intervalo. O custo
// depende do número de trechos e de cruzamentos, não do comprimento deles (coordenadas enormes não pesam).
// Saída em ordem de x, depois y.
export function crossings(belts: BeltPath[]): Pt[] {
  const hs: Seg[] = [], vs: Seg[] = [];
  belts.forEach((bl, k) => {
    for (let i = 1; i < bl.pts.length; i++) {
      const [x0, y0] = bl.pts[i - 1], [x1, y1] = bl.pts[i];
      if (y0 === y1 && x0 !== x1) hs.push({ belt: k, a: Math.min(x0, x1), b: Math.max(x0, x1), at: y0 });
      else if (x0 === x1 && y0 !== y1) vs.push({ belt: k, a: Math.min(y0, y1), b: Math.max(y0, y1), at: x0 });
    }
  });
  // Na mesma x: fecha as horizontais que terminam, consulta as verticais, abre as que começam (por dentro, estrito).
  type Ev = { x: number; kind: 0 | 1 | 2; s: Seg };
  const evs: Ev[] = [];
  for (const h of hs) evs.push({ x: h.a, kind: 2, s: h }, { x: h.b, kind: 0, s: h });
  for (const v of vs) evs.push({ x: v.at, kind: 1, s: v });
  evs.sort((p, q) => p.x - q.x || p.kind - q.kind);
  const open: Seg[] = [];   // ordenadas por y (at)
  // Primeira aberta com at > y (ou ≥ y, com orEq).
  const first = (y: number, orEq = false) => {
    let lo = 0, hi = open.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (open[m].at < y || (!orEq && open[m].at === y)) lo = m + 1; else hi = m; }
    return lo;
  };
  const out: Pt[] = [];
  for (const e of evs) {
    if (e.kind === 2) open.splice(first(e.s.at), 0, e.s);
    else if (e.kind === 0) open.splice(open.indexOf(e.s, first(e.s.at, true)), 1);
    else {
      const v = e.s;
      for (let i = first(v.a); i < open.length && open[i].at < v.b; i++) {
        if (open[i].belt !== v.belt && open[i].at > v.a) out.push([v.at, open[i].at]);
      }
    }
  }
  return out;
}
