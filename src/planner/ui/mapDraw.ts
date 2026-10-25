// Desenho da cena do mapa num canvas 2D. Só desenha o que a câmera vê; de longe, bloco e meio viram retângulo com rótulo,
// de perto (zoom ≥ DETAIL_ZOOM) aparecem máquinas, faixas, peças e esteiras com a cor do item.
import { fmt, t } from '../../i18n/index.js';
import { DETAIL_ZOOM, visible, type Camera } from '../model/map/camera.ts';
import type { BeltPath, BlockGeo, Piece, Pt, Rect } from '../model/map/geo.ts';
import { toWorld, type Scene } from '../model/map/scene.ts';
import { BELT, FOUNDATION } from '../model/map/sizes.ts';
import type { ItemId, Rot, StageId } from '../model/types.ts';
import { sizeText } from './format.ts';

// Cores e fontes lidas dos tokens CSS (o canvas não entende var()).
export interface MapTheme {
  floor: string; sub: string; edge: string; paper: string; bench: string; plate: string; line: string;
  ink: string; inkDim: string; ficsit: string; flow: string; held: string; holo: string; sink: string; donor: string;
  machine: string; display: string; body: string;
}

export function readTheme(el: Element): MapTheme {
  const cs = getComputedStyle(el), v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    floor: v('--bp-floor', '#1b3550'), sub: v('--bp-sub', 'rgba(226,240,252,.11)'), edge: v('--bp-edge', '#eaf3fb'),
    paper: v('--paper', '#0d2136'), bench: v('--bench', '#0a1b2d'), plate: v('--plate', '#15324f'), line: v('--line', '#2d5176'),
    ink: v('--ink', '#e4eef8'), inkDim: v('--ink-dim', '#8eabc6'), ficsit: v('--ficsit', '#ff9b3d'), flow: v('--flow', '#e4eef8'),
    held: v('--held', '#7f9bb8'), holo: v('--holo', '#6fe3ff'), sink: v('--sink', '#ff6d7c'), donor: v('--donor', '#c6a6ff'),
    machine: '#1f4a72', display: v('--display', 'sans-serif'), body: v('--body', 'sans-serif'),
  };
}

export interface DrawOpts {
  selected: string | null; hover: string | null;
  colors: Record<string, string>; names: (item: ItemId) => string;
  theme: MapTheme;
  // Rótulos de fora: o bloco (receita · máquinas, fileiras) e o meio (caso, linhas), já no idioma da tela.
  blockText: (stage: StageId) => { title: string; sub: string };
  meioText: (meio: string) => { title: string; sub: string };
}

const GRID_MIN_ZOOM = 0.4;
const SCALES = [1, 5, 10, 50, 100, 500, 1000];
const SCALE_MAX_PX = 140;
const PANEL_ALPHA = 0.85;

// Passa a desenhar no referencial local de um bloco girado (o mesmo de toWorld).
function enterLocal(ctx: CanvasRenderingContext2D, place: { x: number; y: number; rot: Rot }, size: { w: number; h: number }) {
  const { x, y } = place, { w, h } = size;
  switch (place.rot) {
    case 1: ctx.transform(0, 1, -1, 0, x + h, y); break;
    case 2: ctx.transform(-1, 0, 0, -1, x + w, y + h); break;
    case 3: ctx.transform(0, -1, 1, 0, x, y + w); break;
    default: ctx.translate(x, y);
  }
}

