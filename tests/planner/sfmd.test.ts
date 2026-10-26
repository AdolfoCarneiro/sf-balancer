import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Block, ExtractorBlock, Factory, GameData, MinerBlock, RecipeBlock } from '../../src/planner/model/types.ts';
import { parseMax, parseSfmd, type SfmdReport } from '../../src/planner/model/sfmd.ts';
import { decodeFactory, encodeFactory } from '../../src/planner/model/factorystate.ts';
import { MAP_GRID } from '../../src/planner/model/map/sizes.ts';
import { CARD_MAX_M_PER_PX, blockCardSize } from '../../src/planner/model/map/cards.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';

const data = game as GameData;
// Exemplos do SatisfactorySolver (BSD-3, licença ao lado dos arquivos).
const fixture = (name: string) => readFileSync(new URL(`../../docs/superpowers/research/2026-10-26-fase5/sfmd/${name}`, import.meta.url), 'utf8');
const ok = (text: string): { factory: Factory; report: SfmdReport } => {
  const r = parseSfmd(text, data);
  assert.ok('factory' in r, 'devia importar');
  return r;
};
const recipeName = (b: Block) => (b.kind === 'recipe' ? data.recipes[b.recipe].name : b.kind);
const itemName = (id: string) => data.items[id].name;
const edges = (f: Factory) => f.links.map(l => `${l.from}>${l.to}:${itemName(l.item)}`).sort();

test('Max do Modeler: inteiro, fração, misto ("13 1/3"), decimal; vazio ou lixo = null', () => {
  assert.equal(parseMax('180'), 180);
  assert.equal(parseMax('1/2'), 0.5);
  assert.ok(Math.abs(parseMax('13 1/3')! - 40 / 3) < 1e-12);
  assert.ok(Math.abs(parseMax('13 1/5')! - 13.2) < 1e-12);
  assert.equal(parseMax('2.5'), 2.5);
  assert.equal(parseMax(7), 7);
  for (const bad of [undefined, null, '', '  ', 'abc', '1/0', '-3', '0', '3/x', {}, '1 2 3 4 5 6 7 8 9']) assert.equal(parseMax(bad), null, String(bad));
});

test('duo.sfmd: Miner de Iron Ore 180/min, 2 Iron Ingot livres, 3 Iron Rod fixados 8/2/2, ligações do consumidor', () => {
  const { factory: f, report } = ok(fixture('duo.sfmd'));
  assert.deepEqual(f.blocks.map(recipeName), ['miner', 'Iron Ingot', 'Iron Ingot', 'Iron Rod', 'Iron Rod', 'Iron Rod']);
  const [ore, i1, i2, r1, r2, r3] = f.blocks;
  assert.deepEqual(ore, { id: ore.id, kind: 'miner', item: 'Desc_OreIron_C', rate: 180 } satisfies MinerBlock);
  assert.equal((i1 as RecipeBlock).limits, undefined);
  assert.equal((i2 as RecipeBlock).limits, undefined);
  assert.deepEqual([r1, r2, r3].map(b => (b as RecipeBlock).limits?.machines), [8, 2, 2]);
  assert.deepEqual([r1, r2, r3].map(b => (b as RecipeBlock).clock), [100, 100, 100]);
  assert.deepEqual(edges(f), [
    `${ore.id}>${i1.id}:Iron Ore`, `${ore.id}>${i2.id}:Iron Ore`,
    `${i1.id}>${r1.id}:Iron Ingot`, `${i2.id}>${r1.id}:Iron Ingot`, `${i2.id}>${r2.id}:Iron Ingot`, `${i2.id}>${r3.id}:Iron Ingot`,
  ].sort());
  assert.deepEqual(report, { blocks: 6, links: 6, skipped: [], asExport: [], ignored: [], adjusted: [] });
});

