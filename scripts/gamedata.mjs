// Gera src/planner/data/game.json (itens, receitas, prédios de produção e extratores de fluido) a partir do Docs do jogo.
//
// Uso: node scripts/gamedata.mjs <en-US.json> [saida]
//      node scripts/gamedata.mjs <en-US.json> --generators   (só troca os geradores e a energia gasta no game.json que já existe)
//
// Fonte usada hoje: cópia do Docs da versão 1.1 mantida pelo projeto satisfactory-logistics,
//   https://raw.githubusercontent.com/rockfactory/satisfactory-logistics/main/data/docs-en.json
// O jogo está na 1.2, que segundo a wiki não mudou receitas. O caminho pretendido é apontar
// este script para o arquivo do próprio jogador: <instalação>/CommunityResources/Docs/en-US.json
// (UTF-16LE com BOM, lido direto). O arquivo bruto nunca entra no repositório.
//
// A saída tem as chaves ordenadas, para o diff ficar estável.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), soGeradores = args.includes('--generators');
const [entrada, saida = resolve(aqui, '../src/planner/data/game.json')] = args.filter(a => a !== '--generators');
if (!entrada) { console.error('uso: node scripts/gamedata.mjs <en-US.json> [saida]'); process.exit(1); }

// UTF-16LE com BOM (arquivo do jogo) ou UTF-8.
const buf = readFileSync(entrada);
const texto = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
const grupos = JSON.parse(texto.replace(/^﻿/, ''));

