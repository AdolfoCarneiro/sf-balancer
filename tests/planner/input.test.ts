import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, InputBlock, RecipeBlock } from '../../src/planner/model/types.ts';
import { addBlock, canConnect, connect, portsOf, setInputRate } from '../../src/planner/model/factory.ts';
import { decodeFactory, encodeFactory, reduce, type History } from '../../src/planner/model/factorystate.ts';
import { solveFactory } from '../../src/planner/model/solve.ts';
import { factoryBalance } from '../../src/planner/model/portstate.ts';
import { itemEntries } from '../../src/planner/model/picker.ts';
import { close } from './fixtures.ts';

const data = game as GameData;
const empty: Factory = { v: 2, blocks: [], links: [] };
// Entrada de Iron Ingot ligada em 4 Iron Plate fixadas (120 de Iron Ingot por minuto).
const plates = (rate: number | null): Factory => {
  let f = addBlock(empty, data, { kind: 'input', item: 'Desc_IronIngot_C' }, [0, 0]);
  f = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_IronPlate_C' }, [80, 0]);
  const [inp, plate] = f.blocks;
  f = { ...f, blocks: f.blocks.map(b => (b.id === plate.id ? { ...(b as RecipeBlock), limits: { machines: 4 } } : b)) };
  f = connect(f, data, inp.id, plate.id, 'Desc_IronIngot_C');
  return rate === null ? f : setInputRate(f, inp.id, rate);
};

test('Entrada: qualquer item (não só minério), uma saída, nasce sem limite e liga como origem', () => {
  const f = addBlock(empty, data, { kind: 'input', item: 'Desc_Plastic_C' }, [0, 0]);
  const b = f.blocks[0] as InputBlock;
  assert.deepEqual(b, { id: b.id, kind: 'input', item: 'Desc_Plastic_C', rate: null });
  assert.deepEqual(portsOf(b, data), { ins: [], outs: ['Desc_Plastic_C'] });
  // Item que não existe: não cria.
  assert.equal(addBlock(empty, data, { kind: 'input', item: 'Desc_Nada_C' }, [0, 0]).blocks.length, 0);
  const g = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_Computer_C' }, [80, 0]);
  assert.ok(canConnect(g, data, b.id, g.blocks[1].id, 'Desc_Plastic_C').ok);
});

test('Entrada sem limite dá o que pedem; com limite, falta o resto; o Balanço conta em Entra', () => {
  const free = solveFactory(plates(null), data);
  const [inp, plate] = plates(null).blocks;
  close(free.blocks[inp.id].x!, 120);
  close(free.blocks[plate.id].x!, 4);
  assert.equal(free.blocks[plate.id].ins[0].deficit, 0);
  assert.deepEqual(factoryBalance(plates(null), free, data).ins, [{ item: 'Desc_IronIngot_C', rate: 120 }]);
  const lim = solveFactory(plates(90), data);
  close(lim.blocks[inp.id].x!, 90);
  close(lim.blocks[plate.id].ins[0].deficit, 30);
});

test('Entrada: limite pela ação (null volta a sem limite), salva e lê de volta; lixo some na leitura', () => {
  let f = plates(null);
  const id = f.blocks[0].id;
  const act = (g: Factory, rate: number | null) => reduce({ past: [], present: g, future: [], limit: 50 } as History<Factory>, { type: 'setInputRate', id, rate }, data).present;
  f = act(f, 300);
  assert.equal((f.blocks[0] as InputBlock).rate, 300);
  assert.equal(setInputRate(f, id, -5), f);
  const back = decodeFactory(encodeFactory(f), data)!;
  assert.deepEqual(back.blocks[0], f.blocks[0]);
  f = act(f, null);
  assert.equal((f.blocks[0] as InputBlock).rate, null);
  const bad = { v: 2, blocks: [{ id: 's1', kind: 'input', item: 'Desc_Nada_C', rate: null }, { id: 's2', kind: 'input', item: 'Desc_Plastic_C', rate: 'x' }], links: [] };
  assert.equal(decodeFactory(encodeFactory(bad as unknown as Factory), data)?.blocks.length ?? 0, 0);
});

test('seletor, segundo passo da Entrada: todos os itens, o que começa com a busca primeiro', () => {
  assert.equal(itemEntries(data, '').length, Object.keys(data.items).length);
  const r = itemEntries(data, 'plastic');
  assert.equal(r[0].title, 'Plastic');
  assert.ok(r.every(e => e.spec.kind === 'input' && /plastic/i.test(e.title)));
});
