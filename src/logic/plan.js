// Geração, avaliação e escolha de planos do meio.
import { t, fmt, srcTag } from '../i18n/index.js';
import { EPS, buildLines, lineComp, manifoldPieces } from './belts.js';
import { isDirect, divisionOptions, junctionsFor } from './splitters.js';
import { balancerCandidates, designPieces, bfKind, buildCost, designName } from './ranking.js';
import { makeGraph, addNode, addEdge, simulate, connectMany, buildTree, buildBalancer } from './graph.js';

// Tamanhos de grupo (soma m, k grupos), preferindo tamanhos divisíveis direto.
function groupSizeCandidates(m, k) {
  const equal = [];
  for (let i = 0; i < k; i++) equal.push(Math.floor(m / k) + (i < m % k ? 1 : 0));
  const cands = [];
  const direct = [];
  let rem = m;
  for (let i = 0; i < k; i++) {
    const left = k - i;
    if (left === 1) { direct.push(rem); break; }
    let g = Math.ceil(rem / left);
    while (g > 1 && !isDirect(g)) g--;
    direct.push(g); rem -= g;
  }
  if (direct.length === k && direct.every(g => g >= 1 && isDirect(g)) && direct.reduce((a, b) => a + b, 0) === m) {
    cands.push(direct.slice().sort((a, b) => b - a));
  }
  cands.push(equal);
  return cands;
}

// Tenta cobrir os déficits com k doadoras (as maiores do pool).
function tryDonors(needs, pool, k, cap) {
  const donors = pool.slice(0, k);
  for (const sizes of groupSizeCandidates(needs.length, k)) {
    if (sizes.some(g => g < 1)) continue;
    const groups = [];
    let idx = 0, ok = true;
    for (let j = 0; j < k; j++) {
      const members = needs.slice(idx, idx + sizes[j]);
      idx += sizes[j];
      const maxDef = Math.max(...members.map(d => d.deficit));
      const opt = divisionOptions(donors[j].rate, sizes[j], maxDef, cap);
      const feasible = opt.direct ? opt.ok : opt.loop.ok;
      if (!feasible) { ok = false; break; }
      groups.push({ donor: donors[j], members, maxDeficit: maxDef, division: opt });
    }
    if (ok) return groups;
  }
  return null;
}

