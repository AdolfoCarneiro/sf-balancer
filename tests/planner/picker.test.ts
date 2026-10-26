import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { GameData } from '../../src/planner/model/types.ts';
import { pickerEntries, pickerGroups } from '../../src/planner/model/picker.ts';
import { setLang } from '../../src/i18n/index.js';

const data = game as GameData;
const inLang = <T>(l: string, f: () => T): T => { setLang(l); try { return f(); } finally { setLang('pt'); } };

test('seletor de uma saída sólida: quem consome + Sink, Container e Saída', () => {
  const r = pickerEntries(data, '', { consumes: 'Desc_SteelIngot_C' });
  assert.deepEqual(r.special.map(e => e.spec.kind), ['sink', 'container', 'export']);
  assert.ok(r.recipes.some(e => e.title === 'Steel Beam') && r.recipes.every(e => e.ins.includes('Desc_SteelIngot_C')));
  assert.ok(r.recipes.every(e => e.spec.kind === 'recipe'));
});

test('seletor de uma saída fluida não oferece o Awesome Sink', () => {
  const r = pickerEntries(data, '', { consumes: 'Desc_Water_C' });
  assert.deepEqual(r.special.map(e => e.spec.kind), ['container', 'export']);
  assert.ok(r.recipes.length > 0 && r.recipes.every(e => e.ins.includes('Desc_Water_C')));
});

