import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, GeneratorBlock } from '../../src/planner/model/types.ts';
import { addBlock, connect, portsOf, setGenerator } from '../../src/planner/model/factory.ts';
import { decodeFactory, encodeFactory } from '../../src/planner/model/factorystate.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { factoryBalance } from '../../src/planner/model/portstate.ts';
import { pickerEntries } from '../../src/planner/model/picker.ts';
import { rowStage } from '../../src/planner/model/solved.ts';
import { blockGeo } from '../../src/planner/model/map/block.ts';
import { perRowOf } from '../../src/planner/model/stage.ts';
import { reduce, type Action } from '../../src/planner/model/factorystate.ts';
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

test('gerador ocupa o tamanho dele na Planta: fileiras como as da receita, pela receita do gerador', () => {
  const g = data.generators!;
  assert.deepEqual([FUEL, COAL, NUKE, 'Build_GeneratorBiomass_Automated_C'].map(b => [g[b].w, g[b].l]), [[20, 20], [10, 26], [36, 43], [8, 8]]);
  // Quantos por fileira, pela linha mais apertada no tier padrão: Fuel 600/20 = 30; Coal, a água (600/45) = 13;
  // Nuclear, a água (600/240) = 2.
  const per = (building: string, fuel: string) => {
    const s = rowStage({ id: 'g', kind: 'generator', building, fuel, count: null }, undefined, data);
    return perRowOf(s.stage, s.data);
  };
  assert.deepEqual([per(FUEL, 'Desc_LiquidFuel_C'), per(COAL, 'Desc_Coal_C'), per(NUKE, 'Desc_NuclearFuelRod_C')], [30, 13, 2]);
  // 100 de Fuel = 5 geradores de 20 m numa fileira só.
  const f = fed(FUEL, 'Desc_LiquidFuel_C', 100), r = solveFactory(f, data), id = f.blocks[1].id;
  const s = rowStage(f.blocks[1] as GeneratorBlock, r.blocks[id], data), geo = blockGeo(s.stage, s.data);
  assert.equal(s.data.recipes[s.stage.recipe].building, FUEL);
  assert.equal(geo.w, 100);
  assert.equal(geo.pieces.filter(p => p.kind === 'machine').length, 5);
  assert.deepEqual(geo.ins.map(a => a.row), [0]);
  // A scene desenha em escala (não é marcador) e a ligação chega na fileira.
  const scene = buildScene(f, data, { [f.blocks[0].id]: { x: 0, y: 0, rot: 0 }, [id]: { x: 80, y: 0, rot: 0 } }, {}, r);
  assert.equal(scene.blocks.find(b => b.stage === id)!.marker, false);
});

const act = (f: Factory, a: Action): Factory => reduce({ past: [], present: f, future: [], limit: 50 }, a, data).present;

test('gerador: arranjo, por linha e tier editáveis e salvos; trocar o combustível tira o tier dele', () => {
  let f = addBlock(empty, data, { kind: 'generator', building: COAL, fuel: 'Desc_Coal_C' }, [0, 0]);
  const id = f.blocks[0].id;
  f = setGenerator(f, data, id, { count: 20 });
  f = act(f, { type: 'setLayout', id, layout: { kind: 'backToBack' } });
  f = act(f, { type: 'setPerRow', id, perRow: 10 });
  f = act(f, { type: 'setTier', id, side: 'ins', item: 'Desc_Coal_C', tier: 'Mk2' });
  f = act(f, { type: 'setTier', id, side: 'ins', item: 'Desc_Water_C', tier: 'Mk1' });
  const g = f.blocks[0] as GeneratorBlock;
  assert.deepEqual([g.layout, g.perRow, g.tiers], [{ kind: 'backToBack' }, 10, { 'in:Desc_Coal_C': 'Mk2', 'in:Desc_Water_C': 'Mk1' }]);
  const back = decodeFactory(encodeFactory(f), data)!.blocks[0] as GeneratorBlock;
  assert.deepEqual([back.layout, back.perRow, back.tiers], [g.layout, g.perRow, g.tiers]);
  const r = solveFactory(f, data), s = rowStage(g, r.blocks[id], data);
  assert.equal(blockGeo(s.stage, s.data).pieces.filter(p => p.kind === 'machine').length, 20);
  f = setGenerator(f, data, id, { fuel: 'Desc_PetroleumCoke_C' });
  assert.deepEqual((f.blocks[0] as GeneratorBlock).tiers, { 'in:Desc_Water_C': 'Mk1' });
});