// Feeds com `overflow` passam por um Smart Splitter: saída principal no destino,
// overflow pro sink (overflowTo vazio) ou pro merger de outro destino (overflowTo = id do destino).
function buildGraph(plan, cap) {
  const g = makeGraph(cap);
  const srcNode = new Map();
  // Linha em `drain` passa por um Smart Splitter logo na saída: o que o meio não puxa vai pro sink em vez de represar.
  const drain = new Set(plan.drain || []), drainNode = new Map();
  const addSrc = l => {
    if (srcNode.has(l.id)) return;
    const n = addNode(g, 'source', { rate: l.rate, line: l });
    if (!drain.has(l.id)) { srcNode.set(l.id, n); return; }
    const ov = addNode(g, 'overflow');
    addEdge(g, n, ov);
    srcNode.set(l.id, ov);
    drainNode.set(l.id, { line: l, node: ov });
  };
  plan.feeds.forEach(f => f.mains.forEach(addSrc));
  plan.groups.forEach(gr => addSrc(gr.donor));
  if (plan.bal) plan.bal.inputs.forEach(addSrc);
  if (plan.headers) plan.headers.forEach(h => h.inputs.forEach(addSrc));
  plan.leftovers.forEach(addSrc);
  const consumer = new Map();
  [...plan.feeds.map(f => f.dst), ...plan.unfed].forEach(d => consumer.set(d.id, addNode(g, 'consumer', { demand: d.rate, line: d })));
  const sink = addNode(g, 'sink');
  const extra = addNode(g, 'extra');
  const view = { feeds: [], groups: [], leftovers: [], drains: [], sink, extra, srcNode, consumer };

  const slotByDst = new Map();
  plan.groups.forEach((gr, gi) => {
    const donor = srcNode.get(gr.donor.id);
    const p = gr.members.length;
    const v = { gr, donorNode: donor, root: null, donorEdge: null, sinkEdges: [], splitters: 0, extraMergers: 0 };
    let slots, sinkSlots = [];
    if (p === 1) slots = [donor];
    else if (gr.mode === 'loop') {
      // A esteira que entra na árvore leva doadora + retorno (n/p da doadora): no limite, a doadora entra menos.
      v.root = addNode(g, 'balancer', { maxIn: cap * p / gr.n });
      v.donorEdge = addEdge(g, donor, v.root);
      slots = Array(p).fill(v.root);
      v.splitters = gr.tree.splitters;
      v.extraMergers = gr.division.loop.mergers;
    } else {
      const tr = buildTree(g, gr.tree);
      v.root = tr.root;
      v.donorEdge = addEdge(g, donor, tr.root);
      slots = tr.slots.slice(0, p);
      sinkSlots = tr.slots.slice(p);
      v.splitters = gr.tree.splitters;
    }
    gr.members.forEach((dstId, i) => slotByDst.set(dstId, { slot: slots[i], group: gi }));
    v.sinkEdges = sinkSlots.map(s => addEdge(g, s, sink));
    view.groups.push(v);
  });

  if (plan.bal) {
    const outs = plan.feeds.map(f => consumer.get(f.dst.id));
    view.bal = buildBalancer(g, plan.bal.design, plan.bal.inputs.map(l => srcNode.get(l.id)), outs, sink);
    view.feeds = plan.feeds.map((f, j) => ({
      f, consumer: outs[j], mainEdges: [], partEdge: null, outEdge: view.bal.outEdges[j], mergers: 0, mergeNode: null,
      overflowNode: null, sinkEdge: null, overflowEdge: null, overflowTo: null, inbound: [], group: null,
    }));
  } else if (plan.headers) {
    // Cano coletor: o fluido vai para onde tem espaço, então entra como divisão ideal limitada pelo cano.
    // Cano de origem dividido entre coletores: enche o primeiro e o resto segue para o próximo
    // (no grafo, uma cadeia de nós com overflow; no jogo, uma junction).
    const hubs = plan.headers.map(() => addNode(g, 'balancer', { limit: cap }));
    const splitEdge = new Map();
    view.splits = plan.splits.map(sp => {
      let prev = srcNode.get(sp.line.id), first = null;
      sp.headers.forEach((hi, k) => {
        if (k === sp.headers.length - 1) { splitEdge.set(`${sp.line.id}:${hi}`, addEdge(g, prev, hubs[hi])); return; }
        // A parte deste coletor é o que falta nele; o resto segue pelo overflow.
        const n = addNode(g, 'overflow'), part = addNode(g, 'balancer', { limit: sp.parts[k] });
        const e = addEdge(g, prev, n);
        if (first === null) first = e;
        addEdge(g, n, part);
        splitEdge.set(`${sp.line.id}:${hi}`, addEdge(g, part, hubs[hi]));
        prev = n;
      });
      return { sp, edge: first, junctions: junctionsFor(1 + sp.headers.length) };
    });
    view.headers = plan.headers.map((h, hi) => {
      const hub = hubs[hi];
      return {
        h, hub,
        inEdges: h.inputs.map(l => splitEdge.get(`${l.id}:${hi}`) ?? addEdge(g, srcNode.get(l.id), hub)),
        outEdges: h.members.map(d => addEdge(g, hub, consumer.get(d.id))),
        junctions: junctionsFor(h.inputs.length + h.members.length),
      };
    });
    view.feeds = plan.feeds.map(f => {
      const hv = view.headers.find(x => x.h.members.includes(f.dst));
      return {
        f, consumer: consumer.get(f.dst.id), mainEdges: [], partEdge: null, outEdge: hv.outEdges[hv.h.members.indexOf(f.dst)],
        mergers: 0, mergeNode: null, overflowNode: null, sinkEdge: null, overflowEdge: null, overflowTo: null, inbound: [], group: null, header: hv,
      };
    });
  } else {
    // Primeiro os Smart Splitters, para a saída principal ser a primeira do nó.
    const fv = new Map(), ovNode = new Map();
    plan.feeds.filter(f => f.overflow).forEach(f => {
      const c = consumer.get(f.dst.id);
      const ov = addNode(g, 'overflow');
      const conn = connectMany(g, f.mains.map(l => srcNode.get(l.id)), ov);
      const outEdge = addEdge(g, ov, c);
      const toSink = f.overflowTo === undefined || f.overflowTo === null;
      ovNode.set(f.dst.id, ov);
      fv.set(f.dst.id, {
        f, consumer: c, mainEdges: conn.inEdges.slice(0, f.mains.length), partEdge: null, outEdge,
        mergers: conn.mergers, mergeNode: conn.mergeNode, overflowNode: ov,
        sinkEdge: toSink ? addEdge(g, ov, sink) : null, overflowEdge: null, overflowTo: toSink ? null : f.overflowTo,
        inbound: [], group: null,
      });
    });
    plan.feeds.filter(f => !f.overflow).forEach(f => {
      const c = consumer.get(f.dst.id);
      const froms = f.mains.map(l => srcNode.get(l.id));
      const slot = slotByDst.get(f.dst.id);
      if (slot) froms.push(slot.slot);
      const senders = plan.feeds.filter(x => x.overflow && x.overflowTo === f.dst.id);
      senders.forEach(x => froms.push(ovNode.get(x.dst.id)));
      const conn = connectMany(g, froms, c);
      const nm = f.mains.length;
      const inbound = senders.map((x, i) => ({ from: x.dst.id, edge: conn.inEdges[nm + (slot ? 1 : 0) + i] }));
      inbound.forEach(ib => { fv.get(ib.from).overflowEdge = ib.edge; });
      fv.set(f.dst.id, {
        f, consumer: c, mainEdges: conn.inEdges.slice(0, nm), partEdge: slot ? conn.inEdges[nm] : null, outEdge: conn.outEdge,
        mergers: conn.mergers, mergeNode: conn.mergeNode, overflowNode: null, sinkEdge: null, overflowEdge: null, overflowTo: null,
        inbound, group: slot ? slot.group : null,
      });
    });
    view.feeds = plan.feeds.map(f => fv.get(f.dst.id));
    view.groups.forEach((v, gi) => {
      if (v.donorEdge === null) v.donorEdge = view.feeds.find(x => x.group === gi).partEdge;
    });
  }

  plan.leftovers.forEach(l => {
    const n = srcNode.get(l.id);
    const to = plan.policy === 'sink' ? sink : plan.policy === 'extra' ? extra : null;
    view.leftovers.push({ line: l, node: n, edge: to === null ? null : addEdge(g, n, to) });
  });
  // Por último, para a saída principal do Smart Splitter ser a primeira do nó.
  drainNode.forEach(d => view.drains.push({ ...d, sinkEdge: addEdge(g, d.node, sink) }));
  return { g, view };
}

