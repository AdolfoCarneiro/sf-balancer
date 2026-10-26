// O rótulo do chip de cada ligação (meio) na Montar: que tipo de montagem, quanto passa, quantas linhas de cada lado e se
// alguma consumidora fica com falta. Puro; o texto ("6 → 8", "direto", "3 → 4 + sink", "cano 2 → 6") vem das chaves de i18n
// na tela.
import type { Factory, GameData, ItemId } from './types.ts';
import { chosenAlt, type Meio } from './meio.ts';
import type { MeioResult } from './meioresult.ts';
import { EPS, type FlowResult } from './solve.ts';

export type ChipKind = 'calc' | 'unbounded' | 'tooLarge' | 'direct' | 'balancer' | 'sink' | 'pipe';
// rate: soma do fluxo das ligações do grupo (null = sem limite); nS/nD: linhas do plano; short: consumidora com falta.
export interface ChipLabel { kind: ChipKind; item: ItemId; rate: number | null; nS: number; nD: number; short: boolean }

function kindOf(result: MeioResult | null | undefined, meio: Meio, alts: Factory['alts'], d: GameData): ChipKind {
  if (!result) return 'calc';
  const plan = result.plan;
  if (plan.unbounded) return 'unbounded';
  if (plan.tooLarge) return 'tooLarge';
  if (plan.fluid || d.items[meio.item]?.fluid) return 'pipe';
  if (plan.direct) return 'direct';
  const key = chosenAlt(plan, alts && Object.hasOwn(alts, meio.id) ? alts[meio.id] : undefined);
  const a = plan.alternatives.find(x => x.key === key);
  if (!a || a.pieces.splitters + a.pieces.mergers + a.pieces.smart === 0) return 'direct';
  return a.sinkRate > EPS ? 'sink' : 'balancer';
}

export function chipLabel(meio: Meio, result: MeioResult | null | undefined, alts: Factory['alts'], flow: FlowResult, d: GameData): ChipLabel {
  let rate: number | null = 0;
  for (const id of meio.links) {
    const v = flow.links[id];
    if (typeof v !== 'number' || !Number.isFinite(v)) { rate = null; break; }
    rate += v;
  }
  const short = meio.consumers.some(id => (flow.blocks[id]?.ins ?? []).some(p => p.item === meio.item && p.deficit > EPS));
  const plan = result?.plan;
  return { kind: kindOf(result, meio, alts, d), item: meio.item, rate, nS: plan?.src.lines.length ?? 0, nD: plan?.dst.lines.length ?? 0, short };
}
