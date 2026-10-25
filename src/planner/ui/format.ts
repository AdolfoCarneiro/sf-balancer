import { fmt, t } from '../../i18n/index.js';
import type { Item } from '../model/types.ts';
import { FOUNDATION } from '../model/map/sizes.ts';

// Taxa com a unidade do item: /min para sólido, m³/min para fluido.
export const rateText = (item: Item | undefined, x: number): string =>
  t(item?.fluid ? 'plPerMinFluid' : 'plPerMin', fmt(x));

// Fundações (8 m) que cobrem m metros.
export const foundations = (m: number): number => Math.ceil(m / FOUNDATION - 1e-9) || 0;   // || 0: sem -0
// Medida de um bloco, meio ou área: metros e fundações.
export const sizeText = (r: { w: number; h: number }): string =>
  t('plMapSize', fmt(r.w, 0), fmt(r.h, 0), fmt(foundations(r.w), 0), fmt(foundations(r.h), 0));
