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

export const CARD_W = 260, MARK_W = 220, MARK_H = 108;
export const PORT_D = 44, PORT_Y0 = 38, PORT_STEP = 52, CHIP_W = 120, CHIP_H = 52, PLANT_PORT_OUT = 30;
// Px por metro em que o cartão tem 100 %.
export const MONTAR_REF = 4;
// Marcador: a primeira porta no meio da altura (as seguintes descem PORT_STEP e o cartão cresce junto).
const MARK_PORT_Y0 = MARK_H / 2;
// Abaixo da última porta do marcador; o cartão de receita é o cabeçalho com um rodapé curto.
const CARD_FOOT = 34, CARD_HEAD = 62, RECIPE_FOOT = 14;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const mean = (ps: Pt[]): Pt | null => (ps.length ? [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length] : null);

// Até MONTAR_FAR o cartão não fica abaixo de 70 % (60 % no celular); mais de longe ele segue o mapa (o tamanho no
// mundo fica parado) e as portas e os chips somem, para ver a fábrica inteira.
export const MONTAR_FAR = MONTAR_REF * 0.35;
const CARD_LO = 0.7, CARD_LO_PHONE = 0.6;
export const cardScale = (zoom: number, phone: boolean): number => {
  const lo = phone ? CARD_LO_PHONE : CARD_LO;
  return zoom >= MONTAR_FAR ? clamp(zoom / MONTAR_REF, lo, 1.15) : lo * zoom / MONTAR_FAR;
};
// O maior tamanho do cartão no mundo, em metros por px do cartão a 100 %: de longe (zoom ≤ MONTAR_FAR) no desktop; em
// qualquer outro zoom o cartão ocupa menos mundo.
export const CARD_MAX_M_PER_PX = CARD_LO / MONTAR_FAR;
// Montar (t < 0.5) de longe: sem portas nem chips na tela e no ponteiro.
export const montarFar = (t: number, zoom: number): boolean => t < 0.5 && zoom < MONTAR_FAR;

// Tamanho do cartão a 100 %. Receita: o cabeçalho (ícone, nome, prédio, máquinas e clock) com um rodapé curto, ou a
// altura das portas com a mesma folga em cima e embaixo (PORT_Y0), o que for maior; sem faixa de fileiras (elas ficam
// na miniatura do painel). Marcador: fixo, crescendo só com mais de uma porta.
export function cardSize(kind: 'recipe' | 'marker', nIns: number, nOuts: number): { w: number; h: number } {
  const n = Math.max(nIns, nOuts);
  if (kind === 'marker') return { w: MARK_W, h: Math.max(MARK_H, MARK_PORT_Y0 + (n - 1) * PORT_STEP + CARD_FOOT) };
  return { w: CARD_W, h: Math.max(CARD_HEAD + RECIPE_FOOT, 2 * PORT_Y0 + Math.max(0, n - 1) * PORT_STEP) };
}

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
// x/y: centro da porta; dir: para fora do bloco; lanes: na Planta, o ponto de tela de cada fileira daquela porta (na
// transição, saindo da porta da Montar).
export interface ViewPort { block: StageId; side: 'in' | 'out'; item: ItemId; x: number; y: number; dir: Pt; lanes: Pt[] }
// x/y: centro do chip; compact: desenhado como o ponto da ligação compacta (w/h: o que pega o ponteiro).
export interface ViewChip { meio: string; x: number; y: number; w: number; h: number; compact?: true }
export interface ViewGeo { blocks: ViewBlock[]; ports: ViewPort[]; chips: ViewChip[] }

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
  const z = cam.zoom, s = cardScale(z, phone);
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
    const y0 = spec.kind === 'marker' ? MARK_PORT_Y0 : PORT_Y0;
    for (const side of ['in', 'out'] as const) {
      const items = side === 'in' ? spec.ins : spec.outs;
      const pl = plantPorts(sb, side, items, plant, toS);
      items.forEach((item, i) => {
        const m: Pt = [side === 'in' ? card.x : card.x + card.w, card.y + (y0 + i * PORT_STEP) * s];
        montar.set(`${b.id}|${side}|${item}`, m);
        const [px, py] = lerpPt(m, pl[i].at, t);
        const dir: Pt = t < 0.5 ? [side === 'in' ? -1 : 1, 0] : pl[i].dir;
        ports.push({ block: b.id, side, item, x: px, y: py, dir, lanes: pl[i].lanes.map(l => lerpPt(m, l, t)) });
      });
    }
  }
  const groups = groupsOf(f.links), chips: ViewChip[] = [];
  for (const sm of scene.meios) {
    const center = toS([sm.rect.x + sm.rect.w / 2, sm.rect.y + sm.rect.h / 2]);
    let m0 = sm.chip ? toS(sm.chip) : center;
    const g = groups.get(sm.meio);
    // Sem posição na Montar: lá, no meio entre as saídas das produtoras e as entradas das consumidoras.
    if (g && !sm.chip) {
      const pick = (ids: StageId[], side: 'in' | 'out') => ids.map(id => montar.get(`${id}|${side}|${g.item}`)).filter((p): p is Pt => !!p);
      const a = mean(pick(g.producers, 'out')), b = mean(pick(g.consumers, 'in'));
      m0 = a && b ? lerpPt(a, b, 0.5) : a ?? b ?? center;
    }
    const [x, y] = lerpPt(m0, center, t);
    chips.push({ meio: sm.meio, x, y, w: CHIP_W, h: CHIP_H });
  }
  return { blocks, ports, chips };
}

export type ViewHit = { kind: 'port'; port: ViewPort } | { kind: 'chip'; meio: string } | { kind: 'block'; id: StageId } | null;

// O que está desenhado por cima ganha: chip antes de porta antes de bloco; dentro de cada um, o último desenhado ganha.
export function viewHit(v: ViewGeo, sx: number, sy: number): ViewHit {
  for (let i = v.chips.length - 1; i >= 0; i--) {
    const c = v.chips[i];
    if (Math.abs(sx - c.x) <= c.w / 2 && Math.abs(sy - c.y) <= c.h / 2) return { kind: 'chip', meio: c.meio };
  }
  const r = PORT_D / 2 + 6;
  for (let i = v.ports.length - 1; i >= 0; i--) if (Math.hypot(v.ports[i].x - sx, v.ports[i].y - sy) <= r) return { kind: 'port', port: v.ports[i] };
  for (let i = v.blocks.length - 1; i >= 0; i--) {
    const b = v.blocks[i].rect;
    if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return { kind: 'block', id: v.blocks[i].id };
  }
  return null;
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
// delas por fora (de longe, sem portas na tela, sem essa folga), e os chips postos (no lugar da Montar). Vazio sem blocos.
export function montarBounds(scene: Scene, f: Factory, data: GameData, flow: FlowResult, z: number, phone: boolean): Rect {
  const s = cardScale(z, phone), byId = new Map(f.blocks.map(b => [b.id, b]));
  const m = montarFar(0, z) ? 0 : (PORT_D / 2 + PORT_LABEL_ROOM) / z;
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
  for (const sm of scene.meios) {
    if (!sm.chip) continue;
    const [cx, cy] = sm.chip, hw = CHIP_W / 2 / z, hh = CHIP_H / 2 / z;
    add(cx - hw, cy - hh, cx + hw, cy + hh);
  }
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
