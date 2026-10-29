import { t, dstTag, fmt } from '../i18n/index.js';
import { sizeParts, lineComp, summarizeRates, describeTree, balancerCandidates, rankDesigns, designPieces, designName, computePlan, issueUrl } from '../logic/index.js';
import { S } from './state.js';
import { $, Dn, O, esc } from './common.js';
import { hideTip, tip } from './help.js';
import { readInput, saveState, showEquivalences, syncMedium, tierLabel } from './input.js';
import { shareLink } from './scenarios.js';
import { cap1 } from './balancerSvg.js';
import { flowSvg, flowHasLoop, flowLegend, treeSvg } from './flow.js';
import { BPS } from './library.js';
import { checksTable, whyText } from './workbench.js';

// ---- Render ----
export function render() {
  if (S.tipBtn && $('out').contains(S.tipBtn)) hideTip();
  syncMedium();
  const { valid, input } = readInput();
  const out = $('out');
  saveState();
  if (!valid) {
    $('ledger').innerHTML = '';
    $('warns').innerHTML = '';
    out.innerHTML = `<p class="lead" style="margin-top:24px">${t('invalid')}</p>`;
    $('report').href = issueUrl(t('issueTitle', input.item), shareLink());
    return;
  }
  const p = computePlan(input);
  showEquivalences('src', p.src.groups, p.cap, p.fluid);
  showEquivalences('dst', p.dst.groups, p.cap, p.fluid);

  const surplus = p.supply - p.demand;
  $('ledger').innerHTML = `
    <div><dt>${t('supply')}${tip('tipLedger')}</dt><dd>${fmt(p.supply)}<small>/min</small></dd></div>
    <div><dt>${t('demand')}</dt><dd>${fmt(p.demand)}<small>/min</small></dd></div>
    <div><dt>${surplus >= 0 ? t('surplus') : t('shortfall')}</dt><dd class="${surplus < 0 ? 'neg' : ''}">${fmt(Math.abs(surplus))}<small>/min</small></dd></div>`;
  $('warns').innerHTML = p.warnings.map(w => `<div class="warn ${w.level === 'bad' ? 'bad' : ''}">${esc(w.text)}</div>`).join('');

  const alts = p.alternatives;
  if (!alts.length) { out.innerHTML = `<p class="lead" style="margin-top:24px">${t('noLines')}</p>`; return; }
  const alt = alts.find(a => a.key === S.selectedKey) || alts[0];
  S.lastRender = { p, alt };
  $('report').href = issueUrl(t('issueTitle', input.item), t('issueBody', {
    link: shareLink(), item: input.item, medium: `${t(p.fluid ? 'tbPipe' : 'tbBelt')}: ${tierLabel(input, p.cap)}`,
    supply: fmt(p.supply), demand: fmt(p.demand), plan: alt.title, caseLabel: alt.caseLabel,
  }));
  const legend = flowLegend(p.fluid, flowHasLoop(alt));

  out.innerHTML = `
    <div class="work">
      <aside>
        <h2 class="section-title">${t('alts')}${tip('tipAlts')}</h2>
        <p class="lead">${t('altsLead')}</p>
        <div class="alts" role="radiogroup" aria-label="${t('alts')}">${alts.map((a, i) => altCard(a, i, alt)).join('')}</div>
      </aside>
      <section>
        <h2 class="section-title">${esc(alt.title)}${tip('tipFlow')}</h2>
        <p class="lead">${esc(alt.sub)} ${t(p.fluid ? 'flowLeadPipe' : 'flowLead')}</p>
        <div class="sheet">
          ${flowSvg(p, alt)}
          <div class="legend">
            ${legend}
          </div>
          ${alt.warnings.map(w => `<div class="warn" style="margin-top:10px">${esc(w)}</div>`).join('')}
          <div class="titleblock num">
            <div>${t('tbItem')}<b>${esc(input.item)}</b></div>
            <div>${t(p.fluid ? 'tbPipe' : 'tbBelt')}<b>${esc(tierLabel(input, p.cap))}</b></div>
            <div>${t('tbMid')}<b>${alt.caseLabel}</b></div>
          </div>
        </div>
      </section>
    </div>
    <div class="pair">
      <section class="plate"><h2 class="section-title">${t('balanceTitle')}${tip('tipBalance')}</h2>${balanceTable(alt)}</section>
      <section class="plate"><h2 class="section-title">${t('stepsTitle')}</h2><ol class="steps">${planSteps(p, alt).map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>
    </div>
    <div class="pair">
      ${balancerSection(p, alt)}
      ${piecesTable(p, alt)}
    </div>`;
}

