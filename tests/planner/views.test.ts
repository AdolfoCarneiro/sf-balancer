import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { Factory, GameData, MapPlace } from '../../src/planner/model/types.ts';
import { type Action, type History, decodeFactory, encodeFactory, exampleFactory, reduce } from '../../src/planner/model/factorystate.ts';
import { addBlock, addLinkedBlock, removeBlock, removeBlocks } from '../../src/planner/model/factory.ts';
import { montarLig, montarPlace, montarPlaces } from '../../src/planner/model/views.ts';
import { historyNew, encodeShare } from '../../src/logic/index.js';

const data = game as GameData;
const ex = exampleFactory(data);
const IRON = 'Desc_IronIngot_C:s1>s2', STEEL = 'Desc_SteelIngot_C:s2>s3,s4';
const MAP: Record<string, MapPlace> = { s1: { x: 0, y: 0, rot: 0 }, s2: { x: 64, y: 0, rot: 0, gapRow: 4 }, s3: { x: 128, y: 0, rot: 0 }, s4: { x: 128, y: 64, rot: 0 } };
const placed: Factory = { ...ex, map: MAP };
const run = (f: Factory, ...as: Action[]): History<Factory> => as.reduce<History<Factory>>((h, a) => reduce(h, a, data), historyNew(f));

test('vistas: fábrica sem montar mostra as posições do map nas duas', () => {
  const bare = (p: MapPlace): MapPlace => ({ x: p.x, y: p.y, rot: 0 });   // a Montar guarda só o lugar
  for (const id of ['s1', 's2', 's3', 's4']) assert.deepEqual(montarPlace(placed, id), bare(MAP[id]));
  assert.deepEqual(montarPlaces(placed, MAP), Object.fromEntries(Object.entries(MAP).map(([k, v]) => [k, bare(v)])));
  assert.equal(montarPlace(ex, 's1'), undefined);
  // Ligação: sem montarLigs, a da Planta.
  const f: Factory = { ...placed, ligs: { [IRON]: { x: 8, y: 8, rot: 1 } } };
  assert.deepEqual(montarLig(f, IRON), { x: 8, y: 8, rot: 1 });
  assert.equal(montarLig({ ...f, montarLigs: {} }, IRON), undefined);   // com o objeto: só o dele (o resto, automático)
});

test('vistas: placeBlock na Planta muda só o map; na Montar, só o montar', () => {
  let h = run(placed, { type: 'placeBlock', id: 's1', place: { x: 16, y: 8, rot: 0 }, view: 'planta' });
  assert.deepEqual(h.present.map!.s1, { x: 16, y: 8, rot: 0 });
  assert.deepEqual(montarPlace(h.present, 's1'), { x: 0, y: 0, rot: 0 });   // a Montar fica onde estava
  assert.deepEqual(montarPlace(h.present, 's2'), { x: 64, y: 0, rot: 0 });   // quem não mudou continua seguindo a Planta
  assert.equal(h.past.length, 1);
  h = run(placed, { type: 'placeBlock', id: 's1', place: { x: 24, y: 0, rot: 0 }, view: 'montar' });
  assert.deepEqual(h.present.map, MAP);
  assert.deepEqual(h.present.montar, { s1: { x: 24, y: 0, rot: 0 } });
  // Sem vista: a Planta (como antes).
  h = run(placed, { type: 'placeBlock', id: 's3', place: { x: 200, y: 0, rot: 0 } });
  assert.deepEqual(h.present.map!.s3, { x: 200, y: 0, rot: 0 });
  assert.deepEqual(montarPlace(h.present, 's3'), MAP.s3);
});

