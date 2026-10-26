import { fmt } from '../../i18n/index.js';
import type { GameData, ItemId, Recipe } from './types.ts';

const norm = (s: string) => s.trim().toLowerCase();

// Receitas do evento FICSMAS (itens Xmas, Snow, Candy Cane, Fireworks, Gift) e as do Converter: raras numa fábrica,
// vão para o fim da lista.
const EVENT_ITEM = /^Desc_(Xmas|Snow|CandyCane|Fireworks|Gift)/;
const CONVERTER = 'Build_Converter_C';
// 0 normal, 1 alternativa, 2 Converter, 3 FICSMAS.
function recipeTier(r: Recipe): number {
  if ([...r.ins, ...r.outs].some(f => EVENT_ITEM.test(f.item))) return 3;
  if (r.building === CONVERTER) return 2;
  return r.alt ? 1 : 0;
}

// Relevância dentro de cada grupo: prédio mais simples (o que aparece antes no jogo) primeiro. Prédio desconhecido fica
// no meio.
const BUILDING_RANK: Record<string, number> = {
  Build_SmelterMk1_C: 0, Build_ConstructorMk1_C: 0,
  Build_AssemblerMk1_C: 1, Build_FoundryMk1_C: 1, Build_OilRefinery_C: 1, Build_Packager_C: 1,
  Build_ManufacturerMk1_C: 2, Build_Blender_C: 2,
  Build_HadronCollider_C: 3, Build_QuantumEncoder_C: 3, Build_Converter_C: 3,
};
const buildingRank = (r: Recipe) => BUILDING_RANK[r.building] ?? 2;

// Casa com o nome da receita ou de um item de saída. Ordem: saída de nome exato; normais, alternativas, Converter e
// FICSMAS; prédio mais simples; nome.
export function searchRecipes(data: GameData, query: string, filter: { produces?: ItemId; consumes?: ItemId } = {}): Recipe[] {
  const q = norm(query);
  const outNames = (r: Recipe) => r.outs.map(f => norm(data.items[f.item]?.name ?? f.item));
  const rank = (r: Recipe) => (q && outNames(r).includes(q) ? 0 : 1);
  return Object.values(data.recipes)
    .filter(r => (!filter.produces || r.outs.some(f => f.item === filter.produces)) && (!filter.consumes || r.ins.some(f => f.item === filter.consumes)))
    .filter(r => !q || norm(r.name).includes(q) || outNames(r).some(n => n.includes(q)))
    .sort((a, b) => rank(a) - rank(b) || recipeTier(a) - recipeTier(b) || buildingRank(a) - buildingRank(b)
      || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function recipesFor(data: GameData, item: ItemId): Recipe[] {
  const name = data.items[item]?.name ?? item;
  return searchRecipes(data, name, { produces: item });
}

export function recipeLine(recipe: Recipe, data: GameData): string {
  const side = (fs: Recipe['ins']) => fs.map(f => `${fmt(f.perMin)} ${data.items[f.item]?.name ?? f.item}`).join(' + ');
  return `${side(recipe.ins)} → ${side(recipe.outs)}`;
}
