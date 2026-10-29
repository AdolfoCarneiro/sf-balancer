import { t, fmt } from '../i18n/index.js';
import { designerSize, pieceText3d } from '../logic/index.js';
import { EPS } from '../logic/belts.js';
import { esc } from './common.js';

// ---- Balancer N→M: desenho com passo a passo ----
// Uma cor por entrada, para seguir cada árvore até os mergers.
const IN_COLORS = ['#ffd166', '#c6a6ff', '#8fe3a4', '#ff8fc7', '#a3b8ff', '#e9ff70', '#ffb3a7', '#d6c3a5'];
export const inColor = i => IN_COLORS[i % IN_COLORS.length];
export const designKey = d => (d.kind === 'blueprint' ? `bp-${d.bp.n}-${d.bp.m}` : d.kind);
export const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
export const segName = sg => t('seg' + cap1(sg.key), sg.arg);
export const rateList = rs => (rs.every(r => Math.abs(r - rs[0]) < EPS) ? fmt(rs[0]) : rs.map(r => fmt(r)).join(' / '));
export const tags = (prefix, n) => Array.from({ length: n }, (_, i) => prefix + (i + 1));

// Ícones das peças, iguais aos do desenho, para a legenda e para o passo atual.
// Na planta as peças são quadradas como no jogo: splitter laranja (com em quantas divide), merger verde-água.
export const SP_COLOR = '#e8863a', MG_COLOR = '#3bb3a8';
export const PIECE_ICON = {
  splitter: ways => `<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" rx="2" fill="rgba(232,134,58,.22)" stroke="${SP_COLOR}" stroke-width="1.6"/><text x="13" y="14" text-anchor="middle" style="fill:${SP_COLOR};font:700 11px var(--display)">${ways}</text></svg>`,
  merger: `<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" rx="2" fill="rgba(59,179,168,.22)" stroke="${MG_COLOR}" stroke-width="1.6"/><path d="M9,6 L13,10 L9,14 M13,10 H18" stroke="${MG_COLOR}" stroke-width="1.6" fill="none"/></svg>`,
  // Smart Splitter com », como no fluxo.
  smart: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/><path d="M9,6 l4,4 l-4,4 M13,6 l4,4 l-4,4" stroke="var(--ficsit)" stroke-width="1.6" fill="none"/></svg>',
  grid: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" fill="none" stroke="var(--grid-line)" stroke-width="1.4"/></svg>',
  designer: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><rect x="4" y="1" width="18" height="18" fill="var(--bp-floor)" stroke="var(--bp-edge)" stroke-width="1.6"/><path d="M13,1 V19 M4,10 H22" stroke="var(--bp-line)" stroke-width="1"/></svg>',
  mixed: `<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><path d="M1,6 H10 L16,10 H25 M1,14 H10 L16,10" stroke="${'#ffd166'}" stroke-width="2" fill="none"/><path d="M16,10 H25" stroke="#c6a6ff" stroke-width="2.6"/></svg>`,
  num: '<svg class="picon" viewBox="0 0 26 20" aria-hidden="true"><text x="13" y="14" text-anchor="middle" style="fill:var(--ink-dim);font:700 11px var(--display)">#1</text></svg>',
};
// O texto de cada passo de uma montagem (L: layout3d ou byPiece3d dela; view: 'flat', 'towers' ou 'floors') e, por passo,
// a peça nova (para o ícone). O passo a passo do app e as páginas geradas de cada balancer usam este mesmo texto.
export function stepTexts(d, L, labels, view) {
  return {
    kinds: L.steps.map(st => (st.key === 'piece' ? { t: st.t, ways: st.ways } : null)),
    steps: L.steps.map(st => (st.key === 'in' ? t('stIn', d.N, labels.ins.join(', '), rateList(d.rates))
      : st.key === 'out' ? t('stOut', d.M, fmt(d.perOut)) : st.key === 'piece' ? pieceText3d(st, labels, view)
      : t('stLevel3d', view, st.level, st.sp, st.ways, st.mg, st.up, st.down))),
  };
}
export const pieceIcon = k => (k.t === 's' ? PIECE_ICON.splitter(k.ways) : PIECE_ICON.merger);

