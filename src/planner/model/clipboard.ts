// Copiar e colar blocos: a cópia é uma fábrica pequena (os blocos, as ligações entre eles e as posições nas duas vistas),
// guardada no navegador no formato do link, então cola em qualquer fábrica da lista. Puro, sem DOM.
import type { Factory, GameData, MapPlace, StageId } from './types.ts';
import { blocksFull, connect, linksFull, nextBlockId } from './factory.ts';
import { MAP_GRID, cleanPlace } from './map/sizes.ts';

export const CLIP_STORE = 'sf-balancer:planner-clip';
// Colar sem ponto (teclado, Duplicar): ao lado do original.
export const PASTE_STEP = 2 * MAP_GRID;

const pick = (m: Record<StageId, MapPlace>, ids: Set<StageId>) => Object.fromEntries(Object.entries(m).filter(([id]) => ids.has(id)));

// A cópia dos blocos `ids`: as ligações entre eles e as posições de cada vista (planta: a Planta em escala, já com as
// automáticas; montar: a Montar). null sem bloco válido.
export function copyBlocks(f: Factory, ids: readonly StageId[], planta: Record<StageId, MapPlace>, montar: Record<StageId, MapPlace>): Factory | null {
  const set = new Set(ids.filter(id => f.blocks.some(b => b.id === id)));
  if (!set.size) return null;
  return {
    v: 2, blocks: f.blocks.filter(b => set.has(b.id)), links: f.links.filter(l => set.has(l.from) && set.has(l.to)),
    map: pick(planta, set), montar: pick(montar, set),
  };
}

// Cola a cópia com ids novos. at: o ponto do mundo (m) onde fica o canto da cópia na vista `view`; sem ele, ao lado do
// original. A outra vista ganha o desenho da cópia deslocado de PASTE_STEP. Para nos limites da fábrica (blocos e
// ligações). ids: os blocos novos, na ordem da cópia.
export function pasteBlocks(f: Factory, clip: Factory, d: GameData, view: 'montar' | 'planta', at: [number, number] | null): { factory: Factory; ids: StageId[] } {
  let g = f;
  const idOf = new Map<StageId, StageId>(), ids: StageId[] = [];
  for (const b of clip.blocks) {
    if (blocksFull(g)) break;
    const id = nextBlockId(g);
    idOf.set(b.id, id);
    ids.push(id);
    g = { ...g, blocks: [...g.blocks, { ...b, id }] };
  }
  for (const l of clip.links) {
    const from = idOf.get(l.from), to = idOf.get(l.to);
    if (from && to && !linksFull(g)) g = connect(g, d, from, to, l.item);
  }
  // Posições: na vista atual, o canto da cópia vai para `at` (na grade); na outra, o mesmo desenho ao lado do original.
  const snap = (v: number) => Math.round(v / MAP_GRID) * MAP_GRID;
  const moved = (src: Record<StageId, MapPlace> | undefined, here: boolean) => {
    const ps = Object.entries(src ?? {}).filter(([id]) => idOf.has(id));
    if (!ps.length) return {};
    const x0 = Math.min(...ps.map(([, p]) => p.x)), y0 = Math.min(...ps.map(([, p]) => p.y));
    const [dx, dy] = here && at ? [snap(at[0]) - x0, snap(at[1]) - y0] : [PASTE_STEP, PASTE_STEP];
    const out: Record<StageId, MapPlace> = {};
    for (const [id, p] of ps) { const q = cleanPlace({ ...p, x: p.x + dx, y: p.y + dy }); if (q) out[idOf.get(id)!] = q; }
    return out;
  };
  const map = moved(clip.map, view === 'planta'), montar = moved(clip.montar, view === 'montar');
  // Bloco sem `montar` usa o `map` na Montar (um por um), então os de antes não mudam de lugar.
  g = { ...g, map: { ...g.map, ...map }, montar: { ...g.montar, ...montar } };
  return { factory: g, ids };
}
