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