const planCost = a => a.pieces.mergers + a.pieces.splitters + a.pieces.smart + a.pieces.blueprints + a.pieces.junctions;

function altCard(a, i, sel) {
  const pc = a.pieces;
  const fullCount = [...a.dests.values()].filter(d => d.short < 0.05).length;
  const on = a.key === sel.key;
  return `<button class="alt ${on ? 'sel' : ''}" type="button" role="radio" aria-checked="${on}" data-key="${a.key}">
    ${i === 0 ? `<span class="rec">${t('recommended')}</span>` : ''}
    <span class="alt-title">${esc(a.title)}</span>
    <span class="alt-sub">${a.caseLabel}</span>
    <dl class="stats">
      <div><dt>${t('stFull')}</dt><dd class="${a.full ? 'ok' : 'bad'}">${fullCount}/${a.dests.size}</dd></div>
      <div><dt>${t('stSink')}</dt><dd>${fmt(a.sinkRate)}</dd></div>
      <div><dt>${t('stHeld')}</dt><dd>${fmt(a.held)}</dd></div>
      <div><dt>${t('stPieces')}</dt><dd>${planCost(a)}</dd></div>
    </dl>
  </button>`;
}

function balanceTable(a) {
  const dest = id => {
    const v = a.view;
    if (v.bal && a.bal.inputs.some(l => l.id === id)) return t('toBalancer', a.feeds.map(f => Dn(f.dst)).join(', '));
    const hvs = (v.headers || []).filter(h => h.h.inputs.some(l => l.id === id));
    if (hvs.length) return hvs.map(hv => t('toHeader', hv.h.members.map(Dn).join(', '))).join(' · ');
    const fv = v.feeds.find(f => f.f.mains.some(l => l.id === id));
    if (fv) {
      if (fv.overflowNode === null) return Dn(fv.f.dst);
      return t('destExcess', Dn(fv.f.dst), fv.overflowTo === null ? t('sinkWord') : dstTag(fv.overflowTo));
    }
    const gv = v.groups.find(g => g.gr.donor.id === id);
    if (gv) return t('donatesTo', gv.gr.members.map(dstTag).join(', '));
    return t({ represar: 'leftHold', sink: 'leftSink', extra: 'leftExtra' }[a.policy]);
  };
  const drained = id => {
    const dv = a.view.drains.find(d => d.line.id === id);
    return dv ? ` · ${t('destDrain', fmt(a.sim.flow[dv.sinkEdge]))}` : '';
  };
  const srcRows = [...a.sources.values()].sort((x, y) => x.line.id - y.line.id).map(s => `<tr>
    <td>${O(s.line)} <span class="sm">${esc(lineComp(s.line))}</span></td><td class="l">${dest(s.line.id)}${drained(s.line.id)}</td><td>${fmt(s.line.rate)}</td><td>${fmt(s.out)}</td>
    <td class="${s.held > 0.05 ? '' : 'dim'}">${fmt(s.held)}</td></tr>`).join('');
  const dstRows = [...a.dests.values()].sort((x, y) => x.line.id - y.line.id).map(d => `<tr>
    <td>${Dn(d.line)} <span class="sm">${esc(lineComp(d.line))}</span></td><td>${fmt(d.line.rate)}</td><td>${fmt(d.got)}</td>
    <td class="${d.short > 0.05 ? 'bad' : 'ok'}">${d.short > 0.05 ? t('statusShort', fmt(d.short), fmt(100 * d.got / d.line.rate)) : t('statusFull')}</td></tr>`).join('');
  return `<div class="tablewrap"><table>
    <tr><th>${t('thSrc')}</th><th class="l">${t('thGoesTo')}</th><th>${t('thProduces')}</th><th>${t('thOut')}</th><th>${t('thHeld')}</th></tr>${srcRows}
  </table></div>
  <div class="tablewrap" style="margin-top:16px"><table>
    <tr><th>${t('thDst')}</th><th>${t('thDemand')}</th><th>${t('thGets')}</th><th>${t('thStatus')}</th></tr>${dstRows}
  </table></div>
  <p class="hint">${t('balanceHint', fmt(a.sinkRate), a.pieces.sinkBelts, fmt(a.held), fmt(a.extraRate))}</p>`;
}

