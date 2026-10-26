// Importar do Satisfactory Modeler (.sfmd): o JSON { Data: [nó, ...] } vira uma fábrica v2. Puro, sem DOM.
// Formato (exemplos do SatisfactorySolver e os parsers do SatisfactorySolver e do SatisfactoryFloorPlanner):
// - Name: o nome da receita no Modeler (inclusive alternativas, sem "Alternate:"), de um recurso ("Iron Ore", "Water",
//   "Crude Oil", "Nitrogen Gas") ou de uma máquina especial ("AWESOME Sink", "Dimensional Depot Uploader", "Outpost").
// - Max: o limite digitado, em número racional ("5", "1/2", "13 1/3"). Para Miner, Oil Extractor e Resource Well
//   Extractor (ShowPpm no game_data do Modeler) é a vazão por minuto; para as receitas comuns (Water Extractor também)
//   é o número de máquinas. Sem Max: receita livre; Miner 60/min, Oil Extractor 120, Resource Well 60 (DefaultMax).
// - Inputs: as ligações, guardadas no consumidor: { peça: [índice do produtor, ...] } ou, no AWESOME Sink,
//   [[ [índice, peça], ... ]]. Cada referência é o índice solto ou [índice, peça ou nº da saída do produtor, ...pontos
//   de curva]. X/Y: a posição do nó na tela do Modeler.
// - Splurger (e os de prioridade) e Storage Container de onde alguém puxa só passam item adiante: viram ligação direta
//   de quem entra neles para quem puxa deles. Container sem entrada nenhuma é o que vem de fora (o "-675" do Modeler):
//   vira um bloco Entrada sem limite no lugar dele, um por item puxado.
// - Machine: o Mk do Miner (a vazão já vem no Max). Capacity: a pureza do nó de extração ou a esteira do Sink.
//   ClockSpeed: o clock das máquinas da receita (no Miner e nos extratores de vazão já vem no Max). Parent,
//   Outpost/Title e o que mais vier: ignorados e listados no resumo.
import { isSource, type Block, type BuildingId, type Factory, type GameData, type ItemId, type MapPlace, type Purity, type RecipeId, type StageId } from './types.ts';
import {
  MAX_EXTRACTORS, MAX_LINKS, MAX_MACHINES, MAX_RATE, MAX_STAGES, MINER_DEFAULT, PURITY, canConnect, connect, minable, portsOf,
} from './factory.ts';
import { MAP_GRID, cleanPlace } from './map/sizes.ts';
import { CARD_MAX_M_PER_PX, MONTAR_REF, cardSize } from './map/cards.ts';

export interface SfmdReport {
  blocks: number; links: number;
  // unknown: nome que o builder não conhece; badLink: ligação que não fecha (índice, peça); limit: além do máximo da fábrica.
  skipped: { name: string; reason: 'unknown' | 'badLink' | 'limit' }[];
  asExport: string[];   // geradores e afins que viraram Saída (nome original, sem repetir)
  ignored: SfmdIgnored[];    // o que o Modeler tem e aqui não tem equivalente (sem repetir); o texto em volta é da interface
  adjusted: SfmdAdjusted[];  // números que mudaram na importação (arredondados para cima ou cortados no limite)
}
// field: campo de nó; setting: chave do topo do arquivo; outpost: agrupamento (name = Title, '' sem título); max: o Max de
// um nó que virou Saída; noFlow: prédio sem item (Geothermal…); waypoints: pontos de curva das ligações (name '').
// name: sempre o nome cru do Modeler.
// relay: Splurger/Container que virou ligação direta; emptyRelay: Container sem entrada nenhuma, que virou Entrada.
export interface SfmdIgnored { kind: 'field' | 'setting' | 'outpost' | 'max' | 'noFlow' | 'waypoints' | 'relay' | 'emptyRelay'; name: string }
// extractorRate: vazão pedida que não fecha em extratores inteiros (count × per = total); extractorCount: contagem
// fracionária arredondada; machines: máquinas fracionárias arredondadas para cima com o clock baixado (a mesma vazão);
// clamp: acima do máximo da ferramenta (máquinas, extratores ou vazão).
export type SfmdAdjusted =
  | { kind: 'machines'; name: string; asked: number; count: number; clock: number }
  | { kind: 'extractorRate'; name: string; rate: number; count: number; total: number }
  | { kind: 'extractorCount'; name: string; asked: number; count: number }
  | { kind: 'clamp'; name: string; asked: number; max: number };
