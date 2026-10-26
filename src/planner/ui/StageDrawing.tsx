// Desenho da tela da etapa: o arranjo do bloco (Arrangement.geo) em escala, 1 m = 4 px, grade de 8 m. Fileiras e
// esteiras são clicáveis e alcançáveis por Tab; arrastar uma fileira (ou as setas) move 8 m.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { Arrangement } from '../model/layout.ts';
import type { GameData } from '../model/types.ts';
import { previewBox } from './rowspreview.ts';
import { rateText } from './format.ts';

export type StageSel = { t: 'row'; i: number } | { t: 'belt'; key: string; row: number } | null;

const PX = 4;     // 1 m = 4 px
const PAD = 8;    // uma fundação de folga em volta
const snap = (m: number) => Math.round(m / 8) * 8;
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };

interface Props {
  arr: Arrangement; data: GameData; machine: string; colors: Record<string, string>;
  sel: StageSel; onSel: (s: StageSel) => void; onMove: (i: number, dx: number, dy: number) => void;
}

export function StageDrawing({ arr, data, machine, colors, sel, onSel, onMove }: Props) {
  const geo = arr.geo, box = previewBox(geo);
  const x0 = Math.floor(box.x / 8) * 8 - PAD, y0 = Math.floor(box.y / 8) * 8 - PAD;
  const w = Math.ceil((box.x + box.w) / 8) * 8 + PAD - x0, h = Math.ceil((box.y + box.h) / 8) * 8 + PAD - y0;
  const [drag, setDrag] = useState<{ i: number; dx: number; dy: number } | null>(null);
  const start = useRef<{ i: number; cx: number; cy: number } | null>(null);
  const color = (item: string) => colors[item] ?? 'var(--flow)';
  const keyOf = (k: number) => `${arr.lines[k].side}:${arr.lines[k].item}`;
  const name = (item: string) => data.items[item]?.name ?? item;

  const down = (e: PointerEvent<SVGRectElement>, i: number) => {
    if (e.button !== 0) return;
    onSel({ t: 'row', i });
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { i, cx: e.clientX, cy: e.clientY };
  };
  const move = (e: PointerEvent<SVGRectElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = snap((e.clientX - s.cx) / PX), dy = snap((e.clientY - s.cy) / PX);
    if (dx !== drag?.dx || dy !== drag?.dy) setDrag({ i: s.i, dx, dy });
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (s && drag && (drag.dx || drag.dy)) onMove(s.i, drag.dx, drag.dy);
    setDrag(null);
  };
  // Cancelado (o navegador tomou o gesto): a fileira fica onde estava.
  const cancel = () => { start.current = null; setDrag(null); };
  const rowKey = (e: KeyboardEvent<SVGRectElement>, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSel({ t: 'row', i }); return; }
    const d = ARROWS[e.key];
    if (d) { e.preventDefault(); onSel({ t: 'row', i }); onMove(i, d[0], d[1]); }
  };
  const beltSel = (k: number) => onSel({ t: 'belt', key: keyOf(k), row: arr.lines[k].rows[0] });
  const beltKey = (e: KeyboardEvent<SVGPolylineElement>, k: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); beltSel(k); }
  };
  const ghost = drag && arr.rows.find(r => r.index === drag.i);

  return (
    <svg className="pl-sv-svg" width={w * PX} height={h * PX} viewBox={`${x0} ${y0} ${w} ${h}`} role="group" aria-label={t('plDrawAria')}>
      <defs>
        <pattern id="pl-sv-grid" width={8} height={8} patternUnits="userSpaceOnUse">
          <path d="M 8 0 L 0 0 0 8" fill="none" className="pl-sv-gridline" />
        </pattern>
      </defs>
      <rect x={x0} y={y0} width={w} height={h} fill="url(#pl-sv-grid)" aria-hidden="true" onPointerDown={() => onSel(null)} />
      <g aria-hidden="true">
        {geo.pieces.filter(p => p.kind !== 'lift').map((p, k) => (
          <rect key={k} className={'pl-sv-' + p.kind} x={p.x} y={p.y} width={p.w} height={p.h} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {arr.rows.map(r => {
        const on = sel?.t === 'row' && sel.i === r.index;
        return (
          <rect key={r.index} className={'pl-sv-row' + (on ? ' pl-on' : '')} x={r.x} y={r.y} width={r.w} height={r.h}
            vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-pressed={on}
            aria-label={t('plLayRowAria', String(r.index + 1), fmt(r.machines), machine)}
            onPointerDown={e => down(e, r.index)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
            onKeyDown={e => rowKey(e, r.index)} />
        );
      })}
      {geo.belts.map((b, k) => {
        const on = sel?.t === 'belt' && sel.key === keyOf(k);
        const pts = b.pts.map(q => q.join(',')).join(' ');
        return (
          <g key={k} className={'pl-sv-belt' + (on ? ' pl-on' : '') + (b.fluid ? ' pl-fluid' : '')}>
            <polyline points={pts} className="pl-sv-belt-line" style={{ stroke: color(b.item) }} vectorEffect="non-scaling-stroke" />
            <polyline points={pts} className="pl-sv-belt-hit" vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-pressed={on}
              aria-label={t('plLayBeltAria', name(b.item), b.role, fmt(arr.lines[k].machines), rateText(data.items[b.item], b.rate))}
              onPointerDown={e => { if (e.button === 0) beltSel(k); }} onKeyDown={e => beltKey(e, k)} />
          </g>
        );
      })}
      <g aria-hidden="true">
        {geo.pieces.filter(p => p.kind === 'lift').map((p, k) => {
          const cx = p.x + p.w / 2, cy = p.y + p.h / 2, s = p.above ? -1 : 1;
          return (
            <g key={k}>
              <rect className="pl-sv-lift" x={p.x} y={p.y} width={p.w} height={p.h} style={{ fill: color(p.item ?? '') }} vectorEffect="non-scaling-stroke" />
              <polygon className="pl-sv-lift-arrow" points={`${cx - 0.6},${cy - 0.45 * s} ${cx + 0.6},${cy - 0.45 * s} ${cx},${cy + 0.55 * s}`} />
            </g>
          );
        })}
        {arr.rows.map(r => <text key={r.index} className="pl-sv-tag" x={r.x + 1} y={r.y + r.h / 2 + 1.1}>L{r.index + 1}</text>)}
        {ghost && <rect className="pl-sv-ghost" x={ghost.x + drag.dx} y={ghost.y + drag.dy} width={ghost.w} height={ghost.h} vectorEffect="non-scaling-stroke" />}
      </g>
    </svg>
  );
}
