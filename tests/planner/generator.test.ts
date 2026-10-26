import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, GeneratorBlock } from '../../src/planner/model/types.ts';
import { addBlock, connect, portsOf, setGenerator } from '../../src/planner/model/factory.ts';
import { decodeFactory, encodeFactory } from '../../src/planner/model/factorystate.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { factoryBalance } from '../../src/planner/model/portstate.ts';
import { pickerEntries } from '../../src/planner/model/picker.ts';
import { genPerRow, markerGeo } from '../../src/planner/model/solved.ts';
import { buildScene } from '../../src/planner/model/map/scene.ts';
import { close } from './fixtures.ts';

const data = game as GameData;
const empty: Factory = { v: 2, blocks: [], links: [] };
const FUEL = 'Build_GeneratorFuel_C', COAL = 'Build_GeneratorCoal_C', NUKE = 'Build_GeneratorNuclear_C';
// Entrada de `item` (taxa fixa) ligada a um gerador.
const fed = (building: string, fuel: string, rate: number): Factory => {
  let f = addBlock(empty, data, { kind: 'input', item: fuel }, [0, 0]);
  f = { ...f, blocks: f.blocks.map(b => (b.kind === 'input' ? { ...b, rate } : b)) };
  f = addBlock(f, data, { kind: 'generator', building, fuel }, [80, 0]);
  return connect(f, data, f.blocks[0].id, f.blocks[1].id, fuel);
};

test('dados dos geradores (Docs): consumo por minuto, água e resíduo', () => {
  const g = data.generators!;
  const fuel = (b: string, it: string) => g[b].fuels.find(x => x.item === it)!;
  assert.equal(g[FUEL].power, 250);
  assert.equal(fuel(FUEL, 'Desc_LiquidFuel_C').perMin, 20);
  assert.equal(fuel(FUEL, 'Desc_LiquidTurboFuel_C').perMin, 7.5);
  assert.deepEqual(fuel(COAL, 'Desc_Coal_C'), { item: 'Desc_Coal_C', perMin: 15, water: 45, waste: null });
  assert.deepEqual(fuel(NUKE, 'Desc_NuclearFuelRod_C'), { item: 'Desc_NuclearFuelRod_C', perMin: 0.2, water: 240, waste: { item: 'Desc_NuclearWaste_C', perMin: 10 } });
});

test('gerador livre queima o que chega: 100 de Fuel = 5 Fuel-Powered Generators, 1.250 MW no Balanço', () => {
  const f = fed(FUEL, 'Desc_LiquidFuel_C', 100);
  const r = solveFactory(f, data), gen = f.blocks[1];
  close(r.blocks[gen.id].x!, 5);
  assert.equal(r.blocks[gen.id].machines, 5);
  close(factoryBalance(f, r, data).power, 1250);
});

test('gerador fixado: falta o combustível que não chega; clock na potência', () => {
  let f = fed(FUEL, 'Desc_LiquidFuel_C', 30);
  const id = f.blocks[1].id;
  f = setGenerator(f, data, id, { count: 2 });
  const r = solveFactory(f, data);
  close(r.blocks[id].x!, 1.5);
  close(r.blocks[id].ins[0].deficit, 10);
  f = setGenerator(f, data, id, { count: 1, clock: 150 });
  const r2 = solveFactory(f, data);
  close(r2.blocks[id].x!, 1.5);
  close(factoryBalance(f, r2, data).power, 375);
  assert.equal(r2.blocks[id].ins[0].deficit, 0);
});

test('nuclear: água e resíduo nas portas; trocar o combustível solta a ligação do antigo; salva e lê de volta', () => {
  let f = addBlock(empty, data, { kind: 'generator', building: NUKE, fuel: 'Desc_NuclearFuelRod_C' }, [0, 0]);
  const g = f.blocks[0] as GeneratorBlock;
  assert.deepEqual(portsOf(g, data), { ins: ['Desc_NuclearFuelRod_C', 'Desc_Water_C'], outs: ['Desc_NuclearWaste_C'] });
  f = addBlock(f, data, { kind: 'input', item: 'Desc_NuclearFuelRod_C' }, [-80, 0]);
  f = connect(f, data, f.blocks[1].id, g.id, 'Desc_NuclearFuelRod_C');
  assert.equal(f.links.length, 1);
  const p = setGenerator(f, data, g.id, { fuel: 'Desc_PlutoniumFuelRod_C' });
  assert.equal((p.blocks[0] as GeneratorBlock).fuel, 'Desc_PlutoniumFuelRod_C');
  assert.equal(p.links.length, 0);
  assert.equal((setGenerator(f, data, g.id, { fuel: 'Desc_Coal_C' }).blocks[0] as GeneratorBlock).fuel, 'Desc_NuclearFuelRod_C');
  const back = decodeFactory(encodeFactory(setGenerator(f, data, g.id, { count: 3, clock: 200 })), data)!;
  assert.deepEqual(back.blocks[0], { ...g, count: 3, clock: 200 });
});

