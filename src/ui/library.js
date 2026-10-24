import { t, fmt, parseNum } from '../i18n/index.js';
import { BELTS, balancerDesign, butterflyDesign, designName } from '../logic/index.js';
import { $, esc } from './common.js';
import { cap1, flatSvg, tags } from './balancerSvg.js';
import { flatLayout, stopStage, workbench } from './workbench.js';

// ---- Biblioteca: gerador, blueprints e catálogo ----
const BP_STORE = 'sf-balancer:bp';
const LIB_STORE = 'sf-balancer:lib';
export let BPS = [{ n: 3, m: 4 }];
try { const s = JSON.parse(localStorage.getItem(BP_STORE) || 'null'); if (Array.isArray(s)) BPS = s.filter(b => b.n >= 1 && b.m >= 2); } catch (e) { /* sem storage */ }
export const LIB = { n: '2', m: '5', rate: '240', belt: 'Mk4', view: null, style: 'normal', mode3d: 'towers', mode3dBf: 'floors', per3d: 'level', view2d: 'scheme' };
export const setMode3d = (m, bf) => { LIB[bf ? 'mode3dBf' : 'mode3d'] = m; saveLib(); };
try { Object.assign(LIB, JSON.parse(localStorage.getItem(LIB_STORE) || '{}')); } catch (e) { /* sem storage */ }
if (LIB.style === 'vertical') LIB.style = '3d';
export const saveBps = () => { try { localStorage.setItem(BP_STORE, JSON.stringify(BPS)); } catch (e) { /* sem storage */ } };
export const saveLib = () => { try { localStorage.setItem(LIB_STORE, JSON.stringify(LIB)); } catch (e) { /* sem storage */ } };

const CATALOG = [
  { kind: 'matrix', n: 3, m: 4, rate: 240, ds: 'dsMatrix' },
  { kind: 'funnel', n: 3, m: 2, rate: 120, ds: 'dsFunnel' },
  { kind: 'matrix-loop', n: 2, m: 5, rate: 240, ds: 'dsMatrixLoop' },
  { kind: 'matrix-split-loop', n: 1, m: 5, rate: 480, ds: 'dsMatrixSplitLoop' },
  { kind: 'funnel-loop', n: 3, m: 5, rate: 60, ds: 'dsFunnelLoop' },
  { kind: 'matrix-sink', n: 1, m: 7, rate: 480, ds: 'dsMatrixSink' },
  { kind: 'funnel-sink', n: 2, m: 5, rate: 60, ds: 'dsFunnelSink' },
  { kind: 'butterfly', n: 4, m: 4, rate: 480, ds: 'dsButterfly' },
  { kind: 'butterfly-loop', n: 5, m: 5, rate: 300, ds: 'dsButterflyLoop' },
];

export function renderBps() {
  $('bpList').innerHTML = (BPS.length
    ? BPS.map((b, i) => `<span class="bp-chip num">${b.n}→${b.m}<button type="button" data-bp-rm="${i}" aria-label="${esc(t('bpRemove', b.n, b.m))}">×</button></span>`).join('')
    : `<span class="dim">${t('bpEmpty')}</span>`)
    + `<span class="bp-add"><input class="field" id="bpN" type="text" inputmode="numeric" placeholder="N" aria-label="${esc(t('bpInAria'))}"><span aria-hidden="true">→</span><input class="field" id="bpM" type="text" inputmode="numeric" placeholder="M" aria-label="${esc(t('bpOutAria'))}"><button type="button" class="pbtn" id="bpAdd">${t('bpAdd')}</button></span>`;
}

function libLabels(N, M) { return { ins: tags(t('inTag'), N), outs: tags(t('outTag'), M) }; }

const LIB_MARKS = {};
export function renderLib() {
  const int = (el, lo, hi) => { const v = parseNum(el.value); const ok = Number.isInteger(v) && v >= lo && v <= hi; el.classList.toggle('invalid', !ok); return ok ? v : null; };
  const N = int($('libN'), 1, 12), M = int($('libM'), 2, 12);
  const belt = BELTS.find(b => b.id === $('libBelt').value) || BELTS[3];
  const rv = parseNum($('libRate').value);
  const rateOk = $('libRate').value.trim() === '' || rv > 0;
  $('libRate').classList.toggle('invalid', !rateOk);
  $('libRate').placeholder = fmt(belt.cap);
  Object.assign(LIB, { n: $('libN').value, m: $('libM').value, rate: $('libRate').value, belt: belt.id });
  saveLib();
  if (!N || !M || !rateOk) { stopStage($('libOut')); $('libOut').innerHTML = `<p class="lead">${t('invalid')}</p>`; return; }
  workbench($('libOut'), {
    N, M, rates: [rv > 0 ? rv : belt.cap], cap: belt.cap, belt: belt.id, blueprints: BPS,
    labels: libLabels(N, M), view: LIB.view, onView: v => { LIB.view = v; saveLib(); }, marksBox: LIB_MARKS,
    style: LIB.style, onStyle: st => { LIB.style = st; LIB.view = null; saveLib(); },
    mode3d: LIB.mode3d, mode3dBf: LIB.mode3dBf, onMode3d: setMode3d,
    per3d: LIB.per3d, onPer3d: v => { LIB.per3d = v; saveLib(); }, view2d: LIB.view2d, onView2d: v => { LIB.view2d = v; saveLib(); },
  });
}

export function renderCatalog() {
  $('catGrid').innerHTML = CATALOG.map((c, i) => {
    const d = c.kind.startsWith('butterfly') ? butterflyDesign(c.n, c.m, [c.rate], 480, c.kind) : balancerDesign(c.kind, c.n, c.m, [c.rate], 480);
    return `<div class="plate cat">
      <div class="thumb" aria-hidden="true">${flatSvg(d, flatLayout(d), libLabels(c.n, c.m), 'level', false)}</div>
      <h4>${esc(cap1(designName(d)))}</h4>
      <p>${t(c.ds)}</p>
      <button type="button" class="pbtn" data-cat="${i}">${t('catExample', c.n, c.m)}</button>
    </div>`;
  }).join('');
}

export function openCatalog(i) {
  const c = CATALOG[i];
  $('libN').value = c.n; $('libM').value = c.m; $('libRate').value = fmt(c.rate);
  LIB.view = c.kind;
  if (c.kind.startsWith('butterfly')) LIB.style = 'butterfly';
  else if (LIB.style === 'butterfly') LIB.style = 'normal';
  renderLib();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('gen').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

