// Vista do mapa: a cena em escala num canvas, com a navegação do Figma (rolar move, Ctrl/⌘ + rodinha ou pinça
// dá zoom no cursor, arrastar o fundo move) e os botões de zoom e mostrar tudo. Clicar seleciona, arrastar um bloco ou
// uma ligação o muda de lugar (preso na grade), duplo clique abre o bloco; o painel ao lado gira, ajusta vãos e lista
// os avisos. Montar como no Modeler: duplo clique ou botão direito no vazio abre o seletor ali; arrastar de uma porta
// liga (soltando numa porta) ou cria o próximo bloco já ligado (soltando no vazio); Delete apaga o bloco.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { chosenAlt, chosenGeo, type MeioResult } from '../model/meioresult.ts';
import type { Meio } from '../model/meio.ts';
import { perRowOf, stageRows } from '../model/stage.ts';
import { solvedStage } from '../model/solved.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Factory, GameData, ItemId, LigPlace, MapPlace, StageId } from '../model/types.ts';
import type { Action } from '../model/factorystate.ts';
import { centerOn, fit, pan, screenToWorld, zoomAt, type Camera } from '../model/map/camera.ts';
import type { MeioGeo, Pt, Rect } from '../model/map/geo.ts';
import { buildScene, hitTest, placesOf, proposeMap } from '../model/map/scene.ts';
import { dragged, ligDragged, ligRotated, nudged, rotated, withPlace } from '../model/map/edit.ts';
import { dropTarget, portAt, scenePorts, type ScenePort } from '../model/map/ports.ts';
import { nextBlockId } from '../model/factory.ts';
import type { PickerEntry, PickerFilter } from '../model/picker.ts';
import { Picker } from './Picker.tsx';
import { iconImage } from './icons.ts';
import { PORT_ZOOM, drawScene, readTheme, type DrawOpts, type MapTheme } from './mapDraw.ts';
import { MapPanel } from './MapPanel.tsx';
import { badgeText, blockIcon, blockName, rateText, sizeText } from './format.ts';
import { blockBadges, type Badge } from '../model/badges.ts';
import type { Selection } from './selection.ts';

interface Props {
  factory: Factory; flow: FlowResult; data: GameData; lang: string; meioList: Meio[]; results: Map<string, MeioResult | null>;
  selection: Selection; onSelect: (s: Selection) => void; onOpenStage: (id: string) => void; dispatch: (a: Action) => void;
  onOpenLig: (id: string) => void;   // abre o modal da ligação
}

// A câmera vale para a sessão: voltar ao mapa mantém o enquadramento; a primeira abertura mostra tudo.
// camMoved: o usuário já mexeu na câmera (aí ela não reenquadra sozinha quando os meios chegam).
let sessionCam: Camera | null = null;
let camMoved = false, refitted = false;

// Mapa vazio: a origem no centro, de perto (enquadrar um retângulo vazio daria o zoom máximo).
const EMPTY_ZOOM = 2;
const fitAll = (b: Rect, w: number, h: number): Camera =>
  (b.w || b.h ? fit(b, w, h) : { x: -w / 2 / EMPTY_ZOOM, y: -h / 2 / EMPTY_ZOOM, zoom: EMPTY_ZOOM });

const WHEEL_ZOOM = 0.0015;   // o mesmo fator do workbench.js
const BUTTON_ZOOM = 1.25;
const LINE_PX = 16;
const CLICK_PX = 4;   // até aqui o ponteiro só clicou; passou disso, arrasta
const HINT_STORE = 'sf-balancer:planner-map-hint';
const LEGEND_STORE = 'sf-balancer:planner-legend';   // legenda aberta ou fechada (lembrado neste navegador)
const PORT_PX = 8;   // raio de pegar uma porta, em px de tela
// Gancho de teste (tests/visual/smoke.js): a cena, a câmera e as portas do último quadro em window.__sfPlanner; só com
// ?debug=1 ou no servidor de desenvolvimento.
const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).get('debug') === '1';
const NOTICE_MS = 3500;
const WHY = { self: 'plLinkWhySelf', item: 'plLinkWhyItem', dup: 'plLinkWhyDup', fluidSink: 'plLinkWhyFluidSink' } as const;
export const portKey = (p: ScenePort): string => `${p.block}|${p.side}|${p.item}`;

