// Mini painel do chip de uma ligação (os dois modos do mapa): o que é a montagem, quanto passa e de onde para onde, e
// três ações: Ver montagem (o modal), Trocar montagem (as alternativas do plano) e Desligar. Quem posiciona é o MapView
// (abaixo do chip, ou acima se não couber), escrevendo left/top direto no elemento a cada quadro. O painel lateral da
// ligação (MapPanel) usa o mesmo resumo (ligInfo) e os mesmos botões (LigActions).
import { useEffect, useRef, useState, type Ref } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { altPieces, type Meio, type PlanAlt } from '../model/meio.ts';
import { chosenAlt, type MeioResult } from '../model/meioresult.ts';
import type { ChipLabel } from '../model/chip.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Factory, GameData, Item } from '../model/types.ts';
import { chipText } from './draw/chips.ts';
import { blockName, rateText } from './format.ts';
import { iconUrl } from './icons.ts';

interface Props {
  meio: Meio; label: ChipLabel | null; result: MeioResult | null | undefined;
  factory: Factory; flow: FlowResult; data: GameData;
  popRef: Ref<HTMLDivElement>;
  onSee: () => void; onSwap: (key: string) => void; onUnlink: () => void; onClose: () => void;
}

// Título pelo tipo da montagem; enquanto calcula, sem limite ou grande demais, o mesmo texto do chip.
function titleOf(lab: ChipLabel, item: string): string {
  switch (lab.kind) {
    case 'balancer': case 'sink': return t('plChipTitleBal', fmt(lab.nS, 0), fmt(lab.nD, 0));
    case 'direct': return t('plChipTitleDirect');
    case 'pipe': return t('plChipTitlePipe', item);
    default: return chipText(lab);
  }
}

export interface LigInfo {
  it: Item | undefined; item: string; icon: string | null;
  rate: number | null; rateS: string; ofS: string;   // o que passa (só o número) e de quanto (com a unidade)
  from: string; to: string;   // nomes das produtoras e das consumidoras
  kind: string;   // o título da montagem
  fluid: boolean; canSwap: boolean; altKey: string | null; alts: PlanAlt[];
  swapWhy: string | undefined;   // por que não dá para trocar: fluido, ainda calculando, ou sem montagens
}

// O resumo de uma ligação, no idioma atual: o chip e o painel lateral mostram o mesmo.
export function ligInfo(meio: Meio, label: ChipLabel | null, result: MeioResult | null | undefined, f: Factory, flow: FlowResult, data: GameData): LigInfo {
  const it = data.items[meio.item], item = it?.name ?? meio.item;
  const names = (ids: string[]) => ids.map(id => { const b = f.blocks.find(x => x.id === id); return b ? blockName(b, data) : id; }).join(', ');
  // De quanto: o que as produtoras poderiam mandar desse item (o que sai mais o que represa).
  let of: number | null = 0;
  for (const id of meio.producers) {
    for (const p of flow.blocks[id]?.outs ?? []) {
      if (p.item !== meio.item) continue;
      if (p.rate === null || of === null) { of = null; continue; }
      of += p.rate + p.held;
    }
  }
  const rate = label?.rate ?? null;
  const plan = result?.plan;
  const fluid = !!plan?.fluid || !!it?.fluid;
  const alts = plan && !plan.unbounded ? plan.alternatives : [];
  const canSwap = !fluid && alts.length > 0;
  return {
    it, item, icon: iconUrl(meio.item), rate,
    rateS: rate === null ? t('plUnbounded') : fmt(rate), ofS: of === null ? t('plUnbounded') : rateText(it, of),
    from: names(meio.producers), to: names(meio.consumers),
    kind: label ? titleOf(label, item) : t('plChipCalc'),
    fluid, canSwap, alts,
    swapWhy: canSwap ? undefined : fluid ? t('plChipSwapFluid') : !result ? t('plMeioCalc') : t('plChipSwapNone'),
    altKey: plan ? chosenAlt(plan, f.alts && Object.hasOwn(f.alts, meio.id) ? f.alts[meio.id] : undefined) : null,
  };
}

// Ver montagem, Trocar montagem (abre a lista das alternativas) e Desligar; a lista começa fechada a cada ligação.
export function LigActions({ meio, info, result, seeRef, onSee, onSwap, onUnlink }: {
  meio: Meio; info: LigInfo; result: MeioResult | null | undefined; seeRef?: Ref<HTMLButtonElement>;
  onSee: () => void; onSwap: (key: string) => void; onUnlink: () => void;
}) {
  const [opts, setOpts] = useState(false);
  useEffect(() => { setOpts(false); }, [meio.id]);
  const { fluid, canSwap, alts, altKey, swapWhy } = info;
  return (
    <>
      <div className="pl-chip-pop-row">
        <button ref={seeRef} type="button" className="pl-btn pl-primary" onClick={onSee}>{t('plChipSee')}</button>
        <button type="button" className="pl-btn" aria-expanded={canSwap ? opts : undefined} disabled={!canSwap}
          title={swapWhy} onClick={() => setOpts(o => !o)}>{t('plChipSwap')}</button>
        <button type="button" className="pl-btn pl-chip-pop-unlink" onClick={onUnlink}>{t('plChipUnlink')}</button>
      </div>
      {fluid && <p className="pl-chip-pop-note">{t('plChipSwapFluid')}</p>}
      {opts && canSwap && (
        <ul className="pl-chip-pop-opts" aria-label={t('plMeioAlts')}>
          {alts.map(a => (
            <li key={a.key}>
              <button type="button" aria-pressed={a.key === altKey} onClick={() => onSwap(a.key)}>
                <b>{a.title}</b>
                <span>{a.caseLabel ? `${a.caseLabel} · ` : ''}{piecesText(altPieces(a, result?.geos[a.key]))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ChipPopover({ meio, label, result, factory: f, flow, data, popRef, onSee, onSwap, onUnlink, onClose }: Props) {
  const see = useRef<HTMLButtonElement>(null);
  // Abriu (ou trocou de ligação): o foco vai para "Ver montagem".
  useEffect(() => { see.current?.focus({ preventScroll: true }); }, [meio.id]);
  const info = ligInfo(meio, label, result, f, flow, data);
  const { it, item, rate, rateS, ofS, kind, icon } = info;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };
  return (
    <div ref={popRef} className="pl-chip-pop" role="dialog" aria-label={t('plChipAria', item, rate === null ? rateS : rateText(it, rate), kind)}
      onKeyDown={onKey} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <h3>{icon && <img src={icon} alt="" width={26} height={26} />}<span>{kind}</span></h3>
      <p>
        {t('plChipSentence', rateS, ofS, item, info.from, info.to)}
        {label?.short && <> <b className="pl-chip-pop-short">{t('plChipShort')}</b></>}
      </p>
      <LigActions meio={meio} info={info} result={result} seeRef={see} onSee={onSee} onSwap={onSwap} onUnlink={onUnlink} />
    </div>
  );
}

const piecesText = (n: { splitters: number; mergers: number; sinks: number }) =>
  t('plMeioAltPieces', fmt(n.splitters, 0), fmt(n.mergers, 0), fmt(n.sinks, 0));
