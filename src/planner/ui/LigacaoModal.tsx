// O modal da ligação: o desenho do fluxo da ferramenta (esteiras animadas), as montagens, as ligações do grupo e o
// passo a passo (o montador da página Balancer, já com esta ligação). Esc fecha; quem abriu cuida do foco.
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { flowLegend } from '../../ui/flow.js';
import { hideTip, showTip } from '../../ui/help.js';
import { LIB, saveLib, setMode3d } from '../../ui/library.js';
import { S as UI } from '../../ui/state.js';
import { stopStage, workbench } from '../../ui/workbench.js';
import { altPieces, meioSummary, type Meio } from '../model/meio.ts';
import { chosenAlt, chosenGeo, type MeioResult } from '../model/meioresult.ts';
import { balancerUrl } from '../model/ligacao.ts';
import type { Action } from '../model/factorystate.ts';
import type { PieceCount } from '../model/map/geo.ts';
import { rotSize } from '../model/map/scene.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Factory, GameData } from '../model/types.ts';
import type { Lang } from '../lang.ts';
import { useFlowView } from '../meios.ts';
import { montarLig } from '../model/views.ts';
import type { ViewMode } from './selection.ts';
import { blockName, sizeText } from './format.ts';

interface Props {
  meio: Meio; result: MeioResult | null | undefined; factory: Factory; flow: FlowResult; data: GameData; lang: Lang;
  dispatch: (a: Action) => void; onClose: () => void;
  mapView: ViewMode;   // a vista aberta: "Voltar ao lugar automático" vale para ela
  onUnlink: (linkId: string) => void;   // desliga uma esteira do grupo (quem abriu decide para onde o modal vai)
}

// O estado do balão da ajuda da página Balancer (o mesmo help.js).
const TIP = UI as unknown as { tipBtn: HTMLElement | null; tipPinned: boolean };
// Solta o balão da ajuda; sem o #tipbox (o modal já saiu da página), só esquece o botão.
const dropTip = () => {
  if (!TIP.tipBtn) return;
  if (document.getElementById('tipbox')) hideTip(); else { TIP.tipBtn = null; TIP.tipPinned = false; }
};
const altText = (n: PieceCount) => t('plMeioAltPieces', fmt(n.splitters, 0), fmt(n.mergers, 0), fmt(n.sinks, 0));