function groupSteps(side, built, conv, fluid) {
  const note = conv === 'k' ? 'k' : 'k−1';
  const head = t(side === 'src' ? 'headSrc' : 'headDst');
  return built.groups.map(g => {
    const lbl = t('stepLbl', head, built.groups.length > 1 ? g.gi + 1 : null);
    if (g.continuous) return lbl + t(fluid ? 'stepContinuousPipe' : 'stepContinuous', fmt(g.total, 2), g.lines);
    const clk = Math.abs(g.clock - 1) > 1e-4 ? t('stepClock', fmt(g.clock * 100, 2)) : '';
    const per = fmt(g.perMachine, 2);
    if (!g.fullLines) return lbl + t('stepNoFull', g.N, clk, per);
    if (g.balanced && g.fullLines < g.sizes.length) {
      return lbl + t('stepBalanced', { N: g.N, clk, per, lines: g.sizes.length, parts: t('lineParts', sizeParts(g.sizes, g.eff)), src: side === 'src', note, fluid });
    }
    return lbl + t('stepGroup', { N: g.N, clk, per, full: g.fullLines, perLine: g.perLine, lineRate: fmt(g.lineRate), src: side === 'src', note, rem: g.rem, fluid });
  });
}

function planSteps(p, a) {
  const steps = [];
  const fl = e => a.sim.flow[e];
  steps.push(...groupSteps('src', p.src, p.conv, p.fluid));
  const mixed = p.src.lines.map((l, i) => ({ ...l, id: i })).filter(l => l.partial && l.comp && l.comp.length > 1);
  if (mixed.length) steps.push(t('stepMixed', mixed.map(l => `${O(l)} = ${lineComp(l)} (${fmt(l.rate)}/min)`).join('; ')));
  steps.push(...groupSteps('dst', p.dst, p.conv, p.fluid));
  for (const v of a.view.groups) {
    const gr = v.gr, d = gr.division;
    const who = gr.members.map(dstTag).join(', ');
    if (gr.p === 1) steps.push(t('stepDonorWhole', O(gr.donor), who));
    else if (gr.mode === 'direct') steps.push(t('stepDonorDirect', O(gr.donor), fmt(gr.donor.rate), describeTree(d.tree), who));
    else if (gr.mode === 'sink') steps.push(t('stepDonorSink', O(gr.donor), describeTree(d.tree), gr.p, who, d.sink.sinkParts));
    else steps.push(t('stepDonorLoop', O(gr.donor), gr.p, describeTree(d.tree), d.loop.recirculate, who));
  }
  if (a.view.bal) {
    const d = a.view.bal.design;
    steps.push(t('stepBal', a.bal.inputs.map(O).join(', '), d.N, d.M, designName(d), fmt(d.perOut)));
  }
  for (const sv of a.view.splits || []) {
    steps.push(t('stepHeaderSplit', O(sv.sp.line), sv.sp.headers.map(i => a.view.headers[i].h.members.map(Dn).join(' + ')).join(' / '), sv.junctions));
  }
  for (const hv of a.view.headers || []) {
    steps.push(t('stepHeader', hv.h.inputs.map(O).join(' + '), hv.h.members.map(Dn).join(', '), hv.junctions, fmt(hv.inEdges.reduce((s, e) => s + fl(e), 0))));
  }
  for (const fv of a.view.bal || a.view.headers ? [] : a.view.feeds.slice().sort((x, y) => x.f.dst.id - y.f.dst.id)) {
    const f = fv.f, ds = a.dests.get(f.dst.id);
    const mains = f.mains.map((l, i) => {
      const held = a.sources.get(l.id).held;
      return t('stepMainPass', O(l), fmt(fl(fv.mainEdges[i])), held > 0.05 ? fmt(held) : null);
    }).join(' + ');
    let s = t('stepDstHead', Dn(f.dst), fmt(f.dst.rate));
    if (fv.overflowNode !== null) {
      const toD = fv.overflowTo === null ? null : dstTag(fv.overflowTo);
      s += t('stepOverflow', f.mains.map(O).join(' + '), fmt(fl(fv.outEdge)), fmt(fl(fv.overflowTo === null ? fv.sinkEdge : fv.overflowEdge)), toD);
    } else {
      const extras = [];
      if (fv.partEdge !== null) extras.push(t('stepPartDonor', fmt(fl(fv.partEdge))));
      fv.inbound.forEach(ib => extras.push(t('stepExcessFrom', dstTag(ib.from), fmt(fl(ib.edge)))));
      if (extras.length) s += t('stepMerged', mains, extras.join(' + '), fv.mergers);
      else if (f.mains.length > 1) s += t('stepJoined', mains, fv.mergers);
      else s += t('stepDirect', mains);
    }
    s += ds.short > 0.05 ? t('stepShort', fmt(ds.short)) : t('stepFull');
    steps.push(s);
  }
  if (a.view.drains.length) {
    const tot = a.view.drains.reduce((acc, d) => acc + fl(d.sinkEdge), 0);
    steps.push(t('stepDrain', a.view.drains.map(d => O(d.line)).join(', '), a.view.drains.length, fmt(tot)));
  }
  for (const d of a.unfed) steps.push(t('stepUnfed', Dn(d)));
  if (a.view.leftovers.length) {
    const names = a.view.leftovers.map(l => O(l.line)).join(', ');
    const tot = a.view.leftovers.reduce((s, l) => s + l.line.rate, 0);
    steps.push(t('stepLeftover', names, a.view.leftovers.length, fmt(tot), a.policy));
  }
  return steps;
}

