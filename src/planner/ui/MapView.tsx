// Vista do mapa: a cena em escala num canvas, com a navegação do Figma (rolar move, Ctrl/⌘ + rodinha ou pinça
// dá zoom no cursor, arrastar o fundo move) e os botões de zoom e mostrar tudo.
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { chosenAlt, type MeioResult } from '../model/meioresult.ts';
import type { Meio } from '../model/meio.ts';
import { perRowOf, stageRows } from '../model/stage.ts';
import type { Chain, GameData } from '../model/types.ts';
import { fit, pan, screenToWorld, zoomAt, type Camera } from '../model/map/camera.ts';
import type { MeioGeo } from '../model/map/geo.ts';
import { buildScene, hitTest, placesOf } from '../model/map/scene.ts';
import { FOUNDATION } from '../model/map/sizes.ts';
import { drawScene, readTheme, type DrawOpts, type MapTheme } from './mapDraw.ts';

interface Props {
  chain: Chain; data: GameData; lang: string; meioList: Meio[]; results: Map<string, MeioResult | null>;
  selected: string | null;
}

// A câmera vale para a sessão: voltar ao mapa mantém o enquadramento; a primeira abertura mostra tudo.
let sessionCam: Camera | null = null;

const WHEEL_ZOOM = 0.0015;   // o mesmo fator do workbench.js
const BUTTON_ZOOM = 1.25;
const LINE_PX = 16;

// Cor de cada item como na tela da etapa: fluido em holo; o item como entrada principal de quem consome em flow,
// como entrada secundária em held; produto que ninguém consome (saída final) em ficsit.
function itemColors(chain: Chain, data: GameData, th: MapTheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of chain.stages) {
    const r = data.recipes[s.recipe];
    if (!r) continue;
    r.ins.forEach((f, i) => { if (!out[f.item] || i === 0) out[f.item] = data.items[f.item]?.fluid ? th.holo : i === 0 ? th.flow : th.held; });
  }
  for (const s of chain.stages) {
    for (const f of data.recipes[s.recipe]?.outs ?? []) out[f.item] ??= data.items[f.item]?.fluid ? th.holo : th.ficsit;
  }
  return out;
}

