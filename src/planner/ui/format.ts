import { fmt, t } from '../../i18n/index.js';
import type { Block, GameData, Item, ItemId } from '../model/types.ts';
import { FOUNDATION } from '../model/map/sizes.ts';
import type { Badge } from '../model/badges.ts';
import { SPECIAL_ICON } from './icons.ts';

// Taxa com a unidade do item: /min para sólido, m³/min para fluido.
export const rateText = (item: Item | undefined, x: number): string =>
  t(item?.fluid ? 'plPerMinFluid' : 'plPerMin', fmt(x));

// Fundações (8 m) que cobrem m metros.
export const foundations = (m: number): number => Math.ceil(m / FOUNDATION - 1e-9) || 0;   // || 0: sem -0
// Medida de um bloco, meio ou área: metros e fundações.
export const sizeText = (r: { w: number; h: number }): string =>
  t('plMapSize', fmt(r.w, 0), fmt(r.h, 0), fmt(foundations(r.w), 0), fmt(foundations(r.h), 0));

// Nome do bloco na tela: a receita; a origem com o item (Miner · Iron Ore, Water Extractor · Water); a sobra pelo tipo.
export function blockName(b: Block, d: GameData): string {
  const item = (id: ItemId) => d.items[id]?.name ?? id;
  switch (b.kind) {
    case 'recipe': return d.recipes[b.recipe]?.name ?? b.recipe;
    case 'miner': return `${t('plMiner')} · ${item(b.item)}`;
    case 'extractor': return `${d.extractors[b.building]?.name ?? b.building} · ${item(b.item)}`;
    case 'input': return `${t('plInput')} · ${item(b.item)}`;
    case 'sink': return t('plSink');
    case 'container': return t('plContainer');
    default: return t('plExport');
  }
}

// Texto de um aviso do bloco. unit: com a unidade (/min, m³/min) no painel; sem ela no canvas. Saída marcada para
// coletar: a sobra vai para o Awesome Sink.
export function badgeText(b: Badge, blk: Block, d: GameData, unit: boolean): string {
  const it = b.item ? d.items[b.item] : undefined;
  const n = b.amount === null ? '' : unit ? rateText(it, b.amount) : fmt(b.amount);
  switch (b.kind) {
    case 'deficit': return t('plDeficit', n);
    case 'held': return t('plHeld', n);
    case 'exit': return blk.kind === 'recipe' && b.item && blk.collect?.includes(b.item) ? `${t('plSink')} ${n}` : t('plExit', n);
    case 'stalled': return t('plStalled', it?.name ?? b.item ?? '') + (b.amount === null ? '' : ` · ${t('plStalledWould', n)}`);
    case 'unbounded': return t('plUnbounded');
    default: return t('plDeadlockShort');
  }
}

// Ícone do bloco: o produto principal da receita, o item da Entrada, ou o prédio da origem e da sobra.
export function blockIcon(b: Block, d: GameData): string | null {
  switch (b.kind) {
    case 'recipe': return d.recipes[b.recipe]?.outs[0]?.item ?? null;
    case 'miner': return SPECIAL_ICON.miner;
    case 'extractor': return b.building;
    case 'input': return b.item;
    default: return SPECIAL_ICON[b.kind];
  }
}
