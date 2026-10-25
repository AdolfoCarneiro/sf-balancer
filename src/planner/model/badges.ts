// O que o bloco tem a dizer sobre o fluxo (falta, represado, saída da fábrica, travado, sem limite, loop travado) e
// os limites vistos como campo (fixado ou calculado). Puro: o canvas e o painel só mostram.
import type { ItemId, Link, RecipeBlock } from './types.ts';
import { EPS, type BlockFlow, type FlowResult } from './solve.ts';

export type BadgeKind = 'deficit' | 'held' | 'exit' | 'stalled' | 'unbounded' | 'deadlock';
// amount: item/min (stalled: o que a porta parada produziria se escoasse); null sem número.
export interface Badge { kind: BadgeKind; side: 'in' | 'out' | 'block'; item: ItemId | null; amount: number | null }

const above = (v: number | null): v is number => v !== null && v > EPS;

// Só acima de EPS; ordem: bloco (sem limite, travado, loop), entradas, saídas. Bloco travado: o que ele represa nas
// saídas é o que produziria parado, e vai no aviso de travado (não aparece como represado).
export function blockBadges(bf: BlockFlow, flow: FlowResult): Badge[] {
  const out: Badge[] = [];
  if (bf.unbounded) out.push({ kind: 'unbounded', side: 'block', item: null, amount: null });
  if (bf.stalled !== null) {
    const p = bf.outs.find(x => x.item === bf.stalled);
    out.push({ kind: 'stalled', side: 'block', item: bf.stalled, amount: p && above(p.held) ? p.held : null });
  }
  if (flow.deadlock.some(ids => ids.includes(bf.id))) out.push({ kind: 'deadlock', side: 'block', item: null, amount: null });
  for (const p of bf.ins) if (above(p.deficit)) out.push({ kind: 'deficit', side: 'in', item: p.item, amount: p.deficit });
  for (const p of bf.outs) {
    if (bf.stalled === null && above(p.held)) out.push({ kind: 'held', side: 'out', item: p.item, amount: p.held });
    if (above(p.exits)) out.push({ kind: 'exit', side: 'out', item: p.item, amount: p.exits });
  }
  return out;
}

// value: o fixado, ou o calculado (null: ainda sem fluxo ou sem limite). raw: entrada sem ligação (o limite ali é o
// que existe no lugar; ligada, é teto do bloco). Entradas na ordem do fluxo (a da receita); sem fluxo, as fixadas.
export interface LimitView {
  machines: { value: number | null; fixed: boolean };
  inputs: { item: ItemId; value: number | null; fixed: boolean; raw: boolean }[];
}

export function limitView(b: RecipeBlock, bf: BlockFlow | undefined, links: Link[] = []): LimitView {
  const lim = b.limits ?? {}, ins = lim.inputs ?? {};
  const fixedM = lim.machines !== undefined;
  const items = bf ? bf.ins.map(p => p.item) : Object.keys(ins);
  return {
    machines: { value: fixedM ? lim.machines! : bf?.machines ?? null, fixed: fixedM },
    inputs: items.map(item => {
      const fixed = Object.hasOwn(ins, item);
      return {
        item, fixed, raw: !links.some(l => l.to === b.id && l.item === item),
        value: fixed ? ins[item] : bf?.ins.find(p => p.item === item)?.rate ?? null,
      };
    }),
  };
}
