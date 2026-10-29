// Geometria de tela (px) das duas vistas do mapa: a Montar (cartões enxutos como o nó do Modeler, portas de 44 px nas bordas e
// o chip de cada ligação) e a Planta em escala (o bloco real com as portas por fora), e a transição entre elas (t de 0 a 1).
// Puro e barato (roda a cada quadro): só lê a cena, a câmera, o fluxo e os dados do jogo, sem solver nem plano.
import type { Block, Factory, GameData, ItemId, LigPlace, Link, StageId } from '../types.ts';
import { groupLinks, type Meio } from '../meio.ts';
import { portsOf } from '../factory.ts';
import type { FlowResult } from '../solve.ts';
import { PLANT_LIMITS, centerOn, fit, type Camera, type ZoomLimits } from './camera.ts';
import { gateOf, toWorld, type Pt, type Rect } from './geo.ts';
import type { Scene, SceneBlock } from './scene.ts';
import { MAP_GRID } from './sizes.ts';

export const CARD_W = 210, MARK_W = 190, MARK_H = 94;
export const PORT_D = 44, PORT_Y0 = 38, PORT_STEP = 52, CHIP_W = 120, CHIP_H = 52, PLANT_PORT_OUT = 30;
// Px por metro em que o cartão tem 100 %.
export const MONTAR_REF = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const mean = (ps: Pt[]): Pt | null => (ps.length ? [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length] : null);

// Como no Modeler, a Montar é um desenho só que segue o mapa, como uma foto: o cartão, as portas, os rótulos, os chips e
// as esteiras crescem e encolhem juntos (o tamanho no mundo fica parado, então afastar não amontoa nada), até 115 % de
// perto. Nenhum zoom troca o desenho. `phone` fica pela assinatura: o celular encolhe igual.
export const cardScale = (zoom: number, _phone?: boolean): number => Math.min(1.15, zoom / MONTAR_REF);
// O maior tamanho do cartão no mundo, em metros por px do cartão a 100 %: até 115 % ele ocupa sempre o mesmo mundo; mais
// de perto, menos.
export const CARD_MAX_M_PER_PX = 1 / MONTAR_REF;
// A escala do desenho por cima do mapa (portas, rótulos, chips, esteiras): a do cartão na Montar, 1 na Planta.
export const overlayScale = (s: number, t: number): number => lerp(s, 1, t);

// Tamanho do cartão a 100 %: a faixa do nome, o ícone com o número e a faixa de baixo (MARK_H), ou a altura das portas
// com a mesma folga em cima e embaixo (PORT_Y0), o que for maior; sem faixa de fileiras (elas ficam na miniatura do
// painel). A receita é mais larga que o marcador (origem e sobra).
export function cardSize(kind: 'recipe' | 'marker', nIns: number, nOuts: number): { w: number; h: number } {
  const n = Math.max(nIns, nOuts);
  return { w: kind === 'marker' ? MARK_W : CARD_W, h: Math.max(MARK_H, 2 * PORT_Y0 + Math.max(0, n - 1) * PORT_STEP) };
}
// Centro da primeira porta de um lado com n portas, num cartão de altura h: as portas de cada lado centradas na altura.
export const portY0 = (h: number, n: number): number => (h - Math.max(0, n - 1) * PORT_STEP) / 2;

// O que o cartão de um bloco mostra: os itens de cada lado, na ordem da receita (marcador: a saída da origem, ou uma
// entrada por item que chega na sobra, como o markerGeo).
export interface CardSpec { kind: 'recipe' | 'marker'; ins: ItemId[]; outs: ItemId[] }
const uniq = (xs: ItemId[]) => [...new Set(xs)];
export function cardSpec(b: Block, d: GameData, flow: FlowResult): CardSpec {
  const bf = flow.blocks[b.id];
  switch (b.kind) {
    case 'recipe': {
      const r = d.recipes[b.recipe];
      return { kind: 'recipe', ins: uniq(r.ins.map(x => x.item)), outs: uniq(r.outs.map(x => x.item)) };
    }
    case 'miner': case 'extractor': case 'input': return { kind: 'marker', ins: [], outs: [b.item] };
    case 'generator': { const p = portsOf(b, d); return { kind: 'marker', ins: p.ins as ItemId[], outs: p.outs }; }
    default: return { kind: 'marker', ins: uniq((bf?.ins ?? []).map(p => p.item)), outs: [] };
  }
}
export const blockCardSize = (b: Block, d: GameData, flow: FlowResult): { w: number; h: number } => {
  const c = cardSpec(b, d, flow);
  return cardSize(c.kind, c.ins.length, c.outs.length);
};

