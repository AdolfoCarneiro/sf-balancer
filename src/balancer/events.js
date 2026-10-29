import { t, fmt, parseNum } from '../i18n/index.js';
import { S } from './state.js';
import { BPS, LIB, openCatalog, renderBps, renderLib, saveBps } from './library.js';
import { render } from './render.js';
import { $, DEFAULTS, esc } from './common.js';
import { histCommit, histSoon, histStep } from './history.js';
import { SCENS, openState, renderScenarios, saveScens, scenMsg, shareLink } from './scenarios.js';
import { currentState, loadState } from './input.js';
import { addGroup, rows } from './groups.js';
import { openFromPlan } from './dialog.js';
import { hideTip, showTip } from './help.js';

function bpChanged() { saveBps(); renderBps(); renderLib(); render(); }
function addBp() {
  const n = parseNum($('bpN').value), m = parseNum($('bpM').value);
  const okN = Number.isInteger(n) && n >= 1 && n <= 12, okM = Number.isInteger(m) && m >= 2 && m <= 12;
  $('bpN').classList.toggle('invalid', !okN);
  $('bpM').classList.toggle('invalid', !okM);
  if (!okN || !okM) return;
  if (!BPS.some(b => b.n === n && b.m === m)) BPS.push({ n, m });
  bpChanged();
  $('bpN').focus();
}
// root: onde a página está montada. O que escuta o documento inteiro só age com a página na tela (S.active), e a ajuda "?"
// escuta só a página: o modal da ligação, na Fábrica, cuida da dele.
export function initEvents(root) {
$('undo').addEventListener('click', () => histStep(-1));
$('redo').addEventListener('click', () => histStep(1));
// Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Y e Ctrl/Cmd+Shift+Z refazem, no lugar do desfazer nativo dos campos.
// Campos de texto fora do planejador (biblioteca, diálogo) mantêm o desfazer nativo.
document.addEventListener('keydown', e => {
  if (!S.active || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  const undo = k === 'z' && !e.shiftKey, redo = k === 'y' || (k === 'z' && e.shiftKey);
  if (!undo && !redo) return;
  if (document.querySelector('dialog[open]')) return;
  const el = e.target;
  const typing = el.closest && el.closest('input:not([type=radio]):not([type=checkbox]), textarea, [contenteditable=""], [contenteditable=true]');
  if (typing && !el.closest('#form') && el.id !== 'item') return;
  e.preventDefault();
  histStep(undo ? -1 : 1);
});

// ---- Eventos ----
$('scenList').addEventListener('change', () => {
  const sc = SCENS[+$('scenList').value];
  $('scenDel').disabled = !sc;
  if ($('scenList').value !== '' && sc) { openState(sc.state); histCommit(); }
});
$('scenSave').addEventListener('click', () => {
  const name = $('item').value.trim() || t('fallbackItem');
  let i = SCENS.findIndex(x => x.name === name);
  if (i < 0) { SCENS.push({ name, state: null }); i = SCENS.length - 1; }
  SCENS[i].state = currentState();
  saveScens();
  renderScenarios(i);
  scenMsg(t('scenSaved', name));
});
$('scenDel').addEventListener('click', () => {
  const i = +$('scenList').value;
  if ($('scenList').value === '' || !SCENS[i]) return;
  const [gone] = SCENS.splice(i, 1);
  saveScens();
  renderScenarios('');
  scenMsg(t('scenDeleted', gone.name));
});
$('shareCopy').addEventListener('click', async () => {
  const link = shareLink();
  try {
    await navigator.clipboard.writeText(link);
    scenMsg(t('shareCopied'));
  } catch (e) {
    clearTimeout(S.msgTimer);
    $('scenMsg').innerHTML = `${esc(t('shareFail'))} <a href="${esc(link)}">${esc(link)}</a>`;
  }
});
for (const ev of ['input', 'change']) {
  $('form').addEventListener(ev, render);
  $('item').addEventListener(ev, render);
}
// Histórico: digitação espera a pausa; seleção, rádio e saída do campo fecham o passo na hora.
for (const el of [$('form'), $('item')]) {
  el.addEventListener('input', histSoon);
  el.addEventListener('change', histCommit);
  el.addEventListener('focusout', () => { if (S.histTimer) histCommit(); });
}
$('form').addEventListener('click', e => {
  const side = e.target.dataset && e.target.dataset.add;
  if (side) { addGroup(side).count.focus(); render(); histCommit(); }
  else if (e.target.closest('.rm')) histCommit();
});
// Etapa seguinte: as máquinas do destino viram a origem; a taxa do item novo e o destino ficam para preencher.
$('dstToSrc').addEventListener('click', () => {
  const next = rows.dst.map(r => {
    const v = { driver: r.driver === 'clock' ? 'clock' : 'machines', count: r.count.value, clock: r.driver === 'clock' ? r.clock.value : '', nominal: '', total: '', per: '' };
    if (r.driver === 'total') {
      const total = parseNum(r.total.value), nom = parseNum(r.nominal.value);
      v.count = total > 0 && nom > 0 ? fmt(total / nom, 4) : '';
    }
    return v;
  });
  loadState({ ...currentState(), item: '', src: next, dst: [], selectedKey: null });
  rows.dst.splice(0).forEach(r => r.el.remove());
  addGroup('dst');
  render();
  histCommit();
  rows.src[0].nominal.focus();
});
$('out').addEventListener('click', e => {
  const open = e.target.closest('[data-open-bal]');
  if (open) { openFromPlan(open.dataset.openBal); return; }
  const card = e.target.closest('.alt');
  if (card) { S.selectedKey = card.dataset.key; render(); document.querySelector(`.alt[data-key="${S.selectedKey}"]`)?.focus(); }
});
root.addEventListener('mouseover', e => { const b = e.target.closest('.tip'); if (b && !S.tipPinned) showTip(b); });
root.addEventListener('mouseout', e => { const b = e.target.closest('.tip'); if (b && b === S.tipBtn && !S.tipPinned && !b.contains(e.relatedTarget)) hideTip(); });
root.addEventListener('focusin', e => { if (e.target.classList.contains('tip')) showTip(e.target); });
root.addEventListener('focusout', e => { if (e.target === S.tipBtn) hideTip(); });
root.addEventListener('click', e => {
  const b = e.target.closest('.tip');
  if (b) { e.preventDefault(); if (b === S.tipBtn && S.tipPinned) hideTip(); else showTip(b, true); }
  else if (S.tipBtn) hideTip();
});
root.addEventListener('keydown', e => { if (e.key === 'Escape' && S.tipBtn) hideTip(); });
addEventListener('scroll', () => { if (S.active && S.tipBtn) hideTip(); }, { passive: true, capture: true });
addEventListener('resize', () => { if (S.active && S.tipBtn) hideTip(); });
$('out').addEventListener('keydown', e => {
  const open = e.target.closest('g[data-open-bal]');
  if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFromPlan(open.dataset.openBal); }
});
$('gen').addEventListener('input', e => {
  if (e.target.closest('.bp-add')) return;
  LIB.view = null;
  renderLib();
});
$('libBelt').addEventListener('change', () => { LIB.view = null; renderLib(); });
$('bpList').addEventListener('click', e => {
  const rm = e.target.closest('[data-bp-rm]');
  if (rm) { BPS.splice(+rm.dataset.bpRm, 1); bpChanged(); $('bpN').focus(); }
  else if (e.target.id === 'bpAdd') addBp();
});
$('bpList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.bp-add')) addBp(); });
$('catGrid').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) openCatalog(+b.dataset.cat); });
$('dlgClose').addEventListener('click', () => $('balDlg').close());
$('balDlg').addEventListener('click', e => { if (e.target === $('balDlg')) $('balDlg').close(); });
$('balDlg').addEventListener('close', () => { const st = $('dlgBody').querySelector('.wb-stage'); if (st && st._stop) st._stop(); hideTip(); });
$('reset').addEventListener('click', () => { loadState(DEFAULTS); render(); histCommit(); });

}
