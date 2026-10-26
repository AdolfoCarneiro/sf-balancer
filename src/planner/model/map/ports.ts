// Portas dos blocos no mapa, para arrastar e ligar: onde ficam, qual está sob o ponteiro e o que soltar uma porta faz
// (ligar, abrir o seletor filtrado ou nada, com o motivo). Puro.
import type { Factory, GameData, ItemId, StageId } from '../types.ts';
import { canConnect } from '../factory.ts';
import type { PickerFilter } from '../picker.ts';
import type { Pt } from './geo.ts';
import { toWorld, type Scene } from './scene.ts';

// dir: para onde a porta aponta no mundo (para fora do bloco).
export interface ScenePort { block: StageId; item: ItemId; side: 'in' | 'out'; x: number; y: number; fluid: boolean; dir?: Pt }
export type DropTarget =
  | { kind: 'connect'; from: StageId; to: StageId; item: ItemId }
  | { kind: 'picker'; filter: PickerFilter }
  | { kind: 'none'; reason: 'self' | 'item' | 'dup' | 'fluidSink' | 'full' };

// Saída aponta no sentido do fluxo dentro do bloco; entrada, ao contrário.
const DIR: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// Uma porta por (bloco, lado, item), no meio das âncoras daquele item (uma por fileira).
export function scenePorts(scene: Scene, f: Factory, d: GameData): ScenePort[] {
  const out: ScenePort[] = [];
  const ids = new Set(f.blocks.map(b => b.id));
  for (const b of scene.blocks) {
    if (!ids.has(b.stage)) continue;
    const [dx, dy] = DIR[b.place.rot];
    for (const side of ['in', 'out'] as const) {
      const byItem = new Map<ItemId, Pt[]>();
      for (const a of b.geo[side === 'in' ? 'ins' : 'outs']) {
        const p = toWorld([a.x, a.y], b.geo, b.place), l = byItem.get(a.item);
        if (l) l.push(p); else byItem.set(a.item, [p]);
      }
      for (const [item, pts] of byItem) {
        const x = pts.reduce((s, p) => s + p[0], 0) / pts.length, y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const k = side === 'out' ? 1 : -1;
        out.push({ block: b.stage, item, side, x, y, fluid: !!d.items[item]?.fluid, dir: [dx * k + 0, dy * k + 0] });
      }
    }
  }
  return out;
}

// A porta mais perto do ponto, até `tol` m (no mapa, 8 px de tela ÷ zoom).
export function portAt(ports: ScenePort[], x: number, y: number, tol: number): ScenePort | null {
  let best: ScenePort | null = null, bd = tol;
  for (const p of ports) {
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist <= bd) { best = p; bd = dist; }
  }
  return best;
}

// Soltar a porta `from`: no vazio abre o seletor (quem consome o item puxado de uma saída, quem produz o de uma
// entrada); numa porta do outro lado com o mesmo item, liga (sempre da saída para a entrada); senão, nada e o motivo.
export function dropTarget(f: Factory, d: GameData, from: ScenePort, to: ScenePort | null): DropTarget {
  if (!to) return { kind: 'picker', filter: from.side === 'out' ? { consumes: from.item } : { produces: from.item } };
  if (to.block === from.block) return { kind: 'none', reason: 'self' };
  if (to.side === from.side || to.item !== from.item) return { kind: 'none', reason: 'item' };
  const [src, dst] = from.side === 'out' ? [from.block, to.block] : [to.block, from.block];
  const ok = canConnect(f, d, src, dst, from.item);
  return ok.ok ? { kind: 'connect', from: src, to: dst, item: from.item } : { kind: 'none', reason: ok.reason };
}
