// Edição da fábrica v2 (fase 3): blocos de receita, de origem e de sobra, ligados com loops liberados.
// Funções puras; os números (quanto flui) ficam com o solver.
import type {
  Block, BuildingId, ExtractorBlock, Factory, GameData, ItemId, LigPlace, Limits, Link, MinerBlock, Purity, Recipe,
  RecipeBlock, RecipeId, Side, Stage, StageId,
} from './types.ts';
import { suggestedPerRow, tierKey } from './stage.ts';
import { groupLinks, type Meio } from './meio.ts';
import { cleanPlace } from './map/sizes.ts';
import type { Pt } from './map/geo.ts';
import { BELTS, PIPES } from '../../logic/index.js';

export const PURITY: Record<Purity, number> = { impure: 0.5, normal: 1, pure: 2 };
export const MINER_DEFAULT = 60;   // Miner Mk.1 em nó normal (Docs) = padrão do Modeler
export const MAX_EXTRACTORS = 1000, MAX_RATE = 1e6;
// Limite de máquinas por bloco: o mesmo na leitura, nos campos e na etapa derivada.
export const MAX_MACHINES = 10000;
// Limites da fábrica: a leitura corta no mesmo número, então criar ou ligar além dele é recusado (sumiria ao recarregar).
export const MAX_STAGES = 200, MAX_LINKS = 2000;
export const blocksFull = (f: Factory): boolean => f.blocks.length >= MAX_STAGES;
export const linksFull = (f: Factory): boolean => f.links.length >= MAX_LINKS;

export type BlockSpec =
  | { kind: 'recipe'; recipe: RecipeId }
  | { kind: 'miner'; item: ItemId }
  | { kind: 'extractor'; building: BuildingId; item: ItemId }
  | { kind: 'input'; item: ItemId }
  | { kind: 'sink' | 'container' | 'export' };

const nextId = (ids: string[], p: string) => p + (Math.max(0, ...ids.map(id => (id.match(new RegExp(`^${p}(\\d+)$`)) ?? [])[1]).filter(Boolean).map(Number)) + 1);
export const nextBlockId = (f: Factory): StageId => nextId(f.blocks.map(b => b.id), 's');
export const nextLinkId = (f: Factory): string => nextId(f.links.map(l => l.id), 'l');
const get = (f: Factory, id: StageId) => f.blocks.find(b => b.id === id);
const editRecipe = (f: Factory, id: StageId, fn: (b: RecipeBlock) => RecipeBlock): Factory =>
  ({ ...f, blocks: f.blocks.map(b => (b.id === id && b.kind === 'recipe' ? fn(b) : b)) });
const own = <T>(o: Record<string, T>, k: string) => Object.hasOwn(o, k);
export const rateOk = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_RATE;
export const countOk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_EXTRACTORS;
export const machinesOk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_MACHINES;
export const perRowOk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 500;
export const minable = (d: GameData, item: unknown): item is ItemId =>
  typeof item === 'string' && own(d.items, item) && d.items[item].raw && !d.items[item].fluid;
export const extractable = (d: GameData, building: unknown, item: unknown): boolean =>
  typeof building === 'string' && typeof item === 'string' && own(d.extractors, building) && own(d.items, item) && d.extractors[building].items.includes(item);
const isFluid = (d: GameData, item: ItemId) => own(d.items, item) && d.items[item].fluid;

// A receita do bloco vista como etapa, para reaproveitar as contas de fileira.
const asStage = (b: RecipeBlock): Stage => ({ id: b.id, recipe: b.recipe, machines: 1, clock: b.clock, perRow: b.perRow, tiers: b.tiers });

// Limites saneados: máquinas inteiras 1..MAX_MACHINES; entradas em (0, MAX_RATE], só dos itens `items`
// (sem a lista, qualquer chave de item que não seja de Object.prototype). Nada = undefined.
export function cleanLimits(raw: unknown, items?: ItemId[]): Limits | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { machines, inputs } = raw as Record<string, unknown>;
  const out: Limits = {};
  if (machinesOk(machines)) out.machines = machines;
  if (inputs && typeof inputs === 'object' && !Array.isArray(inputs)) {
    const ins: Record<ItemId, number> = {};
    for (const [item, v] of Object.entries(inputs)) {
      if ((items ? items.includes(item) : !(item in Object.prototype)) && rateOk(v)) ins[item] = v;
    }
    if (Object.keys(ins).length) out.inputs = ins;
  }
  return Object.keys(out).length ? out : undefined;
}
const insOf = (r: Recipe) => r.ins.map(f => f.item);

