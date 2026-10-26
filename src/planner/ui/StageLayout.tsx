// Painel da tela da etapa: o modelo das fileiras, o ajuste da fileira ou da esteira selecionada e os avisos do arranjo
// com o conserto em um clique. Cada gesto manda um setLayout (ou setTier) só: um passo do desfazer.
import { useState, type ReactNode } from 'react';
import { fmt, parseNum, t } from '../../i18n/index.js';
import type { Action } from '../model/factorystate.ts';
import type { Arrangement, LayoutWarning } from '../model/layout.ts';
import {
  type WarningFix, hasEdits, joinState, resetModel, resetRowPlace, setBelt, setInvert, setKind, sharedKeyOf, toggleJoin, toggleRow, warningFixes,
} from '../model/layoutedit.ts';
import type { GameData, Layout, LayoutExit, LayoutKind, Stage } from '../model/types.ts';
import type { StageSel } from './StageDrawing.tsx';
import { rateText } from './format.ts';

const KINDS: LayoutKind[] = ['simple', 'backToBack', 'center'];
const MODEL: Record<LayoutKind, string> = { simple: 'plRowsModelSimple', backToBack: 'plRowsModelBackToBack', center: 'plRowsModelCenter' };
const EXITS: LayoutExit[] = ['end', 'down', 'up'];
const EXIT_OUT: Record<LayoutExit, string> = { end: 'plLayExitEnd', down: 'plLayExitDown', up: 'plLayExitUp' };
const EXIT_IN: Record<LayoutExit, string> = { end: 'plLayExitEnd', down: 'plLayEnterDown', up: 'plLayEnterUp' };

// Inteiro opcional: vazio = o padrão (null). Confirma no blur ou no Enter, uma ação por edição.
export function OptIntField({ label, value, max, placeholder, bad, disabled, onCommit }: {
  label: string; value: number | null; max: number; placeholder: string; bad: string; disabled?: boolean; onCommit: (n: number | null) => void;
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
    <label className="pl-field">
      <span>{label}</span>
      <input type="text" inputMode="numeric" value={disabled ? '' : shown} placeholder={placeholder} disabled={disabled}
        aria-invalid={invalid} aria-label={label}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setText(null); }} />
      {invalid && <small className="pl-bad" role="alert">{bad}</small>}
    </label>
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

interface Props {
  stage: Stage; data: GameData; arr: Arrangement; sel: StageSel; onSel: (s: StageSel) => void;
  dispatch: (a: Action) => void; perRow?: ReactNode;
}

// Modelo, "Inverter", "Por linha" e "Voltar ao modelo".
export function LayoutModel({ stage, arr, dispatch, perRow }: Props) {
  const lay = stage.layout, kind = arr.kind;
  const set = (l: Layout | null) => dispatch({ type: 'setLayout', id: stage.id, layout: l });
  return (
    <div className="pl-lay">
      <Seg legend={t('plLayModel')} name={`pl-lay-kind-${stage.id}`} value={kind} options={KINDS} label={k => t(MODEL[k])}
        onPick={k => set(setKind(k))} />
      {kind !== 'simple' && (
        <label className="pl-check pl-lay-check">
          <input type="checkbox" checked={!!lay?.invert} onChange={e => set(setInvert(lay, e.target.checked))} />
          <span>{t('plLayInvert')} <small className="pl-dim">· {t('plLayInvertHint', kind)}</small></span>
        </label>
      )}
      {perRow}
      {kind === 'center' && <p className="pl-note">{t('plLayPerRowCenter')}</p>}
      <button type="button" className="pl-btn pl-lay-btn" disabled={!hasEdits(lay)} onClick={() => set(resetModel(lay))}>{t('plLayReset')}</button>
    </div>
  );
}

