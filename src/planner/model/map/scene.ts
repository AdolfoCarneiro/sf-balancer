// A cena do mapa, no mundo (metros): blocos das etapas, meios colados na primeira produtora, esteiras entre eles,
// sobreposições e cruzamentos. Puro: o canvas só desenha o que sai daqui.
import type { Chain, GameData, MapPlace, Rot, Stage, StageId } from '../types.ts';
import { meios as meiosOf, type Meio } from '../meio.ts';
import { blockGeo } from './block.ts';
import { clean, cutsRect, route, type BeltPath, type BlockGeo, type MeioGeo, type Pt, type Rect } from './geo.ts';
import { FOUNDATION, MEIO_GAP, RAW_STUB } from './sizes.ts';
import { crossings, intersects, overlaps } from './checks.ts';

export interface SceneBlock { stage: StageId; rect: Rect; place: MapPlace; geo: BlockGeo }
export interface SceneMeio { meio: string; rect: Rect; rot: Rot; geo: MeioGeo | null }   // null = calculando (faixa 16 × 8)
export interface Scene {
  blocks: SceneBlock[]; meios: SceneMeio[]; belts: BeltPath[]; bounds: Rect;
  overlaps: [string, string][]; crossings: Pt[];
}

type Geos = Record<string, MeioGeo | null>;
interface Size { w: number; h: number }
// Meio calculando ou grande demais: faixa sem peças nem pontas.
const STRIP: Size = { w: 16, h: 8 };
const snap = (v: number) => Math.ceil(v / FOUNDATION - 1e-9) * FOUNDATION || 0;   // || 0: sem -0
const ORIGIN: MapPlace = { x: 0, y: 0, rot: 0 };

export const rotSize = (geo: Size, rot: Rot): Size => (rot % 2 ? { w: geo.h, h: geo.w } : { w: geo.w, h: geo.h });

// Ponto local (rot 0, tamanho `size`) para o mundo, com o bloco girado `rot` quartos de volta no sentido horário
// e o canto superior esquerdo do retângulo já girado em (place.x, place.y).
export function toWorld(p: Pt, size: Size, place: { x: number; y: number; rot: Rot }): Pt {
  const [x, y] = p, { w, h } = size;
  switch (place.rot) {
    case 1: return [place.x + h - y, place.y + x];
    case 2: return [place.x + w - x, place.y + h - y];
    case 3: return [place.x + y, place.y + w - x];
    default: return [place.x + x, place.y + y];
  }
}
// Direção do x local no mundo (sentido do fluxo dentro do bloco).
const DIR: Record<Rot, Pt> = { 0: [1, 0], 1: [0, 1], 2: [-1, 0], 3: [0, -1] };
const axis = (rot: Rot): 'x' | 'y' => (rot % 2 ? 'y' : 'x');

// Esteira reta na saída e na chegada antes da primeira curva (e folga para contornar um retângulo), em metros.
const LEAD = 1;
const step = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k];

// Esteira em ângulo reto de `a` (saindo na direção da) até `b` (chegando na direção db, vinda de fora), tentando
// não atravessar os retângulos de `avoid` (quem a esteira liga). Curva logo depois da saída: primeiro de lado, depois
// até a frente da entrada; se isso atravessa algo, contorna por uma faixa ao lado dos retângulos.
export function link(a: Pt, da: Pt, b: Pt, db: Pt, avoid: Rect[]): Pt[] {
  const p = step(a, da, LEAD), q = step(b, db, -LEAD);
  const xa = da[0] !== 0, xb = db[0] !== 0;
  const mids: Pt[][] = [xa ? [[p[0], q[1]]] : [[q[0], p[1]]], xa ? [[q[0], p[1]]] : [[p[0], q[1]]]];
  // Faixas paralelas à chegada, por fora de cada retângulo e de todos juntos.
  const lanes: number[] = [];
  const lo = (r: Rect) => (xb ? r.y : r.x) - LEAD, hi = (r: Rect) => (xb ? r.y + r.h : r.x + r.w) + LEAD;
  for (const r of avoid) lanes.push(lo(r), hi(r));
  if (avoid.length > 1) lanes.push(Math.min(...avoid.map(lo)), Math.max(...avoid.map(hi)));
  for (const v of lanes) mids.push(xb ? [[p[0], v], [q[0], v]] : [[v, p[1]], [v, q[1]]]);
  const paths = mids.map(m => clean([a, p, ...m, q, b]));
  const clear = (pts: Pt[], rs: Rect[]) => pts.every((v, i) => i === 0 || !rs.some(r => cutsRect(pts[i - 1], v, r)));
  return paths.find(x => clear(x, avoid)) ?? paths.find(x => clear(x, avoid.slice(-1))) ?? paths[0];
}

