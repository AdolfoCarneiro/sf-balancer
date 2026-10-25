// Fábricas de teste do solver (usadas também pelas Tasks 4 e 7).
import assert from 'node:assert/strict';
import type { Block, Factory, Link, RecipeBlock } from '../../src/planner/model/types.ts';

const recipe = (id: string, r: string, limits?: RecipeBlock['limits']): RecipeBlock =>
  ({ id, kind: 'recipe', recipe: r, clock: 100, perRow: null, tiers: {}, ...(limits ? { limits } : {}) });
const link = (id: string, item: string, from: string, to: string): Link => ({ id, item, from, to });

// Cadeia do spec: m1 Miner Iron Ore 280 → s1 Pure Iron → s2 Solid Steel → s3 Steel Beam (lBeam) e s4 Steel Pipe (lPipe);
// s3 → s5 Versatile Framework fixado em 1 (Modular Frame bruto). Canos e Framework sem ligação: produto final.
export function vf(): Factory {
  const blocks: Block[] = [
    { id: 'm1', kind: 'miner', item: 'Desc_OreIron_C', rate: 280 },
    recipe('s1', 'Recipe_Alternate_PureIronIngot_C'),
    recipe('s2', 'Recipe_Alternate_IngotSteel_1_C'),
    recipe('s3', 'Recipe_SteelBeam_C'),
    recipe('s4', 'Recipe_SteelPipe_C'),
    recipe('s5', 'Recipe_SpaceElevatorPart_2_C', { machines: 1 }),
  ];
  const links = [
    link('lOre', 'Desc_OreIron_C', 'm1', 's1'),
    link('lIngot', 'Desc_IronIngot_C', 's1', 's2'),
    link('lBeam', 'Desc_SteelIngot_C', 's2', 's3'),
    link('lPipe', 'Desc_SteelIngot_C', 's2', 's4'),
    link('lFrame', 'Desc_SteelPlate_C', 's3', 's5'),
  ];
  return { v: 2, blocks, links };
}

// A mesma cadeia sem o Versatile Framework: as vigas viram produto final.
export function semFramework(): Factory {
  const f = vf();
  return { ...f, blocks: f.blocks.filter(b => b.id !== 's5'), links: f.links.filter(l => l.id !== 'lFrame') };
}

export function close(a: number | null | undefined, b: number, eps = 1e-6): void {
  assert.ok(typeof a === 'number' && Math.abs(a - b) < eps, `esperava ${b}, veio ${a}`);
}
