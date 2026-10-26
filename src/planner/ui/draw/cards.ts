// Cartão da Montar: chapa com o ícone do prédio, nome, prédio + selo Alt, número de máquinas (ou "sem limite"/"travado")
// e a faixa de fileiras (por fileira: uma barra fina por entrada na cor do item, os quadrados das máquinas e uma barra por
// saída), com o rodapé "6 fileiras de 7" e "455/min cada". Marcador (origem e sobra): ícone, nome e a taxa grande.
// Desenhado no tamanho de 100 % (CARD_W, MARK_W) e escalado para o retângulo da vista (na transição ele encolhe ou
// cresce até o bloco real, sumindo).
import { fmt, t } from '../../../i18n/index.js';
import { CARD_W, MARK_W, MONTAR_REF, STRIP_W, cardSize, stripRows, type ViewBlock } from '../../model/map/cards.ts';
import type { ItemId } from '../../model/types.ts';
import type { MapTheme } from './theme.ts';
import { fitText, wrapText } from './text.ts';

// O que o cartão mostra, já no idioma da tela (montado no MapView). count: o número (ou "sem limite"/"travado");
// fixed: as máquinas fixadas; clock: "150%" quando ≠ 100; rows: máquinas por fileira; ins/outs: itens na ordem das
// portas; marker: origem ou sobra; rate: a taxa grande do marcador e unit, a unidade pequena ao lado (campo a mais
// que o plano: o protótipo põe "/min" menor que o número).
export interface CardText {
  title: string; building: string; icon: string | null; count: string; fixed: boolean; clock: string | null; alt: boolean;
  rowsText: string; perRowText: string; rows: number[]; ins: ItemId[]; outs: ItemId[]; marker: boolean; rate: string;
  unit: string;
}
export interface CardLook { selected: boolean; hover: boolean; lock: boolean; bad: boolean; flash: number }

const HEAD = 62, ICON = 42, PAD_X = 14, STRIP_X = (CARD_W - STRIP_W) / 2;

