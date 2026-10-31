// Desenho do mapa num canvas 2D: junta as partes de draw/. Duas vistas e a transição entre elas (t de 0 a 1):
// - Montar (t = 0): fundo pontilhado, cartões com a faixa de fileiras, esteiras animadas da saída à entrada,
//   uma por link, com o ponto no meio;
// - Planta (t = 1): o desenho em escala (grade, blocos, peças, ligações), os leques porta → fileira e as placas de nome.
// Nas duas: portas de 44 px pelo estado e o chip de cada ligação. Só desenha o que aparece na tela e o que as camadas
// deixam (layers: ícones, nomes, ligações, portas).
import { visible, type Camera } from '../model/map/camera.ts';
import { linkBezier, type ViewChip, type ViewGeo, type ViewPort } from '../model/map/cards.ts';
import type { Pt, Rect } from '../model/map/geo.ts';
import type { Badge } from '../model/badges.ts';
import type { ChipLabel } from '../model/chip.ts';
import type { Meio } from '../model/meio.ts';
import type { PortState } from '../model/portstate.ts';
import type { Scene } from '../model/map/scene.ts';
import type { ItemId, StageId } from '../model/types.ts';
import type { MapLayers } from '../model/map/layers.ts';
import { beltCurve, drawFans, strokeBelt, type WorldCtx } from './draw/belts.ts';
import { drawCard, drawMontarFloor, type CardText } from './draw/cards.ts';
import { drawChips } from './draw/chips.ts';
import { drawPlantLabels, makeLabels } from './draw/labels.ts';
import { drawPlantFloor, drawPlantWorld, drawRuler } from './draw/plant.ts';
import { FLASH_MS, PORT_R, PORT_ZOOM, drawPorts, viewPortId } from './draw/ports.ts';
import type { MapTheme } from './draw/theme.ts';

export { readTheme, type MapTheme } from './draw/theme.ts';
export { FLASH_MS, PORT_ZOOM } from './draw/ports.ts';
export type { CardText } from './draw/cards.ts';

export interface DrawOpts {
  // Selecionados: os blocos (um ou vários) ou a ligação.
  selected: ReadonlySet<string>; hover: string | null;
  colors: Record<string, string>; names: (item: ItemId) => string;
  theme: MapTheme;
  // t: 0 Montar, 1 Planta (a transição no meio); time: ms, para o tracejado das esteiras andar (fixo quando parado).
  t: number; time: number;
  // Placa de nome da Planta (receita, o número de máquinas em laranja, fileiras), já no idioma da tela. icon: id do
  // ícone; alert: o motivo do travado (de longe vai no lugar do sub).
  blockText: (stage: StageId) => { title: string; num?: string; sub: string; icon: string | null; alert: string };
  // Cartão da Montar, já no idioma da tela.
  card: (stage: StageId) => CardText;
  // Avisos do fluxo de cada bloco (os sinais de longe na Planta, o travado e a falta no cartão).
  badges: (stage: StageId) => Badge[];
  // Estado de cada porta (cor do anel e rótulo) e o texto de uma taxa com a unidade do item.
  portState: (block: StageId, side: 'in' | 'out', item: ItemId) => PortState | undefined;
  rate: (item: ItemId, x: number) => string;
  fluid: (item: ItemId) => boolean;
  // Chip de cada ligação (null: sem rótulo ainda) e o grupo dela (produtoras e consumidoras, para as esteiras).
  chip: (meio: string) => ChipLabel | null;
  meio: (meio: string) => Meio | undefined;
  // Porta sob o ponteiro (chave bloco|lado|item) e, puxando uma, a esteira provisória até o ponteiro (em px de tela):
  // as portas em lit brilham, as outras ficam a 30 %.
  portHover: string | null;
  wire: { from: { block: StageId; side: 'in' | 'out'; item: ItemId }; to: Pt; lit: Set<string> } | null;
  // Destaque passageiro de um bloco e/ou de uma porta (id do bloco, chave bloco|lado|item da porta) até `until`
  // (Date.now()).
  flash: { id: string; port?: string; until: number } | null;
  icon: (item: ItemId) => HTMLImageElement | null;
  // Camadas ligadas (desligada: não desenha; o MapView também tira do clique).
  layers: MapLayers;
  // Seleção de vários blocos: o que ela ocupa na Planta (mundo, m) e a medida já no idioma ("96 × 72 m · 12 × 9 fundações").
  // grips: as alças nos cantos e no meio das bordas (a área pode ser arrastada e redimensionada).
  selBox: { r: Rect; text: string; grips?: boolean } | null;
}