// Seletor aberto: onde (tela e mundo) e, vindo de uma porta, o filtro e a porta que o bloco novo liga.
interface PickerAt { x: number; y: number; at: Pt; filter?: PickerFilter; port?: { block: StageId; item: ItemId; side: 'in' | 'out' } }

// Cor de cada item como na tela da etapa: fluido em holo; o item como entrada principal de quem consome em flow,
// como entrada secundária em held; produto que ninguém consome (saída final) e o que sai das origens em ficsit.
function itemColors(f: Factory, data: GameData, th: MapTheme): Record<string, string> {
  const out: Record<string, string> = {};
  const fluid = (item: string) => !!data.items[item]?.fluid;
  for (const b of f.blocks) {
    if (b.kind !== 'recipe') continue;
    const r = data.recipes[b.recipe];
    if (!r) continue;
    r.ins.forEach((x, i) => { if (!out[x.item] || i === 0) out[x.item] = fluid(x.item) ? th.holo : i === 0 ? th.flow : th.held; });
  }
  for (const b of f.blocks) {
    const outs = b.kind === 'recipe' ? (data.recipes[b.recipe]?.outs ?? []).map(x => x.item) : b.kind === 'miner' || b.kind === 'extractor' ? [b.item] : [];
    for (const item of outs) out[item] ??= fluid(item) ? th.holo : th.ficsit;
  }
  return out;
}