// O que está selecionado no desenho: fileira (virar, espelhar, voltar ao lugar) ou esteira (corte, por onde sai, juntar).
export function LayoutSelection({ stage, data, arr, sel, onSel, dispatch }: Props) {
  const lay = stage.layout;
  const set = (l: Layout | null) => dispatch({ type: 'setLayout', id: stage.id, layout: l });
  const machine = data.buildings[data.recipes[stage.recipe].building].name;
  if (!sel) return <p className="pl-note pl-lay-hint">{t('plLaySelectHint')}</p>;
  if (sel.t === 'row') {
    const row = arr.rows.find(r => r.index === sel.i);
    if (!row) return <p className="pl-note pl-lay-hint">{t('plLaySelectHint')}</p>;
    const e = lay?.rows?.[sel.i];
    // As esteiras desta fileira (por item e lado), com alvo de 44 px: selecionar e juntar com a de baixo.
    const belts = [...new Map(arr.lines.filter(l => l.rows.includes(sel.i)).map(l => [`${l.side}:${l.item}`, l])).values()];
    return (
      <section className="pl-lay-sel" aria-label={t('plLayRow', String(sel.i + 1))}>
        <h4>{t('plLayRow', String(sel.i + 1))} <small>· {t('plLayRowInfo', fmt(row.machines), machine)}</small></h4>
        <div className="pl-lay-acts">
          <button type="button" className="pl-btn" aria-pressed={!!e?.flip} onClick={() => set(toggleRow(lay, sel.i, 'flip'))}>{t('plLayFlip')}</button>
          <button type="button" className="pl-btn" aria-pressed={!!e?.mirror} onClick={() => set(toggleRow(lay, sel.i, 'mirror'))}>{t('plLayMirror')}</button>
          {(e?.dx || e?.dy) ? <button type="button" className="pl-btn" onClick={() => set(resetRowPlace(lay, sel.i))}>{t('plLayRowHome')}</button> : null}
        </div>
        <p className="pl-note">{t('plLayMoveHint')}</p>
        {belts.length > 0 && (
          <ul className="pl-lay-belts" aria-label={t('plLayRowBelts')}>
            {belts.map(l => {
              const key = `${l.side}:${l.item}`, what = t('plLayBelt', data.items[l.item]?.name ?? l.item, l.side, l.fluid);
              const join = l.fluid ? null : joinState(arr, lay, key, sel.i);
              return (
                <li key={key}>
                  <button type="button" className="pl-btn" data-belt-row={key} onClick={() => onSel({ t: 'belt', key, row: sel.i })}
                    aria-label={t('plLayAdjustAria', what)}>{what}</button>
                  {join && (
                    <button type="button" className="pl-btn" aria-pressed={join === 'joined'} data-join={`${key}@${sel.i}`}
                      onClick={() => set(toggleJoin(lay, `${key}@${sel.i}`))}>{t(join === 'joined' ? 'plLayUnjoin' : 'plLayJoin')}</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }
  const lines = arr.lines.filter(l => `${l.side}:${l.item}` === sel.key);
  if (!lines.length) return <p className="pl-note pl-lay-hint">{t('plLaySelectHint')}</p>;
  const { side, item, fluid, exit } = lines[0];
  const it = data.items[item], shared = sharedKeyOf(stage, data, lay) === sel.key;
  const title = t('plLayBelt', it?.name ?? item, side, fluid);
  const edit = lay?.belts?.[sel.key];
  const defExit: LayoutExit = shared ? 'down' : 'end';
  const per = lines[0].rate / Math.max(1, lines[0].machines);
  const defCut = shared ? Math.max(1, Math.floor(lines[0].cap / per + 1e-9)) : null;
  const join = fluid ? null : joinState(arr, lay, sel.key, sel.row);
  return (
    <section className="pl-lay-sel" aria-label={title}>
      <h4>{title}</h4>
      {fluid ? <p className="pl-note">{t('plLayPipeNote')}</p> : (
        <>
          <Seg legend={t(side === 'in' ? 'plLayExitIn' : 'plLayExitOut')} name={`pl-lay-exit-${stage.id}`} value={exit} options={EXITS}
            label={x => t((side === 'in' ? EXIT_IN : EXIT_OUT)[x])} onPick={x => set(setBelt(lay, sel.key, { exit: x === defExit ? null : x }))} />
          <OptIntField key={sel.key} label={t('plLayCut')} value={edit?.cut ?? null} max={1000} disabled={exit === 'end'}
            placeholder={defCut ? t('plLayCutDefault', fmt(defCut)) : t('plLayCutWhole')} bad={t('plLayCutBad')}
            onCommit={n => set(setBelt(lay, sel.key, { cut: n }))} />
          {exit === 'end' && <p className="pl-note">{t('plLayCutEnd')}</p>}
          {join && (
            <button type="button" className="pl-btn pl-lay-btn" aria-pressed={join === 'joined'}
              onClick={() => set(toggleJoin(lay, `${sel.key}@${sel.row}`))}>{t(join === 'joined' ? 'plLayUnjoin' : 'plLayJoin')}</button>
          )}
        </>
      )}
    </section>
  );
}

// Avisos do arranjo, cada um com o conserto quando há um.
export function LayoutWarnings({ stage, data, arr, dispatch }: Props) {
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
  const view = (w: LayoutWarning) => ({
    text: text(w), fixes: warningFixes(w, stage, arr).map(f => ({ label: label(f), run: () => dispatch(f.action) })),
  });
  if (!arr.warnings.length) return null;
  return (
    <ul className="pl-lay-warns" aria-label={t('plMapWarnings')}>
      {arr.warnings.map((w, k) => {
        const v = view(w);
        return (
          <li key={k} className="pl-warn-box" role="status">
            <span>{v.text}</span>
            {v.fixes.length > 0 && (
              <span className="pl-lay-acts">{v.fixes.map(f => <button key={f.label} type="button" className="pl-btn" onClick={f.run}>{f.label}</button>)}</span>
            )}
          </li>
        );
      })}
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
