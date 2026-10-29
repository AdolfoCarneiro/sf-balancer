// O que a página Balancer guarda: os campos como texto (no formato de número do idioma, como foram digitados), sem DOM nem
// React. Ler os campos (readInput), editar um grupo, trocar o idioma dos números e o estado salvo ou do link moram aqui.
import { I18N, LANGS, getLang, setLang, t, fmt, parseNum } from '../i18n/index.js';
import { BELTS, PIPES } from '../logic/index.js';
import type { Blueprint } from './prefs.ts';

export type Side = 'src' | 'dst';
export const SIDES: Side[] = ['src', 'dst'];
export type Driver = 'machines' | 'clock' | 'total';
export const FIELDS = ['count', 'clock', 'nominal', 'total', 'per'] as const;
export type Field = typeof FIELDS[number];
export interface Group { driver: Driver; count: string; clock: string; nominal: string; total: string; per: string }
export type Medium = 'item' | 'fluid';
export type Policy = 'represar' | 'sink' | 'extra';
export type Excess = 'represar' | 'sink';
export type Conv = 'k-1' | 'k';
// As entradas do planejador: é isso que o desfazer guarda.
export interface Inputs {
  item: string; src: Group[]; dst: Group[];
  medium: Medium; belt: string; pipe: string; policy: Policy; excess: Excess; conv: Conv;
}
// Salvo no navegador, no cenário e no link: as entradas, a alternativa escolhida e o idioma em que os números estão.
export interface Saved extends Inputs { selectedKey: string | null; lang: string }

export const STORE = 'sf-balancer:v3';
export const emptyGroup = (): Group => ({ driver: 'machines', count: '', clock: '', nominal: '', total: '', per: '' });
const DEFAULT_SRC: Group = { driver: 'machines', count: '42', clock: '', nominal: '65', total: '', per: '' };
const DEFAULT_DST: Group = { driver: 'machines', count: '60', clock: '', nominal: '40', total: '', per: '' };
// O exemplo das refinarias (caso 1 do AGENTS.md).
export const defaults = (): Inputs => ({
  item: t('defaultItem'), src: [{ ...DEFAULT_SRC }], dst: [{ ...DEFAULT_DST }],
  medium: 'item', belt: 'Mk4', pipe: 'Mk2', policy: 'represar', excess: 'represar', conv: 'k-1',
});

// Nome de exemplo acompanha o idioma; nome digitado pelo usuário fica.
export const itemFor = (name: string) => (LANGS.some(x => (I18N as Record<string, { defaultItem: string }>)[x].defaultItem === name) ? t('defaultItem') : name);

const pick = <T extends string>(v: unknown, ok: readonly T[], def: T): T => (ok.includes(v as T) ? v as T : def);
const group = (g: Partial<Group> | undefined): Group => ({
  driver: pick(g?.driver, ['machines', 'clock', 'total'], 'machines'),
  count: g?.count ?? '', clock: g?.clock ?? '', nominal: g?.nominal ?? '', total: g?.total ?? '', per: g?.per ?? '',
});
// Um estado salvo (ou de link, de cenário, de antes) como o formulário entende; lado vazio volta ao exemplo.
export function normalize(s: Partial<Saved>): Inputs {
  const n: Inputs = {
    item: itemFor(s.item ?? ''),
    src: s.src?.length ? s.src.map(group) : [{ ...DEFAULT_SRC }],
    dst: s.dst?.length ? s.dst.map(group) : [{ ...DEFAULT_DST }],
    medium: s.medium === 'fluid' ? 'fluid' : 'item',
    belt: BELTS.some((b: { id: string }) => b.id === s.belt) ? s.belt! : 'Mk4',
    pipe: PIPES.some((b: { id: string }) => b.id === s.pipe) ? s.pipe! : 'Mk2',
    policy: pick(s.policy, ['represar', 'sink', 'extra'], 'represar'),
    excess: s.excess === 'sink' ? 'sink' : 'represar',
    conv: pick(s.conv, ['k-1', 'k'], 'k-1'),
  };
  return withMedium(n, n.medium);
}

// Com fluido não há sink (o Awesome Sink não aceita fluido): a escolha volta a represar.
export function withMedium(s: Inputs, medium: Medium): Inputs {
  if (medium === 'item') return { ...s, medium };
  return { ...s, medium, policy: s.policy === 'sink' ? 'represar' : s.policy, excess: 'represar' };
}

