import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData } from '../../src/planner/model/types.ts';
import { addBlock, connect, MAX_STAGES } from '../../src/planner/model/factory.ts';
import { decodeFactory, encodeFactory } from '../../src/planner/model/factorystate.ts';
import { PASTE_STEP, copyBlocks, pasteBlocks } from '../../src/planner/model/clipboard.ts';

const data = game as GameData;
const empty: Factory = { v: 2, blocks: [], links: [] };
// Miner -> Iron Ingot -> Iron Plate, em (0,0), (80,0), (160,0).
const chain = (): Factory => {
  let f = addBlock(empty, data, { kind: 'miner', item: 'Desc_OreIron_C' }, [0, 0]);
  f = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_IngotIron_C' }, [80, 0]);
  f = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_IronPlate_C' }, [160, 0]);
  const [a, b, c] = f.blocks.map(x => x.id);
  f = connect(f, data, a, b, 'Desc_OreIron_C');
  return connect(f, data, b, c, 'Desc_IronIngot_C');
};

test('copiar: os blocos, só as ligações entre eles e as posições das duas vistas', () => {
  const f = chain(), [a, b] = f.blocks.map(x => x.id);
  const clip = copyBlocks(f, [b, f.blocks[2].id, 'nada'], f.map!, f.montar ?? f.map!)!;
  assert.deepEqual(clip.blocks.map(x => x.id), [b, f.blocks[2].id]);
  assert.equal(clip.links.length, 1);
  assert.ok(!clip.links.some(l => l.from === a));
  assert.deepEqual(Object.keys(clip.map!).sort(), [b, f.blocks[2].id].sort());
  assert.equal(copyBlocks(f, ['nada'], f.map!, f.map!), null);
  // A cópia passa pelo navegador no formato do link e volta igual.
  assert.deepEqual(decodeFactory(encodeFactory(clip), data)!.blocks, clip.blocks);
});

test('colar: ids novos, a ligação de dentro refeita, no ponto dado na vista atual e ao lado na outra', () => {
  const f = chain(), [, b, c] = f.blocks.map(x => x.id);
  const clip = copyBlocks(f, [b, c], f.map!, f.montar ?? f.map!)!;
  const { factory: g, ids } = pasteBlocks(f, clip, data, 'montar', [400, 200]);
  assert.equal(ids.length, 2);
  assert.equal(g.blocks.length, 5);
  assert.ok(ids.every(id => !f.blocks.some(x => x.id === id)));
  assert.ok(g.links.some(l => l.from === ids[0] && l.to === ids[1] && l.item === 'Desc_IronIngot_C'));
  assert.equal(g.links.length, 3);
  // Montar: o canto da cópia em (400, 200); Planta: o original ao lado.
  assert.deepEqual([g.montar![ids[0]].x, g.montar![ids[0]].y], [400, 200]);
  assert.deepEqual([g.map![ids[0]].x, g.map![ids[0]].y], [f.map![b].x + PASTE_STEP, f.map![b].y + PASTE_STEP]);
  // Os de antes não mudam de lugar.
  assert.deepEqual(g.map![b], f.map![b]);
  // Sem ponto (Duplicar): ao lado do original nas duas.
  const dup = pasteBlocks(f, clip, data, 'planta', null);
  assert.deepEqual([dup.factory.map![dup.ids[0]].x, dup.factory.map![dup.ids[0]].y], [f.map![b].x + PASTE_STEP, f.map![b].y + PASTE_STEP]);
});

test('colar para no limite de blocos', () => {
  let f = empty;
  for (let i = 0; i < MAX_STAGES - 1; i++) f = addBlock(f, data, { kind: 'sink' }, [i * 8, 0]);
  const clip = copyBlocks(chain(), chain().blocks.map(x => x.id), chain().map!, chain().map!)!;
  const r = pasteBlocks(f, clip, data, 'planta', null);
  assert.equal(r.ids.length, 1);
  assert.equal(r.factory.blocks.length, MAX_STAGES);
});
