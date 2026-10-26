// Edições do arranjo feitas na tela da etapa: cada função devolve o Layout novo (null = fileira simples sem ajustes,
// que apaga o campo), para a tela mandar um setLayout só por gesto.
import type { Arrangement, LayoutWarning } from './layout.ts';
import type { Action } from './factorystate.ts';
import type { GameData, Layout, LayoutExit, LayoutKind, RowEdit, Side, Stage } from './types.ts';
import { tierKey } from './stage.ts';

const SHIFT_MAX = 800;

// Tira o que ficou vazio; simples sem nada = null.
export function normLayout(l: Layout): Layout | null {
  const out: Layout = { kind: l.kind };
  if (l.invert && l.kind !== 'simple') out.invert = true;
  const rows = Object.entries(l.rows ?? {}).filter(([, e]) => Object.keys(e).length);
  if (rows.length) out.rows = Object.fromEntries(rows);
  const belts = Object.entries(l.belts ?? {}).filter(([, e]) => Object.keys(e).length);
  if (belts.length) out.belts = Object.fromEntries(belts);
  if (l.joins?.length) out.joins = [...l.joins];
  return out.kind === 'simple' && Object.keys(out).length === 1 ? null : out;
}

const base = (cur: Layout | undefined): Layout => cur ?? { kind: 'simple' };

// Trocar de modelo (ou inverter) zera os ajustes.
export const setKind = (kind: LayoutKind): Layout | null => normLayout({ kind });
export const setInvert = (cur: Layout | undefined, on: boolean): Layout | null => normLayout({ kind: base(cur).kind, invert: on });
export const resetModel = (cur: Layout | undefined): Layout | null => normLayout({ kind: base(cur).kind, invert: cur?.invert });
export const hasEdits = (cur: Layout | undefined): boolean => !!(cur?.rows || cur?.belts || cur?.joins);

const withRow = (cur: Layout | undefined, i: number, f: (e: RowEdit) => RowEdit): Layout => {
  const l = base(cur), e = f({ ...l.rows?.[i] });
  for (const k of Object.keys(e) as (keyof RowEdit)[]) if (!e[k]) delete e[k];
  return { ...l, rows: { ...l.rows, [i]: e } };
};
// Junções que envolvem a fileira i: a dela com a de baixo (@i) e a da de cima com ela (@i−1).
const dropJoinsOf = (l: Layout, i: number): Layout =>
  ({ ...l, joins: (l.joins ?? []).filter(j => { const r = Number(j.slice(j.lastIndexOf('@') + 1)); return r !== i && r !== i - 1; }) });

export const toggleRow = (cur: Layout | undefined, i: number, what: 'flip' | 'mirror'): Layout | null =>
  normLayout(withRow(cur, i, e => ({ ...e, [what]: !e[what] })));

// Move a fileira em passos de 8 m (dx/dy em m); mover tira as junções dela.
export function moveRow(cur: Layout | undefined, i: number, ddx: number, ddy: number): Layout | null {
  const snap = (v: number) => Math.max(-SHIFT_MAX, Math.min(SHIFT_MAX, Math.round(v / 8) * 8));
  const moved = withRow(cur, i, e => ({ ...e, dx: snap((e.dx ?? 0) + ddx), dy: snap((e.dy ?? 0) + ddy) }));
  return normLayout(dropJoinsOf(moved, i));
}
export const resetRowPlace = (cur: Layout | undefined, i: number): Layout | null =>
  normLayout(withRow(cur, i, e => ({ ...e, dx: 0, dy: 0 })));

// Esteira de um item (chave tierKey): cut/exit null = o padrão do modelo.
export function setBelt(cur: Layout | undefined, key: string, patch: { cut?: number | null; exit?: LayoutExit | null }): Layout | null {
  const l = base(cur), e = { ...l.belts?.[key] };
  if (patch.cut !== undefined) { if (patch.cut === null) delete e.cut; else e.cut = patch.cut; }
  if (patch.exit !== undefined) { if (patch.exit === null) delete e.exit; else e.exit = patch.exit; }
  return normLayout({ ...l, belts: { ...l.belts, [key]: e } });
}

