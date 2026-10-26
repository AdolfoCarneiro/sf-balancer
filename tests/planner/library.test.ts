import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, InputBlock } from '../../src/planner/model/types.ts';
import { addBlock, connect } from '../../src/planner/model/factory.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import {
  addEntry, cleanLibrary, currentEntry, entryFactory, libraryFile, libraryOf, mergeFile, openEntry, putCurrent,
  readLibraryFile, removeEntry, renameEntry, splitFactory, uniqueName, MAX_FACTORIES,
} from '../../src/planner/model/library.ts';

const data = game as GameData;
const empty: Factory = { v: 2, blocks: [], links: [] };
const ex = exampleFactory(data);

test('lista: começa com uma, nova abre, renomear sem repetir nome, abrir, apagar (a última fica)', () => {
  let lib = libraryOf('Ferro', ex, 1);
  assert.equal(currentEntry(lib).name, 'Ferro');
  assert.deepEqual(entryFactory(currentEntry(lib), data), ex);
  lib = addEntry(lib, 'Ferro', empty, 2)!;
  assert.deepEqual(lib.items.map(e => e.name), ['Ferro', 'Ferro (2)']);
  assert.equal(lib.current, lib.items[1].id);
  lib = renameEntry(lib, lib.items[1].id, '  Aço  ');
  assert.equal(lib.items[1].name, 'Aço');
  assert.equal(renameEntry(lib, lib.items[1].id, '   '), lib);
  assert.equal(renameEntry(lib, lib.items[1].id, 'Ferro').items[1].name, 'Ferro (2)');
  lib = openEntry(lib, lib.items[0].id);
  assert.equal(currentEntry(lib).name, 'Ferro');
  lib = removeEntry(lib, lib.items[0].id);
  assert.deepEqual(lib.items.map(e => e.name), ['Aço']);
  assert.equal(currentEntry(lib).name, 'Aço');
  assert.equal(removeEntry(lib, lib.items[0].id), lib);
  assert.equal(uniqueName(lib, 'Aço'), 'Aço (2)');
});

test('lista: putCurrent só muda quando a fábrica muda; leitura saneada (entrada ruim some, current inválido vai para a primeira)', () => {
  const lib = libraryOf('A', ex, 1);
  assert.equal(putCurrent(lib, ex, 5), lib);
  const changed = putCurrent(lib, empty, 5);
  assert.equal(changed.items[0].updated, 5);
  const raw = JSON.parse(JSON.stringify({ ...changed, current: 'zz', items: [...changed.items, { id: 'f9', name: 'x', data: '!!' }, { id: 'f1', name: 'dup', data: changed.items[0].data }, 'lixo'] }));
  const back = cleanLibrary(raw, data)!;
  assert.deepEqual(back.items.map(e => e.id), ['f1']);
  assert.equal(back.current, 'f1');
  assert.equal(cleanLibrary({ v: 1, items: [] }, data), null);
  assert.equal(cleanLibrary(null, data), null);
});

test('lista cheia: addEntry recusa', () => {
  let lib = libraryOf('A', empty, 1);
  for (let i = 1; i < MAX_FACTORIES; i++) lib = addEntry(lib, 'A', empty, 1)!;
  assert.equal(lib.items.length, MAX_FACTORIES);
  assert.equal(addEntry(lib, 'A', empty, 1), null);
});

test('arquivo de backup: ida e volta, outro JSON não entra, juntar não troca a aberta e renomeia repetidos', () => {
  const lib = addEntry(libraryOf('Ferro', ex, 1), 'Aço', empty, 2)!;
  const list = readLibraryFile(libraryFile(lib), data)!;
  assert.deepEqual(list.map(x => x.name), ['Ferro', 'Aço']);
  assert.deepEqual(list[0].factory, ex);
  assert.equal(readLibraryFile('{"Data": []}', data), null);
  assert.equal(readLibraryFile('não é json', data), null);
  const { lib: merged, added } = mergeFile(lib, list, 3);
  assert.equal(added, 2);
  assert.deepEqual(merged.items.map(e => e.name), ['Ferro', 'Aço', 'Ferro (2)', 'Aço (2)']);
  assert.equal(merged.current, lib.current);
});

test('separar a seleção: a parte leva os blocos e as ligações de dentro; o que cruza vira Entrada e Saída dos dois lados', () => {
  // Miner -> Iron Ingot -> Iron Plate; separa o Iron Ingot.
  let f = addBlock(empty, data, { kind: 'miner', item: 'Desc_OreIron_C' }, [0, 0]);
  f = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_IngotIron_C' }, [80, 0]);
  f = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_IronPlate_C' }, [160, 0]);
  const [ore, ingot, plate] = f.blocks.map(b => b.id);
  f = connect(f, data, ore, ingot, 'Desc_OreIron_C');
  f = connect(f, data, ingot, plate, 'Desc_IronIngot_C');
  const { part, rest } = splitFactory(f, [ingot], data)!;
  const kinds = (g: Factory) => g.blocks.map(b => b.kind).sort();
  assert.deepEqual(kinds(part), ['export', 'input', 'recipe']);
  const inp = part.blocks.find(b => b.kind === 'input') as InputBlock;
  assert.deepEqual([inp.item, inp.rate], ['Desc_OreIron_C', null]);
  assert.ok(part.links.some(l => l.from === inp.id && l.to === ingot));
  assert.ok(part.links.some(l => l.from === ingot && part.blocks.find(b => b.id === l.to)?.kind === 'export'));
  assert.ok(part.map![ingot]);
  // No que ficou: o Miner manda para uma Saída e o Iron Plate recebe de uma Entrada de Iron Ingot.
  assert.deepEqual(kinds(rest), ['export', 'input', 'miner', 'recipe']);
  const rin = rest.blocks.find(b => b.kind === 'input') as InputBlock;
  assert.equal(rin.item, 'Desc_IronIngot_C');
  assert.ok(rest.links.some(l => l.from === rin.id && l.to === plate));
  assert.ok(!rest.blocks.some(b => b.id === ingot));
  assert.equal(splitFactory(f, ['nada'], data), null);
});