const near = (r: Rect, vw: number, vh: number, m: number) => r.x + r.w >= -m && r.y + r.h >= -m && r.x <= vw + m && r.y <= vh + m;
const boxOfPts = (pts: Pt[]): Rect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, view: ViewGeo, cam: Camera, vw: number, vh: number, opts: DrawOpts): void {
  const L0 = opts.layers;
  // Sem ícones: nenhum ícone em cartões, placas, portas e chips.
  const o: DrawOpts = L0.icons ? opts : { ...opts, icon: () => null };
  const th = o.theme, z = cam.zoom, t = Math.min(1, Math.max(0, o.t)), now = Date.now();
  const sx = (x: number) => (x - cam.x) * z, sy = (y: number) => (y - cam.y) * z;

  ctx.save();
  // Fundo: a chapa pontilhada da Montar e, por cima, o piso da Planta aparecendo com t.
  if (t < 1) drawMontarFloor(ctx, cam, vw, vh, th);
  if (t > 0) { ctx.globalAlpha = t; drawPlantFloor(ctx, cam, vw, vh, th); ctx.globalAlpha = 1; }

  const blocks = t > 0 ? scene.blocks.filter(b => visible(b.rect, cam, vw, vh)) : [];
  const meios = t > 0 && L0.links ? scene.meios.filter(m => visible(m.rect, cam, vw, vh)) : [];

  // Planta em escala, em metros.
  if (t > 0) {
    ctx.save();
    ctx.globalAlpha = t;
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);
    const w: WorldCtx = { ctx, cam, vw, vh, th, colors: o.colors };
    drawPlantWorld(w, scene, blocks, meios, o);
    ctx.restore();
  }

  // Portas e chips que aparecem (na Planta de longe, só puxando uma porta).
  const showPorts = L0.ports && (t < 0.5 || z >= PORT_ZOOM || !!o.wire);
  const byKey = new Map<string, ViewPort>(view.ports.map(p => [viewPortId(p), p]));
  const ports = showPorts ? view.ports.filter(p => near({ x: p.x, y: p.y, w: 0, h: 0 }, vw, vh, PORT_R + 160)) : [];
  // Portas, rótulos, chips e esteiras são desenhados no tamanho de 100 % numa tela escalada por k (a do cartão na
  // Montar): o desenho cresce e encolhe junto com o mapa. Os pontos vêm em px de tela e passam para a tela escalada.
  const k = view.k, vk = vw / k, hk = vh / k;
  const kPt = (p: Pt): Pt => [p[0] / k, p[1] / k];
  const kPort = (p: ViewPort): ViewPort => ({ ...p, x: p.x / k, y: p.y / k, r: p.r / k, lanes: p.lanes.map(kPt) });
  const kChip = (c: ViewChip): ViewChip => ({ ...c, x: c.x / k, y: c.y / k, w: c.w / k, h: c.h / k });
  const kRect = (r: Rect): Rect => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });

  // Leques da Planta: porta → fileiras (com as ligações e as portas).
  if (t > 0 && showPorts && L0.links) {
    ctx.globalAlpha = t;
    ctx.save(); ctx.scale(k, k);
    drawFans(ctx, view.ports.filter(p => p.lanes.length && near(boxOfPts([[p.x, p.y], ...p.lanes]), vw, vh, 4)).map(kPort), o.colors, th);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Montar: uma esteira por link, da saída à entrada, com o ponto no meio (como no Modeler), por baixo dos cartões.
  if (t < 1) {
    ctx.globalAlpha = 1 - t;
    ctx.save(); ctx.scale(k, k);
    for (const c of L0.links ? view.chips : []) {
      const l = c.link, lab = o.chip(c.meio);
      if (!l) continue;
      const qa = byKey.get(`${l.from}|out|${l.item}`), qb = byKey.get(`${l.to}|in|${l.item}`);
      if (!qa || !qb) continue;
      // A curva cabe na caixa das pontas e das alças: fora da tela, pula.
      const bz = linkBezier([qa.x, qa.y], [qb.x, qb.y], view.k, l.bend), xs = bz.map(p => p[0]), ys = bz.map(p => p[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys);
      if (!near({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }, vw, vh, 8)) continue;
      // Vermelha só se a consumidora deste link fica com falta (a vizinha curta não pinta a que está cheia).
      const short = !!lab?.short && o.portState(l.to, 'in', l.item)?.kind === 'deficit';
      const [p0, p1, p2, p3] = bz.map(kPt), path = new Path2D();
      path.moveTo(p0[0], p0[1]); path.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
      strokeBelt(ctx, path, { color: o.colors[l.item] ?? th.flow, fluid: o.fluid(l.item), short, selected: o.selected.has(c.meio) }, o.time, th);
    }
    ctx.restore();
    // Cartões.
    for (const b of view.blocks) {
      if (!near(b.rect, vw, vh, 8)) continue;
      const bs = o.badges(b.id);
      const flash = o.flash && o.flash.id === b.id && now < o.flash.until ? (o.flash.until - now) / FLASH_MS : 0;
      const card = o.card(b.id);
      drawCard(ctx, b, L0.names ? card : { ...card, title: '', building: '', alt: false }, {
        selected: o.selected.has(b.id), hover: o.hover === b.id, flash: Math.min(1, flash),
        lock: bs.some(x => x.kind === 'deadlock' || x.kind === 'stalled'), bad: bs.some(x => x.kind === 'deficit'),
      }, th, o.icon);
    }
    ctx.globalAlpha = 1;
  }

  // Portas e os rótulos de estado; depois os chips, por cima.
  const chips = !L0.links ? [] : view.chips.filter(c => near({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }, vw, vh, 4)).map(kChip);
  const chipRects = chips.map(c => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }));
  ctx.save(); ctx.scale(k, k);
  const portLabels = drawPorts(ctx, ports.map(kPort), o, vk, hk, now, chipRects).map(kRect);
  drawChips(ctx, chips, o);
  ctx.restore();

  // Planta: placas de nome, medidas e a régua.
  if (t >= 0.5) {
    ctx.globalAlpha = (t - 0.5) * 2;
    const boxes: { id: string; r: Rect }[] = [];
    for (const b of blocks) boxes.push({ id: b.stage, r: { x: sx(b.rect.x), y: sy(b.rect.y), w: b.rect.w * z, h: b.rect.h * z } });
    for (const m of meios) boxes.push({ id: m.meio, r: { x: sx(m.rect.x), y: sy(m.rect.y), w: m.rect.w * z, h: m.rect.h * z } });
    const L = makeLabels(ctx, vw, vh, th, o.icon, boxes);
    L.placed.push(...portLabels, ...chipRects.map(kRect));
    drawRuler(ctx, z, th, L);
    // Seleção de vários blocos: o contorno tracejado do que ela ocupa e a medida em fundações, antes dos nomes.
    if (o.selBox) {
      const s = o.selBox.r, r = { x: sx(s.x), y: sy(s.y), w: s.w * z, h: s.h * z };
      ctx.save();
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = th.ficsit;
      ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
      if (o.selBox.grips) {
        ctx.setLineDash([]); ctx.fillStyle = th.ficsit;
        const G = 8;
        for (const gx of [r.x, r.x + r.w / 2, r.x + r.w]) for (const gy of [r.y, r.y + r.h / 2, r.y + r.h]) {
          if (gx === r.x + r.w / 2 && gy === r.y + r.h / 2) continue;
          ctx.fillRect(Math.round(gx - G / 2), Math.round(gy - G / 2), G, G);
        }
      }
      ctx.restore();
      const line = { s: o.selBox.text, font: `600 12px ${th.body}`, color: th.ficsit, h: 18 };
      L.put([line], [[r.x, r.y - 18 - 4], [r.x, r.y + r.h + 4], [r.x + 4, r.y + 4]], null, true, true);
    }
    drawPlantLabels(ctx, scene, cam, vw, vh, blocks, meios, o, L, new Map(boxes.map(b => [b.id, b.r])));
    ctx.globalAlpha = 1;
  }

  // Esteira provisória da porta puxada até o ponteiro, por cima de tudo.
  const wire = o.wire, a = wire && byKey.get(viewPortId(wire.from));
  if (wire && a) {
    ctx.save(); ctx.scale(k, k);
    const path = beltCurve([a.x / k, a.y / k], a.dir, kPt(wire.to), a.dir);
    strokeBelt(ctx, path, { color: th.ficsit, fluid: false, short: false, selected: false, temp: true }, o.time, th);
    ctx.restore();
  }
  ctx.restore();
}
