// Estado salvo da fábrica v2: ações com desfazer, leitura segura (link #p= e localStorage) e migração da v1.
import type {
  Block, BuildingId, Factory, GameData, ItemId, Layout, LigPlace, Limits, Link, MapPlace, Purity, RecipeId, Side, StageId,
} from './types.ts';
import { tierKey } from './stage.ts';
import { cleanLayout } from './layout.ts';
import {
  MAX_LINKS, MAX_MACHINES, MAX_STAGES, PURITY, addBlock, addLinkedBlock, canConnect, cleanCollect, cleanLigPlace, cleanLimits, connect, clockOk, countOk, machinesOk, disconnect, disconnectMany,
  extractable, meiosOf, minable, nextLinkId, perRowOk, rateOk, removeBlock, removeBlocks, setClock, setCollect, setExtractor, setLimits,
  genData, genFuel, genRecipeId, minerToExtractor, setGenerator, setInputRate, setMinerRate, setPerRow, setRecipe, setTier, type BlockSpec,
} from './factory.ts';
import { PIECE_GAP, cleanPlace, validPieceGap } from './map/sizes.ts';
import type { Pt } from './map/geo.ts';
import { exampleChain } from './example.ts';
import { bare, placeBlockIn, placeLigIn, proposeIn, setPlacesIn, type PlaceView } from './views.ts';
import { BELTS, PIPES, encodeShare, historyNew, historyPush, historyRedo, historyUndo } from '../../logic/index.js';

export const PLANNER_STORE = 'sf-balancer:planner';
export { MAX_LINKS, MAX_STAGES };
export const ALT_KEY_MAX = 40;
// Id seguro para chave de objeto.
export const safeId = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const id = v.slice(0, 40);
  return /^[A-Za-z0-9_-]+$/.test(id) && !(id in Object.prototype) ? id : null;
};
export const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// O JSON de um link `#p=` (base64url), ou undefined se não abre.
export function parseShare(str: string): unknown {
  try {
    const bin = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  } catch { return undefined; }
}

// Formato bruto da v1 (fase 1 e 2), só para a migração e o exemplo. locked e pos (do grafo) existiam e são ignorados.
export interface StageV1 { id: StageId; recipe: RecipeId; machines: number; clock: number; perRow: number | null; tiers: Record<string, string> }
export interface ChainV1 {
  v: 1; stages: StageV1[]; links: Link[]; policy: 'represar' | 'sink' | 'extra';
  map?: Record<StageId, MapPlace>; alts?: Record<string, string>; mapGap?: number;
}

export interface History<T> { past: T[]; present: T; future: T[]; limit: number }

