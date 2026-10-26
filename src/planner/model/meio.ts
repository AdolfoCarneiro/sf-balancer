// O meio de cada ligação: as linhas dos produtores viram as linhas dos consumidores pelo computePlan da página, com os
// números do fluxo resolvido (oferta real de quem produz, o que quer quem consome).
import { buildLines, computePlan, encodeShare } from '../../logic/index.js';
import { BALANCER_PATH, type Lang } from '../lang.ts';
import { capOf, defaultTier, perRowOf, portTier } from './stage.ts';
import { arrange, type ArrLine, type Arrangement } from './layout.ts';
import { genPerRow, solvedStage } from './solved.ts';
import type { FlowResult } from './solve.ts';
import type { Block, Factory, GameData, ItemId, Layout, Link, RecipeBlock, StageId } from './types.ts';
import { PURITY, extractorRate, genFuel } from './factory.ts';
import { countPieces, type MeioGeo, type PieceCount } from './map/geo.ts';

export interface Meio { id: string; item: ItemId; producers: StageId[]; consumers: StageId[]; links: string[] }

export type Policy = 'represar' | 'sink' | 'extra';
export interface MeioGroup { driver: 'clock'; count: number; clock: number; nominal: number; per: number }
// owners: o bloco de cada grupo (um bloco com arranjo pode dar vários grupos, um por tamanho de linha).
export interface MeioInput {
  srcGroups: MeioGroup[]; dstGroups: MeioGroup[]; cap: number; tier: string; medium: 'item' | 'fluid';
  policy: Policy; excess: 'represar'; conv: 'k-1'; owners: { src: StageId[]; dst: StageId[] };
}

// Só o que o planner lê do resultado do computePlan.
export interface PlanLine { machines: number; rate: number; partial: boolean; comp: { gi: number; count?: number; rate: number; total?: boolean }[] }
export interface PlanAlt {
  key: string; title: string; caseLabel: string; sinkRate: number; warnings: string[];
  pieces: { mergers: number; splitters: number; smart: number; blueprints: number; junctions: number; sinkBelts: number };
}
export interface Plan {
  cap: number; policy: Policy; fluid: boolean; supply: number; demand: number;
  src: { lines: PlanLine[] }; dst: { lines: PlanLine[] };
  alternatives: PlanAlt[]; warnings: { level: string; text: string }[];
  // Presente quando algum lado passa de MEIO_MAX_LINES: o computePlan (cúbico nas linhas) não rodou.
  tooLarge?: { src: number; dst: number };
  // direct: o grupo só leva a blocos de sobra (cada fileira reta até eles, sem computePlan).
  // unbounded: algum bloco do grupo está sem limite (ou ainda sem fluxo): sem números, sem computePlan.
  direct?: true; unbounded?: true;
  // O bloco de cada grupo (comp.gi); ausente = um grupo por bloco, na ordem do meio.
  owners?: { src: StageId[]; dst: StageId[] };
}

export interface MeioSummary {
  tooLarge: { src: number; dst: number } | null;
  caseLabel: string; supply: number; demand: number; leftover: number; short: number;
  pieces: PieceCount;
}

const E = 1e-6;
const uniq = (xs: StageId[]) => [...new Set(xs)].sort();
const blockOf = (f: Factory, id: StageId): Block => {
  const b = f.blocks.find(x => x.id === id);
  if (!b) throw new Error(`bloco ${id} não existe`);
  return b;
};
const isOutlet = (b: Block) => b.kind === 'sink' || b.kind === 'container' || b.kind === 'export';
const perMinOf = (recipe: string, d: GameData, item: ItemId, side: 'ins' | 'outs') => {
  const x = d.recipes[recipe][side].find(p => p.item === item);
  if (!x) throw new Error(`item ${item} não está na receita ${recipe}`);
  return x.perMin;
};
const finite = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// O agrupamento dos meios, só pelas ligações: componentes conexas das ligações de um mesmo item (produtor ou
// consumidor em comum).
export function groupLinks(links: Link[]): Meio[] {
  const out: Meio[] = [], used = new Set<Link>();
  for (const l0 of links) {
    if (used.has(l0)) continue;
    const g = [l0];
    used.add(l0);
    for (let grew = true; grew;) {
      grew = false;
      for (const l of links) if (!used.has(l) && l.item === l0.item && g.some(x => x.from === l.from || x.to === l.to)) { g.push(l); used.add(l); grew = true; }
    }
    const producers = uniq(g.map(l => l.from)), consumers = uniq(g.map(l => l.to));
    out.push({ id: `${l0.item}:${producers.join(',')}>${consumers.join(',')}`, item: l0.item, producers, consumers, links: g.map(l => l.id) });
  }
  return out;
}

