// O meio de cada ligação: as linhas dos produtores viram as linhas dos consumidores pelo computePlan da página.
import { computePlan, encodeShare } from '../../logic/index.js';
import { SITE_PATH, type Lang } from '../lang.ts';
import { capOf, perRowOf, portTier } from './stage.ts';
import type { Chain, GameData, ItemId, Link, Stage, StageId } from './types.ts';

export interface Meio { id: string; item: ItemId; producers: StageId[]; consumers: StageId[]; links: string[] }

export interface MeioGroup { driver: 'clock'; count: number; clock: number; nominal: number; per: number }
export interface MeioInput {
  srcGroups: MeioGroup[]; dstGroups: MeioGroup[]; cap: number; tier: string; medium: 'item' | 'fluid';
  policy: Chain['policy']; excess: 'represar'; conv: 'k-1';
}

// Só o que o planner lê do resultado do computePlan.
export interface PlanLine { machines: number; rate: number; partial: boolean; comp: { gi: number; count?: number; rate: number; total?: boolean }[] }
export interface PlanAlt {
  key: string; caseLabel: string; sinkRate: number; warnings: string[];
  pieces: { mergers: number; splitters: number; smart: number; blueprints: number; junctions: number; sinkBelts: number };
}
export interface Plan {
  cap: number; policy: Chain['policy']; fluid: boolean; supply: number; demand: number;
  src: { lines: PlanLine[] }; dst: { lines: PlanLine[] };
  alternatives: PlanAlt[]; warnings: { level: string; text: string }[];
}

export interface MeioSummary {
  caseLabel: string; supply: number; demand: number; leftover: number; short: number;
  pieces: { splitters: number; mergers: number; sinks: number };
}

const E = 1e-6;
const uniq = (xs: StageId[]) => [...new Set(xs)].sort();
const stageOf = (c: Chain, id: StageId): Stage => {
  const s = c.stages.find(x => x.id === id);
  if (!s) throw new Error(`etapa ${id} não existe`);
  return s;
};
const flowOf = (s: Stage, data: GameData, item: ItemId, side: 'ins' | 'outs') => {
  const f = data.recipes[s.recipe][side].find(x => x.item === item);
  if (!f) throw new Error(`item ${item} não está na receita ${s.recipe}`);
  return f;
};

// Componentes conexas das ligações de um mesmo item (produtor ou consumidor em comum).
export function meios(chain: Chain, _data: GameData): Meio[] {
  const out: Meio[] = [], used = new Set<Link>();
  for (const l0 of chain.links) {
    if (used.has(l0)) continue;
    const g = [l0];
    used.add(l0);
    for (let grew = true; grew;) {
      grew = false;
      for (const l of chain.links) if (!used.has(l) && l.item === l0.item && g.some(x => x.from === l.from || x.to === l.to)) { g.push(l); used.add(l); grew = true; }
    }
    const producers = uniq(g.map(l => l.from)), consumers = uniq(g.map(l => l.to));
    out.push({ id: `${l0.item}:${producers.join(',')}>${consumers.join(',')}`, item: l0.item, producers, consumers, links: g.map(l => l.id) });
  }
  return out;
}

export function meioFor(chain: Chain, data: GameData, linkId: string): Meio {
  const m = meios(chain, data).find(x => x.links.includes(linkId));
  if (!m) throw new Error(`ligação ${linkId} não existe`);
  return m;
}

export function meioInput(meio: Meio, chain: Chain, data: GameData): MeioInput {
  const it = data.items[meio.item];
  const group = (id: StageId, side: 'ins' | 'outs'): MeioGroup => {
    const s = stageOf(chain, id);
    return { driver: 'clock', count: s.machines, clock: s.clock, nominal: flowOf(s, data, meio.item, side).perMin, per: perRowOf(s, data) };
  };
  // A esteira (ou cano) do meio é a maior entre as portas que ele liga.
  let tier = '', cap = 0;
  const sides = [...meio.producers.map(id => [id, 'outs'] as const), ...meio.consumers.map(id => [id, 'ins'] as const)];
  for (const [id, side] of sides) {
    const tr = portTier(stageOf(chain, id), data, meio.item, side), c = capOf(it, tr);
    if (c > cap) { cap = c; tier = tr; }
  }
  return {
    srcGroups: meio.producers.map(id => group(id, 'outs')), dstGroups: meio.consumers.map(id => group(id, 'ins')),
    // Fluido não vai pro sink: a sobra represa.
    cap, tier, medium: it.fluid ? 'fluid' : 'item', policy: it.fluid && chain.policy === 'sink' ? 'represar' : chain.policy, excess: 'represar', conv: 'k-1',
  };
}

export const meioPlan = (meio: Meio, chain: Chain, data: GameData): Plan =>
  computePlan(meioInput(meio, chain, data)) as unknown as Plan;

export function meioSummary(plan: Plan): MeioSummary {
  const a = plan.alternatives[0];
  return {
    caseLabel: a?.caseLabel ?? '', supply: plan.supply, demand: plan.demand,
    leftover: Math.max(0, plan.supply - plan.demand), short: Math.max(0, plan.demand - plan.supply),
    pieces: { splitters: a?.pieces.splitters ?? 0, mergers: a?.pieces.mergers ?? 0, sinks: a && a.sinkRate > E ? 1 : 0 },
  };
}

export const lineOwner = (meio: Meio, side: 'src' | 'dst', line: PlanLine): StageId =>
  (side === 'src' ? meio.producers : meio.consumers)[line.comp[0].gi];

// Link da página atual com este meio; números em inglês (a página converte ao abrir).
export function meioHash(meio: Meio, chain: Chain, data: GameData): string {
  const inp = meioInput(meio, chain, data);
  const row = (g: MeioGroup) => ({ driver: g.driver, count: String(g.count), clock: String(g.clock), nominal: String(g.nominal), total: '', per: String(g.per) });
  const fluid = inp.medium === 'fluid';
  return '#s=' + encodeShare({
    item: data.items[meio.item].name, src: inp.srcGroups.map(row), dst: inp.dstGroups.map(row),
    medium: inp.medium, ...(fluid ? { pipe: inp.tier } : { belt: inp.tier }),
    policy: inp.policy, excess: inp.excess, conv: inp.conv, lang: 'en',
  });
}

export const meioUrl = (meio: Meio, chain: Chain, data: GameData, lang: Lang): string => SITE_PATH[lang] + meioHash(meio, chain, data);
