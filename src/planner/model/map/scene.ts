// A cena do mapa, no mundo (metros): blocos da fábrica (receitas em escala, origens e sobras como marcadores), meios
// (as ligações) onde foram postos ou colados na primeira produtora, esteiras entre eles, sobreposições e cruzamentos. Puro: o canvas só desenha o que sai
// daqui.
import type { Block, Factory, GameData, MapPlace, Rot, StageId } from '../types.ts';
import { groupLinks, type Meio } from '../meio.ts';
import type { FlowResult } from '../solve.ts';
import { markerGeo, solvedStage } from '../solved.ts';
import { blockGeo } from './block.ts';
import { clean, cutsRect, rotSize, route, toWorld, type BeltPath, type BlockGeo, type MeioGeo, type Pt, type Rect } from './geo.ts';
import { FOUNDATION, MEIO_GAP, RAW_STUB } from './sizes.ts';
import { crossings, intersects, overlaps } from './checks.ts';
import { blockCardSize, MONTAR_REF } from './cards.ts';

// marker: origem ou sobra, desenhada fora de escala.
export interface SceneBlock { stage: StageId; rect: Rect; place: MapPlace; geo: BlockGeo; marker: boolean }
export interface SceneMeio { meio: string; rect: Rect; rot: Rot; geo: MeioGeo | null }   // null = calculando (faixa 16 × 8)
export interface Scene {
  blocks: SceneBlock[]; meios: SceneMeio[]; belts: BeltPath[]; bounds: Rect;
  overlaps: [string, string][]; crossings: Pt[];
}

export type Geos = Record<string, MeioGeo | null>;
interface Size { w: number; h: number }
// Meio calculando ou grande demais: faixa sem peças nem pontas.
const STRIP: Size = { w: 16, h: 8 };
const snap = (v: number) => Math.ceil(v / FOUNDATION - 1e-9) * FOUNDATION || 0;   // || 0: sem -0
const ORIGIN: MapPlace = { x: 0, y: 0, rot: 0 };

export { rotSize, toWorld } from './geo.ts';

// Direção do x local no mundo (sentido do fluxo dentro do bloco).
const DIR: Record<Rot, Pt> = { 0: [1, 0], 1: [0, 1], 2: [-1, 0], 3: [0, -1] };
const axis = (rot: Rot): 'x' | 'y' => (rot % 2 ? 'y' : 'x');

// Esteira reta na saída e na chegada antes da primeira curva (e folga para contornar um retângulo), em metros.
const LEAD = 1;
const step = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k];

// Esteira em ângulo reto de `a` (saindo na direção da) até `b` (chegando na direção db, vinda de fora), tentando
// não atravessar os retângulos de `avoid` (quem a esteira liga). Curva logo depois da saída: primeiro de lado, depois
// até a frente da entrada; se isso atravessa algo, contorna por uma faixa ao lado dos retângulos.
// lead: reta antes da chegada (numa etapa, passa dos tocos das entradas brutas no mesmo lado).
export function link(a: Pt, da: Pt, b: Pt, db: Pt, avoid: Rect[], lead = LEAD): Pt[] {
  const p = step(a, da, LEAD), q = step(b, db, -lead);
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

// Geometria do bloco: receita em escala (máquinas resolvidas), o resto como marcador.
function geoOf(b: Block, d: GameData, flow: FlowResult, place?: MapPlace): BlockGeo {
  return b.kind === 'recipe' ? blockGeo(solvedStage(b, flow.blocks[b.id]), d, place) : markerGeo(b, flow.blocks[b.id], d);
}

// Posto de cada bloco: a maior distância desde um bloco sem produtor (num loop, o ciclo é cortado).
function ranks(f: Factory): Map<StageId, number> {
  const memo = new Map<StageId, number>(), busy = new Set<StageId>();
  const rank = (id: StageId): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (busy.has(id)) return 0;   // ciclo: corta
    busy.add(id);
    const r = Math.max(0, ...f.links.filter(l => l.to === id).map(l => rank(l.from) + 1));
    busy.delete(id);
    memo.set(id, r);
    return r;
  };
  for (const b of f.blocks) rank(b.id);
  return memo;
}

const gapsOf = (p?: MapPlace): Pick<MapPlace, 'gapRow' | 'gapMachine'> =>
  ({ ...(p?.gapRow !== undefined ? { gapRow: p.gapRow } : {}), ...(p?.gapMachine !== undefined ? { gapMachine: p.gapMachine } : {}) });