export function evaluatePlan(plan, cap) {
  const { g, view } = buildGraph(plan, cap);
  const sim = simulate(g);
  const sumE = ids => ids.reduce((a, e) => a + sim.flow[e], 0);
  const sources = new Map(), dests = new Map();
  for (const n of g.nodes) {
    if (n.type === 'source') {
      const out = sumE(n.outs);
      sources.set(n.line.id, { line: n.line, out, held: Math.max(0, n.line.rate - out) });
    } else if (n.type === 'consumer') {
      const got = sumE(n.ins);
      dests.set(n.line.id, { line: n.line, got, short: Math.max(0, n.line.rate - got) });
    }
  }
  const sinkRate = sumE(g.nodes[view.sink].ins);
  const extraRate = sumE(g.nodes[view.extra].ins);
  let held = 0, served = 0, demand = 0, midHeld = 0;
  const left = new Set(plan.leftovers.map(l => l.id));
  sources.forEach(s => { held += s.held; if (!left.has(s.line.id)) midHeld += s.held; });
  dests.forEach(d => { served += d.got; demand += d.line.rate; });
  const full = [...dests.values()].every(d => d.short < 0.05);
  const bal = view.bal || { mergers: 0, splitters: 0, blueprints: 0 };
  const pieces = {
    mergers: view.feeds.reduce((a, f) => a + f.mergers, 0) + view.groups.reduce((a, v) => a + v.extraMergers, 0) + bal.mergers,
    splitters: view.groups.reduce((a, v) => a + v.splitters, 0) + bal.splitters,
    smart: view.feeds.filter(f => f.overflowNode !== null).length + view.drains.length,
    blueprints: bal.blueprints,
    junctions: (view.headers || []).reduce((a, h) => a + h.junctions, 0) + (view.splits || []).reduce((a, x) => a + x.junctions, 0),
    sinkBelts: g.nodes[view.sink].ins.length,
  };
  const warnings = [];
  for (const v of view.groups) {
    const d = v.gr.division;
    if (v.gr.mode === 'loop' && !d.loop.beltOk) warnings.push(t('warnLoopBelt', fmt(d.loop.beltLoad)));
    if (v.gr.mode === 'sink' && !d.sink.ok) warnings.push(t('warnSinkPart', srcTag(v.gr.donor.id), d.n, fmt(d.sink.part), fmt(v.gr.maxDeficit)));
  }
  let caseLabel;
  if (!full) caseLabel = t('casePartial');
  else if (plan.kind === 'direct') caseLabel = t('caseA');
  else if (plan.kind === 'merge') caseLabel = t('caseC');
  else if (plan.kind === 'overflow') caseLabel = t('caseD');
  else if (plan.kind === 'header') caseLabel = t('caseHeader');
  else if (plan.kind === 'balancer') caseLabel = t('caseBal', plan.bal.inputs.length, plan.feeds.length);
  else caseLabel = plan.multi ? t('caseCB') : t('caseB');
  return { ...plan, g, view, sim, sources, dests, sinkRate, extraRate, held, midHeld, served, demand, full, pieces, warnings, caseLabel };
}

