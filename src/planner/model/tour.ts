// Tutorial do builder: os passos (puros, sem DOM). Cada passo aponta para um alvo de verdade na tela pelo atributo
// data-tour; `target` é o nome, com alternativas separadas por "|" (vale o primeiro que estiver à vista: ex. os avisos do
// painel, ou o botão que abre o painel quando ele está fechado). Alguns nomes não são elementos e sim pontos do canvas
// (map-port, map-chip, map-block), que o mapa registra. Título e texto são chaves de i18n.
export type TourArea = 'map' | 'panel' | 'stage';
export interface TourStep { id: string; target: string; area: TourArea; title: string; body: string }

// Lembrado neste navegador: concluído ou pulado não abre sozinho de novo.
export const TOUR_STORE = 'sf-balancer:planner-tour';
export const tourDone = (v: string | null): boolean => v === 'done' || v === 'skipped';

const step = (id: string, target: string, area: TourArea, key: string): TourStep =>
  ({ id, target, area, title: `plTour${key}T`, body: `plTour${key}B` });

// A ordem do tutorial completo; "Como mexer" de uma área mostra só os dela, na mesma ordem.
const STEPS: TourStep[] = [
  step('new', 'map-new', 'map', 'New'),
  step('port', 'map-port', 'map', 'Port'),
  step('chip', 'map-chip', 'map', 'Chip'),
  step('balance', 'balance', 'map', 'Balance'),
  step('panel', 'panel-fixes|panel-warns|panel-toggle', 'panel', 'Panel'),
  step('panel-blocks', 'panel-blocks', 'panel', 'PanelBlocks'),
  step('block', 'map-block', 'map', 'Block'),
  step('view', 'view', 'map', 'View'),
  step('together', 'map-together', 'map', 'Together'),
  step('layers', 'map-layers', 'map', 'Layers'),
  step('import', 'panel-import|import', 'panel', 'Import'),
  step('share', 'share', 'map', 'Share'),
  step('again', 'map-tour', 'map', 'Again'),
  step('stage-drawing', 'stage-drawing', 'stage', 'StDrawing'),
  step('stage-models', 'stage-models', 'stage', 'StModels'),
  step('stage-panel', 'stage-belt-panel', 'stage', 'StPanel'),
  step('stage-summary', 'stage-summary', 'stage', 'StSummary'),
  step('stage-back', 'stage-back', 'stage', 'StBack'),
];

export function tourSteps(area?: TourArea): TourStep[] {
  return area ? STEPS.filter(s => s.area === area) : STEPS.slice();
}

export const targetNames = (target: string): string[] => target.split('|').map(s => s.trim()).filter(Boolean);

// O próximo passo à vista a partir de `from` (exclusivo) no sentido `dir`; null quando não há mais (acaba ou fica).
export function nextShown(n: number, from: number, dir: 1 | -1, shown: (i: number) => boolean): number | null {
  for (let i = from + dir; i >= 0 && i < n; i += dir) if (shown(i)) return i;
  return null;
}
