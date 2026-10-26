// Painel lateral do bloco selecionado: o que o fluxo diz dele (falta, represado, travado…), a receita (troca no lugar),
// os limites (máquinas e entrada por porta: calculado em texto normal, fixado em destaque com "voltar ao padrão"),
// clock, coleta do excesso, a origem (taxa da Miner; pureza e quantidade do extrator), o que a sobra recebe, o lugar no
// mapa (lado das entradas, giro, vãos) e apagar.
import { fmt, t } from '../../i18n/index.js';
import type { Action } from '../model/factorystate.ts';
import { MAX_EXTRACTORS, MAX_MACHINES, countOk, machinesOk, rateOk } from '../model/factory.ts';
import { blockBadges, limitView } from '../model/badges.ts';
import type { BlockFlow, FlowResult } from '../model/solve.ts';
import { recipeLine, recipesFor } from '../model/search.ts';
import type {
  Block, ExtractorBlock, Factory, GameData, ItemId, Limits, MapPlace, MinerBlock, Purity, RecipeBlock, Rot,
} from '../model/types.ts';
import type { Rect } from '../model/map/geo.ts';
import { rotated } from '../model/map/edit.ts';
import { NumField } from './NumField.tsx';
import { iconUrl } from './icons.ts';
import { badgeText, blockIcon, blockName, rateText, sizeText } from './format.ts';

interface Props {
  block: Block; flow: FlowResult; factory: Factory; data: GameData; rect: Rect; place: MapPlace;
  onPlace: (p: MapPlace) => void; onOpen: (() => void) | null;   // null: sem fileiras para abrir
  onDelete: () => void; dispatch: (a: Action) => void;
}

const SIDES = [[0, 'plMapSideLeft'], [1, 'plMapSideTop'], [2, 'plMapSideRight'], [3, 'plMapSideBottom']] as const;
const GAP_MAX = 64;
const PURITIES: [Purity, string][] = [['impure', 'plPurityImpure'], ['normal', 'plPurityNormal'], ['pure', 'plPurityPure']];

export function BlockPanel({ block: b, flow, factory: f, data, rect, place, onPlace, onOpen, onDelete, dispatch }: Props) {
  const bf = flow.blocks[b.id];
  const icon = blockIcon(b, data), url = icon ? iconUrl(icon) : null;
  const badges = bf ? blockBadges(bf, flow) : [];
  const name = (item: ItemId | null) => (item ? data.items[item]?.name ?? item : '');
  const gap = (label: string, k: 'gapRow' | 'gapMachine') => (
    <NumField label={label} value={place[k] ?? 0} valid={n => n >= 0 && n <= GAP_MAX} bad={t('plMapGapBad')}
      onCommit={n => onPlace({ ...place, [k]: n })} />
  );
  const outlet = b.kind === 'sink' || b.kind === 'container' || b.kind === 'export';
  return (
    <>
      <h2 className="pl-insp-kicker">{t('plSelStage')}</h2>
      <div className="pl-bp-head">
        {url && <img src={url} alt="" width={36} height={36} />}
        <div>
          <div className="pl-insp-title">{blockName(b, data)}</div>
          <div className="pl-insp-sub">{t('plMapBlockSize')}: {sizeText(rect)}</div>
        </div>
      </div>
      {badges.length > 0 && (
        <ul className="pl-badges" role="status">
          {badges.map((x, i) => (
            <li key={i} className={'pl-badge-' + x.kind}>
              {x.side !== 'block' && <span>{name(x.item)} · </span>}{badgeText(x, b, data, true)}
            </li>
          ))}
        </ul>
      )}
      {b.kind === 'recipe' && <RecipeFields b={b} bf={bf} f={f} data={data} dispatch={dispatch} />}
      {b.kind === 'miner' && <MinerFields b={b} bf={bf} data={data} dispatch={dispatch} />}
      {b.kind === 'extractor' && <ExtractorFields b={b} bf={bf} data={data} dispatch={dispatch} />}
      {outlet && (
        <>
          <h3 className="pl-insp-h">{t('plOutletGets')}</h3>
          {bf?.ins.length
            ? (
              <ul className="pl-pieces">
                {bf.ins.map(p => (
                  <li key={p.item}><span>{name(p.item)}</span><b>{p.rate === null ? t('plUnbounded') : rateText(data.items[p.item], p.rate)}</b></li>
                ))}
              </ul>
            )
            : <p className="pl-note">—</p>}
        </>
      )}
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
      <div className="pl-two">
        {onOpen && <button type="button" className="pl-btn" onClick={onOpen}>{t('plOpenStage')}</button>}
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
      <LimitField label={t('plExtractorCount')} value={fixed ? b.count : calc} fixed={fixed} valid={countOk}
        bad={t('plExtractorBad', fmt(MAX_EXTRACTORS, 0))} unbounded={!!bf?.unbounded}
        note={!fixed && calc !== null ? t('plExtractorNeed', fmt(calc, 0)) : undefined}
        onCommit={n => dispatch({ type: 'setExtractor', id: b.id, count: n })}
        onReset={() => dispatch({ type: 'setExtractor', id: b.id, count: null })} />
      {out && out.rate !== null && <p className="pl-note">{t('plPortOut', data.items[b.item]?.name ?? b.item)}: {rateText(data.items[b.item], out.rate)}</p>}
    </>
  );
}
