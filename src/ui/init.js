import { getLang, setLang, t } from '../i18n/index.js';
import { decodeShare, historyNew } from '../logic/index.js';
import { S } from './state.js';
import { applyStatic, convertInputs, pickLang } from './lang.js';
import { $, DEFAULTS, STORE } from './common.js';
import { loadState } from './input.js';
import { scenMsg } from './scenarios.js';
import { LIB, renderBps, renderCatalog, renderLib } from './library.js';
import { render } from './render.js';
import { histSnap, syncHist } from './history.js';

export function init() {
setLang(pickLang());
applyStatic();
let saved = null;
try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
// Link compartilhado ganha do que estava salvo; depois o endereço volta a ficar limpo.
const shared = location.hash.startsWith('#s=') ? decodeShare(location.hash.slice(3)) : null;
if (shared) {
  loadState(shared);
  if (shared.lang !== getLang()) convertInputs(shared.lang);
  history.replaceState(null, '', location.pathname + location.search);
  scenMsg(t('sharedLoaded'));
} else if (saved && saved.src) {
  loadState(saved);
  // Estados salvos antes dos idiomas foram digitados em português.
  if ((saved.lang || 'pt') !== getLang()) convertInputs(saved.lang || 'pt');
} else loadState(DEFAULTS);
$('libN').value = LIB.n; $('libM').value = LIB.m; $('libRate').value = LIB.rate; $('libBelt').value = LIB.belt;
renderBps();
renderCatalog();
render();
renderLib();
S.HIST = historyNew(histSnap());
syncHist();
}