test('duo.sfmd: posições do Modeler na grade de 8 m, mesma ordem relativa, sem dois blocos no mesmo ponto', () => {
  assert.equal(ok(fixture('duo.sfmd')).factory.map, undefined);
  const { factory: f } = ok(fixture('duo.sfmd'));
  const pos = f.blocks.map(b => f.montar![b.id]);
  assert.equal(pos.length, 6);
  for (const p of pos) { assert.equal(p.x % MAP_GRID, 0); assert.equal(p.y % MAP_GRID, 0); assert.equal(p.rot, 0); }
  // X do Modeler: minério (-261) < lingotes (-18, -10) < barras (212, 215, 208); Y: o lingote de baixo (122) abaixo do de cima (-31).
  assert.ok(pos[0].x < pos[1].x && pos[1].x < pos[3].x);
  assert.ok(pos[2].y < pos[1].y);
  assert.ok(pos[5].y < pos[4].y && pos[4].y < pos[3].y);
  assert.equal(new Set(pos.map(p => `${p.x},${p.y}`)).size, 6);
  assert.equal(Math.min(...pos.map(p => p.x)), 0);
  assert.equal(Math.min(...pos.map(p => p.y)), 0);
});

test('simple pure ingot.sfmd: Water Extractor calculado, Miner Mk.3 780/min, Pure Iron Ingot (alternativa)', () => {
  const { factory: f, report } = ok(fixture('simple pure ingot.sfmd'));
  assert.deepEqual(f.blocks.map(recipeName), ['extractor', 'Pure Iron Ingot', 'Pure Iron Ingot', 'miner']);
  const [water, , , ore] = f.blocks;
  assert.deepEqual(water, { id: water.id, kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: null } satisfies ExtractorBlock);
  assert.equal((ore as MinerBlock).rate, 780);
  assert.equal(f.links.length, 4);
  assert.deepEqual(report, { blocks: 4, links: 4, skipped: [], asExport: [], ignored: [], adjusted: [] });
});

test('simple coal generator.sfmd: o gerador vira Saída (listado), Water com Max = 5 extratores', () => {
  const { factory: f, report } = ok(fixture('simple coal generator.sfmd'));
  assert.deepEqual(f.blocks.map(recipeName), ['extractor', 'export', 'miner', 'Compacted Coal', 'miner']);
  assert.equal((f.blocks[0] as ExtractorBlock).count, 5);
  const gen = f.blocks[1];
  assert.deepEqual(edges(f).filter(e => e.includes(`>${gen.id}:`)), [`${f.blocks[0].id}>${gen.id}:Water`, `${f.blocks[3].id}>${gen.id}:Compacted Coal`].sort());
  assert.deepEqual(report.asExport, ['Compacted Coal Generator']);
  assert.deepEqual(report.skipped, []);
  assert.equal(report.links, 4);
});

test('rocket fuel factory.sfmd: Outpost/Parent/ClockSpeed ignorados e listados, Sink pela lista de entradas, extratores pela taxa', () => {
  const { factory: f, report } = ok(fixture('rocket fuel factory.sfmd'));
  // 25 nós, menos o Outpost.
  assert.equal(f.blocks.length, 24);
  assert.equal(report.blocks, 24);
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(report.asExport, ['Rocket Fuel Generator']);
  // Estruturado: o tipo e o nome cru do Modeler (o texto em volta é da interface, nos três idiomas).
  assert.deepEqual(report.ignored, [
    { kind: 'outpost', name: 'Power factory' }, { kind: 'field', name: 'Parent' },
    { kind: 'field', name: 'Capacity' },   // a esteira do AWESOME Sink
    { kind: 'max', name: 'Rocket Fuel Generator' },
  ]);
  // 200 m³/min no Resource Well Extractor (60 cada): 4 extratores dão 240, e o resumo diz.
  // e os dois "13 1/3" Blenders, arredondados para 14 com o clock baixado.
  const blend = { kind: 'machines', name: 'Turbo Blend Fuel', asked: 40 / 3, count: 14, clock: 95.2381 };
  assert.deepEqual(report.adjusted, [blend, blend, { kind: 'extractorRate', name: 'Nitrogen Gas', rate: 200, count: 4, total: 240 }]);
  const byName = (n: string) => f.blocks.filter(b => b.kind === 'recipe' && data.recipes[b.recipe].name === n) as RecipeBlock[];
  // "13 1/3" Blenders: 14 máquinas a 95,24 % (a mesma vazão).
  for (const b of byName('Turbo Blend Fuel')) {
    assert.equal(b.limits?.machines, 14);
    assert.ok(Math.abs(b.clock * 14 / 100 - 40 / 3) < 1e-3);
  }
  assert.equal(byName('Rocket Fuel').length, 3);
  // Sink: Inputs em lista [[índice, "peça"], ...].
  const sink = f.blocks.find(b => b.kind === 'sink')!;
  assert.equal(f.links.filter(l => l.to === sink.id && itemName(l.item) === 'Polymer Resin').length, 2);
  // Nitrogen Gas: 600 e 200 m³/min no Resource Well Extractor (60 por extrator, normal) = 10 e 4.
  const n2 = f.blocks.filter(b => b.kind === 'extractor' && b.item === 'Desc_NitrogenGas_C') as ExtractorBlock[];
  assert.deepEqual(n2.map(b => [b.building, b.count]), [['Build_FrackingExtractor_C', 10], ['Build_FrackingExtractor_C', 4]]);
  const oil = f.blocks.find(b => b.kind === 'extractor' && b.item === 'Desc_LiquidOil_C') as ExtractorBlock;
  assert.deepEqual([oil.building, oil.count], ['Build_OilPump_C', 5]);
  // Gerador com as 3 entradas de Rocket Fuel.
  const gen = f.blocks.find(b => b.kind === 'export')!;
  assert.equal(f.links.filter(l => l.to === gen.id).length, 3);
  assert.equal(report.links, f.links.length);
});