// Balancer N→M da alternativa: design escolhido, por que ele e por que (ou não) um balancer aqui.
function balSection(p, a) {
  const d = a.view.bal.design;
  const ranked = rankDesigns(balancerCandidates(d.N, d.M, d.rates, p.cap, BPS));
  const best = p.alternatives[0];
  return `<section class="plate"><h2 class="section-title">${t('lbBalTitle', d.N, d.M)}${tip('tipLb')}</h2>
    <p style="margin:0 0 6px">${esc(t('lbBalLine', cap1(designName(d)), designPieces(d), fmt(d.perOut)))}</p>
    <p class="dim" style="margin:0 0 12px">${esc(whyText(ranked))}</p>
    ${checksTable(d, p.input.belt)}
    <h3 class="donor-title">${t('whyVsTitle')}</h3>
    <div class="opt on"><ul>
      <li>${esc(best === a ? t('whyIsBest') : t('whyVsBest', best.title, best.full, planCost(best), planCost(a)))}</li>
      <li>${t('whyBalWhen')}</li>
      <li>${t('whyOverflow')}</li>
    </ul></div>
    <div class="open-row"><button type="button" class="pbtn prim" data-open-bal="plan">${t('lbOpen')}</button></div>
  </section>`;
}

function balancerSection(p, a) {
  if (a.view.bal) return balSection(p, a);
  if (p.fluid) {
    return `<section class="plate"><h2 class="section-title">${t('pipeTitle')}${tip('tipMedium')}</h2>
      <p style="margin:0 0 8px">${t('pipeNote')}</p>
      <p class="dim" style="margin:0 0 8px">${t('pipeValve')}</p>
      ${a.view.headers ? `<p class="dim" style="margin:0">${t('pipeHeaderCap', fmt(p.cap))}</p>` : ''}
    </section>`;
  }
  const groups = a.view.groups.filter(v => v.gr.p > 1);
  const smart = a.view.feeds.filter(f => f.overflowNode !== null);
  const drains = a.view.drains;
  if (!groups.length && !smart.length && !drains.length) return `<section class="plate"><h2 class="section-title">${t('lbTitle')}${tip('tipLb')}</h2><p class="dim" style="margin:0">${t('lbNone')}</p></section>`;
  let html = `<section class="plate"><h2 class="section-title">${t('lbTitle')}${tip('tipLb')}</h2>`;
  if (smart.length || drains.length) {
    const fl = e => a.sim.flow[e];
    html += `<h3 class="donor-title">${t('lbSmartTitle')}</h3><div class="opt on"><ul>
      ${smart.map(fv => {
        const toD = fv.overflowTo === null ? null : dstTag(fv.overflowTo);
        const over = fl(fv.overflowTo === null ? fv.sinkEdge : fv.overflowEdge);
        return `<li>${t('lbSmartItem', fv.f.mains.map(O).join(' + '), Dn(fv.f.dst), toD, fmt(over))}</li>`;
      }).join('')}
      ${drains.map(d => `<li>${t('lbDrainItem', O(d.line), fmt(fl(d.sinkEdge)))}</li>`).join('')}
      </ul>
      <p class="hint">${t('lbSmartHint')}</p></div>`;
  }
  const ok = '<span class="ok">✓</span>';
  const openBtn = v => `<div class="open-row"><button type="button" class="pbtn" data-open-bal="g${a.view.groups.indexOf(v)}">${t('lbOpen')}</button></div>`;
  for (const v of groups) {
    const gr = v.gr, d = gr.division;
    const tree = esc(describeTree(d.tree));
    html += `<h3 class="donor-title">${t('lbDonorTitle', O(gr.donor), fmt(gr.donor.rate), gr.p)}</h3>`;
    if (d.direct) {
      html += `<div class="opt on"><ul>
        <li>${t('lbDirect', tree, d.tree.splitters)}</li>
        <li>${t('lbPart', fmt(d.part), fmt(gr.maxDeficit))} ${ok}</li>
      </ul>${treeSvg(d.tree, gr.p, 'none')}</div>${openBtn(v)}`;
    } else {
      html += `<div class="bal">
        <div class="opt ${gr.mode === 'loop' ? 'on' : ''}"><h4>${t('lbLoopTitle')}</h4><ul>
          <li>${t('lbLoopTree', tree, d.loop.recirculate)}</li>
          <li>${t('lbLoopPieces', d.tree.splitters, d.loop.mergers)}</li>
          <li>${t('lbLoopPart', fmt(d.loop.part), fmt(gr.maxDeficit))} ${d.loop.ok ? ok : '<span class="bad">✗</span>'}</li>
          <li>${t('lbTreeIn', fmt(d.loop.beltLoad))} ${d.loop.beltOk ? `<span class="ok">${t('lbFits')}</span>` : `<span class="bad">${t('lbOver', p.input.belt)}</span>`}</li>
        </ul>${treeSvg(d.tree, gr.p, 'loop')}</div>
        <div class="opt ${gr.mode === 'sink' ? 'on' : ''}"><h4>${t('lbSinkTitle', d.n)}</h4><ul>
          <li>${t('lbSinkTree', tree, d.tree.splitters)}</li>
          <li>${t('lbSinkParts', gr.p, d.sink.sinkParts)}</li>
          <li>${t('lbSinkPart', fmt(d.sink.part), fmt(gr.maxDeficit))} ${d.sink.ok ? ok : `<span class="bad">${t('lbNotCover')}</span>`}</li>
        </ul>${treeSvg(d.tree, gr.p, 'sink')}</div>
      </div>${openBtn(v)}`;
    }
  }
  return html + `</section>`;
}