// result: null = calculando; undefined = a ligação não pôde ser calculada.
export function LigacaoModal({ meio, result, factory: f, flow, data, lang, dispatch, onClose, mapView, onUnlink }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const benchEl = useRef<HTMLDivElement>(null);
  const plan = result?.plan ?? null;
  const altKey = plan ? chosenAlt(plan, f.alts?.[meio.id]) : null;
  const state = useFlowView(meio, f, flow, data, lang, altKey ?? '');
  const view = state.kind === 'ready' ? state.view : null;
  // Passo a passo: qual bench (o balancer N→M ou a árvore de uma doadora) e se está montando.
  const [benchIdx, setBenchIdx] = useState(0);
  const [building, setBuilding] = useState(false);
  const benches = view?.benches ?? [];
  const bench = building ? benches[Math.min(benchIdx, benches.length - 1)] : undefined;

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    return dropTip;
  }, []);
  // Outra montagem: volta ao desenho (os passo a passo são outros).
  useEffect(() => { setBuilding(false); setBenchIdx(0); }, [altKey]);
  // O montador da ferramenta, montado à parte do React no div; sai parando a animação e a cena 3D.
  useEffect(() => {
    const el = benchEl.current;
    if (!el || !bench) return;
    workbench(el, {
      ...bench.ctx, rates: [...bench.ctx.rates], labels: { ins: [...bench.ctx.labels.ins], outs: [...bench.ctx.labels.outs] }, blueprints: [],
      mode3d: LIB.mode3d, mode3dBf: LIB.mode3dBf, onMode3d: setMode3d, per3d: LIB.per3d, onPer3d: (v: string) => { LIB.per3d = v; saveLib(); },
      view2d: LIB.view2d, onView2d: (v: string) => { LIB.view2d = v; saveLib(); },
    });
    (el.querySelector('.ponder') as HTMLElement | null)?.focus();
    return () => { stopStage(el); el.innerHTML = ''; };
  }, [bench]);

  const close = () => dlg.current?.close();
  const build = (i: number) => { setBenchIdx(i); setBuilding(true); };
  // O bloco do balancer (ou da doadora) no desenho abre o passo a passo dele, como na página Balancer.
  const openBlock = (e: SyntheticEvent) => {
    const k = (e.target as Element).closest?.('[data-open-bal]')?.getAttribute('data-open-bal');
    const i = k ? benches.findIndex(b => b.key === k) : -1;
    if (i >= 0) { e.preventDefault(); build(i); }
  };
  // Ajuda "?" da bancada: o mesmo balão da página Balancer, morando no diálogo.
  const tipOver = (e: SyntheticEvent) => { const b = (e.target as Element).closest?.('.tip') as HTMLElement | null; if (b && !TIP.tipPinned) showTip(b); };
  const tipOut = (e: React.MouseEvent) => {
    const b = (e.target as Element).closest?.('.tip');
    if (b && b === TIP.tipBtn && !TIP.tipPinned && !b.contains(e.relatedTarget as Node | null)) hideTip();
  };
  const tipClick = (e: React.MouseEvent) => {
    const b = (e.target as Element).closest?.('.tip') as HTMLElement | null;
    if (b) { e.preventDefault(); if (b === TIP.tipBtn && TIP.tipPinned) hideTip(); else showTip(b, true); }
    else if (TIP.tipBtn) hideTip();
  };

  const names = (ids: string[]) => ids.map(id => { const b = f.blocks.find(x => x.id === id); return b ? blockName(b, data) : id; }).join(', ');
  const nameOf = (id: string) => names([id]);
  const item = data.items[meio.item];
  const alt = plan?.alternatives.find(a => a.key === altKey);
  const sum = plan && !plan.unbounded ? meioSummary(plan, altKey ?? undefined, result?.geos) : null;
  const geo = result ? chosenGeo(result, f.alts?.[meio.id]) : null;
  const lig = f.ligs && Object.hasOwn(f.ligs, meio.id) ? f.ligs[meio.id] : null;
  // Posta na vista aberta (a Montar sem lugar próprio segue a Planta).
  const placed = mapView === 'planta' ? !!lig : !!montarLig(f, meio.id);
  const rot = lig ? lig.rot : f.map?.[meio.producers[0]]?.rot ?? 0;
  const links = meio.links.flatMap(id => f.links.filter(l => l.id === id));
  // Sem limite ou só para blocos de sobra: a página Balancer não tem o que planejar.
  const canOpen = !!plan && !plan.unbounded && !plan.direct;
  const title = view?.title ?? t('plLigTitle', item?.name ?? meio.item);

  return (
    <dialog ref={dlg} className="pl-lig" aria-labelledby="pl-lig-title" onClose={() => { dropTip(); onClose(); }}
      onMouseOver={tipOver} onMouseOut={tipOut} onFocus={tipOver} onBlur={e => { if (e.target === TIP.tipBtn) hideTip(); }} onClick={tipClick}>
      <div className="pl-lig-head">
        <h2 id="pl-lig-title">{title}</h2>
        <button type="button" className="pl-btn" onClick={close}>{t('plLigClose')}</button>
      </div>
      <div className="pl-lig-body">
        <aside className="pl-lig-side pl-insp">
          <div className="pl-insp-title">{item?.name ?? meio.item}</div>
          <div className="pl-insp-sub">{t('plFeeds', names(meio.producers), names(meio.consumers))}</div>
          {result === null && <p className="pl-note" role="status">{t('plMeioCalc')}</p>}
          {plan?.unbounded && <p className="pl-note" role="status">{t('plUnbounded')}</p>}
          {sum && (
            <dl className="pl-nums">
              <div><dt>{t('plSupply')}</dt><dd>{fmt(sum.supply)}</dd></div>
              <div><dt>{t('plDemand')}</dt><dd>{fmt(sum.demand)}</dd></div>
              {sum.short > 0.05
                ? <div className="pl-short"><dt>{t('plShortage')}</dt><dd>{fmt(sum.short)}</dd></div>
                : <div><dt>{t('plLeftover')}</dt><dd>{fmt(sum.leftover)}</dd></div>}
            </dl>
          )}
          {sum?.tooLarge && <p className="pl-note pl-bad" role="status">{t('plMeioTooLarge', fmt(sum.tooLarge.src, 0), fmt(sum.tooLarge.dst, 0))}</p>}
          {sum && !sum.tooLarge && sum.caseLabel && <div className="pl-case">{sum.caseLabel}</div>}
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
          {sum && !sum.tooLarge && alt && (
            <>
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
          <h3 className="pl-insp-h">{t('plLigLinks')}</h3>
          <ul className="pl-lig-links">
            {links.map(l => (
              <li key={l.id}>
                <span>{nameOf(l.from)} → {nameOf(l.to)}</span>
                <button type="button" className="pl-btn" onClick={() => onUnlink(l.id)}>{t('plLigUnlink')}</button>
              </li>
            ))}
          </ul>
          {geo && <div className="pl-insp-sub">{t('plMapMeioSize')}: {sizeText(rotSize(geo, rot))}</div>}
          <p className="pl-note">{t('plLigMoveHint')}</p>
          {placed && <button type="button" className="pl-btn" onClick={() => dispatch({ type: 'placeLig', meio: meio.id, place: null, view: mapView })}>{t('plLigReset')}</button>}
          {canOpen && (
            <>
              <a className="pl-btn pl-link" href={balancerUrl(meio, f, flow, data, lang, altKey)} target="_blank" rel="noopener">{t('plLigOpenBalancer')}</a>
              <p className="pl-note">{t('plMeioHint')}</p>
            </>
          )}
        </aside>
        <section className="pl-lig-main">
          {benches.length > 0 && (
            <div className="pl-lig-tools">
              {building
                ? <button type="button" className="pl-btn" onClick={() => setBuilding(false)}>{t('plLigBack')}</button>
                : <button type="button" className="pl-btn pl-primary" onClick={() => build(benchIdx)}>{t('plLigBuild')}</button>}
              {benches.length > 1 && (
                <label className="pl-lig-pick">
                  <span>{t('plLigBuildPick')}</span>
                  <select className="pl-field" value={benchIdx} onChange={e => setBenchIdx(+e.target.value)}>
                    {benches.map((b, i) => <option key={b.key} value={i}>{b.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          <div ref={benchEl} className="pl-lig-bench" hidden={!bench} />
          {!bench && (
            <>
              {state.kind === 'calc' && <p className="pl-note" role="status">{t('plMeioCalc')}</p>}
              {view?.svg && (
                <div className="pl-lig-sheet">
                  <div className="pl-lig-svg" onClick={openBlock}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openBlock(e); }}
                    dangerouslySetInnerHTML={{ __html: view.svg }} />
                  <div className="legend" dangerouslySetInnerHTML={{ __html: flowLegend(view.fluid, view.loop) }} />
                </div>
              )}
              {view && view.warnings.length > 0 && <ul className="pl-warns">{view.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            </>
          )}
        </section>
      </div>
      <div id="tipbox" role="tooltip" hidden />
    </dialog>
  );
}