// Gera as alternativas para ligar as linhas de origem nas de destino.
export function generatePlans(srcLines, dstLines, cap, policy, blueprints = [], fluid = false) {
  const S = srcLines.map((l, i) => ({ ...l, id: i })).sort((a, b) => b.rate - a.rate || a.id - b.id);
  const D = dstLines.map((l, i) => ({ ...l, id: i })).sort((a, b) => b.rate - a.rate || a.id - b.id);
  if (!S.length || !D.length) return [];
  const plans = [];
  const mk = (key, kind, title, feeds, groups, leftovers, extra) => ({
    key, kind, title, feeds, groups, leftovers, policy,
    unfed: D.filter(d => !feeds.some(f => f.dst.id === d.id)),
    ...extra,
  });

  // Melhor encaixe: cada destino (do maior pro menor) pega a menor linha que o cobre sozinha;
  // se nenhuma cobre, pega a maior que sobrou. Com linhas iguais dá o mesmo que parear em ordem.
  const avail = S.slice();
  const fit = [];
  for (const d of D) {
    if (!avail.length) break;
    const covering = avail.filter(l => l.rate + EPS >= d.rate);
    // Entre linhas de mesma taxa, a de menor número: O1 vai pro primeiro destino que pedir.
    const smallest = covering.length ? covering[covering.length - 1].rate : null;
    const pick = covering.length ? covering.find(l => Math.abs(l.rate - smallest) < EPS) : avail[0];
    avail.splice(avail.indexOf(pick), 1);
    fit.push({ dst: d, mains: [pick], deficit: Math.max(0, d.rate - pick.rate), excess: Math.max(0, pick.rate - d.rate) });
  }
  const direct = fit.map(f => ({ dst: f.dst, mains: f.mains }));
  plans.push(mk('direto', 'direct', t('planDirect'), direct, [], avail.slice(), { sub: t('planDirectSub') }));
  // Fluido: sem splitter, Smart Splitter nem sink. Só ligar direto ou passar por canos coletores.
  if (fluid) {
    const hd = headerGroups(S, D, cap);
    if (hd.splits.length || hd.headers.some(h => h.inputs.length > 1 || h.members.length > 1)) {
      const feeds = hd.headers.flatMap(h => h.members.map(d => ({ dst: d, mains: [] })));
      plans.push(mk('coletor', 'header', t('planHeader'), feeds, [], hd.rest, { sub: t('planHeaderSub'), headers: hd.headers, splits: hd.splits }));
    }
    return plans;
  }
  if (fit.some(f => f.excess > EPS)) {
    plans.push(mk('direto-sink', 'direct', t('planDirectSink'),
      direct.map((f, i) => ({ ...f, overflow: fit[i].excess > EPS })), [], avail.slice(), { sub: t('planDirectSinkSub') }));
  }

  // Redistribuição: o excesso de uma linha (Smart Splitter com overflow) completa o destino que falta.
  const exc = fit.filter(f => f.excess > EPS).sort((a, b) => b.excess - a.excess);
  const def = fit.filter(f => f.deficit > EPS).sort((a, b) => b.deficit - a.deficit);
  if (exc.length && def.length) {
    const spare = avail.slice().sort((a, b) => b.rate - a.rate);
    const sendTo = new Map(), extraMains = new Map();
    for (const tg of def) {
      let got = 0;
      while (got + EPS < tg.deficit && exc.length) { const e = exc.shift(); sendTo.set(e.dst.id, tg.dst.id); got += e.excess; }
      const add = [];
      while (got + EPS < tg.deficit && spare.length) { const l = spare.shift(); add.push(l); got += l.rate; }
      extraMains.set(tg.dst.id, add);
    }
    if (sendTo.size) {
      const feeds = fit.map(f => (sendTo.has(f.dst.id)
        ? { dst: f.dst, mains: f.mains, overflow: true, overflowTo: sendTo.get(f.dst.id) }
        : { dst: f.dst, mains: f.mains.concat(extraMains.get(f.dst.id) || []) }));
      plans.push(mk('redistribuir', 'overflow', t('planRedist'), feeds, [], spare, { sub: t('planRedistSub') }));
    }
  }

  const s = S[0].rate;
  const full = S.filter(l => Math.abs(l.rate - s) < EPS);
  const rest = S.filter(l => Math.abs(l.rate - s) >= EPS);

  const ceilQ = D.map(d => Math.max(1, Math.ceil(d.rate / s - EPS)));
  if (ceilQ.some(q => q > 1) && ceilQ.reduce((a, b) => a + b, 0) <= full.length) {
    let i = 0;
    const feeds = D.map((d, j) => { const mains = full.slice(i, i + ceilQ[j]); i += ceilQ[j]; return { dst: d, mains }; });
    plans.push(mk('juntar', 'merge', t('planMerge'), feeds, [], full.slice(i).concat(rest), { sub: t('planMergeSub') }));
  }

  // Complemento: divide doadoras do pool entre os destinos com déficit.
  const seenSig = new Set();
  const donorPlans = (base, pool, multi, tag) => {
    pool = pool.slice().sort((a, b) => b.rate - a.rate);
    const needs = base.filter(f => f.deficit > EPS).sort((a, b) => b.deficit - a.deficit);
    let found = 0;
    for (let kd = 1; needs.length && kd <= pool.length && found < 3; kd++) {
      const groups = tryDonors(needs, pool, kd, cap);
      if (!groups) continue;
      const sig = JSON.stringify([base.map(f => [f.dst.id, f.mains.map(l => l.id)]), groups.map(gr => [gr.donor.id, gr.members.map(f => f.dst.id)])]);
      if (seenSig.has(sig)) continue;
      seenSig.add(sig);
      found++;
      const allDirect = groups.every(gr => gr.division.direct);
      const variants = allDirect ? ['direct'] : ['sink', 'loop'];
      const used = new Set(groups.map(gr => gr.donor.id));
      for (const v of variants) {
        const gs = groups.map(gr => ({
          donor: gr.donor, members: gr.members.map(f => f.dst.id), maxDeficit: gr.maxDeficit,
          division: gr.division, mode: gr.division.direct ? 'direct' : v,
          tree: gr.division.tree, p: gr.division.p, n: gr.division.n,
        }));
        const sub = t(v === 'direct' ? 'planDonorSubDirect' : v === 'sink' ? 'planDonorSubSink' : 'planDonorSubLoop');
        plans.push(mk(`doadora${tag}-${kd}-${v}`, 'donor', t('planDonor', multi, kd, v),
          base.map(f => ({ dst: f.dst, mains: f.mains, deficit: f.deficit })), gs,
          pool.filter(l => !used.has(l.id)), { sub, multi }));
      }
    }
  };

  const floorQ = D.map(d => (d.rate <= s + EPS ? 1 : Math.floor(d.rate / s + EPS)));
  if (floorQ.reduce((a, b) => a + b, 0) <= full.length) {
    let i = 0;
    const base = D.map((d, j) => {
      const mains = full.slice(i, i + floorQ[j]); i += floorQ[j];
      return { dst: d, mains, deficit: Math.max(0, d.rate - floorQ[j] * s) };
    });
    donorPlans(base, full.slice(i).concat(rest), floorQ.some(q => q > 1), '');
  }
  if (fit.length === D.length) donorPlans(fit, avail, false, '-encaixe');

  // Balancer N→M: as maiores linhas até somar a demanda entram num balancer que reparte igual entre os M destinos.
  // Uma alternativa por design aplicável; computePlan fica só com a melhor delas.
  const directFull = fit.length === D.length && fit.every(f => f.deficit < EPS);
  if (D.length >= 2 && !directFull) {
    const need = D.reduce((a, d) => a + d.rate, 0);
    const ins = [];
    let sum = 0;
    for (const l of S) { if (sum + EPS >= need) break; ins.push(l); sum += l.rate; }
    const rates = ins.map(l => l.rate);
    for (const d of balancerCandidates(ins.length, D.length, rates, cap, blueprints)) {
      if (d.applies) continue;
      plans.push(mk(`balancer-${d.kind}${d.bp ? `-${d.bp.n}x${d.bp.m}` : ''}`, 'balancer', t('planBal', ins.length, D.length, designName(d)),
        D.map(dd => ({ dst: dd, mains: [] })), [], S.filter(l => !ins.includes(l)),
        { sub: t('planBalSub'), bal: { inputs: ins, design: d } }));
    }
  }
  return plans;
}

