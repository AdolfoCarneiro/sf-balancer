// Esteiras do mapa. Planta: as esteiras em escala (em metros, com a cor do item).
import { visible, type Camera } from '../../model/map/camera.ts';
import type { BeltPath, Pt, Rect } from '../../model/map/geo.ts';
import { BELT } from '../../model/map/sizes.ts';
import type { MapTheme } from './theme.ts';

// Caixa de uma esteira (para saber se ela aparece na tela).
export const boxOf = (pts: Pt[]): Rect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0 - BELT, y: y0 - BELT, w: x1 - x0 + 2 * BELT, h: y1 - y0 + 2 * BELT };
};

export interface WorldCtx { ctx: CanvasRenderingContext2D; cam: Camera; vw: number; vh: number; th: MapTheme; colors: Record<string, string> }

// Esteiras em escala (o contexto já em metros). cull: pula as que não aparecem.
export function strokeBelts(w: WorldCtx, belts: BeltPath[], cull: boolean): void {
  const { ctx, cam, vw, vh, th, colors } = w, px = (n: number) => n / cam.zoom;
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  for (const b of belts) {
    if (b.pts.length < 2 || (cull && !visible(boxOf(b.pts), cam, vw, vh))) continue;
    ctx.beginPath();
    ctx.moveTo(b.pts[0][0], b.pts[0][1]);
    for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
    ctx.strokeStyle = b.role === 'sink' ? th.sink : colors[b.item] ?? th.flow;
    ctx.lineWidth = Math.max(BELT, px(1.5));
    ctx.setLineDash(b.fluid ? [px(6), px(4)] : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ---- Montar: esteiras em px de tela, da porta ao chip e do chip à porta ----

export type BeltLook = { color: string; fluid: boolean; short: boolean; selected: boolean; temp?: boolean };

// Curva cúbica de a (saindo na direção da) até b (chegando na direção db), como o beltPath do protótipo: as alças
// medem metade da distância no eixo da porta, no mínimo 30 px.
export function beltCurve(a: Pt, da: Pt, b: Pt, db: Pt): Path2D {
  const k = Math.max(30, Math.abs(da[0] !== 0 ? b[0] - a[0] : b[1] - a[1]) * 0.5);
  const p = new Path2D();
  p.moveTo(a[0], a[1]);
  p.bezierCurveTo(a[0] + da[0] * k, a[1] + da[1] * k, b[0] - db[0] * k, b[1] - db[1] * k, b[0], b[1]);
  return p;
}
// Caixa (com folga) de uma curva, pelas pontas e alças, para pular a que não aparece.
export const curveBox = (a: Pt, b: Pt): Rect => {
  const pad = 40 + Math.abs(b[0] - a[0]) * 0.5;
  return { x: Math.min(a[0], b[0]) - pad, y: Math.min(a[1], b[1]) - pad, w: Math.abs(b[0] - a[0]) + 2 * pad, h: Math.abs(b[1] - a[1]) + 2 * pad };
};

// Três traços: casca escura (12 px), borda na cor do item (10 px) e o tracejado claro (3 px) andando com o tempo.
// Fluido: sem casca, o tracejado azul do cano. Com falta na ponta de lá: coral.
export function strokeBelt(ctx: CanvasRenderingContext2D, path: Path2D, look: BeltLook, time: number, th: MapTheme): void {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const a = ctx.globalAlpha;
  if (look.fluid) {
    ctx.strokeStyle = look.selected ? th.ficsit : '#1f4f78'; ctx.lineWidth = look.selected ? 12 : 9; ctx.stroke(path);
    ctx.strokeStyle = look.short ? th.deficit : th.holo; ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -time / 40; ctx.stroke(path);
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    return;
  }
  ctx.strokeStyle = look.selected ? th.ficsit : th.beltCase; ctx.lineWidth = look.selected ? 16 : 12;
  if (look.temp) ctx.globalAlpha = a * 0.8;
  ctx.stroke(path);
  ctx.globalAlpha = a * (look.short || look.temp ? 1 : 0.55);
  ctx.strokeStyle = look.short ? th.deficit : look.temp ? th.lineHi : look.color; ctx.lineWidth = 10; ctx.lineCap = 'butt';
  ctx.stroke(path);
  ctx.globalAlpha = a;
  ctx.strokeStyle = look.temp ? th.ficsit : look.short ? th.deficitInk : th.ink; ctx.lineWidth = 3;
  ctx.setLineDash([5, 7]); ctx.lineDashOffset = -time / 40;
  ctx.stroke(path);
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

// Leques da Planta: de cada porta até cada fileira daquele item (o manifold), finos e na cor do item.
export function drawFans(ctx: CanvasRenderingContext2D, ports: { x: number; y: number; dir: Pt; lanes: Pt[]; item: string }[], colors: Record<string, string>, th: MapTheme): void {
  ctx.lineWidth = 2; ctx.lineCap = 'butt';
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.75;
  for (const p of ports) {
    if (!p.lanes.length) continue;
    ctx.strokeStyle = colors[p.item] ?? th.flow;
    ctx.beginPath();
    const horiz = p.dir[0] !== 0;
    for (const [lx, ly] of p.lanes) {
      ctx.moveTo(p.x, p.y);
      if (horiz) { const mx = (p.x + lx) / 2; ctx.bezierCurveTo(mx, p.y, mx, ly, lx, ly); }
      else { const my = (p.y + ly) / 2; ctx.bezierCurveTo(p.x, my, lx, my, lx, ly); }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = a;
}
