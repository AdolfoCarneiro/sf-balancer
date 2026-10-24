import { t, dstTag, fmt } from '../i18n/index.js';
import { lineComp, designName } from '../logic/index.js';
import { EPS } from '../logic/belts.js';
import { Dn, O, esc } from './common.js';

// ---- Planta do fluxo ----
export function flowSvg(p, a) {
  const cap = p.cap, v = a.view, fl = e => (e === null || e === undefined ? 0 : a.sim.flow[e]);
  const rowH = 54, boxW = 184, dstW = 224, boxH = 40, W = 960, top = 8;
  const xSrc = 0, xDst = W - dstW, xMerge = xDst - 42, xOv = xDst - 150, xDiv = 410;

  // Destinos na ordem das linhas (que é a dos grupos); cada origem fica na altura do destino que alimenta.
  const feedsInOrder = v.feeds.slice().sort((x, y) => x.f.dst.id - y.f.dst.id);
  const srcOrder = [];
  const seen = new Set();
  const push = l => { if (!seen.has(l.id)) { seen.add(l.id); srcOrder.push(l); } };
  feedsInOrder.forEach(fv => fv.f.mains.forEach(push));
  v.groups.forEach(g => push(g.gr.donor));
  if (v.bal) a.bal.inputs.forEach(push);
  (v.headers || []).forEach(hv => hv.h.inputs.forEach(push));
  v.leftovers.forEach(l => push(l.line));
  const dstOrder = [...v.feeds.map(fv => fv.f.dst), ...a.unfed].sort((x, y) => x.id - y.id);
  const hasSink = a.g.nodes[v.sink].ins.length > 0;
  const hasExtra = a.g.nodes[v.extra].ins.length > 0;
  const dstRows = dstOrder.length + (hasSink ? 1 : 0) + (hasExtra ? 1 : 0);
  const rows = Math.max(srcOrder.length, dstRows);
  const H = top * 2 + rows * rowH - (rowH - boxH);

  const ySrc = new Map(srcOrder.map((l, i) => [l.id, top + i * rowH + boxH / 2]));
  const yDst = new Map(dstOrder.map((d, i) => [d.id, top + i * rowH + boxH / 2]));
  const ySink = top + dstOrder.length * rowH + boxH / 2;
  const yExtra = ySink + (hasSink ? rowH : 0);
  const donorIds = new Set(v.groups.map(g => g.gr.donor.id));

  const back = [], front = [];
  const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const belt = (d, f, color, layer = front) => {
    if (f < 0.05) { layer.push(`<path d="${d}" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 5"/>`); return; }
    const w = 2.5 + 7 * Math.min(1, f / cap);
    // Como no jogo: a esteira anda na velocidade do tier e a vazão só muda a distância entre os itens.
    const speed = 60 * cap / 480;
    const per = Math.min(120, 12 * cap / f);
    layer.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w.toFixed(1)}" stroke-opacity=".35"/>
      <path class="items" style="--per:${per.toFixed(1)};--dur:${(per / speed).toFixed(3)}s" stroke-dasharray="2 ${(per - 2).toFixed(1)}" d="${d}" fill="none" stroke="${color}" stroke-width="${Math.max(2, w * 0.55).toFixed(1)}"/>`);
  };
  const label = (x, y, text, color, anchor = 'start') =>
    front.push(`<text class="rate" x="${x}" y="${y}" text-anchor="${anchor}" style="fill:${color}">${text}</text>`);
  const merger = (x, y) => front.push(`<rect x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>`);
  const smart = (x, y) => front.push(`<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/><path d="M${x - 4},${y - 4} l4,4 l-4,4 M${x},${y - 4} l4,4 l-4,4" stroke="var(--ficsit)" stroke-width="1.6" fill="none"/>`);

  v.groups.forEach((g, gi) => {
    const gr = g.gr;
    const y0 = ySrc.get(gr.donor.id);
    const members = gr.members.map(m => v.feeds.find(fv => fv.f.dst.id === m));
    if (gr.p === 1) {
      const fv = members[0];
      belt(curve(xSrc + boxW, y0, xMerge, yDst.get(fv.f.dst.id)), fl(fv.partEdge), 'var(--donor)');
      label(xMerge - 14, yDst.get(fv.f.dst.id) + 20, '+' + fmt(fl(fv.partEdge)), 'var(--donor)', 'end');
      return;
    }
    const ys = members.map(fv => yDst.get(fv.f.dst.id));
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2 + (ys.length % 2 ? rowH / 2 : 0);
    const sy = Math.max(top + 12, Math.min(mid, H - 14));
    belt(curve(xSrc + boxW, y0, xDiv - 22, sy), fl(g.donorEdge), 'var(--donor)');
    members.forEach(fv => {
      const y = yDst.get(fv.f.dst.id);
      belt(curve(xDiv + 22, sy, xMerge, y), fl(fv.partEdge), 'var(--donor)');
      label(xMerge - 14, y + 20, '+' + fmt(fl(fv.partEdge)), 'var(--donor)', 'end');
    });
    if (g.sinkEdges.length) {
      const f = g.sinkEdges.reduce((s, e) => s + fl(e), 0);
      belt(curve(xDiv + 22, sy, xDst, ySink), f, 'var(--sink)', back);
      label(xDiv + 30, sy + (ySink > sy ? 24 : -12), t('svgToSink', fmt(f)), 'var(--sink)');
    }
    const txt = gr.mode === 'loop' ? `÷${gr.p} ↺` : `÷${gr.mode === 'sink' ? gr.n : gr.p}`;
    front.push(`<g class="balblock" data-open-bal="g${gi}" tabindex="0" role="button" aria-label="${esc(t('blkAria', 1, gr.p))}">
      <polygon points="${xDiv - 24},${sy - 15} ${xDiv + 16},${sy - 15} ${xDiv + 24},${sy - 7} ${xDiv + 24},${sy + 15} ${xDiv - 24},${sy + 15}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
      <text class="lbl" x="${xDiv}" y="${sy + 5}" text-anchor="middle" style="fill:var(--ficsit)">${txt}</text></g>`);
  });

  // Balancer N→M: um bloco só no meio; o detalhe abre num diálogo.
  if (v.bal) {
    const d = v.bal.design;
    const ys = [...a.bal.inputs.map(l => ySrc.get(l.id)), ...dstOrder.map(dd => yDst.get(dd.id))];
    const ym = (Math.min(...ys) + Math.max(...ys)) / 2, half = Math.max((Math.max(...ys) - Math.min(...ys)) / 2 + 18, 40);
    const y1 = Math.max(2, ym - half), y2 = Math.min(H - 2, ym + half);
    const bx = 330, bw = 170;
    a.bal.inputs.forEach((l, i) => {
      const y = ySrc.get(l.id), f = fl(v.bal.inEdges[i]), held = a.sources.get(l.id).held;
      belt(curve(xSrc + boxW, y, bx, y), f, 'var(--flow)');
      front.push(`<text class="rate" x="${xSrc + boxW + 10}" y="${y - 10}" style="fill:var(--flow)">${fmt(f)}${held > 0.05 ? `<tspan class="sm" dx="6" style="fill:var(--held)">${t('svgHeld', fmt(held))}</tspan>` : ''}</text>`);
    });
    v.feeds.forEach(fv => { const y = yDst.get(fv.f.dst.id); belt(curve(bx + bw, y, xDst, y), fl(fv.outEdge), 'var(--flow)'); });
    if (v.bal.sinkEdges.length) {
      const f = v.bal.sinkEdges.reduce((acc, e) => acc + fl(e), 0);
      belt(curve(bx + bw, y2 - 10, xDst, ySink), f, 'var(--sink)', back);
      label(bx + bw + 12, y2 + 4, t('svgToSink', fmt(f)), 'var(--sink)');
    }
    front.push(`<g class="balblock" data-open-bal="plan" tabindex="0" role="button" aria-label="${esc(t('blkAria', d.N, d.M))}">
      <polygon points="${bx},${y1} ${bx + bw - 14},${y1} ${bx + bw},${y1 + 14} ${bx + bw},${y2} ${bx},${y2}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
      <text class="lbl" x="${bx + bw / 2}" y="${ym - 4}" text-anchor="middle" style="fill:var(--ficsit);font-size:26px">${d.N}→${d.M}</text>
      <text class="sm" x="${bx + bw / 2}" y="${ym + 16}" text-anchor="middle">${esc(designName(d))}</text>
      <text class="sm" x="${bx + bw / 2}" y="${ym + 31}" text-anchor="middle" style="fill:var(--holo)">${t('blkHint')}</text></g>`);
  }

  // Cano coletor: os canos de origem entram num bloco e os de destino saem dele.
  const labeled = new Set();
  (v.headers || []).forEach(hv => {
    // A altura do bloco vem só dos destinos, que não se repetem entre coletores: assim os blocos não se sobrepõem.
    const ys = hv.h.members.map(d => yDst.get(d.id));
    const ym = (Math.min(...ys) + Math.max(...ys)) / 2, half = Math.max((Math.max(...ys) - Math.min(...ys)) / 2 + 14, 22);
    const y1 = Math.max(2, ym - half), y2 = Math.min(H - 2, ym + half);
    const bx = 400, bw = 120;
    hv.h.inputs.forEach((l, i) => {
      const y = ySrc.get(l.id), f = fl(hv.inEdges[i]), held = a.sources.get(l.id).held;
      belt(curve(xSrc + boxW, y, bx, Math.min(Math.max(y, y1 + 8), y2 - 8)), f, 'var(--flow)');
      if (labeled.has(l.id)) return;
      labeled.add(l.id);
      front.push(`<text class="rate" x="${xSrc + boxW + 10}" y="${y - 10}" style="fill:var(--flow)">${fmt(a.sources.get(l.id).out)}${held > 0.05 ? `<tspan class="sm" dx="6" style="fill:var(--held)">${t('svgHeld', fmt(held))}</tspan>` : ''}</text>`);
    });
    hv.h.members.forEach((d, j) => {
      const y = yDst.get(d.id);
      belt(curve(bx + bw, Math.min(Math.max(y, y1 + 8), y2 - 8), xDst, y), fl(hv.outEdges[j]), 'var(--flow)');
    });
    front.push(`<rect x="${bx}" y="${y1}" width="${bw}" height="${y2 - y1}" rx="${Math.min(14, (y2 - y1) / 2)}" fill="var(--paper)" stroke="var(--ficsit)" stroke-width="2"/>
      <text class="lbl" x="${bx + bw / 2}" y="${ym - 2}" text-anchor="middle" style="fill:var(--ficsit)">${esc(t('svgHeader'))}</text>
      <text class="sm" x="${bx + bw / 2}" y="${ym + 14}" text-anchor="middle">${hv.junctions} × Junction</text>`);
  });

  v.feeds.forEach(fv => {
    if (fv.header) return;
    const y = yDst.get(fv.f.dst.id);
    const ov = fv.overflowNode !== null;
    const via = fv.mergeNode !== null;
    const endX = ov ? xOv : via ? xMerge : xDst;
    fv.f.mains.forEach((l, i) => {
      const f = fl(fv.mainEdges[i]);
      const held = a.sources.get(l.id).held;
      belt(curve(xSrc + boxW, ySrc.get(l.id), endX, y), f, 'var(--flow)');
      front.push(`<text class="rate" x="${xSrc + boxW + 10}" y="${ySrc.get(l.id) - 10}" style="fill:var(--flow)">${fmt(f)}${held > 0.05 ? `<tspan class="sm" dx="6" style="fill:var(--held)">${t('svgHeld', fmt(held))}</tspan>` : ''}</text>`);
    });
    if (ov) {
      belt(`M${xOv},${y} L${xDst},${y}`, fl(fv.outEdge), 'var(--flow)');
      if (fv.overflowTo === null) {
        belt(curve(xOv, y, xDst, ySink), fl(fv.sinkEdge), 'var(--sink)', back);
        if (fl(fv.sinkEdge) > 0.05) label(xOv - 12, y + 22, t('svgToSink', fmt(fl(fv.sinkEdge))), 'var(--sink)', 'end');
      } else {
        const yt = yDst.get(fv.overflowTo);
        const f = fl(fv.overflowEdge);
        belt(`M${xOv},${y} C${xOv + 20},${y} ${xOv + 30},${yt} ${xMerge},${yt}`, f, 'var(--ficsit)', back);
        label(xOv - 12, y + 22, `${fmt(f)} → ${dstTag(fv.overflowTo)}`, 'var(--ficsit)', 'end');
      }
      smart(xOv, y);
    } else if (via) {
      belt(`M${xMerge},${y} L${xDst},${y}`, fl(fv.outEdge), 'var(--flow)');
      merger(xMerge, y);
    }
  });

  // Smart Splitter logo na saída da linha: o que o meio não puxa vai pro sink.
  v.drains.forEach(d => {
    const y0 = ySrc.get(d.line.id), x = xSrc + boxW + 34, f = fl(d.sinkEdge);
    belt(curve(x, y0, xDst, ySink), f, 'var(--sink)', back);
    if (f > 0.05) label(x + 14, y0 + 24, t('svgToSink', fmt(f)), 'var(--sink)');
    smart(x, y0);
  });

  v.leftovers.forEach(l => {
    const y0 = ySrc.get(l.line.id);
    if (l.edge === null) {
      front.push(`<path d="M${xSrc + boxW},${y0} l28,0 M${xSrc + boxW + 28},${y0 - 9} l0,18" stroke="var(--held)" stroke-width="3" fill="none"/>
        <text class="sm" x="${xSrc + boxW + 36}" y="${y0 + 4}">${t('svgStopped')}</text>`);
      return;
    }
    const isSink = a.g.edges[l.edge].to === v.sink;
    belt(curve(xSrc + boxW, y0, xDst, isSink ? ySink : yExtra), fl(l.edge), isSink ? 'var(--sink)' : 'var(--ink-dim)', back);
    label(xSrc + boxW + 10, y0 - 10, fmt(fl(l.edge)), isSink ? 'var(--sink)' : 'var(--ink-dim)');
  });

  const boxes = [];
  const plateBox = (x, y, stroke, w = boxW) => `<polygon points="${x},${y} ${x + w - 10},${y} ${x + w},${y + 10} ${x + w},${y + boxH} ${x},${y + boxH}" fill="var(--plate)" stroke="${stroke}" stroke-width="1.5"/>`;
  // Com mais de um grupo no destino, a caixa diz de qual grupo é a linha.
  const dstComp = d => (p.dst.groups.length > 1 && d.comp ? `${t('grpTag', d.comp[0].gi + 1)} · ` : '') + lineComp(d);
  srcOrder.forEach(l => {
    const y = ySrc.get(l.id) - boxH / 2;
    const st = a.sources.get(l.id);
    const color = donorIds.has(l.id) ? 'var(--donor)' : v.leftovers.some(x => x.line.id === l.id) ? 'var(--held)' : 'var(--flow)';
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
  if (hasSink) {
    const y = ySink - boxH / 2;
    boxes.push(`${plateBox(xDst, y, 'var(--sink)', dstW)}
      <text class="lbl" x="${xDst + 10}" y="${y + 25}">${t('svgSink')}</text>
      <text class="rate" x="${xDst + dstW - 12}" y="${y + 25}" text-anchor="end" style="fill:var(--sink)">${fmt(a.sinkRate)}/min</text>`);
  }
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