// Canos coletores: os destinos (do maior pro menor) vão para o primeiro coletor em que cabem (até `cap`).
// Os canos de origem enchem os coletores em sequência; quando um cano tem mais do que falta num coletor,
// uma Pipeline Junction divide ele e o resto segue para o próximo coletor (`splits`).
export function headerGroups(S, D, cap) {
  const headers = [];
  for (const d of D) {
    let h = headers.find(x => x.need + d.rate <= cap + EPS);
    if (!h) { h = { need: 0, members: [], inputs: [] }; headers.push(h); }
    h.members.push(d);
    h.need += d.rate;
  }
  const pool = S.slice(), splits = new Map();
  let carry = null;
  headers.forEach((h, hi) => {
    let need = h.need;
    const last = hi === headers.length - 1;
    while (need > EPS) {
      if (!carry) { if (!pool.length) break; const l = pool.shift(); carry = { line: l, left: l.rate }; }
      h.inputs.push(carry.line);
      if (carry.left <= need + EPS || last) {
        if (splits.has(carry.line.id)) splits.get(carry.line.id).parts.push(carry.left);
        need -= carry.left;
        carry = null;
        continue;
      }
      if (!splits.has(carry.line.id)) splits.set(carry.line.id, { line: carry.line, headers: [hi], parts: [] });
      const sp = splits.get(carry.line.id);
      sp.headers.push(hi + 1);
      sp.parts.push(need);
      carry.left -= need;
      need = 0;
    }
  });
  return { headers: headers.filter(h => h.inputs.length), splits: [...splits.values()], rest: pool };
}

