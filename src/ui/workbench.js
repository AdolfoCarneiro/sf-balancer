import { t, fmt } from '../i18n/index.js';
import { layout3d, focus3d, byPiece3d, pieceText3d, planFootprint, designerSize, placeMark, defaultMarks, addMark, panView, zoomView, tapGesture, balancerCandidates, rankDesigns, designWhy, designPieces, designName } from '../logic/index.js';
import { esc } from './common.js';
import { MARK_TAB, PIECE_ICON, PLAN_PX, balancerBuild, cap1, designKey, flatSvg, inColor, pieceIcon, planMarksSvg, rateList, segName } from './balancerSvg.js';
import { tip } from './help.js';
import { mount3d } from '../view3d/scene.js';
import { EXT_MOD, extBpUrl, extLink } from './lang.js';

const FLAT_CACHE = new Map();
export const flatLayout = d => {
  const k = `${designKey(d)}|${d.N}|${d.M}`;
  if (!FLAT_CACHE.has(k)) FLAT_CACHE.set(k, layout3d(d, 'flat'));
  return FLAT_CACHE.get(k);
};

// Passo a passo (como o Ponder do Create): a peça nova aparece como holograma, as anteriores ficam sólidas.
// view: '2d' (SVG) ou a montagem 3D ('towers' | 'floors'); opts.onMode troca a montagem 3D.
function mountPonder(root, d, labels, view = '2d', opts = {}) {
  if (root._stop) root._stop();
  const in3d = view !== '2d';
  // No 2D, o desenho vem da montagem 'flat' (vista de cima): compacto no esquema, em escala na planta.
  // O blueprint seu é uma caixa só.
  const flat2d = !in3d && d.kind !== 'blueprint', plan = flat2d && opts.view2d === 'plan', mode = in3d ? view : 'flat';
  // Por peça: um passo por splitter ou merger (byPiece3d); por nível: um por torre, andar ou coluna.
  const per = opts.per === 'piece' ? 'piece' : 'level';
  const lay0 = in3d || flat2d ? opts.lay || (flat2d ? flatLayout(d) : layout3d(d, view)) : null;
  const lay = lay0 && per === 'piece' ? byPiece3d(lay0) : lay0;
  const { svg, steps, kinds = [] } = lay
    ? { svg: flat2d ? flatSvg(d, lay, labels, per, plan) : '', kinds: lay.steps.map(st => (st.key === 'piece' ? { t: st.t, ways: st.ways } : null)), steps: lay.steps.map(st => (st.key === 'in' ? t('stIn', d.N, labels.ins.join(', '), rateList(d.rates))
      : st.key === 'out' ? t('stOut', d.M, fmt(d.perOut)) : st.key === 'piece' ? pieceText3d(st, labels, mode)
      : t('stLevel3d', mode, st.level, st.sp, st.ways, st.mg, st.up, st.down))) }
    : balancerBuild(d, labels);
  const K = steps.length;
  let cur = K, timer = null, scene = null;
  const matrix = !d.kind.startsWith('funnel');
  const ctl3d = in3d ? `<div class="s3d-ctl">
      <div class="seg" role="radiogroup" aria-label="${esc(t('mode3dLabel'))}">${['towers', 'floors'].map(m => `<button type="button" role="radio" aria-checked="${m === view}" data-mode="${m}">${t('mode3d' + cap1(m))}</button>`).join('')}</div>${tip('tip3dMode')}
      <div class="seg" role="radiogroup" aria-label="${esc(t('per3dLabel'))}">${['level', 'piece'].map(v => `<button type="button" role="radio" aria-checked="${v === per}" data-per="${v}">${t('per3d' + cap1(v))}</button>`).join('')}</div>${tip('tip3dPer')}
      <button type="button" class="pbtn" data-recenter>${t('recenter3d')}</button></div>` : '';
  // No 2D o mesmo Por nível / Por peça fica acima do desenho (o blueprint é uma peça só).
  const ctl2d = !in3d && d.kind !== 'blueprint' ? `<div class="pmode"><span>${t('view2dLabel')}</span>
      <div class="seg" role="radiogroup" aria-label="${esc(t('view2dLabel'))}">${['scheme', 'plan'].map(v => `<button type="button" role="radio" aria-checked="${v === (plan ? 'plan' : 'scheme')}" data-v2d="${v}">${t('view2d' + cap1(v))}</button>`).join('')}</div>${tip('tipView2d')}
      <span>${t('perLabel')}</span>
      <div class="seg" role="radiogroup" aria-label="${esc(t('perLabel'))}">${['level', 'piece'].map(v => `<button type="button" role="radio" aria-checked="${v === per}" data-per="${v}">${t('per3d' + cap1(v))}</button>`).join('')}</div>${tip('tipPer2d')}</div>` : '';
  // No desenho 2D a área escura inteira é o desenho: os controles ficam por cima, como no 3D.
  root.innerHTML = `<div class="ponder" tabindex="-1">${flat2d ? '' : ctl2d}
    <div class="stage${in3d ? ' stage3d' : flat2d ? ' stage2d' : ''}">${in3d ? `${ctl3d}<p class="load3d">${t('loading3d')}</p><span class="hint3d">${t('hint3dFocus')}</span>` : svg}${flat2d ? `${ctl2d}<div class="zctl">
      <button type="button" class="pbtn" data-z="in" aria-label="${esc(t('zoomIn'))}">+</button><button type="button" class="pbtn" data-z="out" aria-label="${esc(t('zoomOut'))}">−</button><button type="button" class="pbtn" data-z="fit">${t('zoomFit')}</button></div>
      <span class="hint3d hint2d">${t('hint2dZoom')}${plan ? ` ${t('hint2dMarks')}` : ''}</span>` : ''}</div>
    ${plan ? `<div class="bpbar" role="group" aria-label="${esc(t('bpMarksAria'))}"><span class="bpbar-t">Blueprint Designer</span>${tip('tipBpMarks')}
      ${[1, 2, 3].map(mk => `<button type="button" class="pbtn" data-bpadd="${mk}" aria-label="${esc(t('bpMarkAddAria', mk, designerSize(mk) / 8))}">${t('bpMarkAdd', mk)}</button>`).join('')}
      <button type="button" class="pbtn" data-bpmove aria-pressed="false">${t('bpMove')}</button>
      <span class="bplist"></span></div>` : ''}
    <div class="cap" aria-live="polite"><span class="cap-n"></span><span class="cap-i"></span><p class="cap-t"></p></div>
    <div class="pctl">
      <button type="button" class="pbtn" data-p="prev" aria-label="${esc(t('stepPrev'))}">‹</button>
      <div class="ticks${steps.length > 24 ? ' many' : ''}">${steps.map((_, i) => `<button type="button" class="tick" data-p="${i}" aria-label="${esc(t('stepGoto', i + 1))}"></button>`).join('')}</div>
      <button type="button" class="pbtn" data-p="next" aria-label="${esc(t('stepNext'))}">›</button>
      <button type="button" class="pbtn" data-p="play"></button>
      <button type="button" class="pbtn prim" data-p="toggle"></button>
      <span class="pkeys">${t('ponderKeys')}</span>
    </div>
    ${in3d ? `<div class="follow"><span>${t('follow3d')}</span>${[...lay.pieces.filter(p => p.t === 'in').map((p, i) => [p.id, labels.ins[i], inColor(p.inp ?? i)]), ...lay.pieces.filter(p => p.t === 'out').map((p, i) => [p.id, labels.outs[i], inColor(i)])]
      .map(([id, tag, c]) => `<button type="button" class="chip" data-follow="${id}" aria-pressed="false" aria-label="${esc(t('followAria', tag))}"><i style="background:${c}"></i>${esc(tag)}</button>`).join('')}</div>` : ''}
    <div class="plegend">
      ${matrix ? labels.ins.map((tag, i) => `<span><i style="background:${inColor(i)}"></i>${esc(tag)}</span>`).join('') : ''}
      ${in3d || d.kind === 'blueprint' ? '' : [
        d.pieces.splitters ? `<span>${PIECE_ICON.splitter(d.net ? d.net.rounds[0].f : d.tree.factors[0])}${t('lgSplitWays')}</span>` : '',
        d.pieces.mergers ? `<span>${PIECE_ICON.merger}${t('lgMergerJoin')}</span>` : '',
        `<span>${PIECE_ICON.mixed}${t('lgMixed')}</span>`,
        plan ? `<span>${PIECE_ICON.grid}${t('lgGrid')}</span><span>${PIECE_ICON.designer}${t('lgDesigner')}</span>` : '',
        per === 'piece' ? `<span>${PIECE_ICON.num}${t('lgPieceNum')}</span>` : '',
      ].join('')}
      <span><i class="holo"></i>${t('lgHolo')}</span>
      ${in3d ? `<span><i class="sp3"></i>${t('lgSplitter')}</span><span><i class="mg3"></i>${t('lgMerger')}</span><span><i class="pouti"></i>${t('lgPortOut')}</span><span><i class="pini"></i>${t('lgPortIn')}</span>${tip('tip3dTop')}` : ''}
      ${d.extra && d.kind.endsWith('-loop') ? `<span><i class="loopi"></i>${t('lgLoopBack')}</span>` : ''}
      ${d.extra && d.kind.endsWith('-sink') ? `<span><i style="background:var(--sink)"></i>${t('lgToSink')}</span>` : ''}
    </div>
  </div>`;
  const q = s => root.querySelector(s);
  const stop = () => { clearInterval(timer); timer = null; };
  root._stop = () => { stop(); if (scene) scene.dispose(); scene = null; root._token = null; };
  const update = () => {
    const st = q('.bsvg');
    if (scene) scene.setStep(cur, K);
    if (st) st.classList.toggle('stepping', cur < K);
    if (st) st.querySelectorAll('[data-s]').forEach(el => {
      const s = +el.dataset.s;
      el.classList.toggle('fut', cur < K && s > cur);
      el.classList.toggle('now', cur < K && s === cur);
      el.classList.toggle('past', cur < K && s < cur);
    });
    const done = cur >= K;
    q('.cap').classList.toggle('done', done);
    q('.cap-n').textContent = done ? '✓' : t('stepOf', cur + 1, K);
    q('.cap-i').innerHTML = !done && kinds[cur] ? pieceIcon(kinds[cur]) : '';
    q('.cap-t').textContent = done ? t('stepDone', designPieces(d), d.M, fmt(d.perOut)) : steps[cur];
    root.querySelectorAll('.tick').forEach((b, i) => {
      b.classList.toggle('done', done || i < cur);
      b.classList.toggle('cur', !done && i === cur);
      b.setAttribute('aria-current', !done && i === cur ? 'step' : 'false');
    });
    q('[data-p=prev]').disabled = cur === 0;
    q('[data-p=next]').disabled = done;
    q('[data-p=play]').textContent = timer ? t('stepPause') : t('stepPlay');
    q('[data-p=toggle]').textContent = done ? t('stepStart') : t('stepAll');
  };
  const go = k => { cur = Math.max(0, Math.min(K, k)); if (cur >= K) stop(); update(); };
  root.querySelector('.pctl').addEventListener('click', e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const p = b.dataset.p;
    if (p === 'prev') { stop(); go(cur - 1); }
    else if (p === 'next') { stop(); go(cur + 1); }
    else if (p === 'toggle') { stop(); go(cur >= K ? 0 : K); }
    else if (p === 'play') {
      if (timer) { stop(); update(); return; }
      if (cur >= K) cur = 0;
      timer = setInterval(() => go(cur + 1), 2600);
      update();
    } else { stop(); go(+p); }
  });
  q('.ponder').addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); stop(); go(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); go(cur - 1); }
  });
  update();
  q('.pmode')?.addEventListener('click', e => {
    const pv = e.target.closest('[data-per]');
    if (pv && pv.dataset.per !== per && opts.onPer) opts.onPer(pv.dataset.per);
    const v2 = e.target.closest('[data-v2d]');
    if (v2 && v2.dataset.v2d !== (plan ? 'plan' : 'scheme') && opts.onView2d) opts.onView2d(v2.dataset.v2d);
  });
  // Planta: passar o mouse ou tocar numa peça, entrada ou saída deixa aceso só o caminho dela (como no 3D).
  if (flat2d) {
    const st = q('.bsvg');
    const light = id => {
      const f = id === null ? null : focus3d(lay, id);
      st.classList.toggle('focusing', !!f);
      st.querySelectorAll('[data-id]').forEach(el => el.classList.toggle('lit', !!f && f.pieces.has(+el.dataset.id)));
      st.querySelectorAll('[data-b]').forEach(el => el.classList.toggle('lit', !!f && f.belts.has(+el.dataset.b)));
    };
    let pinned = null;
    const drag = new Map(), tap = tapGesture();
    st.addEventListener('pointerover', e => { if (pinned === null && !drag.size) { const el = e.target.closest('[data-id]'); light(el ? +el.dataset.id : null); } });
    st.addEventListener('pointerleave', () => { if (pinned === null) light(null); });
    // Zoom e arrastar: mexe só no viewBox (abre mostrando tudo). Roda ou pinça no ponto, botões no centro;
    // arrastar move quando há zoom. Toque parado (tapGesture) fixa ou solta o caminho aceso.
    // "Ver tudo": o desenho inteiro no meio da área livre (abaixo dos botões, acima da dica), com a proporção
    // da área; zoom e arrastar ficam dentro desse quadro. A altura da área acompanha o desenho, até 68% da tela.
    const W0 = st.viewBox.baseVal.width, H0 = st.viewBox.baseVal.height, stage = q('.stage2d');
    let full = { x: 0, y: 0, w: W0, h: H0 }, vb = { ...full }, pinch = null, fitW = -1;
    const apply = () => { st.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); st.classList.toggle('zoomed', vb.w < full.w - 1e-6); };
    // Marcações do Blueprint Designer (só na planta): valem para esta montagem; quem guarda é opts.marks, que o
    // workbench zera quando muda N→M, taxa, tier ou montagem.
    const ms = plan ? opts.marks || {} : null, fp = plan ? planFootprint(lay0) : null;
    const ox = +st.dataset.ox || 0, oz = +st.dataset.oz || 0;
    if (ms && !ms.list) ms.list = defaultMarks(fp);
    // O que "Ver tudo" enquadra: o desenho e as marcações (com a aba do rótulo).
    const content = () => {
      let x0 = 0, y0 = 0, x1 = W0, y1 = H0;
      for (const m of ms ? ms.list : []) {
        const s = designerSize(m.mk) * PLAN_PX, x = ox + m.x * PLAN_PX, y = oz + m.z * PLAN_PX;
        x0 = Math.min(x0, x - 8); y0 = Math.min(y0, y - MARK_TAB - 8); x1 = Math.max(x1, x + s + 8); y1 = Math.max(y1, y + s + 8);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const frame = resize => {
      const cw = stage.clientWidth;
      if (!cw) return false;
      const b = content(), top = stage.querySelector('.pmode').offsetHeight + 16, bot = stage.querySelector('.hint2d').offsetHeight + 16;
      if (resize) stage.style.height = `${Math.round(Math.max(340, Math.min(innerHeight * 0.68, cw * b.h / b.w + top + bot)))}px`;
      const ch = stage.clientHeight, s = Math.max(b.w / cw, b.h / Math.max(80, ch - top - bot));
      full = { x: b.x + (b.w - cw * s) / 2, y: b.y - top * s - ((ch - top - bot) * s - b.h) / 2, w: cw * s, h: ch * s };
      return true;
    };
    const fit = () => {
      if (!frame(true)) return;
      fitW = stage.clientWidth;
      vb = { ...full };
      apply();
    };
    // Depois de pôr, mover ou tirar marcação: o quadro de "Ver tudo" acompanha, sem mexer no zoom atual.
    const reframe = () => { if (frame(false)) { vb = zoomView(vb, full, 1, vb.x + vb.w / 2, vb.y + vb.h / 2); apply(); } };
    fit();
    // Só refaz quando a largura muda (a altura quem muda é o próprio fit).
    const ro = new ResizeObserver(() => requestAnimationFrame(() => { if (stage.isConnected && stage.clientWidth !== fitW) fit(); }));
    ro.observe(stage);
    const stop0 = root._stop;
    root._stop = () => { ro.disconnect(); stop0(); };
    const toSvg = (x, y) => { const m = st.getScreenCTM(); if (!m) return [vb.x + vb.w / 2, vb.y + vb.h / 2]; const pt = new DOMPoint(x, y).matrixTransform(m.inverse()); return [pt.x, pt.y]; };
    const zoom = (k, at) => { vb = zoomView(vb, full, k, ...(at || [vb.x + vb.w / 2, vb.y + vb.h / 2])); apply(); };
    q('.zctl').addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      if (b.dataset.z === 'fit') fit(); else zoom(b.dataset.z === 'in' ? 1.5 : 1 / 1.5);
    });
    // Ctrl (ou Cmd) + arrastar sobre uma marcação move só ela, presa na grade; no toque, o botão Mover marcação
    // faz o arrastar de um dedo pegar a marcação. Fora de uma marcação, arrastar continua movendo a vista.
    const toWorld = (x, y) => { const [a, b] = toSvg(x, y); return [(a - ox) / PLAN_PX, (b - oz) / PLAN_PX]; };
    const hitMark = ([x, z]) => [...(ms ? ms.list : [])].reverse().find(m => {
      const s = designerSize(m.mk);
      return x >= m.x && x <= m.x + s && z >= m.z - MARK_TAB / PLAN_PX && z <= m.z + s;
    });
    const wantsMark = e => !!ms && (e.ctrlKey || e.metaKey || !!ms.move);
    let markDrag = null;
    const bar = q('.bpbar');
    const drawMarks = () => {
      if (!ms) return;
      const { floor, top } = planMarksSvg(ms.list, ox, oz);
      st.querySelector('.bpfloor').innerHTML = floor;
      st.querySelector('.bpmarks').innerHTML = top;
      bar.querySelector('.bplist').innerHTML = ms.list.length ? ms.list.map(m => {
        const name = t('bpMarkName', m.id, m.mk, designerSize(m.mk) / 8);
        return `<span class="bpchip">${esc(name)}<button type="button" data-bprm="${m.id}" aria-label="${esc(t('bpMarkRemove', name))}">×</button></span>`;
      }).join('') : `<span class="bpnone">${t('bpMarksNone')}</span>`;
      const mv = bar.querySelector('[data-bpmove]');
      mv.disabled = !ms.list.length;
      mv.setAttribute('aria-pressed', String(!!ms.move));
      st.classList.toggle('movemode', !!ms.move);
    };
    const removeMark = (id, viaKeys) => {
      const i = ms.list.findIndex(m => m.id === id);
      if (i < 0) return;
      ms.list = ms.list.filter(m => m.id !== id);
      if (!ms.list.length) ms.move = false;
      drawMarks();
      reframe();
      if (viaKeys) (bar.querySelectorAll('[data-bprm]')[Math.min(i, ms.list.length - 1)] || bar.querySelector('[data-bpadd]')).focus();
    };
    if (ms) {
      drawMarks();
      bar.addEventListener('click', e => {
        const add = e.target.closest('[data-bpadd]'), rm = e.target.closest('[data-bprm]');
        if (add) {
          // A nova aparece no meio do que está na tela.
          const r = st.getBoundingClientRect();
          ms.list = addMark(fp, ms.list, +add.dataset.bpadd, toWorld(r.left + r.width / 2, r.top + r.height / 2));
          drawMarks();
          reframe();
        } else if (rm) removeMark(+rm.dataset.bprm, e.detail === 0);
        else if (e.target.closest('[data-bpmove]')) { ms.move = !ms.move; drawMarks(); }
      });
      st.addEventListener('click', e => { const rm = e.target.closest('[data-rm]'); if (rm) removeMark(+rm.dataset.rm, false); });
    }
    st.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015), toSvg(e.clientX, e.clientY)); }, { passive: false });
    st.addEventListener('pointerdown', e => {
      if (markDrag || e.target.closest('[data-rm]')) return;
      const m = wantsMark(e) && !drag.size ? hitMark(toWorld(e.clientX, e.clientY)) : null;
      st.setPointerCapture(e.pointerId);
      if (m) {
        e.preventDefault();
        markDrag = { pid: e.pointerId, id: m.id, at: toWorld(e.clientX, e.clientY), x: m.x, z: m.z };
        st.classList.add('moving');
        return;
      }
      drag.set(e.pointerId, [e.clientX, e.clientY]); tap.down(e.pointerId, e.clientX, e.clientY); pinch = null;
    });
    // No Mac, Ctrl + clique abre o menu de contexto: sobre uma marcação, não.
    st.addEventListener('contextmenu', e => { if (markDrag || (wantsMark(e) && hitMark(toWorld(e.clientX, e.clientY)))) e.preventDefault(); });
    const endMark = e => {
      if (!markDrag || e.pointerId !== markDrag.pid) return false;
      markDrag = null;
      st.classList.remove('moving');
      reframe();
      return true;
    };
    st.addEventListener('pointermove', e => {
      if (markDrag) {
        if (e.pointerId !== markDrag.pid) return;
        const [x, z] = toWorld(e.clientX, e.clientY), m = ms.list.find(o => o.id === markDrag.id);
        const p = placeMark(fp, m.mk, markDrag.x + x - markDrag.at[0], markDrag.z + z - markDrag.at[1], 1);
        if (p.x !== m.x || p.z !== m.z) { ms.list = ms.list.map(o => (o.id === m.id ? { ...o, x: p.x, z: p.z } : o)); drawMarks(); }
        return;
      }
      if (ms && !drag.size) st.classList.toggle('markhover', wantsMark(e) && !!hitMark(toWorld(e.clientX, e.clientY)));
      const prev = drag.get(e.pointerId);
      if (!prev) return;
      drag.set(e.pointerId, [e.clientX, e.clientY]);
      if (drag.size === 1) {
        const [x0, y0] = toSvg(...prev), [x1, y1] = toSvg(e.clientX, e.clientY);
        vb = panView(vb, full, x0 - x1, y0 - y1);
        apply();
      } else if (drag.size === 2) {
        const [a, b] = [...drag.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoom(dist / pinch, toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
        pinch = dist;
      }
    });
    st.addEventListener('pointerup', e => {
      if (endMark(e) || !drag.delete(e.pointerId)) return;
      pinch = null;
      if (!tap.up(e.pointerId, e.clientX, e.clientY)) return;
      // Com o ponteiro capturado o alvo é o próprio svg: a peça tocada vem da posição.
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]'), id = el && st.contains(el) ? +el.dataset.id : null;
      pinned = id === pinned ? null : id;
      light(pinned);
    });
    st.addEventListener('pointercancel', e => { endMark(e); drag.delete(e.pointerId); tap.cancel(e.pointerId); pinch = null; });
  }
  if (in3d) {
    const token = {};
    root._token = token;
    q('.s3d-ctl').addEventListener('click', e => {
      const m = e.target.closest('[data-mode]');
      if (m && m.dataset.mode !== view && opts.onMode) opts.onMode(m.dataset.mode);
      const pv = e.target.closest('[data-per]');
      if (pv && pv.dataset.per !== per && opts.onPer) opts.onPer(pv.dataset.per);
      if (e.target.closest('[data-recenter]') && scene) scene.recenter();
    });
    const chips = id => root.querySelectorAll('[data-follow]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.follow === id)));
    q('.follow').addEventListener('click', e => {
      const b = e.target.closest('[data-follow]');
      if (!b || !scene) return;
      const id = b.getAttribute('aria-pressed') === 'true' ? null : +b.dataset.follow;
      scene.focus(id);
      chips(id);
    });
    mount3d(q('.stage3d'), d, labels, lay, { onFocus: chips }).then(sc => {
      if (root._token !== token) { if (sc) sc.dispose(); return; }
      if (!sc) {
        mountPonder(root, d, labels, '2d');
        root.querySelector('.stage').insertAdjacentHTML('afterbegin', `<p class="hint">${t('no3d')}</p>`);
        return;
      }
      scene = sc;
      q('.load3d')?.remove();
      scene.setStep(cur, K);
    });
  }
}