export type SfmdResult = { factory: Factory; report: SfmdReport } | { error: 'json' | 'format' };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const low = (s: string) => s.trim().toLowerCase();
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Racional do Modeler: parcelas separadas por espaço, cada uma inteira, decimal ou a/b ("13 1/3" = 13 + 1/3). > 0, senão null.
export function parseMax(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== 'string') return null;
  const parts = v.trim().split(/\s+/);
  if (!parts[0] || parts.length > 3) return null;
  let sum = 0;
  for (const p of parts) {
    const m = p.match(/^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/);
    if (!m) return null;
    const den = m[2] === undefined ? 1 : Number(m[2]);
    if (!den) return null;
    sum += Number(m[1]) / den;
  }
  return Number.isFinite(sum) && sum > 0 ? sum : null;
}

// Nomes do Modeler que não batem com o do jogo (game_data do Modeler × Docs).
const RECIPE_ALIAS: Record<string, RecipeId> = {
  'screw': 'Recipe_Screw_C', 'cast screw': 'Recipe_Alternate_Screw_C', 'steel screw': 'Recipe_Alternate_Screw_2_C',
  'turbo rifle ammo': 'Recipe_CartridgeChaos_C', 'packaged turbo rifle ammo': 'Recipe_CartridgeChaos_Packaged_C',
};
const ITEM_ALIAS: Record<string, ItemId> = { 'screw': 'Desc_IronScrew_C' };
// Recursos de extrator: nome no Modeler → prédio e item (pelo nome no jogo); ppm: o Max é vazão, não contagem.
const EXTRACT: Record<string, { building: string; item: string; ppm: boolean; def: number | null }> = {
  'water': { building: 'Water Extractor', item: 'Water', ppm: false, def: null },
  'crude oil': { building: 'Oil Extractor', item: 'Crude Oil', ppm: true, def: 120 },
  'nitrogen gas': { building: 'Resource Well Extractor', item: 'Nitrogen Gas', ppm: true, def: 60 },
  'well water': { building: 'Resource Well Extractor', item: 'Water', ppm: true, def: 60 },
  'oil well': { building: 'Resource Well Extractor', item: 'Crude Oil', ppm: true, def: 60 },
};
const SINKS = new Set(['awesome sink']);
// Peças que só passam item adiante (Splurger, Priority Splitter/Merger/Splurger).
const isRelayName = (k: string) => k.includes('splurger') || /^priority (splitter|merger)$/.test(k);
const CONTAINERS = new Set(['dimensional depot uploader', 'dimensional depot', 'storage container', 'industrial storage container', 'fluid buffer', 'industrial fluid buffer']);
// Space Elevator e o Alien Power Augmenter (e gerador que não se reconhece): consomem e não produzem item; viram Saída.
const EXPORT_RE = /^(.*(generator|biomass burner|nuclear power plant)|space elevator phase \d+|alien power augmenter)$/;
// Gerador do Modeler: o prédio pelo nome ("Fuel Generator", "Turbofuel Generator", "Coal Generator", "Nuclear Power
// Plant"…) e o combustível pela peça que chega nele (Inputs), ou pelo nome sem "Generator" ("Turbofuel" -> Turbofuel).
function generatorOf(node: Record<string, unknown>, k: string, L: Lookup, d: GameData): { building: BuildingId; fuel: ItemId } | null {
  if (!/generator|biomass burner|nuclear power plant/.test(k) || !d.generators) return null;
  const want = /nuclear|uranium|plutonium|ficsonium/.test(k) ? 'nuclear' : /coal|coke/.test(k) ? 'coal' : /biomass|leaves|wood|mycelia/.test(k) ? 'biomass' : 'fuel';
  const g = Object.values(d.generators).find(x => low(x.name).includes(want === 'fuel' ? 'fuel-powered' : want));
  if (!g) return null;
  const keys = isObj(node.Inputs) ? Object.keys(node.Inputs) : [];
  const byInput = keys.map(x => L.items.get(low(x))).find(it => it && g.fuels.some(f => f.item === it));
  const byName = L.items.get(k.replace(/s*(generator|power plant|burner)$/, '').trim());
  const fuel = byInput ?? (byName && g.fuels.some(f => f.item === byName) ? byName : g.fuels[0]?.item);
  return fuel ? { building: g.id, fuel } : null;
}