test('seletor: de uma saída de Fuel aparece o Fuel-Powered Generator; do vazio, o grupo Energia', () => {
  const fromFuel = pickerEntries(data, '', { consumes: 'Desc_LiquidFuel_C' }).special.map(e => e.spec);
  assert.ok(fromFuel.some(s => s.kind === 'generator' && s.building === FUEL && s.fuel === 'Desc_LiquidFuel_C'));
  const all = pickerEntries(data, '').special.filter(e => e.spec.kind === 'generator');
  assert.equal(all.length, Object.values(data.generators!).reduce((n, g) => n + g.fuels.length, 0));
});

test('energia gasta: máquinas × MW do prédio × (clock/100)^1,321929; extrator pelo clock dele; saldo no Balanço', () => {
  // 100 de Fuel -> 5 geradores (1.250 MW); 1 Constructor de Iron Rod a 100 % (4 MW) e um Oil Extractor a 250 % (40 × 2,5^1,321929).
  let f = fed(FUEL, 'Desc_LiquidFuel_C', 100);
  f = addBlock(f, data, { kind: 'input', item: 'Desc_IronIngot_C' }, [0, 160]);
  f = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_IronRod_C' }, [80, 160]);
  const ing = f.blocks.at(-2)!.id, rod = f.blocks.at(-1)!.id;
  f = { ...f, blocks: f.blocks.map(b => (b.id === rod ? { ...b, limits: { machines: 1 } } : b)) as Factory['blocks'] };
  f = connect(f, data, ing, rod, 'Desc_IronIngot_C');
  f = addBlock(f, data, { kind: 'extractor', building: 'Build_OilPump_C', item: 'Desc_LiquidOil_C' }, [-80, 80]);
  f = { ...f, blocks: f.blocks.map(b => (b.kind === 'extractor' ? { ...b, clock: 250 } : b)) as Factory['blocks'] };
  const bal = factoryBalance(f, solveFactory(f, data), data);
  close(bal.power, 1250);
  close(bal.use, 4 + 40 * Math.pow(2.5, 1.321929));
});

test('gerador ocupa o tamanho dele na Planta: fileiras de quantos cabem na linha mais apertada', () => {
  const g = data.generators!;
  assert.deepEqual([FUEL, COAL, NUKE, 'Build_GeneratorBiomass_Automated_C'].map(b => [g[b].w, g[b].l]), [[20, 20], [10, 26], [36, 43], [8, 8]]);
  // Fuel: 20 m³/min por gerador num cano Mk2 (600) = 30 por fileira; Coal: a água (45) aperta antes do carvão = 13;
  // Nuclear: a água (240) = 2.
  const gen = (building: string, fuel: string): GeneratorBlock => ({ id: 'g', kind: 'generator', building, fuel, count: null });
  assert.equal(genPerRow(data, gen(FUEL, 'Desc_LiquidFuel_C')), 30);
  assert.equal(genPerRow(data, gen(COAL, 'Desc_Coal_C')), 13);
  assert.equal(genPerRow(data, gen(NUKE, 'Desc_NuclearFuelRod_C')), 2);
  // 100 de Fuel = 5 geradores de 20 × 20 numa fileira, com o cano em cima: 100 × 24 m, uma Junction por gerador.
  const f = fed(FUEL, 'Desc_LiquidFuel_C', 100), r = solveFactory(f, data), id = f.blocks[1].id;
  const geo = markerGeo(f.blocks[1] as GeneratorBlock, r.blocks[id], data);
  assert.deepEqual([geo.w, geo.h], [100, 24]);
  assert.equal(geo.pieces.filter(p => p.kind === 'machine').length, 5);
  assert.equal(geo.pieces.filter(p => p.kind === 'junction').length, 5);
  assert.deepEqual(geo.ins.map(a => [a.x, a.y, a.row]), [[0, 2, 0]]);
  close(geo.belts[0].rate, 100);
  // Fixado em 3 Nuclear: 2 fileiras (2 + 1), cada uma com barra, água e resíduo; a scene não marca como fora de escala.
  let n = addBlock(empty, data, { kind: 'generator', building: NUKE, fuel: 'Desc_NuclearFuelRod_C' }, [0, 0]);
  n = setGenerator(n, data, n.blocks[0].id, { count: 3 });
  const rn = solveFactory(n, data), nid = n.blocks[0].id;
  const ng = markerGeo(n.blocks[0] as GeneratorBlock, rn.blocks[nid], data);
  assert.deepEqual([ng.w, ng.h], [72, 2 * (3 * 4 + 43)]);
  assert.deepEqual(ng.ins.map(a => a.row), [0, 0, 1, 1]);
  assert.deepEqual(ng.outs.map(a => [a.x, a.row]), [[72, 0], [72, 1]]);
  const scene = buildScene(n, data, { [nid]: { x: 0, y: 0, rot: 0 } }, {}, rn);
  assert.equal(scene.blocks[0].marker, false);
});
