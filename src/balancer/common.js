import { srcTag, dstTag } from '../i18n/index.js';

// O que os desenhos (flow.js, balancerSvg.js) usam: texto escapado para o SVG e o rótulo de cada linha.
export function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export const O = l => srcTag(l.id);
export const Dn = l => dstTag(l.id);
