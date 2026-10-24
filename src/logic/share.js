// Link do cenário e issue do GitHub.
import { LANGS } from '../i18n/index.js';
import { BELTS, PIPES } from './belts.js';

// O cenário vai no fragmento da URL (#s=...), que o navegador não manda para o servidor.
export function encodeShare(state) {
  let bin = '';
  new TextEncoder().encode(JSON.stringify(state)).forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Devolve só o que o formulário entende, com texto curto; link quebrado ou adulterado vira null.
export function decodeShare(str) {
  let raw;
  try {
    const bin = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
    raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  } catch (e) { return null; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.src) || !Array.isArray(raw.dst) || !raw.src.length || !raw.dst.length) return null;
  const str40 = v => (v === undefined || v === null ? '' : String(v).slice(0, 40));
  const row = r => {
    const o = r && typeof r === 'object' ? r : {};
    return { driver: ['machines', 'clock', 'total'].includes(o.driver) ? o.driver : 'machines', count: str40(o.count), clock: str40(o.clock), nominal: str40(o.nominal), total: str40(o.total), per: str40(o.per) };
  };
  const pick = (v, ok, def) => (ok.includes(v) ? v : def);
  return {
    item: String(raw.item || '').slice(0, 80),
    src: raw.src.slice(0, 20).map(row), dst: raw.dst.slice(0, 20).map(row),
    medium: pick(raw.medium, ['item', 'fluid'], 'item'),
    belt: pick(raw.belt, BELTS.map(b => b.id), 'Mk4'),
    pipe: pick(raw.pipe, PIPES.map(b => b.id), 'Mk2'),
    policy: pick(raw.policy, ['represar', 'sink', 'extra'], 'represar'),
    excess: pick(raw.excess, ['represar', 'sink'], 'represar'),
    conv: pick(raw.conv, ['k-1', 'k'], 'k-1'),
    selectedKey: typeof raw.selectedKey === 'string' ? raw.selectedKey.slice(0, 80) : null,
    lang: pick(raw.lang, LANGS, 'en'),
  };
}

// Issue nova no GitHub já preenchida.
const REPO = 'https://github.com/AdolfoCarneiro/sf-balancer';

export function issueUrl(title, body) {
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
