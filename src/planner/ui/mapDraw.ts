// Desenho da cena do mapa num canvas 2D. Só desenha o que a câmera vê; de longe, bloco e meio viram retângulo com rótulo,
// de perto (zoom ≥ DETAIL_ZOOM) aparecem máquinas, faixas, peças e esteiras com a cor do item.
import { fmt, t } from '../../i18n/index.js';
import { DETAIL_ZOOM, visible, type Camera } from '../model/map/camera.ts';
import { route, type BeltPath, type BlockGeo, type Piece, type Pt, type Rect } from '../model/map/geo.ts';
import type { ScenePort } from '../model/map/ports.ts';
import type { Badge, BadgeKind } from '../model/badges.ts';
import { toWorld, type Scene } from '../model/map/scene.ts';
import { BELT, FOUNDATION } from '../model/map/sizes.ts';
import type { ItemId, Rot, StageId } from '../model/types.ts';
import { sizeText } from './format.ts';

// Cores e fontes lidas dos tokens CSS (o canvas não entende var()).
export interface MapTheme {
  floor: string; sub: string; edge: string; paper: string; bench: string; plate: string; line: string;
  ink: string; inkDim: string; ficsit: string; flow: string; held: string; holo: string; sink: string; donor: string; ok: string; lock: string;
  machine: string; display: string; body: string;
}

export function readTheme(el: Element): MapTheme {
  const cs = getComputedStyle(el), v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    floor: v('--bp-floor', '#1b3550'), sub: v('--bp-sub', 'rgba(226,240,252,.11)'), edge: v('--bp-edge', '#eaf3fb'),
    paper: v('--paper', '#0d2136'), bench: v('--bench', '#0a1b2d'), plate: v('--plate', '#15324f'), line: v('--line', '#2d5176'),
    ink: v('--ink', '#e4eef8'), inkDim: v('--ink-dim', '#8eabc6'), ficsit: v('--ficsit', '#ff9b3d'), flow: v('--flow', '#e4eef8'),
    held: v('--held', '#7f9bb8'), holo: v('--holo', '#6fe3ff'), sink: v('--sink', '#ff6d7c'), donor: v('--donor', '#c6a6ff'), ok: v('--ok', '#8fe3a4'),
    lock: v('--lock', '#ffd84a'),
    machine: '#1f4a72', display: v('--display', 'sans-serif'), body: v('--body', 'sans-serif'),
  };
}

export interface DrawOpts {
  selected: string | null; hover: string | null;
  colors: Record<string, string>; names: (item: ItemId) => string;
  theme: MapTheme;
  // Rótulos de fora: o bloco (receita · máquinas, fileiras) e o meio (caso, linhas), já no idioma da tela. icon: id do
  // ícone antes do título (produto principal, prédio da origem ou da sobra, item da ligação); alert: o motivo do
  // travado (de longe vai no lugar do sub; de perto ele fica só na porta parada).
  blockText: (stage: StageId) => { title: string; sub: string; icon: string | null; alert: string };
  meioText: (meio: string) => { title: string; sub: string; icon: string | null };
  // Avisos do fluxo de cada bloco (falta, represado, saída, travado…) e o texto curto de cada um (sem unidade).
  badges: (stage: StageId) => Badge[];
  badgeLabel: (stage: StageId, b: Badge) => string;
  // Portas dos blocos: a que está sob o ponteiro (chave bloco|lado|item) e, puxando uma, a esteira provisória até o
  // ponteiro e as portas que aceitam (lit). icon: o ícone já carregado, ou null.
  ports: ScenePort[]; portHover: string | null;
  wire: { from: ScenePort; to: Pt; lit: Set<string> } | null;
  icon: (item: ItemId) => HTMLImageElement | null;
}

