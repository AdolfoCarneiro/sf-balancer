// A fábrica resolvida vista pelas contas da fase 1 e 2: o bloco de receita vira etapa (fileiras, tiers, desenho) e os
// geradores viram fileiras no tamanho deles e os outros blocos, marcadores fora de escala. Puro.
import { isSource, type Block, type Factory, type GameData, type GeneratorBlock, type ItemId, type RecipeBlock, type Stage } from './types.ts';
import type { BlockFlow, FlowResult } from './solve.ts';
import { MAX_MACHINES, genFuel } from './factory.ts';
import { capOf, defaultTier } from './stage.ts';
import type { Anchor, BeltPath, BlockGeo, Piece } from './map/geo.ts';
import { FOUNDATION, JUNCTION, PIECE, SINK } from './map/sizes.ts';

// Máquinas resolvidas (sem fluxo, parado ou sem limite: 1); clock do bloco, para as fileiras e os tiers não pularem
// com o fluxo (o clock de funcionamento fica com o meio). O arranjo do bloco vai junto.
export function solvedStage(b: RecipeBlock, bf: BlockFlow | undefined): Stage {
  const machines = Math.min(MAX_MACHINES, Math.max(1, bf?.machines ?? 1));
  return { id: b.id, recipe: b.recipe, machines, clock: b.clock, perRow: b.perRow, tiers: b.tiers, ...(b.layout ? { layout: b.layout } : {}) };
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
// direita; sobra: uma entrada por item que chega, na borda esquerda. O gerador fica com o genGeo.
export function markerGeo(b: Exclude<Block, RecipeBlock>, bf: BlockFlow | undefined, d: GameData): BlockGeo {
  if (b.kind === 'generator') return genGeo(b, bf, d);
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

const WATER: ItemId = 'Desc_Water_C';
// Itens do gerador a 100 % (por gerador): o combustível e a água entrando, o resíduo saindo.
function genFlows(d: GameData, b: GeneratorBlock): { ins: [ItemId, number][]; outs: [ItemId, number][] } {
  const g = genFuel(d, b.building, b.fuel);
  if (!g) return { ins: [], outs: [] };
  return { ins: [[g.item, g.perMin], ...(g.water ? [[WATER, g.water] as [ItemId, number]] : [])], outs: g.waste ? [[g.waste.item, g.waste.perMin]] : [] };
}

// Geradores por fileira: quantos cabem numa esteira (ou cano) no tier padrão pela porta mais apertada (combustível, água
// ou resíduo, a 100 %). Cada fileira é uma linha de cada porta, a mesma conta do meio.
export function genPerRow(d: GameData, b: GeneratorBlock): number {
  const { ins, outs } = genFlows(d, b);
  const fits = [...ins, ...outs].map(([item, per]) => Math.floor(capOf(d.items[item], defaultTier(d.items[item])) / per + 1e-9));
  return Math.max(1, Math.min(MAX_MACHINES, ...fits));
}

// Gerador no tamanho real: os geradores resolvidos (sem fluxo: 1) em fileiras de genPerRow, empilhadas. Cada fileira
// tem uma faixa por entrada em cima (Splitter por gerador; no cano, Pipeline Junction), os prédios e uma faixa por
// resíduo embaixo (Merger), com a entrada na borda esquerda e a saída na direita, como a fileira simples da receita.
function genGeo(b: GeneratorBlock, bf: BlockFlow | undefined, d: GameData): BlockGeo {
  const size = d.generators?.[b.building], gw = size?.w ?? FOUNDATION, gl = size?.l ?? FOUNDATION;
  const n = Math.min(MAX_MACHINES, Math.max(1, Math.round(bf?.machines ?? 1))), per = genPerRow(d, b);
  const { ins: fin, outs: fout } = genFlows(d, b);
  const fluid = (item: string) => d.items[item]?.fluid ?? false;
  const rows = Math.ceil(n / per), w = Math.min(n, per) * gw, rowH = (fin.length + fout.length) * PIECE + gl;
  const pieces: Piece[] = [], belts: BeltPath[] = [], ins: Anchor[] = [], outs: Anchor[] = [];
  // Taxa da linha: a da porta resolvida, repartida pelos geradores da fileira.
  const lineRate = (side: 'ins' | 'outs', item: string, k: number) => rateOf((side === 'ins' ? bf?.ins : bf?.outs)?.find(p => p.item === item)?.rate) * k / n;
  const band = (item: string, y: number, k: number, kind: 'splitter' | 'merger') => {
    for (let m = 0; m < k; m++) {
      const s = fluid(item) ? JUNCTION : PIECE;
      pieces.push({ kind: fluid(item) ? 'junction' : kind, x: m * gw + (gw - s) / 2, y: y - s / 2, w: s, h: s });
    }
  };
  for (let r = 0; r < rows; r++) {
    const k = Math.min(per, n - r * per), y0 = r * rowH;
    fin.forEach(([item], j) => {
      const y = y0 + j * PIECE + PIECE / 2;
      band(item, y, k, 'splitter');
      ins.push({ x: 0, y, item, row: r, stage: b.id });
      belts.push({ pts: [[0, y], [k * gw, y]], item, rate: lineRate('ins', item, k), role: 'in', fluid: fluid(item) });
    });
    const my = y0 + fin.length * PIECE;
    for (let m = 0; m < k; m++) pieces.push({ kind: 'machine', x: m * gw, y: my, w: gw, h: gl });
    fout.forEach(([item], j) => {
      const y = my + gl + j * PIECE + PIECE / 2;
      band(item, y, k, 'merger');
      outs.push({ x: w, y, item, row: r, stage: b.id });
      belts.push({ pts: [[0, y], [w, y]], item, rate: lineRate('outs', item, k), role: 'out', fluid: fluid(item) });
    });
  }
  return { w, h: rows * rowH, pieces, belts, ins, outs, estimate: [...fin, ...fout].some(([item]) => fluid(item)) };
}