// Sem fluxo de item nenhum: não vira bloco.
const NO_FLOW = new Set(['geothermal generator', 'resource well pressurizer']);
// Campos que a importação lê (o resto do nó entra em ignored).
const READ = new Set(['Name', 'X', 'Y', 'Max', 'Inputs']);
const TOP_READ = new Set(['Version', 'Zoom', 'Data', 'Outpost']);

interface Lookup { recipes: Map<string, RecipeId>; items: Map<string, ItemId>; extractors: Map<string, BuildingId> }
function lookup(d: GameData): Lookup {
  const recipes = new Map<string, RecipeId>(), items = new Map<string, ItemId>(), extractors = new Map<string, BuildingId>();
  // Nome repetido no jogo (só o Turbo Rifle Ammo): o alias decide; senão o primeiro pelo id.
  for (const id of Object.keys(d.recipes).sort()) { const k = low(d.recipes[id].name); if (!recipes.has(k)) recipes.set(k, id); }
  for (const [k, id] of Object.entries(RECIPE_ALIAS)) if (Object.hasOwn(d.recipes, id)) recipes.set(k, id);
  for (const id of Object.keys(d.items).sort()) { const k = low(d.items[id].name); if (!items.has(k)) items.set(k, id); }
  for (const [k, id] of Object.entries(ITEM_ALIAS)) if (Object.hasOwn(d.items, id)) items.set(k, id);
  for (const id of Object.keys(d.extractors)) extractors.set(low(d.extractors[id].name), id);
  return { recipes, items, extractors };
}

const purityOf = (cap: unknown): Purity => {
  const k = typeof cap === 'string' ? low(cap) : '';
  return k === 'impure' || k === 'pure' ? k : 'normal';
};