export function MapView({ chain, data, lang, meioList, results, selected }: Props) {
  // A montagem escolhida de cada meio; null enquanto calcula, sem montagem ou grande demais.
  const geos = useMemo(() => {
    const g: Record<string, MeioGeo | null> = {};
    for (const m of meioList) {
      const r = results.get(m.id);
      g[m.id] = r ? r.geos[chosenAlt(r.plan, chain.alts?.[m.id]) ?? ''] ?? null : null;
    }
    return g;
  }, [meioList, results, chain.alts]);
  const scene = useMemo(() => buildScene(chain, data, placesOf(chain, data, geos), geos), [chain, data, geos]);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera | null>(sessionCam);
  const size = useRef({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [theme, setTheme] = useState<MapTheme | null>(null);

  const colors = useMemo(() => (theme ? itemColors(chain, data, theme) : {}), [chain, data, theme]);
  const opts = useMemo((): DrawOpts | null => theme && {
    // lang nas dependências: os rótulos mudam com o idioma.
    selected, hover, colors, theme,
    names: item => data.items[item]?.name ?? item,
    blockText: id => {
      const s = chain.stages.find(x => x.id === id)!, r = data.recipes[s.recipe], b = data.buildings[r.building];
      return { title: `${r.name} · ${fmt(s.machines, 0)}`, sub: t('plRowsAria', fmt(stageRows(s, data).length, 0), fmt(perRowOf(s, data), 0), b.name) };
    },
    meioText: id => {
      const r = results.get(id);
      if (r === undefined) return { title: '', sub: '' };
      if (r === null) return { title: t('plMapCalc'), sub: '' };
      if (r.plan.tooLarge) return { title: t('plMeioTooLargeShort'), sub: '' };
      const key = chosenAlt(r.plan, chain.alts?.[id]);
      const alt = r.plan.alternatives.find(a => a.key === key);
      return { title: alt?.caseLabel ?? '', sub: `${fmt(r.plan.src.lines.length, 0)} → ${fmt(r.plan.dst.lines.length, 0)}` };
    },
  }, [selected, hover, colors, theme, chain, data, results, lang]);

  // Desenho num requestAnimationFrame: vários pedidos no mesmo quadro viram um desenho só.
  const latest = useRef({ scene, opts });
  latest.current = { scene, opts };
  const frame = useRef(0);
  const draw = () => {
    frame.current = 0;
    const el = canvas.current, c = cam.current, { scene: sc, opts: o } = latest.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !c || !o || !size.current.w) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, sc, c, size.current.w, size.current.h, o);
    el.dataset.cam = `${c.x.toFixed(2)},${c.y.toFixed(2)},${c.zoom.toFixed(4)}`;
  };
  const request = () => { if (!frame.current) frame.current = requestAnimationFrame(draw); };
  const setCam = (c: Camera) => { cam.current = c; sessionCam = c; request(); };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(request, [scene, opts]);

  useEffect(() => {
    if (canvas.current) setTheme(readTheme(canvas.current));
    // Fontes chegando depois do primeiro quadro: redesenha com elas.
    document.fonts?.ready.then(request).catch(() => {});
  }, []);

  // Tamanho do canvas acompanha a área (em px de tela de alta densidade); a primeira abertura enquadra tudo.
  const boundsRef = useRef(scene.bounds);
  boundsRef.current = scene.bounds;
  useEffect(() => {
    const box = wrap.current, el = canvas.current;
    if (!box || !el) return;
    const resize = () => {
      const w = box.clientWidth, h = box.clientHeight, dpr = window.devicePixelRatio || 1;
      size.current = { w, h };
      el.width = Math.max(1, Math.round(w * dpr)); el.height = Math.max(1, Math.round(h * dpr));
      if (!cam.current && w && h) setCam(fit(boundsRef.current, w, h));
      request();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // Rodinha: sem Ctrl move; com Ctrl/⌘ (ou pinça no touchpad, que chega como Ctrl) dá zoom no cursor.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const c = cam.current;
      if (!c) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? size.current.h : 1;
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setCam(zoomAt(c, Math.exp(-e.deltaY * unit * WHEEL_ZOOM), e.clientX - r.left, e.clientY - r.top));
      else setCam(pan(c, (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Arrastar o fundo move o mapa; sem arrastar, o ponteiro marca o que está embaixo.
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const local = (e: React.PointerEvent) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current, c = cam.current;
    if (!c) return;
    if (d && d.id === e.pointerId) {
      setCam(pan(c, d.x - e.clientX, d.y - e.clientY));
      d.x = e.clientX; d.y = e.clientY;
      return;
    }
    const [x, y] = local(e), [wx, wy] = screenToWorld(c, x, y);
    const hit = hitTest(scene, wx, wy)?.id ?? null;
    if (hit !== hover) setHover(hit);
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  const zoomCenter = (f: number) => { const c = cam.current; if (c) setCam(zoomAt(c, f, size.current.w / 2, size.current.h / 2)); };
  const showAll = () => { if (size.current.w) setCam(fit(scene.bounds, size.current.w, size.current.h)); };

  const b = scene.bounds;
  const area = t('plMapSize', fmt(b.w, 0), fmt(b.h, 0), fmt(Math.ceil(b.w / FOUNDATION - 1e-9), 0), fmt(Math.ceil(b.h / FOUNDATION - 1e-9), 0));
  return (
    <div className="pl-map" ref={wrap}>
      <canvas ref={canvas} className={'pl-map-canvas' + (dragging ? ' grabbing' : hover ? ' over' : '')} role="img"
        aria-label={t('plMapAria', fmt(chain.stages.length, 0), area)}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onPointerLeave={() => { if (!drag.current && hover) setHover(null); }} />
      <p className="pl-map-hint">{t('plMapHint')}</p>
      <div className="pl-map-ctrl" role="group" aria-label={t('plMapControls')}>
        <button type="button" className="pl-btn" onClick={() => zoomCenter(BUTTON_ZOOM)} aria-label={t('plMapZoomIn')} title={t('plMapZoomIn')}>+</button>
        <button type="button" className="pl-btn" onClick={() => zoomCenter(1 / BUTTON_ZOOM)} aria-label={t('plMapZoomOut')} title={t('plMapZoomOut')}>−</button>
        <button type="button" className="pl-btn" onClick={showAll} aria-label={t('plMapFit')} title={t('plMapFit')}>{t('plMapFit')}</button>
      </div>
    </div>
  );
}