// Coleta saneada: saídas sólidas da receita, sem repetir, na ordem da receita. Nada = undefined.
export function cleanCollect(raw: unknown, r: Recipe, d: GameData): ItemId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = r.outs.map(f => f.item).filter(item => raw.includes(item) && !isFluid(d, item));
  return out.length ? out : undefined;
}

// Bloco de receita com limites e coleta opcionais (ausentes, sem o campo).
const withOpt = (b: RecipeBlock, limits: Limits | undefined, collect: ItemId[] | undefined): RecipeBlock => {
  const { limits: _l, collect: _c, ...rest } = b;
  return { ...rest, ...(limits ? { limits } : {}), ...(collect ? { collect } : {}) };
};

export function portsOf(b: Block, d: GameData): { ins: ItemId[] | 'any' | 'solid'; outs: ItemId[] } {
  switch (b.kind) {
    case 'recipe': { const r = d.recipes[b.recipe]; return { ins: r.ins.map(f => f.item), outs: r.outs.map(f => f.item) }; }
    case 'miner': case 'extractor': case 'input': return { ins: [], outs: [b.item] };
    case 'sink': return { ins: 'solid', outs: [] };
    default: return { ins: 'any', outs: [] };
  }
}

// Bloco novo a partir da spec, ou null se ela não vale. `free`: sem limite (o solver dá o tamanho).
function makeBlock(f: Factory, d: GameData, spec: BlockSpec, free: boolean): Block | null {
  const id = nextBlockId(f);
  switch (spec.kind) {
    case 'recipe': {
      if (typeof spec.recipe !== 'string' || !own(d.recipes, spec.recipe)) return null;
      const b: RecipeBlock = { id, kind: 'recipe', recipe: spec.recipe, clock: 100, perRow: null, tiers: {} };
      // Criado no vazio: uma fileira cheia, já fixada (bloco solto sem limite não teria número).
      return free ? b : { ...b, limits: { machines: suggestedPerRow(asStage(b), d) } };
    }
    case 'miner': return minable(d, spec.item) ? { id, kind: 'miner', item: spec.item, rate: MINER_DEFAULT } : null;
    case 'extractor': return extractable(d, spec.building, spec.item)
      ? { id, kind: 'extractor', building: spec.building, item: spec.item, purity: 'normal', count: null } : null;
    case 'input': return typeof spec.item === 'string' && own(d.items, spec.item) ? { id, kind: 'input', item: spec.item, rate: null } : null;
    case 'sink': case 'container': case 'export': return { id, kind: spec.kind };
    default: return null;
  }
}

// Bloco novo nasce no mesmo ponto nas duas vistas (sem `montar`, a Montar já usa o `map`).
const placeAt = (f: Factory, id: StageId, at: Pt): Factory => {
  const p = cleanPlace({ x: at[0], y: at[1], rot: 0 });
  return p ? { ...f, map: { ...f.map, [id]: p }, ...(f.montar ? { montar: { ...f.montar, [id]: p } } : {}) } : f;
};

export function addBlock(f: Factory, d: GameData, spec: BlockSpec, at: Pt): Factory {
  if (blocksFull(f)) return f;
  const b = makeBlock(f, d, spec, false);
  return b ? placeAt({ ...f, blocks: [...f.blocks, b] }, b.id, at) : f;
}

// Bloco novo já ligado à porta: `out` = a porta produz o item e o novo consome; `in` = o novo alimenta a porta.
export function addLinkedBlock(f: Factory, d: GameData, spec: BlockSpec, port: { block: StageId; item: ItemId; side: 'out' | 'in' }, at: Pt): Factory {
  if (blocksFull(f) || linksFull(f)) return f;
  const b = makeBlock(f, d, spec, true);
  if (!b || !get(f, port.block)) return f;
  const f2: Factory = { ...f, blocks: [...f.blocks, b] };
  const [from, to] = port.side === 'out' ? [port.block, b.id] : [b.id, port.block];
  if (!canConnect(f2, d, from, to, port.item).ok) return f;
  return placeAt(connect(f2, d, from, to, port.item), b.id, at);
}

// Tira as posições de ligação e as montagens cujo grupo deixou de existir. `montarLigs` fica mesmo vazio (a presença
// dele diz que a Montar não segue mais as `ligs`).
function pruneMeios(f: Factory): Factory {
  if (!f.ligs && !f.alts && !f.montarLigs) return f;
  const ids = new Set(meiosOf(f).map(m => m.id));
  const keep = <T>(o: Record<string, T> | undefined) => {
    if (!o) return undefined;
    const e = Object.entries(o).filter(([k]) => ids.has(k));
    return e.length ? Object.fromEntries(e) : undefined;
  };
  const { ligs: _l, alts: _a, montarLigs: _m, ...rest } = f;
  const ligs = keep(f.ligs), alts = keep(f.alts), montarLigs = f.montarLigs && (keep(f.montarLigs) ?? {});
  return { ...rest, ...(alts ? { alts } : {}), ...(ligs ? { ligs } : {}), ...(montarLigs ? { montarLigs } : {}) };
}

