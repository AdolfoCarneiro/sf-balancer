// Arranjo das fileiras de um bloco: tipos e leitura segura do que vem salvo.
import type { BeltEdit, Layout, LayoutExit, LayoutKind, RowEdit } from './types.ts';

export type { BeltEdit, Layout, LayoutExit, LayoutKind, RowEdit } from './types.ts';

const KINDS: readonly LayoutKind[] = ['simple', 'backToBack', 'center'];
const EXITS: readonly LayoutExit[] = ['end', 'down', 'up'];
const MAX_CUT = 1000, MAX_SHIFT = 800, MAX_ROW = 999, MAX_ENTRIES = 200;
const BELT_KEY = /^(in|out):[^@\s]+$/, JOIN = /^((?:in|out):[^@\s]+)@(\d{1,3})$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const shiftOk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v % 8 === 0 && Math.abs(v) <= MAX_SHIFT;

function cleanRow(v: unknown): RowEdit | null {
  if (!isObj(v)) return null;
  const e: RowEdit = {};
  if (v.flip === true) e.flip = true;
  if (v.mirror === true) e.mirror = true;
  if (shiftOk(v.dx) && v.dx !== 0) e.dx = v.dx;
  if (shiftOk(v.dy) && v.dy !== 0) e.dy = v.dy;
  return Object.keys(e).length ? e : null;
}

function cleanBelt(v: unknown): BeltEdit | null {
  if (!isObj(v)) return null;
  const e: BeltEdit = {};
  if (typeof v.cut === 'number' && Number.isInteger(v.cut) && v.cut >= 1 && v.cut <= MAX_CUT) e.cut = v.cut;
  if (typeof v.exit === 'string' && (EXITS as readonly string[]).includes(v.exit)) e.exit = v.exit as LayoutExit;
  return Object.keys(e).length ? e : null;
}

// null = inválido (cai em simple). Campos ruins somem sem derrubar o resto.
export function cleanLayout(v: unknown): Layout | null {
  if (!isObj(v) || typeof v.kind !== 'string' || !(KINDS as readonly string[]).includes(v.kind)) return null;
  const out: Layout = { kind: v.kind as LayoutKind };
  if (v.invert === true) out.invert = true;
  if (isObj(v.rows)) {
    const rows: Record<number, RowEdit> = {};
    for (const [k, e] of Object.entries(v.rows).slice(0, MAX_ENTRIES)) {
      const i = /^\d{1,3}$/.test(k) ? Number(k) : -1, row = cleanRow(e);
      if (i >= 0 && i <= MAX_ROW && row) rows[i] = row;
    }
    if (Object.keys(rows).length) out.rows = rows;
  }
  if (isObj(v.belts)) {
    const belts: Record<string, BeltEdit> = {};
    for (const [k, e] of Object.entries(v.belts).slice(0, MAX_ENTRIES)) {
      const belt = cleanBelt(e);
      if (BELT_KEY.test(k) && belt) belts[k] = belt;
    }
    if (Object.keys(belts).length) out.belts = belts;
  }
  if (Array.isArray(v.joins)) {
    const joins = [...new Set(v.joins.slice(0, MAX_ENTRIES).filter((j): j is string => typeof j === 'string' && JOIN.test(j)))];
    if (joins.length) out.joins = joins;
  }
  return out;
}
