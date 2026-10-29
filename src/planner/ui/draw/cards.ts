// Cartão da Montar, enxuto como o nó do Modeler: o nome em cima, o ícone do prédio com o número de máquinas no meio (ou
// "sem limite"/"travado", "fixado" quando é limite meu) e, numa faixa embaixo, o prédio, o selo Alt e o clock quando
// ≠ 100 %. As fileiras ficam na miniatura do painel. Marcador (origem e sobra): o mesmo, com a taxa grande no meio.
// Desenhado no tamanho de 100 % (CARD_W, MARK_W) e escalado para o retângulo da vista (na transição ele encolhe ou
// cresce até o bloco real, sumindo): o mesmo desenho em qualquer zoom, como no Modeler.
import { t } from '../../../i18n/index.js';
import { MONTAR_REF, PORT_D, cardSize, type ViewBlock } from '../../model/map/cards.ts';
import type { ItemId } from '../../model/types.ts';
import type { MapTheme } from './theme.ts';
import { fitText } from './text.ts';

// O que o cartão mostra, já no idioma da tela (montado no MapView). count: o número grande, como no Modeler: as
// máquinas rodando, quebradas ("29,15"), ou "sem limite"/"travado"; sub: a linha pequena embaixo (o fixado, "de 30 ·
// fixado", ou quantas construir, "10 máquinas"); fixed: as máquinas fixadas; clock: "150%" quando ≠ 100; ins/outs: itens na ordem das portas; marker: origem ou
// sobra; rate: a taxa grande do marcador e unit, a unidade pequena ao lado (campo a mais que o plano: o protótipo põe
// "/min" menor que o número).
export interface CardText {
  title: string; building: string; icon: string | null; badge?: string | null; count: string; sub: string; fixed: boolean; clock: string | null; alt: boolean;
  ins: ItemId[]; outs: ItemId[]; marker: boolean; rate: string; unit: string;
}
export interface CardLook { selected: boolean; hover: boolean; lock: boolean; bad: boolean; flash: number }

