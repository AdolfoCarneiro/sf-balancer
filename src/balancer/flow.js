import { t, fmt } from '../i18n/index.js';
import { lineComp, designName, flowNet, flowLayout } from '../logic/index.js';
import { PIECE_ICON, SP_COLOR, MG_COLOR } from './balancerSvg.js';
import { EPS } from '../logic/belts.js';
import { Dn, O, esc } from './common.js';

// ---- Planta do fluxo ----
// Peças comuns aos dois desenhos: curva entre duas portas de frente, esteira animada, rótulo de taxa e chapa de linha.
const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
const beltOf = (cap, front) => (d, f, color, layer = front, title = '') => {
  const tt = title ? `<g><title>${title}</title>` : '', te = title ? '</g>' : '';
  if (f < 0.05) { layer.push(`${tt}<path d="${d}" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 5"/>${te}`); return; }
  const w = 2.5 + 7 * Math.min(1, f / cap);
  // Como no jogo: a esteira anda na velocidade do tier e a vazão só muda a distância entre os itens.
  const speed = 60 * cap / 480;
  const per = Math.min(120, 12 * cap / f);
  layer.push(`${tt}<path d="${d}" fill="none" stroke="${color}" stroke-width="${w.toFixed(1)}" stroke-opacity=".35"/>
      <path class="items" style="--per:${per.toFixed(1)};--dur:${(per / speed).toFixed(3)}s" stroke-dasharray="2 ${(per - 2).toFixed(1)}" d="${d}" fill="none" stroke="${color}" stroke-width="${Math.max(2, w * 0.55).toFixed(1)}"/>${te}`);
};
const labelOf = front => (x, y, text, color, anchor = 'start') =>
  front.push(`<text class="rate" x="${x}" y="${y}" text-anchor="${anchor}" style="fill:${color}">${text}</text>`);
const plateOf = (x, y, stroke, w, boxH) => `<polygon points="${x},${y} ${x + w - 10},${y} ${x + w},${y + 10} ${x + w},${y + boxH} ${x},${y + boxH}" fill="var(--plate)" stroke="${stroke}" stroke-width="1.5"/>`;

// Tem retorno de loop desenhado (legenda)? Sem montar a rede: loop de doadora ou design com loop.
export const flowHasLoop = a => a.groups.some(g => g.mode === 'loop') || /loop/.test(a.bal?.design.kind || '');

// Legenda do desenho do fluxo (a página Balancer e o modal da ligação do builder): fluido, ou esteiras e peças.
export const flowLegend = (fluid, loop) => fluid
    ? `<span><i style="background:var(--flow)"></i>${t('lgMain')}</span>
            <span><i class="held"></i>${t('lgHeld')}</span>
            <span><i class="piece"></i>${t('lgJunction')}</span>`
    : `<span><i style="background:var(--flow)"></i>${t('lgMain')}</span>
            <span><i style="background:var(--donor)"></i>${t('lgDonor')}</span>
            <span><i style="background:var(--ficsit)"></i>${t('lgExcess')}</span>
            <span><i style="background:var(--sink)"></i>${t('lgSink')}</span>
            <span><i class="held"></i>${t('lgHeld')}</span>
            ${loop ? `<span><i class="loopi"></i>${t('lgLoopBack')}</span>` : ''}
            <span>${PIECE_ICON.splitter('2/3')}${t('lgSplitter')}</span>
            <span>${PIECE_ICON.merger}${t('lgMerger')}</span>
            <span>${PIECE_ICON.smart}${t('lgSmart')}</span>`;

export function flowSvg(p, a) {
  const net = p.fluid ? null : flowNet(a);
  return net ? pieceSvg(p, a, net) : pipeSvg(p, a);
}

