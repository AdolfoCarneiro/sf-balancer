import type { Chain, GameData, Stage } from './types.ts';

// A cadeia das telas e o exemplo da primeira visita.
export function exampleChain(_data: GameData): Chain {
  const st = (id: string, recipe: string, machines: number, x: number, perRow: number | null = null): Stage =>
    ({ id, recipe, machines, clock: 100, perRow, locked: false, tiers: {}, pos: { x, y: 0 } });
  return {
    v: 1,
    stages: [
      st('s1', 'Recipe_Alternate_PureIronIngot_C', 42, 0),
      st('s2', 'Recipe_Alternate_IngotSteel_1_C', 60, 400, 12),
      st('s3', 'Recipe_SteelBeam_C', 30, 800),
      st('s4', 'Recipe_SteelPipe_C', 60, 800),
    ],
    links: [
      { id: 'l1', item: 'Desc_IronIngot_C', from: 's1', to: 's2' },
      { id: 'l2', item: 'Desc_SteelIngot_C', from: 's2', to: 's3' },
      { id: 'l3', item: 'Desc_SteelIngot_C', from: 's2', to: 's4' },
    ],
    policy: 'represar',
  };
}
