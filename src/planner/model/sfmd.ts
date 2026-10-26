// Importar do Satisfactory Modeler (.sfmd): o JSON { Data: [nó, ...] } vira uma fábrica v2. Puro, sem DOM.
// Formato (exemplos do SatisfactorySolver e os parsers do SatisfactorySolver e do SatisfactoryFloorPlanner):
// - Name: o nome da receita no Modeler (inclusive alternativas, sem "Alternate:"), de um recurso ("Iron Ore", "Water",
//   "Crude Oil", "Nitrogen Gas") ou de uma máquina especial ("AWESOME Sink", "Dimensional Depot Uploader", "Outpost").
// - Max: o limite digitado, em número racional ("5", "1/2", "13 1/3"). Para Miner, Oil Extractor e Resource Well
//   Extractor (ShowPpm no game_data do Modeler) é a vazão por minuto; para as receitas comuns (Water Extractor também)
//   é o número de máquinas. Sem Max: receita livre; Miner 60/min, Oil Extractor 120, Resource Well 60 (DefaultMax).
// - Inputs: as ligações, guardadas no consumidor: { peça: [índice do produtor, ...] } ou, no AWESOME Sink,
//   [[ [índice, peça], ... ]]. X/Y: a posição do nó na tela do Modeler.
// - Machine: o Mk do Miner (a vazão já vem no Max). Capacity: a pureza do nó de extração ou a esteira do Sink.
//   ClockSpeed, Parent, Outpost/Title e o que mais vier: ignorados e listados no resumo.
import type { Block, BuildingId, Factory, GameData, ItemId, MapPlace, Purity, RecipeId, StageId } from './types.ts';
import {
  MAX_EXTRACTORS, MAX_LINKS, MAX_MACHINES, MAX_STAGES, MINER_DEFAULT, PURITY, canConnect, connect, minable, portsOf, rateOk,
} from './factory.ts';
import { MAP_GRID, cleanPlace } from './map/sizes.ts';
import { MONTAR_REF } from './map/cards.ts';

export interface SfmdReport {
  blocks: number; links: number;
  // unknown: nome que o builder não conhece; badLink: ligação que não fecha (índice, peça); limit: além do máximo da fábrica.
  skipped: { name: string; reason: 'unknown' | 'badLink' | 'limit' }[];
  asExport: string[];   // geradores e afins que viraram Saída (nome original, sem repetir)
  ignored: string[];    // campos e agrupamentos do Modeler sem equivalente (sem repetir)
}
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
const CONTAINERS = new Set(['dimensional depot uploader', 'dimensional depot', 'storage container', 'industrial storage container', 'fluid buffer', 'industrial fluid buffer']);
// Geradores e o Space Elevator: consomem e não produzem item; viram Saída (a energia fica fora).
const EXPORT_RE = /^(.*(generator|biomass burner|nuclear power plant)|space elevator phase \d+|alien power augmenter)$/;
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

