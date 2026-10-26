// Rótulos em px de tela (legíveis em qualquer zoom), postos por um posicionador guloso: primeiro os avisos (sempre
// aparecem), depois os nomes (o selecionado antes), por fim o secundário (fileiras, medidas, entradas brutas). Cada
// um vai para o primeiro lugar livre entre os seus candidatos (sem cobrir outro rótulo nem outro bloco); o secundário
// some se não couber. De perto o nome nunca é cortado: sem lugar livre ele pode cobrir um bloco vizinho (nunca outro
// rótulo), e só some se nem assim couber (o selecionado e o que está sob o ponteiro aparecem sempre).
import { fmt, t } from '../../../i18n/index.js';
import { DETAIL_ZOOM, visible, type Camera } from '../../model/map/camera.ts';
import type { BeltPath, Rect } from '../../model/map/geo.ts';
import type { BadgeKind } from '../../model/badges.ts';
import { toWorld, type Scene, type SceneBlock, type SceneMeio } from '../../model/map/scene.ts';
import { foundations } from '../format.ts';
import type { DrawOpts } from '../mapDraw.ts';
import { boxOf } from './belts.ts';
import type { MapTheme } from './theme.ts';
import { PORT_ZOOM } from './ports.ts';

// De longe, um ponto por tipo de aviso no canto do bloco (a saída da fábrica não é aviso).
const DOT_KINDS: BadgeKind[] = ['deficit', 'held', 'stalled', 'deadlock', 'unbounded'];
const DOT_PX = 4, TITLE_ICON = 16;
// Rótulos secundários por zoom (px por metro): fileiras, medida do bloco e etiqueta das entradas brutas.
const SUB_ZOOM = 2, SIZE_ZOOM = 3.5, RAW_ZOOM = 2;
const PAD = 5, CUT = 5, GAP = 3;

// Uma linha de rótulo: texto numa chapa escura com o canto de cima chanfrado (as placas do site); icon: ícone antes
// do texto (iconPx: o tamanho, 16 por padrão); accent: filete à esquerda (o selecionado); num: um número em laranja
// depois do texto (as placas de nome da Planta: receita e máquinas).
export interface Line { s: string; font: string; color: string; h: number; icon?: string | null; accent?: string | null; num?: string; iconPx?: number }
// Candidato: x, y do canto de cima da pilha.
export type Cand = [number, number, ('left' | 'right' | 'center')?];

export type Labels = ReturnType<typeof makeLabels>;

// Medida na Planta: "70 × 150 m, 9 × 19 fundações".
const plantSize = (r: { w: number; h: number }) => t('plPlantSize', fmt(r.w, 0), fmt(r.h, 0), fmt(foundations(r.w), 0), fmt(foundations(r.h), 0));

// O posicionador de um quadro. boxes: os retângulos de tela dos blocos e ligações (um rótulo não os cobre, a não ser o do dono).
export function makeLabels(ctx: CanvasRenderingContext2D, vw: number, vh: number, th: MapTheme, icon: DrawOpts['icon'], boxes: { id: string; r: Rect }[]) {
  const placed: Rect[] = [];
  const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // Livre: dentro da tela, sem outro rótulo e (com blocks) sem outro bloco ou ligação que não o dono.
  const free = (r: Rect, own: string | null, blocksToo = true) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh
    && !placed.some(p => hit(p, r)) && (!blocksToo || !boxes.some(b => b.id !== own && hit(b.r, r)));

  const NAME = `600 14px ${th.display}`, SMALL = `11px ${th.body}`;
  // Larguras medidas uma vez por quadro (o posicionador mede o mesmo texto em vários candidatos).
  const widths = new Map<string, number>();
  const measure = (s: string, font: string) => {
    const key = font + '\n' + s;
    let w = widths.get(key);
    if (w === undefined) { ctx.font = font; w = ctx.measureText(s).width; widths.set(key, w); }
    return w;
  };
  const iconOf = (id: string | null | undefined) => (id ? icon(id) : null);
  const lineW = (l: Line) => measure(l.s, l.font) + 2 * PAD + (iconOf(l.icon) ? (l.iconPx ?? TITLE_ICON) + 4 : 0) + (l.num ? measure(l.num, l.font) + 6 : 0);
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
    const ip = l.iconPx ?? TITLE_ICON;
    if (img) { ctx.drawImage(img, tx - 1, r.y + (r.h - ip) / 2, ip, ip); tx += ip + 4; }
    ctx.font = l.font; ctx.fillStyle = l.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(l.s, tx, r.y + r.h / 2 + 1);
    if (l.num) { ctx.fillStyle = th.ficsit; ctx.fillText(l.num, tx + measure(l.s, l.font) + 6, r.y + r.h / 2 + 1); }
  };
  // Tenta cada candidato e desenha no primeiro livre. force (um nome que precisa aparecer): sem lugar livre, aceita
  // cobrir um bloco vizinho (nunca outro rótulo); last: em último caso, o primeiro candidato mesmo cobrindo (só o
  // selecionado ou o que está sob o ponteiro).
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
  return { placed, hit, free, measure, lineW, fit, rectsAt, drawLine, put, around, NAME, SMALL };
}

