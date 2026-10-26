// Desenho da cena do mapa num canvas 2D: junta as partes de draw/ (fundo e Planta em escala, portas, rótulos). Só
// desenha o que a câmera vê; de longe, bloco e meio viram retângulo com rótulo, de perto (zoom ≥ DETAIL_ZOOM) aparecem
// máquinas, faixas, peças e esteiras com a cor do item.
import { visible, type Camera } from '../model/map/camera.ts';
import type { Pt, Rect } from '../model/map/geo.ts';
import type { ScenePort } from '../model/map/ports.ts';
import type { Badge } from '../model/badges.ts';
import type { Scene } from '../model/map/scene.ts';
import type { ItemId, StageId } from '../model/types.ts';
import type { WorldCtx } from './draw/belts.ts';
import { drawPlantLabels, makeLabels } from './draw/labels.ts';
import { drawPlantFloor, drawPlantWorld, drawRuler } from './draw/plant.ts';
import { drawPortsWorld } from './draw/ports.ts';
import type { MapTheme } from './draw/theme.ts';

export { readTheme, type MapTheme } from './draw/theme.ts';
export { PORT_ZOOM } from './draw/ports.ts';

export interface DrawOpts {
  selected: string | null; hover: string | null;
  colors: Record<string, string>; names: (item: ItemId) => string;
  theme: MapTheme;
  // Rótulos de fora: o bloco (receita · máquinas, fileiras) e o meio (caso, linhas), já no idioma da tela. icon: id do
  // ícone antes do título (produto principal, prédio da origem ou da sobra, item da ligação); alert: o motivo do
  // travado (de longe vai no lugar do sub; de perto ele fica só na porta parada).
  blockText: (stage: StageId) => { title: string; sub: string; icon: string | null; alert: string };
  meioText: (meio: string) => { title: string; sub: string; icon: string | null };
  // Avisos do fluxo de cada bloco (falta, represado, saída, travado…) e o texto curto de cada um (sem unidade).
  badges: (stage: StageId) => Badge[];
  badgeLabel: (stage: StageId, b: Badge) => string;
  // Portas dos blocos: a que está sob o ponteiro (chave bloco|lado|item) e, puxando uma, a esteira provisória até o
  // ponteiro e as portas que aceitam (lit). icon: o ícone já carregado, ou null.
  ports: ScenePort[]; portHover: string | null;
  wire: { from: ScenePort; to: Pt; lit: Set<string> } | null;
  icon: (item: ItemId) => HTMLImageElement | null;
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera, vw: number, vh: number, o: DrawOpts): void {
  const th = o.theme, z = cam.zoom;
  const sx = (x: number) => (x - cam.x) * z, sy = (y: number) => (y - cam.y) * z;

  ctx.save();
  drawPlantFloor(ctx, cam, vw, vh, th);

  const blocks = scene.blocks.filter(b => visible(b.rect, cam, vw, vh));
  const meios = scene.meios.filter(m => visible(m.rect, cam, vw, vh));

  // Daqui até o fim do mundo: unidades em metros.
  ctx.save();
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
  const w: WorldCtx = { ctx, cam, vw, vh, th, colors: o.colors };
  drawPlantWorld(w, scene, blocks, meios, o);
  drawPortsWorld(w, o);
  ctx.restore();

  const boxes: { id: string; r: Rect }[] = [];
  for (const b of blocks) boxes.push({ id: b.stage, r: { x: sx(b.rect.x), y: sy(b.rect.y), w: b.rect.w * z, h: b.rect.h * z } });
  for (const m of meios) boxes.push({ id: m.meio, r: { x: sx(m.rect.x), y: sy(m.rect.y), w: m.rect.w * z, h: m.rect.h * z } });
  const L = makeLabels(ctx, vw, vh, th, o.icon, boxes);
  drawPlantLabels(ctx, scene, cam, vw, vh, blocks, meios, o, L, new Map(boxes.map(b => [b.id, b.r])));
  drawRuler(ctx, z, vh, th, L);
  ctx.restore();
}
