import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { fmt, t } from '../../i18n/index.js';
import type { MeioSummary } from '../model/meio.ts';

export type MeioEdgeData = {
  meioId: string | null; itemName: string; fluid: boolean; on: boolean;
  // Só a primeira aresta de cada meio leva o botão; calc: o meio ainda está sendo calculado.
  label: MeioSummary | null; calc?: boolean; onSelect?: (id: string) => void;
};
export type MeioEdgeType = Edge<MeioEdgeData, 'meio'>;

function MeioEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<MeioEdgeType>) {
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 6 });
  const d = data!;
  const cls = 'pl-edge' + (d.fluid ? ' pl-edge-fluid' : '') + (d.on ? ' on' : '');
  const sum = d.label;
  return (
    <>
      <BaseEdge id={id} path={path} className={cls} />
      {d.calc && d.meioId && (
        <EdgeLabelRenderer>
          <div className="pl-meio nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            <button type="button" className={'pl-meio-btn pl-meio-calc' + (d.on ? ' on' : '')} aria-pressed={d.on}
              aria-label={t('plMeioAria', d.itemName, t('plMeioCalc'))} onClick={() => d.onSelect?.(d.meioId!)}>
              {t('plMeioCalc')}
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
      {sum && d.meioId && (
        <EdgeLabelRenderer>
          <div className="pl-meio nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            {sum.leftover > 1e-6 && <span className="pl-meio-note">{t('plLeft', fmt(sum.leftover))}</span>}
            {sum.short > 1e-6 && <span className="pl-meio-note pl-meio-short">{t('plShort', fmt(sum.short))}</span>}
            <button type="button" className={'pl-meio-btn' + (d.on ? ' on' : '')} aria-pressed={d.on}
              aria-label={t('plMeioAria', d.itemName, sum.tooLarge ? t('plMeioTooLargeShort') : sum.caseLabel)} onClick={() => d.onSelect?.(d.meioId!)}>
              {sum.tooLarge ? t('plMeioTooLargeShort') : sum.caseLabel}
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const MeioEdge = memo(MeioEdgeImpl);
