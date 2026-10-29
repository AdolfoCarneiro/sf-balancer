import icons from '../data/icons.json' with { type: 'json' };

// Prédios sem receita que também têm ícone (a Freight Platform representa a Saída).
export const SPECIAL_ICON = {
  miner: 'Build_MinerMk1_C', sink: 'Build_ResourceSink_C', container: 'Build_StorageContainerMk1_C',
  fluidContainer: 'Build_PipeStorageTank_C', export: 'Build_TrainDockingStation_C',
  splitter: 'Build_ConveyorAttachmentSplitter_C', merger: 'Build_ConveyorAttachmentMerger_C',
} as const;

const have = new Set<string>(icons);
// Miner Mk.2/Mk.3 sem ícone baixado ainda: o do Mk.1.
const real = (id: string) => (have.has(id) || !/^Build_MinerMk\d_C$/.test(id) ? id : SPECIAL_ICON.miner);
export const iconUrl = (id: string): string | null => (have.has(real(id)) ? `/icons/${real(id)}.webp` : null);

const cache = new Map<string, HTMLImageElement | null>();
// Imagem para o canvas, com cache por id; null sem ícone ou fora do navegador.
export function iconImage(id: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (cache.has(id)) return cache.get(id)!;
  const url = iconUrl(id);
  let img: HTMLImageElement | null = null;
  if (url) { img = new Image(); img.src = url; }
  cache.set(id, img);
  return img;
}
