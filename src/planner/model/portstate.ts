// Estado de cada porta (falta, sobra, saída, travada) e o balanço da fábrica inteira. Puro: o canvas e a barra só mostram.
import type { Factory, GameData, ItemId, StageId } from './types.ts';
import { EPS, type BlockFlow, type FlowResult } from './solve.ts';

export type PortKind = 'ok' | 'deficit' | 'surplus' | 'exit' | 'stalled';
// amount: falta, sobra, o que sai ou o que pararia (null sem número); rate: o que passa (null = sem limite).
export interface PortState { block: StageId; side: 'in' | 'out'; item: ItemId; kind: PortKind; amount: number | null; rate: number | null }
export interface Balance {
  ins: { item: ItemId; rate: number | null }[];
  outs: { item: ItemId; rate: number | null }[];
  sink: { item: ItemId; rate: number | null }[];
  problems: PortState[];
}

const above = (v: number | null): v is number => v !== null && v > EPS;
const num = (v: number | null): number | null => (v !== null && Number.isFinite(v) ? v : null);

// Entradas e saídas na ordem do fluxo. Prioridade nas saídas: travada > sobra > saída da fábrica.
export function portStates(bf: BlockFlow): PortState[] {
  const res: PortState[] = [];
  for (const p of bf.ins) {
    const deficit = above(p.deficit);
    res.push({ block: bf.id, side: 'in', item: p.item, kind: deficit ? 'deficit' : 'ok', amount: deficit ? p.deficit : null, rate: num(p.rate) });
  }
  for (const p of bf.outs) {
    let kind: PortKind = 'ok', amount: number | null = null;
    if (bf.stalled === p.item) { kind = 'stalled'; amount = above(p.held) ? p.held : null; }
    else if (above(p.held)) { kind = 'surplus'; amount = p.held; }
    else if (p.exits === null || p.exits > EPS) { kind = 'exit'; amount = num(p.exits); }
    res.push({ block: bf.id, side: 'out', item: p.item, kind, amount, rate: num(p.rate) });
  }
  return res;
}

// null (sem limite) contamina a soma do item. Ordem dos itens: primeira aparição.
function sumBy(rows: { item: ItemId; rate: number | null }[]): { item: ItemId; rate: number | null }[] {
  const m = new Map<ItemId, number | null>();
  for (const r of rows) {
    const cur = m.get(r.item);
    m.set(r.item, cur === null || r.rate === null ? null : (cur ?? 0) + r.rate);
  }
  return [...m].map(([item, rate]) => ({ item, rate }));
}

export function factoryBalance(f: Factory, flow: FlowResult, _d: GameData): Balance {
  const ins: { item: ItemId; rate: number | null }[] = [], outs: typeof ins = [], sink: typeof ins = [], problems: PortState[] = [];
  for (const b of f.blocks) {
    const bf = flow.blocks[b.id];
    if (!bf) continue;
    if (b.kind === 'miner' || b.kind === 'extractor') for (const p of bf.outs) ins.push({ item: p.item, rate: num(p.rate) });
    if (b.kind === 'recipe') {
      for (const p of bf.ins) if (!f.links.some(l => l.to === b.id && l.item === p.item)) ins.push({ item: p.item, rate: num(p.rate) });
    }
    // O que chega ao Awesome Sink vai para "Sink"; o que chega a Container e Saída (Export) sai da fábrica, como as saídas.
    if (b.kind === 'sink') for (const p of bf.ins) sink.push({ item: p.item, rate: num(p.rate) });
    if (b.kind === 'export' || b.kind === 'container') for (const p of bf.ins) outs.push({ item: p.item, rate: num(p.rate) });
    for (const p of bf.outs) if (p.exits === null || p.exits > EPS) outs.push({ item: p.item, rate: num(p.exits) });
    for (const s of portStates(bf)) if (s.kind === 'deficit' || s.kind === 'surplus' || s.kind === 'stalled') problems.push(s);
  }
  return { ins: sumBy(ins), outs: sumBy(outs), sink: sumBy(sink), problems };
}

// Próximo problema do tipo, circular: `last` é o índice devolvido da vez anterior (-1 = nenhum). "Falta" inclui a porta travada.
export function nextProblem(problems: PortState[], kind: 'deficit' | 'surplus', last: number): { index: number; problem: PortState } | null {
  const list = problems.filter(p => (kind === 'surplus' ? p.kind === 'surplus' : p.kind === 'deficit' || p.kind === 'stalled'));
  if (!list.length) return null;
  const index = (Math.max(-1, last) + 1) % list.length;
  return { index, problem: list[index] };
}