export type Action =
  | { type: 'addBlock'; spec: BlockSpec; at: Pt }
  | { type: 'addLinkedBlock'; spec: BlockSpec; port: { block: StageId; item: ItemId; side: 'out' | 'in' }; at: Pt }
  | { type: 'removeBlock'; id: StageId }
  | { type: 'removeBlocks'; ids: StageId[] }   // seleção múltipla: todos num passo só do desfazer
  | { type: 'connect'; from: StageId; to: StageId; item: ItemId }
  | { type: 'disconnect'; linkId: string }
  | { type: 'disconnectMeio'; linkIds: string[] }
  | { type: 'setRecipe'; id: StageId; recipe: RecipeId }
  | { type: 'setLimits'; id: StageId; limits: Limits | null }
  | { type: 'setLayout'; id: StageId; layout: Layout | null }   // null = simple (apaga o campo)
  | { type: 'setClock'; id: StageId; clock: number }
  | { type: 'setPerRow'; id: StageId; perRow: number | null }
  | { type: 'setTier'; id: StageId; side: Side; item: ItemId; tier: string | null }
  | { type: 'setCollect'; id: StageId; item: ItemId; on: boolean }
  | { type: 'setMinerRate'; id: StageId; rate: number }
  | { type: 'setInputRate'; id: StageId; rate: number | null }
  | { type: 'setGenerator'; id: StageId; fuel?: ItemId; count?: number | null; clock?: number }
  | { type: 'setExtractor'; id: StageId; count?: number | null; purity?: Purity; clock?: number; building?: BuildingId }
  | { type: 'minerToExtractor'; id: StageId; building: BuildingId }   // Miner antigo: escolhe o Mk (mesma vazão)
  // Posições: na vista dada (sem ela, a Planta). together: "Mover junto" (o mesmo deslocamento na outra vista); auto e
  // shown: onde as coisas aparecem agora sem posição salva (ver views.ts).
  | { type: 'placeLig'; meio: string; place: LigPlace | null; view?: PlaceView; together?: boolean; shown?: { montar?: LigPlace | null; planta?: LigPlace | null } }
  | { type: 'placeBlock'; id: StageId; place: MapPlace; view?: PlaceView; together?: boolean; auto?: Record<StageId, MapPlace> }
  | { type: 'setPlaces'; places: Record<StageId, MapPlace>; view?: PlaceView; together?: boolean; auto?: Record<StageId, MapPlace> }
  | { type: 'proposeMap'; places: Record<StageId, MapPlace>; view?: PlaceView; auto?: Record<StageId, MapPlace> }   // propor de novo: posições novas e ligações soltas
  | { type: 'setMeioAlt'; meio: string; key: string | null }
  | { type: 'setMapGap'; gap: number | null }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; factory: Factory }
  // Abrir outra fábrica da lista: o histórico começa de novo (desfazer não volta para a outra).
  | { type: 'reset'; factory: Factory };

export const encodeFactory = (f: Factory): string => encodeShare(f);

// Lê v2, ou v1 migrada. Lixo = null.
export function decodeFactory(str: string, data: GameData): Factory | null {
  const raw = parseShare(str);
  if (isObj(raw) && raw.v === 1) return migrateV1(raw, data);
  return cleanFactory(raw, data);
}

// Etapas da v1 como blocos de receita v2, com as máquinas fixadas. Tier na chave `in:`/`out:` + item; a antiga (só o
// item) vai para a saída se o item sai, senão para a entrada.
function stagesV1(raw: unknown, data: GameData): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const r of (Array.isArray(raw) ? raw : []).slice(0, MAX_STAGES)) {
    if (!isObj(r) || typeof r.recipe !== 'string' || !Object.hasOwn(data.recipes, r.recipe)) continue;
    const recipe = data.recipes[r.recipe];
    const has = (side: Side, item: string) => recipe[side].some(f => f.item === item);
    const tiers: Record<string, string> = {};
    if (isObj(r.tiers)) for (const [key, tier] of Object.entries(r.tiers)) {
      const m = key.match(/^(in|out):(.*)$/);
      const item = m ? m[2] : key;
      const side: Side = m ? (m[1] === 'in' ? 'ins' : 'outs') : has('outs', item) ? 'outs' : 'ins';
      if (has(side, item)) tiers[tierKey(side, item)] = tier;
    }
    out.push({
      id: r.id, kind: 'recipe', recipe: r.recipe, clock: r.clock, perRow: r.perRow, tiers,
      limits: { machines: clamp(Math.round(num(r.machines, 1)), 1, MAX_MACHINES) },
    });
  }
  return out;
}

// v1 → v2: as máquinas viram fixadas; cadeado e posição do grafo somem; a política sink/extra vira coleta
// em toda saída sólida ligada (a sobra agora é por porta). O resto passa pela mesma leitura da v2.
export function migrateV1(raw: unknown, data: GameData): Factory | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const f = cleanFactory({ v: 2, blocks: stagesV1(raw.stages, data), links: raw.links, map: raw.map, alts: raw.alts, mapGap: raw.mapGap }, data);
  if (!f || !(raw.policy === 'sink' || raw.policy === 'extra')) return f;
  return {
    ...f,
    blocks: f.blocks.map(b => {
      if (b.kind !== 'recipe') return b;
      const collect = cleanCollect(f.links.filter(l => l.from === b.id).map(l => l.item), data.recipes[b.recipe], data);
      return collect ? { ...b, collect } : b;
    }),
  };
}