// Bloco de um nó, sem id ainda. used: campos além de READ que ele leu (não entram em ignored); adj: números que mudaram.
type NewBlock = Block extends infer B ? (B extends Block ? Omit<B, 'id'> : never) : never;
type Made = { kind: 'block'; block: NewBlock; used: string[]; adj: SfmdAdjusted[]; export?: true } | { kind: 'ignore'; note: SfmdIgnored } | { kind: 'unknown' };
const EPS = 1e-9;
// Inteiro para cima, até `hi`; o que não é o pedido vai em adj.
function upTo(asked: number, hi: number, name: string, adj: SfmdAdjusted[]): number {
  if (asked > hi + EPS) { adj.push({ kind: 'clamp', name, asked, max: hi }); return hi; }
  return clamp(Math.ceil(asked - EPS), 1, hi);
}
function makeBlock(node: Record<string, unknown>, name: string, L: Lookup, d: GameData): Made {
  const k = low(name), max = parseMax(node.Max), adj: SfmdAdjusted[] = [];
  if (k === 'outpost') return { kind: 'ignore', note: { kind: 'outpost', name: typeof node.Title === 'string' ? node.Title.slice(0, 80) : '' } };
  if (NO_FLOW.has(k)) return { kind: 'ignore', note: { kind: 'noFlow', name } };
  const ex = EXTRACT[k];
  if (ex) {
    const building = L.extractors.get(low(ex.building)), item = L.items.get(low(ex.item));
    if (!building || !item) return { kind: 'unknown' };
    const pur = d.extractors[building].purity ? purityOf(node.Capacity) : 'normal';
    // ClockSpeed: o clock de cada extrator (o Max de vazão já vem com ele: 600 de petróleo = nó puro a 250 %).
    const cs = clamp(parseMax(node.ClockSpeed) ?? 100, 1, 250), clock = Math.round(cs * 1e4) / 1e4;
    const per = d.extractors[building].perMin * PURITY[pur] * clock / 100;
    let count: number | null = null;
    if (ex.ppm) {
      // Vazão: extratores inteiros que dão pelo menos o pedido; sobrando, diz quanto dá.
      const rate = max ?? ex.def!;
      count = upTo(rate / per, MAX_EXTRACTORS, name, adj);
      if (!adj.length && count * per > rate + EPS) adj.push({ kind: 'extractorRate', name, rate, count, total: count * per });
    } else if (max !== null) {
      count = upTo(max, MAX_EXTRACTORS, name, adj);
      if (!adj.length && count > max + EPS) adj.push({ kind: 'extractorCount', name, asked: max, count });
    }
    return {
      kind: 'block', block: { kind: 'extractor', building, item, purity: pur, count, ...(clock !== 100 ? { clock } : {}) },
      used: d.extractors[building].purity ? ['Capacity', 'ClockSpeed'] : ['ClockSpeed'], adj,
    };
  }
  const ore = L.items.get(k);
  if (ore && minable(d, ore)) {
    // A vazão já considera o Mk do Miner, a pureza e o clock.
    let rate = max ?? MINER_DEFAULT;
    if (rate > MAX_RATE) { adj.push({ kind: 'clamp', name, asked: rate, max: MAX_RATE }); rate = MAX_RATE; }
    return { kind: 'block', block: { kind: 'miner', item: ore, rate }, used: ['Machine', 'Capacity', 'ClockSpeed'], adj };
  }
  const recipe = L.recipes.get(k);
  if (recipe) {
    // ClockSpeed: o clock de cada máquina (100 sem ele). Máquinas fracionárias (o Modeler aceita): arredonda para cima
    // e baixa o clock, para a mesma vazão.
    const cs = clamp(parseMax(node.ClockSpeed) ?? 100, 1, 250);
    let machines: number | null = null, clock = Math.round(cs * 1e4) / 1e4;
    if (max !== null) {
      machines = upTo(max, MAX_MACHINES, name, adj);
      if (max < machines - EPS) {
        clock = clamp(Math.round(cs * max / machines * 1e4) / 1e4, 1, 250);
        adj.push({ kind: 'machines', name, asked: max, count: machines, clock });
      }
    }
    return { kind: 'block', block: { kind: 'recipe', recipe, clock, perRow: null, tiers: {}, ...(machines !== null ? { limits: { machines } } : {}) }, used: ['ClockSpeed'], adj };
  }
  if (SINKS.has(k)) return { kind: 'block', block: { kind: 'sink' }, used: [], adj };
  if (CONTAINERS.has(k)) return { kind: 'block', block: { kind: 'container' }, used: ['Machine'], adj };
  const gen = generatorOf(node, k, L, d);
  if (gen) {
    // Gerador: Max é quantos (fracionário arredonda para cima e baixa o clock, a mesma potência), ClockSpeed o clock.
    const cs = clamp(parseMax(node.ClockSpeed) ?? 100, 1, 250);
    let count: number | null = null, clock = Math.round(cs * 1e4) / 1e4;
    if (max !== null) {
      count = upTo(max, MAX_MACHINES, name, adj);
      if (max < count - EPS) { clock = clamp(Math.round(cs * max / count * 1e4) / 1e4, 1, 250); adj.push({ kind: 'machines', name, asked: max, count, clock }); }
    }
    return { kind: 'block', block: { kind: 'generator', ...gen, count, ...(clock !== 100 ? { clock } : {}) }, used: ['ClockSpeed'], adj };
  }
  if (EXPORT_RE.test(k)) return { kind: 'block', block: { kind: 'export' }, used: [], adj, export: true };
  return { kind: 'unknown' };
}

