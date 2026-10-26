// Portas dos blocos: toco para fora do bloco na cor do item; sob o ponteiro, realçada; puxando uma, as que aceitam acendem
// e as outras apagam. De perto, o ícone do item na ponta. E a esteira provisória da porta puxada até o ponteiro.
import { DETAIL_ZOOM, visible } from '../../model/map/camera.ts';
import { route, type Pt } from '../../model/map/geo.ts';
import type { ScenePort } from '../../model/map/ports.ts';
import type { DrawOpts } from '../mapDraw.ts';
import type { WorldCtx } from './belts.ts';

export const PORT_ZOOM = 0.5;    // de longe as portas somem (a não ser puxando uma) e não pegam o ponteiro
export const STUB_PX = 9, PORT_PX = 4, ICON_PX = 16;
export const portId = (p: ScenePort): string => `${p.block}|${p.side}|${p.item}`;

// Com o contexto em metros.
export function drawPortsWorld(w: WorldCtx, o: DrawOpts): void {
  const { ctx, cam, vw, vh, th } = w, z = cam.zoom, detail = z >= DETAIL_ZOOM, px = (n: number) => n / z;
  const wire = o.wire;
  if (z >= PORT_ZOOM || wire) {
    const stub = px(STUB_PX), dot = px(PORT_PX), ic = px(ICON_PX);
    for (const p of o.ports) {
      const [dx, dy] = p.dir ?? [p.side === 'out' ? 1 : -1, 0];
      const ex = p.x + dx * stub, ey = p.y + dy * stub;
      if (!visible({ x: Math.min(p.x, ex) - ic, y: Math.min(p.y, ey) - ic, w: 2 * ic + stub, h: 2 * ic + stub }, cam, vw, vh)) continue;
      const key = portId(p), on = key === o.portHover, ok = !!wire?.lit.has(key), source = !!wire && portId(wire.from) === key;
      ctx.globalAlpha = wire && !ok && !source ? 0.3 : 1;
      ctx.strokeStyle = o.colors[p.item] ?? (p.fluid ? th.holo : th.flow);
      ctx.lineWidth = px(3);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      const r = on || ok || source ? dot * 1.5 : dot;
      ctx.fillStyle = on || source ? th.ficsit : ok ? th.holo : th.bench;
      ctx.strokeStyle = on || source ? th.ficsit : ok ? th.holo : th.inkDim;
      ctx.lineWidth = px(1.5);
      ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (ok) { ctx.beginPath(); ctx.arc(ex, ey, r + px(4), 0, Math.PI * 2); ctx.stroke(); }
      const img = detail || on || ok ? o.icon(p.item) : null;
      if (img) {
        const cx = ex + dx * (r + ic / 2 + px(2)), cy = ey + dy * (r + ic / 2 + px(2));
        ctx.drawImage(img, cx - ic / 2, cy - ic / 2, ic, ic);
      }
      ctx.globalAlpha = 1;
    }
  }
  // Esteira provisória da porta puxada até o ponteiro.
  if (wire) {
    const a = wire.from, [dx, dy] = a.dir ?? [1, 0];
    const start: Pt = [a.x + dx * px(STUB_PX), a.y + dy * px(STUB_PX)];
    const pts = route(start, wire.to, dx !== 0 ? 'x' : 'y');
    ctx.strokeStyle = th.ficsit; ctx.lineWidth = px(2.5);
    ctx.setLineDash([px(8), px(5)]);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.stroke(); ctx.setLineDash([]);
  }
}
