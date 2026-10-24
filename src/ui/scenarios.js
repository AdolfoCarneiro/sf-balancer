import { getLang, t } from '../i18n/index.js';
import { encodeShare } from '../logic/index.js';
import { S } from './state.js';
import { $, esc } from './common.js';
import { LANG_PATH, SITE, convertInputs, onVercel } from './lang.js';
import { currentState, loadState } from './input.js';
import { render } from './render.js';

// ---- Cenários salvos e link ----
// Os cenários ficam só neste navegador; o link leva o cenário inteiro no fragmento (#s=...).
const SCEN_STORE = 'sf-balancer:scenarios';
export let SCENS = [];
try { const sc = JSON.parse(localStorage.getItem(SCEN_STORE) || '[]'); if (Array.isArray(sc)) SCENS = sc.filter(x => x && typeof x.name === 'string' && x.state && Array.isArray(x.state.src)); } catch (e) { /* sem storage */ }
export const saveScens = () => { try { localStorage.setItem(SCEN_STORE, JSON.stringify(SCENS)); } catch (e) { /* sem storage */ } };
export function renderScenarios(sel) {
  const cur = sel === undefined ? $('scenList').value : String(sel);
  $('scenList').innerHTML = `<option value="">${esc(t('scenPick'))}</option>` + SCENS.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('');
  $('scenList').value = cur !== '' && SCENS[+cur] ? cur : '';
  $('scenDel').disabled = $('scenList').value === '';
}
export function scenMsg(text) {
  clearTimeout(S.msgTimer);
  $('scenMsg').textContent = text;
  S.msgTimer = setTimeout(() => { $('scenMsg').textContent = ''; }, 5000);
}
export function shareLink() {
  const base = onVercel ? SITE + LANG_PATH[getLang()] : location.href.split('#')[0];
  return `${base}#s=${encodeShare(currentState())}`;
}
// Estado salvo em outro idioma tem os números no formato daquele idioma.
export function openState(state) {
  loadState(state);
  const from = state.lang || 'pt';
  if (from !== getLang()) convertInputs(from);
  render();
}

