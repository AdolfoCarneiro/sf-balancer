import { fmt, t } from '../../i18n/index.js';
import { altPieces, meioSummary, meioUrl, type Meio } from '../model/meio.ts';
import { chosenAlt, chosenGeo, type MeioResult } from '../model/meioresult.ts';
import type { Action } from '../model/factorystate.ts';
import type { PieceCount } from '../model/map/geo.ts';
import { rotSize } from '../model/map/scene.ts';
import type { FlowResult } from '../model/solve.ts';
import { blockName, sizeText } from './format.ts';
import type { Factory, GameData } from '../model/types.ts';
import type { Lang } from '../lang.ts';
import type { Selection } from './selection.ts';

interface Props {
  selection: Selection; factory: Factory; flow: FlowResult; data: GameData; lang: Lang; meioList: Meio[]; results: Map<string, MeioResult | null>;
  dispatch: (a: Action) => void;
}

// O painel do meio selecionado (o do bloco fica no painel do mapa).
export function Inspector({ selection, factory, flow, data, lang, meioList, results, dispatch }: Props) {
  const meio = selection?.kind === 'meio' ? meioList.find(m => m.id === selection.id) : undefined;
  return (
    <aside className="pl-inspector" aria-label={t('plInspector')} id="pl-inspector">
      {!meio && <p className="pl-note">{t('plInspectorEmpty')}</p>}
      {meio && <MeioPanel meio={meio} result={results.get(meio.id)} factory={factory} flow={flow} data={data} lang={lang} dispatch={dispatch} />}
    </aside>
  );
}

const altText = (n: PieceCount) => t('plMeioAltPieces', fmt(n.splitters, 0), fmt(n.mergers, 0), fmt(n.sinks, 0));

// result: null = calculando; undefined = o meio não pôde ser calculado.
function MeioPanel({ meio, result, factory: f, flow, data, lang, dispatch }: {
  meio: Meio; result: MeioResult | null | undefined; factory: Factory; flow: FlowResult; data: GameData; lang: Lang; dispatch: (a: Action) => void;
}) {
  const plan = result?.plan ?? null;
  const names = (ids: string[]) => ids.map(id => {
    const b = f.blocks.find(x => x.id === id);
    return b ? blockName(b, data) : id;
  }).join(', ');
  const item = data.items[meio.item];
  // Resumo, peças e avisos são da montagem escolhida (a primeira, se a escolhida sumiu). Sem limite: sem números.
  const altKey = plan ? chosenAlt(plan, f.alts?.[meio.id]) : null;
  const alt = plan?.alternatives.find(a => a.key === altKey);
  const sum = plan && !plan.unbounded ? meioSummary(plan, altKey ?? undefined, result?.geos) : null;
  // A geometria da montagem escolhida, com o giro da ligação posta no mapa ou, colada, o da primeira produtora.
  const geo = result ? chosenGeo(result, f.alts?.[meio.id]) : null;
  const lig = f.ligs && Object.hasOwn(f.ligs, meio.id) ? f.ligs[meio.id] : null;
  const rot = lig ? lig.rot : f.map?.[meio.producers[0]]?.rot ?? 0;
  const warns = plan ? [...plan.warnings.map(w => w.text), ...(alt?.warnings ?? [])] : [];
  return (
    <div className="pl-insp">
      <h2 className="pl-insp-kicker">{t('plSelMeio')}</h2>
      <div className="pl-insp-title">{item?.name ?? meio.item}</div>
      <div className="pl-insp-sub">{t('plFeeds', names(meio.producers), names(meio.consumers))}</div>
      {result === null && <p className="pl-note" role="status">{t('plMeioCalc')}</p>}
      {plan?.unbounded && <p className="pl-note" role="status">{t('plUnbounded')}</p>}
      {geo && <div className="pl-insp-sub">{t('plMapMeioSize')}: {sizeText(rotSize(geo, rot))}</div>}
      <p className="pl-note">{t('plLigMoveHint')}</p>
      {lig && <button type="button" className="pl-btn" onClick={() => dispatch({ type: 'placeLig', meio: meio.id, place: null })}>{t('plLigReset')}</button>}
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
      <a className="pl-btn pl-primary pl-link" href={meioUrl(meio, f, flow, data, lang)}>{t('plOpenMeio')}</a>
      <p className="pl-note">{t('plMeioHint')}</p>
    </div>
  );
}
