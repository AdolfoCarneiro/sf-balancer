import { useState } from 'react';
import { fmt, parseNum, t } from '../../i18n/index.js';
import { altPieces, meioSummary, meioUrl, type Meio } from '../model/meio.ts';
import { chosenAlt, type MeioResult } from '../model/meioresult.ts';
import type { Action } from '../model/persist.ts';
import type { PieceCount } from '../model/map/geo.ts';
import { rotSize } from '../model/map/scene.ts';
import { sizeText } from './format.ts';
import { MAX_MACHINES } from '../model/chain.ts';
import type { Chain, GameData, Stage } from '../model/types.ts';
import type { Lang } from '../lang.ts';
import type { Selection } from './selection.ts';

interface Props {
  selection: Selection; chain: Chain; data: GameData; lang: Lang; meioList: Meio[]; results: Map<string, MeioResult | null>;
  dispatch: (a: Action) => void; onSelect: (s: Selection) => void; onOpenStage: (id: string) => void;
}

const POLICIES = [['represar', 'policyHold'], ['sink', 'policySink'], ['extra', 'policyExtra']] as const;

export function Inspector({ selection, chain, data, lang, meioList, results, dispatch, onSelect, onOpenStage }: Props) {
  const meio = selection?.kind === 'meio' ? meioList.find(m => m.id === selection.id) : undefined;
  const stage = selection?.kind === 'stage' ? chain.stages.find(s => s.id === selection.id) : undefined;
  return (
    <aside className="pl-inspector" aria-label={t('plInspector')} id="pl-inspector">
      {!meio && !stage && <p className="pl-note">{t('plInspectorEmpty')}</p>}
      {meio && <MeioPanel meio={meio} result={results.get(meio.id)} chain={chain} data={data} lang={lang} dispatch={dispatch} />}
      {stage && <StagePanel key={stage.id} stage={stage} data={data} dispatch={dispatch} onSelect={onSelect} onOpenStage={onOpenStage} />}
    </aside>
  );
}

const altText = (n: PieceCount) => t('plMeioAltPieces', fmt(n.splitters, 0), fmt(n.mergers, 0), fmt(n.sinks, 0));