export function whyText(ranked) {
  const w = designWhy(ranked);
  if (w.code === 'none') return t('whyNone');
  if (w.code === 'bp') return t('whyBp', w.a.bp.n, w.a.bp.m);
  if (w.code === 'only') return t('whyOnly');
  if (w.code === 'more') return t('whyMore', fmt(w.a.perOut), designName(w.b), fmt(w.b.perOut));
  if (w.code === 'noSink') return t('whyNoSink', designName(w.b), fmt(w.b.sinkRate));
  if (w.code === 'fewer') return t('whyFewer', designPieces(w.a), designName(w.b), designPieces(w.b));
  if (w.code === 'simpler') return t('whySimpler', designName(w.b), designPieces(w.b), designPieces(w.a));
  return t('whyTie', designName(w.b));
}

function designNote(d, belt) {
  if (d.applies) return t({ notDirect: 'rNotDirect', direct: 'rDirect', oneInput: 'rOneInput', shape: 'rShape', bpShape: 'rBpShape', butterflyShape: 'rButterfly', bfExtra: 'rBfExtra', loopFits: 'rLoopFits' }[d.applies], d.M, d.n);
  const bad = d.segments.find(s => !s.ok);
  const note = bad ? t('rLimit', segName(bad), fmt(bad.rate), belt) : t('rNoLimit');
  return note + (d.sinkRate > 0.05 ? `; ${t('lgToSink')} ${fmt(d.sinkRate)}/min` : '');
}

