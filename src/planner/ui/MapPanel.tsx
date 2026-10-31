// Painel lateral do mapa. Com um bloco selecionado, o painel do bloco (BlockPanel); com uma ligação, o resumo dela e os
// mesmos botões do chip; sem seleção, a visão geral: área, totais, avisos clicáveis (sobreposição, cruzamento e as
// faltas e sobras do Balanço) e a lista de blocos e de ligações (o caminho do teclado até cada um no mapa).
// No desktop o MapView decide se o painel aparece; no celular (≤ 720 px) ele é uma folha de baixo com alça.
import { useEffect, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { hasRows, isSource, type Factory, type GameData, type MapPlace, type StageId } from '../model/types.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Action } from '../model/factorystate.ts';
import type { Pt, Rect } from '../model/map/geo.ts';
import type { Scene } from '../model/map/scene.ts';
import { warningRect } from '../model/map/edit.ts';
import type { Meio } from '../model/meio.ts';
import type { MeioResult } from '../model/meioresult.ts';
import type { ChipLabel } from '../model/chip.ts';
import { portStates, type PortState } from '../model/portstate.ts';
import { problemSentence } from '../model/fixes.ts';
import { factoryTotals } from '../model/solved.ts';
import { NumField } from './NumField.tsx';
import { blockIcon, blockName, rateText, sizeText } from './format.ts';
import { iconUrl } from './icons.ts';
import { BlockPanel } from './BlockPanel.tsx';
import { ImportButton } from './ImportModeler.tsx';
import { TourHelp } from './Tour.tsx';
import { LigActions, ligInfo } from './ChipPopover.tsx';
import { pieceGap, validPieceGap } from '../model/map/sizes.ts';
import { selKey, type Selection, type ViewMode } from './selection.ts';

export type Sheet = 'peek' | 'half' | 'full';
const SHEET_NEXT: Record<Sheet, Sheet> = { peek: 'half', half: 'full', full: 'peek' };
const SHEET_UP: Record<Sheet, Sheet> = { peek: 'half', half: 'full', full: 'full' };
const SHEET_DOWN: Record<Sheet, Sheet> = { peek: 'peek', half: 'peek', full: 'half' };
const DRAG_PX = 30;
const CLICK_AFTER_DRAG_MS = 400;
type Dot = 'def' | 'stall' | 'sur' | '';
const DOT_OF: Partial<Record<PortState['kind'], Dot>> = { deficit: 'def', stalled: 'stall', surplus: 'sur' };
const DOT_TEXT: Record<Exclude<Dot, ''>, string> = { def: 'plPortStateDeficit', stall: 'plCardStalled', sur: 'plPortStateSurplus' };

interface Props {
  factory: Factory; flow: FlowResult; data: GameData; meioList: Meio[]; scene: Scene; places: Record<StageId, MapPlace>;
  selection: Selection; view: ViewMode;
  problems: PortState[];   // faltas, sobras e travados do Balanço
  open: boolean;   // desktop: o painel aparece (no celular a folha sempre existe)
  sheet: Sheet; onSheet: (s: Sheet) => void;
  chip: (id: string) => ChipLabel | null; results: Map<string, MeioResult | null>;
  dispatch: (a: Action) => void; onDelete: (id: StageId) => void;
  onDeleteMany: (ids: StageId[]) => void; onSelectAll: () => void; onClearSel: () => void;   // seleção múltipla
  onPlace: (id: StageId, place: MapPlace) => void; onPropose: () => void; onFocus: (r: Rect) => void;
  onGo: (s: Selection) => void;   // seleciona, centraliza no mapa e põe o foco no canvas (lista e avisos)
  onGoPort: (p: PortState) => void;   // aviso de falta/sobra: como a faixa Balanço (câmera e destaque na porta)
  onOpenStage: (id: StageId) => void; onBlockKey: (e: React.KeyboardEvent, id: StageId) => void;
  onGap: (gap: number) => void;   // vão entre peças do meio (a fábrica toda)
  fixAt: (p: PortState) => Pt; onCreate: (p: PortState) => void;
  onScale: (id: StageId) => void; onMontar: () => void;
  onSeeLig: (id: string) => void; onSwap: (id: string, key: string) => void; onUnlink: (id: string) => void;
  onImportFile: (f: File) => void;   // importar do Modeler (o App mostra o resumo)
  onSplit: (ids: StageId[]) => void;   // separar a seleção numa fábrica nova
  onCopy: () => void; onPaste: () => void; onDuplicate: () => void;   // copiar e colar (Ctrl+C, Ctrl+V, Ctrl+D)
  // Área da seleção na Planta (a calculada, ou a que a pessoa arrastou/redimensionou: areaEdited) e voltar à calculada.
  selArea: Rect | null; areaEdited: boolean; onAreaReset: () => void;
}

export function MapPanel(p: Props) {
  const { factory: f, flow, data, meioList, scene, places, selection } = p;
  const stageName = (id: StageId) => {
    const b = f.blocks.find(x => x.id === id);
    return b ? blockName(b, data) : id;
  };
  const itemName = (id: string) => data.items[id]?.name ?? id;
  // Nome de quem aparece num aviso: o bloco, ou o meio pelo item.
  const nameOf = (id: string) => {
    const m = meioList.find(x => x.id === id);
    return m ? t('plMapMeioName', itemName(m.item)) : stageName(id);
  };
  const selected = selection?.kind === 'stage' ? selection.id : null;
  const block = selected ? scene.blocks.find(b => b.stage === selected) : undefined;
  const place = selected ? places[selected] : undefined;
  const selBlock = selected ? f.blocks.find(x => x.id === selected) : undefined;
  const meio = selection?.kind === 'meio' ? meioList.find(m => m.id === selection.id) : undefined;
  const many = selection?.kind === 'stages' ? selection.ids : null;

  // Título da alça no celular: o que está aberto.
  const bf = selBlock ? flow.blocks[selBlock.id] : undefined;
  const sheetTitle = selBlock
    ? stageName(selBlock.id) + (selBlock.kind === 'recipe' && bf?.machines != null ? `, ${fmt(bf.machines, 0)} ${t('plCardMachines')}` : '')
    : meio ? t('plLigOf', itemName(meio.item)) : many ? t('plSelMany', fmt(many.length, 0)) : t('plPanelFactory');

  // Alça: clique (ou Enter/Espaço) passa para o próximo tamanho; arrastar mais de 30 px para cima abre mais, para baixo
  // fecha. O arraste decide no pointerup (com o ponteiro capturado, para valer mesmo saindo da alça) e o clique que o
  // navegador manda logo depois não conta; cada pointerdown zera o estado.
  const handle = useRef<{ y0: number; at: number; dragged: number }>({ y0: 0, at: -1, dragged: 0 });
  const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    handle.current = { y0: e.clientY, at: e.pointerId, dragged: 0 };
  };
  const onHandleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const h = handle.current;
    if (h.at !== e.pointerId) return;
    h.at = -1;
    const dy = e.clientY - h.y0;
    if (Math.abs(dy) <= DRAG_PX) return;
    h.dragged = performance.now();
    p.onSheet(dy < 0 ? SHEET_UP[p.sheet] : SHEET_DOWN[p.sheet]);
  };
  const onHandleClick = () => {
    const h = handle.current;
    // O clique sintético de um arraste chega logo depois do pointerup (no toque, às vezes nem chega).
    if (h.dragged && performance.now() - h.dragged < CLICK_AFTER_DRAG_MS) { h.dragged = 0; return; }
    h.dragged = 0;
    p.onSheet(SHEET_NEXT[p.sheet]);
  };

  let body: React.ReactNode;
  if (block && place && selBlock) {
    body = (
      <BlockPanel key={block.stage} block={selBlock} flow={flow} factory={f} data={data} rect={block.rect} place={place}
        onPlace={pl => p.onPlace(block.stage, pl)} onOpen={hasRows(selBlock) ? () => p.onOpenStage(block.stage) : null}
        onDelete={() => p.onDelete(block.stage)} dispatch={p.dispatch} fixAt={p.fixAt} onCreate={p.onCreate}
        view={p.view} onScale={() => p.onScale(block.stage)} onMontar={p.onMontar} />
    );
  } else if (meio) {
    body = <LigPanel meio={meio} {...p} />;
  } else if (many) {
    body = <ManyPanel ids={many} {...p} stageName={stageName} />;
  } else {
    body = (
      <Overview {...p} nameOf={nameOf} />
    );
  }
  // Fechar (desktop): a gaveta sai com o que mostrava (sem trocar para a visão geral no meio do caminho) e só depois some.
  const shown = useRef<{ body: React.ReactNode; key: string }>({ body, key: selKey(selection) ?? '' });
  const [wasOpen, setWasOpen] = useState(p.open);
  const [closing, setClosing] = useState(false);
  if (wasOpen !== p.open) {
    setWasOpen(p.open);
    setClosing(!p.open && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  useEffect(() => {
    if (!closing) return;
    const id = setTimeout(() => setClosing(false), PANEL_OUT_MS);
    return () => clearTimeout(id);
  }, [closing]);
  if (p.open) shown.current = { body, key: selKey(selection) ?? '' };
  const view = closing ? shown.current : { body, key: selKey(selection) ?? '' };
  return (
    <aside className={'pl-inspector' + (p.open ? '' : closing ? ' closing' : ' closed')} data-sheet={p.sheet} aria-label={t('plMapPanel')} id="pl-inspector">
      <button type="button" className="pl-sheet-h" data-tour="panel-toggle" aria-expanded={p.sheet !== 'peek'} aria-controls="pl-insp-body"
        aria-label={`${t('plPanelSheet')}: ${sheetTitle}`}
        onPointerDown={onHandleDown} onPointerUp={onHandleUp} onPointerCancel={() => { handle.current.at = -1; }}
        onClick={onHandleClick}>
        <span>{sheetTitle}</span><i aria-hidden="true" />
      </button>
      {/* key: outra seleção começa do topo (o que estava rolado na visão geral não vale para o bloco). */}
      <div className="pl-insp" id="pl-insp-body" key={view.key}><TourHelp area="panel" className="pl-insp-help" />{view.body}</div>
    </aside>
  );
}

// Quanto dura a gaveta saindo (o mesmo da animação pl-insp-out em planner.css).
const PANEL_OUT_MS = 240;

// Vários blocos selecionados: quantos, quais e os botões de apagar todos (um passo só do desfazer), separar numa fábrica
// nova e limpar a seleção.
function ManyPanel({ ids, stageName, selArea: box, areaEdited, onAreaReset, view, onDeleteMany, onClearSel, onSplit, onCopy, onPaste, onDuplicate }: Props & { ids: StageId[]; stageName: (id: StageId) => string }) {
  const n = fmt(ids.length, 0);
  return (
    <>
      <h2 className="pl-insp-title">{t('plSelMany', n)}</h2>
      {box && <p className="pl-insp-sub">{t(areaEdited ? 'plSelSizeEdited' : 'plSelSize')}: <b>{sizeText(box)}</b></p>}
      {box && view === 'planta' && <p className="pl-note">{t('plSelAreaHint')}</p>}
      {areaEdited && <button type="button" className="pl-btn" onClick={onAreaReset}>{t('plSelAreaReset')}</button>}
      <p className="pl-note">{t('plSelManyHint')}</p>
      <ul className="pl-sel-list">
        {ids.map(id => <li key={id}>{stageName(id)}</li>)}
      </ul>
      <div className="pl-sel-acts">
        <button type="button" className="pl-btn pl-danger" onClick={() => onDeleteMany(ids)}>{t('plSelDelete', n)}</button>
        <button type="button" className="pl-btn" onClick={onCopy} title="Ctrl+C">{t('plCopy')}</button>
        <button type="button" className="pl-btn" onClick={onDuplicate} title="Ctrl+D">{t('plDuplicate')}</button>
        <button type="button" className="pl-btn" onClick={onPaste} title="Ctrl+V">{t('plPaste')}</button>
        <button type="button" className="pl-btn" onClick={() => onSplit(ids)}>{t('plSplit')}</button>
        <button type="button" className="pl-btn" onClick={onClearSel}>{t('plSelClear')}</button>
      </div>
      <p className="pl-note">{t('plSplitHint')}</p>
    </>
  );
}

// Ligação selecionada: de onde para onde, quanto passa, quantas linhas de cada lado, a montagem e os botões do chip.
function LigPanel({ meio, factory: f, flow, data, chip, results, onSeeLig, onSwap, onUnlink }: Props & { meio: Meio }) {
  const label = chip(meio.id), result = results.get(meio.id);
  const info = ligInfo(meio, label, result, f, flow, data);
  const lines = label && label.nS + label.nD > 0 ? `${fmt(label.nS, 0)} → ${fmt(label.nD, 0)}` : '—';
  return (
    <>
      <div className="pl-bp-head">
        {info.icon && <img src={info.icon} alt="" width={52} height={52} />}
        <div>
          <h2 className="pl-insp-title">{t('plLigOf', info.item)}</h2>
          <div className="pl-insp-sub">{t('plLigFromTo', info.from, info.to)}</div>
        </div>
      </div>
      <ul className="pl-prows">
        <li className="pl-prow"><span className="pl-prow-n"><span>{t('plLigPasses')}</span></span>
          <b>{info.rate === null ? info.rateS : rateText(info.it, info.rate)}</b></li>
        <li className="pl-prow"><span className="pl-prow-n"><span>{t('plLigLines')}</span><small>{t('plLigLinesSub')}</small></span><b>{lines}</b></li>
        <li className="pl-prow"><span className="pl-prow-n"><span>{t('plLigMontagem')}</span></span><b>{info.kind}</b></li>
      </ul>
      {label?.short && <p className="pl-why pl-why-deficit"><span>{t('plChipShort')}</span></p>}
      <LigActions meio={meio} info={info} result={result} onSee={() => onSeeLig(meio.id)}
        onSwap={key => onSwap(meio.id, key)} onUnlink={() => onUnlink(meio.id)} />
    </>
  );
}

function Overview(p: Props & { nameOf: (id: string) => string }) {
  const { factory: f, flow, data, scene, meioList, chip, nameOf, onFocus, onGo, onGoPort, problems } = p;
  const { blocks, machines } = factoryTotals(f, flow);
  // Estado de cada bloco para o ponto da lista: falta pesa mais que travado, que pesa mais que sobra.
  const dot = (id: StageId): Dot => {
    const bf = flow.blocks[id];
    if (!bf) return '';
    const ks = portStates(bf).map(s => s.kind);
    return ks.includes('deficit') ? 'def' : ks.includes('stalled') ? 'stall' : ks.includes('surplus') ? 'sur' : '';
  };
  // Cada clique no aviso de cruzamentos leva ao próximo cruzamento.
  const [next, setNext] = useState(0);
  const n = scene.crossings.length;
  const goCrossing = () => {
    const [x, y] = scene.crossings[next % n];
    onFocus({ x, y, w: 0, h: 0 });
    setNext((next + 1) % n);
  };
  const why = (q: PortState) => {
    const s = problemSentence(q, f, flow, data);
    return s ? t(s.key, ...s.args.map(a => (typeof a === 'number' ? fmt(a) : a))) : '';
  };
  // Enter na lista: seleciona e vai para o mapa (de lá, Enter abre o mini painel da ligação ou a etapa); as outras teclas
  // do bloco (setas, R, Delete) continuam valendo aqui.
  const keyGo = (e: React.KeyboardEvent, s: Selection) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return false;
    e.preventDefault();
    onGo(s);
    return true;
  };
  const hasWarn = scene.overlaps.length > 0 || n > 0 || problems.length > 0;
  return (
    <>
      <h2 className="pl-insp-title">{t('plPanelFactory')}</h2>
      <div className="pl-ov-area">
        <span className="pl-insp-sub">{t('plMapArea')}</span>
        <b>{sizeText(scene.bounds)}</b>
      </div>
      <dl className="pl-nums">
        <div><dt>{t('plMapTotalBlocks')}</dt><dd>{fmt(blocks, 0)}</dd></div>
        <div><dt>{t('plMapTotalMachines')}</dt><dd>{fmt(machines, 0)}</dd></div>
      </dl>
      <h3 className="pl-insp-h">{t('plMapWarnings')}</h3>
      {hasWarn
        ? (
          <ul className="pl-map-warns" data-tour="panel-warns">
            {problems.map(q => {
              const url = iconUrl(q.item);
              return (
                <li key={`${q.block}|${q.side}|${q.item}`}>
                  <button type="button" className={DOT_OF[q.kind] ?? 'def'} onClick={() => onGoPort(q)}>
                    {url && <img src={url} alt="" width={24} height={24} />}
                    <span><b>{nameOf(q.block)}</b>: {why(q)}</span>
                  </button>
                </li>
              );
            })}
            {scene.overlaps.map(([a, b]) => (
              <li key={a + '|' + b}>
                <button type="button" onClick={() => { const r = warningRect(scene, [a, b]); if (r) onFocus(r); }}>
                  <span>{t('plMapOverlap', nameOf(a), nameOf(b))}</span>
                </button>
              </li>
            ))}
            {n > 0 && <li><button type="button" onClick={goCrossing}><span>{t('plMapCrossings', fmt(n, 0))}</span></button></li>}
          </ul>
        )
        : <p className="pl-note" data-tour="panel-warns">{t('plMapNoWarnings')}</p>}
      <div className="pl-insp-hrow">
        <h3 className="pl-insp-h" id="pl-map-blocks">{t('plMapBlocks')}</h3>
        {f.blocks.length > 0 && <button type="button" className="pl-btn" onClick={p.onSelectAll}>{t('plSelAll')}</button>}
      </div>
      {f.blocks.length > 0 && <p className="pl-note">{t('plMapListHint')}</p>}
      {f.blocks.length
        ? (
          <ul className="pl-map-blocks" data-tour="panel-blocks" aria-labelledby="pl-map-blocks">
            {f.blocks.map(b => {
              const bf = flow.blocks[b.id], ic = b.kind === 'recipe' ? data.recipes[b.recipe]?.building ?? null : blockIcon(b, data);
              const url = ic ? iconUrl(ic) : null, k = dot(b.id);
              const sub = b.kind === 'recipe' ? data.buildings[data.recipes[b.recipe]?.building]?.name ?? ''
                : b.kind === 'generator' ? t('plPowerMW', fmt((bf?.x ?? 0) * (data.generators?.[b.building]?.power ?? 0)))
                : (isSource(b) ? bf?.outs : bf?.ins)?.map(x => (x.rate === null ? t('plUnbounded') : rateText(data.items[x.item], x.rate))).join(', ') ?? '';
              return (
                <li key={b.id}>
                  <button type="button" className="pl-map-block" onClick={() => onGo({ kind: 'stage', id: b.id })}
                    onDoubleClick={() => p.onOpenStage(b.id)}
                    onKeyDown={e => { if (!keyGo(e, { kind: 'stage', id: b.id })) p.onBlockKey(e, b.id); }}>
                    {url ? <img src={url} alt="" width={30} height={30} /> : <span className="pl-prow-noic" />}
                    <span className="pl-prow-n"><span>{blockName(b, data)}</span>{sub && <small>{sub}</small>}</span>
                    {b.kind === 'recipe' && bf?.machines != null && <b>{fmt(bf.machines, 0)}</b>}
                    <i className={'pl-dot ' + k} aria-hidden="true" />
                    {k && <span className="pl-sr">{t(DOT_TEXT[k])}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )
        : <p className="pl-note">{t('plMapNoBlocks')}</p>}
      {meioList.length > 0 && (
        <>
          <h3 className="pl-insp-h" id="pl-map-ligs">{t('plMapLigs')}</h3>
          <ul className="pl-map-blocks" aria-labelledby="pl-map-ligs">
            {meioList.map(m => {
              const lab = chip(m.id), url = iconUrl(m.item);
              const rate = lab?.rate == null ? t('plUnbounded') : rateText(data.items[m.item], lab.rate);
              const short = !!lab?.short;
              return (
                <li key={m.id}>
                  <button type="button" className="pl-map-block" onClick={() => onGo({ kind: 'meio', id: m.id })}
                    onKeyDown={e => { keyGo(e, { kind: 'meio', id: m.id }); }}>
                    {url ? <img src={url} alt="" width={30} height={30} /> : <span className="pl-prow-noic" />}
                    <span className="pl-prow-n"><span>{t('plLigOf', data.items[m.item]?.name ?? m.item)}</span>
                      <small>{m.producers.map(nameOf).join(', ')} → {m.consumers.map(nameOf).join(', ')}</small></span>
                    <b>{rate}</b>
                    <i className={'pl-dot ' + (short ? 'def' : '')} aria-hidden="true" />
                    {short && <span className="pl-sr">{t('plPortStateDeficit')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h3 className="pl-insp-h">{t('plBpMap')}</h3>
      <button type="button" className="pl-btn" onClick={p.onPropose}>{t('plMapPropose')}</button>
      {p.view === 'planta' && <NumField label={t('plMapPieceGap')} value={pieceGap(f)} valid={validPieceGap} bad={t('plMapPieceGapBad')} onCommit={p.onGap} className="pl-row" />}
      <div className="pl-ov-import"><ImportButton onFile={p.onImportFile} tour="panel-import" /></div>
    </>
  );
}
