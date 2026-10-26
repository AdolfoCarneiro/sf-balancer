// Camadas do mapa (as duas vistas): ícones, nomes, ligações (esteiras do mapa, chips, peças das ligações na Planta) e
// portas (com os rótulos de estado). Tudo desligado = só os blocos/máquinas e a grade. Fica no navegador, não no Factory.
import type { ViewGeo } from './cards.ts';

export interface MapLayers { icons: boolean; names: boolean; links: boolean; ports: boolean }
export const LAYER_KEYS = ['icons', 'names', 'links', 'ports'] as const;
export const ALL_LAYERS: MapLayers = { icons: true, names: true, links: true, ports: true };
export const NO_LAYERS: MapLayers = { icons: false, names: false, links: false, ports: false };

// Lido do localStorage (JSON): o que não for booleano vale o padrão (ligado).
export function cleanLayers(v: unknown): MapLayers {
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  const out = { ...ALL_LAYERS };
  for (const k of LAYER_KEYS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  return out;
}

// Uma escolha por vista ({ montar, planta }). O formato antigo (uma só para as duas) vale para as duas.
export interface ViewLayers { montar: MapLayers; planta: MapLayers }
export function cleanViewLayers(v: unknown): ViewLayers {
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  if (!('montar' in o) && !('planta' in o)) { const one = cleanLayers(v); return { montar: one, planta: { ...one } }; }
  return { montar: cleanLayers(o.montar), planta: cleanLayers(o.planta) };
}

// A geometria de tela que pega o ponteiro: sem as portas escondidas (camada desligada ou de longe) e sem os chips
// escondidos (ligações desligadas ou a Montar de longe).
export function hitGeo(v: ViewGeo, layers: MapLayers, portsLive: boolean, chipsLive: boolean): ViewGeo {
  const ports = layers.ports && portsLive, chips = layers.links && chipsLive;
  return ports && chips ? v : { ...v, ports: ports ? v.ports : [], chips: chips ? v.chips : [] };
}
