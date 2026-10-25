import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt, parseNum, t } from '../../i18n/index.js';
import { BELTS, PIPES } from '../../logic/belts.js';
import { stageDrawing, type Lane } from '../model/drawing.ts';
import type { Action } from '../model/persist.ts';
import { MAX_MACHINES } from '../model/chain.ts';
import { recipeLine, recipesFor } from '../model/search.ts';
import { perRowOf, portsOf, portTier, portWarnings, stageArea, stagePieces, stageRows, suggestedPerRow, tierKey } from '../model/stage.ts';
import type { Chain, GameData, Stage } from '../model/types.ts';
import { unlinkedFluids } from '../model/chain.ts';
import { rateText } from './format.ts';
import { NumField } from './Inspector.tsx';

const PX = 4;        // 1 m = 4 px
const CELL = 32;     // fundação de 8 m
const LANE = 8;      // passo entre faixas (2 m)
const GUTTER = CELL; // coluna da etiqueta L{n}
const ROW_GAP = 16;
const MARK = 6;

interface Props { stage: Stage; chain: Chain; data: GameData; dispatch: (a: Action) => void; onClose: () => void }

export function StageView({ stage, chain, data, dispatch, onClose }: Props) {
  const r = data.recipes[stage.recipe];
  const b = data.buildings[r.building];
  const draw = useMemo(() => stageDrawing(stage, data), [stage, data]);
  const rows = stageRows(stage, data);
  const mw = Math.max(1, b.w * PX), ml = Math.max(1, b.l * PX);
  const widest = Math.max(...rows, 1);
  const inLanes = draw.rows[0]?.lanes.filter(l => l.side === 'in') ?? [];
  const outLanes = draw.rows[0]?.lanes.filter(l => l.side === 'out') ?? [];
  const rowH = (inLanes.length + outLanes.length) * LANE + ml + 8;
  const width = GUTTER + widest * mw + CELL;
  const height = rows.length * rowH + (rows.length - 1) * ROW_GAP + CELL;

  // Ao abrir, o foco vai para o título da etapa.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  // Esc volta à cadeia, a menos que esteja num campo (lá o Esc cancela a edição).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== 'Escape' || (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const color = (l: Lane, i: number) => (l.fluid ? 'var(--holo)' : l.side === 'out' ? 'var(--ficsit)' : i === 0 ? 'var(--flow)' : 'var(--held)');
  const name = (id: string) => data.items[id]?.name ?? id;
  const laneEl = (l: Lane, i: number, k: number) => (
    <div key={l.side + l.item} className="pl-lane" style={{ height: LANE, width: k * mw }} role="img"
      aria-label={l.fluid ? t('plLaneFluid', name(l.item), l.side) : t(l.side === 'in' ? 'plLaneIn' : 'plLaneOut', name(l.item), fmt(l.marks))}>
      <i className="pl-lane-line" style={{ background: color(l, i) }} />
      {Array.from({ length: l.marks }, (_, c) => (
        <i key={c} className="pl-mark" style={{ left: (c + 1) * mw + mw / 2 - MARK / 2, width: MARK, height: MARK, background: color(l, i) }} />
      ))}
    </div>
  );

  return (
    <div className="pl-stageview" role="region" aria-label={t('plStageView')}>
      <div className="pl-sv-head">
        <nav className="pl-crumb" aria-label={t('plCrumbChain')}>
          <button type="button" className="pl-linkbtn" onClick={onClose}>{t('plCrumbChain')}</button>
          <span aria-hidden="true"> › </span><h2 className="pl-crumb-h" tabIndex={-1} ref={heading}>{r.name}</h2>
        </nav>
        <button type="button" className="pl-btn" onClick={onClose}>{t('plBackChain')}</button>
      </div>
      <div className="pl-sv-body">
        <div className="pl-sv-main">
          <ul className="pl-legend2" aria-label={t('plLegend')}>
            <li><i style={{ background: 'var(--flow)' }} />{t('plLegIn1')}</li>
            <li><i style={{ background: 'var(--held)' }} />{t('plLegInN')}</li>
            <li><i style={{ background: 'var(--ficsit)' }} />{t('plLegOut')}</li>
            <li><i style={{ background: 'var(--holo)' }} />{t('plLegFluid')}</li>
            <li><i className="pl-sq" style={{ background: 'var(--flow)' }} />Splitter</li>
            <li><i className="pl-sq" style={{ background: 'var(--ficsit)' }} />Merger</li>
            <li className="pl-dim">{t('plFoundation')}</li>
          </ul>
          <div className="pl-draw-scroll" tabIndex={0} role="group" aria-label={t('plDrawAria')}>
            <div className="pl-draw" style={{ width, height, backgroundSize: `${CELL}px ${CELL}px`, backgroundPosition: '0 0' }}>
              {draw.rows.map((row, ri) => (
                <div key={ri} className="pl-drow" role="group" aria-label={t('plRowAria', String(ri + 1), String(row.machines), b.name)}
                  style={{ top: ri * (rowH + ROW_GAP), height: rowH, left: 0 }}>
                  <span className="pl-rowtag" style={{ width: GUTTER }}>L{ri + 1}</span>
                  <div className="pl-rowbody" style={{ left: GUTTER }}>
                    {row.lanes.filter(l => l.side === 'in').map((l, i) => laneEl(l, i, row.machines))}
                    <div className="pl-machines" aria-hidden="true" style={{ height: ml, width: row.machines * mw }}>
                      {Array.from({ length: row.machines }, (_, m) => <div key={m} className="pl-machine" style={{ width: mw, height: ml }} title={b.name} />)}
                    </div>
                    {row.lanes.filter(l => l.side === 'out').map((l, i) => laneEl(l, i, row.machines))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Side stage={stage} chain={chain} data={data} dispatch={dispatch} />
      </div>
    </div>
  );
}

// "Por linha": vazio = sugerido; só inteiro de 1 a 500.
function PerRowField({ stage, data, dispatch }: { stage: Stage; data: GameData; dispatch: (a: Action) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (stage.perRow === null ? '' : fmt(stage.perRow));
  const blank = shown.trim() === '';
  const n = parseNum(shown);
  const invalid = text !== null && !blank && !(Number.isInteger(n) && n >= 1 && n <= 500);
  const commit = () => {
    if (text === null || invalid) return;
    const next = blank ? null : n;
    if (next !== stage.perRow) dispatch({ type: 'setPerRow', id: stage.id, perRow: next });
    setText(null);
  };
  return (
    <label className="pl-field">
      <span>{t('plPerRow')}</span>
      <input type="text" inputMode="numeric" value={shown} placeholder={t('plSuggested', fmt(suggestedPerRow(stage, data)))}
        aria-invalid={invalid} aria-label={t('plPerRow')}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setText(null); }} />
      {invalid && <small className="pl-bad" role="alert">{t('plPerRowBad')}</small>}
    </label>
  );
}

function Side({ stage, chain, data, dispatch }: Omit<Props, 'onClose'>) {
  const r = data.recipes[stage.recipe];
  const main = (r.outs[0] ?? r.ins[0]).item;
  const options = recipesFor(data, main);
  if (!options.some(o => o.id === r.id)) options.unshift(r);
  const warns = portWarnings(stage, data);
  const fluidOut = unlinkedFluids(chain, data, stage.id);
  const pieces = stagePieces(stage, data);
  const area = stageArea(stage, data);
  const nrows = stageRows(stage, data).length;
  const ports = portsOf(stage, data);
  return (
    <aside className="pl-inspector pl-sv-side" aria-label={t('plInspector')}>
      <div className="pl-insp">
        <label className="pl-field">
          <span>{t('plRecipe')}</span>
          <select value={r.id} onChange={e => dispatch({ type: 'setRecipe', id: stage.id, recipe: e.target.value })}>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <div className="pl-note">{recipeLine(r, data)}</div>
        <NumField label={t('plMachines')} value={stage.machines} valid={n => Number.isInteger(n) && n >= 1 && n <= MAX_MACHINES}
          onCommit={n => dispatch({ type: 'setMachines', id: stage.id, n })} bad={t('plMachinesBad', fmt(MAX_MACHINES, 0))} />
        <NumField label={t('plClock')} value={stage.clock} valid={n => n >= 1 && n <= 250}
          onCommit={n => dispatch({ type: 'setClock', id: stage.id, clock: n })} bad={t('plClockBad')} />
        <PerRowField stage={stage} data={data} dispatch={dispatch} />
        <dl className="pl-nums"><div><dt>{t('plRowCount')}</dt><dd>{fmt(nrows)}</dd></div><div><dt>{t('plPerRow')}</dt><dd>{fmt(perRowOf(stage, data))}</dd></div></dl>
        <h3 className="pl-insp-h">{t('plRowBelts')}</h3>
        {ports.map(f => {
          const it = data.items[f.item];
          const tiers = (it?.fluid ? PIPES : BELTS) as { id: string; cap: number }[];
          const w = warns.find(x => x.item === f.item && x.side === f.side);
          const label = t(f.side === 'ins' ? 'plPortIn' : 'plPortOut', it?.name ?? f.item);
          return (
            <div key={f.side + f.item} className="pl-port-set">
              <label className="pl-field">
                <span>{label}</span>
                <select value={stage.tiers[tierKey(f.side, f.item)] ?? ''} aria-label={t('plTierOf', label)}
                  onChange={e => dispatch({ type: 'setTier', id: stage.id, side: f.side, item: f.item, tier: e.target.value || null })}>
                  <option value="">{t('plTierAuto')} · {portTier(stage, data, f.item, f.side)}</option>
                  {tiers.map(x => <option key={x.id} value={x.id}>{x.id} ({fmt(x.cap)})</option>)}
                </select>
              </label>
              {w && <div className="pl-warn-box" role="status">{t('plWarnPort', rateText(it, w.rowRate), fmt(w.cap), w.fixTier, fmt(w.fixPerRow), !!it?.fluid)}</div>}
              {f.side === 'outs' && fluidOut.some(x => x.item === f.item) && (
                <div className="pl-warn-box" role="status">{t('plFluidOut', it?.name ?? f.item, rateText(it, fluidOut.find(x => x.item === f.item)!.total))}</div>
              )}
            </div>
          );
        })}
        <h3 className="pl-insp-h">{t('plStagePieces')}</h3>
        <ul className="pl-pieces">
          <li><span>Splitter</span><b>{fmt(pieces.splitters)}</b></li>
          <li><span>Merger</span><b>{fmt(pieces.mergers)}</b></li>
        </ul>
        <p className="pl-note">{t('plAreaEst', fmt(area.w), fmt(area.d))}</p>
      </div>
    </aside>
  );
}
