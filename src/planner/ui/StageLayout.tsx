// Painel da tela da etapa, em dois níveis: a visão geral (os três modelos, Inverter, por linha, as esteiras) e o ajuste da
// fileira ou da esteira selecionada; embaixo, o resumo fixo com os avisos e o conserto em um clique. Cada gesto manda um
// setLayout (ou setTier) só: um passo do desfazer.
import { useState, type ReactNode } from 'react';
import { fmt, parseNum, t } from '../../i18n/index.js';
import { BELTS, PIPES } from '../../logic/belts.js';
import type { Action } from '../model/factorystate.ts';
import type { Arrangement, ArrLine, LayoutWarning } from '../model/layout.ts';
import {
  type WarningFix, fixCut, hasEdits, joinState, moveRow, resetModel, resetRowPlace, setBelt, setEven, setInvert, setKind, sharedKeyOf,
  toggleJoin, toggleRow, warningFixes,
} from '../model/layoutedit.ts';
import { portsOf, portTier, tierKey } from '../model/stage.ts';
import type { GameData, Layout, LayoutExit, LayoutKind, Stage } from '../model/types.ts';
import type { StageSel } from './StageDrawing.tsx';
import { rateText } from './format.ts';

const KINDS: LayoutKind[] = ['simple', 'backToBack', 'center'];
const MODEL: Record<LayoutKind, string> = { simple: 'plRowsModelSimple', backToBack: 'plRowsModelBackToBack', center: 'plRowsModelCenter' };
export const EXITS: LayoutExit[] = ['end', 'down', 'up'];
const EXIT_OUT: Record<LayoutExit, string> = { end: 'plLayExitEnd', down: 'plLayExitDown', up: 'plLayExitUp' };
const EXIT_IN: Record<LayoutExit, string> = { end: 'plLayExitEnd', down: 'plLayEnterDown', up: 'plLayEnterUp' };
export const exitLabel = (side: 'in' | 'out', x: LayoutExit): string => t((side === 'in' ? EXIT_IN : EXIT_OUT)[x]);
export const CUT_ID = 'pl-sv-cut';