test('seletor de uma entrada de minério: Miner; de água: Water Extractor e Resource Well Extractor', () => {
  assert.deepEqual(pickerEntries(data, '', { produces: 'Desc_OreIron_C' }).special.map(e => e.spec), [{ kind: 'miner', item: 'Desc_OreIron_C' }]);
  const w = pickerEntries(data, '', { produces: 'Desc_Water_C' });
  assert.deepEqual(w.special.map(e => e.spec).sort((a: any, b: any) => a.building.localeCompare(b.building)), [
    { kind: 'extractor', building: 'Build_FrackingExtractor_C', item: 'Desc_Water_C' },
    { kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C' },
  ]);
  assert.ok(w.recipes.some(e => e.title === 'Aluminum Scrap') && w.recipes.every(e => e.outs.includes('Desc_Water_C')));
  // Item feito por receita: nenhuma origem.
  assert.deepEqual(pickerEntries(data, '', { produces: 'Desc_IronIngot_C' }).special, []);
});

test('seletor sem filtro: Miner por minério sólido, extrator por item, depois Sink, Container e Saída', () => {
  const r = pickerEntries(data, '', undefined);
  const kinds = r.special.map(e => e.spec.kind);
  const raws = Object.values(data.items).filter(i => i.raw && !i.fluid).map(i => i.id).sort();
  assert.deepEqual(r.special.filter(e => e.spec.kind === 'miner').map(e => (e.spec as any).item).sort(), raws);
  assert.equal(r.special.filter(e => e.spec.kind === 'extractor').length, Object.values(data.extractors).reduce((n, x) => n + x.items.length, 0));
  assert.deepEqual(kinds.slice(-3), ['sink', 'container', 'export']);
  assert.equal(r.recipes.length, Object.keys(data.recipes).length);
  // Cartão de receita: ícone do produto, prédio no subtítulo.
  const pure = r.recipes.find(e => e.spec.kind === 'recipe' && e.spec.recipe === 'Recipe_Alternate_PureIronIngot_C')!;
  assert.equal(pure.icon, '/icons/Desc_IronIngot_C.webp');
  assert.equal(pure.sub, 'Refinery');
  assert.deepEqual(pure.ins, ['Desc_OreIron_C', 'Desc_Water_C']);
  assert.deepEqual(pure.outs, ['Desc_IronIngot_C']);
  assert.ok(r.special.every(e => e.icon === null || e.icon.startsWith('/icons/')));
});

test('alternativas marcadas e depois das normais', () => {
  const r = pickerEntries(data, 'iron ingot').recipes;
  const first = r.findIndex(e => e.alt);
  assert.ok(first > 0);
  assert.ok(r.slice(0, first).every(e => !e.alt) && r.slice(first).every(e => e.alt));
  assert.equal(r[0].title, 'Iron Ingot');
  assert.ok(r.some(e => e.alt && e.title === 'Pure Iron Ingot'));
});

test('busca casa com o nome da especial (no idioma da tela) e com o item da origem', () => {
  assert.deepEqual(pickerEntries(data, 'sink').special.map(e => e.spec.kind), ['sink']);
  assert.deepEqual(pickerEntries(data, 'iron ore').special.map(e => e.spec), [{ kind: 'miner', item: 'Desc_OreIron_C' }]);
  inLang('pt', () => assert.deepEqual(pickerEntries(data, 'saída').special.map(e => e.spec.kind), ['export']));
  inLang('en', () => assert.deepEqual(pickerEntries(data, 'export').special.map(e => e.spec.kind), ['export']));
  assert.deepEqual(pickerEntries(data, 'zzz nada'), { special: [], recipes: [] });
});

test('Container de fluido usa o ícone do Fluid Buffer', () => {
  const c = pickerEntries(data, '', { consumes: 'Desc_Water_C' }).special.find(e => e.spec.kind === 'container')!;
  assert.equal(c.icon, '/icons/Build_PipeStorageTank_C.webp');
  const s = pickerEntries(data, '', { consumes: 'Desc_SteelIngot_C' }).special.find(e => e.spec.kind === 'container')!;
  assert.equal(s.icon, '/icons/Build_StorageContainerMk1_C.webp');
});

test('seletor de uma saída: receitas comuns primeiro, alternativas depois, Converter e FICSMAS por último', () => {
  const r = pickerEntries(data, '', { consumes: 'Desc_IronIngot_C' }).recipes.map(e => e.title);
  assert.deepEqual(r.slice(0, 2), ['Iron Plate', 'Iron Rod']);
  const at = (n: string) => r.indexOf(n);
  assert.ok(at('Solid Steel Ingot') > at('Iron Rod'));
  assert.ok(at('Ficsite Ingot (Iron)') > at('Solid Steel Ingot') && at('Ficsite Ingot (Iron)') > at('Iron Wire'));
  assert.equal(r.at(-1), 'Iron FICSMAS Ornament');
  // Busca digitada: o nome exato da saída vem primeiro, e o evento fica depois do resto que casou.
  const s = pickerEntries(data, 'ingot').recipes.map(e => e.title);
  assert.ok(s.indexOf('Iron Ingot') < s.indexOf('Ficsite Ingot (Iron)'));
  assert.equal(pickerEntries(data, 'iron ingot').recipes[0].title, 'Iron Ingot');
  const orn = pickerEntries(data, 'ornament').recipes.map(e => e.title);
  assert.ok(orn.length > 0 && orn.every(n => /FICSMAS/.test(n)));
});

test('seletor vindo de uma porta: receitas primeiro, depois Sink, Container e Saída; sem filtro, especiais primeiro', () => {
  const from = pickerGroups(pickerEntries(data, '', { consumes: 'Desc_IronIngot_C' }), { consumes: 'Desc_IronIngot_C' });
  assert.deepEqual(from.map(g => g.kind), ['recipes', 'special']);
  const flat = from.flatMap(g => g.entries.map(e => e.spec.kind === 'recipe' ? e.title : e.spec.kind));
  assert.deepEqual(flat.slice(0, 2), ['Iron Plate', 'Iron Rod']);
  assert.deepEqual(flat.slice(-3), ['sink', 'container', 'export']);
  const up = pickerGroups(pickerEntries(data, '', { produces: 'Desc_Water_C' }), { produces: 'Desc_Water_C' });
  assert.deepEqual(up.map(g => g.kind), ['recipes', 'special']);
  assert.deepEqual(pickerGroups(pickerEntries(data, ''), undefined).map(g => g.kind), ['special', 'recipes']);
  // Grupo vazio não aparece.
  const miner = pickerEntries(data, '', { produces: 'Desc_OreIron_C' }).special;
  assert.deepEqual(pickerGroups({ special: miner, recipes: [] }, { produces: 'Desc_OreIron_C' }).map(g => g.kind), ['special']);
});

test('seletor: dentro de cada grupo, as receitas de prédio mais simples vêm antes (relevância), depois o nome', () => {
  const titles = (f: { consumes?: string; produces?: string }) => pickerEntries(data, '', f).recipes.map(e => e.title);
  // Barra de ferro: as do Constructor antes; Solid Steel antes do Ficsite.
  const iron = titles({ consumes: 'Desc_IronIngot_C' });
  assert.deepEqual(iron.slice(0, 2), ['Iron Plate', 'Iron Rod']);
  assert.ok(iron.indexOf('Solid Steel Ingot') < iron.indexOf('Ficsite Ingot (Iron)'));
  // Alternativas também: Constructor (Cast Screws, Iron Pipe, Iron Wire) antes de Assembler e Foundry.
  const alts = pickerEntries(data, '', { consumes: 'Desc_IronIngot_C' }).recipes.filter(e => e.alt).map(e => e.title);
  assert.deepEqual(alts.slice(0, 3), ['Cast Screws', 'Iron Pipe', 'Iron Wire']);
  // Água: Refinery e Packager antes do Blender (Biochemical Sculptor e Cooling System no fim das normais).
  const water = pickerEntries(data, '', { consumes: 'Desc_Water_C' }).recipes.filter(e => !e.alt).map(e => e.title);
  assert.ok(water.indexOf('Packaged Water') < water.indexOf('Biochemical Sculptor'));
  assert.ok(water.indexOf('Sulfuric Acid') < water.indexOf('Biochemical Sculptor'));
  assert.ok(water.indexOf('Alumina Solution') < water.indexOf('Cooling System'));
});
