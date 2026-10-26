// Frase do problema de uma porta e os consertos de um clique. Puro: a UI formata os números (fmt), aplica t(key, ...args)
// e despacha a `action`; aqui só saem chaves e números crus.
import type { Block, Factory, GameData, StageId } from './types.ts';
import { PURITY, countOk, machinesOk, rateOk } from './factory.ts';
import type { Action } from './factorystate.ts';
import type { Pt } from './map/geo.ts';
import type { PortState } from './portstate.ts';
import { EPS, type FlowResult } from './solve.ts';

export interface Sentence { key: 'plWhyDeficit' | 'plWhySurplus' | 'plWhyStalled' | 'plWhyExit'; args: (string | number)[] }
// n: o valor que o conserto deixa (plFixReduce: máquinas; plFixRaise: taxa do Miner, extratores ou máquinas da produtora).
// action null (plFixCreate): a UI abre o seletor filtrado pela porta, como arrastar da porta para o vazio.
export interface Fix { key: 'plFixSink' | 'plFixReduce' | 'plFixRaise' | 'plFixCreate'; n?: number; action: Action | null }

const OUTLET_NAME = { sink: 'Awesome Sink', container: 'Container', export: 'Export' } as const;
const blockName = (b: Block, d: GameData): string => (b.kind === 'recipe' ? d.recipes[b.recipe]?.name ?? b.recipe : b.kind === 'miner' ? 'Miner' : b.kind === 'input' ? 'Input' : b.kind === 'extractor' ? d.extractors[b.building]?.name ?? b.building : OUTLET_NAME[b.kind]);
const itemName = (d: GameData, id: string): string => d.items[id]?.name ?? id;
const num = (v: number | null): number => (v !== null && Number.isFinite(v) ? v : 0);
const ceilTol = (v: number): number => Math.ceil(v - 1e-9);
const floorTol = (v: number): number => Math.floor(v + 1e-9);

export function problemSentence(p: PortState, f: Factory, _flow: FlowResult, d: GameData): Sentence | null {
  const item = itemName(d, p.item);
  switch (p.kind) {
    case 'deficit': return { key: 'plWhyDeficit', args: [item, num(p.rate), num(p.amount)] };
    case 'surplus': {
      const names = [...new Set(f.links.filter(l => l.from === p.block && l.item === p.item).map(l => f.blocks.find(b => b.id === l.to)).filter((b): b is Block => !!b).map(b => blockName(b, d)))];
      return { key: 'plWhySurplus', args: [names.length ? names.join(', ') : item, num(p.rate), num(p.amount)] };
    }
    case 'stalled': return { key: 'plWhyStalled', args: [item, num(p.amount)] };
    case 'exit': return { key: 'plWhyExit', args: [item, num(p.amount)] };
    default: return null;
  }
}

export function fixesFor(p: PortState, f: Factory, flow: FlowResult, d: GameData, at: Pt): Fix[] {
  const b = f.blocks.find(x => x.id === p.block), bf = flow.blocks[p.block];
  if (!b || !bf) return [];
  const solid = !d.items[p.item]?.fluid;
  const sink: Fix = { key: 'plFixSink', action: { type: 'addLinkedBlock', spec: { kind: 'sink' }, port: { block: p.block, item: p.item, side: 'out' }, at } };
  const create: Fix = { key: 'plFixCreate', action: null };
  const out: Fix[] = [];
  const amount = p.amount !== null && Number.isFinite(p.amount) ? p.amount : 0;

  if (p.kind === 'surplus' || p.kind === 'stalled') {
    if (solid) out.push(sink); else if (p.kind === 'stalled') out.push(create);
    if (p.kind === 'surplus' && b.kind === 'recipe' && bf.machines !== null && p.rate !== null && p.rate > EPS && amount > EPS) {
      const n = ceilTol(bf.machines * p.rate / (p.rate + amount));
      if (n >= 1 && n < bf.machines) out.push({ key: 'plFixReduce', n, action: { type: 'setLimits', id: b.id, limits: { ...b.limits, machines: n } } });
    }
    return out;
  }

  if (p.kind === 'deficit' && p.side === 'in') {
    const need = amount;
    const producers = f.links.filter(l => l.to === p.block && l.item === p.item).map(l => l.from);
    const src = producers.length === 1 ? f.blocks.find(x => x.id === producers[0]) : undefined;
    const raise = src && need > EPS ? raiseSource(src, p.item, need, d) : null;
    if (raise) out.push(raise);
    if (b.kind === 'recipe' && bf.machines !== null && p.rate !== null && p.rate > EPS && need > EPS) {
      const n = Math.max(1, floorTol(bf.machines * p.rate / (p.rate + need)));
      if (n < bf.machines) out.push({ key: 'plFixReduce', n, action: { type: 'setLimits', id: b.id, limits: { ...b.limits, machines: n } } });
    }
    out.push(create);
  }
  return out;
}

function raiseSource(src: Block, item: string, need: number, d: GameData): Fix | null {
  const id: StageId = src.id;
  switch (src.kind) {
    case 'miner': {
      const rate = src.rate + need;
      return rateOk(rate) ? { key: 'plFixRaise', n: rate, action: { type: 'setMinerRate', id, rate } } : null;
    }
    case 'input': {
      if (src.rate === null) return null;
      const rate = src.rate + need;
      return rateOk(rate) ? { key: 'plFixRaise', n: rate, action: { type: 'setInputRate', id, rate } } : null;
    }
    case 'extractor': {
      const e = d.extractors[src.building];
      if (src.count === null || !e) return null;
      const n = src.count + ceilTol(need / (e.perMin * (e.purity ? PURITY[src.purity] : 1)));
      return countOk(n) ? { key: 'plFixRaise', n, action: { type: 'setExtractor', id, count: n } } : null;
    }
    case 'recipe': {
      const r = d.recipes[src.recipe], per = r?.outs.find(o => o.item === item)?.perMin;
      if (src.limits?.machines === undefined || !per) return null;
      const n = src.limits.machines + ceilTol(need / (per * src.clock / 100));
      return machinesOk(n) ? { key: 'plFixRaise', n, action: { type: 'setLimits', id, limits: { ...src.limits, machines: n } } } : null;
    }
    default: return null;
  }
}
