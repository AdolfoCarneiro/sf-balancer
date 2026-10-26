// Várias fábricas salvas no navegador (a lista do botão "Fábricas"), separar a seleção numa fábrica nova e o arquivo de
// backup. Puro, sem DOM: quem chama lê e grava o localStorage e baixa o arquivo.
import type { Block, Factory, GameData, ItemId, MapPlace, StageId } from './types.ts';
import type { Pt } from './map/geo.ts';
import { addBlock, connect, removeBlocks, type BlockSpec } from './factory.ts';
import { decodeFactory, encodeFactory, isObj, safeId } from './factorystate.ts';

export const LIBRARY_STORE = 'sf-balancer:planner-library';
export const MAX_FACTORIES = 100, MAX_NAME = 80;
// Arquivo de backup: identifica o formato (outro JSON não entra por engano).
export const FILE_KIND = 'sf-balancer-factories';

// data: a fábrica no mesmo formato do link (#p=), que a leitura valida; updated: ms.
export interface LibEntry { id: string; name: string; updated: number; data: string }
export interface Library { v: 1; current: string; items: LibEntry[] }

const cleanName = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, MAX_NAME) : '');
const nextLibId = (lib: Library): string =>
  'f' + (Math.max(0, ...lib.items.map(e => Number(e.id.match(/^f(\d+)$/)?.[1] ?? 0))) + 1);

// Nome que ainda não existe na lista: `base`, ou `base (2)`, `base (3)`…
export function uniqueName(lib: Library, base: string): string {
  const b = cleanName(base) || 'Factory', names = new Set(lib.items.map(e => e.name));
  if (!names.has(b)) return b;
  for (let n = 2; ; n++) { const s = `${b.slice(0, MAX_NAME - 6)} (${n})`; if (!names.has(s)) return s; }
}

// Lista com uma fábrica só (a primeira abertura, ou a lista que não leu).
export const libraryOf = (name: string, f: Factory, now: number): Library =>
  ({ v: 1, current: 'f1', items: [{ id: 'f1', name: cleanName(name) || 'Factory', updated: now, data: encodeFactory(f) }] });

// Lista lida do localStorage, saneada: entradas com fábrica que não lê somem; sem nenhuma, null.
export function cleanLibrary(raw: unknown, data: GameData): Library | null {
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.items)) return null;
  const items: LibEntry[] = [], seen = new Set<string>();
  for (const e of raw.items.slice(0, MAX_FACTORIES)) {
    if (!isObj(e)) continue;
    const id = safeId(e.id), name = cleanName(e.name);
    if (!id || seen.has(id) || !name || typeof e.data !== 'string' || !decodeFactory(e.data, data)) continue;
    seen.add(id);
    items.push({ id, name, updated: typeof e.updated === 'number' && Number.isFinite(e.updated) ? e.updated : 0, data: e.data });
  }
  if (!items.length) return null;
  const current = typeof raw.current === 'string' && seen.has(raw.current) ? raw.current : items[0].id;
  return { v: 1, current, items };
}

export const currentEntry = (lib: Library): LibEntry => lib.items.find(e => e.id === lib.current) ?? lib.items[0];

// Grava a fábrica aberta na entrada atual (só se mudou).
export function putCurrent(lib: Library, f: Factory, now: number): Library {
  const data = encodeFactory(f), cur = currentEntry(lib);
  if (cur.data === data) return lib;
  return { ...lib, items: lib.items.map(e => (e.id === cur.id ? { ...e, data, updated: now } : e)) };
}

// Fábrica nova na lista (já aberta); null com a lista cheia.
export function addEntry(lib: Library, name: string, f: Factory, now: number): Library | null {
  if (lib.items.length >= MAX_FACTORIES) return null;
  const id = nextLibId(lib);
  return { ...lib, current: id, items: [...lib.items, { id, name: uniqueName(lib, name), updated: now, data: encodeFactory(f) }] };
}

export const openEntry = (lib: Library, id: string): Library => (lib.items.some(e => e.id === id) ? { ...lib, current: id } : lib);

export function renameEntry(lib: Library, id: string, name: string): Library {
  const n = cleanName(name), e = lib.items.find(x => x.id === id);
  if (!n || !e || e.name === n) return lib;
  return { ...lib, items: lib.items.map(x => (x.id === id ? { ...x, name: uniqueName({ ...lib, items: lib.items.filter(y => y.id !== id) }, n) } : x)) };
}

// Apaga uma; a última não sai (a lista nunca fica vazia). Apagando a aberta, abre a de cima (ou a de baixo).
export function removeEntry(lib: Library, id: string): Library {
  const i = lib.items.findIndex(e => e.id === id);
  if (i < 0 || lib.items.length < 2) return lib;
  const items = lib.items.filter(e => e.id !== id);
  return { ...lib, items, current: lib.current === id ? items[Math.max(0, i - 1)].id : lib.current };
}