test('nome desconhecido: pulado com o motivo, e as ligações dele somem sem virar badLink', () => {
  const text = JSON.stringify({ Version: '1.0', Data: [
    { Name: 'Iron Ore', X: 0, Y: 0, Max: '60' },
    { Name: 'Mystery Machine', X: 100, Y: 0, Inputs: { 'Iron Ore': [0] } },
    { Name: 'Iron Rod', X: 200, Y: 0, Inputs: { 'Iron Ingot': [1] } },
  ] });
  const { factory: f, report } = ok(text);
  assert.equal(f.blocks.length, 2);
  assert.equal(f.links.length, 0);
  assert.deepEqual(report.skipped, [{ name: 'Mystery Machine', reason: 'unknown' }]);
});

test('ligação para índice que não existe, peça errada ou que o produtor não faz: badLink, o resto fica', () => {
  const text = JSON.stringify({ Data: [
    { Name: 'Iron Ore', X: 0, Y: 0 },
    { Name: 'Iron Ingot', X: 100, Y: 0, Inputs: { 'Iron Ore': [0, 9, -1, 1.5] } },
    { Name: 'Iron Rod', X: 200, Y: 0, Inputs: { 'Iron Ingot': [1], 'Copper Ingot': [1], 'Unobtainium': [1] } },
  ] });
  const { factory: f, report } = ok(text);
  assert.equal(f.links.length, 2);
  assert.equal((f.blocks[0] as MinerBlock).rate, 60);   // sem Max: o padrão do Modeler
  assert.equal(report.skipped.length, 5);
  assert.ok(report.skipped.every(s => s.reason === 'badLink'));
});

test('Inputs com pontos de curva e aninhamento extra: a ligação fica, os pontos entram em ignored', () => {
  const text = JSON.stringify({ Data: [
    { Name: 'Iron Ore', X: 0, Y: 0 },
    { Name: 'Iron Ingot', X: 100, Y: 0, Inputs: { 'Iron Ore': [[0, 'Iron Ore', [10, 20], [30, 40]]] } },
    { Name: 'AWESOME Sink', X: 200, Y: 0, Inputs: [[[1, 'Iron Ingot', { X: 5, Y: 6 }]]] },
    { Name: 'Outpost', X: 0, Y: 0, Inputs: [[]], Title: 'Base' },
  ] });
  const { factory: f, report } = ok(text);
  assert.equal(f.links.length, 2);
  // Os nós são lidos antes das ligações: o Outpost entra antes dos pontos de curva.
  assert.deepEqual(report.ignored, [{ kind: 'outpost', name: 'Base' }, { kind: 'waypoints', name: '' }]);
  assert.deepEqual(report.skipped, []);
});

test('nomes do Modeler que diferem do jogo (Screw, Leached Iron ingot) e Container/Depot', () => {
  const text = JSON.stringify({ Data: [
    { Name: 'Screw', X: 0, Y: 0, Max: '3' }, { Name: 'Cast Screw', X: 0, Y: 0 }, { Name: 'Steel Screw', X: 0, Y: 0 },
    { Name: 'Leached Iron ingot', X: 0, Y: 0 }, { Name: 'Dimensional Depot Uploader', X: 0, Y: 0, Inputs: [[[0, 'Screw']]] },
    { Name: 'Turbo Rifle Ammo', X: 0, Y: 0 },
  ] });
  const { factory: f, report } = ok(text);
  assert.deepEqual(f.blocks.map(b => (b.kind === 'recipe' ? b.recipe : b.kind)), [
    'Recipe_Screw_C', 'Recipe_Alternate_Screw_C', 'Recipe_Alternate_Screw_2_C', 'Recipe_Alternate_IronIngot_Leached_C', 'container',
    'Recipe_CartridgeChaos_C',
  ]);
  assert.equal(f.links.length, 1);
  assert.deepEqual(report.skipped, []);
});