export function meioFor(f: Factory, linkId: string): Meio {
  const m = groupLinks(f.links).find(x => x.links.includes(linkId));
  if (!m) throw new Error(`ligação ${linkId} não existe`);
  return m;
}

// O meio como o computePlan o vê: os blocos de sobra não são destinos (recebem a linha extra), só as receitas.
export const planMeio = (meio: Meio, f: Factory): Meio =>
  ({ ...meio, consumers: meio.consumers.filter(id => !isOutlet(blockOf(f, id))) });

// Algum bloco do grupo sem limite (ou ainda sem fluxo, logo depois de editar): o meio não tem números.
export const meioUnbounded = (meio: Meio, flow: FlowResult): boolean =>
  [...meio.producers, ...meio.consumers].some(id => !flow.blocks[id] || flow.blocks[id].unbounded)
  || meio.links.some(id => typeof flow.links[id] !== 'number');

// arrange de cada bloco guardado pelo objeto do bloco (o Factory é imutável) e pelas máquinas resolvidas: o cacheKey
// chama o meioInput a cada mudança, para todos os meios, e só o bloco editado precisa montar de novo.
const arrMemo = new WeakMap<RecipeBlock, { machines: number; d: GameData; a: Arrangement }>();
function blockArrangement(b: RecipeBlock, bf: FlowResult['blocks'][string] | undefined, d: GameData): Arrangement {
  const st = solvedStage(b, bf), m = arrMemo.get(b);
  if (m && m.machines === st.machines && m.d === d) return m.a;
  const a = arrange(st, d, b.layout);
  arrMemo.set(b, { machines: st.machines, d, a });
  return a;
}

const linesEdited = (l: Layout | undefined): l is Layout =>
  !!l && (l.kind === 'center' || Object.keys(l.belts ?? {}).length > 0 || (l.joins?.length ?? 0) > 0);