function piecesTable(p, a) {
  const conv = p.conv === 'k' ? 'k' : 'k−1';
  const pc = a.pieces;
  if (p.fluid) {
    return `<section class="plate"><h2 class="section-title">${t('pcTitle')}${tip('tipPieces')}</h2>
  <div class="tablewrap"><table>
    <tr><th>${t('thSection')}</th><th class="l">${t('thLines')}</th><th>${t('thJunctions')}</th></tr>
    <tr><td>${t('rowCollect')}</td><td class="l">${summarizeRates(p.src.lines)}</td><td>${p.collectMergers}</td></tr>
    <tr><td>${t('rowMid')}</td><td class="l">${a.caseLabel}</td><td>${pc.junctions}</td></tr>
    <tr><td>${t('rowDist')}</td><td class="l">${summarizeRates(p.dst.lines)}</td><td>${p.distSplitters}</td></tr>
    <tr class="sum"><td>${t('rowTotal')}</td><td></td><td>${p.collectMergers + pc.junctions + p.distSplitters}</td></tr>
  </table></div>
  <p class="hint">${t('pcHintPipe', conv)}</p>
  </section>`;
  }
  return `<section class="plate"><h2 class="section-title">${t('pcTitle')}${tip('tipPieces')}</h2>
  <div class="tablewrap"><table>
    <tr><th>${t('thSection')}</th><th class="l">${t('thLines')}</th><th>${t('thMergers')}</th><th>${t('thSplitters')}</th><th>${t('thSmart')}</th></tr>
    <tr><td>${t('rowCollect')}</td><td class="l">${summarizeRates(p.src.lines)}</td><td>${p.collectMergers}</td><td>0</td><td>0</td></tr>
    <tr><td>${t('rowMid')}</td><td class="l">${a.caseLabel}</td><td>${pc.mergers}</td><td>${pc.splitters}</td><td>${pc.smart}</td></tr>
    <tr><td>${t('rowDist')}</td><td class="l">${summarizeRates(p.dst.lines)}</td><td>0</td><td>${p.distSplitters}</td><td>0</td></tr>
    <tr class="sum"><td>${t('rowTotal')}</td><td></td><td>${p.collectMergers + pc.mergers}</td><td>${p.distSplitters + pc.splitters}</td><td>${pc.smart}</td></tr>
  </table></div>
  <p class="hint">${t('pcHint', conv, pc.sinkBelts)}${pc.blueprints ? ` ${t('pcBp', pc.blueprints)}` : ''}</p>
  </section>`;
}

