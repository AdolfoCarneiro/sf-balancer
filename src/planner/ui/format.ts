import { fmt, t } from '../../i18n/index.js';
import type { Item } from '../model/types.ts';

// Taxa com a unidade do item: /min para sólido, m³/min para fluido.
export const rateText = (item: Item | undefined, x: number): string =>
  t(item?.fluid ? 'plPerMinFluid' : 'plPerMin', fmt(x));
