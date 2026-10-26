// Arrastar e ligar portas: o que soltar uma porta faz (ligar, abrir o seletor filtrado ou nada, com o motivo). Puro. Onde
// as portas ficam na tela vem de viewGeo (map/cards.ts).
import type { Factory, GameData, ItemId, StageId } from '../types.ts';
import { canConnect } from '../factory.ts';
import type { PickerFilter } from '../picker.ts';
import type { Pt } from './geo.ts';

// dir: para onde a porta aponta no mundo (para fora do bloco).
export interface ScenePort { block: StageId; item: ItemId; side: 'in' | 'out'; x: number; y: number; fluid: boolean; dir?: Pt }
export type DropTarget =
  | { kind: 'connect'; from: StageId; to: StageId; item: ItemId }
  | { kind: 'picker'; filter: PickerFilter }
  | { kind: 'none'; reason: 'self' | 'item' | 'dup' | 'fluidSink' | 'full' };

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
