// Mecanismo de idioma: sem DOM, sem lógica do planejador.
// Todo texto que aparece na tela vem de pt.js / en.js / es.js. Chave nova entra nos três idiomas (o teste confere).
// Nomes de peças do jogo (Merger, Splitter, Smart Splitter, Awesome Sink, Any, Overflow) ficam em inglês nos três.
import pt from './pt.js';
import en from './en.js';
import es from './es.js';

export const I18N = { pt, en, es };
export const LANGS = Object.keys(I18N);
let LANG = 'pt';
export const getLang = () => LANG;
export function setLang(l) { if (I18N[l]) LANG = l; return LANG; }
export function t(key, ...args) {
  const v = key in I18N[LANG] ? I18N[LANG][key] : I18N.pt[key];
  return typeof v === 'function' ? v(...args) : v;
}
export const srcTag = id => t('tagSrc') + (id + 1);
export const dstTag = id => t('tagDst') + (id + 1);

export function fmt(n, digits = 1) {
  if (!isFinite(n)) return '—';
  const v = Math.abs(n) < 0.05 ? 0 : n;
  return v.toLocaleString(t('locale'), { maximumFractionDigits: digits });
}

// Aceita "65", "65,5", "1.200", "22.5". Em inglês a vírgula é de milhar: "1,200" = 1200.
export function parseNum(str) {
  const s = String(str).trim().replace(/\s/g, '').replace(/%$/, '');
  if (!s) return NaN;
  const en = getLang() === 'en';
  let norm;
  if (en && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) norm = s.replace(/,/g, '');
  else if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.');
  else if (!en && /^\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, '');
  else norm = s;
  return /^-?\d*\.?\d+$/.test(norm) ? Number(norm) : NaN;
}