// Desenho 2D a partir da montagem 'flat' (vista de cima): cada esteira sai e entra pelo lado de verdade da peça
// (splitter entra por trás e sai pela frente e pelos lados; merger o contrário), nunca duas no mesmo lado, e anda em
// curva até a outra porta. Esquema: peças em tamanho fixo, colunas mais largas que as linhas, para caber na tela.
// Planta: o mesmo desenho em escala (1 m = PLAN_PX px), com a grade de fundações e duas camadas vazias para as
// marcações do Blueprint Designer (o piso embaixo das esteiras, borda e rótulo por cima), preenchidas por planMarksSvg.
// Na tela o fluxo vai para a direita: a esquerda da peça fica para cima e a direita para baixo.
// Cada peça e esteira leva data-s = passo em que aparece; data-id e data-b servem para acender um caminho.
const PORT_N = { front: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1] };
export const PLAN_PX = 10;
export function flatSvg(d, lay, labels, per, plan) {
  const isPart = q => q.t === 's' || q.t === 'm';
  const sx = plan ? PLAN_PX : 15, sz = plan ? PLAN_PX : 6.5, h = plan ? 1.8 * PLAN_PX : 10;
  const inW = 92, outW = 100, boxH = 30, f = v => v.toFixed(1);
  const byId = new Map(lay.pieces.map(q => [q.id, q]));
  const ins = lay.pieces.filter(q => q.t === 'in'), outs = lay.pieces.filter(q => q.t === 'out');
  const placed = lay.pieces.filter(q => q.t !== 'sink');
  const xs = placed.map(q => q.pos[0]), zs = placed.map(q => q.pos[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  // Retorno do loop: contorna tudo por cima (entra pelo lado esquerdo do merger) ou por baixo.
  const loops = lay.belts.filter(b => b.kind === 'loop');
  const up = loops.filter(b => b.toSide === 'left'), down = loops.filter(b => b.toSide !== 'left');
  const padL = inW + 16, padR = outW + 16;
  const padT = boxH / 2 + 18 + up.length * 7 + (plan ? 6 : 0), padB = boxH / 2 + 18 + down.length * 7;
  const X = x => padL + (x - minX) * sx, Y = z => padT + (z - minZ) * sz;
  const W = Math.ceil(X(maxX) + padR), H = Math.ceil(Y(maxZ) + padB);
  const out = [];
  const g = (step, svg, attr = '') => out.push(`<g data-s="${step}"${attr}>${svg}</g>`);
  if (plan) {
    // Grade: as peças ficam no meio de uma fundação (colunas a cada 8 m ao longo do fluxo).
    const grid = [];
    for (let x = Math.floor((minX - padL / sx) / 8) * 8 + 4; X(x) <= W; x += 8) if (X(x) >= 0) grid.push(`M${f(X(x))},0 V${H}`);
    for (let z = Math.floor((minZ - padT / sz) / 8) * 8; Y(z) <= H; z += 8) if (Y(z) >= 0) grid.push(`M0,${f(Y(z))} H${W}`);
    out.push(`<path d="${grid.join(' ')}" stroke="var(--grid-line)" stroke-width="1" fill="none"/><g class="bpfloor"></g>`);
  }
  const P = q => [X(q.pos[0]), Y(q.pos[2])];
  const port = (id, side) => { const q = byId.get(id), [cx, cy] = P(q), n = PORT_N[side], r = isPart(q) ? h : 0; return { x: cx + n[0] * r, y: cy + n[1] * r, n }; };
  // Cor: a esteira de uma entrada só leva a cor dela; na borboleta, a da faixa de onde sai (como no esquema
  // antigo); a misturada que sobra leva a cor da saída para onde vai.
  const laneIn = new Map(ins.map(q => [q.pos[2].toFixed(3), q.inp]));
  const color = b => {
    if (byId.get(b.b).t === 'sink') return 'var(--sink)';
    if (b.kind === 'loop') return 'var(--ink-dim)';
    if (b.inp >= 0) return inColor(b.inp);
    const lane = d.net ? laneIn.get(byId.get(b.a).pos[2].toFixed(3)) : undefined;
    return lane !== undefined ? inColor(lane) : b.out >= 0 ? inColor(b.out) : 'var(--ink-dim)';
  };
  const yUp = k => Y(minZ) - boxH / 2 - 10 - k * 7, yDown = k => Y(maxZ) + boxH / 2 + 10 + k * 7;
  lay.belts.forEach((b, bi) => {
    const a = port(b.a, b.fromSide), tgt = byId.get(b.b), c = color(b);
    let path, extra = '';
    if (tgt.t === 'sink') {
      const e = { x: a.x + a.n[0] * 20, y: a.y + a.n[1] * 20 };
      path = `M${f(a.x)},${f(a.y)} L${f(e.x)},${f(e.y)}`;
      extra = `<text class="sm" x="${f(e.x + (a.n[0] ? 4 : 0))}" y="${f(e.y + (a.n[1] > 0 ? 11 : a.n[1] < 0 ? -3 : 4))}" text-anchor="${a.n[0] ? 'start' : 'middle'}" style="fill:var(--sink)">sink</text>`;
    } else {
      const z = port(b.b, b.toSide);
      if (b.kind === 'loop') {
        const top = b.toSide === 'left', yL = top ? yUp(up.indexOf(b)) : yDown(down.indexOf(b));
        const a1 = { x: a.x + a.n[0] * 10, y: a.y + a.n[1] * 10 }, zx = z.n[0] ? z.x + z.n[0] * 12 : z.x;
        path = `M${f(a.x)},${f(a.y)} L${f(a1.x)},${f(a1.y)} L${f(a1.x)},${f(yL)} L${f(zx)},${f(yL)} L${f(zx)},${f(z.y)} L${f(z.x)},${f(z.y)}`;
      } else {
        // Arco entre duas peças da mesma fileira, saindo e entrando pelo mesmo lado: rente às peças, sem passar
        // do toco de 1,2 m (a curva sobe 3/4 de k), para ficar dentro do espaço da planta.
        const arch = a.n[0] === z.n[0] && a.n[1] === z.n[1] && Math.abs(a.y - z.y) < 1;
        const k = arch ? 1.6 * sz :Math.max(16, Math.min(70, Math.hypot(z.x - a.x, z.y - a.y) * 0.45));
        path = `M${f(a.x)},${f(a.y)} C${f(a.x + a.n[0] * k)},${f(a.y + a.n[1] * k)} ${f(z.x + z.n[0] * k)},${f(z.y + z.n[1] * k)} ${f(z.x)},${f(z.y)}`;
      }
    }
    g(b.step, `<path d="${path}" fill="none" stroke="${c}" stroke-width="${plan ? 3.2 : 2.4}" stroke-linejoin="round"${b.kind === 'loop' ? ' stroke-dasharray="6 4"' : ''}/>${extra}`, ` data-b="${bi}"`);
  });
  const plate = (x, y, w, stroke) => `<polygon points="${f(x)},${f(y)} ${f(x + w - 9)},${f(y)} ${f(x + w)},${f(y + 9)} ${f(x + w)},${f(y + boxH)} ${f(x)},${f(y + boxH)}" fill="var(--plate)" stroke="${stroke}" stroke-width="1.5"/>`;
  lay.pieces.forEach(q => {
    if (q.t === 'sink') return;
    const [cx, cy] = P(q);
    if (isPart(q)) {
      const sp = q.t === 's', c = sp ? SP_COLOR : MG_COLOR, m = h / 10;
      const mark = sp ? `<text x="${f(cx)}" y="${f(cy + 4 * m)}" text-anchor="middle" style="fill:${c};font:700 ${Math.round(11 * m)}px var(--display)">${q.ways}</text>`
        : `<path d="M${f(cx - 3 * m)},${f(cy - 4 * m)} L${f(cx + m)},${f(cy)} L${f(cx - 3 * m)},${f(cy + 4 * m)}" stroke="${c}" stroke-width="${f(1.4 * Math.sqrt(m))}" fill="none"/>`;
      g(q.step, `<rect x="${f(cx - h)}" y="${f(cy - h)}" width="${f(2 * h)}" height="${f(2 * h)}" rx="2.5" fill="${sp ? '#2a2018' : '#13282a'}" stroke="${c}" stroke-width="1.8"/>${mark}`
        + (per === 'piece' ? `<text class="pnum" x="${f(cx)}" y="${f(cy - h - 4)}" text-anchor="middle">#${q.step}</text>` : ''), ` data-id="${q.id}"`);
    } else {
      const isIn = q.t === 'in', k = isIn ? ins.indexOf(q) : outs.indexOf(q), c = inColor(isIn ? q.inp ?? k : k);
      const tag = isIn ? labels.ins[k] : labels.outs[k], rate = fmt(isIn ? d.rates[k % d.rates.length] : d.perOut);
      const x = isIn ? cx - inW : cx, w = isIn ? inW : outW;
      g(q.step, plate(x, cy - boxH / 2, w, c) + `<text class="lbl" x="${f(x + 9)}" y="${f(cy + 5)}">${esc(tag)}</text><text class="rate" x="${f(x + w - 9)}" y="${f(cy + 5)}" text-anchor="end">${rate}</text>`, ` data-id="${q.id}"`);
    }
  });
  // Na planta, data-ox/data-oz dizem onde fica o metro 0 no desenho (X(x) = ox + x · PLAN_PX).
  const org = plan ? ` data-ox="${X(0)}" data-oz="${Y(0)}"` : '';
  return `<svg class="bsvg flat${plan ? ' plan' : ''}" viewBox="0 0 ${W} ${H}" style="--w:${W}px"${org} role="img" aria-label="${esc(t('ponderAria'))}">${out.join('')}${plan ? '<g class="bpmarks"></g>' : ''}</svg>`;
}

// Marcações do Blueprint Designer na planta. Embaixo das esteiras, o piso do designer: chapa clara com a grade de
// fundações bem marcada e subdivisões de 2 m discretas. Por cima, a borda forte com cantos reforçados, a aba com
// "#1 · Mk2 5×5" e o × para remover. Só para planejar como fatiar em blueprints: não marca peça dentro ou fora.
export const MARK_TAB = 20;
export function planMarksSvg(marks, ox, oz) {
  const f = v => v.toFixed(1), P = PLAN_PX, floor = [], top = [];
  for (const m of marks) {
    const s = designerSize(m.mk), n = s / 8, x0 = ox + m.x * P, y0 = oz + m.z * P, w = s * P, x1 = x0 + w, y1 = y0 + w;
    const sub = [], maj = [];
    for (let i = 1; i < n * 4; i++) (i % 4 ? sub : maj).push(`M${f(x0 + i * 2 * P)},${f(y0)} V${f(y1)} M${f(x0)},${f(y0 + i * 2 * P)} H${f(x1)}`);
    floor.push(`<g data-mark="${m.id}"><rect x="${f(x0)}" y="${f(y0)}" width="${w}" height="${w}" fill="var(--bp-floor)"/>`
      + `<path d="${sub.join(' ')}" stroke="var(--bp-sub)" stroke-width="1" fill="none"/><path d="${maj.join(' ')}" stroke="var(--bp-line)" stroke-width="1.5" fill="none"/></g>`);
    const c = 18, name = t('bpMarkName', m.id, m.mk, n), tw = name.length * 7 + 16;
    const corners = `M${f(x0)},${f(y0 + c)} V${f(y0)} H${f(x0 + c)} M${f(x1 - c)},${f(y0)} H${f(x1)} V${f(y0 + c)} M${f(x1)},${f(y1 - c)} V${f(y1)} H${f(x1 - c)} M${f(x0 + c)},${f(y1)} H${f(x0)} V${f(y1 - c)}`;
    top.push(`<g data-mark="${m.id}"><rect x="${f(x0)}" y="${f(y0)}" width="${w}" height="${w}" fill="none" stroke="var(--bp-edge)" stroke-width="2"/>`
      + `<path d="${corners}" stroke="var(--bp-edge)" stroke-width="5" fill="none"/>`
      + `<rect x="${f(x0)}" y="${f(y0 - MARK_TAB)}" width="${tw}" height="${MARK_TAB}" fill="var(--bp-edge)"/>`
      + `<text class="bptag" x="${f(x0 + 8)}" y="${f(y0 - 6)}">${esc(name)}</text>`
      + `<g class="bprm" data-rm="${m.id}"><title>${esc(t('bpMarkRemove', name))}</title><rect x="${f(x1 - MARK_TAB - 4)}" y="${f(y0 - MARK_TAB)}" width="${MARK_TAB + 4}" height="${MARK_TAB}" fill="var(--bp-edge)"/>`
      + `<path d="M${f(x1 - MARK_TAB + 3)},${f(y0 - MARK_TAB + 5)} l10,10 m0,-10 l-10,10" stroke="var(--bench)" stroke-width="2.2"/></g></g>`);
  }
  return { floor: floor.join(''), top: top.join('') };
}

// Blueprint seu: o desenho é a caixa do blueprint entre as entradas e as saídas, em três passos.
export function balancerBuild(d, labels) {
  const steps = [], under = [], over = [];
  const step = text => steps.push(text) - 1;
  const g = (layer, s, svg) => layer.push(`<g data-s="${s}">${svg}</g>`);
  const ins = labels.ins, outs = labels.outs;
  const N = d.N, M = d.M, top = 14, boxH = 34, inW = 92, outW = 100;
  const plate = (x, y, w, stroke) => `<polygon points="${x},${y} ${x + w - 9},${y} ${x + w},${y + 9} ${x + w},${y + boxH} ${x},${y + boxH}" fill="var(--plate)" stroke="${stroke}" stroke-width="1.5"/>`;
  const box = (x, yc, w, tag, rate, stroke) => plate(x, yc - boxH / 2, w, stroke)
    + `<text class="lbl" x="${x + 9}" y="${yc + 5}">${esc(tag)}</text><text class="rate" x="${x + w - 9}" y="${yc + 5}" text-anchor="end">${rate}</text>`;
  const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const belt = (path, color, w = 2) => `<path d="${path}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
  const inStep = () => step(t('stIn', N, ins.join(', '), rateList(d.rates)));
  const gap = 46, rows = Math.max(N, M), cH = rows * gap - (gap - boxH);
  const yAt = (i, k) => top + (cH - (k * gap - (gap - boxH))) / 2 + i * gap + boxH / 2;
  const bx = inW + 80, bw = 150, xOut = bx + bw + 80;
  const W = xOut + outW + 2, H = top * 2 + cH;
  const s0 = inStep();
  for (let i = 0; i < N; i++) g(over, s0, box(0, yAt(i, N), inW, ins[i], fmt(d.rates[i]), inColor(i)));
  const s1 = step(t('stBpBox', d.bp.n, d.bp.m, d.bp.n - N));
  for (let i = 0; i < N; i++) g(under, s1, belt(curve(inW, yAt(i, N), bx, yAt(i, N)), inColor(i), 3));
  g(over, s1, `<polygon points="${bx},${top} ${bx + bw - 12},${top} ${bx + bw},${top + 12} ${bx + bw},${top + cH} ${bx},${top + cH}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
    <text class="lbl" x="${bx + bw / 2}" y="${top + cH / 2 + 2}" text-anchor="middle" style="fill:var(--ficsit);font-size:22px">${d.bp.n}→${d.bp.m}</text>
    <text class="sm" x="${bx + bw / 2}" y="${top + cH / 2 + 20}" text-anchor="middle">blueprint</text>`);
  const s2 = step(t('stOut', M, fmt(d.perOut)));
  for (let j = 0; j < M; j++) {
    g(under, s2, belt(curve(bx + bw, yAt(j, M), xOut, yAt(j, M)), 'var(--ink)', 3));
    g(over, s2, box(xOut, yAt(j, M), outW, outs[j], fmt(d.perOut), 'var(--ok)'));
  }
  const svg = `<svg class="bsvg" viewBox="0 0 ${W} ${H}" style="--w:${W}px" role="img" aria-label="${esc(t('ponderAria'))}">${under.join('')}${over.join('')}</svg>`;
  return { svg, steps };
}