// rect: o que se desenha agora (Montar → Planta); card e plant: as duas pontas. scale: a do cartão.
export interface ViewBlock { id: StageId; rect: Rect; scale: number; card: Rect; plant: Rect }
// x/y: centro da porta; r: o raio na tela (encolhe com o cartão na Montar); dir: para fora do bloco; lanes: na Planta, o ponto de tela de cada fileira daquela porta (na
// transição, saindo da porta da Montar).
export interface ViewPort { block: StageId; side: 'in' | 'out'; item: ItemId; x: number; y: number; r: number; dir: Pt; lanes: Pt[] }
// x/y: centro do chip; compact: desenhado como o ponto da ligação compacta (w/h: o que pega o ponteiro). link: na Montar,
// cada link da ligação é uma esteira só da saída à entrada, com o ponto no meio dela (como no Modeler); rate: o que passa
// nele; bend: quanto (px de tela) o ponto foi puxado do meio automático (Factory.bends). extra: um link além do primeiro
// (sempre ponto; só na Montar).
export interface ViewChip {
  meio: string; x: number; y: number; w: number; h: number; compact?: true;
  link?: { id: string; from: StageId; to: StageId; item: ItemId; rate: number | null; bend: Pt }; extra?: true;
}
// k: a escala de portas, chips e esteiras (overlayScale); w/h dos chips já vêm nela.
export interface ViewGeo { blocks: ViewBlock[]; ports: ViewPort[]; chips: ViewChip[]; k: number }

// Sentido do fluxo dentro do bloco no mundo, por giro.
const DIR: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// Valores ao longo da borda, na ordem de entrada: afastados pelo menos `gap`, na mesma ordem relativa, com a mesma média.
function spread(vs: number[], gap: number): number[] {
  if (vs.length < 2) return vs;
  const idx = vs.map((_, i) => i).sort((a, b) => vs[a] - vs[b] || a - b), out = [...vs];
  for (let k = 1; k < idx.length; k++) out[idx[k]] = Math.max(vs[idx[k]], out[idx[k - 1]] + gap);
  const shift = (vs.reduce((s, v) => s + v, 0) - out.reduce((s, v) => s + v, 0)) / vs.length;
  return out.map(v => v + shift);
}

// Portas da Planta de um lado: a PLANT_PORT_OUT px por fora da borda, cada uma na média das linhas do item que saem
// (ou chegam) por essa borda. O leque vai ao gate de cada uma, onde a esteira do mapa encontra a linha (na borda; o
// elevador fica no meio das máquinas); as que usam outra borda (fileira espelhada, vão do center) ficam fora do leque,
// que assim nunca atravessa o bloco.
function plantPorts(sb: SceneBlock, side: 'in' | 'out', items: ItemId[], plant: Rect, toS: (p: Pt) => Pt): { at: Pt; dir: Pt; lanes: Pt[] }[] {
  const [fx, fy] = DIR[sb.place.rot], k = side === 'out' ? 1 : -1, dir: Pt = [fx * k + 0, fy * k + 0];
  const s = side === 'in' ? 'ins' : 'outs', anchors = sb.geo[s];
  const lanes = items.map(item => anchors.filter(a => a.item === item).map(a => gateOf(a, s))
    .filter(g => g.dir[0] === k && g.dir[1] === 0).map(g => toS(toWorld(g.at, sb.geo, sb.place))));
  const along = dir[0] !== 0 ? 1 : 0;   // borda vertical: as portas andam em y
  const mid = along ? plant.y + plant.h / 2 : plant.x + plant.w / 2;
  const pos = spread(lanes.map(ls => mean(ls)?.[along] ?? mid), PORT_STEP);
  const edge = dir[0] < 0 ? plant.x - PLANT_PORT_OUT : dir[0] > 0 ? plant.x + plant.w + PLANT_PORT_OUT
    : dir[1] < 0 ? plant.y - PLANT_PORT_OUT : plant.y + plant.h + PLANT_PORT_OUT;
  return items.map((_, i) => ({ at: (along ? [edge, pos[i]] : [pos[i], edge]) as Pt, dir, lanes: lanes[i] }));
}

