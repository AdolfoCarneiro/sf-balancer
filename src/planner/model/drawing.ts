import type { GameData, ItemId, Stage } from './types.ts';
import { stageRows } from './stage.ts';

export interface Lane { item: ItemId; side: 'in' | 'out'; fluid: boolean; marks: number }
export interface DrawnRow { machines: number; lanes: Lane[] }

// Fileiras e faixas da etapa. `marks` = Splitters (entrada sólida) ou Mergers (saída sólida): k−1 por fileira; fluido não tem.
export function stageDrawing(stage: Stage, data: GameData): { rows: DrawnRow[] } {
  const r = data.recipes[stage.recipe];
  const ports = [...r.ins.map(f => ({ f, side: 'in' as const })), ...r.outs.map(f => ({ f, side: 'out' as const }))];
  return {
    rows: stageRows(stage, data).map(machines => ({
      machines,
      lanes: ports.map(({ f, side }) => {
        const fluid = !!data.items[f.item]?.fluid;
        return { item: f.item, side, fluid, marks: fluid ? 0 : Math.max(0, machines - 1) };
      }),
    })),
  };
}