test('vistas: o giro é só da Planta (R na Montar gira o bloco real); a Montar guarda só o lugar', () => {
  // R na Montar = o Girar do painel: placeBlock na Planta com o giro novo. A Montar não muda (nem ganha posição própria).
  for (const together of [false, true]) {
    const f: Factory = { ...placed, montar: { s1: { x: 200, y: 200, rot: 0 } } };
    let h = run(f, { type: 'placeBlock', id: 's2', place: { ...MAP.s2, rot: 1 }, view: 'planta', together });
    assert.equal(h.present.map!.s2.rot, 1);
    assert.deepEqual(h.present.montar, f.montar);
    assert.deepEqual(montarPlace(h.present, 's2'), { x: 64, y: 0, rot: 0 });   // segue o lugar do map, que não andou
    h = run(f, { type: 'placeBlock', id: 's1', place: { x: 0, y: 0, rot: 3 }, view: 'planta', together });
    assert.deepEqual(h.present.montar!.s1, { x: 200, y: 200, rot: 0 });
  }
  // Montar grava sem giro (e sem vãos).
  const h = run(placed, { type: 'placeBlock', id: 's2', place: { x: 72, y: 0, rot: 2, gapRow: 3 }, view: 'montar' });
  assert.equal(h.present.map!.s2.rot, 0);
  assert.deepEqual(h.present.montar!.s2, { x: 72, y: 0, rot: 0 });
  // E lê sem giro.
  assert.deepEqual(decodeFactory(encodeShare({ ...placed, montar: { s1: { x: 8, y: 8, rot: 3 } } }), data)!.montar, { s1: { x: 8, y: 8, rot: 0 } });
});

test('vistas: setPlaces da Montar não mexe na Planta (nem nas derivadas, sem map)', () => {
  const h = run(ex, { type: 'setPlaces', view: 'montar', places: { s1: { x: 8, y: 8, rot: 0 }, s2: { x: 80, y: 8, rot: 0 }, nope: { x: 0, y: 0, rot: 0 } } });
  assert.equal(h.present.map, undefined);
  assert.deepEqual(h.present.montar, { s1: { x: 8, y: 8, rot: 0 }, s2: { x: 80, y: 8, rot: 0 } });
});

test('vistas: Planta derivada (sem map) arrastada congela a Montar onde ela estava (auto)', () => {
  const auto = MAP;   // o que a Planta mostrava (derivado)
  const h = run(ex, { type: 'setPlaces', view: 'planta', places: { ...MAP, s1: { x: 40, y: 40, rot: 0 } }, auto });
  assert.deepEqual(h.present.map!.s1, { x: 40, y: 40, rot: 0 });
  assert.deepEqual(h.present.montar, { s1: { x: 0, y: 0, rot: 0 } });
});

test('vistas: Mover junto leva o mesmo deslocamento à outra vista, num passo só', () => {
  // Montar com s1 em outro lugar; arrastar na Planta +16, +8.
  const f: Factory = { ...placed, montar: { s1: { x: 200, y: 200, rot: 0 } } };
  let h = run(f, { type: 'placeBlock', id: 's1', place: { x: 16, y: 8, rot: 0 }, view: 'planta', together: true });
  assert.equal(h.past.length, 1);
  assert.deepEqual(h.present.map!.s1, { x: 16, y: 8, rot: 0 });
  assert.deepEqual(h.present.montar!.s1, { x: 216, y: 208, rot: 0 });
  assert.deepEqual(reduce(h, { type: 'undo' }, data).present, f);
  // Da Montar para a Planta (o giro da Planta fica).
  const g: Factory = { ...f, map: { ...MAP, s1: { x: 0, y: 0, rot: 1 } } };
  h = run(g, { type: 'setPlaces', view: 'montar', together: true, places: { ...montarPlaces(g, g.map!), s1: { x: 208, y: 192, rot: 0 } } });
  assert.deepEqual(h.present.map!.s1, { x: 8, y: -8, rot: 1 });
  assert.deepEqual(h.present.map!.s2, MAP.s2);
  // Sem map, a Planta derivada (auto) fica toda salva, para as outras não pularem.
  h = run(ex, { type: 'setPlaces', view: 'montar', together: true, auto: MAP, places: { ...MAP, s4: { x: 136, y: 64, rot: 0 } } });
  assert.deepEqual(h.present.map, { ...MAP, s4: { x: 136, y: 64, rot: 0 } });
  // Desligado: a outra não anda.
  h = run(f, { type: 'placeBlock', id: 's1', place: { x: 16, y: 8, rot: 0 }, view: 'planta', together: false });
  assert.deepEqual(h.present.montar!.s1, { x: 200, y: 200, rot: 0 });
});

