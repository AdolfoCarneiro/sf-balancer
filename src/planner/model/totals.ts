import type { Chain, GameData } from './types.ts';

export function chainTotals(chain: Chain, _data: GameData): { stages: number; machines: number } {
  return { stages: chain.stages.length, machines: chain.stages.reduce((n, s) => n + s.machines, 0) };
}