// "Fechar antes": o corte só vale saindo por baixo/cima, então quem sai pela ponta passa a descer.
export const fixCut = (cur: Layout | undefined, key: string, cut: number, exit: LayoutExit): Layout | null =>
  setBelt(cur, key, exit === 'end' ? { cut, exit: 'down' } : { cut });

export function toggleJoin(cur: Layout | undefined, join: string): Layout | null {
  const l = base(cur), joins = l.joins ?? [];
  return normLayout({ ...l, joins: joins.includes(join) ? joins.filter(j => j !== join) : [...joins, join] });
}

// A esteira `key` da fileira r pode juntar com a da r+1? 'joined': já junta (@r); 'can': as duas estão coladas,
// viradas uma para a outra, sem deslocamento e a r não divide com a de cima; null: nada a oferecer.
export function joinState(arr: Arrangement, cur: Layout | undefined, key: string, r: number): 'joined' | 'can' | null {
  if (arr.kind === 'center') return null;
  const join = `${key}@${r}`;
  if (cur?.joins?.includes(join)) return 'joined';
  const top = arr.rows.find(x => x.index === r), bot = arr.rows.find(x => x.index === r + 1);
  if (!top || !bot || cur?.joins?.includes(`${key}@${r - 1}`)) return null;
  const moved = (i: number) => !!(cur?.rows?.[i]?.dx || cur?.rows?.[i]?.dy);
  if (moved(r) || moved(r + 1)) return null;
  const faces = key.startsWith('out:') ? !top.flip && bot.flip : top.flip && !bot.flip;
  return faces ? 'can' : null;
}

// Consertos de um aviso do arranjo, sem texto: a tela põe o rótulo pelo `kind` e manda a `action` (uma só).
export type WarningFix =
  | { kind: 'tier'; tier: string; action: Action }
  | { kind: 'cut'; n: number; action: Action }
  | { kind: 'perRow'; n: number; action: Action }
  | { kind: 'down' | 'uncut' | 'unjoin'; action: Action };
export function warningFixes(w: LayoutWarning, stage: Stage, arr: Arrangement): WarningFix[] {
  const lay = stage.layout, id = stage.id;
  const set = (layout: Layout | null): Action => ({ type: 'setLayout', id, layout });
  switch (w.kind) {
    case 'over': {
      const key = `${w.side}:${w.item}`, line = arr.lines.find(l => `${l.side}:${l.item}` === key);
      const out: WarningFix[] = [];
      if (w.fixTier) out.push({ kind: 'tier', tier: w.fixTier, action: { type: 'setTier', id, side: w.side === 'in' ? 'ins' : 'outs', item: w.item, tier: w.fixTier } });
      if (line && !line.fluid) out.push({ kind: 'cut', n: w.fixCut, action: set(fixCut(lay, key, w.fixCut, line.exit)) });
      // Cano sem tier que caiba: menos máquinas por fileira (no center o modelo divide as máquinas, sem esse campo).
      else if (line?.fluid && !w.fixTier && arr.kind !== 'center') out.push({ kind: 'perRow', n: w.fixCut, action: { type: 'setPerRow', id, perRow: w.fixCut } });
      return out;
    }
    case 'centerEnd': return [{ kind: 'down', action: set(setBelt(lay, tierKey(lay?.invert ? 'ins' : 'outs', w.item), { exit: 'down' })) }];
    case 'cutPipe': return [{ kind: 'uncut', action: set(setBelt(setBelt(lay, `in:${w.item}`, { cut: null }) ?? undefined, `out:${w.item}`, { cut: null })) }];
    case 'badJoin': return lay?.joins?.includes(w.key) ? [{ kind: 'unjoin', action: set(toggleJoin(lay, w.key)) }] : [];
    case 'merger3': return [];
  }
}

// A esteira compartilhada do center (a principal sólida do corredor): o padrão dela é descer, com corte.
export function sharedKeyOf(stage: Stage, data: GameData, cur: Layout | undefined): string | null {
  if (cur?.kind !== 'center') return null;
  const side: Side = cur.invert ? 'ins' : 'outs';
  const f = data.recipes[stage.recipe][side].find(x => !data.items[x.item].fluid);
  return f ? tierKey(side, f.item) : null;
}
