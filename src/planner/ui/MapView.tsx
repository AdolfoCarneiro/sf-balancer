// Vista do mapa: a cena em escala num canvas, com a navegação do Figma (rolar move, Ctrl/⌘ + rodinha ou pinça
// dá zoom no cursor, arrastar o fundo move) e os botões de zoom e mostrar tudo. Clicar seleciona, arrastar um bloco
// o muda de lugar (preso na grade), duplo clique abre a etapa; o painel ao lado gira, ajusta vãos e lista os avisos.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { chosenAlt, type MeioResult } from '../model/meioresult.ts';
import type { Meio } from '../model/meio.ts';
import { perRowOf, stageRows } from '../model/stage.ts';
import type { Chain, GameData, MapPlace, StageId } from '../model/types.ts';
import type { Action } from '../model/persist.ts';
import { centerOn, fit, pan, screenToWorld, zoomAt, type Camera } from '../model/map/camera.ts';
import type { MeioGeo, Rect } from '../model/map/geo.ts';
import { buildScene, hitTest, placesOf, proposeMap } from '../model/map/scene.ts';
import { dragged, nudged, rotated, withPlace } from '../model/map/edit.ts';
import { drawScene, readTheme, type DrawOpts, type MapTheme } from './mapDraw.ts';
import { MapPanel } from './MapPanel.tsx';
import { sizeText } from './format.ts';
import type { Selection } from './selection.ts';

interface Props {
  chain: Chain; data: GameData; lang: string; meioList: Meio[]; results: Map<string, MeioResult | null>;
  selection: Selection; onSelect: (s: Selection) => void; onOpenStage: (id: string) => void; dispatch: (a: Action) => void;
  inspector: ReactNode;   // o painel da cadeia, mostrado com um meio selecionado
}

// A câmera vale para a sessão: voltar ao mapa mantém o enquadramento; a primeira abertura mostra tudo.
// camMoved: o usuário já mexeu na câmera (aí ela não reenquadra sozinha quando os meios chegam).
let sessionCam: Camera | null = null;
let camMoved = false, refitted = false;

const WHEEL_ZOOM = 0.0015;   // o mesmo fator do workbench.js
const BUTTON_ZOOM = 1.25;
const LINE_PX = 16;
const CLICK_PX = 4;
const HINT_STORE = 'sf-balancer:planner-map-hint';   // até aqui o ponteiro só clicou; passou disso, arrasta

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