export const exampleFactory = (data: GameData): Factory => migrateV1(exampleChain(data), data)!;

// Tiers só na chave nova (`in:`/`out:` + item), de portas da receita e de tier que existe.
function cleanTiers(raw: unknown, recipe: RecipeId, data: GameData): Record<string, string> {
  const r = data.recipes[recipe], out: Record<string, string> = {};
  if (!isObj(raw)) return out;
  for (const side of ['ins', 'outs'] as const) for (const f of r[side]) {
    const k = tierKey(side, f.item), tier = Object.hasOwn(raw, k) ? raw[k] : undefined;
    if (typeof tier === 'string' && (data.items[f.item]?.fluid ? PIPES : BELTS).some((b: { id: string }) => b.id === tier)) out[k] = tier;
  }
  return out;
}

function cleanBlock(r: Record<string, any>, id: StageId, data: GameData): Block | null {
  switch (r.kind) {
    case 'recipe': {
      if (typeof r.recipe !== 'string' || !Object.hasOwn(data.recipes, r.recipe)) return null;
      const rec = data.recipes[r.recipe];
      const limits = cleanLimits(r.limits, rec.ins.map(f => f.item)), layout = cleanLayout(r.layout), collect = cleanCollect(r.collect, rec, data);
      return {
        id, kind: 'recipe', recipe: r.recipe, clock: clamp(num(r.clock, 100), 1, 250), perRow: perRowOk(r.perRow) ? r.perRow : null,
        tiers: cleanTiers(r.tiers, r.recipe, data), ...(limits ? { limits } : {}), ...(collect ? { collect } : {}),
        ...(layout ? { layout } : {}),
      };
    }
    case 'miner':
      return minable(data, r.item) && rateOk(r.rate) ? { id, kind: 'miner', item: r.item, rate: r.rate } : null;
    case 'extractor': {
      if (!extractable(data, r.building, r.item)) return null;
      const purity: Purity = data.extractors[r.building].purity && typeof r.purity === 'string' && Object.hasOwn(PURITY, r.purity) ? r.purity as Purity : 'normal';
      return { id, kind: 'extractor', building: r.building, item: r.item, purity, count: countOk(r.count) ? r.count : null, ...(clockOk(r.clock) && r.clock !== 100 ? { clock: r.clock } : {}) };
    }
    case 'generator': {
      if (!genFuel(data, r.building, r.fuel)) return null;
      const g = { building: r.building as string, fuel: r.fuel as string }, tiers = cleanTiers(r.tiers, genRecipeId(g), genData(data, g)), layout = cleanLayout(r.layout);
      return {
        id, kind: 'generator', ...g, count: machinesOk(r.count) ? r.count : null, ...(clockOk(r.clock) && r.clock !== 100 ? { clock: r.clock } : {}),
        ...(perRowOk(r.perRow) ? { perRow: r.perRow } : {}), ...(Object.keys(tiers).length ? { tiers } : {}), ...(layout ? { layout } : {}),
      };
    }
    case 'input':
      return typeof r.item === 'string' && Object.hasOwn(data.items, r.item) && (r.rate === null || rateOk(r.rate))
        ? { id, kind: 'input', item: r.item, rate: r.rate } : null;
    case 'sink': case 'container': case 'export': return { id, kind: r.kind };
    default: return null;
  }
}

