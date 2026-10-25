import type { Chain, GameData, ItemId, Link, RecipeId, Stage, StageId } from './types.ts';
import { perMachine } from './stage.ts';

const E = 1e-9;
const whole = (n: number) => Math.max(1, Math.ceil(n - E));
const nextId = (ids: string[], p: string) => p + (Math.max(0, ...ids.map(id => (id.match(new RegExp(`^${p}(\\d+)$`)) ?? [])[1]).filter(Boolean).map(Number)) + 1);
const get = (c: Chain, id: StageId) => c.stages.find(s => s.id === id);
const edit = (c: Chain, id: StageId, f: (s: Stage) => Stage): Chain => ({ ...c, stages: c.stages.map(s => (s.id === id ? f(s) : s)) });
const ins = (s: Stage, d: GameData) => d.recipes[s.recipe].ins;
const outs = (s: Stage, d: GameData) => d.recipes[s.recipe].outs;

export const nextStageId = (c: Chain): StageId => nextId(c.stages.map(s => s.id), 's');
export const nextLinkId = (c: Chain): string => nextId(c.links.map(l => l.id), 'l');

export function addStage(c: Chain, _d: GameData, recipe: RecipeId, machines: number, pos = { x: 0, y: 0 }): Chain {
  const s: Stage = { id: nextStageId(c), recipe, machines: whole(machines), clock: 100, perRow: null, locked: false, tiers: {}, pos: { ...pos } };
  return { ...c, stages: [...c.stages, s] };
}

export function removeStage(c: Chain, _d: GameData, id: StageId): Chain {
  return { ...c, stages: c.stages.filter(s => s.id !== id), links: c.links.filter(l => l.from !== id && l.to !== id) };
}

// Etapas abaixo de `id`, seguindo as ligações.
function below(c: Chain, id: StageId): Set<StageId> {
  const seen = new Set<StageId>(), todo = [id];
  while (todo.length) {
    const cur = todo.shift()!;
    for (const l of c.links) if (l.from === cur && !seen.has(l.to)) { seen.add(l.to); todo.push(l.to); }
  }
  return seen;
}

export function canLink(c: Chain, d: GameData, from: StageId, to: StageId, item: ItemId):
  { ok: true } | { ok: false; reason: 'self' | 'item' | 'dup' | 'cycle' } {
  if (from === to) return { ok: false, reason: 'self' };
  const a = get(c, from), b = get(c, to);
  if (!a || !b || !outs(a, d).some(f => f.item === item) || !ins(b, d).some(f => f.item === item)) return { ok: false, reason: 'item' };
  if (c.links.some(l => l.from === from && l.to === to && l.item === item)) return { ok: false, reason: 'dup' };
  if (below(c, to).has(from)) return { ok: false, reason: 'cycle' };
  return { ok: true };
}

export function link(c: Chain, d: GameData, from: StageId, to: StageId, item: ItemId): Chain {
  if (!canLink(c, d, from, to, item).ok) return c;
  return { ...c, links: [...c.links, { id: nextLinkId(c), item, from, to }] };
}

export const unlink = (c: Chain, linkId: string): Chain => ({ ...c, links: c.links.filter(l => l.id !== linkId) });

export function demandOf(c: Chain, d: GameData, id: StageId, item: ItemId): number {
  const s = get(c, id);
  return s && ins(s, d).some(f => f.item === item) ? perMachine(s, d, item) * s.machines : 0;
}
export function supplyOf(c: Chain, d: GameData, id: StageId, item: ItemId): number {
  const s = get(c, id);
  return s && outs(s, d).some(f => f.item === item) ? perMachine(s, d, item) * s.machines : 0;
}

export function rawInputs(c: Chain, d: GameData) {
  return c.stages.flatMap(s => ins(s, d).filter(f => !c.links.some(l => l.to === s.id && l.item === f.item))
    .map(f => ({ stage: s.id, item: f.item, total: perMachine(s, d, f.item) * s.machines })));
}
export function products(c: Chain, d: GameData) {
  return c.stages.flatMap(s => outs(s, d).filter(f => !c.links.some(l => l.from === s.id && l.item === f.item))
    .map(f => ({ stage: s.id, item: f.item, total: perMachine(s, d, f.item) * s.machines })));
}

// Ligações do mesmo item que se tocam (produtor ou consumidor em comum).
function group(c: Chain, l0: Link): Link[] {
  const g = new Set([l0]);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of c.links) if (l.item === l0.item && !g.has(l) && [...g].some(x => x.from === l.from || x.to === l.to)) { g.add(l); grew = true; }
  }
  return [...g];
}