// Os grupos das ligações só mudam com as ligações: guardados pelo array (a fábrica é imutável).
const groupsMemo = new WeakMap<Link[], Map<string, Meio>>();
function groupsOf(links: Link[]): Map<string, Meio> {
  let g = groupsMemo.get(links);
  if (!g) groupsMemo.set(links, g = new Map(groupLinks(links).map(m => [m.id, m])));
  return g;
}

// t = 0 Montar, t = 1 Planta. Cartão no canto do bloco na tela; portas e chips em px fixos.
export function viewGeo(scene: Scene, cam: Camera, t: number, phone: boolean, f: Factory, data: GameData, flow: FlowResult): ViewGeo {
  const z = cam.zoom, s = cardScale(z, phone), k = overlayScale(s, t), pr = PORT_D / 2 * k;
  const toS = (p: Pt): Pt => [(p[0] - cam.x) * z, (p[1] - cam.y) * z];
  const byId = new Map(f.blocks.map(b => [b.id, b]));
  const blocks: ViewBlock[] = [], ports: ViewPort[] = [];
  const montar = new Map<string, Pt>();   // `${bloco}|${lado}|${item}` -> porta na Montar (para o chip)
  for (const sb of scene.blocks) {
    const b = byId.get(sb.stage);
    if (!b) continue;
    const spec = cardSpec(b, data, flow), size = cardSize(spec.kind, spec.ins.length, spec.outs.length);
    // O cartão no lugar da Montar e o bloco no da Planta: a transição anda de um ao outro.
    const [x, y] = toS(sb.card), [px, py] = toS([sb.rect.x, sb.rect.y]);
    const card: Rect = { x, y, w: size.w * s, h: size.h * s }, plant: Rect = { x: px, y: py, w: sb.rect.w * z, h: sb.rect.h * z };
    blocks.push({ id: b.id, rect: lerpRect(card, plant, t), scale: s, card, plant });
    for (const side of ['in', 'out'] as const) {
      const items = side === 'in' ? spec.ins : spec.outs, y0 = portY0(size.h, items.length);
      const pl = plantPorts(sb, side, items, plant, toS);
      items.forEach((item, i) => {
        const m: Pt = [side === 'in' ? card.x : card.x + card.w, card.y + (y0 + i * PORT_STEP) * s];
        montar.set(`${b.id}|${side}|${item}`, m);
        const [px, py] = lerpPt(m, pl[i].at, t);
        const dir: Pt = t < 0.5 ? [side === 'in' ? -1 : 1, 0] : pl[i].dir;
        ports.push({ block: b.id, side, item, x: px, y: py, r: pr, dir, lanes: pl[i].lanes.map(l => lerpPt(m, l, t)) });
      });
    }
  }
  const groups = groupsOf(f.links), linkById = new Map(f.links.map(l => [l.id, l])), chips: ViewChip[] = [];
  for (const sm of scene.meios) {
    const center = toS([sm.rect.x + sm.rect.w / 2, sm.rect.y + sm.rect.h / 2]);
    const g = groups.get(sm.meio);
    // Na Montar, um ponto por link, no meio da esteira dele (não se arrasta: segue os cartões). O primeiro vira o chip
    // da ligação na Planta; os outros só existem na Montar.
    const legs = (g?.links ?? []).map(id => linkById.get(id)).filter((l): l is Link => !!l).flatMap(l => {
      const a = montar.get(`${l.from}|out|${l.item}`), b = montar.get(`${l.to}|in|${l.item}`);
      const off = f.bends?.[l.id], bend: Pt = off ? [off[0] * z, off[1] * z] : [0, 0];
      return a && b ? [{ l, bend, mid: bezierAt(linkBezier(a, b, k, bend), 0.5) }] : [];
    });
    if (!legs.length) { const [x, y] = center; chips.push({ meio: sm.meio, x, y, w: CHIP_W * k, h: CHIP_H * k }); continue; }
    legs.forEach(({ l, bend, mid }, i) => {
      if (i > 0 && t >= 1) return;
      const [x, y] = lerpPt(mid, center, t), rate = flow.links[l.id];
      chips.push({
        meio: sm.meio, x, y, w: CHIP_W * k, h: CHIP_H * k, link: { id: l.id, from: l.from, to: l.to, item: l.item, rate: rate === undefined ? 0 : rate, bend },
        ...(i > 0 ? { extra: true as const } : {}),
      });
    });
  }
  return { blocks, ports, chips, k };
}

