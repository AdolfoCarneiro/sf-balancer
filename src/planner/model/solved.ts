// A fábrica resolvida vista pelas contas da fase 1 e 2: o bloco de receita e o gerador (pela receita do gerador, genData)
// viram etapa (fileiras, tiers, desenho) e os outros blocos, marcadores fora de escala. Puro.
import { isSource, type Block, type Factory, type GameData, type RecipeBlock, type RowBlock, type Stage } from './types.ts';
import type { BlockFlow, FlowResult } from './solve.ts';
import { MAX_MACHINES, genData, genRecipeId } from './factory.ts';
import type { Anchor, BeltPath, BlockGeo, Piece } from './map/geo.ts';
import { FOUNDATION, SINK } from './map/sizes.ts';

// Máquinas resolvidas (sem fluxo, parado ou sem limite: 1); clock do bloco, para as fileiras e os tiers não pularem
// com o fluxo (o clock de funcionamento fica com o meio). O arranjo do bloco vai junto.
export function solvedStage(b: RecipeBlock, bf: BlockFlow | undefined): Stage {
  const machines = Math.min(MAX_MACHINES, Math.max(1, bf?.machines ?? 1));
  return { id: b.id, recipe: b.recipe, machines, clock: b.clock, perRow: b.perRow, tiers: b.tiers, ...(b.layout ? { layout: b.layout } : {}) };
}

// Etapa de um bloco com fileiras e o GameData em que a receita dela existe: a receita pelo solvedStage; o gerador pela
// receita do gerador (genData), com os geradores resolvidos (sem fluxo: 1) e o clock dele.
export function rowStage(b: RowBlock, bf: BlockFlow | undefined, d: GameData): { stage: Stage; data: GameData } {
  if (b.kind === 'recipe') return { stage: solvedStage(b, bf), data: d };
  const machines = Math.min(MAX_MACHINES, Math.max(1, Math.round(bf?.machines ?? 1)));
  return {
    stage: { id: b.id, recipe: genRecipeId(b), machines, clock: b.clock ?? 100, perRow: b.perRow ?? null, tiers: b.tiers ?? {}, ...(b.layout ? { layout: b.layout } : {}) },
    data: genData(d, b),
  };
}

// Blocos e máquinas de receita resolvidas, mais os extratores.
export function factoryTotals(f: Factory, flow: FlowResult): { blocks: number; machines: number } {
  let machines = 0;
  for (const b of f.blocks) {
    const bf = flow.blocks[b.id];
    if (b.kind === 'recipe') machines += bf?.machines ?? 0;
    else if (b.kind === 'extractor') machines += bf?.extractors ?? 0;
    else if (b.kind === 'generator') machines += bf?.machines ?? 0;
  }
  return { blocks: f.blocks.length, machines };
}

const rateOf = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Marcador de origem (Miner, extrator, Entrada) ou de sobra (Awesome Sink, Container, Saída): 8 × 8 m (o Awesome Sink no
// tamanho dele, 16 × 13), sempre estimativa (as medidas reais ainda são pergunta ao dono). Origem: uma saída na borda
// direita; sobra: uma entrada por item que chega, na borda esquerda.
export function markerGeo(b: Exclude<Block, RowBlock>, bf: BlockFlow | undefined, d: GameData): BlockGeo {
  const sink = b.kind === 'sink';
  const w = sink ? SINK.w : FOUNDATION, h = sink ? SINK.l : FOUNDATION;
  const pieces: Piece[] = [{ kind: sink ? 'sink' : 'machine', x: 0, y: 0, w, h }];
  const belts: BeltPath[] = [], ins: Anchor[] = [], outs: Anchor[] = [];
  const fluid = (item: string) => d.items[item]?.fluid ?? false;
  if (isSource(b)) {
    outs.push({ x: w, y: h / 2, item: b.item, row: 0, stage: b.id });
    belts.push({ pts: [[w / 2, h / 2], [w, h / 2]], item: b.item, rate: rateOf(bf?.outs[0]?.rate), role: 'out', fluid: fluid(b.item) });
  } else {
    const ports = bf?.ins ?? [];
    ports.forEach((p, k) => {
      const y = (h * (k + 1)) / (ports.length + 1);
      ins.push({ x: 0, y, item: p.item, row: 0, stage: b.id });
      belts.push({ pts: [[0, y], [w / 2, y]], item: p.item, rate: rateOf(p.rate), role: 'in', fluid: fluid(p.item) });
    });
  }
  return { w, h, pieces, belts, ins, outs, estimate: true };
}