// TOP: a faixa do nome; FOOT: a de baixo (prédio, Alt e clock).
const TOP = 26, FOOT = 22, ICON = 40, PAD_X = 12;
// Ícone pequeno no canto de baixo do ícone grande, num disco da cor da chapa (s: lado do ícone grande).
function drawBadge(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, s: number, th: MapTheme): void {
  if (!img) return;
  const b = s * 0.62, cx = x + s - b / 2 + s * 0.12, cy = y + s - b / 2 + s * 0.1;
  ctx.fillStyle = th.paper; ctx.beginPath(); ctx.arc(cx, cy, b / 2 + s * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(img, cx - b / 2, cy - b / 2, b, b);
}
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

  // Três faixas, como o nó do Modeler com os textos: o nome em cima; no meio o ícone do prédio (com o item no canto) e o
  // número grande (máquinas, ou a taxa do marcador), centrados no espaço que sobra; embaixo, numa faixa mais escura, o
  // prédio (com o selo Alt) e o clock. A folga dos lados com porta é a metade dela que entra no cartão, mais 6 px (as
  // portas encolhem com o cartão, então a folga é a mesma em qualquer zoom).
  const portPad = PORT_D / 2 + 6;
  const padL = c.ins.length ? portPad : PAD_X, padR = c.outs.length ? portPad : PAD_X, inner = W - padL - padR;
  ctx.fillStyle = th.bench;
  ctx.fillRect(0, H - FOOT, W, FOOT);
  ctx.fillStyle = th.line; ctx.fillRect(0, H - FOOT, W, 1);

  ctx.textBaseline = 'alphabetic';
  if (c.title) {
    const tt = fitText(ctx, c.title, inner, p => `600 ${p}px ${th.display}`, 13, 10);
    ctx.font = tt.font; ctx.fillStyle = th.ink; ctx.textAlign = 'center';
    ctx.fillText(tt.s, padL + inner / 2, 19);
  }

  // Meio: o grupo ícone + número centrado na largura e na altura entre o nome e a faixa de baixo.
  const img = c.icon ? icon(c.icon) : null;
  const big = fitText(ctx, c.marker ? c.rate : c.count, inner - (img ? ICON + 10 : 0) - (c.marker && c.unit ? 34 : 0), p => `700 ${p}px ${th.display}`, 26, 14);
  ctx.font = big.font;
  const bw = ctx.measureText(big.s).width;
  const small = c.marker ? c.unit : c.sub || t(c.fixed ? 'plCardFixed' : 'plCardMachines');
  ctx.font = `11px ${th.body}`;
  const sw = ctx.measureText(small).width;
  const textW = c.marker ? bw + (small ? 5 + sw : 0) : Math.max(bw, sw);
  const groupW = (img ? ICON + 10 : 0) + textW;
  const x0 = padL + Math.max(0, (inner - groupW) / 2), cy = (TOP + H - FOOT) / 2;
  if (img) {
    ctx.drawImage(img, x0, cy - ICON / 2, ICON, ICON);
    if (c.badge) drawBadge(ctx, icon(c.badge), x0, cy - ICON / 2, ICON, th);
  }
  const tx = x0 + (img ? ICON + 10 : 0);
  ctx.textAlign = 'left';
  ctx.font = big.font; ctx.fillStyle = c.fixed && !c.marker ? th.ficsitSoft : th.ink;
  if (c.marker) {
    ctx.fillText(big.s, tx, cy + 9);
    if (small) { ctx.font = `11px ${th.body}`; ctx.fillStyle = th.inkSoft; ctx.fillText(small, tx + bw + 5, cy + 9); }
  } else {
    ctx.fillText(big.s, tx, cy + 4);
    ctx.font = `11px ${th.body}`; ctx.fillStyle = c.fixed ? th.ficsitSoft : th.inkSoft;
    ctx.fillText(small, tx, cy + 18);
  }

  // Faixa de baixo: o prédio, o selo Alt e o clock (em azul), centrados.
  const foot: { s: string; color: string; box?: true }[] = [];
  if (c.building) foot.push({ s: c.building, color: th.inkSoft });
  if (c.alt) foot.push({ s: 'Alt', color: th.inkSoft, box: true });
  if (c.clock) foot.push({ s: c.clock, color: th.holo });
  if (foot.length) {
    const fy = H - FOOT / 2 + 4, gap = 6;
    let fs = 11, widths: number[] = [];
    const measure = () => { ctx.font = `${fs}px ${th.body}`; widths = foot.map(x => ctx.measureText(x.s).width + (x.box ? 6 : 0)); };
    measure();
    while (fs > 9 && widths.reduce((a, w) => a + w, 0) + gap * (foot.length - 1) > W - 2 * PAD_X) { fs--; measure(); }
    // Ainda não cabendo, o prédio (o primeiro) encolhe com reticências.
    const rest = widths.slice(1).reduce((a, w) => a + w + gap, 0);
    if (c.building && widths[0] + rest > W - 2 * PAD_X) {
      const f = fitText(ctx, c.building, W - 2 * PAD_X - rest, () => `${fs}px ${th.body}`, fs);
      foot[0].s = f.s; widths[0] = ctx.measureText(f.s).width;
    }
    let x = (W - widths.reduce((a, w) => a + w, 0) - gap * (foot.length - 1)) / 2;
    ctx.font = `${fs}px ${th.body}`; ctx.textAlign = 'left';
    foot.forEach((it, i) => {
      ctx.fillStyle = it.color;
      if (it.box) {
        ctx.strokeStyle = it.color; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, fy - fs + 0.5, widths[i] - 1, fs + 2);
        ctx.fillText(it.s, x + 3, fy);
      } else ctx.fillText(it.s, x, fy);
      x += widths[i] + gap;
    });
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
