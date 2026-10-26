// Planta em escala: grade de fundações, blocos (chapa, peças, contorno, perigo, seleção), esteiras, ligações, avisos de
// sobreposição e cruzamento, e a régua. Só desenha o que a câmera vê; de perto (zoom ≥ DETAIL_ZOOM) aparecem as peças.
import { fmt, t } from '../../../i18n/index.js';
import { DETAIL_ZOOM, visible, type Camera } from '../../model/map/camera.ts';
import type { BlockGeo, Piece, Rect } from '../../model/map/geo.ts';
import type { Scene, SceneBlock, SceneMeio } from '../../model/map/scene.ts';
import { FOUNDATION } from '../../model/map/sizes.ts';
import type { Rot } from '../../model/types.ts';
import type { DrawOpts } from '../mapDraw.ts';
import { strokeBelts, type WorldCtx } from './belts.ts';
import type { Labels } from './labels.ts';

const GRID_MIN_ZOOM = 0.2, GRID_MIN_PX = 7;
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

// Fundo e grade de fundações (8 m), em px de tela; de longe, uma linha a cada 5 fundações (40 m), para não virar ruído.
export function drawPlantFloor(ctx: CanvasRenderingContext2D, cam: Camera, vw: number, vh: number, th: DrawOpts['theme']): void {
  const z = cam.zoom, sx = (x: number) => (x - cam.x) * z, sy = (y: number) => (y - cam.y) * z;
  ctx.fillStyle = th.floor;
  ctx.fillRect(0, 0, vw, vh);
  if (z < GRID_MIN_ZOOM) return;
  const step = FOUNDATION * (FOUNDATION * z >= GRID_MIN_PX ? 1 : 5);
  ctx.beginPath();
  for (let x = Math.ceil(cam.x / step) * step; sx(x) <= vw; x += step) { const p = Math.round(sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, vh); }
  for (let y = Math.ceil(cam.y / step) * step; sy(y) <= vh; y += step) { const p = Math.round(sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(vw, p); }
  ctx.strokeStyle = th.sub; ctx.lineWidth = 1; ctx.stroke();
}

// Blocos, esteiras, ligações e avisos, com o contexto já em metros.
export function drawPlantWorld(w: WorldCtx, scene: Scene, blocks: SceneBlock[], meios: SceneMeio[], o: DrawOpts): void {
  const { ctx, cam, vw, vh, th } = w, z = cam.zoom, detail = z >= DETAIL_ZOOM;
  const A = ctx.globalAlpha;   // a vista inteira some na transição para a Montar
  const px = (n: number) => n / z;   // n px de tela em metros
  const pieceFill: Record<Piece['kind'], string> = {
    machine: th.machine, splitter: th.flow, merger: th.ficsit, smart: th.donor, sink: th.sink, junction: th.holo, bp: 'transparent',
  };
  const drawPieces = (geo: BlockGeo) => {
    strokeBelts(w, geo.belts, false);
    ctx.lineWidth = px(1);
    for (const p of geo.pieces) {
      if (p.above) continue;   // andar de cima: o mapa mostra o chão
      if (p.kind === 'bp') { ctx.strokeStyle = th.edge; ctx.strokeRect(p.x, p.y, p.w, p.h); continue; }
      ctx.fillStyle = pieceFill[p.kind];
      ctx.globalAlpha = A * (p.kind === 'sink' ? 0.35 : 1);
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.globalAlpha = A;
      if (p.kind === 'machine' || p.kind === 'sink') { ctx.strokeStyle = p.kind === 'sink' ? th.sink : th.inkDim; ctx.strokeRect(p.x, p.y, p.w, p.h); }
    }
  };

  // Blocos: chapa, contorno e, de perto, o conteúdo em escala.
  for (const b of blocks) {
    const r = b.rect, on = o.selected.has(b.stage), hov = o.hover === b.stage;
    ctx.globalAlpha = A * PANEL_ALPHA; ctx.fillStyle = th.paper; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = A;
    if (detail) { ctx.save(); enterLocal(ctx, b.place, b.geo); drawPieces(b.geo); ctx.restore(); }
    ctx.strokeStyle = on ? th.ficsit : hov ? th.ink : th.inkDim;
    ctx.lineWidth = px(on ? 2 : 1);
    // Origem e sobra: marcador fora de escala, tracejado.
    if (b.marker) ctx.setLineDash([px(4), px(3)]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
    // Travado: faixa de perigo por fora (laranja no subproduto parado, amarelo no loop travado).
    const bs = o.badges(b.stage);
    const hazard = bs.some(x => x.kind === 'deadlock') ? th.lock : bs.some(x => x.kind === 'stalled') ? th.ficsit : null;
    if (hazard) {
      const m = px(4);
      ctx.lineWidth = px(3);
      ctx.strokeStyle = th.bench; ctx.strokeRect(r.x - m, r.y - m, r.w + 2 * m, r.h + 2 * m);
      ctx.strokeStyle = hazard; ctx.setLineDash([px(6), px(6)]);
      ctx.strokeRect(r.x - m, r.y - m, r.w + 2 * m, r.h + 2 * m);
      ctx.setLineDash([]);
    }
    // Selecionado: cantoneiras laranja por fora, como a marcação de seleção do jogo.
    if (on) {
      const m = px(hazard ? 8 : 4), k = px(10);
      ctx.strokeStyle = th.ficsit; ctx.lineWidth = px(3);
      ctx.beginPath();
      for (const [cx, cy, sx0, sy0] of [[r.x - m, r.y - m, 1, 1], [r.x + r.w + m, r.y - m, -1, 1], [r.x - m, r.y + r.h + m, 1, -1], [r.x + r.w + m, r.y + r.h + m, -1, -1]]) {
        ctx.moveTo(cx + sx0 * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy0 * k);
      }
      ctx.stroke();
    }
  }
  // Esteiras entre blocos e meios (e as entradas brutas).
  strokeBelts(w, scene.belts, true);
  // Meios: faixa tracejada; de perto, as peças.
  for (const m of meios) {
    const r = m.rect, on = o.selected.has(m.meio), hov = o.hover === m.meio;
    ctx.globalAlpha = A * 0.8; ctx.fillStyle = th.bench; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = A;
    if (detail && m.geo && !m.geo.tooLarge) { ctx.save(); enterLocal(ctx, { x: r.x, y: r.y, rot: m.rot }, m.geo); drawPieces(m.geo); ctx.restore(); }
    ctx.strokeStyle = th.ficsit;
    ctx.globalAlpha = A * (on || hov ? 1 : 0.75);
    ctx.lineWidth = px(on ? 2 : 1.5);
    ctx.setLineDash([px(5), px(4)]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]); ctx.globalAlpha = A;
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
      ctx.globalAlpha = A * 0.3; ctx.fillRect(x, y, w, h); ctx.globalAlpha = A;
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
}

// Régua de escala no canto de cima à esquerda (a Legenda fica com os controles do mapa, embaixo à direita, e a dica de
// navegação embaixo à esquerda).
export function drawRuler(ctx: CanvasRenderingContext2D, z: number, th: DrawOpts['theme'], L: Labels): void {
  const meters = [...SCALES].reverse().find(s => s * z <= SCALE_MAX_PX) ?? SCALES[0];
  // No canto de cima à esquerda do mapa, 12 px de margem (a placa começa em ry - 22).
  const len = meters * z, rx = 20, ry = 34;
  const label = t('plPlantScale', fmt(meters, 0));
  ctx.font = L.SMALL;
  const plate = { x: rx - 8, y: ry - 22, w: Math.max(len, ctx.measureText(label).width) + 16, h: 32 };
  L.drawLine({ s: '', font: L.SMALL, color: th.ink, h: 32 }, plate);
  L.placed.push(plate);
  ctx.strokeStyle = th.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx, ry - 4); ctx.lineTo(rx, ry); ctx.lineTo(rx + len, ry); ctx.lineTo(rx + len, ry - 4); ctx.stroke();
  ctx.font = L.SMALL; ctx.fillStyle = th.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, rx, ry - 8);
}