// A esteira de um link na Montar (px de tela; k: a escala do desenho), como no Modeler: uma curva só da saída (a) à
// entrada (b), saindo e chegando na horizontal, alças de metade da distância (no mínimo 30 px). Entrada atrás da saída
// (a volta de um subproduto): a curva desce por baixo dos dois e volta, em vez de cruzar os cartões. bend (px): o ponto
// puxado; as duas alças andam bend / 0,75, e o meio da curva (que pesa 3/8 de cada alça) cai bem nele.
export function linkBezier(a: Pt, b: Pt, k: number, bend: Pt = [0, 0]): [Pt, Pt, Pt, Pt] {
  const dx = b[0] - a[0], [ox, oy] = [bend[0] / 0.75, bend[1] / 0.75];
  if (dx >= 0) { const h = Math.max(30 * k, dx * 0.5); return [a, [a[0] + h + ox, a[1] + oy], [b[0] - h + ox, b[1] + oy], b]; }
  const h = Math.max(90 * k, -dx * 0.3), low = Math.max(a[1], b[1]) + 120 * k;
  return [a, [a[0] + h + ox, low + oy], [b[0] - h + ox, low + oy], b];
}
export function bezierAt([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], u: number): Pt {
  const v = 1 - u, A = v * v * v, B = 3 * v * v * u, C = 3 * v * u * u, D = u * u * u;
  return [A * p0[0] + B * p1[0] + C * p2[0] + D * p3[0], A * p0[1] + B * p1[1] + C * p2[1] + D * p3[1]];
}

// chip: link é o da esteira daquele ponto (só na Montar).
export type ViewHit = { kind: 'port'; port: ViewPort } | { kind: 'chip'; meio: string; link?: string } | { kind: 'block'; id: StageId } | null;

// O que está desenhado por cima ganha: chip antes de porta antes de bloco; dentro de cada um, o último desenhado ganha.
// plant (Planta em escala): o corpo do bloco ganha do chip que o cobre (um Miner de 8 m tem uns 32 px e a ligação fica
// colada nele); só o círculo do ponto (DOT_HIT px do centro) continua pegando ali.
export const DOT_HIT = 12;
export function viewHit(v: ViewGeo, sx: number, sy: number, plant = false): ViewHit {
  let body: StageId | null = null;
  for (let i = v.blocks.length - 1; i >= 0 && !body; i--) {
    const b = v.blocks[i].rect;
    if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) body = v.blocks[i].id;
  }
  for (let i = v.chips.length - 1; i >= 0; i--) {
    const c = v.chips[i];
    if (Math.abs(sx - c.x) > c.w / 2 || Math.abs(sy - c.y) > c.h / 2) continue;
    if (plant && body && !(c.compact && Math.hypot(sx - c.x, sy - c.y) <= DOT_HIT * v.k)) continue;
    return c.link ? { kind: 'chip', meio: c.meio, link: c.link.id } : { kind: 'chip', meio: c.meio };
  }
  for (let i = v.ports.length - 1; i >= 0; i--) if (Math.hypot(v.ports[i].x - sx, v.ports[i].y - sy) <= v.ports[i].r + 6) return { kind: 'port', port: v.ports[i] };
  return body ? { kind: 'block', id: body } : null;
}

// Canto do retângulo do meio (size em metros, já girado), preso na grade, para o centro ficar sob (sx, sy). rot 0:
// quem arrasta mantém o giro da ligação ({ ...chipWorld(...), rot }).
export function chipWorld(cam: Camera, sx: number, sy: number, size: { w: number; h: number }): LigPlace {
  const snap = (v: number) => Math.round(v / MAP_GRID) * MAP_GRID + 0;
  return { x: snap(cam.x + sx / cam.zoom - size.w / 2), y: snap(cam.y + sy / cam.zoom - size.h / 2), rot: 0 };
}