// ---- Fluxo em peças (modo item): cada splitter, merger e Smart Splitter como no jogo ----
// Colunas e portas vêm de flowLayout; na tela a esquerda da peça é para cima. As caixas de origem e destino são as
// de sempre; o resto cresce de lado (a área rola) e tem no mínimo a largura de antes.
const PORT_N = { front: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1] };
const ROLE_COLOR = { main: 'var(--flow)', donor: 'var(--donor)', over: 'var(--ficsit)', sink: 'var(--sink)', extra: 'var(--ink-dim)', loop: 'var(--ink-dim)' };
function pieceSvg(p, a, net) {
  const cap = p.cap, v = a.view, lay = flowLayout(net), f1 = x => +x.toFixed(1);
  const rowH = 54, boxW = 184, dstW = 224, boxH = 40, h = 11, gapL = 92, gapR = 64, colMin = 96;
  const mid = lay.cols - 2, W = Math.max(960, boxW + gapL + mid * colMin + gapR + dstW);
  const xDst = W - dstW, xL = boxW + gapL, cw = mid ? Math.max(colMin, (xDst - gapR - xL) / mid) : 0;
  const rows = [...lay.nodes.values()].map(q => q.row), r0 = Math.min(...rows);
  const X = c => (c === 0 ? boxW : c === lay.cols - 1 ? xDst : xL + (c - 0.5) * cw);
  const Y = id => (lay.nodes.get(id).row - r0) * rowH + boxH / 2;
  const N = net.nodes, inL = N.map(() => []), outL = N.map(() => []);
  net.belts.forEach(b => { outL[b.a].push(b); inL[b.b].push(b); });
  const ins = id => inL[id].slice(), outs = id => outL[id].slice();
  const front = [], top = [], boxes = [];
  const belt = beltOf(cap, front), label = labelOf(top);
  const rate = r => `${fmt(r)}/min`;
  // Caixa de blueprint: altura pelas portas; esteiras entram por trás e saem pela frente, na ordem da outra ponta.
  const bpH = id => Math.max(ins(id).length, outs(id).length) * 18 + 10;
  const pos = id => ({ x: X(lay.nodes.get(id).col), y: Y(id) });
  const port = (b, end) => {
    const id = end === 'from' ? b.a : b.b, q = N[id], { x, y } = pos(id), side = lay.belts.get(b.id)[end];
    if (q.t === 'src' || q.t === 'dst' || q.t === 'sink' || q.t === 'extra') return { x, y, n: PORT_N[side] };
    if (q.t === 'bp') {
      const o = end === 'from' ? u => Y(u.b) : u => Y(u.a), list = (end === 'from' ? outs(id) : ins(id)).sort((u, w) => o(u) - o(w) || u.id - w.id);
      return { x: x + (end === 'from' ? 40 : -40), y: y - bpH(id) / 2 + 14 + list.indexOf(b) * 18, n: PORT_N[side] };
    }
    const n = PORT_N[side];
    return { x: x + n[0] * h, y: y + n[1] * h, n };
  };
  // Retorno do loop: sai da folha para o vão logo depois da coluna dela, anda pelo corredor entre as linhas (acima do
  // merger se entra pela esquerda, abaixo se pela direita) e desce ou sobe até a porta, sem passar por cima de peças.
  const blockOf = new Map();
  net.blocks.forEach((bk, i) => bk.nodes.forEach(id => blockOf.set(id, i)));
  const ext = net.blocks.map(bk => {
    const r = id => (N[id].t === 'bp' ? bpH(id) / 2 : h), w = id => (N[id].t === 'bp' ? 40 : h);
    return { x1: Math.min(...bk.nodes.map(id => pos(id).x - w(id))), x2: Math.max(...bk.nodes.map(id => pos(id).x + w(id))),
      y1: Math.min(...bk.nodes.map(id => Y(id) - r(id))), y2: Math.max(...bk.nodes.map(id => Y(id) + r(id))) };
  });
  let yMin = 0, yMax = (Math.max(...rows) - r0) * rowH + boxH;
  const paths = new Map(), lanes = new Map(), lane = k => { const n = lanes.get(k) || 0; lanes.set(k, n + 1); return n; };
  net.belts.forEach(b => {
    const s = port(b, 'from'), z = port(b, 'to');
    let d;
    if (b.role === 'loop') {
      const sc = pos(b.a), zc = pos(b.b), up = lay.belts.get(b.id).to === 'left';
      const xr = sc.x + h + 12 + 5 * lane('x' + sc.x), yc = zc.y + (up ? -1 : 1) * (h + 8 + 4 * lane('y' + zc.y + up));
      const s1 = { x: s.x + s.n[0] * 6, y: s.y + s.n[1] * 6 }, zx = z.x + z.n[0] * 12; // por trás chega pela esquerda
      d = `M${f1(s.x)},${f1(s.y)} L${f1(s1.x)},${f1(s1.y)} L${f1(xr)},${f1(s1.y)} L${f1(xr)},${f1(yc)} L${f1(zx)},${f1(yc)} L${f1(zx)},${f1(z.y)}` + (zx === z.x ? '' : ` L${f1(z.x)},${f1(z.y)}`);
      yMin = Math.min(yMin, yc - 4); yMax = Math.max(yMax, yc + 4);
      const e = ext[blockOf.get(b.a)];
      e.y1 = Math.min(e.y1, yc); e.y2 = Math.max(e.y2, yc); e.x2 = Math.max(e.x2, xr);
    } else if (!s.n[1] && !z.n[1]) d = curve(f1(s.x), f1(s.y), f1(z.x), f1(z.y));
    else {
      // Pelo lado a curva vira logo (sem laçada); pela frente/trás estica como antes.
      const k = Math.max(16, Math.min(70, Math.hypot(z.x - s.x, z.y - s.y) * 0.45)), ks = s.n[1] ? Math.min(k, 28) : k, kz = z.n[1] ? Math.min(k, 28) : k;
      d = `M${f1(s.x)},${f1(s.y)} C${f1(s.x + s.n[0] * ks)},${f1(s.y + s.n[1] * ks)} ${f1(z.x + z.n[0] * kz)},${f1(z.y + z.n[1] * kz)} ${f1(z.x)},${f1(z.y)}`;
    }
    paths.set(b.id, { s, z, d });
  });
  // Contorno dos blocos (com os retornos dentro): o bloco inteiro, peças inclusive, abre o diálogo como antes.
  const bBg = [], bHead = [], bTail = [], bPieces = net.blocks.map(() => []);
  net.blocks.forEach((bk, i) => {
    const e = ext[i], x1 = e.x1 - 10, x2 = e.x2 + 10, y1 = e.y1 - 10, y2 = e.y2 + 10;
    const gi = bk.kind === 'group' ? +bk.key.slice(1) : -1, gr = gi >= 0 ? v.groups[gi].gr : null, d = bk.kind === 'bal' ? v.bal.design : null;
    const dn = d && designName(d), name = gr ? (gr.mode === 'loop' ? `÷${gr.p} ↺` : `÷${gr.mode === 'sink' ? gr.n : gr.p}`) : esc(dn.includes(`${d.N}→${d.M}`) ? dn : `${d.N}→${d.M} · ${dn}`);
    const aria = esc(gr ? t('blkAria', 1, gr.p) : t('blkAria', d.N, d.M));
    yMin = Math.min(yMin, y1 - 12); yMax = Math.max(yMax, y2 + 4);
    // Fundo do bloco embaixo das esteiras (clicável); contorno, peças e nome por cima, sem tapar o <title> das esteiras.
    const box = `x="${f1(x1)}" y="${f1(y1)}" width="${f1(x2 - x1)}" height="${f1(y2 - y1)}" rx="8"`;
    bBg.push(`<rect class="blkbg" data-open-bal="${bk.key}" ${box}/>`);
    bHead.push(`<g class="balblock" data-open-bal="${bk.key}" tabindex="0" role="button" aria-label="${aria}"><title>${t('blkHint')}</title>
      <rect class="blk" ${box}/>`);
    bTail.push(`<rect class="blktag" x="${f1(x1)}" y="${f1(y1 - 10)}" width="${Math.round(name.length * 7.2 + 14)}" height="20" rx="3"/>
      <text class="lbl blkname" x="${f1(x1 + 7)}" y="${f1(y1 + 5)}">${name}</text></g>`);
  });
  net.belts.forEach(b => {
    const { d } = paths.get(b.id);
    if (b.role === 'loop') front.push(`<g><title>${rate(b.rate)}</title><path d="${d}" fill="none" stroke="var(--ink-dim)" stroke-width="2.4" stroke-linejoin="round" stroke-dasharray="6 4"/></g>`);
    else belt(d, b.rate, ROLE_COLOR[b.role], front, rate(b.rate));
  });
  // Taxas sempre à vista: partes da doadora (saem do bloco para fora) e overflow para outro destino, no meio da esteira.
  net.belts.forEach(b => {
    const out = blockOf.get(b.a) !== undefined && blockOf.get(b.b) === undefined && N[b.b].t !== 'sink';
    if (!(b.role === 'donor' && out) && b.role !== 'over') return;
    // Pelo lado: colado na porta, à esquerda de quem chega por cima e à direita de quem chega por baixo (dois
    // mergers vizinhos não empilham os rótulos no mesmo corredor); por trás: acima da esteira, antes da peça.
    const { z } = paths.get(b.id), n = z.n[1], txt = (b.role === 'donor' ? '+' : '') + fmt(b.rate);
    if (n) label(f1(z.x + (n < 0 ? -5 : 5)), f1(z.y + (n < 0 ? -3 : 12)), txt, ROLE_COLOR[b.role], n < 0 ? 'end' : 'start');
    else label(f1(z.x - 10), f1(z.y - 9), txt, ROLE_COLOR[b.role], 'end');
  });
  // Peças; as de um bloco ficam dentro dele.
  const pc = id => (blockOf.has(id) ? bPieces[blockOf.get(id)] : top);
  N.forEach(q => {
    const { x, y } = pos(q.id), at = `data-piece="${q.t}"`;
    if (q.t === 's' || q.t === 'm') {
      const sp = q.t === 's', c = sp ? SP_COLOR : MG_COLOR, m = h / 10;
      const mark = sp ? `<text x="${x}" y="${f1(y + 4 * m)}" text-anchor="middle" style="fill:${c};font:700 ${Math.round(11 * m)}px var(--display)">${q.ways}</text>`
        : `<path d="M${f1(x - 3 * m)},${f1(y - 4 * m)} L${f1(x + m)},${y} L${f1(x - 3 * m)},${f1(y + 4 * m)}" stroke="${c}" stroke-width="${f1(1.4 * Math.sqrt(m))}" fill="none"/>`;
      pc(q.id).push(`<g ${at}><title>${sp ? `Splitter ÷${q.ways}` : 'Merger'}</title><rect x="${x - h}" y="${y - h}" width="${2 * h}" height="${2 * h}" rx="2.5" fill="${sp ? '#2a2018' : '#13282a'}" stroke="${c}" stroke-width="1.8"/>${mark}</g>`);
    } else if (q.t === 'ov') {
      pc(q.id).push(`<g ${at}><title>Smart Splitter (Overflow)</title><rect x="${x - h}" y="${y - h}" width="${2 * h}" height="${2 * h}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/><path d="M${x - 5},${y - 5} l5,5 l-5,5 M${x},${y - 5} l5,5 l-5,5" stroke="var(--ficsit)" stroke-width="1.6" fill="none"/></g>`);
    } else if (q.t === 'bp') {
      const d = v.bal.design, H = bpH(q.id), y1 = y - H / 2;
      pc(q.id).push(`<g ${at}><polygon points="${x - 40},${y1} ${x + 28},${y1} ${x + 40},${y1 + 12} ${x + 40},${y1 + H} ${x - 40},${y1 + H}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
        <text class="lbl" x="${x}" y="${y - 2}" text-anchor="middle" style="fill:var(--ficsit)">${d.bp.n}→${d.bp.m}</text>
        <text class="sm" x="${x}" y="${y + 14}" text-anchor="middle">blueprint</text></g>`);
    } else if (q.t === 'sink' || q.t === 'extra') {
      const sk = q.t === 'sink', c = ROLE_COLOR[q.t], r = ins(q.id)[0].rate;
      pc(q.id).push(`<g ${at}><rect x="${x}" y="${y - 7}" width="6" height="14" fill="${c}"/>
        <text class="rate" x="${x + 11}" y="${y + 5}" style="fill:${c}">${sk ? t('svgToSink', fmt(r)) : t('svgToExtra', fmt(r))}</text></g>`);
    }
  });

  // Caixas das linhas, como antes: a origem com o que sai e o que represa, o destino com "x de y".
  const plateBox = (x, y, stroke, w = boxW) => plateOf(x, y, stroke, w, boxH);
  const donorIds = new Set(v.groups.map(g => g.gr.donor.id));
  const dstComp = d => (p.dst.groups.length > 1 && d.comp ? `${t('grpTag', d.comp[0].gi + 1)} · ` : '') + lineComp(d);
  N.filter(q => q.t === 'src').forEach(q => {
    const l = q.line, yc = Y(q.id), y = yc - boxH / 2, st = a.sources.get(l.id), ob = outs(q.id);
    const left = v.leftovers.find(x => x.line.id === l.id);
    const color = donorIds.has(l.id) ? 'var(--donor)' : left ? 'var(--held)' : 'var(--flow)';
    const outW = (boxW - 16) * st.out / Math.max(l.rate, EPS);
    if (ob.length) {
      const lc = left ? ROLE_COLOR[ob[0].role] : color, held = st.held;
      top.push(`<text class="rate" x="${boxW + 10}" y="${yc - 10}" style="fill:${lc}">${fmt(st.out)}${held > 0.05 ? `<tspan class="sm" dx="6" style="fill:var(--held)">${t('svgHeld', fmt(held))}</tspan>` : ''}</text>`);
    } else if (left) top.push(`<path d="M${boxW},${yc} l28,0 M${boxW + 28},${yc - 9} l0,18" stroke="var(--held)" stroke-width="3" fill="none"/>
        <text class="sm" x="${boxW + 36}" y="${yc + 4}">${t('svgStopped')}</text>`);
    boxes.push(`${plateBox(0, y, color)}
      <text class="lbl" x="10" y="${y + 20}">${O(l)}</text>
      <text class="sm" x="40" y="${y + 19}">${esc(lineComp(l))}</text>
      <text class="rate" x="${boxW - 12}" y="${y + 20}" text-anchor="end">${fmt(l.rate)}</text>
      <rect x="8" y="${y + boxH - 11}" width="${boxW - 16}" height="5" fill="url(#hatch)"/>
      <rect x="8" y="${y + boxH - 11}" width="${outW.toFixed(1)}" height="5" fill="${color}"/>
      ${st.held > 0.05 ? `<title>${t('svgTitleHeld', O(l), fmt(st.out), fmt(st.held))}</title>` : ''}`);
  });
  N.filter(q => q.t === 'dst').forEach(q => {
    const d = q.line, y = Y(q.id) - boxH / 2, st = a.dests.get(d.id);
    const fill = (dstW - 16) * Math.min(1, st.got / d.rate), short = st.short > 0.05;
    boxes.push(`${plateBox(xDst, y, short ? 'var(--sink)' : 'var(--ok)', dstW)}
      <text class="lbl" x="${xDst + 10}" y="${y + 20}">${Dn(d)}</text>
      <text class="sm" x="${xDst + 40}" y="${y + 19}">${esc(dstComp(d))}</text>
      <text class="rate" x="${xDst + dstW - 12}" y="${y + 20}" text-anchor="end" style="${short ? 'fill:var(--sink)' : ''}">${t('svgGot', fmt(st.got), fmt(d.rate))}</text>
      <rect x="${xDst + 8}" y="${y + boxH - 11}" width="${dstW - 16}" height="5" fill="var(--line)"/>
      <rect x="${xDst + 8}" y="${y + boxH - 11}" width="${fill.toFixed(1)}" height="5" fill="${short ? 'var(--sink)' : 'var(--ok)'}"/>`);
  });

  const pad = 8, vy = Math.floor(yMin) - pad, H = Math.ceil(yMax - yMin) + 2 * pad;
  return `<svg class="pflow" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${t('svgAria')}">
    <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill="var(--line)"/><rect width="2" height="5" fill="var(--held)"/></pattern></defs>
    <g transform="translate(0,${-vy})">${bBg.join('')}${front.join('')}${boxes.join('')}${bHead.map((x, i) => x + bPieces[i].join('') + bTail[i]).join('')}${top.join('')}</g></svg>`;
}