// Os rótulos da Planta: avisos, nomes, secundário e os sinais de longe.
export function drawPlantLabels(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera, vw: number, vh: number, blocks: SceneBlock[], meios: SceneMeio[],
  o: DrawOpts, L: Labels, boxOfId: Map<string, Rect>): void {
  const th = o.theme, z = cam.zoom, detail = z >= DETAIL_ZOOM, near = z >= PORT_ZOOM;
  const sx = (x: number) => (x - cam.x) * z, sy = (y: number) => (y - cam.y) * z;
  const { placed, hit, put, around, fit, lineW, measure, NAME, SMALL } = L;

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

  // 1. Avisos do fluxo. De perto eles ficam nas portas (rótulo do estado, desenhado com elas); de longe, os sinais no
  // canto do bloco.
  const dots: { k: BadgeKind; x: number; y: number }[] = [];
  for (const b of near ? [] : blocks) {
    const bs = o.badges(b.stage);
    if (!bs.length) continue;
    // Centrados no canto de cima à direita (cabem até em bloco pequeno); entram no posicionador para nenhum nome
    // cobri-los e são desenhados por último, por cima de tudo.
    const kinds = DOT_KINDS.filter(k => bs.some(x => x.kind === k));
    const x1 = sx(b.rect.x + b.rect.w), y0 = sy(b.rect.y);
    kinds.forEach((k, i) => {
      const x = x1 - i * (2 * DOT_PX + 4), y = y0;
      dots.push({ k, x, y });
      placed.push({ x: x - DOT_PX - 2, y: y - DOT_PX - 2, w: 2 * DOT_PX + 4, h: 2 * DOT_PX + 4 });
    });
  }

  // 2. Nomes dos blocos (o selecionado primeiro; a ligação tem o chip). De perto o nome vai por fora (em cima, embaixo) e só
  // por dentro se couber; de longe, por dentro primeiro.
  // Ordem: o selecionado, os blocos de receita (os maiores antes), as origens e sobras (marcadores fora de escala).
  const order = [...blocks].sort((a, b) => +o.selected.has(b.stage) - +o.selected.has(a.stage) || +!!a.marker - +!!b.marker
    || b.rect.w * b.rect.h - a.rect.w * a.rect.h);
  for (const b of order) {
    const r = boxOfId.get(b.stage)!;
    if (r.w < 12) continue;
    const on = o.selected.has(b.stage), hov = o.hover === b.stage, txt = o.blockText(b.stage);
    // Placa de nome: ícone, receita e o número de máquinas em laranja.
    const title: Line = { s: txt.title, font: NAME, color: on ? th.ficsit : th.ink, h: 28, icon: txt.icon, iconPx: 22, accent: on ? th.ficsit : null, num: txt.num };
    // De perto o motivo do travado fica só na porta parada; de longe ele vai no lugar das fileiras.
    const subText = !near && txt.alert ? txt.alert : txt.sub;
    const sub: Line = { s: subText, font: SMALL, color: !near && txt.alert ? th.ficsit : th.inkDim, h: 15 };
    const wantSub = !!subText && (on || hov || z >= SUB_ZOOM || (!near && !!txt.alert));
    let done: Rect[] | null = null;
    if (wantSub) done = put([title, sub], around(r, [title, sub], !detail), b.stage);
    if (!done) done = put([title], around(r, [title], !detail), b.stage, detail || on || hov, on || hov);
    if (!done) {
      // Sem lugar inteiro: por dentro, cortado na largura do bloco. O bloco de receita sempre mostra o nome (por dentro
      // mesmo cobrindo, ou, sem altura para isso, no primeiro lugar de fora); origem e sobra podem ficar sem.
      const must = !b.marker;
      const cut = fit(title, r.w - 2 * GAP);
      if (cut && 28 <= r.h - 2 * GAP) done = put([cut], [[r.x + GAP, r.y + GAP]], b.stage, must, must);
      if (!done && must) done = put([title], around(r, [title], !detail), b.stage, true, true);
    }
  }
  // 3. Secundário: medida do bloco (de perto, ou selecionado), medida da ligação selecionada, entradas brutas e o nome
  // das peças grandes.
  for (const b of order) {
    const r = boxOfId.get(b.stage)!, on = o.selected.has(b.stage), hov = o.hover === b.stage;
    if (r.w < 24 || !(on || hov || z >= SIZE_ZOOM)) continue;
    const size = b.marker ? t('plNotToScale')
      : plantSize(b.rect) + (b.geo.estimate ? ` · ${t('plMapEstimate')}` : '');
    const line: Line = { s: size, font: SMALL, color: on ? th.ficsit : th.inkMid, h: 15 };
    put([line], [[r.x, r.y + r.h + GAP], [r.x + GAP, r.y + r.h - 15 - GAP]], b.stage);
  }
  for (const m of meios) {
    const on = o.selected.has(m.meio), hov = o.hover === m.meio;
    if (!(on || hov) || !m.geo || m.geo.tooLarge) continue;
    const r = boxOfId.get(m.meio)!;
    const extra = [plantSize(m.rect), m.geo.floors > 1 ? t('plMapFloors', fmt(m.geo.floors, 0)) : '', m.geo.estimate ? t('plMapEstimate') : ''].filter(Boolean).join(' · ');
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

  for (const d of dots) dot(d.k, d.x, d.y);
}