// Zoom da Montar: de longe como a Planta, de perto até 300 % do zoom de referência (o cartão não passa de 115 %, mas o
// mapa ainda aproxima).
export const MONTAR_LIMITS: ZoomLimits = { min: PLANT_LIMITS.min, max: MONTAR_REF * 3 };
export const viewLimits = (montar: boolean): ZoomLimits => (montar ? MONTAR_LIMITS : PLANT_LIMITS);

// Trocar de vista (v: a geometria da nova vista com a câmera de agora): a câmera fica se algum bloco aparece na tela
// (vw × vh px); senão vai ao bloco selecionado (sel) no lugar dele na nova vista; sem ele, null (quem chama enquadra
// tudo). As duas vistas têm posições próprias, então o centro de uma pode ser o vazio da outra.
export function switchCam(v: ViewGeo, cam: Camera, vw: number, vh: number, sel: StageId | null): Camera | null {
  const seen = (r: Rect) => r.x < vw && r.x + r.w > 0 && r.y < vh && r.y + r.h > 0;
  if (!v.blocks.length || v.blocks.some(b => seen(b.rect))) return cam;
  const b = sel ? v.blocks.find(x => x.id === sel) : undefined;
  if (!b) return null;
  const z = cam.zoom, r = b.rect;
  return centerOn(cam, { x: cam.x + r.x / z, y: cam.y + r.y / z, w: r.w / z, h: r.h / z }, vw, vh);
}

// Do lado de fora de cada porta cabe o rótulo do estado ("sai 1.200/min", "faltam 120/min", "+330 sobrando"): sem essa
// folga, o "Mostrar tudo" põe o cartão na borda e o rótulo, preso à tela, cobre o número de máquinas.
export const PORT_LABEL_ROOM = 104;
// Retângulo do mundo que a Montar ocupa no zoom z: cada cartão (que tem tamanho de tela) com as portas e os rótulos
// delas por fora (de longe, sem portas na tela, sem essa folga); os pontos ficam entre as portas. Vazio sem blocos.
export function montarBounds(scene: Scene, f: Factory, data: GameData, flow: FlowResult, z: number, phone: boolean): Rect {
  const s = cardScale(z, phone), byId = new Map(f.blocks.map(b => [b.id, b]));
  const m = (PORT_D / 2 + PORT_LABEL_ROOM) * s / z;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (ax: number, ay: number, bx: number, by: number) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
  for (const sb of scene.blocks) {
    const b = byId.get(sb.stage);
    if (!b) continue;
    const size = blockCardSize(b, data, flow);
    const [x, y] = sb.card;
    add(x - m, y, x + size.w * s / z + m, y + size.h * s / z);
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// "Mostrar tudo" da Planta: os blocos reais, com folga dos lados para as portas e os rótulos delas (em px de tela, então
// a folga no mundo depende do zoom: enquadra algumas vezes).
export function fitPlanta(b: Rect, vw: number, vh: number, pad = 40): Camera {
  const side = PORT_D / 2 + PORT_LABEL_ROOM;
  let c = fit(b, vw, vh, pad);
  for (let k = 0; k < 3; k++) {
    const m = side / c.zoom;
    c = fit({ x: b.x - m, y: b.y, w: b.w + 2 * m, h: b.h }, vw, vh, pad);
  }
  return c;
}

// "Mostrar tudo" da Montar: o zoom muda o tamanho do cartão no mundo, então enquadra algumas vezes até assentar.
// null sem blocos (quem chama decide o enquadramento do mapa vazio).
export function fitMontar(scene: Scene, f: Factory, data: GameData, flow: FlowResult, vw: number, vh: number, phone: boolean, pad = 40): Camera | null {
  let z = MONTAR_REF, c: Camera | null = null;
  for (let k = 0; k < 4; k++) {
    const r = montarBounds(scene, f, data, flow, z, phone);
    if (!r.w && !r.h) return null;
    c = fit(r, vw, vh, pad, MONTAR_LIMITS);
    if (Math.abs(c.zoom - z) < 1e-6) break;
    z = c.zoom;
  }
  return c;
}
