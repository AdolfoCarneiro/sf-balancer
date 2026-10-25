import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';

const data = game as GameData;
const R = data.recipes;

test('dados: Pure Iron Ingot (alt) na Refinery, 35 ore + 20 water → 65', () => {
  const r = R['Recipe_Alternate_PureIronIngot_C'];
  assert.equal(r.name, 'Pure Iron Ingot'); assert.equal(r.alt, true); assert.equal(r.building, 'Build_OilRefinery_C');
  assert.deepEqual(r.ins, [{ item: 'Desc_OreIron_C', perMin: 35 }, { item: 'Desc_Water_C', perMin: 20 }]);
  assert.deepEqual(r.outs, [{ item: 'Desc_IronIngot_C', perMin: 65 }]);
});

test('dados: Solid Steel Ingot 40 + 40 → 60, Steel Beam 60 → 15, Steel Pipe 30 → 20', () => {
  const s = R['Recipe_Alternate_IngotSteel_1_C'];
  assert.equal(s.name, 'Solid Steel Ingot'); assert.equal(s.alt, true); assert.equal(s.building, 'Build_FoundryMk1_C');
  assert.deepEqual(s.ins, [{ item: 'Desc_IronIngot_C', perMin: 40 }, { item: 'Desc_Coal_C', perMin: 40 }]);
  assert.deepEqual(s.outs, [{ item: 'Desc_SteelIngot_C', perMin: 60 }]);
  const b = R['Recipe_SteelBeam_C'];
  assert.equal(b.alt, false);
  assert.deepEqual(b.ins, [{ item: 'Desc_SteelIngot_C', perMin: 60 }]);
  assert.deepEqual(b.outs, [{ item: 'Desc_SteelPlate_C', perMin: 15 }]);
  const p = R['Recipe_SteelPipe_C'];
  assert.deepEqual(p.ins, [{ item: 'Desc_SteelIngot_C', perMin: 30 }]);
  assert.deepEqual(p.outs, [{ item: 'Desc_SteelPipe_C', perMin: 20 }]);
});

test('dados: Water é fluido e bruto; Iron Ingot é sólido e não bruto', () => {
  assert.equal(data.items['Desc_Water_C'].fluid, true);
  assert.equal(data.items['Desc_Water_C'].raw, true);
  assert.equal(data.items['Desc_IronIngot_C'].fluid, false);
  assert.equal(data.items['Desc_IronIngot_C'].raw, false);
});

test('dados: só receitas das 11 máquinas de produção, e todo prédio tem tamanho', () => {
  assert.equal(Object.keys(data.buildings).length, 11);
  for (const r of Object.values(R)) assert.ok(data.buildings[r.building], r.id);
  assert.equal(data.buildings['Build_FoundryMk1_C'].w, 10); assert.equal(data.buildings['Build_OilRefinery_C'].l, 22);
  assert.equal(R['Recipe_Beam_Connector_C'], undefined);
});
