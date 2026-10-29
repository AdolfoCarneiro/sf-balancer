import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/planner/data/game.json' with { type: 'json' };
import type { ExtractorBlock, Factory, GameData, MinerBlock, RecipeBlock } from '../../src/planner/model/types.ts';
import {
  PURITY, MINER_DEFAULT, portsOf, addBlock, addLinkedBlock, removeBlock, canConnect, connect, disconnect, setRecipe, setLimits,
  setClock, setPerRow, setTier, setCollect, setMinerRate, setExtractor, placeLig, meiosOf, minerToExtractor, extractorRate,
} from '../../src/planner/model/factory.ts';
import { exampleFactory } from '../../src/planner/model/factorystate.ts';
import { MAX_LINKS, MAX_STAGES } from '../../src/planner/model/factory.ts';

const data = game as GameData;
const empty: Factory = { v: 2, blocks: [], links: [] };
const ex = exampleFactory(data);
const snapEx = structuredClone(ex);
const rb = (f: Factory, id: string) => f.blocks.find(b => b.id === id) as RecipeBlock;

// scrap (Aluminum Scrap: sai sucata e água), sink1, box1 (Container), out1 (Saída).
function outlets(): Factory {
  let f = addBlock(empty, data, { kind: 'recipe', recipe: 'Recipe_AluminumScrap_C' }, [0, 0]);
  f = addBlock(f, data, { kind: 'sink' }, [100, 0]);
  f = addBlock(f, data, { kind: 'container' }, [100, 40]);
  f = addBlock(f, data, { kind: 'export' }, [100, 80]);
  return f;
}

test('fábrica: bloco de receita no vazio nasce com uma fileira cheia fixada e posição na grade', () => {
  const f = addBlock(empty, data, { kind: 'recipe', recipe: 'Recipe_Alternate_PureIronIngot_C' }, [13, -5]);
  const b = f.blocks[0] as RecipeBlock;
  assert.deepEqual(b, { id: 's1', kind: 'recipe', recipe: 'Recipe_Alternate_PureIronIngot_C', clock: 100, perRow: null, tiers: {}, limits: { machines: 7 } });
  assert.deepEqual(f.map![b.id], { x: 16, y: -8, rot: 0 });
  // Vale para todo bloco criado no vazio, não só o primeiro.
  const g = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_Alternate_IngotSteel_1_C' }, [0, 0]);
  assert.deepEqual(rb(g, 's2').limits, { machines: 8 });   // a saída de aço (60/min) limita: 480 ÷ 60
});

