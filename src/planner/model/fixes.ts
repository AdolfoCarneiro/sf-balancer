// Frase do problema de uma porta e os consertos de um clique. Puro: a UI formata os números (fmt), aplica t(key, ...args)
// e despacha a `action`; aqui só saem chaves e números crus.
import type { Block, Factory, GameData, StageId } from './types.ts';
import { countOk, extractorRate, machinesOk, rateOk } from './factory.ts';
import type { Action } from './factorystate.ts';
import type { Pt } from './map/geo.ts';
import type { PortState } from './portstate.ts';
import { EPS, components, solveFactory, type FlowResult } from './solve.ts';

export interface Sentence { key: 'plWhyDeficit' | 'plWhySurplus' | 'plWhyChoke' | 'plWhyStalled' | 'plWhyExit' | 'plWhyEntry'; args: (string | number)[] }
// n: o valor que o conserto deixa (plFixReduce: máquinas; plFixRaise: taxa do Miner, extratores ou máquinas da produtora).
// action null (plFixCreate): a UI abre o seletor filtrado pela porta, como arrastar da porta para o vazio.
export interface Fix { key: 'plFixSink' | 'plFixExport' | 'plFixReduce' | 'plFixRaise' | 'plFixCreate'; n?: number; action: Action | null }

const OUTLET_NAME = { sink: 'Awesome Sink', container: 'Container', export: 'Export' } as const;
const blockName = (b: Block, d: GameData): string => (b.kind === 'recipe' ? d.recipes[b.recipe]?.name ?? b.recipe : b.kind === 'miner' ? 'Miner' : b.kind === 'input' ? 'Input' : b.kind === 'generator' ? d.generators?.[b.building]?.name ?? b.building : b.kind === 'extractor' ? d.extractors[b.building]?.name ?? b.building : OUTLET_NAME[b.kind]);
const itemName = (d: GameData, id: string): string => d.items[id]?.name ?? id;
const num = (v: number | null): number => (v !== null && Number.isFinite(v) ? v : 0);
const ceilTol = (v: number): number => Math.ceil(v - 1e-9);
const floorTol = (v: number): number => Math.floor(v + 1e-9);

// Saída que entope a cadeia até parar: o bloco (receita, nenhuma entrada curta) roda em 0 com a porta represando, e a
// cadeia depois dela só escoa uma fração do que ele faz, mas essa fração depende dele mesmo (as duas saídas da Heavy Oil
// Residue alimentam, por caminhos diferentes, a mesma Recycled Plastic). A saída enche, o bloco desacelera, a cadeia
// acompanha e tudo vai a 0. Para saber, resolve de novo o componente com a porta coletando o excesso: se o bloco volta a
// rodar, a porta é o gargalo, e o que as ligações levam é o que escoa. Uma conta por fluxo e porta (o cache vive com o fluxo).
export interface Choke { accepted: number; produced: number }
const chokes = new WeakMap<FlowResult, Map<string, Choke | null>>();
export function chokeOf(p: PortState, f: Factory, flow: FlowResult, d: GameData): Choke | null {
  if (p.kind !== 'surplus' || p.side !== 'out') return null;
  const memo = chokes.get(flow) ?? new Map<string, Choke | null>();
  chokes.set(flow, memo);
  const key = `${p.block}:${p.item}`;
  if (!memo.has(key)) memo.set(key, findChoke(p, f, flow, d));
  return memo.get(key)!;
}

function findChoke(p: PortState, f: Factory, flow: FlowResult, d: GameData): Choke | null {
  const b = f.blocks.find(x => x.id === p.block), bf = flow.blocks[p.block];
  if (b?.kind !== 'recipe' || !bf || bf.x === null || bf.x > EPS || bf.ins.some(q => q.deficit > EPS)) return null;
  if ((b.collect ?? []).includes(p.item) || !f.links.some(l => l.from === b.id && l.item === p.item)) return null;
  const ids = new Set(components(f).find(c => c.includes(b.id)) ?? [b.id]);
  const g: Factory = {
    v: 2,
    blocks: f.blocks.filter(x => ids.has(x.id)).map(x => (x.id === b.id ? { ...b, collect: [...(b.collect ?? []), p.item] } : x)),
    links: f.links.filter(l => ids.has(l.from)),
  };
  const r = solveFactory(g, d), out = r.blocks[b.id]?.outs.find(q => q.item === p.item);
  if (!r.converged || !out || out.rate === null || out.rate <= EPS) return null;
  const accepted = f.links.filter(l => l.from === b.id && l.item === p.item).reduce((s, l) => s + (r.links[l.id] ?? 0), 0);
  return accepted < out.rate * (1 - 1e-6) ? { accepted, produced: out.rate } : null;
}

