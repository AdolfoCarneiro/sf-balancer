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
    spec: { kind: 'miner', item }, title: name(item), sub: t('plMiner'), icon: iconUrl(item), alt: false, ins: [], outs: [item],
  });
  const extractors = (item?: ItemId) => {
    for (const x of Object.values(d.extractors)) for (const it of x.items) {
      if (item && it !== item) continue;
      out.push({ spec: { kind: 'extractor', building: x.id, item: it }, title: name(it), sub: x.name, icon: iconUrl(it), alt: false, ins: [], outs: [it] });
    }
  };
  const outlets = (fluid: boolean) => {
    const o = (kind: 'sink' | 'container' | 'export', key: string, icon: string) =>
      out.push({ spec: { kind }, title: t(key), sub: '', icon: iconUrl(icon), alt: false, ins: [], outs: [] });
    if (!fluid) o('sink', 'plSink', SPECIAL_ICON.sink);   // o Awesome Sink não aceita fluido
    o('container', 'plContainer', fluid ? SPECIAL_ICON.fluidContainer : SPECIAL_ICON.container);
    o('export', 'plExport', SPECIAL_ICON.export);
  };
  // Entrada (Container ou trem): com o item da porta, já pronta; do vazio, item ainda por escolher ('').
  const input = (item: ItemId | '') => out.push({
    spec: { kind: 'input', item }, title: item ? name(item) : t('plInput'), sub: t('plInputSub'),
    icon: iconUrl(item || SPECIAL_ICON.container), alt: false, ins: [], outs: item ? [item] : [],
  });
  if (filter.produces) {
    const it = d.items[filter.produces];
    if (it?.raw && !it.fluid) miner(filter.produces);
    extractors(filter.produces);
    if (it) input(filter.produces);
  } else if (filter.consumes) {
    outlets(!!d.items[filter.consumes]?.fluid);
  } else {
    input('');
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

// Segundo passo da Entrada: qualquer item do jogo, pelo nome (o que começa com a busca primeiro).
export function itemEntries(d: GameData, query: string): PickerEntry[] {
  const q = norm(query);
  return Object.values(d.items)
    .filter(i => !q || norm(i.name).includes(q))
    .sort((a, b) => Number(!norm(a.name).startsWith(q)) - Number(!norm(b.name).startsWith(q)) || a.name.localeCompare(b.name))
    .map(i => ({ spec: { kind: 'input', item: i.id }, title: i.name, sub: '', icon: iconUrl(i.id), alt: false, ins: [], outs: [i.id] }));
}

// Ordem dos grupos no seletor, como no Modeler: os recursos (Miner e extratores, um por item) primeiro, depois as
// receitas e por último as sobras (Sink, Container, Saída). Grupo vazio não aparece. O filtro não muda a ordem; fica
// na assinatura por compatibilidade.
export interface PickerGroup { kind: 'sources' | 'recipes' | 'outlets' | 'items'; entries: PickerEntry[] }
const isSource = (e: PickerEntry) => e.spec.kind === 'miner' || e.spec.kind === 'extractor' || e.spec.kind === 'input';
export function pickerGroups(r: { special: PickerEntry[]; recipes: PickerEntry[] }, _filter?: PickerFilter): PickerGroup[] {
  return ([
    { kind: 'sources', entries: r.special.filter(isSource) }, { kind: 'recipes', entries: r.recipes },
    { kind: 'outlets', entries: r.special.filter(e => !isSource(e)) },
  ] as PickerGroup[]).filter(g => g.entries.length > 0);
}