test('vistas: bloco novo nasce nas duas no mesmo ponto; apagar limpa as duas', () => {
  const f: Factory = { ...placed, montar: { s1: { x: 200, y: 200, rot: 0 } } };
  const a = addBlock(f, data, { kind: 'sink' }, [300, 300]), id = a.blocks.at(-1)!.id;
  assert.deepEqual(a.map![id], { x: 304, y: 304, rot: 0 });
  assert.deepEqual(a.montar![id], a.map![id]);
  const b = addLinkedBlock(f, data, { kind: 'sink' }, { block: 's1', item: 'Desc_IronIngot_C', side: 'out' }, [400, 0]), id2 = b.blocks.at(-1)!.id;
  assert.equal(b.blocks.length, f.blocks.length + 1);
  assert.deepEqual(b.montar![id2], b.map![id2]);
  // Sem montar, a Montar já segue o map.
  const c = addBlock(placed, data, { kind: 'sink' }, [300, 300]);
  assert.equal(c.montar, undefined);
  assert.deepEqual(montarPlace(c, c.blocks.at(-1)!.id), c.map![c.blocks.at(-1)!.id]);
  assert.equal(removeBlock(a, 's1').montar!.s1, undefined);
  assert.equal(removeBlock(a, 's1').map!.s1, undefined);
  const r = removeBlocks(a, ['s1', id]);
  assert.deepEqual(Object.keys(r.montar!), []);
  assert.deepEqual(Object.keys(r.map!), ['s2', 's3', 's4']);
});

test('vistas: encode/decode guardam montar e montarLigs; lixo sai', () => {
  const f: Factory = { ...placed, ligs: { [IRON]: { x: 8, y: 8, rot: 0 } }, montar: { s1: { x: 200, y: 200, rot: 0 } }, montarLigs: { [STEEL]: { x: 16, y: 16, rot: 0 } } };
  assert.deepEqual(decodeFactory(encodeFactory(f), data), f);
  // montarLigs vazio continua (a Montar não segue mais as ligs).
  const e: Factory = { ...placed, ligs: { [IRON]: { x: 8, y: 8, rot: 0 } }, montarLigs: {} };
  assert.deepEqual(decodeFactory(encodeFactory(e), data), e);
  const raw = {
    ...placed, montar: { s1: { x: 'a', y: 0, rot: 0 }, s2: { x: 8, y: 8, rot: 7 }, nope: { x: 0, y: 0, rot: 0 }, s3: { x: 8, y: 8, rot: 0, gapRow: 3 } },
    montarLigs: { 'x:y>z': { x: 0, y: 0, rot: 0 }, [IRON]: { x: 1e12, y: 0, rot: 0 } },
  };
  const d = decodeFactory(encodeShare(raw), data)!;
  assert.deepEqual(d.montar, { s3: { x: 8, y: 8, rot: 0 } });
  assert.deepEqual(Object.keys(d.montarLigs!), [IRON]);
  assert.equal(decodeFactory(encodeShare({ ...placed, montar: 'x', montarLigs: [1] }), data)!.montar, undefined);
  // Fábrica de antes: abre igual, sem os campos novos.
  const old = decodeFactory(encodeFactory(placed), data)!;
  assert.equal('montar' in old, false);
  assert.equal('montarLigs' in old, false);
});

