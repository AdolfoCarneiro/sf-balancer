import { getLang, t, fmt, parseNum } from '../i18n/index.js';
import { BELTS, PIPES, sizeParts } from '../logic/index.js';
import { EPS } from '../logic/belts.js';
import { S } from './state.js';
import { addGroup, rows } from './groups.js';
import { $, DEFAULTS, STORE } from './common.js';
import { BPS } from './library.js';
import { itemFor } from './lang.js';

function readGroups(side, mark) {
  return rows[side].map(r => {
    const g = { driver: r.driver, per: mark(r.per, 'opt') };
    const nom = mark(r.nominal, r.driver === 'total' ? 'opt' : 'req');
    g.nominal = nom || 0;
    if (r.driver === 'total') { g.total = mark(r.total, 'req'); mark(r.count, 'skip'); mark(r.clock, 'skip'); }
    else {
      g.count = mark(r.count, 'req');
      if (r.driver === 'clock') g.clock = mark(r.clock, 'req'); else mark(r.clock, 'skip');
      mark(r.total, 'skip');
    }
    [r.count, r.clock, r.total].forEach(e => e.classList.remove('drives'));
    ({ machines: r.count, clock: r.clock, total: r.total })[r.driver].classList.add('drives');
    return g;
  });
}

export function readInput() {
  let valid = true;
  const mark = (el, kind) => {
    if (kind === 'skip') { el.classList.remove('invalid'); return 0; }
    const raw = el.value.trim();
    const v = parseNum(raw);
    const bad = kind === 'opt' ? (raw !== '' && !(v > 0)) : !(v > 0);
    el.classList.toggle('invalid', bad);
    if (bad) valid = false;
    return raw === '' ? 0 : v;
  };
  const srcGroups = readGroups('src', mark);
  const dstGroups = readGroups('dst', mark);
  const medium = document.querySelector('input[name=medium]:checked').value;
  const fluid = medium === 'fluid';
  const belt = fluid ? PIPES.find(b => b.id === $('pipe').value) : BELTS.find(b => b.id === $('belt').value);
  return {
    valid,
    input: {
      item: $('item').value.trim() || t('fallbackItem'),
      srcGroups, dstGroups,
      medium, belt: belt.id, cap: belt.cap,
      policy: document.querySelector('input[name=policy]:checked').value,
      excess: document.querySelector('input[name=excess]:checked').value,
      conv: document.querySelector('input[name=conv]:checked').value,
      blueprints: BPS,
    },
  };
}

function rowState(r) { return { driver: r.driver, count: r.count.value, clock: r.clock.value, nominal: r.nominal.value, total: r.total.value, per: r.per.value }; }
export function currentState() {
  return {
    item: $('item').value,
    src: rows.src.map(rowState), dst: rows.dst.map(rowState),
    medium: document.querySelector('input[name=medium]:checked').value,
    belt: $('belt').value, pipe: $('pipe').value,
    policy: document.querySelector('input[name=policy]:checked').value,
    excess: document.querySelector('input[name=excess]:checked').value,
    conv: document.querySelector('input[name=conv]:checked').value,
    selectedKey: S.selectedKey,
    lang: getLang(),
  };
}
export function saveState() {
  try { localStorage.setItem(STORE, JSON.stringify(currentState())); } catch (e) { /* sem storage, segue sem lembrar */ }
}
export function loadState(state) {
  $('item').value = itemFor(state.item);
  for (const side of ['src', 'dst']) {
    // Tirar do DOM um campo editado e com foco dispara change no meio da troca; o histórico ignora até terminar.
    S.histQuiet = true;
    try { rows[side].splice(0).forEach(r => r.el.remove()); } finally { S.histQuiet = false; }
    (state[side] && state[side].length ? state[side] : DEFAULTS[side]).forEach(v => addGroup(side, v));
  }
  $('belt').value = BELTS.some(b => b.id === state.belt) ? state.belt : 'Mk4';
  $('pipe').value = PIPES.some(b => b.id === state.pipe) ? state.pipe : 'Mk2';
  const med = document.querySelector(`input[name=medium][value="${state.medium === 'fluid' ? 'fluid' : 'item'}"]`);
  med.checked = true;
  const pol = document.querySelector(`input[name=policy][value="${state.policy}"]`);
  if (pol) pol.checked = true;
  const exc = document.querySelector(`input[name=excess][value="${state.excess === 'sink' ? 'sink' : 'represar'}"]`);
  exc.checked = true;
  const conv = document.querySelector(`input[name=conv][value="${state.conv}"]`);
  if (conv) conv.checked = true;
  S.selectedKey = state.selectedKey || null;
}

// Mostra as três equivalências embaixo do grupo e nos campos que não mandam.
export function showEquivalences(side, info, cap, fluid) {
  info.forEach(g => {
    const r = rows[side][g.gi];
    if (g.continuous) {
      r.count.placeholder = ''; r.clock.placeholder = ''; r.per.placeholder = '';
      r.eq.innerHTML = t(fluid ? 'eqContinuousPipe' : 'eqContinuous', fmt(g.total, 2), g.lines, fmt(cap));
      return;
    }
    r.count.placeholder = fmt(g.n, 2);
    r.clock.placeholder = fmt(g.clock * 100, 2);
    r.total.placeholder = fmt(g.total, 2);
    r.per.placeholder = t('perAuto', g.perLine);
    r.eq.innerHTML = t('eqMachines', {
      n: fmt(g.n, 2), one: Math.abs(g.n - 1) < EPS, N: g.N, clock: fmt(g.clock * 100, 2), total: fmt(g.total, 2),
      src: side === 'src', per: fmt(g.perMachine, 2), perLine: g.perLine, lineRate: fmt(g.lineRate, 2),
      max: g.balanced ? g.auto : null, lines: g.sizes.length, parts: t('lineParts', sizeParts(g.sizes, g.eff)),
    });
  });
}

// Esteira ou cano, com a capacidade: "Mk4, 480/min" ou "Pipeline Mk2, 600/min".
export const tierLabel = (input, cap) => (input.medium === 'fluid' ? t('pipeOpt', input.belt, fmt(cap)) : `${input.belt}, ${fmt(cap)}/min`);

// Com fluido: mostra o cano no lugar da esteira e tira o sink (o Awesome Sink não aceita fluido).
export function syncMedium() {
  const fluid = document.querySelector('input[name=medium]:checked').value === 'fluid';
  $('beltRule').hidden = fluid;
  $('pipeRule').hidden = !fluid;
  const sink = document.querySelector('input[name=policy][value=sink]');
  sink.disabled = fluid;
  $('policySinkChoice').classList.toggle('off', fluid);
  if (fluid && sink.checked) document.querySelector('input[name=policy][value=represar]').checked = true;
  const exSink = document.querySelector('input[name=excess][value=sink]');
  exSink.disabled = fluid;
  $('excessSinkChoice').classList.toggle('off', fluid);
  if (fluid && exSink.checked) document.querySelector('input[name=excess][value=represar]').checked = true;
}

