// Tela da etapa: topo fixo (Voltar ao mapa, o caminho, máquinas/clock/receita e "? Como mexer"), o desenho ocupando o
// espaço livre com a barra das ações da seleção por cima, e o painel em dois níveis (visão geral / ajuste) com o resumo
// fixo embaixo. No celular o painel vira uma folha de baixo com alça.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { Action } from '../model/factorystate.ts';
import { MAX_MACHINES, machinesOk } from '../model/factory.ts';
import { limitView } from '../model/badges.ts';
import { recipesFor } from '../model/search.ts';
import { arrange } from '../model/layout.ts';
import { joinState, moveRow, setBelt, setEven, toggleJoin, toggleRow, sharedKeyOf } from '../model/layoutedit.ts';
import { suggestedPerRow } from '../model/stage.ts';
import { beltInfo } from '../model/stagebelt.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Factory, GameData, Layout, Recipe, RecipeBlock, Stage } from '../model/types.ts';
import { rateText } from './format.ts';
import { previewBox } from './rowspreview.ts';
import { NumField } from './NumField.tsx';
import { StageDrawing, type StageSel } from './StageDrawing.tsx';
import { BeltAdjust, CUT_ID, EXITS, OptIntField, Overview, RowAdjust, Summary, exitLabel } from './StageLayout.tsx';
import { StageHelp } from './StageHelp.tsx';

// stage: o bloco resolvido (solvedStage); block: o bloco salvo, com os limites.
interface Props { block: RecipeBlock; stage: Stage; factory: Factory; flow: FlowResult; data: GameData; dispatch: (a: Action) => void; onClose: () => void }

type Sheet = 'peek' | 'half' | 'full';
const SHEET_NEXT: Record<Sheet, Sheet> = { peek: 'half', half: 'full', full: 'peek' };
const SHEET_UP: Record<Sheet, Sheet> = { peek: 'half', half: 'full', full: 'full' };
const SHEET_DOWN: Record<Sheet, Sheet> = { peek: 'peek', half: 'peek', full: 'half' };
const DRAG_PX = 12, CLICK_AFTER_DRAG_MS = 400;
const SHEET_HALF = 0.55, SHEET_PEEK = 52;   // a folha na metade e fechada, como no planner.css (.pl-sv-panel)
const phone = () => window.matchMedia('(max-width: 720px)').matches;

// Cor de cada item da receita: entradas sólidas em branco/cinza, saídas em laranja/turquesa, fluidos em ciano/verde.
function stageColors(r: Recipe, data: GameData): Record<string, string> {
  const out: Record<string, string> = {};
  const pal = { in: ['var(--flow)', 'var(--held)', 'var(--donor)', 'var(--ok)'], out: ['var(--ficsit)', 'var(--surplus)', 'var(--sink)'], fluid: ['var(--holo)', 'var(--ok)'] };
  const used = { in: 0, out: 0, fluid: 0 };
  for (const [list, side] of [[r.ins, 'in'], [r.outs, 'out']] as const) {
    for (const f of list) {
      if (out[f.item]) continue;
      const k = data.items[f.item]?.fluid ? 'fluid' : side;
      out[f.item] = pal[k][Math.min(used[k]++, pal[k].length - 1)];
    }
  }
  return out;
}

