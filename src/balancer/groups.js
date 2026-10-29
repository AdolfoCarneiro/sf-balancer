import { t } from '../i18n/index.js';
import { $ } from './common.js';
import { render } from './render.js';

// ---- Grupos de máquinas editáveis (origem e destino) ----
export const rows = { src: [], dst: [] };
const CONTAINER = { src: 'srcGroups', dst: 'dstGroups' };
let groupSeq = 0;

export function addGroup(side, v = { driver: 'machines', count: '', clock: '', nominal: '', total: '', per: '' }) {
  const el = $('grpTpl').content.firstElementChild.cloneNode(true);
  const q = c => el.querySelector(c);
  // O "?" fica fora do <label>, então o rótulo aponta para o campo por id.
  const uid = ++groupSeq;
  el.querySelectorAll('label[data-for]').forEach(lb => {
    const input = q('.' + lb.dataset.for);
    input.id = `${lb.dataset.for}-${uid}`;
    lb.htmlFor = input.id;
  });
  const row = { el, side, driver: v.driver || 'machines', count: q('.g-count'), clock: q('.g-clock'), nominal: q('.g-nom'), total: q('.g-total'), per: q('.g-per'), eq: q('.eq'), name: q('.grp-name'), rm: q('.rm') };
  for (const k of ['count', 'clock', 'nominal', 'total', 'per']) row[k].value = v[k] || '';
  // Quem foi preenchido por último manda; os outros viram equivalência.
  row.count.addEventListener('input', () => {
    if (row.driver === 'total') { row.total.value = ''; row.driver = row.clock.value.trim() ? 'clock' : 'machines'; }
    else row.driver = row.clock.value.trim() ? 'clock' : 'machines';
  });
  row.clock.addEventListener('input', () => {
    if (row.driver === 'total') row.total.value = '';
    row.driver = row.clock.value.trim() ? 'clock' : 'machines';
  });
  row.total.addEventListener('input', () => {
    row.driver = row.total.value.trim() ? 'total' : 'machines';
    if (row.driver === 'total') { row.count.value = ''; row.clock.value = ''; }
  });
  row.rm.addEventListener('click', () => { el.remove(); rows[side].splice(rows[side].indexOf(row), 1); syncGroups(side); render(); });
  $(CONTAINER[side]).append(el);
  rows[side].push(row);
  syncGroups(side);
  return row;
}
export function syncGroups(side) {
  rows[side].forEach((r, i) => {
    r.name.textContent = rows[side].length > 1 ? t('groupN', i + 1) : '';
    r.rm.hidden = rows[side].length === 1;
    r.el.querySelector('.g-nom-label').textContent = t(side === 'src' ? 'fNomSrc' : 'fNomDst');
    r.el.querySelector('.g-nom-tip').dataset.tip = side === 'src' ? 'tipNomSrc' : 'tipNomDst';
  });
}