// Sem as posições (nas duas vistas) dos blocos que saíram.
function dropPlaces(f: Factory, gone: (id: StageId) => boolean): Factory {
  let g = f;
  for (const k of ['map', 'montar'] as const) {
    const o = g[k];
    if (o && Object.keys(o).some(gone)) g = { ...g, [k]: Object.fromEntries(Object.entries(o).filter(([id]) => !gone(id))) };
  }
  return g;
}

export function removeBlock(f: Factory, id: StageId): Factory {
  if (!get(f, id)) return f;
  const g: Factory = { ...f, blocks: f.blocks.filter(b => b.id !== id), links: f.links.filter(l => l.from !== id && l.to !== id) };
  return pruneMeios(dropPlaces(g, x => x === id));
}

// Apaga vários blocos de uma vez (seleção múltipla), com as ligações deles; ids que não existem são ignorados.
export function removeBlocks(f: Factory, ids: readonly StageId[]): Factory {
  const gone = new Set(ids.filter(id => get(f, id)));
  if (!gone.size) return f;
  const g: Factory = { ...f, blocks: f.blocks.filter(b => !gone.has(b.id)), links: f.links.filter(l => !gone.has(l.from) && !gone.has(l.to)) };
  return pruneMeios(dropPlaces(g, id => gone.has(id)));
}

// Loops liberados: só a ligação de um bloco com ele mesmo é proibida.
export function canConnect(f: Factory, d: GameData, from: StageId, to: StageId, item: ItemId):
  { ok: true } | { ok: false; reason: 'self' | 'item' | 'dup' | 'fluidSink' | 'full' } {
  if (from === to) return { ok: false, reason: 'self' };
  const a = get(f, from), b = get(f, to);
  if (!a || !b || typeof item !== 'string' || !own(d.items, item) || !portsOf(a, d).outs.includes(item)) return { ok: false, reason: 'item' };
  const ins = portsOf(b, d).ins;
  if (ins === 'solid' && d.items[item].fluid) return { ok: false, reason: 'fluidSink' };
  if (Array.isArray(ins) && !ins.includes(item)) return { ok: false, reason: 'item' };
  if (f.links.some(l => l.from === from && l.to === to && l.item === item)) return { ok: false, reason: 'dup' };
  if (linksFull(f)) return { ok: false, reason: 'full' };
  return { ok: true };
}

export function connect(f: Factory, d: GameData, from: StageId, to: StageId, item: ItemId): Factory {
  if (!canConnect(f, d, from, to, item).ok) return f;
  const l: Link = { id: nextLinkId(f), item, from, to };
  return pruneMeios({ ...f, links: [...f.links, l] });
}

export const disconnect = (f: Factory, linkId: string): Factory =>
  f.links.some(l => l.id === linkId) ? pruneMeios({ ...f, links: f.links.filter(l => l.id !== linkId) }) : f;

// Tira vários links de uma vez (a ligação inteira); o grupo some e leva `ligs`/`alts` junto.
export function disconnectMany(f: Factory, linkIds: string[]): Factory {
  const ids = new Set(linkIds);
  return f.links.some(l => ids.has(l.id)) ? pruneMeios({ ...f, links: f.links.filter(l => !ids.has(l.id)) }) : f;
}

export function setRecipe(f: Factory, d: GameData, id: StageId, recipe: RecipeId): Factory {
  const b = get(f, id);
  if (b?.kind !== 'recipe' || typeof recipe !== 'string' || !own(d.recipes, recipe)) return f;
  const r = d.recipes[recipe];
  const keep = (l: Link) => (l.from !== id || r.outs.some(x => x.item === l.item)) && (l.to !== id || r.ins.some(x => x.item === l.item));
  const keys = new Set([...r.ins.map(x => tierKey('ins', x.item)), ...r.outs.map(x => tierKey('outs', x.item))]);
  const g = editRecipe({ ...f, links: f.links.filter(keep) }, id, x => withOpt(
    { ...x, recipe, tiers: Object.fromEntries(Object.entries(x.tiers).filter(([k]) => keys.has(k))) },
    cleanLimits(x.limits, insOf(r)), cleanCollect(x.collect, r, d),
  ));
  return pruneMeios(g);
}

// null ou {} = livre; valores inválidos somem. As entradas que não são da receita somem no setRecipe e na leitura.
export const setLimits = (f: Factory, id: StageId, limits: Limits | null): Factory =>
  editRecipe(f, id, b => withOpt(b, cleanLimits(limits), b.collect));

