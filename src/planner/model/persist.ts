import type { Chain, GameData, ItemId, Link, RecipeId, Side, Stage, StageId } from './types.ts';
import { tierKey } from './stage.ts';
import { addLinkedStage, addStage, canLink, link, moveStage, nextLinkId, removeStage, setClock, setLocked, setMachines, setPerRow, setPolicy, setRecipe, setTier, unlink } from './chain.ts';
import { placeNew, withLayout } from './autolayout.ts';
import { exampleChain } from './example.ts';
import { BELTS, PIPES, encodeShare, historyNew, historyPush, historyRedo, historyUndo } from '../../logic/index.js';

export const PLANNER_STORE = 'sf-balancer:planner';

export interface History<T> { past: T[]; present: T; future: T[]; limit: number }
type Pos = { x: number; y: number };

export type Action =
  | { type: 'addStage'; recipe: RecipeId; machines: number; pos?: Pos }
  | { type: 'addLinkedStage'; recipe: RecipeId; at: { item: ItemId; side: 'consumes' | 'produces'; stage: StageId } }
  | { type: 'removeStage'; id: StageId }
  | { type: 'link'; from: StageId; to: StageId; item: ItemId }
  | { type: 'unlink'; linkId: string }
  | { type: 'setMachines'; id: StageId; n: number }
  | { type: 'setRecipe'; id: StageId; recipe: RecipeId }
  | { type: 'setClock'; id: StageId; clock: number }
  | { type: 'setPerRow'; id: StageId; perRow: number | null }
  | { type: 'setTier'; id: StageId; side: Side; item: ItemId; tier: string | null }
  | { type: 'setLocked'; id: StageId; locked: boolean }
  | { type: 'moveStage'; id: StageId; pos: Pos }
  | { type: 'setPolicy'; policy: Chain['policy'] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; chain: Chain };

export const encodeChain = (chain: Chain): string => encodeShare(chain);

const MAX_STAGES = 200;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function decodeChain(str: string, data: GameData): Chain | null {
  let raw: any;
  try {
    const bin = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
    raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  } catch { return null; }
  if (!isObj(raw) || raw.v !== 1) return null;

  const seen = new Set<string>();
  const stages: Stage[] = [];
  for (const r of (Array.isArray(raw.stages) ? raw.stages : []).slice(0, MAX_STAGES)) {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || typeof r.recipe !== 'string') continue;
    const recipe = Object.hasOwn(data.recipes, r.recipe) ? data.recipes[r.recipe] : null;
    const id = r.id.slice(0, 40);
    if (!recipe || seen.has(id)) continue;
    seen.add(id);
    // Chave `in:`/`out:` + item; a antiga (só o item) vai para a saída se o item sai, senão para a entrada.
    const has = (side: Side, item: string) => recipe[side].some(f => f.item === item);
    const tiers: Record<string, string> = {};
    if (isObj(r.tiers)) for (const [key, tier] of Object.entries(r.tiers)) {
      const m = key.match(/^(in|out):(.*)$/);
      const item = m ? m[2] : key;
      const side: Side = m ? (m[1] === 'in' ? 'ins' : 'outs') : has('outs', item) ? 'outs' : 'ins';
      if (!has(side, item) || typeof tier !== 'string') continue;
      const ok = (data.items[item]?.fluid ? PIPES : BELTS).some((b: { id: string }) => b.id === tier);
      if (ok) tiers[tierKey(side, item)] = tier;
    }
    const pr = r.perRow;
    stages.push({
      id, recipe: r.recipe,
      machines: clamp(Math.round(num(r.machines, 1)), 1, 10000),
      clock: clamp(num(r.clock, 100), 1, 250),
      perRow: typeof pr === 'number' && Number.isInteger(pr) && pr >= 1 && pr <= 500 ? pr : null,
      locked: r.locked === true,
      tiers,
      pos: isObj(r.pos) && Number.isFinite(r.pos.x) && Number.isFinite(r.pos.y) && typeof r.pos.x === 'number' && typeof r.pos.y === 'number'
        ? { x: r.pos.x, y: r.pos.y } : { x: 0, y: 0 },
    });
  }

  let chain: Chain = { v: 1, stages, links: [], policy: ['represar', 'sink', 'extra'].includes(raw.policy) ? raw.policy : 'represar' };
  for (const l of Array.isArray(raw.links) ? raw.links : []) {
    if (!isObj(l) || typeof l.from !== 'string' || typeof l.to !== 'string' || typeof l.item !== 'string') continue;
    const from = l.from.slice(0, 40), to = l.to.slice(0, 40);
    if (!canLink(chain, data, from, to, l.item).ok) continue;
    let id = typeof l.id === 'string' && l.id ? l.id.slice(0, 40) : '';
    if (!id || chain.links.some(x => x.id === id)) id = nextLinkId(chain);
    const nl: Link = { id, item: l.item, from, to };
    chain = { ...chain, links: [...chain.links, nl] };
  }
  return chain;
}

