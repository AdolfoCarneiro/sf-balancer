import { I18N, LANGS, getLang, setLang, t, fmt, parseNum } from '../i18n/index.js';
import { BELTS, PIPES, historyReplace } from '../logic/index.js';
import { FLAGS } from './flags.js';
import { S } from './state.js';
import { $, LANG_STORE, esc } from './common.js';
import { rows, syncGroups } from './groups.js';
import { renderScenarios } from './scenarios.js';
import { histCommit, histSnap } from './history.js';
import { render } from './render.js';
import { PLANNER_PATH } from '../planner/lang.ts';
import { renderBps, renderCatalog, renderLib } from './library.js';

// ---- Idioma ----
// Cada idioma tem um endereço próprio no site (/, /pt, /es) para os buscadores; o vercel.json reescreve para o index.html.
export const SITE = 'https://sf-balancer.vercel.app';
// Atalhos externos para quem não quer montar o balancer na mão: o mod e os blueprints da comunidade.
export const EXT_MOD = 'https://ficsit.app/mod/LoadBalancers';
export const extBpUrl = () => `https://satisfactory-calculator.com/${getLang()}/blueprints`;
export const extLink = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`;
const extLinks = () => [extLink(EXT_MOD, 'Modular Load Balancers (ficsit.app)'), extLink(extBpUrl(), t('extBp'))].join(' · ');
export const LANG_PATH = { en: '/', pt: '/pt', es: '/es' };
export const onVercel = /(^|\.)vercel\.app$/.test(location.hostname);
// A lista de idiomas e a chave salva também estão no script inline anti-piscada do index.html: mantenha os dois iguais.
// Ordem: caminho (/pt, /es), ?lang= na URL, escolha salva, inglês.
export function pickLang() {
  const fromPath = (location.pathname.match(/^\/(pt|es|en)\/?$/) || [])[1];
  if (I18N[fromPath]) return fromPath;
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (I18N[fromUrl]) return fromUrl;
  let saved = null;
  try { saved = localStorage.getItem(LANG_STORE); } catch (e) { /* sem storage */ }
  if (I18N[saved]) return saved;
  return 'en';
}


// Textos fixos do HTML (inclusive os dos grupos já clonados do template).
export function applyStatic() {
  document.documentElement.lang = t('htmlLang');
  document.title = t('pageTitle');
  document.querySelector('meta[name=description]').content = t('metaDesc');
  let canon = document.querySelector('link[rel=canonical]');
  if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.append(canon); }
  canon.href = SITE + LANG_PATH[getLang()];
  // No site, o endereço acompanha o idioma; aberto direto do disco ou em outro servidor, fica como está.
  if (onVercel && location.pathname !== LANG_PATH[getLang()]) history.replaceState(null, '', LANG_PATH[getLang()] + location.hash);
  const pl = document.getElementById('plLink');
  if (pl) pl.href = PLANNER_PATH[getLang()];
  const roots = [document, $('grpTpl').content];
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
  $('langs').innerHTML = LANGS.map(l => `<button type="button" data-lang="${l}" lang="${I18N[l].htmlLang}" title="${I18N[l].langName}" aria-pressed="${l === getLang()}">${FLAGS[l]}${l.toUpperCase()}</button>`).join('');
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

export function changeLang(l) {
  const prev = getLang();
  setLang(l);
  try { localStorage.setItem(LANG_STORE, getLang()); } catch (e) { /* sem storage */ }
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