// Quem foi preenchido por último manda (máquinas, clock ou total); os outros viram equivalência.
export function editGroup(g: Group, k: Field, value: string): Group {
  const n = { ...g, [k]: value };
  if (k === 'count' || k === 'clock') {
    if (g.driver === 'total') n.total = '';
    n.driver = n.clock.trim() ? 'clock' : 'machines';
  } else if (k === 'total') {
    n.driver = value.trim() ? 'total' : 'machines';
    if (n.driver === 'total') { n.count = ''; n.clock = ''; }
  }
  return n;
}

// Etapa seguinte: as máquinas do destino viram a origem; a taxa do item novo e o destino ficam para preencher.
export function nextStage(s: Inputs): Inputs {
  const src = s.dst.map(g => {
    const v: Group = { ...emptyGroup(), driver: g.driver === 'clock' ? 'clock' : 'machines', count: g.count, clock: g.driver === 'clock' ? g.clock : '' };
    if (g.driver === 'total') {
      const total = parseNum(g.total), nom = parseNum(g.nominal);
      v.count = total > 0 && nom > 0 ? fmt(total / nom, 4) : '';
    }
    return v;
  });
  return { ...s, item: '', src, dst: [emptyGroup()] };
}

// Os números digitados mudam de formato junto com o idioma ("65,5" vira "65.5").
export function inLang<T>(l: string, f: () => T): T {
  const was = getLang();
  setLang(l);
  try { return f(); } finally { setLang(was); }
}
export function convertNum(raw: string, from: string, to: string): string {
  const s = raw.trim();
  if (!s) return raw;
  const v = inLang(from, () => parseNum(s));
  return isFinite(v) ? inLang(to, () => v.toLocaleString(t('locale'), { maximumFractionDigits: 6, useGrouping: false })) : raw;
}
export function convertInputs(s: Inputs, from: string, to: string): Inputs {
  if (from === to) return s;
  const conv = (g: Group): Group => ({ ...g, ...Object.fromEntries(FIELDS.map(k => [k, convertNum(g[k], from, to)])) });
  return { ...s, item: inLang(to, () => itemFor(s.item)), src: s.src.map(conv), dst: s.dst.map(conv) };
}

// Os campos lidos para o computePlan. bad: os campos inválidos ("src.0.count"); drives: o campo que manda em cada grupo.
export interface Read {
  valid: boolean;
  bad: Set<string>;
  input: {
    item: string; srcGroups: object[]; dstGroups: object[]; medium: Medium; belt: string; cap: number;
    policy: Policy; excess: Excess; conv: Conv; blueprints: Blueprint[];
  };
}
export const DRIVES: Record<Driver, Field> = { machines: 'count', clock: 'clock', total: 'total' };
export function readInput(s: Inputs, blueprints: Blueprint[]): Read {
  const bad = new Set<string>();
  const mark = (id: string, raw: string, kind: 'req' | 'opt') => {
    const r = raw.trim(), v = parseNum(r);
    if (kind === 'opt' ? r !== '' && !(v > 0) : !(v > 0)) bad.add(id);
    return r === '' ? 0 : v;
  };
  const read = (side: Side) => s[side].map((g, i) => {
    const id = (k: Field) => `${side}.${i}.${k}`;
    const out: Record<string, unknown> = { driver: g.driver, per: mark(id('per'), g.per, 'opt') };
    out.nominal = mark(id('nominal'), g.nominal, g.driver === 'total' ? 'opt' : 'req') || 0;
    if (g.driver === 'total') out.total = mark(id('total'), g.total, 'req');
    else {
      out.count = mark(id('count'), g.count, 'req');
      if (g.driver === 'clock') out.clock = mark(id('clock'), g.clock, 'req');
    }
    return out;
  });
  const srcGroups = read('src'), dstGroups = read('dst');
  const fluid = s.medium === 'fluid';
  const belt = (fluid ? PIPES : BELTS).find((b: { id: string }) => b.id === (fluid ? s.pipe : s.belt))!;
  return {
    valid: bad.size === 0, bad,
    input: {
      item: s.item.trim() || t('fallbackItem'), srcGroups, dstGroups,
      medium: s.medium, belt: belt.id, cap: belt.cap,
      policy: fluid && s.policy === 'sink' ? 'represar' : s.policy, excess: fluid ? 'represar' : s.excess, conv: s.conv,
      blueprints,
    },
  };
}

export function loadSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || 'null');
    return v && v.src ? v : null;
  } catch { return null; }
}
export function save(s: Saved) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* sem storage, segue sem lembrar */ }
}