const meioSize = (geo: MeioGeo | null | undefined): Size => (geo && !geo.tooLarge ? geo : STRIP);
const realGeo = (geo: MeioGeo | null | undefined): MeioGeo | null => (geo && !geo.tooLarge ? geo : null);

// Meios colados no lado de saída de cada produtora (a primeira de cada meio), a MEIO_GAP da borda, centrados nela;
// vários meios na mesma produtora (itens diferentes) ficam empilhados com MEIO_GAP entre eles, o grupo centrado.
// Devolve, por meio, o canto no referencial local da produtora.
function attach(list: Meio[], geos: Geos, sizeOf: (id: StageId) => Size): Map<string, { owner: StageId; at: Pt; size: Size }> {
  const byOwner = new Map<StageId, Meio[]>();
  for (const m of list) {
    const o = m.producers[0];
    const l = byOwner.get(o);
    if (l) l.push(m); else byOwner.set(o, [m]);
  }
  const out = new Map<string, { owner: StageId; at: Pt; size: Size }>();
  for (const [owner, ms] of byOwner) {
    const b = sizeOf(owner), sizes = ms.map(m => meioSize(geos[m.id]));
    const total = sizes.reduce((s, z) => s + z.h, 0) + MEIO_GAP * (ms.length - 1);
    let y = (b.h - total) / 2;
    ms.forEach((m, i) => { out.set(m.id, { owner, at: [b.w + MEIO_GAP, y], size: sizes[i] }); y += sizes[i].h + MEIO_GAP; });
  }
  return out;
}

// Posto de cada etapa: a maior distância desde uma etapa sem produtor.
function ranks(chain: Chain): Map<StageId, number> {
  const memo = new Map<StageId, number>(), busy = new Set<StageId>();
  const rank = (id: StageId): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (busy.has(id)) return 0;   // ciclo (não deveria existir): corta
    busy.add(id);
    const r = Math.max(0, ...chain.links.filter(l => l.to === id).map(l => rank(l.from) + 1));
    busy.delete(id);
    memo.set(id, r);
    return r;
  };
  for (const s of chain.stages) rank(s.id);
  return memo;
}

const gapsOf = (p?: MapPlace): Pick<MapPlace, 'gapRow' | 'gapMachine'> =>
  ({ ...(p?.gapRow !== undefined ? { gapRow: p.gapRow } : {}), ...(p?.gapMachine !== undefined ? { gapMachine: p.gapMachine } : {}) });

