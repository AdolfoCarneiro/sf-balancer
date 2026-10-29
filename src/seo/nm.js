// O balancer N→M de cada página: a melhor montagem com esteiras Mk4 cheias, as outras, e o título e a descrição dela.
// Usado pelo build (as páginas estáticas) e pelo shell (o título e a descrição da aba), que precisam dizer o mesmo.
import { t, fmt } from '../i18n/index.js';
import { balancerCandidates, rankDesigns, designName, designPieces } from '../logic/index.js';
import { cap1 } from '../balancer/balancerSvg.js';

export const NM_BELT = { id: 'Mk4', cap: 480 };

export function nmInfo(n, m) {
  const all = rankDesigns(balancerCandidates(n, m, [NM_BELT.cap], NM_BELT.cap, [])).filter(d => !d.applies);
  const best = all[0];
  return { n, m, best, others: all.slice(1), style: best.kind.startsWith('butterfly') ? 'butterfly' : 'normal' };
}

// Os números do texto, no idioma de agora.
export function nmFacts(info) {
  const d = info.best;
  return {
    n: info.n, m: info.m, name: designName(d), pieces: designPieces(d),
    sp: d.pieces.splitters, mg: d.pieces.mergers, per: fmt(d.perOut), rate: fmt(NM_BELT.cap),
    loop: !!d.extra && d.kind.endsWith('-loop'),
  };
}

export function nmMeta(n, m) {
  const f = nmFacts(nmInfo(n, m));
  return { title: t('nmTitle', n, m), desc: t('nmDesc', f), h1: t('nmH1', n, m), lead: t('nmLead', { ...f, name: f.name }), facts: f };
}

export const nmName = d => cap1(designName(d));
