import { I18N, LANGS, getLang, setLang, t, fmt, parseNum } from '../i18n/index.js';
import { BELTS, PIPES, historyReplace } from '../logic/index.js';
import { S } from './state.js';
import { $, esc } from './common.js';
import { rows, syncGroups } from './groups.js';
import { renderScenarios } from './scenarios.js';
import { histCommit, histSnap } from './history.js';
import { render } from './render.js';
import { BALANCER_PATH } from '../shell/site.ts';
import { renderBps, renderCatalog, renderLib } from './library.js';

// ---- Idioma ----
// O idioma, o título, a descrição e o endereço da página são do shell (src/shell/); aqui ficam os textos do Balancer.
export const SITE = 'https://sf-balancer.vercel.app';
// Atalhos externos para quem não quer montar o balancer na mão: o mod e os blueprints da comunidade.
export const EXT_MOD = 'https://ficsit.app/mod/LoadBalancers';
export const extBpUrl = () => `https://satisfactory-calculator.com/${getLang()}/blueprints`;
export const extLink = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`;
const extLinks = () => [extLink(EXT_MOD, 'Modular Load Balancers (ficsit.app)'), extLink(extBpUrl(), t('extBp'))].join(' · ');
export const LANG_PATH = BALANCER_PATH;
export const onVercel = /(^|\.)vercel\.app$/.test(location.hostname);

// Textos fixos do markup (inclusive os dos grupos já clonados do template).
export function applyStatic() {
  const roots = [S.root, $('grpTpl').content];
  for (const root of roots) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  }
  const belt = $('belt').value;
  $('belt').innerHTML = BELTS.map(b => `<option value="${b.id}">${b.id}, ${fmt(b.cap)}/min</option>`).join('');
  $('belt').value = belt || 'Mk4';
  const pipe = $('pipe').value;
  $('pipe').innerHTML = PIPES.map(b => `<option value="${b.id}">${esc(t('pipeOpt', b.id, fmt(b.cap)))}</option>`).join('');
  $('pipe').value = pipe || 'Mk2';
  const libBelt = $('libBelt').value;
  $('libBelt').innerHTML = $('belt').innerHTML;
  $('libBelt').value = libBelt || 'Mk4';
  $('faqExt').innerHTML = extLinks();
  syncGroups('src');
  syncGroups('dst');
  renderScenarios();
}

// Os números digitados mudam de formato junto com o idioma ("65,5" vira "65.5").
export function convertInputs(from) {
  const to = getLang();
  for (const side of ['src', 'dst']) for (const r of rows[side]) for (const k of ['count', 'clock', 'nominal', 'total', 'per']) {
    const raw = r[k].value.trim();
    if (!raw) continue;
    setLang(from);
    const v = parseNum(raw);
    setLang(to);
    if (isFinite(v)) r[k].value = v.toLocaleString(t('locale'), { maximumFractionDigits: 6, useGrouping: false });
  }
}
// Nome de exemplo acompanha o idioma; nome digitado pelo usuário fica.
export const itemFor = name => (LANGS.some(x => I18N[x].defaultItem === name) ? t('defaultItem') : name);

// O shell já trocou o idioma (era `prev`): converte os números digitados e redesenha tudo.
export function langChanged(prev) {
  const l = getLang();
  if (prev === l) return;
  if (S.histTimer) histCommit();
  convertInputs(prev);
  $('item').value = itemFor($('item').value);
  applyStatic();
  render();
  if (S.HIST) S.HIST = historyReplace(S.HIST, histSnap());
  const rate = $('libRate').value.trim();
  if (rate) { setLang(prev); const v = parseNum(rate); setLang(l); if (isFinite(v)) $('libRate').value = fmt(v, 6); }
  renderBps();
  renderCatalog();
  renderLib();
}
