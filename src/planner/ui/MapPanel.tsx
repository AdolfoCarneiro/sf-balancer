// Painel lateral do mapa: com um bloco selecionado, lado das entradas, giro, vãos e medida; sem seleção, a área,
// "Propor de novo" e os avisos. A lista de blocos (acessível pelo teclado) fica nos dois casos.
import { useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { Chain, GameData, MapPlace, Rot, StageId } from '../model/types.ts';
import type { Rect } from '../model/map/geo.ts';
import type { Scene } from '../model/map/scene.ts';
import { rotated, warningRect } from '../model/map/edit.ts';
import type { Meio } from '../model/meio.ts';
import { NumField } from './Inspector.tsx';
import { sizeText } from './format.ts';

interface Props {
  chain: Chain; data: GameData; meioList: Meio[]; scene: Scene; places: Record<StageId, MapPlace>; selected: StageId | null;
  onPlace: (id: StageId, place: MapPlace) => void; onPropose: () => void; onFocus: (r: Rect) => void;
  onPick: (id: StageId) => void; onOpenStage: (id: StageId) => void; onBlockKey: (e: React.KeyboardEvent, id: StageId) => void;
}

const SIDES = [[0, 'plMapSideLeft'], [1, 'plMapSideTop'], [2, 'plMapSideRight'], [3, 'plMapSideBottom']] as const;
const GAP_MAX = 64;

export function MapPanel(p: Props) {
  const { chain, data, meioList, scene, places, selected } = p;
  const stageName = (id: StageId) => {
    const s = chain.stages.find(x => x.id === id);
    return s ? data.recipes[s.recipe]?.name ?? s.recipe : id;
  };
  // Nome de quem aparece num aviso: a etapa, ou o meio pelo item.
  const nameOf = (id: string) => {
    const m = meioList.find(x => x.id === id);
    return m ? t('plMapMeioName', data.items[m.item]?.name ?? m.item) : stageName(id);
  };
  const block = selected ? scene.blocks.find(b => b.stage === selected) : undefined;
  const place = selected ? places[selected] : undefined;
  return (
    <aside className="pl-inspector" aria-label={t('plMapPanel')} id="pl-inspector">
      <div className="pl-insp">
        {block && place
          ? <BlockPanel key={block.stage} name={stageName(block.stage)} rect={block.rect} place={place}
            onPlace={pl => p.onPlace(block.stage, pl)} onOpen={() => p.onOpenStage(block.stage)} />
          : <Overview scene={scene} nameOf={nameOf} onPropose={p.onPropose} onFocus={p.onFocus} />}
        <h3 className="pl-insp-h" id="pl-map-blocks">{t('plMapBlocks')}</h3>
        <p className="pl-note">{t('plMapListHint')}</p>
        <ul className="pl-map-blocks" aria-labelledby="pl-map-blocks">
          {chain.stages.map(s => (
            <li key={s.id}>
              <button type="button" className={'pl-map-block' + (s.id === selected ? ' on' : '')} aria-pressed={s.id === selected}
                onClick={() => p.onPick(s.id)} onDoubleClick={() => p.onOpenStage(s.id)} onKeyDown={e => p.onBlockKey(e, s.id)}>
                {stageName(s.id)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function BlockPanel({ name, rect, place, onPlace, onOpen }: {
  name: string; rect: Rect; place: MapPlace; onPlace: (p: MapPlace) => void; onOpen: () => void;
}) {
  const gap = (label: string, k: 'gapRow' | 'gapMachine') => (
    <NumField label={label} value={place[k] ?? 0} valid={n => n >= 0 && n <= GAP_MAX} bad={t('plMapGapBad')}
      onCommit={n => onPlace({ ...place, [k]: n })} />
  );
  return (
    <>
      <h2 className="pl-insp-kicker">{t('plSelStage')}</h2>
      <div className="pl-insp-title">{name}</div>
      <div className="pl-insp-sub">{t('plMapBlockSize')}: {sizeText(rect)}</div>
      <fieldset className="pl-map-sides">
        <legend className="pl-insp-h">{t('plMapInSide')}</legend>
        {SIDES.map(([rot, key]) => (
          <label key={rot} className="pl-check">
            <input type="radio" name="pl-map-side" value={rot} checked={place.rot === rot}
              onChange={() => onPlace({ ...place, rot: rot as Rot })} />
            <span>{t(key)}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" className="pl-btn" onClick={() => onPlace(rotated(place))}>{t('plMapRotate')}</button>
      {gap(t('plMapGapRow'), 'gapRow')}
      {gap(t('plMapGapMachine'), 'gapMachine')}
      <button type="button" className="pl-btn" onClick={onOpen}>{t('plOpenStage')}</button>
    </>
  );
}

function Overview({ scene, nameOf, onPropose, onFocus }: {
  scene: Scene; nameOf: (id: string) => string; onPropose: () => void; onFocus: (r: Rect) => void;
}) {
  // Cada clique no aviso de cruzamentos leva ao próximo cruzamento.
  const [next, setNext] = useState(0);
  const n = scene.crossings.length;
  const goCrossing = () => {
    const [x, y] = scene.crossings[next % n];
    onFocus({ x, y, w: 0, h: 0 });
    setNext((next + 1) % n);
  };
  return (
    <>
      <h2 className="pl-insp-kicker">{t('plMapArea')}</h2>
      <div className="pl-insp-title">{sizeText(scene.bounds)}</div>
      <button type="button" className="pl-btn" onClick={onPropose}>{t('plMapPropose')}</button>
      <h3 className="pl-insp-h">{t('plMapWarnings')}</h3>
      {scene.overlaps.length || n
        ? (
          <ul className="pl-map-warns">
            {scene.overlaps.map(([a, b]) => (
              <li key={a + '|' + b}>
                <button type="button" onClick={() => { const r = warningRect(scene, [a, b]); if (r) onFocus(r); }}>
                  {t('plMapOverlap', nameOf(a), nameOf(b))}
                </button>
              </li>
            ))}
            {n > 0 && <li><button type="button" onClick={goCrossing}>{t('plMapCrossings', fmt(n, 0))}</button></li>}
          </ul>
        )
        : <p className="pl-note">{t('plMapNoWarnings')}</p>}
    </>
  );
}