const boxOf = (pts: Pt[]): Rect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0 - BELT, y: y0 - BELT, w: x1 - x0 + 2 * BELT, h: y1 - y0 + 2 * BELT };
};

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera, vw: number, vh: number, o: DrawOpts): void {
  const th = o.theme, z = cam.zoom, detail = z >= DETAIL_ZOOM;
  const sx = (x: number) => (x - cam.x) * z, sy = (y: number) => (y - cam.y) * z;

  ctx.save();
  ctx.fillStyle = th.floor;
  ctx.fillRect(0, 0, vw, vh);

  // Grade de fundações (8 m), em px de tela.
  if (z >= GRID_MIN_ZOOM) {
    ctx.beginPath();
    for (let x = Math.ceil(cam.x / FOUNDATION) * FOUNDATION; sx(x) <= vw; x += FOUNDATION) { const p = Math.round(sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, vh); }
    for (let y = Math.ceil(cam.y / FOUNDATION) * FOUNDATION; sy(y) <= vh; y += FOUNDATION) { const p = Math.round(sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(vw, p); }
    ctx.strokeStyle = th.sub; ctx.lineWidth = 1; ctx.stroke();
  }

  // Daqui até o fim do mundo: unidades em metros.
  ctx.save();
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
  const px = (n: number) => n / z;   // n px de tela em metros

  const beltColor = (b: BeltPath) => (b.role === 'sink' ? th.sink : o.colors[b.item] ?? th.flow);
  const strokeBelts = (belts: BeltPath[], cull: boolean) => {
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    for (const b of belts) {
      if (b.pts.length < 2 || (cull && !visible(boxOf(b.pts), cam, vw, vh))) continue;
      ctx.beginPath();
      ctx.moveTo(b.pts[0][0], b.pts[0][1]);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
      ctx.strokeStyle = beltColor(b);
      ctx.lineWidth = Math.max(BELT, px(1.5));
      ctx.setLineDash(b.fluid ? [px(6), px(4)] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };
  const pieceFill: Record<Piece['kind'], string> = {
    machine: th.machine, splitter: th.flow, merger: th.ficsit, smart: th.donor, sink: th.sink, junction: th.holo, bp: 'transparent',
  };
  const drawPieces = (geo: BlockGeo) => {
    strokeBelts(geo.belts, false);
    ctx.lineWidth = px(1);
    for (const p of geo.pieces) {
      if (p.kind === 'bp') { ctx.strokeStyle = th.edge; ctx.strokeRect(p.x, p.y, p.w, p.h); continue; }
      ctx.fillStyle = pieceFill[p.kind];
      ctx.globalAlpha = p.kind === 'sink' ? 0.35 : 1;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.globalAlpha = 1;
      if (p.kind === 'machine' || p.kind === 'sink') { ctx.strokeStyle = p.kind === 'sink' ? th.sink : th.inkDim; ctx.strokeRect(p.x, p.y, p.w, p.h); }
    }
  };

  const blocks = scene.blocks.filter(b => visible(b.rect, cam, vw, vh));
  const meios = scene.meios.filter(m => visible(m.rect, cam, vw, vh));

  // Blocos: chapa, contorno e, de perto, o conteúdo em escala.
  for (const b of blocks) {
    const r = b.rect, on = o.selected === b.stage, hov = o.hover === b.stage;
    ctx.globalAlpha = PANEL_ALPHA; ctx.fillStyle = th.paper; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1;
    if (detail) { ctx.save(); enterLocal(ctx, b.place, b.geo); drawPieces(b.geo); ctx.restore(); }
    ctx.strokeStyle = on ? th.ficsit : hov ? th.ink : th.inkDim;
    ctx.lineWidth = px(on ? 2 : 1);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  // Esteiras entre blocos e meios (e as entradas brutas).
  strokeBelts(scene.belts, true);
  // Meios: faixa tracejada; de perto, as peças.
  for (const m of meios) {
    const r = m.rect, on = o.selected === m.meio, hov = o.hover === m.meio;
    ctx.globalAlpha = 0.8; ctx.fillStyle = th.bench; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1;
    if (detail && m.geo && !m.geo.tooLarge) { ctx.save(); enterLocal(ctx, { x: r.x, y: r.y, rot: m.rot }, m.geo); drawPieces(m.geo); ctx.restore(); }
    ctx.strokeStyle = th.ficsit;
    ctx.globalAlpha = on || hov ? 1 : 0.75;
    ctx.lineWidth = px(on ? 2 : 1.5);
    ctx.setLineDash([px(5), px(4)]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // Avisos: a área sobreposta pintada e os dois retângulos com contorno de aviso; cruzamento de esteira, um anel.
  if (scene.overlaps.length) {
    const rects = new Map<string, Rect>();
    for (const b of scene.blocks) rects.set(b.stage, b.rect);
    for (const m of scene.meios) rects.set(m.meio, m.rect);
    const outline = new Set<string>();
    ctx.fillStyle = th.sink;
    for (const [a, b] of scene.overlaps) {
      const p = rects.get(a), q = rects.get(b);
      if (!p || !q) continue;
      outline.add(a); outline.add(b);
      const x = Math.max(p.x, q.x), y = Math.max(p.y, q.y), w = Math.min(p.x + p.w, q.x + q.w) - x, h = Math.min(p.y + p.h, q.y + q.h) - y;
      if (!visible({ x, y, w, h }, cam, vw, vh)) continue;
      ctx.globalAlpha = 0.3; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = th.sink; ctx.lineWidth = px(2);
    for (const id of outline) {
      const r = rects.get(id)!;
      if (visible(r, cam, vw, vh)) ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }
  if (scene.crossings.length) {
    const rad = px(6);
    ctx.strokeStyle = th.sink; ctx.lineWidth = px(2);
    for (const [x, y] of scene.crossings) {
      if (!visible({ x: x - rad, y: y - rad, w: 2 * rad, h: 2 * rad }, cam, vw, vh)) continue;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();

  // Rótulos em px de tela (legíveis em qualquer zoom).
  ctx.textBaseline = 'alphabetic';
  // plate: chapa escura atrás do texto (legível sobre as máquinas); optional: some se encostar num rótulo já posto.
  const placed: Rect[] = [];
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left',
    f: { plate?: boolean; optional?: boolean; max?: number } = {}) => {
    ctx.font = font;
    if (f.max !== undefined) {
      if (f.max < 12) return;
      while (s.length > 1 && ctx.measureText(s).width > f.max) s = s.slice(0, s.endsWith('…') ? -2 : -1) + '…';
    }
    if (f.plate || f.optional) {
      const w = ctx.measureText(s).width, fs = Number(/(\d+)px/.exec(font)?.[1] ?? 11);
      const r = { x: (align === 'center' ? x - w / 2 : x) - 3, y: y - fs, w: w + 6, h: fs + 4 };
      if (f.optional && placed.some(p => p.x < r.x + r.w && r.x < p.x + p.w && p.y < r.y + r.h && r.y < p.y + p.h)) return;
      placed.push(r);
      if (f.plate) { ctx.globalAlpha = 0.8; ctx.fillStyle = th.bench; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
    }
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y);
  };
  const plate = { plate: true };
  const title = `600 13px ${th.display}`, small = `11px ${th.body}`;
  for (const b of blocks) {
    const x = sx(b.rect.x), y = sy(b.rect.y), w = b.rect.w * z, h = b.rect.h * z;
    if (w < 24) continue;
    const on = o.selected === b.stage, txt = o.blockText(b.stage);
    const size = sizeText(b.rect) + (b.geo.estimate ? ` · ${t('plMapEstimate')}` : '');
    if (detail) {
      // De perto as máquinas ocupam o bloco: nome em cima, medida embaixo.
      text(txt.title, x, y - 22, title, on ? th.ficsit : th.ink, 'left', plate);
      text(txt.sub, x, y - 6, small, th.inkDim, 'left', { plate: true, optional: true });
      text(size, x, y + h + 14, small, on ? th.ficsit : th.inkDim, 'left', { plate: true, optional: true });
      continue;
    }
    // De longe o bloco é uma chapa: os rótulos vão dentro, cortados na largura dele.
    const lines: [string, string, string, number][] = [
      [txt.title, title, on ? th.ficsit : th.ink, 18], [txt.sub, small, th.inkDim, 15], [size, small, on ? th.ficsit : th.inkDim, 15],
    ];
    let ly = y;
    for (const [s, font, color, step] of lines) {
      ly += step;
      if (ly + 4 > y + h) break;
      text(s, x + 6, ly, font, color, 'left', { max: w - 12 });
    }
  }
  for (const m of meios) {
    const x = sx(m.rect.x), y = sy(m.rect.y), w = m.rect.w * z, h = m.rect.h * z;
    if (w < 24 || h < 16) continue;
    const txt = o.meioText(m.meio), cx = x + w / 2;
    const extra = m.geo && !m.geo.tooLarge
      ? [sizeText(m.rect), m.geo.floors > 1 ? t('plMapFloors', fmt(m.geo.floors, 0)) : '', m.geo.estimate ? t('plMapEstimate') : ''].filter(Boolean).join(' · ')
      : '';
    if (detail) {
      // De perto as peças ocupam o meio: o rótulo vai para cima dele.
      text(txt.title + (txt.sub ? ` · ${txt.sub}` : ''), x, y - 6, `700 12px ${th.display}`, th.ficsit, 'left', plate);
      if (extra) text(extra, x, y + h + 14, small, th.inkDim, 'left', plate);
    } else if (h >= 34) {
      text(txt.title, cx, y + h / 2 - (txt.sub ? 2 : -4), `700 12px ${th.display}`, th.ficsit, 'center', { max: w - 6 });
      if (txt.sub) text(txt.sub, cx, y + h / 2 + 12, small, th.inkDim, 'center', { max: w - 6 });
    }
  }
  // Entradas brutas: nome do item e taxa na ponta do toco, de perto.
  for (const b of scene.belts) {
    if (b.role !== 'raw' || b.pts.length < 2) continue;
    const [x0, y0] = b.pts[0];
    if (!detail || !visible(boxOf(b.pts), cam, vw, vh)) continue;
    const rate = t(b.fluid ? 'plPerMinFluid' : 'plPerMin', fmt(b.rate));
    text(`${o.names(b.item)} · ${rate}`, sx(x0), sy(y0) - 4, small, o.colors[b.item] ?? th.flow, 'left', { plate: true, optional: true });
  }
  // Nomes das peças grandes (Awesome Sink, Blueprint) quando cabem.
  if (detail) {
    for (const m of meios) {
      if (!m.geo || m.geo.tooLarge) continue;
      for (const p of m.geo.pieces) {
        const name = p.kind === 'sink' ? 'Awesome Sink' : p.label;
        if (!name || p.w * z < 70) continue;
        const c = toWorld([p.x + p.w / 2, p.y + p.h / 2], m.geo, { x: m.rect.x, y: m.rect.y, rot: m.rot });
        text(name, sx(c[0]), sy(c[1]) + 4, small, th.ink, 'center');
      }
    }
  }

  // Régua de escala no canto inferior esquerdo.
  const meters = [...SCALES].reverse().find(s => s * z <= SCALE_MAX_PX) ?? SCALES[0];
  const len = meters * z, rx = 16, ry = vh - 18;
  ctx.fillStyle = th.bench; ctx.globalAlpha = 0.8; ctx.fillRect(rx - 8, ry - 22, Math.max(len, 40) + 16, 32); ctx.globalAlpha = 1;
  ctx.strokeStyle = th.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx, ry - 4); ctx.lineTo(rx, ry); ctx.lineTo(rx + len, ry); ctx.lineTo(rx + len, ry - 4); ctx.stroke();
  text(t('plMapScale', fmt(meters, 0)), rx, ry - 8, small, th.ink);
  ctx.restore();
}