export function MapView({ chain, data, lang, meioList, results, selection, onSelect, onOpenStage, dispatch, inspector }: Props) {
  const selected = selection?.id ?? null;
  const selStage = selection?.kind === 'stage' ? selection.id : null;
  // A montagem escolhida de cada meio; null enquanto calcula, sem montagem ou grande demais.
  const geos = useMemo(() => {
    const g: Record<string, MeioGeo | null> = {};
    for (const m of meioList) {
      const r = results.get(m.id);
      g[m.id] = r ? r.geos[chosenAlt(r.plan, chain.alts?.[m.id]) ?? ''] ?? null : null;
    }
    return g;
  }, [meioList, results, chain.alts]);
  // Posições mostradas: as salvas e, para quem não tem, a derivada (que pode mudar quando os meios chegam). Arrastando,
  // o bloco usa a posição provisória (a cena é refeita sem recalcular meio).
  const basePlaces = useMemo(() => placesOf(chain, data, geos), [chain, data, geos]);
  const [moving, setMoving] = useState<{ id: StageId; place: MapPlace } | null>(null);
  const places = useMemo(() => (moving ? withPlace(basePlaces, moving.id, moving.place) : basePlaces), [basePlaces, moving]);
  const scene = useMemo(() => buildScene(chain, data, places, geos), [chain, data, places, geos]);
  // Toda edição grava todas as posições de uma vez: o mapa inteiro fica fixo num passo só do desfazer.
  const place = (id: StageId, p: MapPlace) => dispatch({ type: 'setPlaces', places: withPlace(basePlaces, id, p) });
  const propose = () => dispatch({ type: 'setPlaces', places: proposeMap(chain, data, geos) });

  // A dica de navegação fica até ser fechada (lembrado neste navegador).
  const [hint, setHint] = useState(() => { try { return localStorage.getItem(HINT_STORE) !== '0'; } catch { return true; } });
  const hideHint = () => { setHint(false); try { localStorage.setItem(HINT_STORE, '0'); } catch { /* sem storage */ } };

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
  const moveCam = (c: Camera) => { camMoved = true; setCam(c); };
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

  // Os meios chegaram (o tamanho deles muda a cena): reenquadra uma vez, se ninguém mexeu na câmera.
  const ready = meioList.every(m => results.get(m.id) !== null);
  useEffect(() => {
    if (!ready || refitted) return;
    refitted = true;
    if (!camMoved && size.current.w) setCam(fit(boundsRef.current, size.current.w, size.current.h));
  }, [ready]);

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
      if (e.ctrlKey || e.metaKey) moveCam(zoomAt(c, Math.exp(-e.deltaY * unit * WHEEL_ZOOM), e.clientX - r.left, e.clientY - r.top));
      else moveCam(pan(c, (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Arrastar um bloco o muda de lugar; arrastar o resto move o mapa; sem arrastar, é um clique (seleciona) e o ponteiro
  // marca o que está embaixo.
  const drag = useRef<{
    id: number; button: number; x0: number; y0: number; x: number; y: number; moved: boolean;
    hit: ReturnType<typeof hitTest>; from: MapPlace | null; to: MapPlace | null;
  } | null>(null);
  const [dragging, setDragging] = useState<'pan' | 'block' | null>(null);
  const local = (e: React.PointerEvent) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hitAt = (e: React.PointerEvent) => {
    const c = cam.current;
    if (!c) return null;
    const [x, y] = local(e), [wx, wy] = screenToWorld(c, x, y);
    return hitTest(scene, wx, wy);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = e.button === 0 ? hitAt(e) : null;
    const from = hit?.kind === 'block' ? basePlaces[hit.id] ?? null : null;
    drag.current = { id: e.pointerId, button: e.button, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, hit, from, to: null };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current, c = cam.current;
    if (!c) return;
    if (d && d.id === e.pointerId) {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_PX) return;
        d.moved = true;
        setDragging(d.from ? 'block' : 'pan');
      }
      if (d.from && d.hit) {
        const p = dragged(d.from, (e.clientX - d.x0) / c.zoom, (e.clientY - d.y0) / c.zoom), id = d.hit.id;
        d.to = p;
        setMoving(m => (m && m.id === id && m.place.x === p.x && m.place.y === p.y ? m : { id, place: p }));
      } else {
        moveCam(pan(c, d.x - e.clientX, d.y - e.clientY));
      }
      d.x = e.clientX; d.y = e.clientY;
      return;
    }
    const hit = hitAt(e)?.id ?? null;
    if (hit !== hover) setHover(hit);
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>, cancel = false) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(null);
    setMoving(null);
    if (cancel) return;
    if (!d.moved) {
      if (d.button === 0) onSelect(d.hit ? { kind: d.hit.kind === 'block' ? 'stage' : 'meio', id: d.hit.id } : null);
      return;
    }
    if (d.from && d.hit) {
      if (d.to && (d.to.x !== d.from.x || d.to.y !== d.from.y)) place(d.hit.id, d.to);
      onSelect({ kind: 'stage', id: d.hit.id });
    }
  };
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = cam.current;
    if (!c) return;
    const r = e.currentTarget.getBoundingClientRect(), [wx, wy] = screenToWorld(c, e.clientX - r.left, e.clientY - r.top);
    const hit = hitTest(scene, wx, wy);
    if (hit?.kind === 'block') onOpenStage(hit.id);
  };

  // Teclado no bloco (na lista do painel ou no canvas): setas movem 8 m, R gira, Enter abre a etapa, Esc solta.
  const blockKey = (e: React.KeyboardEvent, id: StageId | null) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { if (selection) { e.preventDefault(); onSelect(null); } return; }
    if (!id || !basePlaces[id]) return;
    const cur = basePlaces[id];
    if (e.key === 'Enter') { e.preventDefault(); onOpenStage(id); return; }
    const next = e.key === 'r' || e.key === 'R' ? rotated(cur) : nudged(cur, e.key);
    if (!next) return;
    e.preventDefault();
    if (selStage !== id) onSelect({ kind: 'stage', id });
    place(id, next);
  };

  // Aviso clicado no painel: a câmera vai até ele.
  const focus = (r: Rect) => { const c = cam.current; if (c && size.current.w) moveCam(centerOn(c, r, size.current.w, size.current.h)); };

  const zoomCenter = (f: number) => { const c = cam.current; if (c) moveCam(zoomAt(c, f, size.current.w / 2, size.current.h / 2)); };
  const showAll = () => { if (size.current.w) moveCam(fit(scene.bounds, size.current.w, size.current.h)); };

  const area = sizeText(scene.bounds);
  return (
    <>
      <main className="pl-center" id="pl-graph" tabIndex={-1} aria-label={t('plViewMap')}>
        <div className="pl-map" ref={wrap}>
          <canvas ref={canvas} tabIndex={0} role="img"
            className={'pl-map-canvas' + (dragging === 'pan' ? ' grabbing' : dragging === 'block' ? ' moving' : hover ? ' over' : '')}
            aria-label={t('plMapAria', fmt(chain.stages.length, 0), area)}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={e => endDrag(e)} onPointerCancel={e => endDrag(e, true)}
            onPointerLeave={() => { if (!drag.current && hover) setHover(null); }} onDoubleClick={onDoubleClick}
            onKeyDown={e => blockKey(e, selStage)} />
          {hint && (
            <p className="pl-map-hint">
              <span>{t('plMapHint')}</span>
              <button type="button" onClick={hideHint} aria-label={t('plMapHintClose')} title={t('plMapHintClose')}>×</button>
            </p>
          )}
          <div className="pl-map-ctrl" role="group" aria-label={t('plMapControls')}>
            <button type="button" className="pl-btn" onClick={() => zoomCenter(BUTTON_ZOOM)} aria-label={t('plMapZoomIn')} title={t('plMapZoomIn')}>+</button>
            <button type="button" className="pl-btn" onClick={() => zoomCenter(1 / BUTTON_ZOOM)} aria-label={t('plMapZoomOut')} title={t('plMapZoomOut')}>−</button>
            <button type="button" className="pl-btn" onClick={showAll} aria-label={t('plMapFit')} title={t('plMapFit')}>{t('plMapFit')}</button>
          </div>
        </div>
      </main>
      {selection?.kind === 'meio'
        ? inspector
        : <MapPanel chain={chain} data={data} meioList={meioList} scene={scene} places={places} selected={selStage}
          onPlace={place} onPropose={propose} onFocus={focus} onPick={id => onSelect({ kind: 'stage', id })}
          onOpenStage={onOpenStage} onBlockKey={blockKey} onGap={gap => dispatch({ type: 'setMapGap', gap })} />}
    </>
  );
}