export const entryFactory = (e: LibEntry, data: GameData): Factory => decodeFactory(e.data, data) ?? { v: 2, blocks: [], links: [] };

// Arquivo de backup: as fábricas da lista, com nome e dados (a ordem da lista).
export function libraryFile(lib: Library): string {
  return JSON.stringify({ kind: FILE_KIND, v: 1, factories: lib.items.map(e => ({ name: e.name, updated: e.updated, data: e.data })) }, null, 1);
}

// Lê um arquivo de backup: as fábricas que leem (nome e fábrica); null se não é o formato.
export function readLibraryFile(text: string, data: GameData): { name: string; factory: Factory }[] | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!isObj(raw) || raw.kind !== FILE_KIND || raw.v !== 1 || !Array.isArray(raw.factories)) return null;
  const out: { name: string; factory: Factory }[] = [];
  for (const e of raw.factories.slice(0, MAX_FACTORIES)) {
    if (!isObj(e) || typeof e.data !== 'string') continue;
    const factory = decodeFactory(e.data, data), name = cleanName(e.name);
    if (factory && name) out.push({ name, factory });
  }
  return out;
}

// Junta as fábricas do arquivo na lista (nomes repetidos ganham "(2)"); a aberta não muda. Para quando a lista enche.
export function mergeFile(lib: Library, list: { name: string; factory: Factory }[], now: number): { lib: Library; added: number } {
  let out = lib, added = 0;
  for (const x of list) {
    const next = addEntry(out, x.name, x.factory, now);
    if (!next) break;
    out = { ...next, current: lib.current };
    added++;
  }
  return { lib: out, added };
}

// Separar a seleção numa fábrica nova: `part` leva os blocos escolhidos, as ligações entre eles e as posições; o que
// chegava de fora vira uma Entrada por item, e o que saía para fora vira uma Saída por item. `rest` é a fábrica sem
// eles, com o mesmo no sentido contrário: o que ia para os blocos que saíram vai para uma Saída, e o que vinha deles
// chega por uma Entrada. As Entradas nascem sem limite. Nada escolhido (ou tudo inválido): null.
export function splitFactory(f: Factory, ids: readonly StageId[], d: GameData): { part: Factory; rest: Factory } | null {
  const pick = new Set(ids.filter(id => f.blocks.some(b => b.id === id)));
  if (!pick.size) return null;
  const inside = (id: StageId) => pick.has(id);
  const places = (m: Record<StageId, MapPlace> | undefined) =>
    m ? Object.fromEntries(Object.entries(m).filter(([id]) => inside(id))) : undefined;
  const blocks: Block[] = f.blocks.filter(b => inside(b.id));
  let part: Factory = { v: 2, blocks, links: f.links.filter(l => inside(l.from) && inside(l.to)) };
  const map = places(f.map), montar = places(f.montar);
  if (map && Object.keys(map).length) part = { ...part, map };
  if (montar && Object.keys(montar).length) part = { ...part, montar };
  const crossIn = f.links.filter(l => !inside(l.from) && inside(l.to)), crossOut = f.links.filter(l => inside(l.from) && !inside(l.to));

  // Ponto do bloco (Montar se houver, senão Planta); as peças novas nascem do lado dele.
  const at = (g: Factory, id: StageId, dx: number): Pt => {
    const p = g.montar?.[id] ?? g.map?.[id];
    return p ? [p.x + dx, p.y] : [dx, 0];
  };
  // Uma peça por item, ligada a todos os blocos daquele item; side 'in': a peça entrega (Entrada) aos blocos `ends`.
  const attach = (g0: Factory, links: typeof f.links, side: 'in' | 'out', spec: (item: ItemId) => BlockSpec, ref: Factory) => {
    let g = g0;
    const byItem = new Map<ItemId, StageId[]>();
    for (const l of links) {
      const end = side === 'in' ? l.to : l.from;
      const list = byItem.get(l.item) ?? [];
      if (!list.includes(end)) list.push(end);
      byItem.set(l.item, list);
    }
    for (const [item, ends] of byItem) {
      const before = g.blocks.length;
      g = addBlock(g, d, spec(item), at(ref, ends[0], side === 'in' ? -64 : 64));
      if (g.blocks.length === before) continue;
      const nb = g.blocks[g.blocks.length - 1].id;
      for (const e of ends) g = side === 'in' ? connect(g, d, nb, e, item) : connect(g, d, e, nb, item);
    }
    return g;
  };
  part = attach(part, crossIn, 'in', item => ({ kind: 'input', item }), f);
  part = attach(part, crossOut, 'out', () => ({ kind: 'export' }), f);
  let rest = removeBlocks(f, [...pick]);
  // No que ficou: quem mandava para os blocos que saíram manda para uma Saída; quem recebia deles recebe de uma Entrada.
  rest = attach(rest, crossIn, 'out', () => ({ kind: 'export' }), f);
  rest = attach(rest, crossOut, 'in', item => ({ kind: 'input', item }), f);
  return { part, rest };
}
