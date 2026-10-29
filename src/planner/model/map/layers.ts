// Camadas do mapa (as duas vistas): ícones, nomes, ligações (esteiras do mapa, chips, peças das ligações na Planta) e
// portas (com os rótulos de estado). Tudo desligado = só os blocos/máquinas e a grade. Fica no navegador, não no Factory.
// compact: ligações compactas (como no Modeler), o chip vira um ponto com o ícone e a vazão; não é camada (fica fora de
// LAYER_KEYS e do "Só as máquinas").
import type { ViewChip, ViewGeo } from './cards.ts';

export interface MapLayers { icons: boolean; names: boolean; links: boolean; ports: boolean; compact: boolean }
export const LAYER_KEYS = ['icons', 'names', 'links', 'ports'] as const;
export const ALL_LAYERS: MapLayers = { icons: true, names: true, links: true, ports: true, compact: true };
export const NO_LAYERS: MapLayers = { icons: false, names: false, links: false, ports: false, compact: false };

// Lido do localStorage (JSON): o que não for booleano vale o padrão (ligado, compact também).
export function cleanLayers(v: unknown): MapLayers {
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  const out = { ...ALL_LAYERS };
  for (const k of [...LAYER_KEYS, 'compact'] as const) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  return out;
}

// Ponto da ligação compacta (px de tela a 100 %, na escala do desenho, ViewGeo.k): o que pega o ponteiro, o ponto e, em cima, o ícone e a vazão.
export const DOT_W = 64, DOT_H = 52;
// Ligações compactas: o chip que não está aberto (open: o selecionado) vira o ponto. Passar o ponteiro não abre: só o
// clique.
export function compactChips(v: ViewGeo, on: boolean, open: (meio: string) => boolean): ViewGeo {
  // Os links além do primeiro de uma ligação são sempre ponto (o chip aberto é um só, no primeiro).
  const dot = (c: ViewChip): ViewChip => ({ ...c, w: DOT_W * v.k, h: DOT_H * v.k, compact: true as const });
  if (!on) return v.chips.some(c => c.extra) ? { ...v, chips: v.chips.map(c => (c.extra ? dot(c) : c)) } : v;
  return { ...v, chips: v.chips.map(c => (open(c.meio) && !c.extra ? c : dot(c))) };
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
