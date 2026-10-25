// Edições do mapa: posições novas a partir de arrastar, setas e giro, e o retângulo de um aviso. Puro.
import type { MapPlace, Rot, StageId } from '../types.ts';
import type { Pt, Rect } from './geo.ts';
import type { Scene } from './scene.ts';
import { FOUNDATION } from './sizes.ts';

const snap = (v: number) => Math.round(v / FOUNDATION) * FOUNDATION + 0;   // + 0: sem -0

// A posição de partida deslocada (dx, dy) m, presa na grade de fundações.
export const dragged = (p: MapPlace, dx: number, dy: number): MapPlace => ({ ...p, x: snap(p.x + dx), y: snap(p.y + dy) });

const ARROWS: Record<string, Pt> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
// Seta: uma fundação para o lado; outra tecla: null.
export function nudged(p: MapPlace, key: string): MapPlace | null {
  const d = ARROWS[key];
  return d ? dragged(p, d[0] * FOUNDATION, d[1] * FOUNDATION) : null;
}

// Quarto de volta no sentido horário (as entradas passam para o lado seguinte: esquerda, cima, direita, baixo).
export const rotated = (p: MapPlace): MapPlace => ({ ...p, rot: ((p.rot + 1) % 4) as Rot });

// Todas as posições com uma trocada: o mapa inteiro fica fixo num passo só do desfazer.
export const withPlace = (places: Record<StageId, MapPlace>, id: StageId, place: MapPlace): Record<StageId, MapPlace> =>
  ({ ...places, [id]: place });

const rectOf = (scene: Scene, id: string): Rect | null =>
  scene.blocks.find(b => b.stage === id)?.rect ?? scene.meios.find(m => m.meio === id)?.rect ?? null;

// Área de uma sobreposição: a união dos dois retângulos.
export function warningRect(scene: Scene, [a, b]: [string, string]): Rect | null {
  const p = rectOf(scene, a), q = rectOf(scene, b);
  if (!p || !q) return null;
  const x = Math.min(p.x, q.x), y = Math.min(p.y, q.y);
  return { x, y, w: Math.max(p.x + p.w, q.x + q.w) - x, h: Math.max(p.y + p.h, q.y + q.h) - y };
}
