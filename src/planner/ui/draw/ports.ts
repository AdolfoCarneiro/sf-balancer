// Portas dos blocos nas duas vistas: círculo de PORT_D px (o mesmo raio que pega o ponteiro) com o ícone do item e o anel
// pelo estado (ok neutro, falta coral, sobra turquesa, saída da fábrica preenchida de laranja, travada tracejada em
// amarelo), e o rótulo do estado ao lado ("faltam 120/min", "+330 sobrando", "sai 450/min", "travado: sem destino").
// Puxando uma porta, as compatíveis brilham (anel laranja duplo), as outras ficam a 30 % e os rótulos somem.
import { fmt, t } from '../../../i18n/index.js';
import { PORT_D, type ViewPort } from '../../model/map/cards.ts';
import type { Rect } from '../../model/map/geo.ts';
import type { PortKind } from '../../model/portstate.ts';
import type { DrawOpts } from '../mapDraw.ts';
import type { MapTheme } from './theme.ts';

export const PORT_ZOOM = 0.5;    // na Planta, de longe as portas somem (a não ser puxando uma) e não pegam o ponteiro
export const PORT_R = PORT_D / 2, PORT_ICON = 28;
export const viewPortId = (p: { block: string; side: string; item: string }): string => `${p.block}|${p.side}|${p.item}`;

const RING = 3, LABEL_H = 22, LABEL_FONT = (th: MapTheme) => `600 12px ${th.body}`;

const look = (k: PortKind, th: MapTheme): { fill: string; ring: string; ink: string; dash: boolean } => {
  switch (k) {
    case 'deficit': return { fill: th.deficitBg, ring: th.deficit, ink: th.deficitInk, dash: false };
    case 'surplus': return { fill: th.surplusBg, ring: th.surplus, ink: th.surplusInk, dash: false };
    case 'exit': return { fill: th.ficsit, ring: th.ficsit, ink: th.ficsitSoft, dash: false };
    case 'stalled': return { fill: th.stallBg, ring: th.lock, ink: th.lock, dash: true };
    default: return { fill: th.bench, ring: th.line, ink: th.ink, dash: false };
  }
};

// O rótulo do estado, ou '' (porta ok).
export function portLabel(p: ViewPort, o: DrawOpts): string {
  const s = o.portState(p.block, p.side, p.item);
  if (!s) return '';
  const rate = (v: number | null) => (v === null ? t('plUnbounded') : o.rate(p.item, v));
  switch (s.kind) {
    case 'deficit': return t('plPortDeficit', rate(s.amount));
    case 'surplus': return s.amount === null ? '' : t('plPortSurplus', fmt(s.amount));
    case 'exit': return t('plPortExit', rate(s.amount));
    case 'stalled': return t('plPortStalled');
    default: return '';
  }
}

// Desenha as portas (já filtradas pelo que aparece) e devolve os retângulos dos rótulos, para os nomes não os cobrirem.
export function drawPorts(ctx: CanvasRenderingContext2D, ports: ViewPort[], o: DrawOpts, vw: number, vh: number, now: number): Rect[] {
  const th = o.theme, wire = o.wire, placed: Rect[] = [];
  const from = wire ? viewPortId(wire.from) : null;
  for (const p of ports) {
    const key = viewPortId(p), kind = o.portState(p.block, p.side, p.item)?.kind ?? 'ok', L = look(kind, th);
    const lit = !!wire && wire.lit.has(key), src = key === from, hov = key === o.portHover;
    const r = PORT_R * (lit ? 1.12 : hov ? 1.08 : 1);
    const a = ctx.globalAlpha;
    if (wire && !lit && !src) ctx.globalAlpha = a * 0.3;
    if (lit) {
      // Anel laranja duplo, separado da porta por um anel do fundo.
      ctx.lineWidth = 4; ctx.strokeStyle = th.bench;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = th.ficsit;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.globalAlpha = a * 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 12, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a;
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, r - RING / 2, 0, Math.PI * 2);
    ctx.fillStyle = L.fill; ctx.fill();
    ctx.lineWidth = RING; ctx.strokeStyle = src ? th.ficsit : L.ring;
    if (L.dash) ctx.setLineDash([5, 4]);
    ctx.stroke(); ctx.setLineDash([]);
    const img = o.icon(p.item);
    const ic = PORT_ICON * (r / PORT_R);
    if (img) ctx.drawImage(img, p.x - ic / 2, p.y - ic / 2, ic, ic);
    if (o.flash && (o.flash.port ?? o.flash.id) === key && now < o.flash.until) {
      const f = Math.min(1, (o.flash.until - now) / 1200);
      ctx.globalAlpha = a * f; ctx.strokeStyle = th.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + (1 - f) * 18, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = a;

    // Rótulo do estado, ao lado da porta, por fora do bloco (escondido puxando uma porta).
    if (wire) continue;
    const s = portLabel(p, o);
    if (!s) continue;
    ctx.font = LABEL_FONT(th);
    const w = ctx.measureText(s).width + 16;
    let x: number, y: number;
    if (p.dir[0] < 0) { x = p.x - PORT_R - w; y = p.y - PORT_R - LABEL_H - 4; }
    else if (p.dir[0] > 0) { x = p.x + PORT_R; y = p.y - PORT_R - LABEL_H - 4; }
    else { x = p.x + PORT_R + 4; y = p.y - LABEL_H / 2; }
    x = Math.max(0, Math.min(x, vw - w)); y = Math.max(0, Math.min(y, vh - LABEL_H));
    ctx.fillStyle = L.fill === th.ficsit ? '#2b2010' : L.fill;
    ctx.fillRect(x, y, w, LABEL_H);
    ctx.strokeStyle = L.ring; ctx.lineWidth = 1;
    if (L.dash) ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, LABEL_H - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = L.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x + 8, y + LABEL_H / 2 + 1);
    placed.push({ x, y, w, h: LABEL_H });
  }
  return placed;
}