// Referências de Inputs: { peça: [ref, ...] } ou [[ref, ...]]; cada ref é o índice ou [índice, peça | nº da saída do
// produtor, ...pontos de curva]. Os pontos de curva (e o que mais vier) só marcam `extra`.
interface Ref { idx: unknown; part: string | null; out: number | null }
function inputRefs(raw: unknown): { refs: Ref[]; extra: boolean } {
  const refs: Ref[] = [];
  let extra = false;
  const ref = (v: unknown[], part: string | null) => {
    const r: Ref = { idx: v[0], part, out: null };
    v.slice(1).forEach((x, i) => {
      if (typeof x === 'string') r.part = x;
      else if (i === 0 && typeof x === 'number') r.out = x;
      else extra = true;
    });
    refs.push(r);
  };
  // Dentro de uma lista: número é ref, lista começando por número também; lista de listas desce um nível.
  const walk = (v: unknown, part: string | null, depth: number) => {
    if (!Array.isArray(v) || depth > 4) { extra = true; return; }
    for (const c of v) {
      if (refs.length > MAX_LINKS) return;
      if (typeof c === 'number') refs.push({ idx: c, part, out: null });
      else if (Array.isArray(c) && typeof c[0] === 'number') ref(c, part);
      else walk(c, part, depth + 1);
    }
  };
  if (isObj(raw)) for (const [part, v] of Object.entries(raw)) walk(v, part, 0);
  else if (Array.isArray(raw)) walk(raw, null, 0);
  else if (raw !== undefined) extra = true;
  return { refs, extra };
}

// Escala das posições: o cartão da Montar (CARD_W px a 100 %, MONTAR_REF px por metro) contra o nó do Modeler; 2 px
// nossos por px do Modeler: o vão entre colunas (≈ 240 px lá) passa de um cartão e o de linhas (≈ 110 px) cabe um cartão médio.
const PX_PER_MODELER = 2;
// Folga entre cartões (m).
const GAP = MAP_GRID, MAX_SPREAD = 3;
// Posições do Modeler em metros na grade de 8 m, a partir de (0, 0). w/h: o cartão da Montar a 100 % (px), que no mundo
// chega a w × CARD_MAX_M_PER_PX (de longe). Primeiro o desenho todo cresce por igual (até MAX_SPREAD vezes) o bastante
// para cada par de cartões ficar lado a lado ou um em cima do outro sem se tocar, então o desenho relativo do Modeler fica;
// o que ainda cair em cima de outro (nós empilhados no Modeler, arredondamento da grade) desce na grade até ficar livre,
// de cima para baixo.
export function modelerPlaces(pts: { id: StageId; x: number; y: number; w?: number; h?: number }[]): Record<StageId, MapPlace> {
  const s0 = PX_PER_MODELER / MONTAR_REF;
  const size = (p: { w?: number; h?: number }) => ({ w: (p.w ?? 0) * CARD_MAX_M_PER_PX, h: (p.h ?? 0) * CARD_MAX_M_PER_PX });
  let k = 1;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], dx = (b.x - a.x) * s0, dy = (b.y - a.y) * s0;
      const needX = dx ? (size(dx > 0 ? a : b).w + GAP) / Math.abs(dx) : Infinity;
      const needY = dy ? (size(dy > 0 ? a : b).h + GAP) / Math.abs(dy) : Infinity;
      k = Math.max(k, Math.min(needX, needY, MAX_SPREAD));
    }
  }
  const s = s0 * k;
  const x0 = Math.min(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y));
  const snap = (v: number) => Math.round(v * s / MAP_GRID) * MAP_GRID;
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [], out: Record<StageId, MapPlace> = {};
  const order = pts.map(p => ({ p, x: snap(p.x - x0), y: snap(p.y - y0) })).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const { p, x, y: y1 } of order) {
    const { w, h } = size(p);
    const box = (y: number) => ({ x0: x - GAP / 2, y0: y - GAP / 2, x1: x + w + GAP / 2, y1: y + h + GAP / 2 });
    const hits = (b: ReturnType<typeof box>) => placed.some(q => b.x0 < q.x1 && q.x0 < b.x1 && b.y0 < q.y1 && q.y0 < b.y1);
    let y = y1;
    // Sem tamanho (w = h = 0) a caixa é só a folga: dois no mesmo ponto continuam sem caber.
    while (hits(box(y))) y += MAP_GRID;
    placed.push(box(y));
    const place = cleanPlace({ x, y, rot: 0 });
    if (place) out[p.id] = place;
  }
  return out;
}