export function meioInput(meio: Meio, f: Factory, flow: FlowResult, d: GameData): MeioInput {
  const it = d.items[meio.item];
  const consumers = planMeio(meio, f).consumers;
  // Linhas do item no arranjo do bloco; null quando as linhas são as fileiras de hoje (sem arranjo, ou simples/costas
  // com costas sem esteiras editadas nem junções: virar, espelhar e deslocar fileiras não mudam as linhas) e valem as
  // contas de hoje, por perRowOf (a última fileira incompleta continua "partial"). Uma vez por bloco e lado.
  const memo = new Map<string, ArrLine[] | null>();
  const arranged = (b: RecipeBlock, id: StageId, side: 'ins' | 'outs'): ArrLine[] | null => {
    const k = `${id}|${side}`;
    if (!memo.has(k)) {
      const s = side === 'ins' ? 'in' : 'out';
      memo.set(k, linesEdited(b.layout) ? blockArrangement(b, flow.blocks[id], d).lines.filter(l => l.side === s && l.item === meio.item) : null);
    }
    return memo.get(k)!;
  };
  // Um grupo por tamanho de linha k (na ordem em que aparecem), com count = n·k, per = k e o mesmo clock.
  const bySize = (lines: ArrLine[], g: Omit<MeioGroup, 'count' | 'per'>): MeioGroup[] => {
    const n = new Map<number, number>();
    for (const l of lines) if (l.machines > 0) n.set(l.machines, (n.get(l.machines) ?? 0) + 1);
    return [...n].map(([k, c]) => ({ ...g, count: c * k, per: k }));
  };
  // A esteira (ou cano) do meio é a maior entre as portas que ele liga; origem e sobra entram com o tier padrão.
  let tier = defaultTier(it), cap = capOf(it, tier);
  const sides = [...meio.producers.map(id => [id, 'outs'] as const), ...consumers.map(id => [id, 'ins'] as const)];
  for (const [id, side] of sides) {
    const b = blockOf(f, id);
    if (b.kind !== 'recipe') continue;
    // Com arranjo, o tier das linhas dele (um por porta); sem, o da porta pela fileira simples de hoje.
    const lines = arranged(b, id, side);
    const tr = lines ? lines[0]?.tier ?? defaultTier(it) : portTier(solvedStage(b, flow.blocks[id]), d, meio.item, side);
    const c = capOf(it, tr);
    if (c > cap) { cap = c; tier = tr; }
  }
  // Produtora: a oferta real (máquinas resolvidas no clock de funcionamento).
  const src = (id: StageId): MeioGroup[] => {
    const b = blockOf(f, id), bf = flow.blocks[id], x = finite(bf?.x);
    switch (b.kind) {
      case 'recipe': {
        const st = solvedStage(b, bf), lines = arranged(b, id, 'outs');
        const g = { driver: 'clock' as const, clock: 100 * x / st.machines, nominal: perMinOf(b.recipe, d, meio.item, 'outs') };
        return lines?.length ? bySize(lines, g) : [{ ...g, count: st.machines, per: perRowOf(st, d) }];
      }
      case 'generator': {
        const n = Math.max(1, finite(bf?.machines)), g = genFuel(d, b.building, b.fuel), each = g?.waste?.perMin ?? 1;
        return [{ driver: 'clock', count: n, clock: 100 * x / n, nominal: each, per: genPerRow(d, b) }];
      }
      case 'miner': case 'input': {
        // Linhas iguais, cada uma dentro da esteira.
        const n = Math.max(1, Math.ceil(x / cap - E));
        return [{ driver: 'clock', count: n, clock: 100, nominal: x / n, per: 1 }];
      }
      case 'extractor': {
        const e = d.extractors[b.building], each = e.perMin * (e.purity ? PURITY[b.purity] : 1), run = extractorRate(d, b);
        const n = Math.max(1, finite(bf?.extractors));
        return [{ driver: 'clock', count: n, clock: 100 * x / (n * each), nominal: each, per: Math.max(1, Math.floor(cap / run + E)) }];
      }
      default: throw new Error(`bloco ${id} não produz`);
    }
  };
  // Consumidora: o que ela quer (o que chega mais o que falta), sempre finito; a falta aparece como "short" no meio.
  const dst = (id: StageId): MeioGroup[] => {
    const b = blockOf(f, id), bf = flow.blocks[id];
    if (b.kind === 'generator') {
      // Gerador: cada um queima o combustível (ou a água) por minuto; uma linha por fileira do desenho (genPerRow).
      const g = genFuel(d, b.building, b.fuel), nominal = meio.item === g?.item ? g.perMin : g?.water ?? 1;
      const port = bf?.ins.find(p => p.item === meio.item), want = finite(port?.rate) + finite(port?.deficit);
      const n = Math.max(1, finite(bf?.machines));
      return [{ driver: 'clock', count: n, clock: 100 * want / (nominal * n), nominal, per: genPerRow(d, b) }];
    }
    if (b.kind !== 'recipe') throw new Error(`bloco ${id} não consome pelo meio`);
    const st = solvedStage(b, bf), nominal = perMinOf(b.recipe, d, meio.item, 'ins');
    const port = bf?.ins.find(p => p.item === meio.item);
    const want = finite(port?.rate) + finite(port?.deficit);
    const g = { driver: 'clock' as const, clock: 100 * want / (nominal * st.machines), nominal }, lines = arranged(b, id, 'ins');
    return lines?.length ? bySize(lines, g) : [{ ...g, count: st.machines, per: perRowOf(st, d) }];
  };
  // Bloco de sobra no grupo: a sobra sai numa linha extra até ele; coleta numa produtora: pro sink; senão represa.
  // Fluido não vai pro sink: a sobra represa.
  const outlet = meio.consumers.length > consumers.length;
  const collect = meio.producers.some(id => { const b = blockOf(f, id); return b.kind === 'recipe' && (b.collect ?? []).includes(meio.item); });
  const policy: Policy = outlet ? 'extra' : collect && !it.fluid ? 'sink' : 'represar';
  const srcs = meio.producers.map(id => ({ id, gs: src(id) })), dsts = consumers.map(id => ({ id, gs: dst(id) }));
  return {
    srcGroups: srcs.flatMap(x => x.gs), dstGroups: dsts.flatMap(x => x.gs),
    cap, tier, medium: it.fluid ? 'fluid' : 'item', policy, excess: 'represar', conv: 'k-1',
    owners: { src: srcs.flatMap(x => x.gs.map(() => x.id)), dst: dsts.flatMap(x => x.gs.map(() => x.id)) },
  };
}

// Acima disso (linhas de origem ou de destino somadas) o computePlan fica lento demais (~cúbico).
export const MEIO_MAX_LINES = 120;

