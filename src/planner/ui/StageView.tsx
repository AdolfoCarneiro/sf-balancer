import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { BELTS, PIPES } from '../../logic/belts.js';
import type { Action } from '../model/factorystate.ts';
import { MAX_MACHINES, machinesOk } from '../model/factory.ts';
import { limitView } from '../model/badges.ts';
import { recipeLine, recipesFor } from '../model/search.ts';
import { arrange, type Arrangement } from '../model/layout.ts';
import { moveRow } from '../model/layoutedit.ts';
import { portsOf, portTier, suggestedPerRow, tierKey } from '../model/stage.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Factory, GameData, Recipe, RecipeBlock, Stage } from '../model/types.ts';
import { rateText } from './format.ts';
import { NumField } from './NumField.tsx';
import { LimitField } from './BlockPanel.tsx';
import { StageDrawing, type StageSel } from './StageDrawing.tsx';
import { LayoutModel, LayoutSelection, LayoutWarnings, OptIntField, linesText } from './StageLayout.tsx';

// stage: o bloco resolvido (solvedStage); block: o bloco salvo, com os limites.
interface Props { block: RecipeBlock; stage: Stage; factory: Factory; flow: FlowResult; data: GameData; dispatch: (a: Action) => void; onClose: () => void }

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
  // Seleção que deixou de existir (fileira sumiu, esteira de outra receita) cai.
  const live: StageSel = sel?.t === 'row' ? (arr.rows.some(x => x.index === sel.i) ? sel : null)
    : sel?.t === 'belt' ? (arr.lines.some(l => `${l.side}:${l.item}` === sel.key) ? sel : null) : null;
  const onMove = (i: number, dx: number, dy: number) => dispatch({ type: 'setLayout', id: stage.id, layout: moveRow(stage.layout, i, dx, dy) });

  // Ao abrir, o foco vai para o título da etapa.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  // Esc tira a seleção; sem seleção, volta à cadeia (num campo, o Esc cancela a edição).
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
  const items = [...new Set([...r.ins, ...r.outs].map(f => f.item))];

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
            {items.map(it => <li key={it}><i style={{ background: colors[it] }} />{name(it)}</li>)}
            <li><i className="pl-sq" style={{ background: 'var(--flow)' }} />Splitter</li>
            <li><i className="pl-sq" style={{ background: 'var(--ficsit)' }} />Merger</li>
            {arr.pieces.lifts > 0 && <li><i className="pl-sq pl-sq-lift" />Conveyor Lift</li>}
            <li className="pl-dim">{t('plFoundation')}</li>
          </ul>
          <div className="pl-draw-scroll" onPointerDown={e => { if (e.target === e.currentTarget) setSel(null); }}>
            {arr.rows.length > 0 && (
              <StageDrawing arr={arr} data={data} machine={b.name} colors={colors} sel={live} onSel={setSel} onMove={onMove} />
            )}
          </div>
        </div>
        <Side block={block} stage={stage} factory={factory} flow={flow} data={data} dispatch={dispatch} arr={arr} sel={live} onSel={setSel} />
      </div>
    </div>
  );
}