test('vistas: ligação (chip) por vista, com Mover junto e o congelamento da Montar', () => {
  // Planta sem montarLigs: a Montar fica com as que seguia (copiadas), e a nova não a leva junto.
  const f: Factory = { ...placed, ligs: { [STEEL]: { x: 304, y: 0, rot: 0 } } };
  let h = run(f, { type: 'placeLig', meio: IRON, place: { x: 40, y: 40, rot: 0 }, view: 'planta' });
  assert.deepEqual(h.present.ligs![IRON], { x: 40, y: 40, rot: 0 });
  assert.deepEqual(h.present.montarLigs, { [STEEL]: { x: 304, y: 0, rot: 0 } });
  assert.equal(montarLig(h.present, IRON), undefined);   // na Montar continua no automático
  // Montar: só a dela.
  h = run(f, { type: 'placeLig', meio: STEEL, place: { x: 16, y: 16, rot: 0 }, view: 'montar' });
  assert.deepEqual(h.present.ligs, f.ligs);
  assert.deepEqual(h.present.montarLigs, { [STEEL]: { x: 16, y: 16, rot: 0 } });
  // Voltar ao automático na Montar não mexe na Planta.
  h = reduce(h, { type: 'placeLig', meio: STEEL, place: null, view: 'montar' }, data);
  assert.deepEqual(h.present.montarLigs, {});
  assert.deepEqual(h.present.ligs, f.ligs);
  // Mover junto: o mesmo deslocamento na outra (a automática vem de shown).
  h = run(f, { type: 'placeLig', meio: IRON, place: { x: 48, y: 40, rot: 0 }, view: 'montar', together: true, shown: { montar: { x: 40, y: 40, rot: 0 }, planta: { x: 80, y: 0, rot: 1 } } });
  assert.equal(h.past.length, 1);
  assert.deepEqual(h.present.montarLigs![IRON], { x: 48, y: 40, rot: 0 });
  assert.deepEqual(h.present.ligs![IRON], { x: 88, y: 0, rot: 1 });
  h = run(f, { type: 'placeLig', meio: STEEL, place: { x: 312, y: 8, rot: 0 }, view: 'planta', together: true });
  assert.deepEqual(h.present.montarLigs![STEEL], { x: 312, y: 8, rot: 0 });
  // R (na Planta ou na Montar) gira a ligação da Planta; o chip da Montar fica onde estava (o retângulo de antes).
  for (const together of [false, true]) {
    h = run(f, { type: 'placeLig', meio: STEEL, place: { x: 304, y: 0, rot: 1 }, view: 'planta', together });
    assert.deepEqual(h.present.ligs![STEEL], { x: 304, y: 0, rot: 1 });
    assert.deepEqual(h.present.montarLigs, { [STEEL]: { x: 304, y: 0, rot: 0 } });
  }
  // Voltar ao automático na Planta não congela a Montar que ainda seguia as ligs: volta junto.
  h = run(f, { type: 'placeLig', meio: STEEL, place: null, view: 'planta' });
  assert.equal(h.present.ligs, undefined);
  assert.equal(h.present.montarLigs, undefined);
  // Com a Montar no lugar dela, só a Planta volta.
  h = run({ ...f, montarLigs: { [STEEL]: { x: 16, y: 16, rot: 0 } } }, { type: 'placeLig', meio: STEEL, place: null, view: 'planta' });
  assert.deepEqual(h.present.montarLigs, { [STEEL]: { x: 16, y: 16, rot: 0 } });
  // Ligação que não existe: nada muda.
  assert.equal(run(f, { type: 'placeLig', meio: 'x:y>z', place: { x: 0, y: 0, rot: 0 }, view: 'montar' }).present, f);
});

test('vistas: propor de novo vale só para a vista atual', () => {
  const f: Factory = { ...placed, ligs: { [STEEL]: { x: 300, y: 0, rot: 0 } }, montar: { s1: { x: 200, y: 200, rot: 0 } } };
  const prop: Record<string, MapPlace> = { s1: { x: 0, y: 0, rot: 0 }, s2: { x: 64, y: 0, rot: 0 }, s3: { x: 128, y: 0, rot: 0 }, s4: { x: 128, y: 96, rot: 0 } };
  let h = run(f, { type: 'proposeMap', view: 'montar', places: prop });
  assert.deepEqual(h.present.montar, prop);
  assert.deepEqual(h.present.montarLigs, {});   // chips da Montar no automático
  assert.deepEqual(h.present.map, MAP);
  assert.deepEqual(h.present.ligs, f.ligs);
  h = run(f, { type: 'proposeMap', view: 'planta', places: prop });
  assert.deepEqual(h.present.map, prop);
  assert.equal('ligs' in h.present, false);
  // A Montar fica igual: s1 com a dela, s4 (que mudou na Planta) congelado, a ligação que seguia a Planta copiada.
  assert.deepEqual(montarPlaces(h.present, prop), { ...MAP, s1: { x: 200, y: 200, rot: 0 }, s2: { x: 64, y: 0, rot: 0 } });
  assert.deepEqual(h.present.montarLigs, f.ligs);
});
