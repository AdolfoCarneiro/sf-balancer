// Miniatura das fileiras no painel do bloco (a Montar não mostra mais a faixa): o desenho da Planta daquele bloco, sem
// grade (esteiras por baixo das peças), cabendo em ~260 × 160 px; embaixo o modelo, as saídas ("6 saídas de 455/min · pela ponta") e "Montar
// fileiras", que abre a tela da etapa como o duplo clique no cartão.
import { useMemo } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { BlockFlow } from '../model/solve.ts';
import type { GameData, MapPlace, RecipeBlock, Stage } from '../model/types.ts';
import type { BlockGeo, Piece } from '../model/map/geo.ts';
import { blockGeo } from '../model/map/block.ts';
import { solvedStage } from '../model/solved.ts';
import { perMachine, stageRows } from '../model/stage.ts';
import { rateText } from './format.ts';

export const PREVIEW_W = 260, PREVIEW_H = 160;
// Acima disso as peças de uma mesma faixa viram um retângulo só (na miniatura elas têm menos de 1 px).
const MAX_PIECES = 1500;

// Ponto único do desenho das fileiras do bloco: hoje a fileira simples da Planta (blockGeo); com o arranjo, o geo dele.
// `block` fica na assinatura para isso.
export function rowsGeo(_block: RecipeBlock, stage: Stage, data: GameData, place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>): BlockGeo {
  return blockGeo(stage, data, place);
}

// Peças demais: junta as do mesmo tipo na mesma faixa (mesmo y e altura) num retângulo de ponta a ponta.
export function previewPieces(pieces: Piece[]): Piece[] {
  if (pieces.length <= MAX_PIECES) return pieces;
  const bands = new Map<string, Piece>();
  for (const p of pieces) {
    const k = `${p.kind}|${p.y}|${p.h}`, b = bands.get(k);
    if (!b) bands.set(k, { kind: p.kind, x: p.x, y: p.y, w: p.w, h: p.h });
    else { const x1 = Math.max(b.x + b.w, p.x + p.w); b.x = Math.min(b.x, p.x); b.w = x1 - b.x; }
  }
  return [...bands.values()];
}

// As saídas do bloco pela saída principal: "6 saídas de 455/min" ou "6 saídas de 455/min, a última de 390/min".
export function rowsLinesText(stage: Stage, data: GameData): string {
  const r = data.recipes[stage.recipe], main = r.outs[0];
  const rows = stageRows(stage, data);
  if (!main || !rows.length) return '';
  const it = data.items[main.item], per = perMachine(stage, data, main.item, 'outs');
  const n = fmt(rows.length, 0), full = rateText(it, per * rows[0]), last = rows[rows.length - 1];
  return rows.length > 1 && last !== rows[0] ? t('plRowsLinesLast', n, full, rateText(it, per * last)) : t('plRowsLines', n, full);
}

export function RowsPreview({ block: b, bf, data, place, onOpen }: {
  block: RecipeBlock; bf: BlockFlow | undefined; data: GameData; place: MapPlace; onOpen: () => void;
}) {
  // Sem máquinas (parado) ou sem limite: nada para desenhar, só o modelo e o botão.
  const ok = !!bf && !bf.unbounded && (bf.machines ?? 0) >= 1;
  const stage = useMemo(() => solvedStage(b, bf), [b, bf]);
  const geo = useMemo(() => (ok ? rowsGeo(b, stage, data, place) : null), [ok, b, stage, data, place]);
  const pieces = useMemo(() => (geo ? previewPieces(geo.pieces) : []), [geo]);
  const lines = ok ? rowsLinesText(stage, data) : '';
  return (
    <section className="pl-bp-sec pl-rows-prev" aria-labelledby="pl-bp-rows">
      <h3 className="pl-insp-h" id="pl-bp-rows">{t('plRowsTitle')}</h3>
      {geo && geo.w > 0 && geo.h > 0 && (
        <svg className="pl-rows-svg" viewBox={`0 0 ${geo.w} ${geo.h}`} width={PREVIEW_W} height={PREVIEW_H}
          preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('plRowsPreview')}>
          {geo.belts.map((l, i) => (
            <polyline key={i} className={'pl-rp-belt ' + (l.fluid ? 'pl-rp-fluid' : l.role === 'in' ? 'pl-rp-in' : 'pl-rp-out')}
              points={l.pts.map(q => q.join(',')).join(' ')} vectorEffect="non-scaling-stroke" />
          ))}
          {pieces.map((p, i) => <rect key={i} className={'pl-rp-' + p.kind} x={p.x} y={p.y} width={p.w} height={p.h} vectorEffect="non-scaling-stroke" />)}
        </svg>
      )}
      <div className="pl-rows-info">
        <b>{t('plRowsModelSimple')}</b>
        {lines && <span>{lines} · {t('plRowsExitEnd')}</span>}
      </div>
      <button type="button" className="pl-btn pl-primary" onClick={onOpen}>{t('plRowsOpen')}</button>
    </section>
  );
}