export function MapView({ factory: f, flow, data, lang, meioList, results, selection, onSelect, onOpenStage, dispatch, onOpenLig }: Props) {
  const selected = selection?.id ?? null;
  const selStage = selection?.kind === 'stage' ? selection.id : null;
  // A montagem escolhida de cada meio; null enquanto calcula, sem montagem, sem limite ou grande demais.
  const geos = useMemo(() => {
    const g: Record<string, MeioGeo | null> = {};
    for (const m of meioList) {
      const r = results.get(m.id);
      g[m.id] = r ? chosenGeo(r, f.alts?.[m.id]) : null;
    }
    return g;
  }, [meioList, results, f.alts]);
  // Posições mostradas: as salvas e, para quem não tem, a derivada (que pode mudar quando os meios chegam). Arrastando,
  // o bloco ou a ligação usa a posição provisória (a cena é refeita sem recalcular meio nem fluxo).
  const basePlaces = useMemo(() => placesOf(f, data, geos, flow), [f, data, geos, flow]);
  const [moving, setMoving] = useState<{ kind: 'block'; id: StageId; place: MapPlace } | { kind: 'meio'; id: string; place: LigPlace } | null>(null);
  const places = useMemo(() => (moving?.kind === 'block' ? withPlace(basePlaces, moving.id, moving.place) : basePlaces), [basePlaces, moving]);
  const shown = useMemo(() => (moving?.kind === 'meio' ? { ...f, ligs: { ...f.ligs, [moving.id]: moving.place } } : f), [f, moving]);
  const scene = useMemo(() => buildScene(shown, data, places, geos, flow), [shown, data, places, geos, flow]);
  const ports = useMemo(() => scenePorts(scene, f, data), [scene, f, data]);
  // Montar: seletor aberto, porta sendo puxada (com a ponta no ponteiro), porta sob o ponteiro e o aviso de não ligou.
  const [picker, setPicker] = useState<PickerAt | null>(null);
  const [wire, setWire] = useState<{ from: ScenePort; to: Pt } | null>(null);
  const [hoverPort, setHoverPort] = useState<ScenePort | null>(null);
  const [notice, setNotice] = useState<(typeof WHY)[keyof typeof WHY] | null>(null);   // a chave: o texto segue o idioma
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);
  // As portas que aceitam a puxada acendem (calculado uma vez por arraste).
  const wireFrom = wire?.from ?? null;
  const lit = useMemo(() => new Set(wireFrom ? ports.filter(p => dropTarget(f, data, wireFrom, p).kind === 'connect').map(portKey) : []),
    [wireFrom, ports, f, data]);
  // Toda edição grava todas as posições de uma vez: o mapa inteiro fica fixo num passo só do desfazer.
  const place = (id: StageId, p: MapPlace) => dispatch({ type: 'setPlaces', places: withPlace(basePlaces, id, p) });
  const propose = () => dispatch({ type: 'setPlaces', places: proposeMap(f, data, geos, flow) });
  const placeLig = (id: string, p: LigPlace | null) => dispatch({ type: 'placeLig', meio: id, place: p });
  // Onde a ligação está agora (posta ou colada): o canto do retângulo e o giro, como na cena.
  const ligAt = (id: string): LigPlace | null => {
    const m = scene.meios.find(x => x.meio === id);
    return m ? { x: m.rect.x, y: m.rect.y, rot: m.rot } : null;
  };

  // A dica de navegação fica até ser fechada (lembrado neste navegador).
  const [hint, setHint] = useState(() => { try { return localStorage.getItem(HINT_STORE) !== '0'; } catch { return true; } });
  const hideHint = () => { setHint(false); try { localStorage.setItem(HINT_STORE, '0'); } catch { /* sem storage */ } };

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera | null>(sessionCam);
  const size = useRef({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [theme, setTheme] = useState<MapTheme | null>(null);

  const colors = useMemo(() => (theme ? itemColors(f, data, theme) : {}), [f, data, theme]);
  // Avisos do fluxo de cada bloco (mudam só com o fluxo).
  const badges = useMemo(() => {
    const m = new Map<StageId, Badge[]>();
    for (const b of f.blocks) { const bf = flow.blocks[b.id]; m.set(b.id, bf ? blockBadges(bf, flow) : []); }
    return m;
  }, [f.blocks, flow]);
  // Ícone pronto para o canvas, ou null; o que ainda carrega pede outro desenho quando chegar.
  const redraw = useRef<() => void>(() => {});
  const loading = useRef(new Set<string>());
  const icon = useCallback((id: string): HTMLImageElement | null => {
    const img = iconImage(id);
    if (!img) return null;
    if (img.complete) return img.naturalWidth ? img : null;
    if (!loading.current.has(id)) { loading.current.add(id); img.addEventListener('load', () => redraw.current(), { once: true }); }
    return null;
  }, []);
  const opts = useMemo((): DrawOpts | null => theme && {
    // lang nas dependências: os rótulos mudam com o idioma.
    selected, hover, colors, theme,
    ports, portHover: hoverPort ? portKey(hoverPort) : null, wire: wire && { from: wire.from, to: wire.to, lit }, icon,
    names: item => data.items[item]?.name ?? item,
    badges: id => badges.get(id) ?? [],
    badgeLabel: (id, x) => { const b = f.blocks.find(y => y.id === id); return b ? badgeText(x, b, data, false) : ''; },
    blockText: id => {
      const b = f.blocks.find(x => x.id === id)!, bf = flow.blocks[id], icon = blockIcon(b, data);
      // Travado: o motivo à parte (o canvas decide onde ele aparece); loop travado no título.
      const bs = badges.get(id) ?? [], stall = bs.find(x => x.kind === 'stalled');
      const alert = stall ? badgeText(stall, b, data, true) : '';
      const lock = bs.some(x => x.kind === 'deadlock') ? ` · ${t('plDeadlockShort')}` : '';
      if (b.kind !== 'recipe') {
        // Origem: o que sai; sobra: o que chega, por item.
        const n = b.kind === 'extractor' ? bf?.extractors : undefined;
        const title = blockName(b, data) + (typeof n === 'number' ? ` × ${fmt(n, 0)}` : '');
        const ports = (b.kind === 'miner' || b.kind === 'extractor' ? bf?.outs : bf?.ins) ?? [];
        const sub = ports.map(p => (p.rate === null ? t('plUnbounded') : rateText(data.items[p.item], p.rate))).join(' · ');
        return { title: (bf?.unbounded ? `${title} · ${t('plUnbounded')}` : title) + lock, sub, icon, alert };
      }
      const s = solvedStage(b, bf), r = data.recipes[s.recipe], bd = data.buildings[r.building];
      const count = bf?.unbounded ? t('plUnbounded') : fmt(s.machines, 0);
      const sub = t('plRowsAria', fmt(stageRows(s, data).length, 0), fmt(perRowOf(s, data), 0), bd.name);
      return { title: `${r.name} · ${count}${lock}`, sub, icon, alert };
    },
    meioText: id => {
      const r = results.get(id), m = meioList.find(x => x.id === id), icon = m?.item ?? null;
      if (r === undefined) return { title: '', sub: '', icon: null };
      if (r === null) return { title: t('plMapCalc'), sub: '', icon };
      if (r.plan.unbounded) return { title: t('plUnbounded'), sub: '', icon };
      if (r.plan.tooLarge) return { title: t('plMeioTooLargeShort'), sub: '', icon };
      const lines = `${fmt(r.plan.src.lines.length, 0)} → ${fmt(r.plan.direct ? r.plan.src.lines.length : r.plan.dst.lines.length, 0)}`;
      if (r.plan.direct) return { title: m ? m.consumers.map(c => { const b = f.blocks.find(x => x.id === c); return b ? blockName(b, data) : c; }).join(', ') : '', sub: lines, icon };
      const key = chosenAlt(r.plan, f.alts?.[id]);
      const alt = r.plan.alternatives.find(a => a.key === key);
      return { title: alt?.caseLabel ?? '', sub: lines, icon };
    },
  }, [selected, hover, colors, theme, f, flow, data, results, meioList, lang, ports, hoverPort, wire, lit, badges]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Desenho num requestAnimationFrame: vários pedidos no mesmo quadro viram um desenho só.
  const latest = useRef({ scene, opts, ports });
  latest.current = { scene, opts, ports };
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
    if (DEBUG) (window as unknown as { __sfPlanner: unknown }).__sfPlanner = { scene: sc, cam: c, ports: latest.current.ports };
  };
  const request = () => { if (!frame.current) frame.current = requestAnimationFrame(draw); };
  redraw.current = request;
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
      if (!cam.current && w && h) setCam(fitAll(boundsRef.current, w, h));
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
    if (!camMoved && size.current.w) setCam(fitAll(boundsRef.current, size.current.w, size.current.h));
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

  // Arrastar uma porta puxa uma esteira; arrastar um bloco o muda de lugar; arrastar o resto move o mapa; sem arrastar,
  // é um clique (seleciona) e o ponteiro marca o que está embaixo.
  const drag = useRef<{
    id: number; button: number; x0: number; y0: number; x: number; y: number; moved: boolean;
    hit: ReturnType<typeof hitTest>; from: LigPlace | null; to: LigPlace | null; port: ScenePort | null;
  } | null>(null);
  const [dragging, setDragging] = useState<'pan' | 'block' | 'link' | null>(null);
  const local = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as Pt;
  };
  const worldAt = (e: { clientX: number; clientY: number; currentTarget: Element }): Pt | null => {
    const c = cam.current;
    if (!c) return null;
    const [x, y] = local(e);
    return screenToWorld(c, x, y);
  };
  const hitAt = (e: React.PointerEvent | React.MouseEvent) => {
    const w = worldAt(e);
    return w ? hitTest(scene, w[0], w[1]) : null;
  };
  const portUnder = (e: React.PointerEvent) => {
    const w = worldAt(e), c = cam.current;
    // De longe as portas não aparecem: a borda do bloco volta a mover o bloco.
    return w && c && c.zoom >= PORT_ZOOM ? portAt(ports, w[0], w[1], PORT_PX / c.zoom) : null;
  };
  // Seletor no ponto da tela (px do mapa); de uma porta, filtrado e ligando o bloco novo a ela.
  const openPicker = (x: number, y: number, extra: Pick<PickerAt, 'filter' | 'port'> = {}) => {
    const c = cam.current;
    if (!c) return;
    setPicker({ x, y, at: screenToWorld(c, x, y), ...extra });
  };
  const closePicker = useCallback((refocus: boolean) => {
    setPicker(null);
    if (refocus) canvas.current?.focus();
  }, []);
  const pick = (e: PickerEntry) => {
    if (!picker) return;
    const id = nextBlockId(f);
    dispatch(picker.port
      ? { type: 'addLinkedBlock', spec: e.spec, port: picker.port, at: picker.at }
      : { type: 'addBlock', spec: e.spec, at: picker.at });
    onSelect({ kind: 'stage', id });
    closePicker(true);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Uma porta vem antes do corpo do bloco (ela fica na borda).
    const port = e.button === 0 ? portUnder(e) : null;
    const hit = e.button === 0 && !port ? hitAt(e) : null;
    const from = hit?.kind === 'block' ? basePlaces[hit.id] ?? null : hit?.kind === 'meio' ? ligAt(hit.id) : null;
    drag.current = { id: e.pointerId, button: e.button, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, hit, from, to: null, port };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current, c = cam.current;
    if (!c) return;
    if (d && d.id === e.pointerId) {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_PX) return;
        d.moved = true;
        setDragging(d.port ? 'link' : d.from ? 'block' : 'pan');
      }
      if (d.port) {
        const w = worldAt(e);
        if (w) setWire({ from: d.port, to: w });
        const over = portUnder(e);
        if ((over && portKey(over)) !== (hoverPort && portKey(hoverPort))) setHoverPort(over);
      } else if (d.from && d.hit) {
        const dx = (e.clientX - d.x0) / c.zoom, dy = (e.clientY - d.y0) / c.zoom, { id, kind } = d.hit;
        const p = kind === 'block' ? dragged(d.from as MapPlace, dx, dy) : ligDragged(d.from, dx, dy);
        d.to = p;
        setMoving(m => (m && m.id === id && m.place.x === p.x && m.place.y === p.y ? m
          : kind === 'block' ? { kind, id, place: p as MapPlace } : { kind, id, place: p }));
      } else {
        moveCam(pan(c, d.x - e.clientX, d.y - e.clientY));
      }
      d.x = e.clientX; d.y = e.clientY;
      return;
    }
    const over = portUnder(e);
    if ((over && portKey(over)) !== (hoverPort && portKey(hoverPort))) setHoverPort(over);
    const hit = over ? null : hitAt(e)?.id ?? null;
    if (hit !== hover) setHover(hit);
  };
  // Soltou a porta puxada: numa porta (ou no corpo de um bloco, que vale como a porta do item) liga; no vazio abre o
  // seletor filtrado; incompatível só avisa o motivo.
  const dropPort = (e: React.PointerEvent<HTMLCanvasElement>, from: ScenePort) => {
    const w = worldAt(e);
    if (!w) return;
    let to = portUnder(e);
    if (!to) {
      const hit = hitTest(scene, w[0], w[1]);
      if (hit?.kind === 'block') to = { block: hit.id, item: from.item, side: from.side === 'out' ? 'in' : 'out', x: w[0], y: w[1], fluid: from.fluid };
    }
    const r = dropTarget(f, data, from, to);
    if (r.kind === 'connect') dispatch({ type: 'connect', from: r.from, to: r.to, item: r.item });
    else if (r.kind === 'picker') {
      const [x, y] = local(e);
      openPicker(x, y, { filter: r.filter, port: { block: from.block, item: from.item, side: from.side } });
    } else setNotice(WHY[r.reason]);
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>, cancel = false) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(null);
    setMoving(null);
    setWire(null);
    if (cancel) return;
    if (!d.moved) {
      // Clique numa porta seleciona o bloco dela.
      if (d.button === 0) onSelect(d.port ? { kind: 'stage', id: d.port.block } : d.hit ? { kind: d.hit.kind === 'block' ? 'stage' : 'meio', id: d.hit.id } : null);
      // Clique (sem arrastar) numa ligação abre o modal dela.
      if (d.button === 0 && !d.port && d.hit?.kind === 'meio') onOpenLig(d.hit.id);
      return;
    }
    if (d.port) { dropPort(e, d.port); return; }
    if (d.from && d.hit) {
      const changed = d.to && (d.to.x !== d.from.x || d.to.y !== d.from.y);
      if (d.hit.kind === 'meio') {
        if (changed) placeLig(d.hit.id, d.to);
        onSelect({ kind: 'meio', id: d.hit.id });
      } else {
        if (changed) place(d.hit.id, d.to as MapPlace);
        onSelect({ kind: 'stage', id: d.hit.id });
      }
    }
  };
  // Duplo clique: no bloco abre a etapa; no vazio, o seletor. Botão direito no vazio também abre o seletor.
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitAt(e);
    if (hit?.kind === 'block') onOpenStage(hit.id);
    else if (!hit) { const [x, y] = local(e); openPicker(x, y); }
  };
  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (hitAt(e)) return;
    const [x, y] = local(e);
    openPicker(x, y);
  };

  // Apaga o bloco (desfazível); o foco vai para o mapa, porque o botão da lista e o painel somem com ele.
  const remove = (id: StageId) => {
    dispatch({ type: 'removeBlock', id });
    onSelect(null);
    canvas.current?.focus();
  };

  // Teclado no bloco (na lista do painel ou no canvas): setas movem 8 m, R gira, Enter abre a etapa, Delete ou
  // Backspace apaga (desfazível), Esc solta.
  const blockKey = (e: React.KeyboardEvent, id: StageId | null) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { if (selection) { e.preventDefault(); onSelect(null); } return; }
    if (!id || !basePlaces[id]) return;
    const cur = basePlaces[id];
    if (e.key === 'Enter') { e.preventDefault(); onOpenStage(id); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(id);
      return;
    }
    const next = e.key === 'r' || e.key === 'R' ? rotated(cur) : nudged(cur, e.key);
    if (!next) return;
    e.preventDefault();
    if (selStage !== id) onSelect({ kind: 'stage', id });
    place(id, next);
  };

  // Teclado com a ligação selecionada: setas movem 8 m, R gira (a partir de onde ela está, posta ou colada), Enter abre
  // o modal, Esc solta.
  const ligKey = (e: React.KeyboardEvent, id: string) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); onSelect(null); return; }
    if (e.key === 'Enter') { e.preventDefault(); onOpenLig(id); return; }
    const cur = ligAt(id);
    if (!cur) return;
    const next = e.key === 'r' || e.key === 'R' ? ligRotated(cur) : nudged(cur, e.key);
    if (!next) return;
    e.preventDefault();
    placeLig(id, next);
  };
  const canvasKey = (e: React.KeyboardEvent) => (selection?.kind === 'meio' ? ligKey(e, selection.id) : blockKey(e, selStage));

  // Aviso clicado no painel: a câmera vai até ele.
  const focus = (r: Rect) => { const c = cam.current; if (c && size.current.w) moveCam(centerOn(c, r, size.current.w, size.current.h)); };

  const zoomCenter = (f: number) => { const c = cam.current; if (c) moveCam(zoomAt(c, f, size.current.w / 2, size.current.h / 2)); };
  const showAll = () => { if (size.current.w) moveCam(fitAll(scene.bounds, size.current.w, size.current.h)); };

  const area = sizeText(scene.bounds);
  return (
    <>
      <main className="pl-center" id="pl-graph" tabIndex={-1} aria-label={t('plViewMap')}>
        <div className="pl-map" ref={wrap}>
          <canvas ref={canvas} tabIndex={0} role="img"
            className={'pl-map-canvas' + (dragging === 'pan' ? ' grabbing' : dragging === 'block' ? ' moving' : dragging === 'link' || hoverPort ? ' linking' : hover ? ' over' : '')}
            aria-label={t('plMapAria', fmt(f.blocks.length, 0), area)}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={e => endDrag(e)} onPointerCancel={e => endDrag(e, true)}
            onPointerLeave={() => { if (!drag.current) { if (hover) setHover(null); if (hoverPort) setHoverPort(null); } }}
            onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} onKeyDown={canvasKey} />
          {!f.blocks.length && !picker && <p className="pl-map-empty">{t('plCanvasHint')}</p>}
          {notice && <p className="pl-map-notice" role="status">{t(notice)}</p>}
          {picker && (
            <Picker data={data} filter={picker.filter} x={picker.x} y={picker.y} area={size.current} onPick={pick} onClose={closePicker} />
          )}
          <MapLegend />
          {hint && (
            <p className="pl-map-hint">
              <span>{t('plCanvasHint')} · {t('plMapHint')}</span>
              <button type="button" onClick={hideHint} aria-label={t('plMapHintClose')} title={t('plMapHintClose')}>×</button>
            </p>
          )}
          <div className="pl-map-ctrl" role="group" aria-label={t('plMapControls')}>
            <button type="button" className="pl-btn pl-map-add" onClick={() => openPicker(size.current.w / 2 - 190, 56)}>+ {t('plPickTitle')}</button>
            <button type="button" className="pl-btn" onClick={() => zoomCenter(BUTTON_ZOOM)} aria-label={t('plMapZoomIn')} title={t('plMapZoomIn')}>+</button>
            <button type="button" className="pl-btn" onClick={() => zoomCenter(1 / BUTTON_ZOOM)} aria-label={t('plMapZoomOut')} title={t('plMapZoomOut')}>−</button>
            <button type="button" className="pl-btn" onClick={showAll} aria-label={t('plMapFit')} title={t('plMapFit')}>{t('plMapFit')}</button>
          </div>
        </div>
      </main>
      <MapPanel factory={f} flow={flow} data={data} dispatch={dispatch} onDelete={remove} meioList={meioList} scene={scene} places={places} selected={selStage}
        onPlace={place} onPropose={propose} onFocus={focus} onPick={id => onSelect({ kind: 'stage', id })}
        onOpenStage={onOpenStage} onBlockKey={blockKey} onGap={gap => dispatch({ type: 'setMapGap', gap })} />
    </>
  );
}

