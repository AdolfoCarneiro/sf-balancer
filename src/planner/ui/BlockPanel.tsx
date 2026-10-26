// Painel lateral do bloco selecionado: ícone, nome e prédio; o que entra e sai (taxa e estado de cada porta, nas cores
// das portas do mapa) com a frase de cada problema e os consertos de um clique; a miniatura das fileiras com "Montar
// fileiras"; a receita (troca no lugar), os limites (máquinas e entrada por porta: calculado em texto normal, fixado em
// destaque com "voltar ao padrão"), clock, coleta do excesso, a origem (taxa da Miner; pureza e quantidade do extrator),
// o lugar no mapa (lado das entradas, giro, vãos), "Ver em escala" / "Voltar a montar" e apagar.
import { fmt, t } from '../../i18n/index.js';
import type { Action } from '../model/factorystate.ts';
import { MAX_EXTRACTORS, MAX_MACHINES, clockOk, countOk, machinesOk, rateOk } from '../model/factory.ts';
import { blockBadges, limitView } from '../model/badges.ts';
import type { BlockFlow, FlowResult } from '../model/solve.ts';
import { recipeLine, recipesFor } from '../model/search.ts';
import { hasRows, isSource } from '../model/types.ts';
import type {
  Block, ExtractorBlock, Factory, GameData, GeneratorBlock, InputBlock, ItemId, Limits, MapPlace, MinerBlock, Purity, RecipeBlock, Rot,
} from '../model/types.ts';
import type { Pt, Rect } from '../model/map/geo.ts';
import { rotated } from '../model/map/edit.ts';
import { portStates, type PortState } from '../model/portstate.ts';
import { fixesFor, problemSentence, type Fix } from '../model/fixes.ts';
import { NumField } from './NumField.tsx';
import { RowsPreview } from './RowsPreview.tsx';
import { iconUrl } from './icons.ts';
import { badgeText, blockIcon, blockName, rateText, sizeText } from './format.ts';
import type { ViewMode } from './selection.ts';

interface Props {
  block: Block; flow: FlowResult; factory: Factory; data: GameData; rect: Rect; place: MapPlace;
  onPlace: (p: MapPlace) => void; onOpen: (() => void) | null;   // null: sem fileiras para abrir
  onDelete: () => void; dispatch: (a: Action) => void;
  fixAt: (p: PortState) => Pt;   // onde o bloco do conserto nasce (à direita da saída, à esquerda da entrada)
  onCreate: (p: PortState) => void;   // "Criar fonte/destino": o seletor filtrado pela porta
  view: ViewMode; onScale: () => void; onMontar: () => void;
}

const SIDES = [[0, 'plMapSideLeft'], [1, 'plMapSideTop'], [2, 'plMapSideRight'], [3, 'plMapSideBottom']] as const;
const GAP_MAX = 64;
const PURITIES: [Purity, string][] = [['impure', 'plPurityImpure'], ['normal', 'plPurityNormal'], ['pure', 'plPurityPure']];
const EXPLAINED = new Set(['deficit', 'surplus', 'stalled', 'exit']);

// O prédio do bloco, na linha abaixo do nome.
function buildingOf(b: Block, data: GameData): string {
  switch (b.kind) {
    case 'recipe': { const r = data.recipes[b.recipe]; return r ? data.buildings[r.building]?.name ?? r.building : ''; }
    case 'miner': return t('plMiner');
    case 'input': return t('plInputSub');
    case 'generator': return data.generators?.[b.building]?.name ?? b.building;
    case 'extractor': return data.extractors[b.building]?.name ?? b.building;
    default: return '';
  }
}

// O estado da porta em poucas palavras, abaixo do nome do item.
function stateText(p: PortState, data: GameData): string {
  const n = p.amount === null ? '' : rateText(data.items[p.item], p.amount);
  switch (p.kind) {
    case 'deficit': return t('plDeficit', n);
    case 'surplus': return t('plHeld', n);
    case 'stalled': return t('plCardStalled');
    case 'exit': return t('plExit', n);
    default: return '';
  }
}