export function StageView({ block, stage, factory, flow, data, dispatch, onClose }: Props) {
  const r = data.recipes[stage.recipe];
  const b = data.buildings[r.building];
  const place = factory.map?.[stage.id];
  const arr = useMemo(() => arrange(stage, data, stage.layout, place), [stage, data, place]);
  const colors = useMemo(() => stageColors(r, data), [r, data]);
  const [sel, setSel] = useState<StageSel>(null);
  const [sheet, setSheet] = useState<Sheet>('peek');
  // Seleção que deixou de existir (fileira sumiu, esteira de outra receita) cai.
  const live: StageSel = sel?.t === 'row' ? (arr.rows.some(x => x.index === sel.i) ? sel : null)
    : sel?.t === 'belt' ? (arr.lines.some(l => `${l.side}:${l.item}` === sel.key) ? sel : null) : null;
  const lay = stage.layout;
  const set = (l: Layout | null) => dispatch({ type: 'setLayout', id: stage.id, layout: l });
  const onMove = (i: number, dx: number, dy: number) => set(moveRow(lay, i, dx, dy));
  // Selecionar no celular sobe a folha até a metade, para o ajuste aparecer.
  const select = (s: StageSel) => { setSel(s); if (s && sheet === 'peek' && phone()) setSheet('half'); };

  // Ao abrir, o foco vai para o título da etapa.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  // Esc volta um nível: do ajuste para a visão geral; da visão geral, ao mapa (num campo, o Esc cancela a edição).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== 'Escape' || (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (live) setSel(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, live]);

  const name = (id: string) => data.items[id]?.name ?? id;
  const selLine = live?.t === 'belt' ? arr.lines.find(l => `${l.side}:${l.item}` === live.key) : undefined;
  const selTitle = live?.t === 'row' ? t('plLayRow', String(live.i + 1))
    : selLine ? t('plLayBelt', name(selLine.item), selLine.side, selLine.fluid) : null;

  // Saídas fluidas sem ligação, com o que sai delas: o Awesome Sink não aceita fluido.
  const bf = flow.blocks[stage.id];
  const extra = r.outs
    .filter(x => data.items[x.item]?.fluid && !factory.links.some(l => l.from === stage.id && l.item === x.item))
    .map(x => t('plFluidOut', name(x.item), rateText(data.items[x.item], bf?.outs.find(p => p.item === x.item)?.rate ?? 0)));

  // Enquadra de novo quando o desenho muda de forma: modelo, inverter, fileiras ou o tamanho (em fundações de 8 m).
  const box = previewBox(arr.geo);
  const fitKey = `${arr.kind}|${lay?.invert ? 1 : 0}|${arr.rows.length}|${Math.ceil(box.w / 8)}x${Math.ceil(box.h / 8)}`;
  // Celular: a folha na metade cobre a parte de baixo do desenho; o desenho deixa esse espaço livre.
  // A altura do corpo muda com o topo (os chips somem com a seleção), por isso é medida e não lida no render.
  const body = useRef<HTMLDivElement>(null);
  const [bodyH, setBodyH] = useState(0);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const read = () => setBodyH(el.clientHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bottom = sheet === 'half' && phone() ? Math.max(0, Math.round(bodyH * SHEET_HALF) - SHEET_PEEK) : 0;

  const panel = { stage, data, arr, sel: live, onSel: select, dispatch };
  const center = arr.kind === 'center';
  // "Por linha": vazio = sugerido. No center o modelo divide as máquinas, então o campo some.
  const perRow = center ? null : (
    <OptIntField label={t('plPerRow')} value={stage.perRow} max={500}
      placeholder={t('plSuggested', fmt(suggestedPerRow(stage, data)))} bad={t('plPerRowBad')}
      onCommit={n => dispatch({ type: 'setPerRow', id: stage.id, perRow: n })} />
  );

  // A barra flutuante: as ações rápidas da seleção.
  let float = null;
  if (live?.t === 'row') {
    const e = lay?.rows?.[live.i];
    float = (
      <div className="pl-sv-float" role="toolbar" aria-label={t('plSvQuick')}>
        <button type="button" className="pl-btn" aria-pressed={!!e?.flip} onClick={() => set(toggleRow(lay, live.i, 'flip'))}>{t('plLayFlip')}</button>
        <button type="button" className="pl-btn" aria-pressed={!!e?.mirror} onClick={() => set(toggleRow(lay, live.i, 'mirror'))}>{t('plLayMirror')}</button>
      </div>
    );
  } else if (live?.t === 'belt' && selLine && !selLine.fluid) {
    const { side, exit } = selLine, key = live.key;
    const shared = sharedKeyOf(stage, data, lay) === key, defExit = shared ? 'down' : 'end';
    const next = EXITS[(EXITS.indexOf(exit) + 1) % EXITS.length];
    const join = joinState(arr, lay, key, live.row);
    const even = !!lay?.belts?.[key]?.even, splits = !!beltInfo(stage, data, arr, key)?.splits;
    const focusCut = () => {
      if (sheet === 'peek' && phone()) setSheet('half');
      requestAnimationFrame(() => document.getElementById(CUT_ID)?.focus());
    };
    float = (
      <div className="pl-sv-float" role="toolbar" aria-label={t('plSvQuick')}>
        {exit !== 'end' && <button type="button" className="pl-btn" onClick={focusCut}>{t('plSvCutAct')}</button>}
        <button type="button" className="pl-btn" aria-label={t('plSvExitNext', exitLabel(side, exit), exitLabel(side, next))}
          onClick={() => set(setBelt(lay, key, { exit: next === defExit ? null : next }))}>{exitLabel(side, exit)}</button>
        {splits && <button type="button" className="pl-btn" aria-pressed={even} onClick={() => set(setEven(lay, key, !even))}>{t('plSvEven')}</button>}
        {join && <button type="button" className="pl-btn" aria-pressed={join === 'joined'}
          onClick={() => set(toggleJoin(lay, `${key}@${live.row}`))}>{t(join === 'joined' ? 'plSvUnjoinShort' : 'plSvJoinShort')}</button>}
      </div>
    );
  }

  return (
    <div className="pl-stageview" role="region" aria-label={t('plStageView')}>
      <div className="pl-sv-top">
        <button type="button" className="pl-btn pl-primary pl-sv-back" data-tour="stage-back" onClick={onClose}>
          <span aria-hidden="true">← </span>{t('plSvBackMap')}
        </button>
        <nav className="pl-crumb" aria-label={t('plSvPath')}>
          <button type="button" className="pl-crumb-a" onClick={onClose}>{t('plSvFactory')}</button>
          <span aria-hidden="true" className="pl-crumb-sep">›</span>
          <h2 className="pl-crumb-h" tabIndex={-1} ref={heading}>
            {selTitle ? <button type="button" className="pl-crumb-a" onClick={() => setSel(null)}>{r.name}</button> : <b aria-current="page">{r.name}</b>}
          </h2>
          {selTitle && <><span aria-hidden="true" className="pl-crumb-sep">›</span><b aria-current="page">{selTitle}</b></>}
        </nav>
        {!selTitle && <StageChips block={block} stage={stage} factory={factory} flow={flow} data={data} dispatch={dispatch} />}
        <span className="pl-grow" />
        <StageHelp items={Object.keys(colors).map(it => ({ name: name(it), color: colors[it] }))} />
      </div>
      <div className="pl-sv-body" ref={body}>
        <StageDrawing arr={arr} data={data} machine={b.name} colors={colors} sel={live} onSel={select} onMove={onMove}
          fitKey={fitKey} bottom={bottom} float={float} />
        <aside className="pl-sv-panel" data-sheet={sheet} aria-label={t('plInspector')} data-tour="stage-belt-panel">
          <SheetHandle sheet={sheet} onSheet={setSheet} title={selTitle ?? `${t('plSvOverview')} · ${r.name}`} />
          <div className="pl-sv-scroll" key={live ? JSON.stringify(live) : ''}>
            {live?.t === 'row' ? <RowAdjust {...panel} i={live.i} />
              : live?.t === 'belt' ? <BeltAdjust {...panel} beltKey={live.key} row={live.row} />
                : <Overview {...panel} perRow={perRow} />}
          </div>
          <Summary {...panel} extra={extra} />
        </aside>
      </div>
    </div>
  );
}

// Máquinas (calculado ou fixado, com "auto" para voltar), clock e receita, editáveis no topo.
function StageChips({ block, stage, factory, flow, data, dispatch }: Omit<Props, 'onClose'>) {
  const r = data.recipes[stage.recipe];
  const main = (r.outs[0] ?? r.ins[0]).item;
  const options = recipesFor(data, main);
  if (!options.some(o => o.id === r.id)) options.unshift(r);
  const bf = flow.blocks[stage.id];
  const fixed = block.limits?.machines !== undefined;
  return (
    <div className="pl-sv-chips">
      {/* O estado (calculado ou fixado) em texto e no nome do grupo, não só na cor da borda. */}
      <div className={'pl-sv-chip' + (fixed ? ' pl-fixed' : '')} role="group" aria-label={`${t('plMachines')}: ${t(fixed ? 'plFixed' : 'plCalc')}`}>
        <NumField label={t('plMachines')} value={limitView(block, bf, factory.links).machines.value} valid={machinesOk}
          bad={t('plMachinesBad', fmt(MAX_MACHINES, 0))} always={!fixed} placeholder={bf?.unbounded && !fixed ? t('plUnbounded') : undefined}
          onCommit={n => dispatch({ type: 'setLimits', id: stage.id, limits: { ...block.limits, machines: n } })} />
        <span className="pl-sv-state" aria-hidden="true">{t(fixed ? 'plFixed' : 'plCalc')}</span>
        {fixed && (
          <button type="button" className="pl-sv-auto" aria-label={`${t('plResetDefault')}: ${t('plMachines')}`}
            onClick={() => dispatch({ type: 'setLimits', id: stage.id, limits: block.limits?.inputs ? { inputs: block.limits.inputs } : null })}>
            {t('plSvAuto')}
          </button>
        )}
      </div>
      <div className="pl-sv-chip">
        <NumField label={t('plClock')} value={stage.clock} valid={n => n >= 1 && n <= 250}
          onCommit={n => dispatch({ type: 'setClock', id: stage.id, clock: n })} bad={t('plClockBad')} />
      </div>
      <label className="pl-sv-chip pl-sv-chip-recipe">
        <span>{t('plRecipe')}</span>
        <select value={r.id} onChange={e => dispatch({ type: 'setRecipe', id: stage.id, recipe: e.target.value })}>
          {options.map(o => <option key={o.id} value={o.id}>{o.alt ? `${o.name} · ${t('plPickAlt')}` : o.name}</option>)}
        </select>
      </label>
    </div>
  );
}

// Alça da folha do celular: toque alterna fechada / meia / inteira; arrastar sobe ou desce um nível.
function SheetHandle({ sheet, onSheet, title }: { sheet: Sheet; onSheet: (s: Sheet) => void; title: string }) {
  const h = useRef({ y0: 0, at: -1, dragged: 0 });
  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    h.current = { y0: e.clientY, at: e.pointerId, dragged: 0 };
  };
  const up = (e: RPointerEvent<HTMLButtonElement>) => {
    if (h.current.at !== e.pointerId) return;
    h.current.at = -1;
    const dy = e.clientY - h.current.y0;
    if (Math.abs(dy) <= DRAG_PX) return;
    h.current.dragged = performance.now();
    onSheet(dy < 0 ? SHEET_UP[sheet] : SHEET_DOWN[sheet]);
  };
  const click = () => {
    // O clique sintético de um arraste chega logo depois do pointerup.
    if (h.current.dragged && performance.now() - h.current.dragged < CLICK_AFTER_DRAG_MS) { h.current.dragged = 0; return; }
    h.current.dragged = 0;
    onSheet(SHEET_NEXT[sheet]);
  };
  return (
    <button type="button" className="pl-sv-sheet-h" aria-expanded={sheet !== 'peek'} aria-label={`${t('plPanelSheet')}: ${title}`}
      onPointerDown={down} onPointerUp={up} onPointerCancel={() => { h.current.at = -1; }} onClick={click}>
      <span>{title}</span><i aria-hidden="true" />
    </button>
  );
}