// Blueprint conta como uma peça: é só colar.
// excess 'sink': entre as que enchem tudo, primeiro as que não represam nada no meio.
function rankPlans(evaluated, excess = 'represar') {
  // Balancer borboleta conta como mais peças, pelo mesmo critério de rankDesigns.
  const cost = a => a.pieces.mergers + a.pieces.splitters + a.pieces.smart + a.pieces.blueprints + a.pieces.junctions
    + (a.bal && bfKind(a.bal.design) ? buildCost(a.bal.design) - designPieces(a.bal.design) : 0);
  const holds = a => (excess === 'sink' && a.full && a.midHeld > 0.05 ? 1 : 0);
  return evaluated.slice().sort((a, b) =>
    (b.full - a.full) || (b.served - a.served) * (a.full ? 0 : 1) || holds(a) - holds(b) || cost(a) - cost(b) || a.sinkRate - b.sinkRate);
}

// A melhor alternativa que enche tudo mas represa no meio ganha uma versão sem represa:
// Smart Splitter na saída de cada linha represada, overflow pro sink.
function drainPlan(evaluated, cap) {
  const base = rankPlans(evaluated).find(a => a.full && a.midHeld > 0.05 && a.kind !== 'direct');
  if (!base) return null;
  const left = new Set(base.leftovers.map(l => l.id));
  const ids = [...base.sources.values()].filter(s => s.held > 0.05 && !left.has(s.line.id)).map(s => s.line.id);
  const { g, view, sim, sources, dests, sinkRate, extraRate, held, midHeld, served, demand, full, pieces, warnings, caseLabel, designAlts, ...plan } = base;
  const a = evaluatePlan({ ...plan, key: `${base.key}-sem-represa`, title: t('planDrain', base.title), sub: t('planDrainSub'), drain: ids }, cap);
  return a.full ? a : null;
}