export function proposeMap(chain: Chain, data: GameData, geos: Geos): Record<StageId, MapPlace> {
  const size = new Map(chain.stages.map(s => [s.id, blockGeo(s, data, chain.map?.[s.id]) as Size]));
  const att = attach(meiosOf(chain, data), geos, id => size.get(id)!);
  // Faixa vertical (no referencial da etapa) e largura do maior meio colado em cada etapa.
  const ext = new Map<StageId, { top: number; bottom: number; meioW: number }>();
  for (const s of chain.stages) { const b = size.get(s.id)!; ext.set(s.id, { top: 0, bottom: b.h, meioW: 0 }); }
  for (const a of att.values()) {
    const e = ext.get(a.owner)!;
    e.top = Math.min(e.top, a.at[1]); e.bottom = Math.max(e.bottom, a.at[1] + a.size.h); e.meioW = Math.max(e.meioW, a.size.w);
  }
  const rk = ranks(chain), cols = new Map<number, Stage[]>();
  for (const s of chain.stages) { const r = rk.get(s.id)!; const l = cols.get(r); if (l) l.push(s); else cols.set(r, [s]); }
  // Coluna com entrada sem ligação: os tocos de RAW_STUB chegam pela esquerda e precisam de lugar antes dela.
  const hasRaw = (s: Stage) => {
    const linked = new Set(chain.links.filter(l => l.to === s.id).map(l => l.item));
    return (data.recipes[s.recipe]?.ins ?? []).some(f => !linked.has(f.item));
  };
  const out: Record<StageId, MapPlace> = {};
  let x = 0;
  for (const r of [...cols.keys()].sort((a, b) => a - b)) {
    if (x > 0 && cols.get(r)!.some(hasRaw)) x = snap(x + RAW_STUB);
    let cursor = 0, blockW = 0, meioW = 0;
    for (const s of cols.get(r)!) {
      const e = ext.get(s.id)!, y = snap(cursor - e.top);
      out[s.id] = { x, y, rot: 0, ...gapsOf(chain.map?.[s.id]) };
      cursor = y + e.bottom + FOUNDATION;
      blockW = Math.max(blockW, size.get(s.id)!.w); meioW = Math.max(meioW, e.meioW);
    }
    x = snap(x + blockW + MEIO_GAP + meioW + MEIO_GAP);
  }
  return out;
}

// Blocos e meios no mundo, sem esteiras.
function layout(chain: Chain, data: GameData, places: Record<StageId, MapPlace>, geos: Geos, stages = chain.stages) {
  const blocks: SceneBlock[] = stages.map(s => {
    const place = places[s.id] ?? ORIGIN, geo = blockGeo(s, data, place);
    return { stage: s.id, place, geo, rect: { x: place.x, y: place.y, ...rotSize(geo, place.rot) } };
  });
  const byId = new Map(blocks.map(b => [b.stage, b]));
  const list = meiosOf(chain, data).filter(m => byId.has(m.producers[0]));
  const att = attach(list, geos, id => byId.get(id)!.geo);
  const meios: SceneMeio[] = list.map(m => {
    const a = att.get(m.id)!, owner = byId.get(a.owner)!;
    const p = toWorld(a.at, owner.geo, owner.place), q = toWorld([a.at[0] + a.size.w, a.at[1] + a.size.h], owner.geo, owner.place);
    const rect = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) };
    return { meio: m.id, rect, rot: owner.place.rot, geo: geos[m.id] ?? null };
  });
  return { blocks, byId, list, meios };
}

