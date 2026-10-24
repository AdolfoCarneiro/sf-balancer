// Candidatos e ranking de balancers.
import { t } from '../i18n/index.js';
import { DESIGN_KINDS, balancerDesign, blueprintDesign, BF_KINDS, butterflyDesign } from './balancers.js';

export function balancerCandidates(N, M, rates, cap, blueprints = []) {
  const list = DESIGN_KINDS.map(k => balancerDesign(k, N, M, rates, cap));
  for (const k of BF_KINDS) list.push(butterflyDesign(N, M, rates, cap, k));
  for (const bp of blueprints) if (bp.m === M && bp.n >= N) list.push(blueprintDesign(bp, N, M, rates, cap));
  return list;
}

export const designPieces = d => d.pieces.splitters + d.pieces.mergers + d.pieces.blueprints;

export const designOut = d => d.perOut * d.M;

// A borboleta mistura faixas distantes uma da outra e é bem mais difícil de montar que uma matriz ou um funil:
// ela só ganha quando economiza mais de 20% das peças (4→5: 21 contra 26 da matriz com loop não basta).
const BF_EDGE = 0.8;

export const bfKind = d => d.kind.startsWith('butterfly');

export const buildCost = d => designPieces(d) / (bfKind(d) ? BF_EDGE : 1);

// Os que se aplicam primeiro; depois mais vazão, blueprint seu, menos sink, menos peças.
export function rankDesigns(list) {
  return list.slice().sort((a, b) => {
    if (!!a.applies !== !!b.applies) return a.applies ? 1 : -1;
    const dOut = designOut(b) - designOut(a);
    if (Math.abs(dOut) > 0.05) return dOut;
    if ((a.kind === 'blueprint') !== (b.kind === 'blueprint')) return a.kind === 'blueprint' ? -1 : 1;
    if (Math.abs(a.sinkRate - b.sinkRate) > 0.05) return a.sinkRate - b.sinkRate;
    return buildCost(a) - buildCost(b) || designPieces(a) - designPieces(b);
  });
}

// Por que o primeiro ganhou do segundo colocado: código + argumentos para o texto.
export function designWhy(ranked) {
  const [a, b] = ranked.filter(d => !d.applies);
  if (!a) return { code: 'none' };
  if (a.kind === 'blueprint') return { code: 'bp', a };
  if (!b) return { code: 'only', a };
  if (designOut(a) - designOut(b) > 0.05) return { code: 'more', a, b };
  if (b.sinkRate - a.sinkRate > 0.05) return { code: 'noSink', a, b };
  if (!bfKind(a) && bfKind(b) && designPieces(b) <= designPieces(a)) return { code: 'simpler', a, b };
  if (designPieces(a) < designPieces(b)) return { code: 'fewer', a, b };
  return { code: 'tie', a, b };
}

export function designName(d) {
  if (d.kind === 'blueprint') return t('dkBlueprint', d.bp.n, d.bp.m);
  return t({ butterfly: 'dkButterfly', 'butterfly-loop': 'dkButterflyLoop', 'butterfly-sink': 'dkButterflySink', matrix: 'dkMatrix', funnel: 'dkFunnel', 'matrix-loop': 'dkMatrixLoop', 'matrix-split-loop': 'dkMatrixSplitLoop', 'funnel-loop': 'dkFunnelLoop', 'matrix-sink': 'dkMatrixSink', 'funnel-sink': 'dkFunnelSink' }[d.kind]);
}
