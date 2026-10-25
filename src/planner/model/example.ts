import type { GameData } from './types.ts';
import type { ChainV1, StageV1 } from './factorystate.ts';

// O exemplo da primeira visita, no formato bruto da v1 (a fábrica sai da migração, com as máquinas fixadas).
export function exampleChain(_data: GameData): ChainV1 {
  const st = (id: string, recipe: string, machines: number, perRow: number | null = null): StageV1 =>
    ({ id, recipe, machines, clock: 100, perRow, tiers: {} });
  return {
    v: 1,
    stages: [
      st('s1', 'Recipe_Alternate_PureIronIngot_C', 42),
      st('s2', 'Recipe_Alternate_IngotSteel_1_C', 60, 12),
      st('s3', 'Recipe_SteelBeam_C', 30),
      st('s4', 'Recipe_SteelPipe_C', 60),
    ],
    links: [
      { id: 'l1', item: 'Desc_IronIngot_C', from: 's1', to: 's2' },
      { id: 'l2', item: 'Desc_SteelIngot_C', from: 's2', to: 's3' },
      { id: 'l3', item: 'Desc_SteelIngot_C', from: 's2', to: 's4' },
    ],
    policy: 'represar',
  };
}