// NativeClass termina no nome da classe: ...Class'/Script/FactoryGame.FGRecipe'
const porClasse = {};
for (const g of grupos) {
  const nome = g.NativeClass.replace(/'/g, '').split('.').pop();
  (porClasse[nome] ??= []).push(...g.Classes);
}

const ordenar = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
const arred = n => Math.round(n * 1e4) / 1e4;

// Itens: toda classe com mForm.
const todosItens = {};
const brutos = new Set((porClasse.FGResourceDescriptor ?? []).map(c => c.ClassName));
for (const lista of Object.values(porClasse)) {
  for (const c of lista) {
    if (c.mForm === undefined || todosItens[c.ClassName]) continue;
    todosItens[c.ClassName] = {
      id: c.ClassName,
      name: c.mDisplayName,
      fluid: c.mForm === 'RF_LIQUID' || c.mForm === 'RF_GAS',
      raw: brutos.has(c.ClassName),
    };
  }
}

// Prédios: os de produção, com tamanho vindo de building-sizes.json (metros).
const tamanhos = JSON.parse(readFileSync(resolve(aqui, 'building-sizes.json'), 'utf8'));
const predios = {};
for (const c of [...(porClasse.FGBuildableManufacturer ?? []), ...(porClasse.FGBuildableManufacturerVariablePower ?? [])]) {
  const t = tamanhos[c.ClassName];
  if (!t) throw new Error(`prédio sem tamanho em building-sizes.json: ${c.ClassName}`);
  predios[c.ClassName] = { id: c.ClassName, name: c.mDisplayName, w: t.w, l: t.l };
}

// Extratores de fluido/gás: Water Extractor, Oil Extractor (e outros ResourceExtractor só de
// líquido/gás com recurso fixo) e Resource Well Extractor. A Miner fica de fora (sólido).
// Pureza (impura 0,5 / normal 1 / pura 2) só vale para o Oil e o Resource Well: decisão do dono,
// o Water Extractor não tem pureza.
const PUREZA = { Build_OilPump_C: true, Build_FrackingExtractor_C: true };
const fluidoApenas = c => /^\(?(RF_LIQUID|RF_GAS)(,(RF_LIQUID|RF_GAS))*\)?$/.test(c.mAllowedResourceForms ?? '');
const extratores = {};
for (const c of [...(porClasse.FGBuildableWaterPump ?? []), ...(porClasse.FGBuildableFrackingExtractor ?? []),
  ...(porClasse.FGBuildableResourceExtractor ?? []).filter(c => c.mOnlyAllowCertainResources === 'True' && fluidoApenas(c))]) {
  extratores[c.ClassName] = {
    id: c.ClassName,
    name: c.mDisplayName,
    perMin: arred(Number(c.mItemsPerCycle) / Number(c.mExtractCycleTime) * 60 / 1000),
    items: [...c.mAllowedResources.matchAll(/\.(Desc_\w+)'/g)].map(m => m[1]).sort(),
    purity: PUREZA[c.ClassName] ?? false,
  };
}

// Texto ((ItemClass="…Desc_X.Desc_X_C'",Amount=7),…) → [{ id, amount }]
const lerFluxos = s => [...s.matchAll(/\.(\w+)'"\s*,\s*Amount=(\d+(?:\.\d+)?)/g)].map(m => ({ id: m[1], amount: Number(m[2]) }));

const receitas = {};
const usados = new Set();
for (const c of porClasse.FGRecipe ?? []) {
  // O prédio é o primeiro citado em mProducedIn; bancada e build gun não são prédios de produção.
  const building = [...c.mProducedIn.matchAll(/\.(\w+)"/g)].map(m => m[1]).find(id => predios[id]);
  if (!building) continue;
  const dur = Number(c.mManufactoringDuration);
  if (!(dur > 0)) continue;
  const fluxo = ({ id, amount }) => {
    const item = todosItens[id];
    if (!item) throw new Error(`item desconhecido ${id} na receita ${c.ClassName}`);
    usados.add(id);
    return { item: id, perMin: arred(amount * 60 / dur / (item.fluid ? 1000 : 1)) };
  };
  const alt = c.mDisplayName.startsWith('Alternate: ');
  receitas[c.ClassName] = {
    id: c.ClassName,
    name: alt ? c.mDisplayName.slice('Alternate: '.length) : c.mDisplayName,
    alt,
    building,
    ins: lerFluxos(c.mIngredients).map(fluxo),
    outs: lerFluxos(c.mProduct).map(fluxo),
  };
}

// Só entram os itens usados em alguma receita.
const itens = {};
for (const id of [...usados]) itens[id] = todosItens[id];

// Geradores (Biomass Burner, Coal, Fuel, Nuclear): potência (MW a 100 %) e, por combustível, o consumo por minuto
// (sólido: itens; fluido: m³, a energia do Docs é por litro), a água (mSupplementalToPowerRatio: litros por MJ) e o
// resíduo (mByproductAmount por combustível queimado). O Geotérmico não queima nada: fica de fora.
const geradores = {};
const energia = {};
for (const lista of Object.values(porClasse)) for (const c of lista) if (c.mEnergyValue !== undefined) energia[c.ClassName] = { mj: Number(c.mEnergyValue), fluido: c.mForm === 'RF_LIQUID' || c.mForm === 'RF_GAS' };
for (const c of [...(porClasse.FGBuildableGeneratorFuel ?? []), ...(porClasse.FGBuildableGeneratorNuclear ?? [])]) {
  const mw = Number(c.mPowerProduction), agua = Number(c.mSupplementalToPowerRatio || 0);
  const fuels = [];
  for (const x of c.mFuel ?? []) {
    const e = energia[x.mFuelClass];
    if (!e || !(e.mj > 0)) continue;
    const perMin = mw * 60 / (e.mj * (e.fluido ? 1000 : 1));
    const water = x.mSupplementalResourceClass && agua > 0 ? arred(mw * agua * 60 / 1000) : null;
    const waste = x.mByproduct ? { item: x.mByproduct, perMin: arred(perMin * Number(x.mByproductAmount)) } : null;
    fuels.push({ item: x.mFuelClass, perMin: arred(perMin), water, waste });
  }
  if (fuels.length) geradores[c.ClassName] = { id: c.ClassName, name: c.mDisplayName, power: mw, fuels };
}

// Energia gasta (MW a 100 %; o jogo eleva pelo clock com mPowerConsumptionExponent, 1,321929): prédios de produção e
// extratores. Os de energia variável (Particle Accelerator, Converter, Quantum Encoder) gastam por receita, em média
// mVariablePowerConsumptionConstant + mVariablePowerConsumptionFactor / 2.
const gasto = {};
for (const lista of Object.values(porClasse)) for (const c of lista) if (c.mPowerConsumption !== undefined) gasto[c.ClassName] = arred(Number(c.mPowerConsumption));
const variavel = new Set((porClasse.FGBuildableManufacturerVariablePower ?? []).map(c => c.ClassName));
const gastoReceita = {};
for (const c of porClasse.FGRecipe ?? []) {
  const em = [...(c.mProducedIn ?? '').matchAll(/\.(Build_\w+)/g)].map(m => m[1]).find(b => variavel.has(b));
  if (em) gastoReceita[c.ClassName] = arred(Number(c.mVariablePowerConsumptionConstant) + Number(c.mVariablePowerConsumptionFactor) / 2);
}

if (soGeradores) {
  const atual = JSON.parse(readFileSync(saida, 'utf8'));
  for (const [id, b] of Object.entries(atual.buildings)) if (gasto[id] !== undefined) b.power = gasto[id];
  for (const [id, x] of Object.entries(atual.extractors)) if (gasto[id] !== undefined) x.power = gasto[id];
  for (const [id, r] of Object.entries(atual.recipes)) if (gastoReceita[id] !== undefined) r.power = gastoReceita[id];
  for (const g of Object.values(geradores)) g.fuels = g.fuels.filter(f => atual.items[f.item] && (!f.waste || atual.items[f.waste.item]));
  atual.generators = ordenar(geradores);
  writeFileSync(saida, JSON.stringify(ordenar(atual), (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? ordenar(v) : v), 1) + '\n');
  process.exit(0);
}
const out = { buildings: ordenar(predios), extractors: ordenar(extratores), generators: ordenar(geradores), items: ordenar(itens), recipes: ordenar(receitas) };
// Chaves ordenadas também dentro de cada objeto, para saída determinística.
const estavel = (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? ordenar(v) : v);
writeFileSync(saida, JSON.stringify(out, estavel, 1) + '\n');
console.log(`${Object.keys(itens).length} itens, ${Object.keys(receitas).length} receitas, ${Object.keys(predios).length} prédios, ${Object.keys(extratores).length} extratores → ${saida}`);