export function checksTable(d, belt) {
  const rows = d.segments.map(s => `<tr><td>${esc(segName(s))}</td><td>${fmt(s.rate)}</td><td class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '✓' : '✗'}</td></tr>`).join('');
  return `<div class="tablewrap"><table class="checks">
    <tr><th>${t('thSegment')}</th><th>${t('thLoad')}</th><th>${t('thFits', belt)}</th></tr>${rows}</table></div>
    <p class="hint">${t('checkNote', belt, fmt(d.perOut))}${d.segments.some(s => !s.ok) ? ` ${t('checkOver')}` : ''}</p>`;
}

// Bancada: passo a passo do design escolhido, a lista de designs testados e a vazão de cada trecho.
// ctx: { N, M, rates, cap, belt, blueprints, labels: { ins, outs }, style, view, inUse, onView, onStyle }
// Montagem: normal (designs planos), borboleta, ou vertical (qualquer design em andares, com lifts).
const STYLES = ['normal', 'butterfly', '3d'];
const isBf = d => d.kind.startsWith('butterfly');
const STYLE_FILTER = { normal: d => !isBf(d), butterfly: isBf, '3d': d => d.kind !== 'blueprint' };
// Para o passo a passo (e descarta a cena 3D) do palco que vai ser substituído.
export const stopStage = el => { const st = el.querySelector('.wb-stage'); if (st && st._stop) st._stop(); };
export function workbench(el, ctx) {
  stopStage(el);
  // Quem tinha a antiga aba Vertical salva abre no 3D.
  const style = ctx.style === 'vertical' ? '3d' : STYLES.includes(ctx.style) ? ctx.style : 'normal';
  const all = rankDesigns(balancerCandidates(ctx.N, ctx.M, ctx.rates, ctx.cap, ctx.blueprints));
  const cands = all.filter(STYLE_FILTER[style]);
  const best = cands[0];
  // Aba (normal ou borboleta) onde está o melhor design de todos: marca a aba e avisa quando é outra.
  const top = all.find(d => !d.applies);
  const topStyle = top ? (isBf(top) ? 'butterfly' : 'normal') : null;
  const better = top && style !== '3d' && topStyle !== style
    ? `<p class="wb-better">${t('styleBetter', `<button type="button" data-style="${topStyle}">${t('style' + cap1(topStyle))}</button>`, esc(designName(top)), designPieces(top), fmt(top.perOut))}</p>` : '';
  const styleBar = `<div class="wb-style"><span class="wb-style-l">${t('styleTitle')}${tip('tipStyle')}</span>
    <div class="seg" role="radiogroup" aria-label="${esc(t('styleTitle'))}">${STYLES.map(k => `<button type="button" role="radio" aria-checked="${k === style}" data-style="${k}"${k === topStyle ? ` data-best title="${esc(t('styleBestTip'))}"` : ''}>${t('style' + cap1(k))}</button>`).join('')}</div>${better}</div>`;
  const bindStyle = () => el.querySelector('.wb-style').addEventListener('click', e => {
    const b = e.target.closest('[data-style]');
    if (!b || b.dataset.style === style) return;
    ctx.style = b.dataset.style;
    if (ctx.onStyle) ctx.onStyle(ctx.style);
    workbench(el, ctx);
    el.querySelector(`[data-style="${ctx.style}"]`)?.focus();
  });
  if (!best || best.applies) {
    el.innerHTML = `${styleBar}<p class="lead">${t(style === 'butterfly' ? 'styleNone' : 'whyNone')}</p>`;
    bindStyle();
    return;
  }
  const d = cands.find(x => !x.applies && designKey(x) === ctx.view) || best;
  const pc = d.pieces;
  // A borboleta abre em Andares (uma rodada por andar, como a borboleta vertical do jogo); em Torres as
  // misturas entre faixas viram esteiras compridas por cima de tudo. A escolha de cada família fica guardada à parte.
  const bfMode = isBf(d), pref = bfMode ? ctx.mode3dBf : ctx.mode3d;
  const mode3d = pref === 'floors' || pref === 'towers' ? pref : bfMode ? 'floors' : 'towers';
  const fl = style === '3d' ? layout3d(d, mode3d) : null;
  // Normal e borboleta mostram a planta: o espaço que ocupa e o Blueprint Designer que comporta.
  const pl = style !== '3d' && d.kind !== 'blueprint' ? flatLayout(d) : null, fp = pl && ctx.view2d === 'plan' ? planFootprint(pl) : null;
  // Marcações do Blueprint Designer da planta: ficam enquanto a montagem é a mesma (trocar Por nível/Por peça ou
  // Esquema/Planta mantém); mudou N→M, taxa, tier ou montagem, voltam ao padrão. Não vão para o link.
  const markKey = [style, designKey(d), ctx.N, ctx.M, ctx.rates.join(','), ctx.cap, ctx.belt].join('|');
  // ctx.marksBox guarda entre um desenho e outro do mesmo lugar (a biblioteca refaz o ctx a cada tecla).
  const mb = ctx.marksBox || ctx;
  if (!mb.planMarks || mb.planMarks.key !== markKey) mb.planMarks = { key: markKey, list: null, move: false };
  const tag = c => (c === best ? ` <span class="ctag">${t('bestTag')}</span>` : '') + (ctx.inUse === designKey(c) ? ` <span class="ctag use">${t('inUseTag')}</span>` : '');
  el.innerHTML = `${styleBar}<div class="wb">
    <div><div class="wb-stage"></div><div class="wb-checks"><h4>${t('checksTitle')}</h4>${checksTable(d, ctx.belt)}${fl ? `<p class="hint">${t('vertNote')}</p>` : ''}${fp ? `<p class="hint">${t('planNote')}</p>` : ''}</div></div>
    <aside class="wb-side">
      <div class="wb-head"><span class="wb-shape num">${d.N}→${d.M}</span><span class="wb-name">${esc(cap1(designName(d)))}${tag(d)}</span></div>
      <dl class="pc-grid num">
        ${pc.blueprints ? `<div><dt>Blueprint</dt><dd>${pc.blueprints}</dd></div>` : `<div><dt>${t('thSplitters')}</dt><dd>${pc.splitters}</dd></div><div><dt>${t('thMergers')}</dt><dd>${pc.mergers}</dd></div>`}
        ${fl ? `<div><dt>${t('thLifts')}</dt><dd>${fl.lifts}</dd></div>` : ''}
        ${fp ? `<div class="pc-space"><dt>${t('thSpace')}${tip('tipSpace')}</dt><dd>${t('spaceVal', fp.fw, fp.fd)}<small>${t('spaceM', fp.w, fp.d)}</small></dd><dd class="${fp.mk ? 'ok' : 'bad'}">${fp.mk ? t('bpFits', fp.mk) : t('bpNone')}</dd></div>` : ''}
        <div><dt>${t('thPerOut')}</dt><dd>${fmt(d.perOut)}<small>/min</small></dd></div>
      </dl>
      <div>${d === best ? `<h4>${t('whyTitle')}</h4><p>${esc(whyText(cands))}</p>` : `<h4>${t('whyNotTitle')}</h4><p>${esc(`${cap1(designName(best))}: ${whyText([best, d])}`)}</p>`}</div>
      <div>
        <h4>${t('designsTitle')}${tip('tipDesigns')}</h4>
        <div class="cands" role="radiogroup" aria-label="${esc(t('designsTitle'))}">
          <div class="cand-h" aria-hidden="true"><span>${t('thDesign')}</span><span>${t('thPerOut')}</span><span>${t('stPieces')}</span></div>
          ${cands.map(c => `<button type="button" class="cand ${c === d ? 'sel' : ''}" role="radio" aria-checked="${c === d}" data-key="${designKey(c)}" ${c.applies ? 'disabled' : ''}>
            <span class="cn">${esc(cap1(designName(c)))}${c.applies ? '' : tag(c)}</span>
            <span class="cv">${c.applies ? '—' : fmt(c.perOut)}</span>
            <span class="cp">${c.applies ? '' : designPieces(c)}</span>
            <span class="cnote">${esc(designNote(c, ctx.belt))}</span>
          </button>`).join('')}
        </div>
      </div>
    </aside>
  </div>
  <p class="hint ext">${t('extHint', extLink(EXT_MOD, 'Modular Load Balancers'), extLink(extBpUrl(), 'Satisfactory Calculator'))}</p>`;
  mountPonder(el.querySelector('.wb-stage'), d, ctx.labels, fl ? mode3d : '2d', {
    lay: fl || pl, per: ctx.per3d, view2d: ctx.view2d, marks: mb.planMarks,
    onView2d: v => { ctx.view2d = v; if (ctx.onView2d) ctx.onView2d(v); workbench(el, ctx); el.querySelector(`[data-v2d="${v}"]`)?.focus(); },
    onMode: m => { ctx[bfMode ? 'mode3dBf' : 'mode3d'] = m; if (ctx.onMode3d) ctx.onMode3d(m, bfMode); workbench(el, ctx); el.querySelector(`[data-mode="${m}"]`)?.focus(); },
    onPer: v => { ctx.per3d = v; if (ctx.onPer3d) ctx.onPer3d(v); workbench(el, ctx); el.querySelector(`[data-per="${v}"]`)?.focus(); },
  });
  bindStyle();
  el.querySelector('.cands').addEventListener('click', e => {
    const b = e.target.closest('.cand');
    if (!b || b.disabled) return;
    ctx.view = b.dataset.key;
    if (ctx.onView) ctx.onView(ctx.view);
    workbench(el, ctx);
    el.querySelector(`.cand[data-key="${ctx.view}"]`)?.focus();
  });
}