// Inteiro opcional: vazio = o padrão (null). Confirma no blur ou no Enter, uma ação por edição.
export function OptIntField({ label, value, max, placeholder, bad, disabled, onCommit, id, after }: {
  label: string; value: number | null; max: number; placeholder: string; bad: string; disabled?: boolean; onCommit: (n: number | null) => void;
  id?: string; after?: ReactNode;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === null ? '' : fmt(value));
  const blank = shown.trim() === '', n = parseNum(shown);
  const invalid = text !== null && !blank && !(Number.isInteger(n) && n >= 1 && n <= max);
  const commit = () => {
    if (text === null || invalid) return;
    const next = blank ? null : n;
    if (next !== value) onCommit(next);
    setText(null);
  };
  return (
    <div className="pl-field">
      <label htmlFor={id} className="pl-sv-flabel">{label}</label>
      <div className="pl-sv-numrow">
        <input id={id} type="text" inputMode="numeric" value={disabled ? '' : shown} placeholder={placeholder} disabled={disabled}
          aria-invalid={invalid} aria-label={label}
          onChange={e => setText(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape' && text !== null) { e.stopPropagation(); setText(null); } }} />
        {after}
      </div>
      {invalid && <small className="pl-bad" role="alert">{bad}</small>}
    </div>
  );
}

// Segmentado de rádios, alvos de 44 px.
function Seg<T extends string>({ legend, name, value, options, label, onPick }: {
  legend: string; name: string; value: T; options: T[]; label: (v: T) => string; onPick: (v: T) => void;
}) {
  return (
    <fieldset className="pl-seg pl-seg-lay">
      <legend>{legend}</legend>
      <div className="pl-seg-row" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map(o => (
          <label key={o} className="pl-seg-opt">
            <input type="radio" name={name} value={o} checked={value === o} onChange={() => onPick(o)} />
            <span>{label(o)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Miniatura de cada modelo: fileiras de máquinas (azul) e o corredor da esteira (laranja).
function ModelThumb({ kind }: { kind: LayoutKind }) {
  const m = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} className="pl-sv-thumb-m" />;
  const b = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} className="pl-sv-thumb-b" />;
  return (
    <svg width="60" height="34" viewBox="0 0 60 34" aria-hidden="true">
      {kind === 'simple' && <>{m(4, 3, 52, 6)}{b(4, 10, 52, 2)}{m(4, 17, 52, 6)}{b(4, 24, 52, 2)}</>}
      {kind === 'backToBack' && <>{m(4, 4, 52, 8)}{b(4, 13, 52, 3)}{b(4, 18, 52, 3)}{m(4, 22, 52, 8)}</>}
      {kind === 'center' && <>{m(4, 4, 24, 8)}{m(32, 4, 24, 8)}{b(4, 15, 52, 4)}{m(4, 22, 24, 8)}{m(32, 22, 24, 8)}</>}
    </svg>
  );
}

interface Props {
  stage: Stage; data: GameData; arr: Arrangement; sel: StageSel; onSel: (s: StageSel) => void; dispatch: (a: Action) => void;
}
const setter = (p: Props) => (l: Layout | null) => p.dispatch({ type: 'setLayout', id: p.stage.id, layout: l });
const beltKeyOf = (l: ArrLine) => `${l.side}:${l.item}`;

// Visão geral: os modelos como cartões, Inverter, "Por linha", a dica, "Voltar ao modelo" e as esteiras para ajustar.
export function Overview(p: Props & { perRow: ReactNode }) {
  const { stage, data, arr, onSel, perRow } = p;
  const lay = stage.layout, kind = arr.kind, set = setter(p);
  const ports = portsOf(stage, data);
  return (
    <div className="pl-sv-level">
      <fieldset className="pl-sv-models" data-tour="stage-models">
        <legend className="pl-sv-lbl">{t('plLayModel')}</legend>
        <div className="pl-sv-models-row">
          {KINDS.map(k => (
            <label key={k} className="pl-sv-model">
              <input type="radio" name={`pl-lay-kind-${stage.id}`} value={k} checked={kind === k} onChange={() => set(setKind(k))} />
              <ModelThumb kind={k} />
              <span>{t(MODEL[k])}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {kind !== 'simple' && (
        <label className="pl-check pl-lay-check">
          <input type="checkbox" checked={!!lay?.invert} onChange={e => set(setInvert(lay, e.target.checked))} />
          <span>{t('plLayInvert')} <small className="pl-dim">· {t('plLayInvertHint', kind)}</small></span>
        </label>
      )}
      {perRow}
      {kind === 'center' && <p className="pl-note">{t('plLayPerRowCenter')}</p>}
      <p className="pl-note pl-sv-hint">{t('plLaySelectHint')}</p>
      {hasEdits(lay) && <button type="button" className="pl-btn pl-lay-btn" onClick={() => set(resetModel(lay))}>{t('plLayReset')}</button>}
      <div className="pl-sv-lbl">{t('plSvBelts')}</div>
      <ul className="pl-sv-belts">
        {ports.map(f => {
          const side = f.side === 'ins' ? 'in' : 'out', key = `${side}:${f.item}`;
          const first = arr.lines.find(l => l.side === side && l.item === f.item);
          if (!first) return null;
          const what = t('plLayBelt', data.items[f.item]?.name ?? f.item, side, first.fluid);
          return (
            <li key={key}>
              <button type="button" className="pl-sv-beltbtn" data-belt={key} aria-label={t('plLayAdjustAria', what)}
                onClick={() => onSel({ t: 'belt', key, row: first.rows[0] })}>
                <b>{what}</b><small>{linesText(arr, data, side, f.item)} · {first.tier}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// "← Voltar à visão geral" e o título do nível de ajuste.
function AdjustHead({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <>
      <button type="button" className="pl-sv-up" onClick={onBack}><span aria-hidden="true">←</span> {t('plSvBackOverview')}</button>
      <h3 className="pl-sv-lbl pl-sv-adj-h">{title}{sub && <small> · {sub}</small>}</h3>
    </>
  );
}

// Ajuste da fileira: Virar, Espelhar, mover 8 m, voltar ao lugar e as esteiras dela (selecionar e juntar com a de baixo).
export function RowAdjust(p: Props & { i: number }) {
  const { stage, data, arr, onSel, i } = p;
  const lay = stage.layout, set = setter(p);
  const row = arr.rows.find(r => r.index === i);
  if (!row) return null;
  const e = lay?.rows?.[i];
  const machine = data.buildings[data.recipes[stage.recipe].building].name;
  const belts = [...new Map(arr.lines.filter(l => l.rows.includes(i)).map(l => [beltKeyOf(l), l])).values()];
  const mv = (dx: number, dy: number) => set(moveRow(lay, i, dx, dy));
  return (
    <div className="pl-sv-level">
      <AdjustHead title={t('plLayRow', String(i + 1))} sub={t('plLayRowInfo', fmt(row.machines), machine)} onBack={() => onSel(null)} />
      <div className="pl-lay-acts">
        <button type="button" className="pl-btn" aria-pressed={!!e?.flip} onClick={() => set(toggleRow(lay, i, 'flip'))}>{t('plLayFlip')}</button>
        <button type="button" className="pl-btn" aria-pressed={!!e?.mirror} onClick={() => set(toggleRow(lay, i, 'mirror'))}>{t('plLayMirror')}</button>
      </div>
      <div className="pl-sv-move" role="group" aria-label={t('plSvMove')}>
        <span className="pl-sv-flabel">{t('plSvMove')}</span>
        <div className="pl-sv-pad">
          <button type="button" className="pl-btn" aria-label={t('plSvMoveUp')} onClick={() => mv(0, -8)}>↑</button>
          <button type="button" className="pl-btn" aria-label={t('plSvMoveLeft')} onClick={() => mv(-8, 0)}>←</button>
          <button type="button" className="pl-btn" aria-label={t('plSvMoveDown')} onClick={() => mv(0, 8)}>↓</button>
          <button type="button" className="pl-btn" aria-label={t('plSvMoveRight')} onClick={() => mv(8, 0)}>→</button>
        </div>
        {(e?.dx || e?.dy) ? <button type="button" className="pl-btn pl-lay-btn" onClick={() => set(resetRowPlace(lay, i))}>{t('plLayRowHome')}</button> : null}
      </div>
      <p className="pl-note">{t('plLayMoveHint')}</p>
      {belts.length > 0 && (
        <>
          <div className="pl-sv-lbl">{t('plLayRowBelts')}</div>
          <ul className="pl-lay-belts">
            {belts.map(l => {
              const key = beltKeyOf(l), what = t('plLayBelt', data.items[l.item]?.name ?? l.item, l.side, l.fluid);
              const join = l.fluid ? null : joinState(arr, lay, key, i);
              return (
                <li key={key}>
                  <button type="button" className="pl-btn" data-belt-row={key} onClick={() => onSel({ t: 'belt', key, row: i })}
                    aria-label={t('plLayAdjustAria', what)}>{what}</button>
                  {join && (
                    <button type="button" className="pl-btn" aria-pressed={join === 'joined'} data-join={`${key}@${i}`}
                      onClick={() => set(toggleJoin(lay, `${key}@${i}`))}>{t(join === 'joined' ? 'plLayUnjoin' : 'plLayJoin')}</button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// O que a esteira selecionada sabe de si: as linhas, o padrão de saída e de corte, o recomendado e a conta do corte.
export function beltInfo(stage: Stage, data: GameData, arr: Arrangement, key: string) {
  const lines = arr.lines.filter(l => beltKeyOf(l) === key);
  if (!lines.length) return null;
  const lay = stage.layout, first = lines[0];
  const shared = sharedKeyOf(stage, data, lay) === key;
  const per = first.rate / Math.max(1, first.machines);
  const rec = Math.max(1, Math.floor(first.cap / per + 1e-9));     // o maior corte que cabe na esteira
  const edit = lay?.belts?.[key];
  const defCut = shared ? rec : null;
  const longest = lines.reduce((m, l) => Math.max(m, l.machines), 0);
  const cut = first.exit === 'end' ? null : edit?.cut ?? defCut;
  // Recomendado: o padrão do modelo (na compartilhada, o maior corte que cabe); uma esteira sem corte que passa do limite
  // fecha no maior que cabe (descendo, se saía pela ponta).
  const fits = lines.every(l => l.rate <= l.cap + 1e-9);
  const recLayout = (): Layout | null => (shared || edit?.cut || fits ? setBelt(lay, key, { cut: null }) : fixCut(lay, key, rec, first.exit));
  return { lines, first, shared, per, rec, edit, defCut, longest, cut, recLayout };
}

// Ajuste da esteira: Sai/Entra por, Fecha a cada (+ Recomendado e a conta), Dividir igual, Juntar e o tier.
export function BeltAdjust(p: Props & { beltKey: string; row: number }) {
  const { stage, data, arr, onSel, beltKey: key, row } = p;
  const lay = stage.layout, set = setter(p);
  const info = beltInfo(stage, data, arr, key);
  if (!info) return null;
  const { first, shared, per, rec, edit, defCut, longest, cut } = info;
  const { side, item, fluid, exit } = first;
  const it = data.items[item];
  const title = t('plLayBelt', it?.name ?? item, side, fluid);
  const defExit: LayoutExit = shared ? 'down' : 'end';
  const join = fluid ? null : joinState(arr, lay, key, row);
  const ps: 'ins' | 'outs' = side === 'in' ? 'ins' : 'outs';
  const tiers = (fluid ? PIPES : BELTS) as { id: string; cap: number }[];
  // A conta do corte: n máquinas × taxa de cada uma, e se cabe na esteira.
  const n = cut ?? longest;
  const total = n * per, over = total > first.cap + 1e-9;
  const why = t('plSvCutWhy', fmt(n), fmt(per), rateText(it, total), first.tier, over ? 'over' : n === rec ? 'max' : 'fits', fmt(n + 1));
  const recNow = JSON.stringify(info.recLayout()) === JSON.stringify(lay ?? null);
  return (
    <div className="pl-sv-level">
      <AdjustHead title={title} onBack={() => onSel(null)} />
      {fluid ? <p className="pl-note">{t('plLayPipeNote')}</p> : (
        <>
          <Seg legend={t(side === 'in' ? 'plLayExitIn' : 'plLayExitOut')} name={`pl-lay-exit-${stage.id}`} value={exit} options={EXITS}
            label={x => exitLabel(side, x)} onPick={x => set(setBelt(lay, key, { exit: x === defExit ? null : x }))} />
          <OptIntField key={key} id={CUT_ID} label={t('plLayCut')} value={edit?.cut ?? null} max={1000} disabled={exit === 'end'}
            placeholder={defCut ? t('plLayCutDefault', fmt(defCut)) : t('plLayCutWhole')} bad={t('plLayCutBad')}
            onCommit={v => set(setBelt(lay, key, { cut: v }))}
            after={<button type="button" className="pl-btn" disabled={recNow} onClick={() => set(info.recLayout())}>{t('plSvRecommended')}</button>} />
          <p className="pl-note">{exit === 'end' ? t('plLayCutEnd') : why}</p>
          {exit !== 'end' && (
            <label className="pl-check pl-lay-check">
              <input type="checkbox" checked={!!edit?.even} onChange={e => set(setEven(lay, key, e.target.checked))} />
              <span>{t('plSvEven')} <small className="pl-dim">· {t('plSvEvenHint')}</small></span>
            </label>
          )}
          {join && (
            <button type="button" className="pl-btn pl-lay-btn" aria-pressed={join === 'joined'}
              onClick={() => set(toggleJoin(lay, `${key}@${row}`))}>{t(join === 'joined' ? 'plLayUnjoin' : 'plLayJoin')}</button>
          )}
        </>
      )}
      <label className="pl-field">
        <span className="pl-sv-flabel">{t('plSvTier', fluid)}</span>
        <select value={stage.tiers[tierKey(ps, item)] ?? ''} aria-label={t('plTierOf', title)}
          onChange={e => p.dispatch({ type: 'setTier', id: stage.id, side: ps, item, tier: e.target.value || null })}>
          <option value="">{t('plTierAuto')} · {first.tier ?? portTier(stage, data, item, ps)}</option>
          {tiers.map(x => <option key={x.id} value={x.id}>{x.id} ({fmt(x.cap)})</option>)}
        </select>
      </label>
    </div>
  );
}

// Resumo fixo: saídas com as taxas, entradas, peças, área e "tudo dentro do limite" ou os avisos com o conserto.
export function Summary(p: Props & { extra: string[] }) {
  const { data, arr, extra } = p;
  const outItems = [...new Set(arr.lines.filter(l => l.side === 'out').map(l => l.item))];
  const ins = arr.lines.filter(l => l.side === 'in').length;
  const ok = !arr.warnings.length && !extra.length;
  return (
    <section className="pl-sv-sum" data-tour="stage-summary" aria-label={t('plSvSummary')}>
      <dl>
        {outItems.map(item => (
          <div key={item} className="pl-sv-wide" title={linesText(arr, data, 'out', item)}>
            <dt>{outItems.length > 1 ? data.items[item]?.name ?? item : t('plSvSumOut')}</dt>
            <dd>{rateList(arr, data, item)}</dd>
          </div>
        ))}
        <div><dt>{t('plSvSumIn')}</dt><dd>{fmt(ins)}</dd></div>
        <div><dt>Splitters</dt><dd>{fmt(arr.pieces.splitters)}</dd></div>
        <div><dt>Mergers</dt><dd>{fmt(arr.pieces.mergers)}</dd></div>
        <div><dt>Conveyor Lifts</dt><dd>{fmt(arr.pieces.lifts)}</dd></div>
        <div className="pl-sv-wide"><dt>{t('plSvSumArea')}</dt><dd>{t('plSvArea', fmt(arr.area.w), fmt(arr.area.d))}</dd></div>
      </dl>
      {ok ? <p className="pl-sv-ok"><span aria-hidden="true">✓ </span>{t('plSvAllOk')}</p> : <Warnings {...p} />}
    </section>
  );
}

// "480 · 480 · 240" (ou "6 × 455" quando repete), com a unidade no fim.
function rateList(arr: Arrangement, data: GameData, item: string): string {
  const groups: { rate: number; n: number }[] = [];
  for (const l of arr.lines) {
    if (l.side !== 'out' || l.item !== item) continue;
    const g = groups.at(-1);
    if (g && Math.abs(g.rate - l.rate) < 1e-9) g.n++; else groups.push({ rate: l.rate, n: 1 });
  }
  const parts = groups.flatMap(g => (g.n > 2 ? [`${fmt(g.n)} × ${fmt(g.rate)}`] : Array(g.n).fill(fmt(g.rate))));
  return `${parts.join(' · ')}${t(data.items[item]?.fluid ? 'plSvUnitFluid' : 'plSvUnit')}`;
}

// Avisos do arranjo, cada um com o conserto quando há um, e os avisos de fora (saída fluida sem ligação).
function Warnings({ stage, data, arr, dispatch, extra }: Props & { extra: string[] }) {
  const name = (item: string) => data.items[item]?.name ?? item;
  const text = (w: LayoutWarning): string => {
    switch (w.kind) {
      case 'over': { const it = data.items[w.item]; return t('plLayWarnOver', name(w.item), rateText(it, w.rate), rateText(it, w.cap)); }
      case 'centerEnd': return t('plLayWarnCenterEnd', name(w.item));
      case 'merger3': return t('plLayWarnMerger3', name(w.item));
      case 'cutPipe': return t('plLayWarnCutPipe', name(w.item));
      case 'badJoin': return t('plLayWarnBadJoin');
    }
  };
  const label = (f: WarningFix): string => {
    switch (f.kind) {
      case 'tier': return t('plLayFixTier', f.tier);
      case 'cut': return t('plLayFixCut', fmt(f.n));
      case 'perRow': return t('plLayFixPerRow', fmt(f.n));
      case 'down': return t('plLayFixDown');
      case 'uncut': return t('plLayFixUncut');
      case 'unjoin': return t('plLayFixUnjoin');
    }
  };
  return (
    <ul className="pl-lay-warns" aria-label={t('plMapWarnings')}>
      {arr.warnings.map((w, k) => {
        const fixes = warningFixes(w, stage, arr);
        return (
          <li key={k} className="pl-warn-box" role="status">
            <span>{text(w)}</span>
            {fixes.length > 0 && (
              <span className="pl-lay-acts">{fixes.map(f => <button key={f.kind} type="button" className="pl-btn" onClick={() => dispatch(f.action)}>{label(f)}</button>)}</span>
            )}
          </li>
        );
      })}
      {extra.map(x => <li key={x} className="pl-warn-box" role="status"><span>{x}</span></li>)}
    </ul>
  );
}

// "6 saídas de 455/min" (+ "2 de 390/min" com tamanhos diferentes), na ordem das linhas.
export function linesText(arr: Arrangement, data: GameData, side: 'in' | 'out', item: string): string {
  const groups: { rate: number; n: number }[] = [];
  for (const l of arr.lines) {
    if (l.side !== side || l.item !== item) continue;
    const g = groups.find(x => Math.abs(x.rate - l.rate) < 1e-9);
    if (g) g.n++; else groups.push({ rate: l.rate, n: 1 });
  }
  const it = data.items[item];
  return groups.map((g, k) => t(k ? 'plLayLinesMore' : 'plLayLines', ...(k ? [] : [side]), String(g.n), rateText(it, g.rate))).join(' + ');
}
