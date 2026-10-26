// O resultado de um meio pronto para o mapa e para o cache: plano leve (clonável pelo postMessage) e a geometria de cada montagem.
import { getLang } from '../../i18n/index.js';
import { chosenAlt, meioHash, meioInput, meioPlan, meioUnbounded, planMeio, type Meio, type Plan, type PlanAlt, type PlanLine } from './meio.ts';
import { directGeo, meioGeo } from './map/meiogeo.ts';
import type { MeioGeo } from './map/geo.ts';
import { PIECE_GAP, pieceGap } from './map/sizes.ts';
import type { FlowResult } from './solve.ts';
import type { Factory, GameData } from './types.ts';

export { chosenAlt } from './meio.ts';

export interface MeioResult { id: string; key: string; plan: Plan; geos: Record<string, MeioGeo> }

// O caseLabel e os avisos vêm no idioma do cálculo; a posição no mapa não entra (o meioHash só lê os blocos do grupo
// e o fluxo deles). O id do meio entra também: dois meios iguais em blocos diferentes têm o mesmo hash, mas âncoras
// de blocos diferentes. O vão entre peças do meio entra quando não é o padrão (muda a geometria); sem limite, um `|u`.
// Bloco com arranjo pode dar vários grupos: o hash não diz de quem é cada um, então os donos entram (só fora do
// padrão de um grupo por bloco).
export const cacheKey = (meio: Meio, f: Factory, flow: FlowResult, d: GameData, lang: string): string => {
  const gap = pieceGap(f), inp = meioInput(meio, f, flow, d);
  const own = inp.owners.src.length === meio.producers.length && inp.owners.dst.length === planMeio(meio, f).consumers.length
    ? '' : `|o${inp.owners.src.join(',')}>${inp.owners.dst.join(',')}`;
  return lang + '|' + meio.id + '|' + meioHash(meio, f, flow, d, null, inp) + own + (gap !== PIECE_GAP ? `|gap${gap}` : '') + (meioUnbounded(meio, flow) ? '|u' : '');
};

// Chave da geometria de um meio direto (sem montagens).
export const DIRECT_KEY = 'direct';

// A geometria da montagem escolhida (ou a do meio direto); null sem montagem, sem limite ou grande demais.
export function chosenGeo(r: MeioResult, chosen: string | undefined): MeioGeo | null {
  const k = r.plan.direct ? DIRECT_KEY : chosenAlt(r.plan, chosen);
  return k !== null && Object.hasOwn(r.geos, k) && !r.geos[k].tooLarge ? r.geos[k] : null;
}

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
    ...(plan.direct ? { direct: true } : {}), ...(plan.unbounded ? { unbounded: true } : {}),
    ...(plan.owners ? { owners: { src: [...plan.owners.src], dst: [...plan.owners.dst] } } : {}),
  };
}

// Tudo de um meio no idioma atual: o computePlan roda uma vez e serve a todas as montagens. As linhas de destino são
// só das receitas (planMeio); direto: uma geometria só; sem limite: nenhuma (o mapa mostra a faixa).
export function meioResult(meio: Meio, f: Factory, flow: FlowResult, d: GameData): MeioResult {
  const full = meioPlan(meio, f, flow, d), item = d.items[meio.item], pm = planMeio(meio, f), gap = pieceGap(f);
  const geos: Record<string, MeioGeo> = {};
  if (full.direct) geos[DIRECT_KEY] = directGeo(pm, full, item, gap);
  for (const a of full.alternatives) geos[a.key] = meioGeo(pm, full, a.key, item, gap);
  return { id: meio.id, key: cacheKey(meio, f, flow, d, getLang()), plan: litePlan(full), geos };
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

// Cache acima de `max`: sai primeiro o mais antigo que ninguém mostra (`keep`). O que está na tela fica, mesmo acima
// do limite: tirar faria o meio ser pedido de novo, sem fim.
export function evict(cache: Map<string, MeioResult>, max: number, keep: Set<string>): void {
  for (const k of cache.keys()) {
    if (cache.size <= max) return;
    if (!keep.has(k)) cache.delete(k);
  }
}

// Os meios a pedir ao worker: os que ainda não têm resultado (null) e não estão pedidos (`inFlight`). Com o fluxo da
// fábrica calculando, nada: as chaves misturariam a fábrica nova com o fluxo velho (a tela fica com o que tem).
export function meioJobs(keys: Map<string, string>, results: Map<string, MeioResult | null>, inFlight: Set<string>, flowPending: boolean): { id: string; key: string }[] {
  if (flowPending) return [];
  const jobs: { id: string; key: string }[] = [];
  for (const [id, key] of keys) if (results.get(id) === null && !inFlight.has(key)) jobs.push({ id, key });
  return jobs;
}