test('fábrica: mineradora, extrator e blocos de sobra nascem com os padrões; spec inválida não muda nada', () => {
  let f = addBlock(empty, data, { kind: 'miner', item: 'Desc_OreIron_C' }, [0, 0]);
  f = addBlock(f, data, { kind: 'extractor', building: 'Build_OilPump_C', item: 'Desc_LiquidOil_C' }, [0, 0]);
  f = addBlock(f, data, { kind: 'sink' }, [0, 0]);
  assert.deepEqual(f.blocks, [
    // Miner: Mk.1 em nó normal, um só (60/min, o padrão do Modeler).
    { id: 's1', kind: 'extractor', building: 'Build_MinerMk1_C', item: 'Desc_OreIron_C', purity: 'normal', count: 1 },
    { id: 's2', kind: 'extractor', building: 'Build_OilPump_C', item: 'Desc_LiquidOil_C', purity: 'normal', count: 1 },
    { id: 's3', kind: 'sink' },
  ]);
  assert.equal(MINER_DEFAULT, 60);
  // Water Extractor: a ferramenta calcula quantos (o de nó, como o Oil, nasce com um).
  const w = addBlock(f, data, { kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C' }, [0, 0]);
  assert.equal((w.blocks.at(-1) as ExtractorBlock).count, null);
  assert.deepEqual(PURITY, { impure: 0.5, normal: 1, pure: 2 });
  for (const spec of [
    { kind: 'recipe', recipe: 'Nope' }, { kind: 'miner', item: 'Desc_Water_C' }, { kind: 'miner', item: 'Desc_IronIngot_C' },
    { kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_LiquidOil_C' }, { kind: 'extractor', building: 'Build_Nope', item: 'Desc_Water_C' },
    { kind: 'boss' },
  ] as any[]) assert.equal(addBlock(f, data, spec, [0, 0]), f);
});

test('fábrica: portas de cada tipo de bloco', () => {
  const f = outlets();
  assert.deepEqual(portsOf(f.blocks[0], data), { ins: ['Desc_AluminaSolution_C', 'Desc_Coal_C'], outs: ['Desc_AluminumScrap_C', 'Desc_Water_C'] });
  assert.deepEqual(portsOf(f.blocks[1], data), { ins: 'solid', outs: [] });
  assert.deepEqual(portsOf(f.blocks[2], data), { ins: 'any', outs: [] });
  assert.deepEqual(portsOf(f.blocks[3], data), { ins: 'any', outs: [] });
  assert.deepEqual(portsOf({ id: 'm', kind: 'miner', item: 'Desc_Coal_C', rate: 60 }, data), { ins: [], outs: ['Desc_Coal_C'] });
});

test('fábrica: bloco puxado de uma saída nasce livre e ligado', () => {
  const f = addLinkedBlock(ex, data, { kind: 'recipe', recipe: 'Recipe_SteelBeam_C' }, { block: 's2', item: 'Desc_SteelIngot_C', side: 'out' }, [800, 400]);
  const b = rb(f, 's5');
  assert.equal(b.limits, undefined);
  assert.deepEqual(f.links[f.links.length - 1], { id: 'l4', item: 'Desc_SteelIngot_C', from: 's2', to: 's5' });
  assert.deepEqual(f.map!.s5, { x: 800, y: 400, rot: 0 });
  // Puxado de uma entrada para trás: o novo produz e alimenta a porta.
  const g = addLinkedBlock(ex, data, { kind: 'miner', item: 'Desc_Coal_C' }, { block: 's2', item: 'Desc_Coal_C', side: 'in' }, [0, 0]);
  assert.deepEqual(g.links[g.links.length - 1], { id: 'l4', item: 'Desc_Coal_C', from: 's5', to: 's2' });
  assert.deepEqual(ex, snapEx);
});

test('fábrica: bloco puxado incompatível com a porta não muda nada', () => {
  const port = { block: 's2', item: 'Desc_SteelIngot_C', side: 'out' } as const;
  assert.equal(addLinkedBlock(ex, data, { kind: 'recipe', recipe: 'Recipe_Alternate_PureIronIngot_C' }, port, [0, 0]), ex);
  assert.equal(addLinkedBlock(ex, data, { kind: 'miner', item: 'Desc_Coal_C' }, port, [0, 0]), ex);
  assert.equal(addLinkedBlock(ex, data, { kind: 'recipe', recipe: 'Recipe_SteelBeam_C' }, { ...port, block: 'nope' }, [0, 0]), ex);
  const f = outlets();
  assert.equal(addLinkedBlock(f, data, { kind: 'sink' }, { block: 's1', item: 'Desc_Water_C', side: 'out' }, [0, 0]), f);
  assert.equal(addLinkedBlock(f, data, { kind: 'container' }, { block: 's1', item: 'Desc_Water_C', side: 'out' }, [0, 0]).links.length, 1);
});

test('fábrica: loop liberado (B alimenta A que está antes); self continua proibido', () => {
  let f = addBlock(empty, data, { kind: 'recipe', recipe: 'Recipe_Alternate_RecycledRubber_C' }, [0, 0]);
  f = addBlock(f, data, { kind: 'recipe', recipe: 'Recipe_Alternate_Plastic_1_C' }, [100, 0]);
  f = connect(f, data, 's1', 's2', 'Desc_Rubber_C');
  f = connect(f, data, 's2', 's1', 'Desc_Plastic_C');
  assert.deepEqual(f.links.map(l => [l.from, l.to, l.item]), [['s1', 's2', 'Desc_Rubber_C'], ['s2', 's1', 'Desc_Plastic_C']]);
  assert.deepEqual(canConnect(f, data, 's1', 's1', 'Desc_Rubber_C'), { ok: false, reason: 'self' });
  assert.deepEqual(canConnect(f, data, 's1', 's2', 'Desc_Rubber_C'), { ok: false, reason: 'dup' });
  assert.deepEqual(canConnect(f, data, 's1', 's2', 'Desc_Plastic_C'), { ok: false, reason: 'item' });
  assert.equal(connect(f, data, 's1', 's1', 'Desc_Rubber_C'), f);
});

test('fábrica: fluido não vai para o Awesome Sink; vai para Container e Saída', () => {
  const f = outlets();
  assert.deepEqual(canConnect(f, data, 's1', 's2', 'Desc_Water_C'), { ok: false, reason: 'fluidSink' });
  assert.equal(canConnect(f, data, 's1', 's3', 'Desc_Water_C').ok, true);
  assert.equal(canConnect(f, data, 's1', 's4', 'Desc_Water_C').ok, true);
  assert.equal(canConnect(f, data, 's1', 's2', 'Desc_AluminumScrap_C').ok, true);
  // Bloco de sobra não tem saída; mineradora só sai com o próprio item.
  const g = addBlock(f, data, { kind: 'miner', item: 'Desc_Coal_C' }, [0, 0]);
  assert.deepEqual(canConnect(g, data, 's3', 's1', 'Desc_Coal_C'), { ok: false, reason: 'item' });
  assert.equal(canConnect(g, data, 's5', 's1', 'Desc_Coal_C').ok, true);
  assert.deepEqual(canConnect(g, data, 's5', 's1', 'Desc_OreIron_C'), { ok: false, reason: 'item' });
});

test('fábrica: setRecipe poda ligações, tiers, limites de entrada e coleta que não cabem na receita nova', () => {
  let f = setLimits(ex, 's2', { machines: 60, inputs: { Desc_IronIngot_C: 2400, Desc_Coal_C: 2400 } });
  f = setCollect(f, data, 's2', 'Desc_SteelIngot_C', true);
  f = setTier(f, data, 's2', 'ins', 'Desc_Coal_C', 'Mk5');
  f = setTier(f, data, 's2', 'ins', 'Desc_IronIngot_C', 'Mk5');
  f = setRecipe(f, data, 's2', 'Recipe_IngotSteel_C');   // Steel Ingot: minério de ferro + carvão → aço (sai a barra de ferro)
  const b = rb(f, 's2');
  assert.equal(b.recipe, 'Recipe_IngotSteel_C');
  assert.deepEqual(b.limits, { machines: 60, inputs: { Desc_Coal_C: 2400 } });
  assert.deepEqual(b.collect, ['Desc_SteelIngot_C']);
  assert.deepEqual(b.tiers, { 'in:Desc_Coal_C': 'Mk5' });
  assert.deepEqual(f.links.map(l => l.id), ['l2', 'l3']);
  // Receita sem aço: a coleta some; limites só com entradas que somem viram só máquinas.
  const g = setRecipe(setLimits(f, 's2', { inputs: { Desc_Coal_C: 10 } }), data, 's2', 'Recipe_Alternate_PureIronIngot_C');
  assert.equal(rb(g, 's2').collect, undefined);
  assert.equal(rb(g, 's2').limits, undefined);
  assert.equal(setRecipe(ex, data, 's2', 'Nope'), ex);
});

test('fábrica: setLimits null ou {} volta ao livre; valores inválidos somem', () => {
  assert.equal(rb(setLimits(ex, 's1', null), 's1').limits, undefined);
  assert.equal(rb(setLimits(ex, 's1', {}), 's1').limits, undefined);
  assert.deepEqual(rb(setLimits(ex, 's2', { machines: NaN, inputs: { Desc_Coal_C: -1, Desc_IronIngot_C: 100 } }), 's2').limits, { inputs: { Desc_IronIngot_C: 100 } });
  assert.deepEqual(rb(setLimits(ex, 's2', { machines: 3 }), 's2').limits, { machines: 3 });
});

test('fábrica: clock, por fileira e tier mudam só o bloco, sem recálculo', () => {
  const f = setClock(setPerRow(setTier(ex, data, 's3', 'outs', 'Desc_SteelPlate_C', 'Mk2'), 's3', 4), 's3', 300);
  const b = rb(f, 's3');
  assert.equal(b.clock, 250); assert.equal(b.perRow, 4); assert.deepEqual(b.tiers, { 'out:Desc_SteelPlate_C': 'Mk2' });
  assert.deepEqual(rb(f, 's2'), rb(ex, 's2'));
  assert.deepEqual(rb(setTier(f, data, 's3', 'outs', 'Desc_SteelPlate_C', null), 's3').tiers, {});
});

test('fábrica: setCollect ignora saída fluida; setExtractor ignora pureza no Water Extractor', () => {
  const f = outlets();
  assert.equal(setCollect(f, data, 's1', 'Desc_Water_C', true), f);
  const on = setCollect(f, data, 's1', 'Desc_AluminumScrap_C', true);
  assert.deepEqual(rb(on, 's1').collect, ['Desc_AluminumScrap_C']);
  assert.equal(rb(setCollect(on, data, 's1', 'Desc_AluminumScrap_C', false), 's1').collect, undefined);
  let g = addBlock(empty, data, { kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C' }, [0, 0]);
  g = setExtractor(g, data, 's1', { purity: 'pure', count: 3 });
  assert.deepEqual(g.blocks[0], { id: 's1', kind: 'extractor', building: 'Build_WaterPump_C', item: 'Desc_Water_C', purity: 'normal', count: 3 });
  let o = addBlock(empty, data, { kind: 'extractor', building: 'Build_FrackingExtractor_C', item: 'Desc_NitrogenGas_C' }, [0, 0]);
  o = setExtractor(o, data, 's1', { purity: 'pure' });
  assert.equal((o.blocks[0] as ExtractorBlock).purity, 'pure');
  assert.equal((setExtractor(o, data, 's1', { count: 2.5 }).blocks[0] as ExtractorBlock).count, null);
  assert.equal((setExtractor(o, data, 's1', { count: null }).blocks[0] as ExtractorBlock).count, null);
  // Miner antigo (vazão digitada): setMinerRate; escolher o Mk converte com a mesma vazão.
  let m: Factory = { ...empty, blocks: [{ id: 's1', kind: 'miner', item: 'Desc_OreIron_C', rate: 60 }] };
  m = setMinerRate(m, 's1', 780);
  assert.equal((m.blocks[0] as MinerBlock).rate, 780);
  assert.equal(setMinerRate(m, 's1', -5), m);
  assert.equal(setMinerRate(m, 's1', 1e9), m);
  const conv = (rate: number, building: string) => minerToExtractor(setMinerRate(m, 's1', rate), data, 's1', building).blocks[0];
  assert.deepEqual(conv(780, 'Build_MinerMk3_C'), { id: 's1', kind: 'extractor', building: 'Build_MinerMk3_C', item: 'Desc_OreIron_C', purity: 'normal', count: 2, clock: 162.5 });
  assert.deepEqual(conv(60, 'Build_MinerMk1_C'), { id: 's1', kind: 'extractor', building: 'Build_MinerMk1_C', item: 'Desc_OreIron_C', purity: 'normal', count: 1 });
  assert.equal(minerToExtractor(m, data, 's1', 'Build_OilPump_C'), m);
  // Trocar o Mk: só entre Miners que tiram o item.
  const mk = addBlock(empty, data, { kind: 'miner', item: 'Desc_Coal_C' }, [0, 0]);
  assert.equal((setExtractor(mk, data, 's1', { building: 'Build_MinerMk3_C' }).blocks[0] as ExtractorBlock).building, 'Build_MinerMk3_C');
  assert.deepEqual(setExtractor(mk, data, 's1', { building: 'Build_OilPump_C' }).blocks[0], mk.blocks[0]);
  assert.equal(extractorRate(data, { ...(mk.blocks[0] as ExtractorBlock), building: 'Build_MinerMk2_C', purity: 'pure', clock: 250 }), 600);
});

test('fábrica: meiosOf agrupa como os meios da fase 1; placeLig só em ligação que existe', () => {
  const ms = meiosOf(ex);
  assert.deepEqual(ms.map(m => m.id), ['Desc_IronIngot_C:s1>s2', 'Desc_SteelIngot_C:s2>s3,s4']);
  const f = placeLig(ex, 'Desc_SteelIngot_C:s2>s3,s4', { x: 13, y: 3, rot: 1 });
  assert.deepEqual(f.ligs, { 'Desc_SteelIngot_C:s2>s3,s4': { x: 16, y: 0, rot: 1 } });
  assert.equal(placeLig(ex, 'x:y>z', { x: 0, y: 0, rot: 0 }), ex);
  assert.equal(placeLig(f, 'Desc_SteelIngot_C:s2>s3,s4', null).ligs, undefined);
});

test('fábrica: removeBlock leva ligações, posição e a ligação salva do grupo que sumiu', () => {
  let f = placeLig(ex, 'Desc_IronIngot_C:s1>s2', { x: 0, y: 0, rot: 0 });
  f = placeLig(f, 'Desc_SteelIngot_C:s2>s3,s4', { x: 8, y: 0, rot: 0 });
  f = { ...f, map: { s1: { x: 0, y: 0, rot: 0 }, s3: { x: 8, y: 8, rot: 0 } } };
  const g = removeBlock(f, 's3');
  assert.deepEqual(g.blocks.map(b => b.id), ['s1', 's2', 's4']);
  assert.deepEqual(g.links.map(l => l.id), ['l1', 'l3']);
  assert.deepEqual(g.map, { s1: { x: 0, y: 0, rot: 0 } });
  assert.deepEqual(g.ligs, { 'Desc_IronIngot_C:s1>s2': { x: 0, y: 0, rot: 0 } });
  assert.deepEqual(disconnect(g, 'l1').ligs, undefined);
});

test('fábrica: setTier só aceita tier que existe, do tipo da porta (esteira ou cano), de porta da receita', () => {
  const tiers = (f: Factory, id: string) => rb(f, id).tiers;
  assert.equal(setTier(ex, data, 's2', 'ins', 'Desc_IronIngot_C', 'Mk9'), ex);            // tier que não existe
  assert.equal(setTier(ex, data, 's2', 'ins', 'Desc_IronIngot_C', 'toString'), ex);
  assert.equal(setTier(ex, data, 's2', 'outs', 'Desc_IronIngot_C', 'Mk2'), ex);           // a barra de ferro entra, não sai
  assert.equal(setTier(ex, data, 's2', 'ins', 'Desc_Water_C', 'Mk2'), ex);               // item que não é da receita
  assert.equal(setTier(ex, data, 's2', 'up' as never, 'Desc_IronIngot_C', 'Mk2'), ex);   // lado inválido
  assert.equal(setTier(ex, data, 'nope', 'ins', 'Desc_IronIngot_C', 'Mk2'), ex);
  assert.deepEqual(tiers(setTier(ex, data, 's2', 'ins', 'Desc_IronIngot_C', 'Mk6'), 's2'), { 'in:Desc_IronIngot_C': 'Mk6' });
  // Cano só tem Mk1 e Mk2.
  let f = addBlock(empty, data, { kind: 'recipe', recipe: 'Recipe_AluminumScrap_C' }, [0, 0]);
  assert.equal(setTier(f, data, 's1', 'outs', 'Desc_Water_C', 'Mk5'), f);
  f = setTier(f, data, 's1', 'outs', 'Desc_Water_C', 'Mk2');
  assert.deepEqual(tiers(f, 's1'), { 'out:Desc_Water_C': 'Mk2' });
});

test('fábrica: no limite de blocos (MAX_STAGES) ou de ligações (MAX_LINKS), criar e ligar não mudam nada', () => {
  let full: Factory = empty;
  for (let i = 0; i < MAX_STAGES; i++) full = addBlock(full, data, { kind: 'sink' }, [0, 0]);
  assert.equal(full.blocks.length, MAX_STAGES);
  assert.equal(addBlock(full, data, { kind: 'sink' }, [0, 0]), full);
  // Com o exemplo cheio de blocos: criar ligado também recusa.
  const many: Factory = { ...ex, blocks: [...ex.blocks, ...full.blocks.slice(ex.blocks.length).map((b, i) => ({ ...b, id: 'x' + i }))] };
  assert.equal(many.blocks.length, MAX_STAGES);
  assert.equal(addLinkedBlock(many, data, { kind: 'sink' }, { block: 's3', item: 'Desc_SteelPlate_C', side: 'out' }, [0, 0]), many);
  // Ligações no limite: connect e addLinkedBlock recusam, e canConnect diz o motivo.
  const pad = Array.from({ length: MAX_LINKS - ex.links.length }, (_, i) => ({ id: 'p' + i, item: 'Desc_SteelIngot_C', from: 'zz' + i, to: 'yy' + i }));
  const linked: Factory = { ...addBlock(ex, data, { kind: 'sink' }, [0, 0]), links: [...ex.links, ...pad] };
  assert.deepEqual(canConnect(linked, data, 's3', 's5', 'Desc_SteelPlate_C'), { ok: false, reason: 'full' });
  assert.equal(connect(linked, data, 's3', 's5', 'Desc_SteelPlate_C'), linked);
  assert.equal(addLinkedBlock(linked, data, { kind: 'sink' }, { block: 's3', item: 'Desc_SteelPlate_C', side: 'out' }, [0, 0]), linked);
  // Um abaixo do limite ainda liga.
  const room: Factory = { ...linked, links: linked.links.slice(0, -1) };
  assert.equal(connect(room, data, 's3', 's5', 'Desc_SteelPlate_C').links.length, MAX_LINKS);
});
