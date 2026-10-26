// Chip da ligação (os dois modos): retângulo CHIP_W × CHIP_H com, em cima, o ícone do item e quanto passa, e embaixo o
// glifo do tipo (balancer, direto, cano) e o texto ("6 → 8", "direto", "3 → 4 + sink", "cano 2 → 6"). Borda pelo tipo:
// balancer laranja, falta na ponta de lá coral, selecionado laranja 2 px com um anel por fora.
import { fmt, t } from '../../../i18n/index.js';
import type { ViewChip } from '../../model/map/cards.ts';
import type { ChipKind, ChipLabel } from '../../model/chip.ts';
import type { DrawOpts } from '../mapDraw.ts';
import { fitText } from './text.ts';

// Os glifos do protótipo (GLYPH), em caminhos SVG; size: o lado da caixa de origem.
const GLYPH: Record<'bal' | 'loop' | 'direct' | 'pipe', { size: number; d: string[]; dashed?: number }> = {
  bal: { size: 22, d: ['M2 6h6l6 10h6', 'M2 16h6l6-10h6'] },
  loop: { size: 22, d: ['M2 8h6l6 8h6', 'M2 16h6l6-8h6', 'M17 8c0-5-12-5-12 0'], dashed: 2 },
  direct: { size: 20, d: ['M2 6h16', 'M2 14h16'] },
  pipe: { size: 20, d: ['M2 10h16', 'M14 10a4 4 0 1 1-8 0a4 4 0 1 1 8 0'] },
};
let paths: Map<string, Path2D[]> | null = null;
const glyphPaths = (g: keyof typeof GLYPH): Path2D[] => {
  paths ??= new Map(Object.entries(GLYPH).map(([k, v]) => [k, v.d.map(d => new Path2D(d))]));
  return paths.get(g)!;
};
const GLYPH_OF: Partial<Record<ChipKind, keyof typeof GLYPH>> = { balancer: 'bal', sink: 'bal', direct: 'direct', pipe: 'pipe' };

export function chipText(c: ChipLabel): string {
  const s = fmt(c.nS, 0), d = fmt(c.nD, 0);
  switch (c.kind) {
    case 'calc': return t('plChipCalc');
    case 'unbounded': return t('plChipUnbounded');
    case 'tooLarge': return t('plChipTooLarge');
    case 'direct': return t('plChipDirect');
    case 'sink': return t('plChipSink', s, d);
    case 'pipe': return t('plChipPipe', s, d);
    default: return t('plChipLines', s, d);
  }
}

const GW = 18;   // glifo desenhado com 18 px

export function drawChips(ctx: CanvasRenderingContext2D, chips: ViewChip[], o: DrawOpts): void {
  const th = o.theme;
  for (const c of chips) {
    const lab = o.chip(c.meio);
    if (!lab) continue;
    const on = o.selected.has(c.meio), hov = o.hover === c.meio;
    const x = c.x - c.w / 2, y = c.y - c.h / 2;
    ctx.fillStyle = on ? '#2b2010' : th.bench;
    ctx.fillRect(x, y, c.w, c.h);
    const bal = lab.kind === 'balancer' || lab.kind === 'sink';
    ctx.strokeStyle = on ? th.ficsit : lab.short ? th.deficit : bal ? th.ficsit : hov ? th.lineHi : th.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, c.w - 2, c.h - 2);
    if (on) { ctx.strokeRect(x - 3, y - 3, c.w + 6, c.h + 6); }

    // Em cima: ícone, taxa e a unidade.
    const rate = lab.rate === null ? t('plUnbounded') : fmt(lab.rate);
    const unit = lab.rate === null ? '' : t(o.fluid(lab.item) ? 'plPerMinFluid' : 'plPerMin', '').trim();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = `600 12px ${th.body}`;
    const rw = ctx.measureText(rate).width;
    ctx.font = `500 11px ${th.body}`;
    const uw = ctx.measureText(unit).width;
    const img = o.icon(lab.item), iw = img ? 18 + 4 : 0;
    let tx = c.x - (iw + rw + 3 + uw) / 2;
    const ty = y + 16;
    if (img) { ctx.drawImage(img, tx, ty - 9, 18, 18); tx += iw; }
    ctx.font = `600 12px ${th.body}`; ctx.fillStyle = th.inkMid; ctx.fillText(rate, tx, ty + 1);
    ctx.font = `500 11px ${th.body}`; ctx.fillStyle = th.inkSoft; ctx.fillText(unit, tx + rw + 3, ty + 1);

    // Embaixo: glifo e o tipo.
    const g = GLYPH_OF[lab.kind];
    const color = lab.short ? th.deficitInk : bal ? th.ficsitSoft : th.ink;
    const gw = g ? GW + 5 : 0;
    const k = fitText(ctx, chipText(lab), c.w - 12 - gw, px => `600 ${px}px ${th.display}`, 15, 11);
    ctx.font = k.font;
    const kw = ctx.measureText(k.s).width;
    let kx = c.x - (gw + kw) / 2;
    const ky = y + c.h - 16;
    if (g) {
      const G = GLYPH[g], s = GW / G.size;
      ctx.save();
      ctx.translate(kx, ky - GW / 2); ctx.scale(s, s);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      glyphPaths(g).forEach((p, i) => { ctx.setLineDash(G.dashed && i === 2 ? [G.dashed, G.dashed] : []); ctx.stroke(p); });
      ctx.restore();
      kx += gw;
    }
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(k.s, kx, ky + 1);
  }
}