function PortRow({ p, data }: { p: PortState; data: GameData }) {
  const it = data.items[p.item], url = iconUrl(p.item), st = stateText(p, data);
  return (
    <li className={'pl-prow pl-prow-' + p.kind}>
      {url ? <img src={url} alt="" width={28} height={28} /> : <span className="pl-prow-noic" />}
      <span className="pl-prow-n">
        <span>{it?.name ?? p.item}</span>
        {st && <small>{st}</small>}
      </span>
      <b>{p.rate === null ? t('plUnbounded') : rateText(it, p.rate)}</b>
    </li>
  );
}

export function BlockPanel({ block: b, flow, factory: f, data, rect, place, onPlace, onOpen, onDelete, dispatch, fixAt, onCreate, view, onScale, onMontar }: Props) {
  const bf = flow.blocks[b.id];
  // Receita: o ícone do prédio (como no cartão); origem e sobra: o do bloco.
  const own = blockIcon(b, data);
  const url = (b.kind === 'recipe' ? iconUrl(data.recipes[b.recipe]?.building ?? '') : null) ?? (own ? iconUrl(own) : null);
  // Só os avisos do bloco inteiro (sem limite, loop travado): os das portas vêm na lista do que entra e sai.
  const badges = bf ? blockBadges(bf, flow).filter(x => x.side === 'block' && x.kind !== 'stalled') : [];
  const ports = bf ? portStates(bf) : [];
  const ins = ports.filter(p => p.side === 'in'), outs = ports.filter(p => p.side === 'out');
  const gap = (label: string, k: 'gapRow' | 'gapMachine') => (
    <NumField label={label} value={place[k] ?? 0} valid={n => n >= 0 && n <= GAP_MAX} bad={t('plMapGapBad')}
      onCommit={n => onPlace({ ...place, [k]: n })} />
  );
  const building = buildingOf(b, data);
  const title = isSource(b) ? data.items[b.item]?.name ?? b.item : blockName(b, data);
  const runFix = (p: PortState, x: Fix) => (x.action ? dispatch(x.action) : onCreate(p));
  const fixText = (p: PortState, x: Fix) => {
    switch (x.key) {
      case 'plFixReduce': return t('plFixReduce', fmt(x.n ?? 0, 0));
      case 'plFixRaise': {
        // A fonte a montante: a taxa da Miner (com unidade) ou a quantidade de extratores ou de máquinas.
        const up = f.blocks.find(s => s.id === (x.action && 'id' in x.action ? x.action.id : ''));
        if (up?.kind === 'miner' || up?.kind === 'input') return t('plFixRaise', rateText(data.items[p.item], x.n ?? 0));
        return t(up?.kind === 'extractor' ? 'plFixRaiseExtractors' : 'plFixRaiseMachines', fmt(x.n ?? 0, 0));
      }
      case 'plFixCreate': return t('plFixCreate', p.side);
      default: return t(x.key);
    }
  };
  return (
    <>
      <div className="pl-bp-head">
        {url && <img src={url} alt="" width={52} height={52} />}
        <div>
          <h2 className="pl-insp-title">{title}</h2>
          <div className="pl-insp-sub">{building || blockName(b, data)}</div>
          <div className="pl-insp-sub">{t('plMapBlockSize')}: {sizeText(rect)}</div>
        </div>
      </div>
      {badges.length > 0 && (
        <ul className="pl-badges" role="status">
          {badges.map((x, i) => <li key={i} className={'pl-badge-' + x.kind}>{badgeText(x, b, data, true)}</li>)}
        </ul>
      )}
      {ins.length > 0 && (
        <section className="pl-bp-ports" aria-labelledby="pl-bp-in">
          <h3 className="pl-insp-h" id="pl-bp-in">{t('plPanelIn')}</h3>
          <ul className="pl-prows">{ins.map(p => <PortRow key={p.item} p={p} data={data} />)}</ul>
        </section>
      )}
      {outs.length > 0 && (
        <section className="pl-bp-ports" aria-labelledby="pl-bp-out">
          <h3 className="pl-insp-h" id="pl-bp-out">{t('plPanelOut')}</h3>
          <ul className="pl-prows">{outs.map(p => <PortRow key={p.item} p={p} data={data} />)}</ul>
        </section>
      )}
      {ports.filter(p => EXPLAINED.has(p.kind)).map(p => {
        const s = problemSentence(p, f, flow, data);
        if (!s) return null;
        // Os números da frase chegam crus: aqui ganham o formato do idioma.
        const args = s.args.map(a => (typeof a === 'number' ? fmt(a) : a));
        const fixes = fixesFor(p, f, flow, data, fixAt(p));
        return (
          <div key={p.side + p.item} className={'pl-why pl-why-' + p.kind}>
            <p>{t(s.key, ...args)}</p>
            {fixes.length > 0 && (
              <div className="pl-fixes" data-tour="panel-fixes">
                {fixes.map((x, i) => (
                  <button key={x.key} type="button" className={'pl-btn' + (i === 0 ? ' pl-primary' : '')}
                    title={x.key === 'plFixReduce' && p.side === 'out' ? t('plFixReduceTip') : undefined}
                    onClick={() => runFix(p, x)}>{fixText(p, x)}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {hasRows(b) && onOpen && <RowsPreview block={b} bf={bf} data={data} place={place} onOpen={onOpen} />}
      {b.kind === 'recipe' && <RecipeFields b={b} bf={bf} f={f} data={data} dispatch={dispatch} />}
      {b.kind === 'miner' && <MinerFields b={b} bf={bf} data={data} dispatch={dispatch} />}
      {b.kind === 'extractor' && <ExtractorFields b={b} bf={bf} data={data} dispatch={dispatch} />}
      {b.kind === 'input' && <InputFields b={b} bf={bf} data={data} dispatch={dispatch} />}
      {b.kind === 'generator' && <GeneratorFields b={b} bf={bf} data={data} dispatch={dispatch} />}
      <section className="pl-bp-sec" aria-labelledby="pl-bp-map">
        <h3 className="pl-insp-h" id="pl-bp-map">{t('plBpMap')}</h3>
        <fieldset className="pl-seg">
          <legend>{t('plMapInSide')}</legend>
          <div className="pl-seg-row">
            {SIDES.map(([rot, key]) => (
              <label key={rot} className="pl-seg-opt">
                <input type="radio" name="pl-map-side" value={rot} checked={place.rot === rot}
                  onChange={() => onPlace({ ...place, rot: rot as Rot })} />
                <span>{t(key)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" className="pl-btn" onClick={() => onPlace(rotated(place))}>{t('plMapRotate')}</button>
        <div className="pl-two">
          {gap(t('plMapGapRow'), 'gapRow')}
          {gap(t('plMapGapMachine'), 'gapMachine')}
        </div>
      </section>
      <div className="pl-bp-foot">
        {view === 'montar'
          ? <button type="button" className="pl-btn" onClick={onScale}>{t('plSeeScale')}</button>
          : <button type="button" className="pl-btn" onClick={onMontar}>{t('plBackMontar')}</button>}
        <button type="button" className="pl-btn pl-danger" onClick={onDelete}>{t('plDeleteBlock')}</button>
      </div>
    </>
  );
}

// Campo de limite: o calculado em texto normal com o rótulo "calculado"; o fixado em destaque, com "voltar ao padrão".
// Digitar no calculado (mesmo o valor mostrado) fixa.
export function LimitField({ label, value, fixed, valid, bad, unbounded, onCommit, onReset, note }: {
  label: string; value: number | null; fixed: boolean; valid: (n: number) => boolean; bad: string; unbounded: boolean;
  onCommit: (n: number) => void; onReset: () => void; note?: string;
}) {
  return (
    <div className={'pl-limit ' + (fixed ? 'pl-fixed' : 'pl-calc')}>
      <NumField label={label} value={value} valid={valid} bad={bad} always={!fixed} onCommit={onCommit} className="pl-row"
        placeholder={unbounded && !fixed ? t('plUnbounded') : undefined} />
      <div className="pl-limit-state">
        {fixed
          ? <><b>{t('plFixed')}</b><button type="button" className="pl-linkbtn" onClick={onReset} aria-label={`${t('plResetDefault')}: ${label}`}>{t('plResetDefault')}</button></>
          : <span>{t('plCalc')}</span>}
      </div>
      {note && <p className="pl-note">{note}</p>}
    </div>
  );
}

function RecipeFields({ b, bf, f, data, dispatch }: { b: RecipeBlock; bf: BlockFlow | undefined; f: Factory; data: GameData; dispatch: (a: Action) => void }) {
  const r = data.recipes[b.recipe];
  const main = (r.outs[0] ?? r.ins[0]).item;
  const options = recipesFor(data, main);
  if (!options.some(o => o.id === r.id)) options.unshift(r);
  const lv = limitView(b, bf, f.links);
  const lim: Limits = b.limits ?? {};
  const setLimits = (limits: Limits) => dispatch({ type: 'setLimits', id: b.id, limits });
  const withoutInput = (item: ItemId): Limits => {
    const { [item]: _gone, ...inputs } = lim.inputs ?? {};
    return { ...(lim.machines !== undefined ? { machines: lim.machines } : {}), ...(Object.keys(inputs).length ? { inputs } : {}) };
  };
  const solidOuts = r.outs.filter(x => !data.items[x.item]?.fluid);
  // A nota das entradas sem ligação aparece uma vez, embaixo da última delas.
  const lastRaw = lv.inputs.filter(p => p.raw).at(-1)?.item;
  return (
    <>
      <label className="pl-field pl-recipe">
        <span>{t('plChangeRecipe')}</span>
        <select value={r.id} onChange={e => dispatch({ type: 'setRecipe', id: b.id, recipe: e.target.value })}>
          {options.map(o => <option key={o.id} value={o.id}>{o.alt ? `${o.name} · ${t('plPickAlt')}` : o.name}</option>)}
        </select>
      </label>
      <div className="pl-note">{recipeLine(r, data)}</div>
      <LimitField label={t('plLimitMachines')} value={lv.machines.value} fixed={lv.machines.fixed} valid={machinesOk}
        bad={t('plMachinesBad', fmt(MAX_MACHINES, 0))} unbounded={!!bf?.unbounded}
        onCommit={n => setLimits({ ...lim, machines: n })}
        onReset={() => setLimits(lim.inputs ? { inputs: lim.inputs } : {})} />
      {lv.inputs.map(p => {
        const it = data.items[p.item];
        return (
          <LimitField key={p.item} label={t('plLimitInput', it?.name ?? p.item, it?.fluid ? 'm³/min' : '/min')} value={p.value} fixed={p.fixed}
            valid={rateOk} bad={t('plRateBad')} unbounded={!!bf?.unbounded}
            note={p.item === lastRaw ? t('plLimitRawHint') : undefined}
            onCommit={n => setLimits({ ...lim, inputs: { ...lim.inputs, [p.item]: n } })}
            onReset={() => setLimits(withoutInput(p.item))} />
        );
      })}
      <NumField label={t('plClock')} value={b.clock} valid={n => n >= 1 && n <= 250} className="pl-row"
        onCommit={n => dispatch({ type: 'setClock', id: b.id, clock: n })} bad={t('plClockBad')} />
      {solidOuts.length > 0 && (
        <fieldset className="pl-collect">
          <legend className="pl-insp-h">{t('plCollect')}</legend>
          {solidOuts.map(x => (
            <label key={x.item} className="pl-check">
              <input type="checkbox" checked={!!b.collect?.includes(x.item)}
                onChange={e => dispatch({ type: 'setCollect', id: b.id, item: x.item, on: e.target.checked })} />
              <span>{data.items[x.item]?.name ?? x.item}</span>
            </label>
          ))}
          <p className="pl-note">{t('plCollectHint')}</p>
        </fieldset>
      )}
    </>
  );
}

function MinerFields({ b, bf, data, dispatch }: { b: MinerBlock; bf: BlockFlow | undefined; data: GameData; dispatch: (a: Action) => void }) {
  const out = bf?.outs[0];
  return (
    <>
      <NumField label={t('plMinerRate')} value={b.rate} valid={rateOk} bad={t('plRateBad')} className="pl-row"
        onCommit={n => dispatch({ type: 'setMinerRate', id: b.id, rate: n })} />
      {out && out.rate !== null && <p className="pl-note">{t('plPortOut', data.items[b.item]?.name ?? b.item)}: {rateText(data.items[b.item], out.rate)}</p>}
    </>
  );
}

// Gerador: o combustível (os do prédio), o clock, quantos (fixado ou calculado pelo que chega) e a potência.
function GeneratorFields({ b, bf, data, dispatch }: { b: GeneratorBlock; bf: BlockFlow | undefined; data: GameData; dispatch: (a: Action) => void }) {
  const g = data.generators?.[b.building], fixed = b.count !== null, calc = bf?.machines ?? null;
  const mw = (bf?.x ?? 0) * (g?.power ?? 0);
  return (
    <>
      <label className="pl-field pl-row">
        <span>{t('plGenFuel')}</span>
        <select value={b.fuel} onChange={ev => dispatch({ type: 'setGenerator', id: b.id, fuel: ev.target.value })}>
          {(g?.fuels ?? []).filter(x => data.items[x.item]).map(x => <option key={x.item} value={x.item}>{data.items[x.item].name}</option>)}
        </select>
      </label>
      <NumField label={t('plClock')} value={b.clock ?? 100} valid={clockOk} bad={t('plClockBad')} className="pl-row"
        onCommit={n => dispatch({ type: 'setGenerator', id: b.id, clock: n })} />
      <LimitField label={t('plGenCount')} value={fixed ? b.count : calc} fixed={fixed} valid={machinesOk}
        bad={t('plMachinesBad', fmt(MAX_MACHINES, 0))} unbounded={!!bf?.unbounded}
        onCommit={n => dispatch({ type: 'setGenerator', id: b.id, count: n })}
        onReset={() => dispatch({ type: 'setGenerator', id: b.id, count: null })} />
      <p className="pl-note">{t('plGenGives', fmt(mw), fmt(g?.power ?? 0))}</p>
    </>
  );
}

// Entrada: sem limite (dá o que pedirem, e o campo mostra quanto está dando) ou com um limite por minuto.
function InputFields({ b, bf, data, dispatch }: { b: InputBlock; bf: BlockFlow | undefined; data: GameData; dispatch: (a: Action) => void }) {
  const fixed = b.rate !== null, out = bf?.outs[0], item = data.items[b.item];
  const now = out && out.rate !== null ? out.rate : null;
  return (
    <>
      <LimitField label={t('plInputRate')} value={fixed ? b.rate : now} fixed={fixed} valid={rateOk} bad={t('plRateBad')}
        unbounded={!!bf?.unbounded} note={!fixed && now !== null ? t('plInputGives', rateText(item, now)) : undefined}
        onCommit={n => dispatch({ type: 'setInputRate', id: b.id, rate: n })}
        onReset={() => dispatch({ type: 'setInputRate', id: b.id, rate: null })} />
      {fixed && now !== null && <p className="pl-note">{t('plPortOut', item?.name ?? b.item)}: {rateText(item, now)}</p>}
    </>
  );
}

function ExtractorFields({ b, bf, data, dispatch }: { b: ExtractorBlock; bf: BlockFlow | undefined; data: GameData; dispatch: (a: Action) => void }) {
  const e = data.extractors[b.building];
  const fixed = b.count !== null;
  const calc = bf?.extractors ?? null;
  const out = bf?.outs[0];
  return (
    <>
      {e?.purity && (
        <label className="pl-field pl-row">
          <span>{t('plPurity')}</span>
          <select value={b.purity} onChange={ev => dispatch({ type: 'setExtractor', id: b.id, purity: ev.target.value as Purity })}>
            {PURITIES.map(([p, key]) => <option key={p} value={p}>{t(key)}</option>)}
          </select>
        </label>
      )}
      <NumField label={t('plClock')} value={b.clock ?? 100} valid={clockOk} bad={t('plClockBad')} className="pl-row"
        onCommit={n => dispatch({ type: 'setExtractor', id: b.id, clock: n })} />
      <LimitField label={t('plExtractorCount')} value={fixed ? b.count : calc} fixed={fixed} valid={countOk}
        bad={t('plExtractorBad', fmt(MAX_EXTRACTORS, 0))} unbounded={!!bf?.unbounded}
        note={!fixed && calc !== null ? t('plExtractorNeed', fmt(calc, 0)) : undefined}
        onCommit={n => dispatch({ type: 'setExtractor', id: b.id, count: n })}
        onReset={() => dispatch({ type: 'setExtractor', id: b.id, count: null })} />
      {out && out.rate !== null && <p className="pl-note">{t('plPortOut', data.items[b.item]?.name ?? b.item)}: {rateText(data.items[b.item], out.rate)}</p>}
    </>
  );
}
