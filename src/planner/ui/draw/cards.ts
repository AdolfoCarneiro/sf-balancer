// Cartão da Montar, enxuto como o nó do Modeler: chapa com o ícone do prédio, nome, prédio + selo Alt, número de máquinas
// (ou "sem limite"/"travado", "fixado" quando é limite meu) e o clock quando ≠ 100 %. As fileiras ficam na miniatura do
// painel. Marcador (origem e sobra): ícone, nome e a taxa grande.
// Desenhado no tamanho de 100 % (CARD_W, MARK_W) e escalado para o retângulo da vista (na transição ele encolhe ou
// cresce até o bloco real, sumindo).
import { t } from '../../../i18n/index.js';
import { MARK_W, MONTAR_REF, PORT_D, cardSize, type ViewBlock } from '../../model/map/cards.ts';
import type { ItemId } from '../../model/types.ts';
import type { MapTheme } from './theme.ts';
import { fitText, wrapText } from './text.ts';

// O que o cartão mostra, já no idioma da tela (montado no MapView). count: o número (ou "sem limite"/"travado");
// fixed: as máquinas fixadas; clock: "150%" quando ≠ 100; ins/outs: itens na ordem das portas; marker: origem ou
// sobra; rate: a taxa grande do marcador e unit, a unidade pequena ao lado (campo a mais que o plano: o protótipo põe
// "/min" menor que o número).
export interface CardText {
  title: string; building: string; icon: string | null; count: string; fixed: boolean; clock: string | null; alt: boolean;
  ins: ItemId[]; outs: ItemId[]; marker: boolean; rate: string; unit: string;
}
export interface CardLook { selected: boolean; hover: boolean; lock: boolean; bad: boolean; flash: number }

const HEAD = 62, ICON = 42, PAD_X = 14;

export function drawCard(ctx: CanvasRenderingContext2D, vb: ViewBlock, c: CardText, look: CardLook, th: MapTheme,
  icon: (id: string) => HTMLImageElement | null): void {
  const size = cardSize(c.marker ? 'marker' : 'recipe', c.ins.length, c.outs.length);
  const W = size.w, H = size.h, r = vb.rect;
  if (r.w <= 1 || r.h <= 1) return;
  const kx = r.w / W, ky = r.h / H, px = 1 / Math.min(kx, ky);   // 1 px de tela no referencial do cartão
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(kx, ky);

  // Chapa e borda (selecionado: laranja 2 px com um anel por fora; travado: amarela tracejada; falta: coral).
  ctx.fillStyle = th.plate2;
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = (look.selected ? 2 : 1) * px;
  ctx.strokeStyle = look.selected ? th.ficsit : look.lock ? th.lock : look.bad ? th.deficit : look.hover ? th.lineHi : th.line;
  if (look.lock && !look.selected) ctx.setLineDash([6 * px, 4 * px]);
  ctx.strokeRect(0, 0, W, H);
  ctx.setLineDash([]);
  if (look.selected) {
    ctx.lineWidth = 2 * px;
    ctx.strokeRect(-4 * px, -4 * px, W + 8 * px, H + 8 * px);
  }
  if (look.flash > 0) {
    const g = (1 - look.flash) * 22 * px;
    ctx.save();
    ctx.globalAlpha *= look.flash;
    ctx.lineWidth = 3 * px; ctx.strokeStyle = th.ficsit;
    ctx.strokeRect(-g, -g, W + 2 * g, H + 2 * g);
    ctx.restore();
  }

  // Cabeçalho: ícone do prédio, nome (até 2 linhas) e o prédio com o selo Alt; à direita o número. Na receita as portas
  // ficam na altura do cabeçalho: a folga dos lados é a metade da porta (44 px de tela) que entra no cartão, mais 6 px,
  // no referencial do cartão (de longe as portas somem: no máximo 44).
  const pad = c.marker ? PAD_X : Math.min(44, Math.max(PAD_X, (PORT_D / 2 + 6) * px));
  const img = c.icon ? icon(c.icon) : null;
  if (img) ctx.drawImage(img, pad, (HEAD - ICON) / 2, ICON, ICON);
  const tx = pad + ICON + 8;
  let right = W - pad;
  if (!c.marker) {
    const num = fitText(ctx, c.count, 72, p => `700 ${p}px ${th.display}`, 26, 14);
    ctx.font = num.font; ctx.fillStyle = th.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(num.s, W - pad, 34);
    const nw = ctx.measureText(num.s).width;
    ctx.font = `11px ${th.body}`; ctx.fillStyle = c.fixed ? th.ficsitSoft : th.inkSoft;
    const lab = t(c.fixed ? 'plCardFixed' : 'plCardMachines');
    ctx.fillText(lab, W - pad, 47);
    if (c.clock) { ctx.fillStyle = th.holo; ctx.fillText(c.clock, W - pad, 58); }
    right = W - pad - Math.max(nw, ctx.measureText(lab).width) - 8;
  }
  const nameW = right - tx;
  ctx.font = `600 14px ${th.display}`; ctx.fillStyle = th.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const lines = wrapText(ctx, c.title, nameW, 2);
  const top = lines.length > 1 ? 21 : 27;
  lines.forEach((l, i) => ctx.fillText(l, tx, top + i * 15));
  const by = top + (lines.length - 1) * 15 + 15;
  const altW = c.alt ? 24 : 0;
  const bld = fitText(ctx, c.building, nameW - altW, p => `${p}px ${th.body}`, 12, 10);
  ctx.font = bld.font; ctx.fillStyle = th.inkSoft;
  ctx.fillText(bld.s, tx, by);
  if (c.alt) {
    const ax = tx + ctx.measureText(bld.s).width + 6;
    ctx.strokeStyle = th.inkSoft; ctx.lineWidth = 1;
    ctx.strokeRect(ax + 0.5, by - 10.5, 20, 12);
    ctx.font = `10px ${th.body}`; ctx.fillText('Alt', ax + 3, by - 1);
  }

  if (c.marker) {
    // Taxa grande sob um filete.
    const y = HEAD + 4;
    ctx.fillStyle = th.line; ctx.fillRect(0, y, W, 1);
    ctx.font = `700 26px ${th.display}`; ctx.fillStyle = th.ink; ctx.textAlign = 'left';
    const rate = fitText(ctx, c.rate, MARK_W - 2 * PAD_X - 60, p => `700 ${p}px ${th.display}`, 26, 14);
    ctx.font = rate.font; ctx.fillText(rate.s, PAD_X, y + 33);
    const rw = ctx.measureText(rate.s).width;
    ctx.font = `12px ${th.body}`; ctx.fillStyle = th.inkSoft; ctx.fillText(c.unit, PAD_X + rw + 6, y + 33);
  }
  ctx.restore();
}