// Legenda do mapa, recolhível, no canto de cima à esquerda. Os sinais repetem o canvas: de perto a faixa de perigo
// (travado, loop travado); de longe os sinais no canto do bloco (falta e represado em círculo, travado em quadrado,
// loop travado em losango, sem limite em anel).
const LEGEND: [string, string][] = [
  ['machine', 'plLegMachine'], ['belt', 'plLegBelt'], ['pipe', 'plLegPipe'], ['meio', 'plLegMeio'], ['marker', 'plLegMarker'],
  ['port', 'plLegPort'], ['short', 'plLegShort'], ['held', 'plLegHeld'], ['stalled', 'plLegStalled'], ['deadlock', 'plLegDeadlock'],
  ['unbounded', 'plLegUnbounded'], ['clash', 'plLegClash'], ['dots', 'plLegDots'],
];
function MapLegend() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(LEGEND_STORE) === '1'; } catch { return false; } });
  const toggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const v = e.currentTarget.open;
    setOpen(v);
    try { localStorage.setItem(LEGEND_STORE, v ? '1' : '0'); } catch { /* sem storage */ }
  };
  return (
    <details className="pl-map-legend" open={open} onToggle={toggle}>
      <summary>{t('plLegend')}</summary>
      <ul>
        {LEGEND.map(([k, key]) => (
          <li key={k}><i className={'pl-lg pl-lg-' + k} aria-hidden="true">{k === 'dots' && <><b /><b /></>}</i>{t(key)}</li>
        ))}
      </ul>
    </details>
  );
}
