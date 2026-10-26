// Desenho da tela da etapa: o arranjo do bloco (Arrangement.geo) em escala, ocupando a área livre, com câmera própria
// (rodinha move; Ctrl/⌘ + rodinha ou pinça dá zoom; arrastar o fundo move; −, + e Enquadrar). Fileiras e esteiras são
// clicáveis e alcançáveis por Tab; arrastar uma fileira (ou as setas) move 8 m.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { Arrangement } from '../model/layout.ts';
import type { GameData } from '../model/types.ts';
import { previewBox } from './rowspreview.ts';
import { rateText } from './format.ts';

export type StageSel = { t: 'row'; i: number } | { t: 'belt'; key: string; row: number } | null;

const PAD = 8;              // uma fundação de folga em volta
const MARGIN = 40;          // px livres em volta ao enquadrar
const TOP = 76;             // em cima, a faixa da barra das ações da seleção
const S_MIN = 0.5, S_MAX = 40;   // px por metro
const STEP = 1.25;          // − e +
const WHEEL_ZOOM = 0.0015, LINE_PX = 16;
const DRAG_PX = 4;          // até aqui o arraste do fundo ainda é um clique
const snap = (m: number) => Math.round(m / 8) * 8;
const clampS = (s: number) => Math.max(S_MIN, Math.min(S_MAX, s));
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };

// Câmera: (x, y) = o ponto do mundo (m) no canto de cima à esquerda; s = px por metro.
interface Cam { x: number; y: number; s: number }

interface Props {
  arr: Arrangement; data: GameData; machine: string; colors: Record<string, string>;
  sel: StageSel; onSel: (s: StageSel) => void; onMove: (i: number, dx: number, dy: number) => void;
  fitKey: string;             // muda quando o desenho muda de forma (modelo, inverter, tamanho): enquadra de novo
  bottom?: number;            // px cobertos embaixo (a folha do celular na metade): enquadrar e os botões desviam
  float?: ReactNode;          // a barra das ações da seleção, por cima do desenho
}

