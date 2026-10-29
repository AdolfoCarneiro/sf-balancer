import { getLang } from '../i18n/index.js';
import { historyPush, historyUndo, historyRedo, historyReplace } from '../logic/index.js';
import { S } from './state.js';
import { currentState, loadState } from './input.js';
import { $ } from './common.js';
import { rows } from './groups.js';
import { convertInputs } from './lang.js';
import { render } from './render.js';

// ---- Desfazer e refazer ----
// Só as entradas do planejador, só nesta sessão. Idioma e alternativa escolhida ficam de fora.
export const histSnap = () => { const s = currentState(); delete s.selectedKey; return s; };
export function syncHist() {
  if (!S.HIST) return;
  // Digitação ainda sem passo fechado já pode ser desfeita; refazer some porque o passo novo vai descartar.
  $('undo').disabled = !S.HIST.past.length && !S.histTimer;
  $('redo').disabled = !S.HIST.future.length || !!S.histTimer;
}
export function histCommit() {
  if (S.histQuiet) return;
  clearTimeout(S.histTimer);
  S.histTimer = null;
  if (S.HIST) S.HIST = historyPush(S.HIST, histSnap());
  syncHist();
}
// Digitação seguida vira um passo só: fecha após uma pausa curta ou ao sair do campo.
export function histSoon() {
  clearTimeout(S.histTimer);
  S.histTimer = setTimeout(histCommit, 500);
  syncHist();
}
// Campo de grupo com foco: os grupos são recriados ao restaurar, então o foco volta para o campo equivalente.
function focusSpot() {
  const a = document.activeElement;
  for (const side of ['src', 'dst']) for (const [i, r] of rows[side].entries()) {
    for (const k of ['count', 'clock', 'nominal', 'total', 'per']) if (r[k] === a) return { side, i, k };
  }
  return null;
}
export function histStep(dir) {
  histCommit();
  const next = dir < 0 ? historyUndo(S.HIST) : historyRedo(S.HIST);
  if (next === S.HIST) return;
  S.HIST = next;
  const spot = focusSpot(), keep = S.selectedKey, state = S.HIST.present;
  loadState(state);
  if (state.lang !== getLang()) {
    convertInputs(state.lang);
    S.HIST = historyReplace(S.HIST, histSnap());
  }
  S.selectedKey = keep;
  render();
  const r = spot && (rows[spot.side][spot.i] || rows[spot.side][rows[spot.side].length - 1]);
  if (r) r[spot.k].focus();
  syncHist();
}
