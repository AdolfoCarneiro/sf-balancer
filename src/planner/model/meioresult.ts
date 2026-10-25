// O resultado de um meio pronto para o mapa e para o cache: plano leve (clonável pelo postMessage) e a geometria de cada montagem.
import { getLang } from '../../i18n/index.js';
import { meioHash, meioPlan, type Meio, type Plan, type PlanAlt, type PlanLine } from './meio.ts';
import { meioGeo } from './map/meiogeo.ts';
import type { MeioGeo } from './map/geo.ts';
import { PIECE_GAP, pieceGap } from './map/sizes.ts';
import type { Chain, GameData } from './types.ts';

export { chosenAlt } from './meio.ts';

export interface MeioResult { id: string; key: string; plan: Plan; geos: Record<string, MeioGeo> }

// O caseLabel e os avisos vêm no idioma do cálculo; a posição no mapa não entra (o meioHash só lê a etapa).
// O id do meio entra também: dois meios iguais em etapas diferentes têm o mesmo hash, mas âncoras de etapas diferentes.
// O vão entre peças do meio entra quando não é o padrão (muda a geometria).
export const cacheKey = (meio: Meio, chain: Chain, data: GameData, lang: string): string => {
  const gap = pieceGap(chain);
  return lang + '|' + meio.id + '|' + meioHash(meio, chain, data) + (gap !== PIECE_GAP ? `|gap${gap}` : '');
};

const liteLine = (l: PlanLine): PlanLine => ({
  machines: l.machines, rate: l.rate, partial: l.partial,
  comp: l.comp.map(c => ({ gi: c.gi, rate: c.rate, ...(c.count !== undefined ? { count: c.count } : {}), ...(c.total !== undefined ? { total: c.total } : {}) })),
});
const liteAlt = (a: PlanAlt): PlanAlt => ({
  key: a.key, title: a.title, caseLabel: a.caseLabel, sinkRate: a.sinkRate, warnings: [...a.warnings],
  pieces: {
    mergers: a.pieces.mergers, splitters: a.pieces.splitters, smart: a.pieces.smart,
    blueprints: a.pieces.blueprints, junctions: a.pieces.junctions, sinkBelts: a.pieces.sinkBelts,
  },
});

// Só os campos declarados em Plan.
export function litePlan(plan: Plan): Plan {
  return {
    cap: plan.cap, policy: plan.policy, fluid: plan.fluid, supply: plan.supply, demand: plan.demand,
    src: { lines: plan.src.lines.map(liteLine) }, dst: { lines: plan.dst.lines.map(liteLine) },
    alternatives: plan.alternatives.map(liteAlt), warnings: plan.warnings.map(w => ({ level: w.level, text: w.text })),
    ...(plan.tooLarge ? { tooLarge: { src: plan.tooLarge.src, dst: plan.tooLarge.dst } } : {}),
  };
}

// Tudo de um meio no idioma atual: o computePlan roda uma vez e serve a todas as montagens.
export function meioResult(meio: Meio, chain: Chain, data: GameData): MeioResult {
  const full = meioPlan(meio, chain, data), item = data.items[meio.item];
  const geos: Record<string, MeioGeo> = {};
  for (const a of full.alternatives) geos[a.key] = meioGeo(meio, full, a.key, item, pieceGap(chain));
  return { id: meio.id, key: cacheKey(meio, chain, data, getLang()), plan: litePlan(full), geos };
}

// keys: id do meio -> cacheKey. O que já está no cache fica pronto; o resto vai para o cálculo.
export function splitCached(keys: Map<string, string>, cache: Map<string, MeioResult>): { ready: Map<string, MeioResult>; missing: string[] } {
  const ready = new Map<string, MeioResult>(), missing: string[] = [];
  for (const [id, key] of keys) {
    const r = cache.get(key);
    if (r) ready.set(id, r); else missing.push(id);
  }
  return { ready, missing };
}