function boundsOf(rects: Rect[], belts: BeltPath[] = []): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  for (const b of belts) for (const [x, y] of b.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x0 === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Posições usadas pelo mapa: as salvas; etapa sem posição recebe a proposta se ela não sobrepuser nada já
// posicionado (blocos e seus meios), senão vai para baixo de tudo, em x = 0. Derivado: não grava nada.
export function placesOf(chain: Chain, data: GameData, geos: Geos): Record<StageId, MapPlace> {
  const saved = chain.map ?? {};
  const out: Record<StageId, MapPlace> = {};
  for (const s of chain.stages) if (Object.hasOwn(saved, s.id)) out[s.id] = saved[s.id];
  const missing = chain.stages.filter(s => !out[s.id]);
  if (!missing.length) return out;
  const prop = proposeMap(chain, data, geos);
  if (missing.length === chain.stages.length) return prop;   // cadeia sem mapa: a proposta inteira
  for (const s of missing) {
    const placed = chain.stages.filter(x => out[x.id]);
    const { blocks, meios } = layout(chain, data, out, geos, placed);
    const rects = [...blocks.map(b => b.rect), ...meios.map(m => m.rect)];
    const cand = prop[s.id], geo = blockGeo(s, data, cand);
    const rect = { x: cand.x, y: cand.y, ...rotSize(geo, cand.rot) };
    if (!rects.some(r => intersects(rect, r))) out[s.id] = cand;
    else { const b = boundsOf(rects); out[s.id] = { x: 0, y: snap(b.y + b.h + FOUNDATION), rot: 0 }; }
  }
  return out;
}

export function buildScene(chain: Chain, data: GameData, places: Record<StageId, MapPlace>, geos: Geos): Scene {
  const { blocks, byId, list, meios } = layout(chain, data, places, geos);
  const belts: BeltPath[] = [];
  const world = (b: SceneBlock, p: { x: number; y: number }): Pt => toWorld([p.x, p.y], b.geo, b.place);
  // Portas da etapa para o item, na ordem das fileiras, com a taxa da faixa da fileira.
  const ports = (b: SceneBlock, side: 'ins' | 'outs', item: string) => {
    const lanes = b.geo.belts.filter(x => x.role === (side === 'ins' ? 'in' : 'out') && x.item === item);
    return b.geo[side].filter(a => a.item === item).map((a, k) => ({ at: world(b, a), rate: lanes[k]?.rate ?? 0 }));
  };
  const fluid = (item: string) => data.items[item]?.fluid ?? false;

  list.forEach((m, i) => {
    const sm = meios[i], geo = realGeo(sm.geo);
    if (!geo) return;
    const mPlace = { x: sm.rect.x, y: sm.rect.y, rot: sm.rot }, mw = (p: { x: number; y: number }) => toWorld([p.x, p.y], geo, mPlace);
    const byRow = (xs: MeioGeo['ins'], stage: StageId) => xs.filter(a => !a.extra && a.stage === stage).sort((a, b) => a.row - b.row);
    for (const id of m.producers) {
      const b = byId.get(id);
      if (!b) continue;
      const from = ports(b, 'outs', m.item), to = byRow(geo.ins, id);
      for (let k = 0; k < Math.min(from.length, to.length); k++) {
        const pts = link(from[k].at, DIR[b.place.rot], mw(to[k]), DIR[sm.rot], [b.rect, sm.rect]);
        belts.push({ pts, item: m.item, rate: from[k].rate, role: 'main', fluid: fluid(m.item) });
      }
    }
    for (const id of m.consumers) {
      const b = byId.get(id);
      if (!b) continue;
      const from = byRow(geo.outs, id), to = ports(b, 'ins', m.item);
      for (let k = 0; k < Math.min(from.length, to.length); k++) {
        const pts = link(mw(from[k]), DIR[sm.rot], to[k].at, DIR[b.place.rot], [sm.rect, b.rect]);
        belts.push({ pts, item: m.item, rate: to[k].rate, role: 'main', fluid: fluid(m.item) });
      }
    }
  });
  // Entradas sem ligação: toco de RAW_STUB chegando pela borda de entrada.
  for (const b of blocks) {
    const linked = new Set(chain.links.filter(l => l.to === b.stage).map(l => l.item));
    const [dx, dy] = DIR[b.place.rot];
    for (const item of new Set(b.geo.ins.map(a => a.item))) {
      if (linked.has(item)) continue;
      for (const p of ports(b, 'ins', item)) {
        belts.push({ pts: route([p.at[0] - dx * RAW_STUB, p.at[1] - dy * RAW_STUB], p.at, axis(b.place.rot)), item, rate: p.rate, role: 'raw', fluid: fluid(item) });
      }
    }
  }
  const rects = [...blocks.map(b => ({ id: b.stage, rect: b.rect })), ...meios.map(m => ({ id: m.meio, rect: m.rect }))];
  return {
    blocks, meios, belts,
    bounds: boundsOf(rects.map(r => r.rect), belts),
    overlaps: overlaps(rects), crossings: crossings(belts),
  };
}

const within = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// O que está no ponto do mundo: meio antes de bloco (desenhado por cima), o último desenhado primeiro.
export function hitTest(scene: Scene, x: number, y: number): { kind: 'block' | 'meio'; id: string } | null {
  for (let i = scene.meios.length - 1; i >= 0; i--) if (within(scene.meios[i].rect, x, y)) return { kind: 'meio', id: scene.meios[i].meio };
  for (let i = scene.blocks.length - 1; i >= 0; i--) if (within(scene.blocks[i].rect, x, y)) return { kind: 'block', id: scene.blocks[i].stage };
  return null;
}
