import type { GameData, Stage, MapPlace } from '../types.ts';
import { arrange } from '../layout.ts';
import type { BlockGeo } from './geo.ts';

// Bloco da etapa em coordenadas locais (rot 0): o desenho do arranjo do bloco (sem arranjo, a fileira simples:
// entradas em x = 0, saídas em x = w).
export function blockGeo(stage: Stage, data: GameData, place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>): BlockGeo {
  return arrange(stage, data, stage.layout, place).geo;
}
