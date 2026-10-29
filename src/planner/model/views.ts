// Posições por vista: a Montar e a Planta em escala guardam cada uma o lugar dos blocos e das ligações. O giro é só da
// Planta (o cartão da Montar nunca é desenhado girado): `montar` guarda rot 0, e o rot de `montarLigs` só diz em que
// orientação estava o retângulo que centra o chip quando ele foi posto (nunca muda por um giro). Mexer numa vista não
// muda a outra ("congela" na outra o lugar de antes, quando ela ainda seguia esta). Puro.
import type { Factory, LigPlace, MapPlace, StageId } from './types.ts';
import { cleanLigPlace, meiosOf, placeLig } from './factory.ts';
import { cleanPlace } from './map/sizes.ts';

export type PlaceView = 'montar' | 'planta';
// auto: as posições da Planta mostradas agora (as derivadas, de quem não tem posição salva).
export interface PlaceOpts { auto?: Record<StageId, MapPlace> }
// shown: onde a ligação aparece agora em cada vista (a automática, quando não tem posição salva).
export interface LigOpts { shown?: { montar?: LigPlace | null; planta?: LigPlace | null } }

const own = Object.hasOwn;
// Lugar na Montar: sem vãos nem giro.
export const bare = (p: { x: number; y: number }): MapPlace => ({ x: p.x, y: p.y, rot: 0 });
const same = (a: MapPlace, b: MapPlace) => a.x === b.x && a.y === b.y;

// Posição do bloco na Montar: a dela, senão o lugar da Planta (sem giro nem vãos).
export const montarPlace = (f: Factory, id: StageId): MapPlace | undefined =>
  (f.montar && own(f.montar, id) ? f.montar[id] : f.map && own(f.map, id) ? bare(f.map[id]) : undefined);
// Posição da ligação na Montar: sem `montarLigs`, a da Planta; com ele, só a dele (fora dele, a automática).
export const montarLig = (f: Factory, meio: string): LigPlace | undefined => {
  const o = f.montarLigs ?? f.ligs;
  return o && own(o, meio) ? o[meio] : undefined;
};

// Posições da Montar de todos os blocos: as dela, senão as da Planta mostradas (`planta`, já com as derivadas).
export function montarPlaces(f: Factory, planta: Record<StageId, MapPlace>): Record<StageId, MapPlace> {
  const out: Record<StageId, MapPlace> = {};
  for (const b of f.blocks) {
    const p = f.montar && own(f.montar, b.id) ? f.montar[b.id] : planta[b.id];
    if (p) out[b.id] = bare(p);
  }
  return out;
}

const plantaAt = (f: Factory, id: StageId, auto?: Record<StageId, MapPlace>) => (f.map && own(f.map, id) ? f.map[id] : auto?.[id]);
const montarAt = (f: Factory, id: StageId, auto?: Record<StageId, MapPlace>) => montarPlace(f, id) ?? auto?.[id];

// Todas as posições de uma vista de uma vez (as que não valem ou de bloco que não existe saem).
export function setPlacesIn(f: Factory, view: PlaceView, places: Record<StageId, MapPlace>, o: PlaceOpts = {}): Factory {
  const ids = new Set(f.blocks.map(b => b.id)), next: Record<StageId, MapPlace> = {};
  for (const [id, v] of Object.entries(places)) {
    const p = cleanPlace(v);
    if (p && ids.has(id)) next[id] = view === 'montar' ? bare(p) : p;
  }
  const was = (id: StageId) => (view === 'montar' ? montarAt : plantaAt)(f, id, o.auto);
  // Quem mudou de lugar nesta vista (girar na Planta não muda o cartão da Montar).
  const changed: StageId[] = [];
  for (const [id, p] of Object.entries(next)) {
    const w = was(id);
    if (!w || !same(w, p)) changed.push(id);
  }
  if (view === 'montar') return { ...f, montar: next };
  // Planta: quem andou e ainda seguia a Planta na Montar fica onde estava lá.
  const montar: Record<StageId, MapPlace> = { ...f.montar };
  for (const id of changed) {
    if (own(montar, id)) continue;
    const p = plantaAt(f, id, o.auto);
    if (p) montar[id] = bare(p);
  }
  return { ...f, map: next, ...(f.montar || Object.keys(montar).length ? { montar } : {}) };
}

// Uma posição só (o resto da vista fica como está).
export function placeBlockIn(f: Factory, view: PlaceView, id: StageId, place: MapPlace, o: PlaceOpts = {}): Factory {
  if (!cleanPlace(place) || !f.blocks.some(b => b.id === id)) return f;
  return setPlacesIn(f, view, { ...(view === 'montar' ? f.montar : f.map), [id]: place }, o);
}

// Propor de novo só na vista atual: posições novas e as ligações dela voltam ao lugar automático.
export function proposeIn(f: Factory, view: PlaceView, places: Record<StageId, MapPlace>, auto?: Record<StageId, MapPlace>): Factory {
  if (view === 'montar') { const { bends: _b, ...g } = setPlacesIn(f, 'montar', places); return { ...g, montarLigs: {} }; }
  const g = setPlacesIn(f, 'planta', places, { auto });
  // A Montar continua com as ligações que seguia da Planta.
  const { ligs: _l, ...rest } = g;
  return f.ligs && !f.montarLigs ? { ...rest, montarLigs: { ...f.ligs } } : rest;
}

// Posição da ligação numa vista (null volta ao lugar automático dela, só nessa vista: na Planta, a Montar que ainda
// seguia as ligs volta junto, sem congelar).
export function placeLigIn(f: Factory, view: PlaceView, meio: string, place: LigPlace | null, o: LigOpts = {}): Factory {
  const p = place === null ? null : cleanLigPlace(place);
  if ((place !== null && !p) || !meiosOf(f).some(m => m.id === meio)) return f;
  // A Montar passa a ter as suas (copiadas das da Planta, se ainda as seguia).
  if (view === 'planta' && p === null) return placeLig(f, meio, null);
  const ml: Record<string, LigPlace> = { ...(f.montarLigs ?? f.ligs) };
  if (view === 'planta') return { ...placeLig(f, meio, p), montarLigs: ml };
  if (p) ml[meio] = p; else delete ml[meio];
  return { ...f, montarLigs: ml };
}
