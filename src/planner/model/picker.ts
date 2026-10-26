// O que o seletor do mapa oferece: as especiais (origens e sobras, como a lista da esquerda do Modeler) e as receitas,
// filtradas pela busca e, vindo de uma porta, pelo item. Puro (os nomes das especiais saem no idioma da tela).
import { t } from '../../i18n/index.js';
import type { GameData, ItemId } from './types.ts';
import type { BlockSpec } from './factory.ts';
import { searchRecipes } from './search.ts';
import { SPECIAL_ICON, iconUrl } from '../ui/icons.ts';

// icon: endereço do ícone (produto da receita, prédio da especial) ou null; alt: receita alternativa.
export interface PickerEntry { spec: BlockSpec; title: string; sub: string; icon: string | null; alt: boolean; ins: ItemId[]; outs: ItemId[] }
export interface PickerFilter { consumes?: ItemId; produces?: ItemId }

const norm = (s: string) => s.trim().toLowerCase();

function specials(d: GameData, filter: PickerFilter): PickerEntry[] {
  const name = (item: ItemId) => d.items[item]?.name ?? item;
  const out: PickerEntry[] = [];
  const miner = (item: ItemId) => out.push({
    spec: { kind: 'miner', item }, title: t('plMiner'), sub: name(item), icon: iconUrl(SPECIAL_ICON.miner), alt: false, ins: [], outs: [item],
  });
  const extractors = (item?: ItemId) => {
    for (const x of Object.values(d.extractors)) for (const it of x.items) {
      if (item && it !== item) continue;
      out.push({ spec: { kind: 'extractor', building: x.id, item: it }, title: x.name, sub: name(it), icon: iconUrl(x.id), alt: false, ins: [], outs: [it] });
    }
  };
  const outlets = (fluid: boolean) => {
    const o = (kind: 'sink' | 'container' | 'export', key: string, icon: string) =>
      out.push({ spec: { kind }, title: t(key), sub: '', icon: iconUrl(icon), alt: false, ins: [], outs: [] });
    if (!fluid) o('sink', 'plSink', SPECIAL_ICON.sink);   // o Awesome Sink não aceita fluido
    o('container', 'plContainer', fluid ? SPECIAL_ICON.fluidContainer : SPECIAL_ICON.container);
    o('export', 'plExport', SPECIAL_ICON.export);
  };
  if (filter.produces) {
    const it = d.items[filter.produces];
    if (it?.raw && !it.fluid) miner(filter.produces);
    extractors(filter.produces);
  } else if (filter.consumes) {
    outlets(!!d.items[filter.consumes]?.fluid);
  } else {
    Object.values(d.items).filter(i => i.raw && !i.fluid).sort((a, b) => a.name.localeCompare(b.name)).forEach(i => miner(i.id));
    extractors();
    outlets(false);
  }
  return out;
}

export function pickerEntries(d: GameData, query: string, filter: PickerFilter = {}): { special: PickerEntry[]; recipes: PickerEntry[] } {
  const q = norm(query);
  const special = specials(d, filter).filter(e => !q || norm(e.title).includes(q) || norm(e.sub).includes(q));
  const recipes = searchRecipes(d, query, filter).map((r): PickerEntry => ({
    spec: { kind: 'recipe', recipe: r.id }, title: r.name, sub: d.buildings[r.building]?.name ?? r.building,
    icon: iconUrl(r.outs[0]?.item ?? ''), alt: r.alt, ins: r.ins.map(f => f.item), outs: r.outs.map(f => f.item),
  }));
  return { special, recipes };
}

// Ordem dos grupos no seletor: vindo de uma porta (filtrado), as receitas primeiro e as especiais depois; sem filtro
// (duplo clique no vazio), as especiais primeiro. Grupo vazio não aparece.
export interface PickerGroup { kind: 'special' | 'recipes'; entries: PickerEntry[] }
export function pickerGroups(r: { special: PickerEntry[]; recipes: PickerEntry[] }, filter?: PickerFilter): PickerGroup[] {
  const special: PickerGroup = { kind: 'special', entries: r.special }, recipes: PickerGroup = { kind: 'recipes', entries: r.recipes };
  const fromPort = !!(filter?.consumes || filter?.produces);
  return (fromPort ? [recipes, special] : [special, recipes]).filter(g => g.entries.length > 0);
}