// Clock em [1, 250]; sem recálculo (os números são do solver).
export const setClock = (f: Factory, id: StageId, clock: number): Factory =>
  Number.isFinite(clock) ? editRecipe(f, id, b => ({ ...b, clock: Math.min(250, Math.max(1, clock)) })) : f;
export const setPerRow = (f: Factory, id: StageId, perRow: number | null): Factory =>
  perRow === null || perRowOk(perRow) ? editRecipe(f, id, b => ({ ...b, perRow })) : f;
// `null` tira a escolha (volta ao automático). Só porta da receita naquele lado, e tier que existe para ela
// (esteira para sólido, cano para fluido); o resto não muda nada.
export function setTier(f: Factory, d: GameData, id: StageId, side: Side, item: ItemId, tier: string | null): Factory {
  const b = get(f, id);
  if (b?.kind !== 'recipe' || (side !== 'ins' && side !== 'outs') || !d.recipes[b.recipe][side].some(x => x.item === item)) return f;
  const k = tierKey(side, item);
  if (tier === null) {
    if (!Object.hasOwn(b.tiers, k)) return f;
    return editRecipe(f, id, x => { const tiers = { ...x.tiers }; delete tiers[k]; return { ...x, tiers }; });
  }
  if (typeof tier !== 'string' || !(isFluid(d, item) ? PIPES : BELTS).some((t: { id: string }) => t.id === tier)) return f;
  return editRecipe(f, id, x => ({ ...x, tiers: { ...x.tiers, [k]: tier } }));
}

// Marca a saída sólida para coletar o excesso; saída fluida ou que não é da receita: nada muda.
export function setCollect(f: Factory, d: GameData, id: StageId, item: ItemId, on: boolean): Factory {
  const b = get(f, id);
  if (b?.kind !== 'recipe') return f;
  const r = d.recipes[b.recipe];
  if (!r.outs.some(x => x.item === item) || isFluid(d, item)) return f;
  const cur = b.collect ?? [];
  if (cur.includes(item) === on) return f;
  return editRecipe(f, id, x => withOpt(x, x.limits, cleanCollect(on ? [...cur, item] : cur.filter(i => i !== item), r, d)));
}

export function setMinerRate(f: Factory, id: StageId, rate: number): Factory {
  const b = get(f, id);
  if (b?.kind !== 'miner' || !rateOk(rate)) return f;
  return { ...f, blocks: f.blocks.map(x => (x.id === id ? { ...(x as MinerBlock), rate } : x)) };
}

// Limite da Entrada: taxa válida ou null (sem limite).
export function setInputRate(f: Factory, id: StageId, rate: number | null): Factory {
  const b = get(f, id);
  if (b?.kind !== 'input' || (rate !== null && !rateOk(rate))) return f;
  return { ...f, blocks: f.blocks.map(x => (x.id === id ? { ...b, rate } : x)) };
}

// count: inteiro 1..MAX_EXTRACTORS ou null (a ferramenta calcula); purity só se o extrator tem pureza.
export function setExtractor(f: Factory, d: GameData, id: StageId, v: { count?: number | null; purity?: Purity }): Factory {
  const b = get(f, id);
  if (b?.kind !== 'extractor') return f;
  const next: ExtractorBlock = { ...b };
  if (v.count !== undefined) next.count = countOk(v.count) ? v.count : null;
  if (v.purity !== undefined && own(PURITY, v.purity) && d.extractors[b.building]?.purity) next.purity = v.purity;
  return { ...f, blocks: f.blocks.map(x => (x.id === id ? next : x)) };
}

// Posição livre da ligação, presa na grade; null volta à posição automática.
export function placeLig(f: Factory, meio: string, place: LigPlace | null): Factory {
  if (place === null) {
    if (!f.ligs || !Object.hasOwn(f.ligs, meio)) return f;
    const { [meio]: _gone, ...ligs } = f.ligs;
    const { ligs: _l, ...rest } = f;
    return Object.keys(ligs).length ? { ...rest, ligs } : rest;
  }
  const p = cleanLigPlace(place);
  if (!p || !meiosOf(f).some(m => m.id === meio)) return f;
  return { ...f, ligs: { ...f.ligs, [meio]: p } };
}

export function cleanLigPlace(v: unknown): LigPlace | null {
  const p = cleanPlace(v);
  return p ? { x: p.x, y: p.y, rot: p.rot } : null;
}

// Mesmo agrupamento e mesmo formato de id dos meios da fase 1.
export const meiosOf = (f: Factory): Meio[] => groupLinks(f.links);