// Fundo da Montar: chapa escura com pontos a cada 6 m (24 px a 100 %), presos ao mundo; de longe demais, só a chapa.
// Os pontos vêm de um ladrilho de um ponto (refeito quando o zoom, a escala da tela ou a cor mudam) repetido por um
// padrão, em vez de um fillRect por ponto (perto de 30 mil por quadro no zoom mínimo).
let floorTile: { key: string; pat: CanvasPattern; n: number } | null = null;
export function drawMontarFloor(ctx: CanvasRenderingContext2D, cam: { x: number; y: number; zoom: number }, vw: number, vh: number, th: MapTheme): void {
  ctx.fillStyle = th.paper;
  ctx.fillRect(0, 0, vw, vh);
  const k = cam.zoom / MONTAR_REF, step = 6, f = step * cam.zoom;   // f: px de tela entre dois pontos
  if (24 * k < 8) return;
  const r = Math.min(1.6, Math.max(0.8, 1.3 * k));
  const dpr = ctx.getTransform().a || 1, n = Math.max(1, Math.round(f * dpr)), d = 2 * r * n / f;
  const key = `${n}|${d.toFixed(2)}|${th.dot}`;
  if (!floorTile || floorTile.key !== key) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = n;
    const tc = tile.getContext('2d');
    if (!tc) return;
    tc.fillStyle = th.dot;
    tc.fillRect(n / 2 - d / 2, n / 2 - d / 2, d, d);
    const pat = ctx.createPattern(tile, 'repeat');
    if (!pat) return;
    floorTile = { key, pat, n };
  }
  // O centro do ladrilho cai sobre os pontos do mundo (múltiplos de `step`).
  const ox = ((((-cam.x) % step) + step) % step) * cam.zoom - f / 2, oy = ((((-cam.y) % step) + step) % step) * cam.zoom - f / 2;
  floorTile.pat.setTransform(new DOMMatrix().translate(ox, oy).scale(f / floorTile.n));
  ctx.fillStyle = floorTile.pat;
  ctx.fillRect(0, 0, vw, vh);
}