// Plano completo a partir das entradas.
// srcGroups/dstGroups: [{ driver: 'machines'|'clock'|'total', count, clock, nominal, total, per }].
export function computePlan(input) {
  const cap = input.cap;
  const fluid = input.medium === 'fluid';
  // O Awesome Sink não aceita fluido: a sobra represa.
  const policy = fluid && input.policy === 'sink' ? 'represar' : input.policy || 'represar';
  const conv = input.conv || 'k-1';
  const srcGroups = input.srcGroups || [{ driver: 'machines', count: input.srcCount, nominal: input.srcRate, per: input.srcPer }];
  const dstGroups = input.dstGroups || [{ driver: 'machines', count: input.dstCount, nominal: input.dstRate, per: input.dstPer }];
  const src = buildLines(srcGroups, cap, t('sideSrc'), fluid);
  const dst = buildLines(dstGroups, cap, t('sideDst'), fluid, { balance: true, mix: false });
  // O Awesome Sink não aceita fluido: no cano o excesso sempre represa.
  const excess = fluid ? 'represar' : input.excess === 'sink' ? 'sink' : 'represar';
  const evaluated = generatePlans(src.lines, dst.lines, cap, policy, input.blueprints || [], fluid).map(p => evaluatePlan(p, cap));
  const drained = fluid ? null : drainPlan(evaluated, cap);
  if (drained) evaluated.push(drained);
  const ranked = rankPlans(evaluated, excess);
  // Dos designs de balancer, só o melhor vira alternativa; os outros ficam para a comparação.
  const balAlts = ranked.filter(a => a.kind === 'balancer' && !a.drain);
  const alternatives = ranked.filter(a => a.kind !== 'balancer' || a === balAlts[0] || a.drain);
  if (balAlts.length) balAlts[0].designAlts = balAlts;
  const supply = src.total, demand = dst.total;

  const warnings = [...src.warnings, ...dst.warnings];
  if (demand > supply + EPS) {
    const one = dst.groups.length === 1 && !dst.groups[0].continuous ? dst.groups[0] : null;
    warnings.push({ level: 'bad', text: t('warnDemand', fmt(demand), fmt(supply), one ? fmt(supply / one.nominal, 2) : null) });
  }
  const mixed = l => l.partial && l.comp && l.comp.length && !l.comp[0].total;
  const mixedList = ls => ls.map(l => `${lineComp(l)} = ${fmt(l.rate)}/min`).join('; ');
  const srcMixed = src.lines.filter(mixed);
  if (srcMixed.length) warnings.push({ level: 'warn', text: t('warnCollectMixed', srcMixed.length, mixedList(srcMixed)) });
  const dstMixed = dst.lines.filter(mixed);
  if (dstMixed.length) warnings.push({ level: 'warn', text: t('warnDistMixed', dstMixed.length, mixedList(dstMixed)) });

  return {
    input, cap, conv, policy, excess, fluid, src, dst, supply, demand, alternatives, warnings,
    collectMergers: manifoldPieces(src.lines, conv),
    distSplitters: manifoldPieces(dst.lines, conv),
  };
}