export function drawCard(ctx: CanvasRenderingContext2D, vb: ViewBlock, c: CardText, look: CardLook, th: MapTheme,
  colors: Record<string, string>, icon: (id: string) => HTMLImageElement | null): void {
  const size = cardSize(c.marker ? 'marker' : 'recipe', c.rows, c.ins.length, c.outs.length);
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
    ctx.globalAlpha *= look.flash;
    ctx.lineWidth = 3 * px; ctx.strokeStyle = th.ficsit;
    ctx.strokeRect(-g, -g, W + 2 * g, H + 2 * g);
    ctx.globalAlpha /= look.flash;
  }

  // Cabeçalho: ícone do prédio, nome (até 2 linhas) e o prédio com o selo Alt; à direita o número.
  const img = c.icon ? icon(c.icon) : null;
  if (img) ctx.drawImage(img, PAD_X, (HEAD - ICON) / 2, ICON, ICON);
  const tx = PAD_X + ICON + 8;
  let right = W - PAD_X;
  if (!c.marker) {
    const num = fitText(ctx, c.count, 84, p => `700 ${p}px ${th.display}`, 26, 14);
    ctx.font = num.font; ctx.fillStyle = th.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(num.s, W - PAD_X, 34);
    const nw = ctx.measureText(num.s).width;
    ctx.font = `11px ${th.body}`; ctx.fillStyle = c.fixed ? th.ficsitSoft : th.inkSoft;
    const lab = t(c.fixed ? 'plCardFixed' : 'plCardMachines');
    ctx.fillText(lab, W - PAD_X, 47);
    if (c.clock) { ctx.fillStyle = th.holo; ctx.fillText(c.clock, W - PAD_X, 58); }
    right = W - PAD_X - Math.max(nw, ctx.measureText(lab).width) - 8;
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
    ctx.restore();
    return;
  }

  // Faixa de fileiras.
  const strip = stripRows(c.rows.length ? c.rows : [0]);
  const per = Math.max(1, ...c.rows), gap = per > 30 ? 1 : 2;
  const tw = Math.max(1.5, Math.min(16, (STRIP_W - (per - 1) * gap) / per));
  let y = HEAD + 6;
  const stripH = strip.reduce((s, row) => s + (row.repeat !== undefined ? 20 : c.ins.length * 5 + 14 + c.outs.length * 5 + 5), 0) + 12;
  ctx.fillStyle = th.bench;
  ctx.fillRect(STRIP_X - 8, HEAD, STRIP_W + 16, stripH);
  ctx.save();
  ctx.beginPath(); ctx.rect(STRIP_X, HEAD, STRIP_W, stripH); ctx.clip();
  for (const row of strip) {
    if (row.repeat !== undefined) {
      ctx.font = `12px ${th.body}`; ctx.fillStyle = th.inkSoft; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('plCardMoreRows', fmt(row.repeat, 0)), STRIP_X, y + 9);
      y += 20; continue;
    }
    const n = row.machines, rw = Math.min(STRIP_W, n * tw + Math.max(0, n - 1) * gap);
    ctx.globalAlpha *= 0.9;
    for (const it of c.ins) { ctx.fillStyle = colors[it] ?? th.flow; ctx.fillRect(STRIP_X, y, rw, 3); y += 5; }
    ctx.globalAlpha /= 0.9;
    // Muitas máquinas: um retângulo só por trecho contínuo seria igual; desenha uma a uma até a borda da faixa.
    ctx.fillStyle = th.cardMachine;
    for (let m = 0; m < n && m * (tw + gap) < STRIP_W; m++) ctx.fillRect(STRIP_X + m * (tw + gap), y, tw, 12);
    ctx.fillStyle = th.cardMachineHi;
    for (let m = 0; m < n && m * (tw + gap) < STRIP_W; m++) ctx.fillRect(STRIP_X + m * (tw + gap), y, tw, 2);
    y += 14;
    ctx.globalAlpha *= 0.9;
    for (const it of c.outs) { ctx.fillStyle = colors[it] ?? th.flow; ctx.fillRect(STRIP_X, y, STRIP_W, 3); y += 5; }
    ctx.globalAlpha /= 0.9;
    y += 5;
  }
  ctx.restore();

  // Rodapé: fileiras e a taxa por fileira.
  const fy = HEAD + stripH + 18;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `12px ${th.body}`;
  const per2 = c.perRowText ? ctx.measureText(c.perRowText).width : 0;
  ctx.textAlign = 'right'; ctx.fillStyle = th.inkSoft;
  if (c.perRowText) ctx.fillText(c.perRowText, STRIP_X + STRIP_W, fy);
  const rows = fitText(ctx, c.rowsText, STRIP_W - per2 - 8, p => `${p}px ${th.body}`, 12, 10);
  ctx.font = rows.font; ctx.textAlign = 'left'; ctx.fillStyle = th.inkMid;
  ctx.fillText(rows.s, STRIP_X, fy);
  ctx.restore();
}

// Fundo da Montar: chapa escura com pontos a cada 6 m (24 px a 100 %), presos ao mundo; de longe demais, só a chapa.
export function drawMontarFloor(ctx: CanvasRenderingContext2D, cam: { x: number; y: number; zoom: number }, vw: number, vh: number, th: MapTheme): void {
  ctx.fillStyle = th.paper;
  ctx.fillRect(0, 0, vw, vh);
  const k = cam.zoom / MONTAR_REF, f = 24 * k;
  if (f < 8) return;
  const r = Math.min(1.6, Math.max(0.8, 1.3 * k)), step = 6;
  ctx.fillStyle = th.dot;
  for (let x = Math.ceil(cam.x / step) * step; (x - cam.x) * cam.zoom <= vw + r; x += step) {
    const px = (x - cam.x) * cam.zoom;
    for (let y = Math.ceil(cam.y / step) * step; (y - cam.y) * cam.zoom <= vh + r; y += step) ctx.fillRect(px - r, (y - cam.y) * cam.zoom - r, 2 * r, 2 * r);
  }
}
