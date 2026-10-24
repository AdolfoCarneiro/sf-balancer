import { t, srcTag, dstTag } from '../i18n/index.js';

export const $ = id => document.getElementById(id);
export const DEFAULTS = {
  get item() { return t('defaultItem'); },
  src: [{ driver: 'machines', count: '42', clock: '', nominal: '65', total: '', per: '' }],
  dst: [{ driver: 'machines', count: '60', clock: '', nominal: '40', total: '', per: '' }],
  medium: 'item', belt: 'Mk4', pipe: 'Mk2', policy: 'represar', excess: 'represar', conv: 'k-1',
};
export const STORE = 'sf-balancer:v3';
export const LANG_STORE = 'sf-balancer:lang';
export function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export const O = l => srcTag(l.id);
export const Dn = l => dstTag(l.id);