test('arquivo inválido: não-JSON = json; JSON sem Data = format; nada importado', () => {
  assert.deepEqual(parseSfmd('', data), { error: 'json' });
  assert.deepEqual(parseSfmd('{not json', data), { error: 'json' });
  assert.deepEqual(parseSfmd('[1,2]', data), { error: 'format' });
  assert.deepEqual(parseSfmd('{"v":2,"blocks":[]}', data), { error: 'format' });
  assert.deepEqual(parseSfmd('{"Data":{}}', data), { error: 'format' });
  assert.deepEqual(parseSfmd('null', data), { error: 'format' });
  // Nós sem nome: lixo, não fábrica.
  assert.deepEqual(parseSfmd('{"Data":[1,"a",{"X":1}]}', data), { error: 'format' });
});

test('a fábrica importada sobrevive à leitura do estado salvo (#p= e localStorage) sem perder nada', () => {
  for (const name of ['duo.sfmd', 'simple pure ingot.sfmd', 'simple coal generator.sfmd', 'rocket fuel factory.sfmd']) {
    const { factory: f } = ok(fixture(name));
    assert.deepEqual(decodeFactory(encodeFactory(f), data), f, name);
  }
});

test('números ajustados: contagem fracionária, vazão acima do que os extratores fecham e cortes nos limites', () => {
  const text = JSON.stringify({ Data: [
    { Name: 'Water', Max: '5/2' },
    { Name: 'Crude Oil', Max: '130', Capacity: 'Pure' },
    { Name: 'Iron Rod', Max: '20000' },
    { Name: 'Nitrogen Gas', Max: '1000000' },
    { Name: 'Iron Ore', Max: '2000000' },
    { Name: 'Crude Oil', Max: '480', Capacity: 'Pure' },
  ] });
  const { factory: f, report } = ok(text);
  assert.deepEqual(report.adjusted, [
    { kind: 'extractorCount', name: 'Water', asked: 2.5, count: 3 },
    { kind: 'extractorRate', name: 'Crude Oil', rate: 130, count: 1, total: 240 },
    { kind: 'clamp', name: 'Iron Rod', asked: 20000, max: 10000 },
    { kind: 'clamp', name: 'Nitrogen Gas', asked: 1000000 / 60, max: 1000 },
    { kind: 'clamp', name: 'Iron Ore', asked: 2000000, max: 1e6 },
  ]);
  assert.deepEqual(f.blocks.map(b => (b.kind === 'extractor' ? b.count : b.kind === 'miner' ? b.rate : (b as RecipeBlock).limits?.machines)), [3, 1, 10000, 1000, 1e6, 2]);
});

test('Max fracionário de receita ("13 1/5"): 14 máquinas a 94,29 % e o resumo diz; inteiro não entra em ajustados', () => {
  const text = JSON.stringify({ Data: [{ Name: 'Iron Rod', Max: '13 1/5' }, { Name: 'Iron Plate', Max: '14' }] });
  const { factory: f, report } = ok(text);
  const [rod, plate] = f.blocks as RecipeBlock[];
  assert.equal(rod.limits?.machines, 14);
  assert.equal(rod.clock, 94.2857);
  assert.equal(plate.limits?.machines, 14);
  assert.equal(plate.clock, 100);
  assert.deepEqual(report.adjusted, [{ kind: 'machines', name: 'Iron Rod', asked: 13.2, count: 14, clock: 94.2857 }]);
});