function apply(c: Chain, a: Exclude<Action, { type: 'undo' | 'redo' | 'load' }>, d: GameData): Chain {
  switch (a.type) {
    case 'addStage': {
      const c2 = addStage(c, d, a.recipe, a.machines, a.pos);
      if (a.pos) return c2;
      const id = c2.stages[c2.stages.length - 1].id;
      return { ...c2, stages: c2.stages.map(s => (s.id === id ? { ...s, pos: placeNew(c2, d, id) } : s)) };
    }
    case 'addLinkedStage': return addLinkedStage(c, d, a.recipe, a.at);
    case 'removeStage': return removeStage(c, d, a.id);
    case 'link': return link(c, d, a.from, a.to, a.item);
    case 'unlink': return unlink(c, a.linkId);
    case 'setMachines': return setMachines(c, d, a.id, a.n);
    case 'setRecipe': return setRecipe(c, d, a.id, a.recipe);
    case 'setClock': return setClock(c, d, a.id, a.clock);
    case 'setPerRow': return setPerRow(c, a.id, a.perRow);
    case 'setTier': return setTier(c, a.id, a.side, a.item, a.tier);
    case 'setLocked': return setLocked(c, a.id, a.locked);
    case 'moveStage': return moveStage(c, a.id, a.pos);
    case 'setPolicy': return setPolicy(c, a.policy);
  }
}

export function reduce(hist: History<Chain>, action: Action, data: GameData): History<Chain> {
  switch (action.type) {
    case 'undo': return historyUndo(hist);
    case 'redo': return historyRedo(hist);
    case 'load': return historyPush(hist, action.chain);
    default: return historyPush(hist, apply(hist.present, action, data));
  }
}

// `saved`: a cadeia salva válida, quando o link entra por cima dela.
export function initialChain(hash: string, saved: string | null, data: GameData): { chain: Chain; fromLink: boolean; saved: Chain | null } {
  const m = hash.match(/^#?p=([^&]*)/);
  const fromHash = m ? decodeChain(m[1], data) : null;
  const fromSaved = saved ? decodeChain(saved, data) : null;
  if (fromHash) return { chain: fromHash, fromLink: true, saved: fromSaved };
  return { chain: fromSaved ?? exampleChain(data), fromLink: false, saved: null };
}

export const newHistory = (chain: Chain): History<Chain> => historyNew(chain);

// Histórico da abertura, já arrumado. Link diferente da cadeia salva vira um passo por cima dela (um Desfazer volta).
export function initialHistory(hash: string, saved: string | null, data: GameData): History<Chain> {
  const r = initialChain(hash, saved, data);
  const chain = withLayout(r.chain, data);
  if (!r.saved) return newHistory(chain);
  return historyPush(newHistory(withLayout(r.saved, data)), chain);
}