// Outra saída do mesmo bloco é a que entope? Então esta só sobra por causa dela.
const chokedBySibling = (p: PortState, f: Factory, flow: FlowResult, d: GameData): boolean => {
  const bf = flow.blocks[p.block];
  return !!bf && bf.outs.some(q => q.item !== p.item && q.held > EPS &&
    chokeOf({ block: p.block, side: 'out', item: q.item, kind: 'surplus', amount: q.held, rate: q.rate }, f, flow, d) !== null);
};

export function problemSentence(p: PortState, f: Factory, flow: FlowResult, d: GameData): Sentence | null {
  const item = itemName(d, p.item);
  switch (p.kind) {
    case 'deficit': return { key: 'plWhyDeficit', args: [item, num(p.rate), num(p.amount)] };
    case 'surplus': {
      const ch = chokeOf(p, f, flow, d);
      if (ch) return { key: 'plWhyChoke', args: [item, ch.accepted, ch.produced, 100 * ch.accepted / ch.produced] };
      if (chokedBySibling(p, f, flow, d)) return null;
      const names = [...new Set(f.links.filter(l => l.from === p.block && l.item === p.item).map(l => f.blocks.find(b => b.id === l.to)).filter((b): b is Block => !!b).map(b => blockName(b, d)))];
      return { key: 'plWhySurplus', args: [names.length ? names.join(', ') : item, num(p.rate), num(p.amount)] };
    }
    case 'stalled': return { key: 'plWhyStalled', args: [item, num(p.amount)] };
    case 'exit': return { key: 'plWhyExit', args: [item, num(p.amount)] };
    case 'entry': return { key: 'plWhyEntry', args: [item, num(p.amount)] };
    default: return null;
  }
}

export function fixesFor(p: PortState, f: Factory, flow: FlowResult, d: GameData, at: Pt): Fix[] {
  const b = f.blocks.find(x => x.id === p.block), bf = flow.blocks[p.block];
  if (!b || !bf) return [];
  const solid = !d.items[p.item]?.fluid;
  const sink: Fix = { key: 'plFixSink', action: { type: 'addLinkedBlock', spec: { kind: 'sink' }, port: { block: p.block, item: p.item, side: 'out' }, at } };
  const exp: Fix = { key: 'plFixExport', action: { type: 'addLinkedBlock', spec: { kind: 'export' }, port: { block: p.block, item: p.item, side: 'out' }, at } };
  const create: Fix = { key: 'plFixCreate', action: null };
  const out: Fix[] = [];
  const amount = p.amount !== null && Number.isFinite(p.amount) ? p.amount : 0;

  // Saída que entope a cadeia: o que não escoa vai para fora (sink ou Saída) ou para um destino novo; menos máquinas não adianta.
  if (p.kind === 'surplus' && chokeOf(p, f, flow, d)) return [solid ? sink : exp, create];
  if (p.kind === 'surplus' && chokedBySibling(p, f, flow, d)) return [];
  if (p.kind === 'surplus' || p.kind === 'stalled') {
    if (solid) out.push(sink); else if (p.kind === 'stalled') out.push(create); else out.push(exp);
    if (p.kind === 'surplus' && b.kind === 'recipe' && bf.machines !== null && p.rate !== null && p.rate > EPS && amount > EPS) {
      const n = ceilTol(bf.machines * p.rate / (p.rate + amount));
      if (n >= 1 && n < bf.machines) out.push({ key: 'plFixReduce', n, action: { type: 'setLimits', id: b.id, limits: { ...b.limits, machines: n } } });
    }
    return out;
  }

  // Entrada sem ligação: criar a fonte (puxada da porta, ela já calcula quantos).
  if (p.kind === 'entry') return [create];

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
      const per = extractorRate(d, src);
      if (src.count === null || !per) return null;
      const n = src.count + ceilTol(need / per);
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