function Side({ block, stage, factory, flow, data, dispatch, arr, sel, onSel }: Omit<Props, 'onClose'> & { arr: Arrangement; sel: StageSel; onSel: (s: StageSel) => void }) {
  const r = data.recipes[stage.recipe];
  const main = (r.outs[0] ?? r.ins[0]).item;
  const options = recipesFor(data, main);
  if (!options.some(o => o.id === r.id)) options.unshift(r);
  // Saídas fluidas sem ligação, com o que sai delas: o Awesome Sink não aceita fluido.
  const bf = flow.blocks[stage.id];
  const fluidOut = r.outs
    .filter(x => data.items[x.item]?.fluid && !factory.links.some(l => l.from === stage.id && l.item === x.item))
    .map(x => ({ item: x.item, total: bf?.outs.find(p => p.item === x.item)?.rate ?? 0 }));
  const ports = portsOf(stage, data);
  const center = arr.kind === 'center';
  const per = arr.rows.reduce((m, x) => Math.max(m, x.machines), 0);
  const panel = { stage, data, arr, sel, onSel, dispatch };
  // "Por linha": vazio = sugerido. No center o modelo divide as máquinas, então o campo fica desligado.
  const perRow = (
    <OptIntField label={t('plPerRow')} value={center ? null : stage.perRow} max={500} disabled={center}
      placeholder={center ? '' : t('plSuggested', fmt(suggestedPerRow(stage, data)))} bad={t('plPerRowBad')}
      onCommit={n => dispatch({ type: 'setPerRow', id: stage.id, perRow: n })} />
  );
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
        {/* Como no painel do bloco: calculado ou fixado, com voltar ao padrão; sem limite ou travado, sem número a fixar. */}
        <LimitField label={t('plMachines')} value={limitView(block, bf, factory.links).machines.value} fixed={block.limits?.machines !== undefined}
          valid={machinesOk} bad={t('plMachinesBad', fmt(MAX_MACHINES, 0))} unbounded={!!bf?.unbounded}
          onCommit={n => dispatch({ type: 'setLimits', id: stage.id, limits: { ...block.limits, machines: n } })}
          onReset={() => dispatch({ type: 'setLimits', id: stage.id, limits: block.limits?.inputs ? { inputs: block.limits.inputs } : null })} />
        <NumField label={t('plClock')} value={stage.clock} valid={n => n >= 1 && n <= 250}
          onCommit={n => dispatch({ type: 'setClock', id: stage.id, clock: n })} bad={t('plClockBad')} />

        <h3 className="pl-insp-h">{t('plRowsTitle')}</h3>
        <LayoutModel {...panel} perRow={perRow} />
        <LayoutSelection {...panel} />
        <LayoutWarnings {...panel} />

        <h3 className="pl-insp-h">{t('plRowBelts')}</h3>
        {ports.map(f => {
          const it = data.items[f.item];
          const tiers = (it?.fluid ? PIPES : BELTS) as { id: string; cap: number }[];
          const side = f.side === 'ins' ? 'in' : 'out', key = `${side}:${f.item}`;
          const first = arr.lines.find(l => l.side === side && l.item === f.item);
          const label = t(f.side === 'ins' ? 'plPortIn' : 'plPortOut', it?.name ?? f.item);
          const on = sel?.t === 'belt' && sel.key === key;
          return (
            <div key={f.side + f.item} className="pl-port-set">
              <label className="pl-field">
                <span>{label}</span>
                <select value={stage.tiers[tierKey(f.side, f.item)] ?? ''} aria-label={t('plTierOf', label)}
                  onChange={e => dispatch({ type: 'setTier', id: stage.id, side: f.side, item: f.item, tier: e.target.value || null })}>
                  <option value="">{t('plTierAuto')} · {first?.tier ?? portTier(stage, data, f.item, f.side)}</option>
                  {tiers.map(x => <option key={x.id} value={x.id}>{x.id} ({fmt(x.cap)})</option>)}
                </select>
              </label>
              {first && (
                <div className="pl-lay-port">
                  <span>{linesText(arr, data, side, f.item)}</span>
                  <button type="button" className="pl-btn" aria-pressed={on} aria-label={t('plLayAdjustAria', label)} data-belt={key}
                    onClick={() => onSel({ t: 'belt', key, row: first.rows[0] })}>{t('plLayAdjust')}</button>
                </div>
              )}
              {f.side === 'outs' && fluidOut.some(x => x.item === f.item) && (
                <div className="pl-warn-box" role="status">{t('plFluidOut', it?.name ?? f.item, rateText(it, fluidOut.find(x => x.item === f.item)!.total))}</div>
              )}
            </div>
          );
        })}
        <h3 className="pl-insp-h">{t('plStagePieces')}</h3>
        <ul className="pl-pieces">
          <li><span>Splitter</span><b>{fmt(arr.pieces.splitters)}</b></li>
          <li><span>Merger</span><b>{fmt(arr.pieces.mergers)}</b></li>
          {arr.pieces.lifts > 0 && <li><span>Conveyor Lift</span><b>{fmt(arr.pieces.lifts)}</b></li>}
        </ul>
        {arr.rows.length > 0 && <p className="pl-note">{t('plLayRowsLine', fmt(arr.rows.length), fmt(per))}</p>}
        <p className="pl-note">{t('plLayArea', fmt(arr.area.w), fmt(arr.area.d))}</p>
      </div>
    </aside>
  );
}