test('rocket fuel factory.sfmd: nenhum cartão da Montar em cima de outro em zoom nenhum, com o desenho do Modeler', () => {
  const { factory: f } = ok(fixture('rocket fuel factory.sfmd'));
  const flow = solveFactory(f, data);
  // O maior que o cartão fica no mundo (de longe): sem cruzar assim, não cruza em zoom nenhum.
  const rects = f.blocks.map(b => {
    const p = f.montar![b.id], sz = blockCardSize(b, data, flow);
    return { id: b.id, x0: p.x, y0: p.y, x1: p.x + sz.w * CARD_MAX_M_PER_PX, y1: p.y + sz.h * CARD_MAX_M_PER_PX };
  });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      assert.ok(!(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1), `${a.id} e ${b.id} se cruzam`);
    }
  }
  // O desenho cresce por igual: quem estava à esquerda no Modeler continua à esquerda (ou na mesma coluna).
  const raw = JSON.parse(fixture('rocket fuel factory.sfmd')).Data.filter((n: { Name: string }) => n.Name !== 'Outpost');
  f.blocks.forEach((a, i) => f.blocks.forEach((b, j) => {
    if (raw[i].X < raw[j].X) assert.ok(f.montar![a.id].x <= f.montar![b.id].x, `${a.id} à esquerda de ${b.id}`);
  }));
});

test('Splurger e Container com quem puxa viram ligação direta; Container vazio vira Entrada; [índice, nº da saída] não liga no nó 0', () => {
  const { factory: f, report } = ok(JSON.stringify({ Data: [
    { Name: 'Crude Oil', X: 0, Y: 0, Max: '120' },
    { Name: 'Iron Ore', X: 0, Y: 100, Max: '480' },
    { Name: 'Iron Ore', X: 0, Y: 200, Max: '480' },
    { Name: 'Splurger', X: 100, Y: 100, Inputs: [[[1, 'Iron Ore'], [2, 'Iron Ore']]] },
    { Name: 'Iron Ingot', X: 200, Y: 100, Inputs: { 'Iron Ore': [[3, 0]] } },
    { Name: 'Storage Container', X: 300, Y: 100, Inputs: [[[4, 'Iron Ingot']]] },
    { Name: 'Iron Rod', X: 400, Y: 100, Inputs: { 'Iron Ingot': [[5, 0, [[350, 120]]]] } },
    { Name: 'Storage Container', X: 400, Y: 200, Inputs: [[[3, 0]]] },
    { Name: 'Storage Container', X: 300, Y: 300, Inputs: [[]] },
    { Name: 'Iron Plate', X: 400, Y: 300, Inputs: { 'Iron Ingot': [[8, [[350, 320]]]] } },
  ] }));
  assert.deepEqual(f.blocks.map(recipeName), ['extractor', 'miner', 'miner', 'Iron Ingot', 'Iron Rod', 'container', 'Iron Plate', 'input']);
  const [, m1, m2, ingot, rod, box, plate, inp] = f.blocks;
  assert.deepEqual(inp, { id: inp.id, kind: 'input', item: 'Desc_IronIngot_C', rate: null });
  // No lugar do Container vazio.
  assert.ok(f.montar![inp.id].x < f.montar![plate.id].x);
  assert.deepEqual(edges(f), [
    `${m1.id}>${ingot.id}:Iron Ore`, `${m2.id}>${ingot.id}:Iron Ore`, `${ingot.id}>${rod.id}:Iron Ingot`,
    `${m1.id}>${box.id}:Iron Ore`, `${m2.id}>${box.id}:Iron Ore`, `${inp.id}>${plate.id}:Iron Ingot`,
  ].sort());
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(report.ignored, [
    { kind: 'relay', name: 'Splurger' }, { kind: 'relay', name: 'Storage Container' },
    { kind: 'emptyRelay', name: 'Storage Container' }, { kind: 'waypoints', name: '' },
  ]);
});

test('ClockSpeed da receita vira o clock; com máquinas fracionárias, a mesma vazão', () => {
  const { factory: f, report } = ok(JSON.stringify({ Data: [
    { Name: 'Iron Rod', X: 0, Y: 0, Max: '1', ClockSpeed: '150' },
    { Name: 'Iron Rod', X: 0, Y: 100, Max: '1 1/2', ClockSpeed: '200' },
    { Name: 'Iron Rod', X: 0, Y: 200, ClockSpeed: '33.3333333333333' },
  ] }));
  const [a, b, c] = f.blocks as RecipeBlock[];
  assert.deepEqual([a.limits?.machines, a.clock], [1, 150]);
  // 1,5 máquina a 200 % = 2 máquinas a 150 %.
  assert.deepEqual([b.limits?.machines, b.clock], [2, 150]);
  assert.deepEqual([c.limits, c.clock], [undefined, 33.3333]);
  assert.ok(!report.ignored.some(x => x.name === 'ClockSpeed'));
});