// O cartão da Montar de um bloco importado (px a 100 %), como o cardSpec: receita pelos itens da receita, Miner e
// extrator com uma saída, e as sobras com uma entrada por item que chega pelas ligações.
function importedCard(f: Factory, b: Block, d: GameData): { w: number; h: number } {
  const uniq = (xs: string[]) => new Set(xs).size;
  if (b.kind === 'recipe') { const r = d.recipes[b.recipe]; return cardSize('recipe', uniq(r.ins.map(x => x.item)), uniq(r.outs.map(x => x.item))); }
  if (isSource(b)) return cardSize('marker', 0, 1);
  return cardSize('marker', uniq(f.links.filter(l => l.to === b.id).map(l => l.item)), 0);
}

// Posição do nó na tela do Modeler (0 sem número).
const xyOf = (n: unknown): [number, number] => {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return isObj(n) ? [num(n.X), num(n.Y)] : [0, 0];
};
// Entradas do mesmo Container, uma embaixo da outra (px do Modeler).
const INPUT_STEP = 100;

export function parseSfmd(text: string, d: GameData): SfmdResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: 'json' }; }
  if (!isObj(raw) || !Array.isArray(raw.Data)) return { error: 'format' };
  const nodes = raw.Data as unknown[];
  // Nenhum nó com nome: não é um arquivo do Modeler.
  if (nodes.length && !nodes.some(n => isObj(n) && typeof n.Name === 'string')) return { error: 'format' };

  const L = lookup(d);
  const report: SfmdReport = { blocks: 0, links: 0, skipped: [], asExport: [], ignored: [], adjusted: [] };
  const note = (kind: SfmdIgnored['kind'], name: string) => {
    const n = name.slice(0, 80);
    if (!report.ignored.some(x => x.kind === kind && x.name === n)) report.ignored.push({ kind, name: n });
  };
  for (const k of Object.keys(raw)) if (!TOP_READ.has(k)) note('setting', k);

  // Referências de cada nó e quem só passa item adiante: Splurger, ou Container de onde alguém puxa.
  const refsOf = nodes.map(n => (isObj(n) ? inputRefs(n.Inputs) : { refs: [], extra: false }));
  const consumed = new Set(refsOf.flatMap(r => r.refs.map(x => x.idx)));
  const relay = nodes.map((n, i) => {
    if (!isObj(n) || typeof n.Name !== 'string') return false;
    const k = low(n.Name);
    return isRelayName(k) || (CONTAINERS.has(k) && consumed.has(i));
  });

  const ids: (StageId | null)[] = [], names: string[] = [], pts: { id: StageId; x: number; y: number }[] = [];
  let f: Factory = { v: 2, blocks: [], links: [] };
  nodes.forEach((node, i) => {
    ids.push(null);
    const name = isObj(node) && typeof node.Name === 'string' ? node.Name.slice(0, 80) : '';
    names.push(name || `#${i}`);
    if (!isObj(node) || !name) { report.skipped.push({ name: `#${i}`, reason: 'unknown' }); return; }
    if (relay[i]) { note(refsOf[i].refs.length ? 'relay' : 'emptyRelay', name); return; }
    const m = makeBlock(node, name, L, d);
    if (m.kind === 'ignore') { note(m.note.kind, m.note.name); return; }
    if (m.kind === 'unknown') { report.skipped.push({ name, reason: 'unknown' }); return; }
    if (f.blocks.length >= MAX_STAGES) { report.skipped.push({ name, reason: 'limit' }); return; }
    const id = `s${f.blocks.length + 1}`;
    ids[i] = id;
    f = { ...f, blocks: [...f.blocks, { ...m.block, id } as Block] };
    if (m.export && !report.asExport.includes(name)) report.asExport.push(name);
    if (m.export && node.Max !== undefined) note('max', name);
    for (const key of Object.keys(node)) if (!READ.has(key) && !m.used.includes(key)) note('field', key);
    report.adjusted.push(...m.adj);
    const [x, y] = xyOf(node);
    pts.push({ id, x, y });
  });

  const inputAt = new Map<string, StageId>();   // `${índice do Container}|${item}` -> a Entrada criada
  const validIdx = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < nodes.length;
  const itemOf = (part: string | null) => (part !== null ? L.items.get(low(part)) : undefined);
  // O item que sai de um bloco por uma ref: a peça, o nº da saída ou a única saída; sem nada disso, `want` se ele faz.
  const outItem = (from: StageId, r: Ref, want?: ItemId): ItemId | undefined => {
    const outs = portsOf(f.blocks.find(b => b.id === from)!, d).outs;
    const it = r.part !== null ? itemOf(r.part) : r.out !== null ? outs[r.out] : outs.length === 1 ? outs[0] : undefined;
    return it ?? (want && outs.includes(want) ? want : undefined);
  };
  // Os produtores de verdade por trás de um Splurger/Container (descendo pelos encadeados), só do item `want` se dado.
  const sources = (i: number, want: ItemId | undefined, seen: Set<number>): { from: StageId; item: ItemId }[] => {
    const out: { from: StageId; item: ItemId }[] = [];
    for (const r of refsOf[i].refs) {
      if (!validIdx(r.idx)) continue;
      const it = itemOf(r.part);
      if (it && want && it !== want) continue;
      if (relay[r.idx]) {
        if (!seen.has(r.idx)) out.push(...sources(r.idx, want ?? it, new Set([...seen, r.idx])));
        continue;
      }
      const from = ids[r.idx];
      const item = from ? outItem(from, r, want) : undefined;
      if (from && item && (!want || item === want)) out.push({ from, item });
    }
    return out;
  };

  // Ligações: no consumidor, apontando para o índice do produtor. Nó pulado ou ignorado leva as ligações junto, calado.
  nodes.forEach((node, j) => {
    const to = ids[j];
    if (!to || !isObj(node)) return;
    const { refs, extra } = refsOf[j];
    if (extra) note('waypoints', '');
    for (const r of refs) {
      const ok = validIdx(r.idx);
      const label = `${ok ? names[r.idx as number] : `#${String(r.idx)}`} → ${names[j]}${r.part ? ` (${r.part})` : ''}`;
      if (!ok) { report.skipped.push({ name: label, reason: 'badLink' }); continue; }
      const i = r.idx as number;
      let pairs: { from: StageId; item: ItemId | undefined }[];
      if (relay[i]) {
        if (!refsOf[i].refs.length) {
          // Container sem entrada: uma Entrada sem limite por item, no lugar dele (um item embaixo do outro).
          const item = itemOf(r.part);
          if (!item) { report.skipped.push({ name: label, reason: 'badLink' }); continue; }
          let from = inputAt.get(`${i}|${item}`);
          if (!from) {
            if (f.blocks.length >= MAX_STAGES) { report.skipped.push({ name: label, reason: 'limit' }); continue; }
            from = `s${f.blocks.length + 1}`;
            const k = [...inputAt.keys()].filter(x => x.startsWith(`${i}|`)).length, [x, y] = xyOf(nodes[i]);
            inputAt.set(`${i}|${item}`, from);
            f = { ...f, blocks: [...f.blocks, { id: from, kind: 'input', item, rate: null }] };
            pts.push({ id: from, x, y: y + k * INPUT_STEP });
          }
          pairs = [{ from, item }];
        } else {
          pairs = sources(i, itemOf(r.part), new Set([i]));
          if (!pairs.length) { report.skipped.push({ name: label, reason: 'badLink' }); continue; }
        }
      } else {
        const from = ids[i];
        if (!from) continue;
        // Sem a peça (lista solta no Sink): o nº da saída ou a única saída do produtor.
        pairs = [{ from, item: outItem(from, r) }];
      }
      for (const { from, item } of pairs) {
        const can = item ? canConnect(f, d, from, to, item) : { ok: false as const, reason: 'item' as const };
        if (can.ok) f = connect(f, d, from, to, item!);
        else if (can.reason === 'full') report.skipped.push({ name: label, reason: 'limit' });
        else if (can.reason !== 'dup') report.skipped.push({ name: label, reason: 'badLink' });
      }
    }
  });

  // Posições do Modeler só na Montar; a Planta (`map` vazio) fica com a proposta automática.
  if (pts.length) {
    const byId = new Map(f.blocks.map(b => [b.id, b]));
    f = { ...f, montar: modelerPlaces(pts.map(p => ({ ...p, ...importedCard(f, byId.get(p.id)!, d) }))) };
  }
  report.blocks = f.blocks.length;
  report.links = f.links.length;
  return { factory: f, report };
}