// Fábrica v2 saneada: mesmos limites da fase 2 (blocos, ligações, ids, mapa) e os campos novos.
function cleanFactory(raw: unknown, data: GameData): Factory | null {
  if (!isObj(raw) || raw.v !== 2) return null;
  const seen = new Set<string>(), blocks: Block[] = [];
  for (const r of (Array.isArray(raw.blocks) ? raw.blocks : []).slice(0, MAX_STAGES)) {
    const id = isObj(r) ? safeId(r.id) : null;
    if (!id || seen.has(id)) continue;
    const b = cleanBlock(r, id, data);
    if (!b) continue;
    seen.add(id);
    blocks.push(b);
  }
  let f: Factory = { v: 2, blocks, links: [] };
  for (const l of (Array.isArray(raw.links) ? raw.links : []).slice(0, MAX_LINKS)) {
    if (!isObj(l) || typeof l.item !== 'string') continue;
    const from = safeId(l.from), to = safeId(l.to);
    if (!from || !to || !canConnect(f, data, from, to, l.item).ok) continue;
    let id = safeId(l.id) ?? '';
    if (!id || f.links.some(x => x.id === id)) id = nextLinkId(f);
    const nl: Link = { id, item: l.item, from, to };
    f = { ...f, links: [...f.links, nl] };
  }
  for (const k of ['map', 'montar'] as const) {
    if (!isObj(raw[k])) continue;
    const map: Record<StageId, MapPlace> = {};
    for (const [key, v] of Object.entries(raw[k])) {
      // Montar: só o lugar (o giro é da Planta).
      const id = safeId(key), c = cleanPlace(v), place = c && k === 'montar' ? bare(c) : c;
      if (id && id === key && place && seen.has(id)) map[id] = place;
    }
    if (Object.keys(map).length) f = { ...f, [k]: map };
  }
  const meioIds = new Set(meiosOf(f).map(m => m.id));
  if (isObj(raw.alts)) {
    const alts: Record<string, string> = {};
    for (const [key, v] of Object.entries(raw.alts)) if (meioIds.has(key) && typeof v === 'string' && v.length <= ALT_KEY_MAX) alts[key] = v;
    if (Object.keys(alts).length) f = { ...f, alts };
  }
  if (validPieceGap(raw.mapGap) && raw.mapGap !== PIECE_GAP) f = { ...f, mapGap: raw.mapGap };
  for (const k of ['ligs', 'montarLigs'] as const) {
    if (!isObj(raw[k])) continue;
    const ligs: Record<string, LigPlace> = {};
    for (const [key, v] of Object.entries(raw[k])) {
      const p = cleanLigPlace(v);
      if (meioIds.has(key) && p) ligs[key] = p;
    }
    // montarLigs vale mesmo vazio: a Montar deixou de seguir as ligs.
    if (Object.keys(ligs).length || k === 'montarLigs') f = { ...f, [k]: ligs };
  }
  return f;
}

// Vista de uma ação de posição: sem ela (ou inválida), a Planta.
const view = (v: unknown): PlaceView => (v === 'montar' ? 'montar' : 'planta');

const omitAlts = (f: Factory): Factory => { const { alts: _a, ...rest } = f; return rest; };

