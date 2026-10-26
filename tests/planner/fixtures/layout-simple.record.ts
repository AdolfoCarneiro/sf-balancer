// Grava layout-simple.json a partir do blockGeo/stage* da fase 3 (antes do arranjo). Rodar só para regravar de propósito:
//   node tests/planner/fixtures/layout-simple.record.ts
// Gravado no commit 678f649. Depois da Task 4 o blockGeo passa a ser o próprio arrange: regravar vira tautologia.
import { writeFileSync } from 'node:fs';
import game from '../../../src/planner/data/game.json' with { type: 'json' };
import type { GameData, RecipeBlock, Stage } from '../../../src/planner/model/types.ts';
import { exampleFactory } from '../../../src/planner/model/factorystate.ts';
import { solveFactory } from '../../../src/planner/model/solve.ts';
import { solvedStage } from '../../../src/planner/model/solved.ts';
import { stageArea, stageRows } from '../../../src/planner/model/stage.ts';
import { stagePieces } from '../../../src/planner/model/layout.ts';   // até a Task 4 vinha de stage.ts (sem lifts)
import { blockGeo } from '../../../src/planner/model/map/block.ts';

const data = game as GameData;
const f = exampleFactory(data), flow = solveFactory(f, data);
const cases: { name: string; stage: Stage; place?: { gapRow: number; gapMachine: number } }[] = [];
for (const b of f.blocks) if (b.kind === 'recipe') cases.push({ name: b.id, stage: solvedStage(b as RecipeBlock, flow.blocks[b.id]) });
cases.push({ name: '120 fileiras', stage: { id: 'big', recipe: 'Recipe_Alternate_PureIronIngot_C', machines: 840, clock: 100, perRow: null, tiers: {} } });
cases.push({ name: 's2 com vãos', stage: cases.find(c => c.name === 's2')!.stage, place: { gapRow: 4, gapMachine: 2 } });
cases.push({ name: 'incompleta com vãos', stage: { id: 'inc', recipe: 'Recipe_Alternate_IngotSteel_1_C', machines: 61, clock: 100, perRow: 12, tiers: {} }, place: { gapRow: 8, gapMachine: 3 } });
const out = cases.map(c => ({
  ...c,
  geo: blockGeo(c.stage, data, c.place), pieces: stagePieces(c.stage, data), area: stageArea(c.stage, data), rows: stageRows(c.stage, data),
}));
writeFileSync(new URL('./layout-simple.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(out.map(c => `${c.name}: ${c.stage.machines} máquinas, ${c.rows.length} fileiras`).join('\n'));
