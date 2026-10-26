// Miniatura das fileiras no painel do bloco (a Montar não mostra mais a faixa): o desenho da Planta daquele bloco, sem
// grade (esteiras por baixo das peças), cabendo em ~260 × 160 px; embaixo o modelo, as saídas ("6 saídas de 455/min · pela ponta") e "Montar
// fileiras", que abre a tela da etapa como o duplo clique no cartão.
import { useMemo } from 'react';
import { t } from '../../i18n/index.js';
import type { BlockFlow } from '../model/solve.ts';
import type { GameData, MapPlace, RecipeBlock } from '../model/types.ts';
import { solvedStage } from '../model/solved.ts';
import { previewBox, previewPieces, rowsArrangement, rowsExitText, rowsLinesText, rowsModelText } from './rowspreview.ts';

export const PREVIEW_W = 260, PREVIEW_H = 160;

export function RowsPreview({ block: b, bf, data, place, onOpen }: {
  block: RecipeBlock; bf: BlockFlow | undefined; data: GameData; place: MapPlace; onOpen: () => void;
}) {
  // Sem máquinas (parado) ou sem limite: nada para desenhar, só o modelo e o botão.
  const ok = !!bf && !bf.unbounded && (bf.machines ?? 0) >= 1;
  const stage = useMemo(() => solvedStage(b, bf), [b, bf]);
  const arr = useMemo(() => rowsArrangement(stage, data, place), [stage, data, place]);
  const geo = ok ? arr.geo : null;
  const pieces = useMemo(() => (geo ? previewPieces(geo.pieces) : []), [geo]);
  const box = geo ? previewBox(geo) : null;
  const lines = ok ? rowsLinesText(arr, stage, data) : '';
  return (
    <section className="pl-bp-sec pl-rows-prev" aria-labelledby="pl-bp-rows">
      <h3 className="pl-insp-h" id="pl-bp-rows">{t('plRowsTitle')}</h3>
      {geo && box && geo.w > 0 && geo.h > 0 && (
        <svg className="pl-rows-svg" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width={PREVIEW_W} height={PREVIEW_H}
          preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('plRowsPreview')}>
          {geo.belts.map((l, i) => (
            <polyline key={i} className={'pl-rp-belt ' + (l.fluid ? 'pl-rp-fluid' : l.role === 'in' ? 'pl-rp-in' : 'pl-rp-out')}
              points={l.pts.map(q => q.join(',')).join(' ')} vectorEffect="non-scaling-stroke" />
          ))}
          {pieces.map((p, i) => <rect key={i} className={'pl-rp-' + p.kind} x={p.x} y={p.y} width={p.w} height={p.h} vectorEffect="non-scaling-stroke" />)}
        </svg>
      )}
      <div className="pl-rows-info">
        <b>{rowsModelText(arr)}</b>
        {lines && <span>{lines} · {rowsExitText(arr, stage, data)}</span>}
      </div>
      <button type="button" className="pl-btn pl-primary" onClick={onOpen}>{t('plRowsOpen')}</button>
    </section>
  );
}