export function proposeMap(f: Factory, data: GameData, geos: Geos, flow: FlowResult): Record<StageId, MapPlace> {
  const size = new Map(f.blocks.map(b => [b.id, geoOf(b, data, flow, f.map?.[b.id]) as Size]));
  // Para empilhar: o maior entre o bloco real e o cartão da Montar em 100 % (os cartões não se sobrepõem nesse zoom).
  const stack = new Map(f.blocks.map(b => {
    const z = size.get(b.id)!, c = blockCardSize(b, data, flow);
    return [b.id, { w: Math.max(z.w, c.w / MONTAR_REF), h: Math.max(z.h, c.h / MONTAR_REF) }];
  }));
  const att = attach(groupLinks(f.links), geos, id => size.get(id)!);
  // Faixa vertical (no referencial do bloco) e largura do maior meio colado em cada bloco.
  const ext = new Map<StageId, { top: number; bottom: number; meioW: number }>();
  for (const b of f.blocks) ext.set(b.id, { top: 0, bottom: stack.get(b.id)!.h, meioW: 0 });
  for (const a of att.values()) {
    const e = ext.get(a.owner)!;
    e.top = Math.min(e.top, a.at[1]); e.bottom = Math.max(e.bottom, a.at[1] + a.size.h); e.meioW = Math.max(e.meioW, a.size.w);
  }
  const rk = ranks(f), cols = new Map<number, Block[]>();
  for (const b of f.blocks) { const r = rk.get(b.id)!; const l = cols.get(r); if (l) l.push(b); else cols.set(r, [b]); }
  // Coluna com entrada sem ligação: os tocos de RAW_STUB chegam pela esquerda e precisam de lugar antes dela.
  const hasRaw = (b: Block) => {
    if (b.kind !== 'recipe') return false;
    const linked = new Set(f.links.filter(l => l.to === b.id).map(l => l.item));
    return (data.recipes[b.recipe]?.ins ?? []).some(x => !linked.has(x.item));
  };
  const out: Record<StageId, MapPlace> = {};
  let x = 0;
  for (const r of [...cols.keys()].sort((a, b) => a - b)) {
    if (x > 0 && cols.get(r)!.some(hasRaw)) x = snap(x + RAW_STUB);
    let cursor = 0, blockW = 0, meioW = 0;
    for (const b of cols.get(r)!) {
      const e = ext.get(b.id)!, y = snap(cursor - e.top);
      out[b.id] = { x, y, rot: 0, ...gapsOf(f.map?.[b.id]) };
      cursor = y + e.bottom + FOUNDATION;
      blockW = Math.max(blockW, stack.get(b.id)!.w); meioW = Math.max(meioW, e.meioW);
    }
    x = snap(x + blockW + MEIO_GAP + meioW + MEIO_GAP);
  }
  return out;
}