export function meioPlan(meio: Meio, f: Factory, flow: FlowResult, d: GameData): Plan {
  const inp = meioInput(meio, f, flow, d);
  const fluid = inp.medium === 'fluid', owners = inp.owners;
  const empty = { cap: inp.cap, policy: inp.policy, fluid, alternatives: [], warnings: [], owners };
  if (meioUnbounded(meio, flow)) return { ...empty, supply: 0, demand: 0, src: { lines: [] }, dst: { lines: [] }, unbounded: true };
  // buildLines é barato (linear); só o computePlan explode com muitas linhas.
  const src = buildLines(inp.srcGroups, inp.cap, '', fluid);
  if (!inp.dstGroups.length) return { ...empty, supply: src.total, demand: src.total, src, dst: { lines: [] }, direct: true } as Plan;
  const dst = buildLines(inp.dstGroups, inp.cap, '', fluid, { balance: true, mix: false });
  if (src.lines.length > MEIO_MAX_LINES || dst.lines.length > MEIO_MAX_LINES) {
    return { ...empty, supply: src.total, demand: dst.total, src, dst, tooLarge: { src: src.lines.length, dst: dst.lines.length } } as Plan;
  }
  return { ...(computePlan(inp) as unknown as Plan), owners };
}

// A montagem escolhida se ainda existe, senão a primeira; null quando o meio não tem alternativas.
export function chosenAlt(plan: Plan, chosen: string | undefined): string | null {
  if (chosen && plan.alternatives.some(a => a.key === chosen)) return chosen;
  return plan.alternatives[0]?.key ?? null;
}

// Peças de uma montagem: as da geometria (o que o mapa desenha, com a cascata e os sinks da sobra); sem geometria,
// as contas do plano.
export function altPieces(a: PlanAlt | undefined, geo?: MeioGeo | null): PieceCount {
  if (geo && !geo.tooLarge) return countPieces(geo);
  return {
    splitters: a?.pieces.splitters ?? 0, mergers: a?.pieces.mergers ?? 0, smart: a?.pieces.smart ?? 0,
    sinks: a && a.sinkRate > E ? 1 : 0, junctions: a?.pieces.junctions ?? 0,
  };
}

// geos: a geometria de cada montagem (MeioResult.geos), quando já existe.
export function meioSummary(plan: Plan, key?: string, geos?: Record<string, MeioGeo>): MeioSummary {
  const k = chosenAlt(plan, key);
  const a = plan.alternatives.find(x => x.key === k);
  return {
    tooLarge: plan.tooLarge ?? null,
    caseLabel: a?.caseLabel ?? '', supply: plan.supply, demand: plan.demand,
    leftover: Math.max(0, plan.supply - plan.demand), short: Math.max(0, plan.demand - plan.supply),
    pieces: altPieces(a, k && geos && Object.hasOwn(geos, k) ? geos[k] : null),
  };
}

// plan: com os donos dos grupos (meioPlan); sem ele, um grupo por bloco.
export const lineOwner = (meio: Meio, side: 'src' | 'dst', line: PlanLine, plan?: Pick<Plan, 'owners'>): StageId =>
  (plan?.owners?.[side] ?? (side === 'src' ? meio.producers : meio.consumers))[line.comp[0].gi];

// Link da página atual com este meio; números em inglês (a página converte ao abrir). selectedKey: a montagem que a
// página abre escolhida (a mesma chave do computePlan; se não existir lá, ela abre a primeira).
// inp: o meioInput já calculado (o cacheKey reaproveita).
export function meioHash(meio: Meio, f: Factory, flow: FlowResult, d: GameData, selectedKey?: string | null, inp = meioInput(meio, f, flow, d)): string {
  const row = (g: MeioGroup) => ({ driver: g.driver, count: String(g.count), clock: String(g.clock), nominal: String(g.nominal), total: '', per: String(g.per) });
  const fluid = inp.medium === 'fluid';
  return '#s=' + encodeShare({
    item: d.items[meio.item].name, src: inp.srcGroups.map(row), dst: inp.dstGroups.map(row),
    medium: inp.medium, ...(fluid ? { pipe: inp.tier } : { belt: inp.tier }),
    policy: inp.policy, excess: inp.excess, conv: inp.conv, lang: 'en',
    ...(selectedKey ? { selectedKey } : {}),
  });
}

export const meioUrl = (meio: Meio, f: Factory, flow: FlowResult, d: GameData, lang: Lang, selectedKey?: string | null): string =>
  BALANCER_PATH[lang] + meioHash(meio, f, flow, d, selectedKey);
