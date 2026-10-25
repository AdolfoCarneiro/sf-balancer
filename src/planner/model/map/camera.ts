// Câmera do mapa: x/y = ponto do mundo (m) no canto superior esquerdo da tela; zoom = px por metro.
import type { Pt, Rect } from './geo.ts';

export interface Camera { x: number; y: number; zoom: number }
export const ZOOM_MIN = 0.05, ZOOM_MAX = 40, DETAIL_ZOOM = 1.5;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export const screenToWorld = (c: Camera, sx: number, sy: number): Pt => [c.x + sx / c.zoom, c.y + sy / c.zoom];

// O ponto do mundo sob (sx, sy) fica parado; o zoom fica dentro dos limites.
export function zoomAt(c: Camera, factor: number, sx: number, sy: number): Camera {
  const zoom = clampZoom(c.zoom * factor);
  const [wx, wy] = screenToWorld(c, sx, sy);
  return { x: wx - sx / zoom, y: wy - sy / zoom, zoom };
}

// dx/dy em px de tela: a câmera anda para a direita/baixo (o mapa vai para o outro lado).
export const pan = (c: Camera, dx: number, dy: number): Camera => ({ x: c.x + dx / c.zoom, y: c.y + dy / c.zoom, zoom: c.zoom });

// O retângulo inteiro na tela, centrado, com `pad` px de margem.
export function fit(bounds: Rect, vw: number, vh: number, pad = 40): Camera {
  const aw = Math.max(1, vw - 2 * pad), ah = Math.max(1, vh - 2 * pad);
  const zoom = clampZoom(Math.min(aw / Math.max(bounds.w, 1e-9), ah / Math.max(bounds.h, 1e-9)));
  return { x: bounds.x + bounds.w / 2 - vw / 2 / zoom, y: bounds.y + bounds.h / 2 - vh / 2 / zoom, zoom };
}

// O retângulo do mundo toca a tela (vw × vh px)?
export function visible(r: Rect, c: Camera, vw: number, vh: number): boolean {
  return r.x + r.w >= c.x && r.y + r.h >= c.y && r.x <= c.x + vw / c.zoom && r.y <= c.y + vh / c.zoom;
}