export function StageDrawing({ arr, data, machine, colors, sel, onSel, onMove, fitKey, bottom = 0, float }: Props) {
  const geo = arr.geo;
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Cam | null>(null);
  const [drag, setDrag] = useState<{ i: number; dx: number; dy: number } | null>(null);
  const start = useRef<{ i: number; cx: number; cy: number } | null>(null);
  // Ponteiros no fundo (arrastar move; dois dedos dão zoom).
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ moved: number; pinch: number | null } | null>(null);
  const color = (item: string) => colors[item] ?? 'var(--flow)';
  const keyOf = (k: number) => `${arr.lines[k].side}:${arr.lines[k].item}`;
  const name = (item: string) => data.items[item]?.name ?? item;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setSize(s => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback((): Cam | null => {
    if (!size.w || !size.h) return null;
    const box = previewBox(geo);
    const bw = box.w + 2 * PAD, bh = box.h + 2 * PAD, top = Math.min(TOP, size.h / 4), vh = Math.max(40, size.h - top - MARGIN - bottom);
    const s = clampS(Math.min((size.w - 2 * MARGIN) / bw, vh / bh));
    return { s, x: box.x + box.w / 2 - size.w / 2 / s, y: box.y + box.h / 2 - (top + vh / 2) / s };
  }, [geo, size.w, size.h, bottom]);

  // Abre enquadrado; enquadra de novo quando o desenho muda de forma.
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (fitted.current === fitKey || !size.w) return;
    const c = fit();
    if (c) { setCam(c); fitted.current = fitKey; }
  }, [fitKey, fit, size.w]);

  // A folha subiu ou desceu: o que estava no meio continua no meio da parte que se vê (mesmo zoom).
  const lastBottom = useRef(bottom);
  useEffect(() => {
    const d = bottom - lastBottom.current;
    lastBottom.current = bottom;
    if (d) setCam(c => (c ? { ...c, y: c.y + d / 2 / c.s } : c));
  }, [bottom]);

  const zoomAt = useCallback((k: number, px: number, py: number) => setCam(c => {
    if (!c) return c;
    const s = clampS(c.s * k);
    return { s, x: c.x + px / c.s - px / s, y: c.y + py / c.s - py / s };
  }), []);

  // Rodinha: sem Ctrl move; com Ctrl/⌘ (ou pinça no touchpad, que chega como Ctrl) dá zoom no cursor.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? el.clientHeight : 1;
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) { zoomAt(Math.exp(-e.deltaY * unit * WHEEL_ZOOM), e.clientX - r.left, e.clientY - r.top); return; }
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
      setCam(c => (c ? { ...c, x: c.x + dx / c.s, y: c.y + dy / c.s } : c));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Fundo: arrastar move a câmera, dois dedos dão zoom; um toque sem arrastar tira a seleção.
  const bgDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-hit], .pl-sv-float, .pl-sv-zoom')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pan.current) pan.current = { moved: 0, pinch: null };
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pan.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      pan.current.moved = DRAG_PX + 1;
    }
  };
  const bgMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pan.current, prev = pts.current.get(e.pointerId);
    if (!p || !prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pts.current.set(e.pointerId, cur);
    if (pts.current.size >= 2 && p.pinch) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), r = wrap.current!.getBoundingClientRect();
      zoomAt(d / p.pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      p.pinch = d;
      return;
    }
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    p.moved += Math.abs(dx) + Math.abs(dy);
    if (p.moved > DRAG_PX) setCam(c => (c ? { ...c, x: c.x - dx / c.s, y: c.y - dy / c.s } : c));
  };
  const bgUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!pts.current.delete(e.pointerId)) return;
    const p = pan.current;
    if (pts.current.size === 0) {
      if (p && p.moved <= DRAG_PX && e.type === 'pointerup') onSel(null);
      pan.current = null;
    } else if (p) p.pinch = null;
  };

  const s = cam?.s ?? 1;
  const down = (e: PointerEvent<SVGRectElement>, i: number) => {
    if (e.button !== 0) return;
    onSel({ t: 'row', i });
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { i, cx: e.clientX, cy: e.clientY };
  };
  const move = (e: PointerEvent<SVGRectElement>) => {
    const st = start.current;
    if (!st) return;
    const dx = snap((e.clientX - st.cx) / s), dy = snap((e.clientY - st.cy) / s);
    if (dx !== drag?.dx || dy !== drag?.dy) setDrag({ i: st.i, dx, dy });
  };
  const up = () => {
    const st = start.current;
    start.current = null;
    if (st && drag && (drag.dx || drag.dy)) onMove(st.i, drag.dx, drag.dy);
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
  const zoomBtn = (k: number) => zoomAt(k, size.w / 2, (size.h - bottom) / 2);
  const vw = size.w / s, vh = size.h / s;

  return (
    <div className="pl-sv-canvas" ref={wrap} data-tour="stage-drawing"
      onPointerDown={bgDown} onPointerMove={bgMove} onPointerUp={bgUp} onPointerCancel={bgUp}>
      {cam && size.w > 0 && arr.rows.length > 0 && (
        <svg className="pl-sv-svg" width={size.w} height={size.h} viewBox={`${cam.x} ${cam.y} ${vw} ${vh}`} role="group" aria-label={t('plDrawAria')}>
          <defs>
            <pattern id="pl-sv-grid" width={8} height={8} patternUnits="userSpaceOnUse">
              <path d="M 8 0 L 0 0 0 8" fill="none" className="pl-sv-gridline" vectorEffect="non-scaling-stroke" />
            </pattern>
          </defs>
          <rect x={cam.x} y={cam.y} width={vw} height={vh} fill="url(#pl-sv-grid)" aria-hidden="true" />
          <g aria-hidden="true">
            {geo.pieces.filter(p => p.kind !== 'lift').map((p, k) => (
              <rect key={k} className={'pl-sv-' + p.kind} x={p.x} y={p.y} width={p.w} height={p.h} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          {arr.rows.map(r => {
            const on = sel?.t === 'row' && sel.i === r.index;
            return (
              <rect key={r.index} className={'pl-sv-row' + (on ? ' pl-on' : '')} x={r.x} y={r.y} width={r.w} height={r.h} data-hit=""
                vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-pressed={on}
                aria-label={t('plLayRowAria', String(r.index + 1), fmt(r.machines), machine)}
                onPointerDown={e => down(e, r.index)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
                onKeyDown={e => rowKey(e, r.index)} />
            );
          })}
          {geo.belts.map((b, k) => {
            const on = sel?.t === 'belt' && sel.key === keyOf(k);
            const p = b.pts.map(q => q.join(',')).join(' ');
            return (
              <g key={k} className={'pl-sv-belt' + (on ? ' pl-on' : '') + (b.fluid ? ' pl-fluid' : '')}>
                <polyline points={p} className="pl-sv-belt-line" style={{ stroke: color(b.item) }} vectorEffect="non-scaling-stroke" />
                <polyline points={p} className="pl-sv-belt-hit" vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-pressed={on} data-hit=""
                  aria-label={t('plLayBeltAria', name(b.item), b.role, fmt(arr.lines[k].machines), rateText(data.items[b.item], b.rate))}
                  onPointerDown={e => { if (e.button === 0) beltSel(k); }} onKeyDown={e => beltKey(e, k)} />
              </g>
            );
          })}
          <g aria-hidden="true">
            {geo.pieces.filter(p => p.kind === 'lift').map((p, k) => {
              const cx = p.x + p.w / 2, cy = p.y + p.h / 2, d = p.above ? -1 : 1;
              return (
                <g key={k}>
                  <rect className="pl-sv-lift" x={p.x} y={p.y} width={p.w} height={p.h} style={{ fill: color(p.item ?? '') }} vectorEffect="non-scaling-stroke" />
                  <polygon className="pl-sv-lift-arrow" points={`${cx - 0.6},${cy - 0.45 * d} ${cx + 0.6},${cy - 0.45 * d} ${cx},${cy + 0.55 * d}`} />
                </g>
              );
            })}
            {arr.rows.map(r => <text key={r.index} className="pl-sv-tag" x={r.x + 1} y={r.y + r.h / 2 + 1.1}>L{r.index + 1}</text>)}
            {ghost && <rect className="pl-sv-ghost" x={ghost.x + drag.dx} y={ghost.y + drag.dy} width={ghost.w} height={ghost.h} vectorEffect="non-scaling-stroke" />}
          </g>
        </svg>
      )}
      {float}
      <div className="pl-sv-zoom" style={bottom ? { bottom: bottom + 12 } : undefined}>
        <button type="button" className="pl-btn" aria-label={t('plSvZoomOut')} onClick={() => zoomBtn(1 / STEP)}>−</button>
        <button type="button" className="pl-btn" aria-label={t('plSvZoomIn')} onClick={() => zoomBtn(STEP)}>+</button>
        <button type="button" className="pl-btn" onClick={() => { const c = fit(); if (c) setCam(c); }}>{t('plSvFit')}</button>
      </div>
    </div>
  );
}