// Blocos e meios no mundo, sem esteiras.
function layout(f: Factory, data: GameData, places: Record<StageId, MapPlace>, geos: Geos, flow: FlowResult, list0 = f.blocks) {
  const blocks: SceneBlock[] = list0.map(b => {
    const place = places[b.id] ?? ORIGIN, geo = geoOf(b, data, flow, place);
    return { stage: b.id, place, geo, rect: { x: place.x, y: place.y, ...rotSize(geo, place.rot) }, marker: b.kind !== 'recipe' };
  });
  const byId = new Map(blocks.map(b => [b.stage, b]));
  const list = groupLinks(f.links).filter(m => byId.has(m.producers[0]));
  const att = attach(list, geos, id => byId.get(id)!.geo);
  const meios: SceneMeio[] = list.map(m => {
    // Ligação posta no mapa: canto e giro salvos; senão colada na primeira produtora.
    const lig = f.ligs && Object.hasOwn(f.ligs, m.id) ? f.ligs[m.id] : null;
    if (lig) return { meio: m.id, rect: { x: lig.x, y: lig.y, ...rotSize(meioSize(geos[m.id]), lig.rot) }, rot: lig.rot, geo: geos[m.id] ?? null };
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

// Posições usadas pelo mapa: as salvas; bloco sem posição recebe a proposta se ela não sobrepuser nada já
// posicionado (blocos e seus meios), senão vai para baixo de tudo, em x = 0. Derivado: não grava nada.
export function placesOf(f: Factory, data: GameData, geos: Geos, flow: FlowResult): Record<StageId, MapPlace> {
  const saved = f.map ?? {};
  const out: Record<StageId, MapPlace> = {};
  for (const b of f.blocks) if (Object.hasOwn(saved, b.id)) out[b.id] = saved[b.id];
  const missing = f.blocks.filter(b => !out[b.id]);
  if (!missing.length) return out;
  const prop = proposeMap(f, data, geos, flow);
  if (missing.length === f.blocks.length) return prop;   // fábrica sem mapa: a proposta inteira
  for (const s of missing) {
    const placed = f.blocks.filter(x => out[x.id]);
    const { blocks, meios } = layout(f, data, out, geos, flow, placed);
    const rects = [...blocks.map(b => b.rect), ...meios.map(m => m.rect)];
    // O bloco novo e os meios colados nele, numa posição de teste.
    const mine = (place: MapPlace): Rect[] => {
      const t = layout(f, data, { ...out, [s.id]: place }, geos, flow, [...placed, s]);
      return [t.byId.get(s.id)!.rect, ...t.meios.filter((_, i) => t.list[i].producers[0] === s.id).map(m => m.rect)];
    };
    const cand = prop[s.id];
    if (!mine(cand).some(r => rects.some(q => intersects(r, q)))) { out[s.id] = cand; continue; }
    // Embaixo de tudo, em x = 0; um meio mais alto que o bloco sobe acima dele: desce o que faltar.
    const bottom = boundsOf(rects).y + boundsOf(rects).h + FOUNDATION;
    const at: MapPlace = { x: 0, y: snap(bottom), rot: 0 };
    const top = Math.min(...mine(at).map(r => r.y));
    out[s.id] = { ...at, y: snap(at.y + Math.max(0, bottom - top)) };
  }
  return out;
}

export function buildScene(f: Factory, data: GameData, places: Record<StageId, MapPlace>, geos: Geos, flow: FlowResult): Scene {
  const { blocks, byId, list, meios } = layout(f, data, places, geos, flow);
  const belts: BeltPath[] = [];
  const world = (b: SceneBlock, p: { x: number; y: number }): Pt => toWorld([p.x, p.y], b.geo, b.place);
  // Portas do bloco para o item, com a taxa da faixa de cada linha, na ordem das linhas do meio: o meioInput agrupa as
  // linhas do bloco por tamanho (na ordem em que aparecem), então aqui também (estável). Linha que desce ou sobe por
  // Conveyor Lift: a esteira até a ligação começa na borda do lado dela (não atravessa as máquinas no chão); o leque
  // da porta mostra o elevador.
  const ports = (b: SceneBlock, side: 'ins' | 'outs', item: string) => {
    const lanes = b.geo.belts.filter(x => x.role === (side === 'ins' ? 'in' : 'out') && x.item === item);
    const list = b.geo[side].filter(a => a.item === item).map((a, k) => {
      const p = a.exit ? { x: side === 'ins' ? 0 : b.geo.w, y: a.y } : a;
      return { at: world(b, p), rate: lanes[k]?.rate ?? 0 };
    });
    const first = new Map<string, number>(), key = (r: number) => r.toFixed(6);
    list.forEach((p, k) => { if (!first.has(key(p.rate))) first.set(key(p.rate), k); });
    return list.map((p, k) => ({ p, k })).sort((u, v) => first.get(key(u.p.rate))! - first.get(key(v.p.rate))! || u.k - v.k).map(x => x.p);
  };
  // Marcador tem uma porta por item: todas as linhas do meio saem (ou chegam) nela.
  const nth = <T>(xs: T[], k: number, marker: boolean) => (marker ? xs[Math.min(k, xs.length - 1)] : xs[k]);
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
      const n = b.marker && from.length ? to.length : Math.min(from.length, to.length);
      for (let k = 0; k < n; k++) {
        const src = nth(from, k, b.marker);
        const pts = link(src.at, DIR[b.place.rot], mw(to[k]), DIR[sm.rot], [b.rect, sm.rect]);
        belts.push({ pts, item: m.item, rate: b.marker ? src.rate / n : src.rate, role: 'main', fluid: fluid(m.item) });
      }
    }
    // Blocos de sobra recebem as linhas extras, repartidas entre eles.
    const outlets = m.consumers.map(id => byId.get(id)).filter((b): b is SceneBlock => !!b && b.marker);
    const extras = geo.outs.filter(a => a.extra).sort((a, b) => a.row - b.row);
    for (const id of m.consumers) {
      const b = byId.get(id);
      if (!b) continue;
      if (b.marker) {
        const to = ports(b, 'ins', m.item)[0];
        if (!to) continue;
        const mine = extras.filter((_, k) => k % outlets.length === outlets.indexOf(b));
        for (const a of mine) {
          const pts = link(mw(a), DIR[sm.rot], to.at, DIR[b.place.rot], [sm.rect, b.rect], RAW_STUB + LEAD);
          belts.push({ pts, item: m.item, rate: to.rate / Math.max(1, mine.length), role: 'main', fluid: fluid(m.item) });
        }
        continue;
      }
      const from = byRow(geo.outs, id), to = ports(b, 'ins', m.item);
      for (let k = 0; k < Math.min(from.length, to.length); k++) {
        const pts = link(mw(from[k]), DIR[sm.rot], to[k].at, DIR[b.place.rot], [sm.rect, b.rect], RAW_STUB + LEAD);
        belts.push({ pts, item: m.item, rate: to[k].rate, role: 'main', fluid: fluid(m.item) });
      }
    }
  });
  // Entradas sem ligação: toco de RAW_STUB chegando pela borda de entrada, com a taxa resolvida da porta repartida
  // como as faixas das fileiras (sem fluxo ou sem limite: a nominal das faixas).
  for (const b of blocks) {
    const linked = new Set(f.links.filter(l => l.to === b.stage).map(l => l.item));
    const [dx, dy] = DIR[b.place.rot];
    for (const item of new Set(b.geo.ins.map(a => a.item))) {
      if (linked.has(item)) continue;
      const ps = ports(b, 'ins', item), nominal = ps.reduce((s, p) => s + p.rate, 0);
      const real = flow.blocks[b.stage]?.ins.find(p => p.item === item)?.rate;
      const scale = typeof real === 'number' && nominal > 0 ? real / nominal : 1;
      for (const p of ps) {
        belts.push({ pts: route([p.at[0] - dx * RAW_STUB, p.at[1] - dy * RAW_STUB], p.at, axis(b.place.rot)), item, rate: p.rate * scale, role: 'raw', fluid: fluid(item) });
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
