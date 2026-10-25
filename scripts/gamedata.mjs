// Gera src/planner/data/game.json (itens, receitas e prédios de produção) a partir do Docs do jogo.
//
// Uso: node scripts/gamedata.mjs <en-US.json> [saida]
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
const [entrada, saida = resolve(aqui, '../src/planner/data/game.json')] = process.argv.slice(2);
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

const out = { buildings: ordenar(predios), items: ordenar(itens), recipes: ordenar(receitas) };
// Chaves ordenadas também dentro de cada objeto, para saída determinística.
const estavel = (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? ordenar(v) : v);
writeFileSync(saida, JSON.stringify(out, estavel, 1) + '\n');
console.log(`${Object.keys(itens).length} itens, ${Object.keys(receitas).length} receitas, ${Object.keys(predios).length} prédios → ${saida}`);