export const PORT_ZOOM = 0.5;    // de longe as portas somem (a não ser puxando uma) e não pegam o ponteiro
const STUB_PX = 9, PORT_PX = 4, ICON_PX = 16;
const portId = (p: ScenePort) => `${p.block}|${p.side}|${p.item}`;
// De longe, um ponto por tipo de aviso no canto do bloco (a saída da fábrica não é aviso).
const DOT_KINDS: BadgeKind[] = ['deficit', 'held', 'stalled', 'deadlock', 'unbounded'];
const DOT_PX = 4, TITLE_ICON = 16;
// Rótulos secundários por zoom (px por metro): fileiras, medida do bloco e etiqueta das entradas brutas.
const SUB_ZOOM = 2, SIZE_ZOOM = 3.5, RAW_ZOOM = 2;

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

  // Grade de fundações (8 m), em px de tela; de longe, uma linha a cada 5 fundações (40 m), para não virar ruído.
  if (z >= GRID_MIN_ZOOM) {
    const step = FOUNDATION * (FOUNDATION * z >= GRID_MIN_PX ? 1 : 5);
    ctx.beginPath();
    for (let x = Math.ceil(cam.x / step) * step; sx(x) <= vw; x += step) { const p = Math.round(sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, vh); }
    for (let y = Math.ceil(cam.y / step) * step; sy(y) <= vh; y += step) { const p = Math.round(sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(vw, p); }
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
      if (p.above) continue;   // andar de cima: o mapa mostra o chão
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
  // Portas: toco para fora do bloco na cor do item; sob o ponteiro, realçada; puxando uma, as que aceitam acendem e as
  // outras apagam. De perto, o ícone do item na ponta.
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
  ctx.restore();

  // Rótulos em px de tela (legíveis em qualquer zoom), postos por um posicionador guloso: primeiro os avisos (sempre
  // aparecem), depois os nomes (o selecionado antes), por fim o secundário (fileiras, medidas, entradas brutas). Cada
  // um vai para o primeiro lugar livre entre os seus candidatos (sem cobrir outro rótulo nem outro bloco); o secundário
  // some se não couber. De perto o nome nunca é cortado: sem lugar livre ele pode cobrir um bloco vizinho (nunca outro
  // rótulo), e só some se nem assim couber (o selecionado e o que está sob o ponteiro aparecem sempre).
  const near = z >= PORT_ZOOM;
  const placed: Rect[] = [];
  const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const boxes: { id: string; r: Rect }[] = [];
  for (const b of blocks) boxes.push({ id: b.stage, r: { x: sx(b.rect.x), y: sy(b.rect.y), w: b.rect.w * z, h: b.rect.h * z } });
  for (const m of meios) boxes.push({ id: m.meio, r: { x: sx(m.rect.x), y: sy(m.rect.y), w: m.rect.w * z, h: m.rect.h * z } });
  const boxOfId = new Map(boxes.map(b => [b.id, b.r]));
  // Livre: dentro da tela, sem outro rótulo e (com blocks) sem outro bloco ou ligação que não o dono.
  const free = (r: Rect, own: string | null, blocksToo = true) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh
    && !placed.some(p => hit(p, r)) && (!blocksToo || !boxes.some(b => b.id !== own && hit(b.r, r)));

  const NAME = `600 13px ${th.display}`, SMALL = `11px ${th.body}`, BADGE = `600 12px ${th.body}`;
  const PAD = 5, CUT = 5, GAP = 3;
  const measure = (s: string, font: string) => { ctx.font = font; return ctx.measureText(s).width; };
  // Uma linha de rótulo: texto numa chapa escura com o canto de cima chanfrado (as placas do site); icon: ícone antes
  // do texto; accent: filete à esquerda (o selecionado).
  interface Line { s: string; font: string; color: string; h: number; icon?: string | null; accent?: string | null }
  const iconOf = (id: string | null | undefined) => (id ? o.icon(id) : null);
  const lineW = (l: Line) => measure(l.s, l.font) + 2 * PAD + (iconOf(l.icon) ? TITLE_ICON + 4 : 0);
  const fit = (l: Line, max: number): Line | null => {
    if (lineW(l) <= max) return l;
    let s = l.s;
    while (s.length > 1 && lineW({ ...l, s }) > max) s = s.slice(0, s.endsWith('…') ? -2 : -1) + '…';
    return s.length > 3 ? { ...l, s } : null;
  };
  const rectsAt = (lines: Line[], x: number, y: number, align: 'left' | 'right' | 'center' = 'left'): Rect[] => {
    let top = y;
    return lines.map(l => {
      const w = lineW(l), r = { x: align === 'left' ? x : align === 'right' ? x - w : x - w / 2, y: top, w, h: l.h };
      top += l.h;
      return r;
    });
  };
  const drawLine = (l: Line, r: Rect) => {
    ctx.beginPath();
    ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w - CUT, r.y); ctx.lineTo(r.x + r.w, r.y + CUT); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x, r.y + r.h);
    ctx.closePath();
    ctx.globalAlpha = 0.9; ctx.fillStyle = th.bench; ctx.fill(); ctx.globalAlpha = 1;
    if (l.accent) { ctx.fillStyle = l.accent; ctx.fillRect(r.x, r.y, 2, r.h); }
    let tx = r.x + PAD;
    const img = iconOf(l.icon);
    if (img) { ctx.drawImage(img, tx - 1, r.y + (r.h - TITLE_ICON) / 2, TITLE_ICON, TITLE_ICON); tx += TITLE_ICON + 4; }
    ctx.font = l.font; ctx.fillStyle = l.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(l.s, tx, r.y + r.h / 2 + 1);
  };
  // Tenta cada candidato (x, y do canto de cima da pilha) e desenha no primeiro livre. force (um nome que precisa
  // aparecer): sem lugar livre, aceita cobrir um bloco vizinho (nunca outro rótulo); last: em último caso, o primeiro
  // candidato mesmo cobrindo (só o selecionado ou o que está sob o ponteiro).
  type Cand = [number, number, ('left' | 'right' | 'center')?];
  const draw = (lines: Line[], rs: Rect[]) => { rs.forEach((r, i) => drawLine(lines[i], r)); placed.push(...rs); return rs; };
  const put = (lines: Line[], cands: Cand[], own: string | null, force = false, last = false): Rect[] | null => {
    const at = ([x, y, align]: Cand) => rectsAt(lines, x, y, align);
    for (const c of cands) { const rs = at(c); if (rs.every(r => free(r, own))) return draw(lines, rs); }
    if (!force || !cands.length) return null;
    for (const c of cands) { const rs = at(c); if (rs.every(r => free(r, own, false))) return draw(lines, rs); }
    return last ? draw(lines, at(cands[0])) : null;
  };
  const heightOf = (lines: Line[]) => lines.reduce((s, l) => s + l.h, 0);
  // Em volta de um retângulo de tela: em cima e embaixo (alinhado à esquerda, depois à direita) e por dentro (só se
  // couber inteiro).
  const around = (r: Rect, lines: Line[], insideFirst: boolean): Cand[] => {
    const H = heightOf(lines), W = Math.max(...lines.map(lineW));
    const out: Cand[] = [
      [r.x, r.y - H - GAP], [r.x, r.y + r.h + GAP], [r.x + r.w - W, r.y - H - GAP], [r.x + r.w - W, r.y + r.h + GAP],
      [r.x - W - GAP, r.y + (r.h - H) / 2], [r.x + r.w + GAP, r.y + (r.h - H) / 2],
    ];
    const inside: Cand[] = W <= r.w - 2 * GAP && H <= r.h - 2 * GAP ? [[r.x + GAP, r.y + GAP]] : [];
    return insideFirst ? [...inside, ...out] : [...out, ...inside];
  };

  const badgeColor: Record<BadgeKind, string> = {
    deficit: th.sink, held: th.ok, exit: th.ok, stalled: th.ficsit, deadlock: th.lock, unbounded: th.holo,
  };
  // De longe, um sinal por tipo de aviso no canto do bloco, com forma própria além da cor: falta e represado em
  // círculo, travado em quadrado, loop travado em losango, sem limite em anel.
  const dot = (k: BadgeKind, x: number, y: number) => {
    const r = DOT_PX;
    ctx.beginPath();
    if (k === 'stalled') ctx.rect(x - r, y - r, 2 * r, 2 * r);
    else if (k === 'deadlock') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r - 1, y); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    if (k === 'unbounded') { ctx.strokeStyle = th.holo; ctx.lineWidth = 2; ctx.stroke(); return; }
    ctx.fillStyle = badgeColor[k]; ctx.fill();
    ctx.strokeStyle = th.bench; ctx.lineWidth = 1; ctx.stroke();
  };

  // 1. Avisos do fluxo. De perto, o texto na ponta de cada porta (falta em vermelho por dentro da entrada; represado
  // por dentro da saída; saída da fábrica e saída parada por fora, onde não há ligação); de longe, os sinais no canto.
  const portOf = new Map(o.ports.map(p => [portId(p), p]));
  for (const b of blocks) {
    const bs = o.badges(b.stage);
    if (!bs.length) continue;
    if (!near) {
      const kinds = DOT_KINDS.filter(k => bs.some(x => x.kind === k));
      const x1 = sx(b.rect.x + b.rect.w), y0 = sy(b.rect.y);
      if (b.rect.w * z < 8) continue;
      kinds.forEach((k, i) => dot(k, x1 - 7 - i * (2 * DOT_PX + 4), y0 + 7));
      continue;
    }
    const stack = new Map<string, number>();
    for (const x of bs) {
      if ((x.side === 'block' && x.kind !== 'stalled') || !x.item) continue;
      const p = portOf.get(`${b.stage}|${x.side === 'in' ? 'in' : 'out'}|${x.item}`);
      if (!p) continue;
      const k = stack.get(portId(p)) ?? 0;
      stack.set(portId(p), k + 1);
      const [px0, py0] = p.dir ?? [x.side === 'in' ? -1 : 1, 0];
      const outside = x.kind === 'exit' || x.kind === 'stalled', dx = outside ? px0 : -px0, dy = outside ? py0 : -py0;
      const off = outside ? STUB_PX + PORT_PX * 1.5 + ICON_PX + 8 : 6;
      const align = dx > 0 ? 'left' : dx < 0 ? 'right' : 'center';
      const line: Line = { s: o.badgeLabel(b.stage, x), font: BADGE, color: badgeColor[x.kind], h: 18 };
      const step = 20 * (dy < 0 ? -1 : 1);
      const tx = sx(p.x) + dx * off;
      let ty = sy(p.y) + dy * (off + 4) - 9 + k * step;
      // Portas vizinhas (fluido e sólido na mesma borda): um aviso não cobre o outro.
      for (let i = 0; i < 4 && placed.some(r => hit(r, rectsAt([line], tx, ty, align)[0])); i++) ty += step || 20;
      const r = rectsAt([line], tx, ty, align)[0];
      drawLine(line, r); placed.push(r);
    }
  }

  // 2. Nomes dos blocos (o selecionado primeiro) e das ligações. De perto o nome vai por fora (em cima, embaixo) e só
  // por dentro se couber; de longe, por dentro primeiro.
  // Ordem: o selecionado, os blocos de receita (os maiores antes), as origens e sobras (marcadores fora de escala).
  const order = [...blocks].sort((a, b) => +(b.stage === o.selected) - +(a.stage === o.selected) || +!!a.marker - +!!b.marker
    || b.rect.w * b.rect.h - a.rect.w * a.rect.h);
  for (const b of order) {
    const r = boxOfId.get(b.stage)!;
    if (r.w < 12) continue;
    const on = o.selected === b.stage, hov = o.hover === b.stage, txt = o.blockText(b.stage);
    const title: Line = { s: txt.title, font: NAME, color: on ? th.ficsit : th.ink, h: 20, icon: txt.icon, accent: on ? th.ficsit : null };
    // De perto o motivo do travado fica só na porta parada; de longe ele vai no lugar das fileiras.
    const subText = !near && txt.alert ? txt.alert : txt.sub;
    const sub: Line = { s: subText, font: SMALL, color: !near && txt.alert ? th.ficsit : th.inkDim, h: 15 };
    const wantSub = !!subText && (on || hov || z >= SUB_ZOOM || (!near && !!txt.alert));
    let done: Rect[] | null = null;
    if (wantSub) done = put([title, sub], around(r, [title, sub], !detail), b.stage);
    if (!done) done = put([title], around(r, [title], !detail), b.stage, detail || on || hov, on || hov);
    if (!done && !detail) {
      // De longe e sem lugar inteiro: por dentro, cortado na largura do bloco.
      const cut = fit(title, r.w - 2 * GAP);
      if (cut && 20 <= r.h - 2 * GAP) done = put([cut], [[r.x + GAP, r.y + GAP]], b.stage);
    }
  }
  for (const m of meios) {
    const r = boxOfId.get(m.meio)!;
    if (r.w < 12) continue;
    const on = o.selected === m.meio, hov = o.hover === m.meio, txt = o.meioText(m.meio);
    if (!txt.title) continue;
    const head: Line = { s: txt.title + (txt.sub ? ` · ${txt.sub}` : ''), font: `700 12px ${th.display}`, color: th.ficsit, h: 18, icon: txt.icon, accent: on ? th.ficsit : null };
    const short: Line = { ...head, s: txt.title };
    if (!put([head], around(r, [head], !detail), m.meio) && !put([short], around(r, [short], !detail), m.meio, true, on || hov) && !detail) {
      const cut = fit(short, r.w - 2 * GAP);
      if (cut && 18 <= r.h - 2 * GAP) put([cut], [[r.x + GAP, r.y + GAP]], m.meio);
    }
  }

  // 3. Secundário: medida do bloco (de perto, ou selecionado), medida da ligação selecionada, entradas brutas e o nome
  // das peças grandes.
  for (const b of order) {
    const r = boxOfId.get(b.stage)!, on = o.selected === b.stage, hov = o.hover === b.stage;
    if (r.w < 24 || !(on || hov || z >= SIZE_ZOOM)) continue;
    const size = b.marker ? t('plNotToScale') : sizeText(b.rect) + (b.geo.estimate ? ` · ${t('plMapEstimate')}` : '');
    const line: Line = { s: size, font: SMALL, color: on ? th.ficsit : th.inkDim, h: 15 };
    put([line], [[r.x, r.y + r.h + GAP], [r.x + GAP, r.y + r.h - 15 - GAP]], b.stage);
  }
  for (const m of meios) {
    const on = o.selected === m.meio, hov = o.hover === m.meio;
    if (!(on || hov) || !m.geo || m.geo.tooLarge) continue;
    const r = boxOfId.get(m.meio)!;
    const extra = [sizeText(m.rect), m.geo.floors > 1 ? t('plMapFloors', fmt(m.geo.floors, 0)) : '', m.geo.estimate ? t('plMapEstimate') : ''].filter(Boolean).join(' · ');
    put([{ s: extra, font: SMALL, color: th.inkDim, h: 15 }], [[r.x, r.y + r.h + GAP], [r.x, r.y - 15 - GAP]], m.meio);
  }
  // Entradas brutas: uma etiqueta por item e bloco (não uma por fileira), atrás da ponta do primeiro toco.
  if (detail && z >= RAW_ZOOM) {
    const groups = new Map<string, { belts: BeltPath[]; own: string }>();
    for (const bp of scene.belts) {
      if (bp.role !== 'raw' || bp.pts.length < 2 || !visible(boxOf(bp.pts), cam, vw, vh)) continue;
      const [ex, ey] = bp.pts[bp.pts.length - 1];
      const own = blocks.find(b => ex >= b.rect.x - 1 && ex <= b.rect.x + b.rect.w + 1 && ey >= b.rect.y - 1 && ey <= b.rect.y + b.rect.h + 1)?.stage ?? '';
      const key = own + '|' + bp.item, g = groups.get(key);
      if (g) g.belts.push(bp); else groups.set(key, { belts: [bp], own });
    }
    for (const { belts, own } of groups.values()) {
      const first = belts[0], n = belts.length, unit = (x: number) => t(first.fluid ? 'plPerMinFluid' : 'plPerMin', x);
      const same = belts.every(x => Math.abs(x.rate - first.rate) < 0.05);
      const rate = n > 1 && same ? `${fmt(n, 0)} × ${unit(fmt(first.rate))}` : unit(fmt(belts.reduce((s, x) => s + x.rate, 0)));
      const line: Line = { s: `${o.names(first.item)} · ${rate}`, font: SMALL, color: o.colors[first.item] ?? th.flow, h: 15 };
      const [x0, y0] = first.pts[0], [x1, y1] = first.pts[1];
      const X = sx(x0), Y = sy(y0), w = lineW(line);
      const horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
      const behind: Cand = horiz ? (x1 > x0 ? [X - 4, Y - 7.5, 'right'] : [X + 4, Y - 7.5]) : (y1 > y0 ? [X, Y - 19, 'center'] : [X, Y + 4, 'center']);
      put([line], [behind, [X, Y - 19], [X - w, Y - 19]], own || null);
    }
  }
  if (detail) {
    for (const m of meios) {
      if (!m.geo || m.geo.tooLarge) continue;
      for (const p of m.geo.pieces) {
        const name = p.kind === 'sink' ? 'Awesome Sink' : p.label;
        if (!name || p.w * z < 70) continue;
        const c = toWorld([p.x + p.w / 2, p.y + p.h / 2], m.geo, { x: m.rect.x, y: m.rect.y, rot: m.rot });
        ctx.font = SMALL;
        const w = measure(name, SMALL), r = { x: sx(c[0]) - w / 2, y: sy(c[1]) - 7, w, h: 14 };
        if (placed.some(q => hit(q, r))) continue;
        ctx.fillStyle = th.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(name, sx(c[0]), sy(c[1]) + 1);
        placed.push(r);
      }
    }
  }

  // Régua de escala no canto inferior esquerdo.
  const meters = [...SCALES].reverse().find(s => s * z <= SCALE_MAX_PX) ?? SCALES[0];
  const len = meters * z, rx = 16, ry = vh - 18;
  drawLine({ s: '', font: SMALL, color: th.ink, h: 32 }, { x: rx - 8, y: ry - 22, w: Math.max(len, 40) + 16, h: 32 });
  ctx.strokeStyle = th.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx, ry - 4); ctx.lineTo(rx, ry); ctx.lineTo(rx + len, ry); ctx.lineTo(rx + len, ry - 4); ctx.stroke();
  ctx.font = SMALL; ctx.fillStyle = th.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(t('plMapScale', fmt(meters, 0)), rx, ry - 8);
  ctx.restore();
}