// result: null = calculando; undefined = o meio não pôde ser calculado.
function MeioPanel({ meio, result, chain, data, lang, dispatch }: {
  meio: Meio; result: MeioResult | null | undefined; chain: Chain; data: GameData; lang: Lang; dispatch: (a: Action) => void;
}) {
  const plan = result?.plan ?? null;
  const names = (ids: string[]) => ids.map(id => {
    const s = chain.stages.find(x => x.id === id);
    return s ? data.recipes[s.recipe].name : id;
  }).join(', ');
  const item = data.items[meio.item];
  // Resumo, peças e avisos são da montagem escolhida (a primeira, se a escolhida sumiu).
  const altKey = plan ? chosenAlt(plan, chain.alts?.[meio.id]) : null;
  const alt = plan?.alternatives.find(a => a.key === altKey);
  const sum = plan ? meioSummary(plan, altKey ?? undefined, result?.geos) : null;
  // A geometria da montagem escolhida, girada com a primeira produtora (o meio anda com ela no mapa).
  const geo = altKey && result && Object.hasOwn(result.geos, altKey) && !result.geos[altKey].tooLarge ? result.geos[altKey] : null;
  const warns = plan ? [...plan.warnings.map(w => w.text), ...(alt?.warnings ?? [])] : [];
  return (
    <div className="pl-insp">
      <h2 className="pl-insp-kicker">{t('plSelMeio')}</h2>
      <div className="pl-insp-title">{item?.name ?? meio.item}</div>
      <div className="pl-insp-sub">{t('plFeeds', names(meio.producers), names(meio.consumers))}</div>
      {result === null && <p className="pl-note" role="status">{t('plMeioCalc')}</p>}
      {geo && <div className="pl-insp-sub">{t('plMapMeioSize')}: {sizeText(rotSize(geo, chain.map?.[meio.producers[0]]?.rot ?? 0))}</div>}
      {sum && (
        <>
          <dl className="pl-nums">
            <div><dt>{t('plSupply')}</dt><dd>{fmt(sum.supply)}</dd></div>
            <div><dt>{t('plDemand')}</dt><dd>{fmt(sum.demand)}</dd></div>
            {sum.short > 0
              ? <div className="pl-short"><dt>{t('plShortage')}</dt><dd>{fmt(sum.short)}</dd></div>
              : <div><dt>{t('plLeftover')}</dt><dd>{fmt(sum.leftover)}</dd></div>}
          </dl>
          {sum.tooLarge
            ? <p className="pl-note pl-bad" role="status">{t('plMeioTooLarge', fmt(sum.tooLarge.src, 0), fmt(sum.tooLarge.dst, 0))}</p>
            : (
              <>
                <div className="pl-case">{sum.caseLabel}</div>
                {plan && plan.alternatives.length > 1 && (
                  <fieldset className="pl-malts">
                    <legend className="pl-insp-h">{t('plMeioAlts')}</legend>
                    {plan.alternatives.map(a => (
                      <label key={a.key} className="pl-malt">
                        <input type="radio" name={'pl-alt-' + meio.id} value={a.key} checked={a.key === altKey}
                          onChange={() => dispatch({ type: 'setMeioAlt', meio: meio.id, key: a.key })} />
                        <span>
                          <span>{a.title}</span>
                          <small>{a.caseLabel} · {altText(altPieces(a, result?.geos[a.key]))}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {warns.length > 0 && <ul className="pl-warns">{warns.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                <h3 className="pl-insp-h">{t('plPieces')}</h3>
                <ul className="pl-pieces">
                  <li><span>Splitter</span><b>{fmt(sum.pieces.splitters)}</b></li>
                  <li><span>Merger</span><b>{fmt(sum.pieces.mergers)}</b></li>
                  <li><span>Awesome Sink</span><b>{fmt(sum.pieces.sinks)}</b></li>
                  {sum.pieces.smart > 0 && <li><span>Smart Splitter</span><b>{fmt(sum.pieces.smart)}</b></li>}
                  {sum.pieces.junctions > 0 && <li><span>Pipeline Junction</span><b>{fmt(sum.pieces.junctions)}</b></li>}
                </ul>
              </>
            )}
        </>
      )}
      <label className="pl-field">
        <span>{t('policyTitle')}</span>
        <select value={chain.policy} onChange={e => dispatch({ type: 'setPolicy', policy: e.target.value as Chain['policy'] })}>
          {POLICIES.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
        </select>
      </label>
      <a className="pl-btn pl-primary pl-link" href={meioUrl(meio, chain, data, lang)}>{t('plOpenMeio')}</a>
      <p className="pl-note">{t('plMeioHint')}</p>
    </div>
  );
}

// Campo numérico com texto local: confirma no blur ou no Enter, uma ação por edição.
export function NumField({ label, value, valid, onCommit, bad }: {
  label: string; value: number; valid: (n: number) => boolean; onCommit: (n: number) => void; bad: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? fmt(value);
  const n = parseNum(shown);
  const invalid = text !== null && !valid(n);
  const commit = () => {
    if (text === null) return;
    if (valid(n)) { if (n !== value) onCommit(n); setText(null); }
  };
  return (
    <label className="pl-field">
      <span>{label}</span>
      <input type="text" inputMode="decimal" value={shown} aria-invalid={invalid} aria-label={label}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setText(null); }} />
      {invalid && <small className="pl-bad" role="alert">{bad}</small>}
    </label>
  );
}

function StagePanel({ stage, data, dispatch, onSelect, onOpenStage }: {
  stage: Stage; data: GameData; dispatch: (a: Action) => void; onSelect: (s: Selection) => void; onOpenStage: (id: string) => void;
}) {
  const r = data.recipes[stage.recipe];
  return (
    <div className="pl-insp">
      <h2 className="pl-insp-kicker">{t('plSelStage')}</h2>
      <div className="pl-insp-title">{r.name}</div>
      <div className="pl-insp-sub">{t('plBuilding')}: {data.buildings[r.building]?.name ?? r.building}</div>
      <NumField label={t('plMachines')} value={stage.machines} valid={n => Number.isInteger(n) && n >= 1 && n <= MAX_MACHINES}
        onCommit={n => dispatch({ type: 'setMachines', id: stage.id, n })} bad={t('plMachinesBad', fmt(MAX_MACHINES, 0))} />
      <NumField label={t('plClock')} value={stage.clock} valid={n => n >= 1 && n <= 250}
        onCommit={n => dispatch({ type: 'setClock', id: stage.id, clock: n })} bad={t('plClockBad')} />
      <label className="pl-check">
        <input type="checkbox" checked={stage.locked} onChange={e => dispatch({ type: 'setLocked', id: stage.id, locked: e.target.checked })} />
        <span>{t('plLock')}</span>
      </label>
      <button type="button" className="pl-btn" onClick={() => onOpenStage(stage.id)}>{t('plOpenStage')}</button>
      <button type="button" className="pl-btn pl-danger" onClick={() => { dispatch({ type: 'removeStage', id: stage.id }); onSelect(null); }}>{t('plDeleteStage')}</button>
    </div>
  );
}
