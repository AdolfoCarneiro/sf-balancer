// Painel lateral do mapa: com um bloco selecionado, o painel do bloco (BlockPanel); sem seleção, a área,
// "Propor de novo" e os avisos. A lista de blocos (acessível pelo teclado) fica nos dois casos.
import { useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { Factory, GameData, MapPlace, StageId } from '../model/types.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Action } from '../model/factorystate.ts';
import type { Rect } from '../model/map/geo.ts';
import type { Scene } from '../model/map/scene.ts';
import { warningRect } from '../model/map/edit.ts';
import type { Meio } from '../model/meio.ts';
import { NumField } from './NumField.tsx';
import { blockName, sizeText } from './format.ts';
import { BlockPanel } from './BlockPanel.tsx';
import { pieceGap, validPieceGap } from '../model/map/sizes.ts';

interface Props {
  factory: Factory; flow: FlowResult; data: GameData; meioList: Meio[]; scene: Scene; places: Record<StageId, MapPlace>; selected: StageId | null;
  dispatch: (a: Action) => void; onDelete: (id: StageId) => void;
  onPlace: (id: StageId, place: MapPlace) => void; onPropose: () => void; onFocus: (r: Rect) => void;
  onPick: (id: StageId) => void; onOpenStage: (id: StageId) => void; onBlockKey: (e: React.KeyboardEvent, id: StageId) => void;
  onGap: (gap: number) => void;   // vão entre peças do meio (a fábrica toda)
}

export function MapPanel(p: Props) {
  const { factory: f, data, meioList, scene, places, selected } = p;
  const stageName = (id: StageId) => {
    const b = f.blocks.find(x => x.id === id);
    return b ? blockName(b, data) : id;
  };
  // Nome de quem aparece num aviso: o bloco, ou o meio pelo item.
  const nameOf = (id: string) => {
    const m = meioList.find(x => x.id === id);
    return m ? t('plMapMeioName', data.items[m.item]?.name ?? m.item) : stageName(id);
  };
  const block = selected ? scene.blocks.find(b => b.stage === selected) : undefined;
  const place = selected ? places[selected] : undefined;
  const selBlock = selected ? f.blocks.find(x => x.id === selected) : undefined;
  return (
    <aside className="pl-inspector" aria-label={t('plMapPanel')} id="pl-inspector">
      <div className="pl-insp">
        {block && place && selBlock
          ? <BlockPanel key={block.stage} block={selBlock} flow={p.flow} factory={f} data={data} rect={block.rect} place={place}
            onPlace={pl => p.onPlace(block.stage, pl)} onOpen={selBlock.kind === 'recipe' ? () => p.onOpenStage(block.stage) : null}
            onDelete={() => p.onDelete(block.stage)} dispatch={p.dispatch} />
          : <Overview scene={scene} nameOf={nameOf} gap={pieceGap(f)} onGap={p.onGap} onPropose={p.onPropose} onFocus={p.onFocus} />}
        <h3 className="pl-insp-h" id="pl-map-blocks">{t('plMapBlocks')}</h3>
        <p className="pl-note">{t('plMapListHint')}</p>
        <ul className="pl-map-blocks" aria-labelledby="pl-map-blocks">
          {f.blocks.map(s => (
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

function Overview({ scene, nameOf, gap, onGap, onPropose, onFocus }: {
  scene: Scene; nameOf: (id: string) => string; gap: number; onGap: (gap: number) => void; onPropose: () => void; onFocus: (r: Rect) => void;
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
      <NumField label={t('plMapPieceGap')} value={gap} valid={validPieceGap} bad={t('plMapPieceGapBad')} onCommit={onGap} />
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