function apply(f: Factory, a: Exclude<Action, { type: 'undo' | 'redo' | 'load' | 'reset' }>, d: GameData): Factory {
  switch (a.type) {
    case 'addBlock': return addBlock(f, d, a.spec, a.at);
    case 'addLinkedBlock': return addLinkedBlock(f, d, a.spec, a.port, a.at);
    case 'removeBlock': return removeBlock(f, a.id);
    case 'removeBlocks': return Array.isArray(a.ids) ? removeBlocks(f, a.ids) : f;
    case 'connect': return connect(f, d, a.from, a.to, a.item);
    case 'disconnect': return disconnect(f, a.linkId);
    case 'disconnectMeio': return disconnectMany(f, a.linkIds);
    case 'setRecipe': return setRecipe(f, d, a.id, a.recipe);
    case 'setLimits': {
      // Só as entradas da receita do bloco.
      const b = f.blocks.find(x => x.id === a.id);
      if (b?.kind !== 'recipe') return f;
      return setLimits(f, a.id, cleanLimits(a.limits, d.recipes[b.recipe].ins.map(x => x.item)) ?? null);
    }
    case 'setLayout': {
      const lay = a.layout === null ? null : cleanLayout(a.layout);
      if (a.layout !== null && !lay) return f;
      return { ...f, blocks: f.blocks.map(b => {
        if (b.id !== a.id || (b.kind !== 'recipe' && b.kind !== 'generator')) return b;
        const { layout: _l, ...rest } = b;
        return lay ? { ...rest, layout: lay } : rest;
      }) };
    }
    case 'setClock': return setClock(f, a.id, a.clock);
    case 'setPerRow': return setPerRow(f, a.id, a.perRow);
    case 'setTier': return setTier(f, d, a.id, a.side, a.item, a.tier);
    case 'setCollect': return setCollect(f, d, a.id, a.item, a.on);
    case 'setMinerRate': return setMinerRate(f, a.id, a.rate);
    case 'setInputRate': return setInputRate(f, a.id, a.rate);
    case 'setGenerator': return setGenerator(f, d, a.id, { fuel: a.fuel, count: a.count, clock: a.clock });
    case 'setExtractor': return setExtractor(f, d, a.id, { count: a.count, purity: a.purity, clock: a.clock, building: a.building });
    case 'minerToExtractor': return minerToExtractor(f, d, a.id, a.building);
    case 'placeLig': return placeLigIn(f, view(a.view), a.meio, a.place, { together: a.together === true, shown: a.shown });
    case 'placeBlock': return placeBlockIn(f, view(a.view), a.id, a.place, { together: a.together === true, auto: a.auto });
    case 'setPlaces': return isObj(a.places) ? setPlacesIn(f, view(a.view), a.places, { together: a.together === true, auto: a.auto }) : f;
    // As ligações postas também voltam ao lugar automático: a vista inteira é proposta de novo.
    case 'proposeMap': return isObj(a.places) ? proposeIn(f, view(a.view), a.places, a.auto) : f;
    case 'setMeioAlt': {
      // Como na leitura: só meio que existe e chave curta.
      if (!meiosOf(f).some(m => m.id === a.meio) || (a.key !== null && (typeof a.key !== 'string' || a.key.length > ALT_KEY_MAX))) return f;
      const { [a.meio]: _old, ...rest } = f.alts ?? {};
      if (a.key === null) return Object.keys(rest).length ? { ...f, alts: rest } : omitAlts(f);
      return { ...f, alts: { ...rest, [a.meio]: a.key } };
    }
    case 'setMapGap': {
      // null ou o padrão: sem o campo; valor inválido: nada muda.
      if (a.gap !== null && !validPieceGap(a.gap)) return f;
      const { mapGap: _old, ...rest } = f;
      return a.gap === null || a.gap === PIECE_GAP ? rest : { ...rest, mapGap: a.gap };
    }
  }
}

export function reduce(hist: History<Factory>, action: Action, data: GameData): History<Factory> {
  switch (action.type) {
    case 'undo': return historyUndo(hist);
    case 'redo': return historyRedo(hist);
    case 'load': return historyPush(hist, action.factory);
    case 'reset': return historyNew(action.factory);
    default: return historyPush(hist, apply(hist.present, action, data));
  }
}

// `saved`: a fábrica salva válida, quando o link entra por cima dela.
export function initialFactory(hash: string, saved: string | null, data: GameData): { factory: Factory; fromLink: boolean; saved: Factory | null } {
  const m = hash.match(/^#?p=([^&]*)/);
  const fromHash = m ? decodeFactory(m[1], data) : null;
  const fromSaved = saved ? decodeFactory(saved, data) : null;
  if (fromHash) return { factory: fromHash, fromLink: true, saved: fromSaved };
  return { factory: fromSaved ?? exampleFactory(data), fromLink: false, saved: null };
}

// Histórico da abertura. Link diferente da fábrica salva vira um passo por cima dela (um Desfazer volta).
export function initialHistory(hash: string, saved: string | null, data: GameData): History<Factory> {
  const r = initialFactory(hash, saved, data);
  if (!r.saved) return historyNew(r.factory);
  return historyPush(historyNew(r.saved), r.factory);
}

// Só grava no localStorage depois da primeira edição: aberto por #p=, o link não apaga a fábrica salva.
export const shouldPersist = (initial: History<Factory>, hist: History<Factory>, fromLink: boolean): boolean =>
  !fromLink || hist !== initial;