export function linkFlow(c: Chain, d: GameData, linkId: string): number {
  const l = c.links.find(x => x.id === linkId);
  if (!l) return 0;
  const g = group(c, l);
  const sum = (ids: StageId[], f: (id: StageId) => number) => [...new Set(ids)].reduce((s, id) => s + f(id), 0);
  const sup = sum(g.map(x => x.from), id => supplyOf(c, d, id, l.item));
  const dem = sum(g.map(x => x.to), id => demandOf(c, d, id, l.item));
  if (sup <= E || dem <= E) return 0;
  return Math.min(sup, dem) * (supplyOf(c, d, l.from, l.item) / sup) * (demandOf(c, d, l.to, l.item) / dem);
}

// Ordem topológica: produtores antes dos consumidores.
function topo(c: Chain): StageId[] {
  const deg = new Map(c.stages.map(s => [s.id, 0]));
  for (const l of c.links) deg.set(l.to, (deg.get(l.to) ?? 0) + 1);
  const out: StageId[] = [], todo = c.stages.filter(s => !deg.get(s.id)).map(s => s.id);
  while (todo.length) {
    const id = todo.shift()!;
    out.push(id);
    for (const l of c.links) if (l.from === id) { deg.set(l.to, deg.get(l.to)! - 1); if (!deg.get(l.to)) todo.push(l.to); }
  }
  return out;
}

// 1) descendentes escalam por `factor` (travado corta o ramo); 2) ancestrais seguem a demanda; 3) o resto fica.
export function rebalance(c: Chain, d: GameData, changed: StageId, factor: number): Chain {
  const n = new Map(c.stages.map(s => [s.id, s.machines]));
  const locked = (id: StageId) => !!get(c, id)?.locked;
  const scaled = new Set<StageId>(), down = [changed];
  while (down.length) {
    const id = down.shift()!;
    for (const l of c.links) if (l.from === id && !scaled.has(l.to) && l.to !== changed && !locked(l.to)) {
      scaled.add(l.to); n.set(l.to, whole(n.get(l.to)! * factor)); down.push(l.to);
    }
  }
  const fixed = new Set([changed, ...scaled]), up = new Set<StageId>(), todo = [...fixed];
  while (todo.length) {
    const id = todo.shift()!;
    for (const l of c.links) if (l.to === id && !fixed.has(l.from) && !up.has(l.from) && !locked(l.from)) { up.add(l.from); todo.push(l.from); }
  }
  let cur: Chain = { ...c, stages: c.stages.map(s => (n.get(s.id) === s.machines ? s : { ...s, machines: n.get(s.id)! })) };
  for (const id of topo(c).reverse()) {
    if (!up.has(id)) continue;
    const s = get(cur, id)!;
    let need = 0;
    for (const f of outs(s, d)) {
      let dem = 0;
      for (const l of c.links) if (l.from === id && l.item === f.item) {
        const prods = c.links.filter(x => x.to === l.to && x.item === f.item).map(x => x.from);
        const before = prods.map(p => supplyOf(c, d, p, f.item)), tot = before.reduce((a, b) => a + b, 0);
        const part = tot > E ? supplyOf(c, d, id, f.item) / tot : 1 / prods.length;
        dem += demandOf(cur, d, l.to, f.item) * part;
      }
      need = Math.max(need, dem / perMachine(s, d, f.item));
    }
    cur = edit(cur, id, x => ({ ...x, machines: whole(need) }));
  }
  return cur;
}

export function setMachines(c: Chain, d: GameData, id: StageId, n: number): Chain {
  const s = get(c, id);
  if (!s) return c;
  const m = whole(n);
  return rebalance(edit(c, id, x => ({ ...x, machines: m })), d, id, m / s.machines);
}

export function setRecipe(c: Chain, d: GameData, id: StageId, recipe: RecipeId): Chain {
  const r = d.recipes[recipe];
  const keep = (l: Link) => (l.from !== id || r.outs.some(f => f.item === l.item)) && (l.to !== id || r.ins.some(f => f.item === l.item));
  const items = new Set([...r.ins, ...r.outs].map(f => f.item));
  const c2 = edit({ ...c, links: c.links.filter(keep) }, id, s =>
    ({ ...s, recipe, tiers: Object.fromEntries(Object.entries(s.tiers).filter(([k]) => items.has(k))) }));
  return rebalance(c2, d, id, 1);
}

export const setClock = (c: Chain, id: StageId, clock: number): Chain => edit(c, id, s => ({ ...s, clock }));
export const setPerRow = (c: Chain, id: StageId, perRow: number | null): Chain => edit(c, id, s => ({ ...s, perRow }));
export const setTier = (c: Chain, id: StageId, item: ItemId, tier: string): Chain => edit(c, id, s => ({ ...s, tiers: { ...s.tiers, [item]: tier } }));
export const setLocked = (c: Chain, id: StageId, locked: boolean): Chain => edit(c, id, s => ({ ...s, locked }));
export const moveStage = (c: Chain, id: StageId, pos: { x: number; y: number }): Chain => edit(c, id, s => ({ ...s, pos: { ...pos } }));
export const setPolicy = (c: Chain, policy: Chain['policy']): Chain => ({ ...c, policy });
