// O que a tela da etapa sabe da esteira selecionada, sem DOM: as linhas, o padrão de corte, o recomendado e a conta do
// corte ("7 × 65 = 455/min, cabe na Mk4; com 8 passaria"). Esteira sem máquina (taxa 0) não tem corte recomendado.
import type { Arrangement, ArrLine } from './layout.ts';
import { fixCut, setBelt, sharedKeyOf } from './layoutedit.ts';
import type { GameData, Layout, Stage } from './types.ts';

const E = 1e-9;
export const beltKeyOf = (l: ArrLine): string => `${l.side}:${l.item}`;

export interface BeltInfo {
  lines: ArrLine[]; first: ArrLine; shared: boolean;
  per: number;              // taxa de uma máquina (0 sem máquinas)
  rec: number | null;       // o maior corte que cabe na esteira (null sem máquinas)
  defCut: number | null;    // o corte padrão (na compartilhada, rec; nas outras, sem corte)
  longest: number;          // máquinas da maior linha
  cut: number | null;       // o corte em vigor (null pela ponta ou sem corte)
  recLayout: () => Layout | null;   // o Layout do botão "Recomendado"
}

export function beltInfo(stage: Stage, data: GameData, arr: Arrangement, key: string): BeltInfo | null {
  const lines = arr.lines.filter(l => beltKeyOf(l) === key);
  if (!lines.length) return null;
  const lay = stage.layout, first = lines[0];
  const shared = sharedKeyOf(stage, data, lay) === key;
  const per = first.machines > 0 ? first.rate / first.machines : 0;
  const rec = per > 0 ? Math.max(1, Math.floor(first.cap / per + E)) : null;
  const edit = lay?.belts?.[key];
  const defCut = shared ? rec : null;
  const longest = lines.reduce((m, l) => Math.max(m, l.machines), 0);
  const cut = first.exit === 'end' ? null : edit?.cut ?? defCut;
  // Recomendado: o padrão do modelo (na compartilhada, o maior corte que cabe); uma esteira sem corte que passa do limite
  // fecha no maior que cabe (descendo, se saía pela ponta).
  const fits = lines.every(l => l.rate <= l.cap + E);
  const recLayout = (): Layout | null =>
    (shared || edit?.cut || fits || rec === null ? setBelt(lay, key, { cut: null }) : fixCut(lay, key, rec, first.exit));
  return { lines, first, shared, per, rec, defCut, longest, cut, recLayout };
}

// A conta do corte: n máquinas × a taxa de cada uma; 'max' = cabe e com n + 1 passaria, 'fits' = cabe com folga,
// 'over' = passa do limite. null sem máquinas (nada a explicar).
export function cutMath(info: BeltInfo): { n: number; per: number; total: number; state: 'max' | 'fits' | 'over' } | null {
  if (info.per <= 0) return null;
  const n = info.cut ?? info.longest, total = n * info.per, cap = info.first.cap;
  const state = total > cap + E ? 'over' : (n + 1) * info.per > cap + E ? 'max' : 'fits';
  return { n, per: info.per, total, state };
}