// Bloco de um nó, sem id ainda. used: campos além de READ que ele leu (não entram em ignored).
type NewBlock = Block extends infer B ? (B extends Block ? Omit<B, 'id'> : never) : never;
type Made = { kind: 'block'; block: NewBlock; used: string[]; export?: true } | { kind: 'ignore'; note: string } | { kind: 'unknown' };
function makeBlock(node: Record<string, unknown>, name: string, L: Lookup, d: GameData): Made {
  const k = low(name), max = parseMax(node.Max);
  if (k === 'outpost') return { kind: 'ignore', note: typeof node.Title === 'string' && node.Title ? `Outpost "${node.Title}"` : 'Outpost' };
  if (NO_FLOW.has(k)) return { kind: 'ignore', note: name };
  const ex = EXTRACT[k];
  if (ex) {
    const building = L.extractors.get(low(ex.building)), item = L.items.get(low(ex.item));
    if (!building || !item) return { kind: 'unknown' };
    const pur = d.extractors[building].purity ? purityOf(node.Capacity) : 'normal';
    const rate = ex.ppm ? max ?? ex.def : null;
    const n = rate !== null ? rate / (d.extractors[building].perMin * PURITY[pur]) : max;
    const count = n === null ? null : clamp(Math.ceil(n - 1e-9), 1, MAX_EXTRACTORS);
    return { kind: 'block', block: { kind: 'extractor', building, item, purity: pur, count }, used: d.extractors[building].purity ? ['Capacity'] : [] };
  }
  const ore = L.items.get(k);
  if (ore && minable(d, ore)) {
    // A vazão já considera o Mk do Miner, a pureza e o clock.
    const rate = max !== null && rateOk(max) ? max : MINER_DEFAULT;
    return { kind: 'block', block: { kind: 'miner', item: ore, rate }, used: ['Machine', 'Capacity', 'ClockSpeed'] };
  }
  const recipe = L.recipes.get(k);
  if (recipe) {
    // Máquinas fracionárias (o Modeler aceita): arredonda para cima e baixa o clock, para a mesma vazão.
    let machines: number | null = null, clock = 100;
    if (max !== null) {
      machines = clamp(Math.ceil(max - 1e-9), 1, MAX_MACHINES);
      if (max < machines) clock = clamp(Math.round(max / machines * 1e6) / 1e4, 1, 250);
    }
    return { kind: 'block', block: { kind: 'recipe', recipe, clock, perRow: null, tiers: {}, ...(machines !== null ? { limits: { machines } } : {}) }, used: [] };
  }
  if (SINKS.has(k)) return { kind: 'block', block: { kind: 'sink' }, used: [] };
  if (CONTAINERS.has(k)) return { kind: 'block', block: { kind: 'container' }, used: ['Machine'] };
  if (EXPORT_RE.test(k)) return { kind: 'block', block: { kind: 'export' }, used: [], export: true };
  return { kind: 'unknown' };
}

// Referências de Inputs: { peça: [i, ...] } ou [[ [i, "peça"], ... ]]; [i, "peça", ...resto]: o resto são pontos de curva.
interface Ref { idx: unknown; part: string | null }
function inputRefs(raw: unknown): { refs: Ref[]; extra: boolean } {
  const refs: Ref[] = [];
  let extra = false;
  const walk = (v: unknown, part: string | null, depth: number) => {
    if (refs.length > MAX_LINKS) return;
    if (typeof v === 'number') { refs.push({ idx: v, part }); return; }
    if (!Array.isArray(v) || depth > 4) { extra = true; return; }
    if (typeof v[0] === 'number' && typeof v[1] === 'string') {
      refs.push({ idx: v[0], part: v[1] });
      if (v.length > 2) extra = true;
      return;
    }
    for (const c of v) walk(c, part, depth + 1);
  };
  if (isObj(raw)) for (const [part, v] of Object.entries(raw)) walk(v, part, 0);
  else if (Array.isArray(raw)) walk(raw, null, 0);
  else if (raw !== undefined) extra = true;
  return { refs, extra };
}

// Escala das posições: o cartão da Montar (CARD_W px a 100 %, MONTAR_REF px por metro) contra o nó do Modeler; 2 px
// nossos por px do Modeler: o vão entre colunas (≈ 240 px lá) passa de um cartão e o de linhas (≈ 110 px) cabe um cartão médio.
const PX_PER_MODELER = 2;
// Posições do Modeler em metros na grade de 8 m, a partir de (0, 0), sem dois blocos no mesmo ponto.
export function modelerPlaces(pts: { id: StageId; x: number; y: number }[]): Record<StageId, MapPlace> {
  const s = PX_PER_MODELER / MONTAR_REF;
  const x0 = Math.min(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y));
  const snap = (v: number) => Math.round(v * s / MAP_GRID) * MAP_GRID;
  const taken = new Set<string>(), out: Record<StageId, MapPlace> = {};
  for (const p of pts) {
    const x = snap(p.x - x0);
    let y = snap(p.y - y0);
    while (taken.has(`${x},${y}`)) y += MAP_GRID;
    taken.add(`${x},${y}`);
    const place = cleanPlace({ x, y, rot: 0 });
    if (place) out[p.id] = place;
  }
  return out;
}