// ---- Planta do fluxo de canos (modo fluido): ligação direta ou cano coletor com Pipeline Junction ----
// No fluido não há doadora, balancer, Smart Splitter nem sink (o plano para antes deles).
function pipeSvg(p, a) {
  const cap = p.cap, v = a.view, fl = e => a.sim.flow[e];
  const rowH = 54, boxW = 184, dstW = 224, boxH = 40, W = 960, top = 8;
  const xSrc = 0, xDst = W - dstW;

  // Destinos na ordem das linhas (que é a dos grupos); cada origem fica na altura do destino que alimenta.
  const feedsInOrder = v.feeds.slice().sort((x, y) => x.f.dst.id - y.f.dst.id);
  const srcOrder = [];
  const seen = new Set();
  const push = l => { if (!seen.has(l.id)) { seen.add(l.id); srcOrder.push(l); } };
  feedsInOrder.forEach(fv => fv.f.mains.forEach(push));
  (v.headers || []).forEach(hv => hv.h.inputs.forEach(push));
  v.leftovers.forEach(l => push(l.line));
  const dstOrder = [...v.feeds.map(fv => fv.f.dst), ...a.unfed].sort((x, y) => x.id - y.id);
  const hasExtra = a.g.nodes[v.extra].ins.length > 0;
  const rows = Math.max(srcOrder.length, dstOrder.length + (hasExtra ? 1 : 0));
  const H = top * 2 + rows * rowH - (rowH - boxH);

  const ySrc = new Map(srcOrder.map((l, i) => [l.id, top + i * rowH + boxH / 2]));
  const yDst = new Map(dstOrder.map((d, i) => [d.id, top + i * rowH + boxH / 2]));
  const yExtra = top + dstOrder.length * rowH + boxH / 2;

  const back = [], front = [];
  const belt = beltOf(cap, front), label = labelOf(front);
  const srcRate = (l, f) => front.push(`<text class="rate" x="${xSrc + boxW + 10}" y="${ySrc.get(l.id) - 10}" style="fill:var(--flow)">${fmt(f)}${a.sources.get(l.id).held > 0.05 ? `<tspan class="sm" dx="6" style="fill:var(--held)">${t('svgHeld', fmt(a.sources.get(l.id).held))}</tspan>` : ''}</text>`);

  // Cano coletor: os canos de origem entram num bloco e os de destino saem dele.
  const labeled = new Set();
  (v.headers || []).forEach(hv => {
    // A altura do bloco vem só dos destinos, que não se repetem entre coletores: assim os blocos não se sobrepõem.
    const ys = hv.h.members.map(d => yDst.get(d.id));
    const ym = (Math.min(...ys) + Math.max(...ys)) / 2, half = Math.max((Math.max(...ys) - Math.min(...ys)) / 2 + 14, 22);
    const y1 = Math.max(2, ym - half), y2 = Math.min(H - 2, ym + half);
    const bx = 400, bw = 120;
    hv.h.inputs.forEach((l, i) => {
      const y = ySrc.get(l.id);
      belt(curve(xSrc + boxW, y, bx, Math.min(Math.max(y, y1 + 8), y2 - 8)), fl(hv.inEdges[i]), 'var(--flow)');
      if (labeled.has(l.id)) return;
      labeled.add(l.id);
      srcRate(l, a.sources.get(l.id).out);
    });
    hv.h.members.forEach((d, j) => {
      const y = yDst.get(d.id);
      belt(curve(bx + bw, Math.min(Math.max(y, y1 + 8), y2 - 8), xDst, y), fl(hv.outEdges[j]), 'var(--flow)');
    });
    front.push(`<rect x="${bx}" y="${y1}" width="${bw}" height="${y2 - y1}" rx="${Math.min(14, (y2 - y1) / 2)}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
      <text class="lbl" x="${bx + bw / 2}" y="${ym - 2}" text-anchor="middle" style="fill:var(--ficsit)">${esc(t('svgHeader'))}</text>
      <text class="sm" x="${bx + bw / 2}" y="${ym + 14}" text-anchor="middle">${hv.junctions} × Junction</text>`);
  });

  // Ligação direta: um cano de origem por destino.
  v.feeds.forEach(fv => {
    if (fv.header) return;
    fv.f.mains.forEach((l, i) => {
      const f = fl(fv.mainEdges[i]);
      belt(curve(xSrc + boxW, ySrc.get(l.id), xDst, yDst.get(fv.f.dst.id)), f, 'var(--flow)');
      srcRate(l, f);
    });
  });

  v.leftovers.forEach(l => {
    const y0 = ySrc.get(l.line.id);
    if (l.edge === null) {
      front.push(`<path d="M${xSrc + boxW},${y0} l28,0 M${xSrc + boxW + 28},${y0 - 9} l0,18" stroke="var(--held)" stroke-width="3" fill="none"/>
        <text class="sm" x="${xSrc + boxW + 36}" y="${y0 + 4}">${t('svgStopped')}</text>`);
      return;
    }
    belt(curve(xSrc + boxW, y0, xDst, yExtra), fl(l.edge), 'var(--ink-dim)', back);
    label(xSrc + boxW + 10, y0 - 10, fmt(fl(l.edge)), 'var(--ink-dim)');
  });

  const boxes = [];
  const plateBox = (x, y, stroke, w = boxW) => plateOf(x, y, stroke, w, boxH);
  // Com mais de um grupo no destino, a caixa diz de qual grupo é a linha.
  const dstComp = d => (p.dst.groups.length > 1 && d.comp ? `${t('grpTag', d.comp[0].gi + 1)} · ` : '') + lineComp(d);
  srcOrder.forEach(l => {
    const y = ySrc.get(l.id) - boxH / 2;
    const st = a.sources.get(l.id);
    const color = v.leftovers.some(x => x.line.id === l.id) ? 'var(--held)' : 'var(--flow)';
    const outW = (boxW - 16) * st.out / Math.max(l.rate, EPS);
    boxes.push(`${plateBox(xSrc, y, color)}
      <text class="lbl" x="${xSrc + 10}" y="${y + 20}">${O(l)}</text>
      <text class="sm" x="${xSrc + 40}" y="${y + 19}">${esc(lineComp(l))}</text>
      <text class="rate" x="${xSrc + boxW - 12}" y="${y + 20}" text-anchor="end">${fmt(l.rate)}</text>
      <rect x="${xSrc + 8}" y="${y + boxH - 11}" width="${boxW - 16}" height="5" fill="url(#hatch)"/>
      <rect x="${xSrc + 8}" y="${y + boxH - 11}" width="${outW.toFixed(1)}" height="5" fill="${color}"/>
      ${st.held > 0.05 ? `<title>${t('svgTitleHeld', O(l), fmt(st.out), fmt(st.held))}</title>` : ''}`);
  });
  dstOrder.forEach(d => {
    const y = yDst.get(d.id) - boxH / 2;
    const st = a.dests.get(d.id);
    const fill = (dstW - 16) * Math.min(1, st.got / d.rate);
    const short = st.short > 0.05;
    boxes.push(`${plateBox(xDst, y, short ? 'var(--sink)' : 'var(--ok)', dstW)}
      <text class="lbl" x="${xDst + 10}" y="${y + 20}">${Dn(d)}</text>
      <text class="sm" x="${xDst + 40}" y="${y + 19}">${esc(dstComp(d))}</text>
      <text class="rate" x="${xDst + dstW - 12}" y="${y + 20}" text-anchor="end" style="${short ? 'fill:var(--sink)' : ''}">${t('svgGot', fmt(st.got), fmt(d.rate))}</text>
      <rect x="${xDst + 8}" y="${y + boxH - 11}" width="${dstW - 16}" height="5" fill="var(--line)"/>
      <rect x="${xDst + 8}" y="${y + boxH - 11}" width="${fill.toFixed(1)}" height="5" fill="${short ? 'var(--sink)' : 'var(--ok)'}"/>`);
  });
  if (hasExtra) {
    const y = yExtra - boxH / 2;
    boxes.push(`${plateBox(xDst, y, 'var(--ink-dim)', dstW)}
      <text class="lbl" x="${xDst + 10}" y="${y + 25}">${t('svgExtra')}</text>
      <text class="rate" x="${xDst + dstW - 12}" y="${y + 25}" text-anchor="end" style="fill:var(--ink-dim)">${fmt(a.extraRate)}/min</text>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${t('svgAria')}">
    <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill="var(--line)"/><rect width="2" height="5" fill="var(--held)"/></pattern></defs>
    ${back.join('')}${front.join('')}${boxes.join('')}</svg>`;
}

// Árvore de splitters: as primeiras `useful` folhas vão pros destinos, o resto pro loop ou sink.
export function treeSvg(tree, useful, kind) {
  const leaves = tree.parts;
  const W = Math.max(220, leaves * 36 + 20), levelH = 48;
  const H = (tree.levels.length + 1) * levelH + 26;
  const countAt = lv => tree.factors.slice(0, lv).reduce((a, b) => a * b, 1);
  const xOf = (lv, i) => 10 + ((W - 20) / countAt(lv)) * (i + 0.5);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="margin-top:10px;max-width:100%;height:auto" role="img" aria-label="${t('treeAria')}">`;
  s += `<text x="${W / 2}" y="12" text-anchor="middle" class="sm">${t(kind === 'loop' ? 'treeInLoop' : 'treeIn')}</text>`;
  for (let lv = 0; lv <= tree.levels.length; lv++) {
    const y = 28 + lv * levelH;
    for (let i = 0; i < countAt(lv); i++) {
      const x = xOf(lv, i);
      if (lv < tree.levels.length) {
        const ways = tree.factors[lv];
        for (let c = 0; c < ways; c++) s += `<line x1="${x}" y1="${y + 12}" x2="${xOf(lv + 1, i * ways + c)}" y2="${y + levelH - 4}" stroke="var(--donor)" stroke-width="2" opacity=".8"/>`;
        s += `<rect x="${x - 12}" y="${y - 4}" width="24" height="18" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="1.5"/><text x="${x}" y="${y + 10}" text-anchor="middle" class="sm" style="fill:var(--ficsit)">${ways}</text>`;
      } else {
        const extra = i >= useful;
        s += `<circle cx="${x}" cy="${y + 2}" r="6" fill="${extra ? 'var(--sink)' : 'var(--flow)'}"/><text x="${x}" y="${y + 22}" text-anchor="middle" class="sm">${extra ? (kind === 'loop' ? '↺' : t('treeSink')) : i + 1}</text>`;
      }
    }
  }
  return s + `</svg>`;
}