export function parseSfmd(text: string, d: GameData): SfmdResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: 'json' }; }
  if (!isObj(raw) || !Array.isArray(raw.Data)) return { error: 'format' };
  const nodes = raw.Data as unknown[];
  // Nenhum nó com nome: não é um arquivo do Modeler.
  if (nodes.length && !nodes.some(n => isObj(n) && typeof n.Name === 'string')) return { error: 'format' };

  const L = lookup(d);
  const report: SfmdReport = { blocks: 0, links: 0, skipped: [], asExport: [], ignored: [] };
  const note = (s: string) => { if (!report.ignored.includes(s)) report.ignored.push(s); };
  for (const k of Object.keys(raw)) if (!TOP_READ.has(k)) note(k);

  const ids: (StageId | null)[] = [], names: string[] = [], pts: { id: StageId; x: number; y: number }[] = [];
  let f: Factory = { v: 2, blocks: [], links: [] };
  nodes.forEach((node, i) => {
    ids.push(null);
    const name = isObj(node) && typeof node.Name === 'string' ? node.Name.slice(0, 80) : '';
    names.push(name || `#${i}`);
    if (!isObj(node) || !name) { report.skipped.push({ name: `#${i}`, reason: 'unknown' }); return; }
    const m = makeBlock(node, name, L, d);
    if (m.kind === 'ignore') { note(m.note); return; }
    if (m.kind === 'unknown') { report.skipped.push({ name, reason: 'unknown' }); return; }
    if (f.blocks.length >= MAX_STAGES) { report.skipped.push({ name, reason: 'limit' }); return; }
    const id = `s${f.blocks.length + 1}`;
    ids[i] = id;
    f = { ...f, blocks: [...f.blocks, { ...m.block, id } as Block] };
    if (m.export && !report.asExport.includes(name)) report.asExport.push(name);
    if (m.export && node.Max !== undefined) note(`Max (${name})`);
    for (const key of Object.keys(node)) if (!READ.has(key) && !m.used.includes(key)) note(key);
    const x = typeof node.X === 'number' && Number.isFinite(node.X) ? node.X : 0, y = typeof node.Y === 'number' && Number.isFinite(node.Y) ? node.Y : 0;
    pts.push({ id, x, y });
  });

  // Ligações: no consumidor, apontando para o índice do produtor. Nó pulado ou ignorado leva as ligações junto, calado.
  nodes.forEach((node, j) => {
    const to = ids[j];
    if (!to || !isObj(node)) return;
    const { refs, extra } = inputRefs(node.Inputs);
    if (extra) note('waypoints');
    for (const r of refs) {
      const ok = typeof r.idx === 'number' && Number.isInteger(r.idx) && r.idx >= 0 && r.idx < nodes.length;
      const from = ok ? ids[r.idx as number] : null;
      const label = `${ok ? names[r.idx as number] : `#${String(r.idx)}`} → ${names[j]}${r.part ? ` (${r.part})` : ''}`;
      if (!ok) { report.skipped.push({ name: label, reason: 'badLink' }); continue; }
      if (!from) continue;
      // Sem a peça (lista solta no Sink): a única saída do produtor.
      const outs = portsOf(f.blocks.find(b => b.id === from)!, d).outs;
      const item = r.part !== null ? L.items.get(low(r.part)) : outs.length === 1 ? outs[0] : undefined;
      const can = item ? canConnect(f, d, from, to, item) : { ok: false as const, reason: 'item' as const };
      if (can.ok) f = connect(f, d, from, to, item!);
      else if (can.reason === 'full') report.skipped.push({ name: label, reason: 'limit' });
      else if (can.reason !== 'dup') report.skipped.push({ name: label, reason: 'badLink' });
    }
  });

  // Posições do Modeler: hoje no mapa das duas vistas (a troca para as posições só da Montar é aqui).
  if (pts.length) f = { ...f, map: modelerPlaces(pts) };
  report.blocks = f.blocks.length;
  report.links = f.links.length;
  return { factory: f, report };
}
