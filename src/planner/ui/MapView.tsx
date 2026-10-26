// Vista do mapa: a cena em escala num canvas, com a navegação do Figma (rolar move, Ctrl/⌘ + rodinha ou pinça
// dá zoom no cursor, arrastar o fundo move) e os botões de zoom e mostrar tudo. Clicar seleciona, arrastar um bloco ou
// uma ligação o muda de lugar (preso na grade), duplo clique abre o bloco; o painel ao lado gira, ajusta vãos e lista
// os avisos. Montar como no Modeler: duplo clique ou botão direito no vazio abre o seletor ali; arrastar de uma porta
// liga (soltando numa porta) ou cria o próximo bloco já ligado (soltando no vazio); Delete apaga o bloco.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { chosenGeo, type MeioResult } from '../model/meioresult.ts';
import type { Meio } from '../model/meio.ts';
import { perRowOf, stageRows } from '../model/stage.ts';
import { solvedStage } from '../model/solved.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Block, Factory, GameData, ItemId, LigPlace, MapPlace, StageId } from '../model/types.ts';
import type { Action } from '../model/factorystate.ts';
import { centerOn, clampCam, fit, pan, screenToWorld, zoomAt, type Camera } from '../model/map/camera.ts';
import type { MeioGeo, Pt, Rect } from '../model/map/geo.ts';
import { buildScene, hitTest, placesOf, proposeMap, type Scene } from '../model/map/scene.ts';
import { dragged, ligDragged, ligRotated, nudged, rotated, withPlace } from '../model/map/edit.ts';
import { dropTarget, type ScenePort } from '../model/map/ports.ts';
import { cardSpec, chipWorld, fitMontar, viewGeo, viewHit, viewLimits, type ViewGeo, type ViewHit, type ViewPort } from '../model/map/cards.ts';
import { chipLabel, type ChipLabel } from '../model/chip.ts';
import { portStates, type PortState } from '../model/portstate.ts';
import { MAX_LINKS, MAX_STAGES, blocksFull, linksFull, nextBlockId } from '../model/factory.ts';
import type { PickerEntry, PickerFilter } from '../model/picker.ts';
import { Picker } from './Picker.tsx';
import { ChipPopover } from './ChipPopover.tsx';
import { iconImage } from './icons.ts';
import { PORT_ZOOM, drawScene, readTheme, type CardText, type DrawOpts, type MapTheme } from './mapDraw.ts';
import { MapPanel } from './MapPanel.tsx';
import { badgeText, blockIcon, blockName, rateText, sizeText } from './format.ts';
import { blockBadges, type Badge } from '../model/badges.ts';
import type { Selection, ViewMode } from './selection.ts';

interface Props {
  view: ViewMode;   // Montar (cartões) ou Planta em escala; a troca anima
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
// Animação das esteiras da Montar: no máximo 30 quadros/s; um quadro acima de 12 ms deixa o desenho parado até o próximo
// pedido de redesenho.
const ANIM_MS = 1000 / 30, SLOW_MS = 12;
const PHONE = '(max-width: 720px)', REDUCED = '(prefers-reduced-motion: reduce)';
const media = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);   // só na montagem; depois, pelo evento
// Gancho de teste (tests/visual/smoke.js): a cena, a câmera, as portas, a vista e a geometria de tela (portas, chips e
// blocos em px) do último quadro em window.__sfPlanner; só com ?debug=1 ou no servidor de desenvolvimento.
const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).get('debug') === '1';
// Transição Montar <-> Planta.
const TRANS_MS = 250;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Alguma esteira da Montar (do chip às portas do grupo) toca a tela? Sem nenhuma, a animação não roda.
function beltsOnScreen(v: ViewGeo, meio: (id: string) => Meio | undefined, vw: number, vh: number): boolean {
  if (!v.chips.length) return false;
  const at = new Map(v.ports.map(p => [`${p.block}|${p.side}|${p.item}`, p]));
  for (const c of v.chips) {
    const g = meio(c.meio);
    if (!g) continue;
    let x0 = c.x - c.w / 2, y0 = c.y - c.h / 2, x1 = c.x + c.w / 2, y1 = c.y + c.h / 2;
    const ends = [...g.producers.map(id => at.get(`${id}|out|${g.item}`)), ...g.consumers.map(id => at.get(`${id}|in|${g.item}`))];
    for (const p of ends) if (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (x1 >= 0 && y1 >= 0 && x0 <= vw && y0 <= vh) return true;
  }
  return false;
}
const NOTICE_MS = 3500;
const WHY = { self: 'plLinkWhySelf', item: 'plLinkWhyItem', dup: 'plLinkWhyDup', fluidSink: 'plLinkWhyFluidSink', full: 'plLinkWhyFull' } as const;
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

// O cartão da Montar de um bloco, no idioma atual.
function cardText(b: Block, data: GameData, flow: FlowResult, bs: Badge[]): CardText {
  const spec = cardSpec(b, data, flow), bf = flow.blocks[b.id];
  const unitOf = (fluid: boolean) => t(fluid ? 'plPerMinFluid' : 'plPerMin', '').trim();
  const base = { ins: spec.ins, outs: spec.outs, rows: spec.rows, icon: blockIcon(b, data), alt: false, fixed: false, clock: null, count: '', rowsText: '', perRowText: '', rate: '', unit: '' };
  if (b.kind !== 'recipe') {
    // Origem: o que sai; sobra: a soma do que chega.
    const src = b.kind === 'miner' || b.kind === 'extractor';
    const ports = (src ? bf?.outs : bf?.ins) ?? [];
    const rate = ports.some(p => p.rate === null) ? null : ports.reduce((s, p) => s + (p.rate ?? 0), 0);
    const fluid = ports.length > 0 && ports.every(p => !!data.items[p.item]?.fluid);
    const n = b.kind === 'extractor' ? bf?.extractors : null;
    const building = b.kind === 'miner' ? t('plMiner') : b.kind === 'extractor'
      ? (typeof n === 'number' ? `${fmt(n, 0)} × ` : '') + (data.extractors[b.building]?.name ?? b.building) : '';
    const title = src ? data.items[b.item]?.name ?? b.item : blockName(b, data);
    return { ...base, title, building, marker: true, rate: rate === null ? t('plUnbounded') : fmt(rate), unit: rate === null ? '' : unitOf(fluid) };
  }
  const s = solvedStage(b, bf), r = data.recipes[s.recipe], per = perRowOf(s, data), rows = spec.rows;
  const stalled = bs.some(x => x.kind === 'stalled' || x.kind === 'deadlock');
  const count = bf?.unbounded ? t('plUnbounded') : stalled ? t('plCardStalled') : fmt(s.machines, 0);
  const n = rows.length, full = rows[0] ?? 0, last = rows[n - 1] ?? 0;
  const rowsText = n > 1 && last !== full ? t('plCardRowsLast', fmt(n, 0), fmt(full, 0), fmt(last, 0)) : t('plCardRows', fmt(Math.max(1, n), 0), fmt(full, 0));
  const main = r.outs[0];
  const perRowText = main ? t('plCardPerRow', rateText(data.items[main.item], (main.perMin * b.clock / 100) * per)) : '';
  return {
    ...base, title: r.name, building: data.buildings[r.building]?.name ?? r.building, icon: r.building, alt: r.alt, marker: false,
    count, fixed: b.limits?.machines !== undefined, clock: b.clock !== 100 ? `${fmt(b.clock)}%` : null, rowsText, perRowText,
  };
}

export function MapView({ view: mode, factory: f, flow, data, lang, meioList, results, selection, onSelect, onOpenStage, dispatch, onOpenLig }: Props) {
  const selected = selection?.id ?? null;
  const selStage = selection?.kind === 'stage' ? selection.id : null;
  const montar = mode === 'montar';
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
  // Portas de cada bloco (lado e item, na ordem do cartão), para saber quais aceitam a porta puxada.
  const portIds = useMemo(() => f.blocks.flatMap(b => {
    const c = cardSpec(b, data, flow), mk = (side: 'in' | 'out') => (item: ItemId): ScenePort => ({ block: b.id, side, item, x: 0, y: 0, fluid: !!data.items[item]?.fluid });
    return [...c.ins.map(mk('in')), ...c.outs.map(mk('out'))];
  }), [f.blocks, data, flow]);
  // Montar: seletor aberto, porta sendo puxada (com a ponta no ponteiro), porta sob o ponteiro e o aviso de não ligou.
  const [picker, setPicker] = useState<PickerAt | null>(null);
  const [wire, setWire] = useState<{ from: ScenePort; to: Pt } | null>(null);
  const [hoverPort, setHoverPort] = useState<ScenePort | null>(null);
  const [notice, setNotice] = useState<(typeof WHY)[keyof typeof WHY] | 'plBlocksFull' | null>(null);   // a chave: o texto segue o idioma
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);
  // As portas que aceitam a puxada acendem (calculado uma vez por arraste).
  const wireFrom = wire?.from ?? null;
  const lit = useMemo(() => new Set(wireFrom ? portIds.filter(p => dropTarget(f, data, wireFrom, p).kind === 'connect').map(portKey) : []),
    [wireFrom, portIds, f, data]);
  // Toda edição grava todas as posições de uma vez: o mapa inteiro fica fixo num passo só do desfazer.
  const place = (id: StageId, p: MapPlace) => dispatch({ type: 'setPlaces', places: withPlace(basePlaces, id, p) });
  // Propor de novo: o mapa inteiro, inclusive as ligações postas (voltam a colar na origem), num passo só.
  const propose = () => dispatch({ type: 'proposeMap', places: proposeMap(f, data, geos, flow) });
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
  // Mini painel do chip: a ligação dele (só vale enquanto ela é a selecionada).
  const [popId, setPopId] = useState<string | null>(null);
  const popEl = useRef<HTMLDivElement>(null);

  // Celular e movimento reduzido: lidos uma vez e atualizados pelo evento de mudança (não a cada quadro).
  const phone = useRef(media(PHONE)), reduced = useRef(media(REDUCED));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const ql = [[PHONE, phone], [REDUCED, reduced]] as const;
    const offs = ql.map(([q, r]) => {
      const m = matchMedia(q), on = () => { r.current = m.matches; redraw.current(); };
      r.current = m.matches;
      m.addEventListener?.('change', on);
      return () => m.removeEventListener?.('change', on);
    });
    return () => offs.forEach(off => off());
  }, []);

  const colors = useMemo(() => (theme ? itemColors(f, data, theme) : {}), [f, data, theme]);
  // Os blocos por id, uma vez por fábrica (os rótulos do canvas consultam a cada quadro).
  const byId = useMemo(() => new Map(f.blocks.map(b => [b.id, b])), [f.blocks]);
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
  // Estado de cada porta (bloco|lado|item), o rótulo do chip e o grupo de cada ligação (mudam com o fluxo e os meios).
  const portStateMap = useMemo(() => {
    const m = new Map<string, PortState>();
    for (const b of f.blocks) { const bf = flow.blocks[b.id]; if (bf) for (const s of portStates(bf)) m.set(`${s.block}|${s.side}|${s.item}`, s); }
    return m;
  }, [f.blocks, flow]);
  const meioById = useMemo(() => new Map(meioList.map(m => [m.id, m])), [meioList]);
  const chips = useMemo(() => new Map<string, ChipLabel>(meioList.map(m => [m.id, chipLabel(m, results.get(m.id), f.alts, flow, data)])),
    [meioList, results, f.alts, flow, data]);
  // Cartão de cada bloco na Montar, já no idioma (lang nas dependências).
  const cards = useMemo(() => new Map(f.blocks.map(b => [b.id, cardText(b, data, flow, badges.get(b.id) ?? [])])),
    [f.blocks, data, flow, badges, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  const opts = useMemo((): DrawOpts | null => theme && {
    // lang nas dependências: os rótulos mudam com o idioma.
    selected, hover, colors, theme, t: 1, time: 0,
    portHover: hoverPort ? portKey(hoverPort) : null, wire: wire && { from: wire.from, to: wire.to, lit }, icon,
    names: item => data.items[item]?.name ?? item,
    badges: id => badges.get(id) ?? [],
    portState: (block, side, item) => portStateMap.get(`${block}|${side}|${item}`),
    rate: (item, x) => rateText(data.items[item], x),
    fluid: item => !!data.items[item]?.fluid,
    chip: id => chips.get(id) ?? null,
    meio: id => meioById.get(id),
    card: id => cards.get(id)!,
    flash: null,
    blockText: id => {
      const b = byId.get(id)!, bf = flow.blocks[id], icon = blockIcon(b, data);
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
      const num = bf?.unbounded ? t('plUnbounded') : fmt(s.machines, 0);
      const sub = t('plRowsAria', fmt(stageRows(s, data).length, 0), fmt(perRowOf(s, data), 0), bd.name);
      // Placa da Planta: o ícone do prédio, a receita e o número em laranja.
      return { title: r.name + lock, num, sub, icon: r.building, alert };
    },
  }, [selected, hover, colors, theme, byId, flow, data, lang, hoverPort, wire, lit, badges, portStateMap, chips, meioById, cards]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A vista: t vai de 0 (Montar) a 1 (Planta) em TRANS_MS ao trocar; a câmera usa os limites de zoom da vista atual.
  const tNow = useRef(montar ? 0 : 1);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const limits = () => viewLimits(modeRef.current === 'montar');

  // Desenho num requestAnimationFrame: vários pedidos no mesmo quadro viram um desenho só. A Montar anima o tracejado
  // das esteiras (até 30 quadros/s) enquanto alguma aparece, parado com movimento reduzido, com a aba escondida ou se um
  // quadro passar de 12 ms. Tudo que o quadro lê vem daqui (o timer da animação chama um draw de um render antigo).
  const latest = useRef({ scene, opts, f: shown, data, flow, popId });
  latest.current = { scene, opts, f: shown, data, flow, popId };
  const lastView = useRef<ViewGeo | null>(null);
  // A geometria de tela só muda com a cena, a câmera, t, o celular e o tamanho: guardada entre os quadros da animação.
  const geoMemo = useRef<{ key: unknown[]; v: ViewGeo; belts: boolean } | null>(null);
  const geoFor = (sc: Scene, c: Camera, T: number, fs: Factory, dt: GameData, fl: FlowResult, o: DrawOpts) => {
    const { w, h } = size.current, key = [sc, c, T, phone.current, fs, dt, fl, o.meio, w, h];
    const g = geoMemo.current;
    if (g && g.key.length === key.length && g.key.every((k, i) => k === key[i])) return g;
    const v = viewGeo(sc, c, T, phone.current, fs, dt, fl);
    return (geoMemo.current = { key, v, belts: T < 1 && beltsOnScreen(v, o.meio, w, h) });
  };
  // Mini painel abaixo do chip (ou acima, se não couber), dentro da área do mapa; some se o chip sumir.
  const placePop = () => {
    const el = popEl.current, v = lastView.current, id = latest.current.popId;
    if (!el || !v || !id) return;
    const ch = v.chips.find(x => x.meio === id), { w, h } = size.current;
    el.hidden = !ch;
    if (!ch) return;
    const pw = el.offsetWidth, ph = el.offsetHeight, gap = 8;
    const x = clamp(ch.x - pw / 2, 8, Math.max(8, w - pw - 8));
    let y = ch.y + ch.h / 2 + gap;
    if (y + ph > h - 8) y = ch.y - ch.h / 2 - gap - ph;
    y = clamp(y, 8, Math.max(8, h - ph - 8));
    el.style.left = `${Math.round(x)}px`; el.style.top = `${Math.round(y)}px`;
  };
  const frame = useRef(0);
  const anim = useRef({ timer: 0, slow: false, time: 0 });
  const draw = () => {
    frame.current = 0;
    const el = canvas.current, c = cam.current, { scene: sc, opts: o, f: fs, data: dt, flow: fl } = latest.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !c || !o || !size.current.w) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const T = tNow.current, A = anim.current;
    const { v: view, belts } = geoFor(sc, c, T, fs, dt, fl, o);
    lastView.current = view;
    const moving = belts && !document.hidden && !reduced.current;
    if (moving && !A.slow) A.time = performance.now();
    const wireTo = o.wire && ([(o.wire.to[0] - c.x) * c.zoom, (o.wire.to[1] - c.y) * c.zoom] as Pt);
    const t0 = performance.now();
    drawScene(ctx, sc, view, c, size.current.w, size.current.h, { ...o, t: T, time: A.time, wire: o.wire && { ...o.wire, to: wireTo! } });
    if (performance.now() - t0 > SLOW_MS) A.slow = true;
    const flashing = !!o.flash && Date.now() < o.flash.until;
    // Quadro lento: nem a esteira nem o destaque continuam sozinhos (o próximo pedido de fora volta a desenhar).
    if ((moving || flashing) && !A.slow && !A.timer) A.timer = window.setTimeout(() => { A.timer = 0; schedule(); }, ANIM_MS);
    placePop();
    el.dataset.cam = `${c.x.toFixed(2)},${c.y.toFixed(2)},${c.zoom.toFixed(4)}`;
    if (DEBUG) {
      // Portas em metros, como antes (o smoke as acha pelo mundo); view: portas, chips e blocos em px de tela.
      const ports = view.ports.map(p => ({ block: p.block, side: p.side, item: p.item, x: c.x + p.x / c.zoom, y: c.y + p.y / c.zoom, dir: p.dir, fluid: !!dt.items[p.item]?.fluid }));
      (window as unknown as { __sfPlanner: unknown }).__sfPlanner = {
        scene: sc, cam: c, ports, mode: modeRef.current, t: T,
        view: {
          ports: view.ports.map(p => ({ block: p.block, side: p.side, item: p.item, x: p.x, y: p.y })),
          chips: view.chips.map(x => ({ meio: x.meio, x: x.x, y: x.y, w: x.w, h: x.h })),
          blocks: view.blocks.map(b => ({ id: b.id, rect: b.rect })),
        },
      };
    }
  };
  // O próximo quadro (sem mexer no quadro lento: é o que o timer da animação usa).
  const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(draw); };
  // Pedido de fora (câmera, dados, ponteiro): volta a animar se um quadro lento tinha parado.
  const request = () => { anim.current.slow = false; schedule(); };
  redraw.current = request;
  // A câmera fica sempre dentro dos limites de zoom da vista atual (com o centro da tela parado).
  const setCam = (c: Camera) => {
    const { w, h } = size.current, k = w ? clampCam(c, limits(), w, h) : c;
    cam.current = k; sessionCam = k; request();
  };
  const moveCam = (c: Camera) => { camMoved = true; setCam(c); };
  useEffect(() => () => { cancelAnimationFrame(frame.current); clearTimeout(anim.current.timer); }, []);
  useEffect(request, [scene, opts]);
  // Aba de volta: redesenha (e volta a animar); escondida, o próximo quadro já para.
  useEffect(() => {
    const onVis = () => { if (!document.hidden) redraw.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Enquadra a vista atual: os cartões na Montar, os blocos reais na Planta (mapa vazio: a origem no centro).
  const fitView = (): Camera => {
    const { w, h } = size.current, { scene: sc, f: fs, data: dt, flow: fl } = latest.current;
    if (modeRef.current === 'montar') return fitMontar(sc, fs, dt, fl, w, h, phone.current) ?? fitAll(sc.bounds, w, h);
    return fitAll(sc.bounds, w, h);
  };

  // Trocar de vista: a câmera mantém o centro (com o zoom nos limites da nova) e t anda até a ponta em TRANS_MS
  // (na hora com movimento reduzido).
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) { firstMode.current = false; return; }
    const to = mode === 'planta' ? 1 : 0, from = tNow.current;
    if (cam.current) setCam(cam.current);
    if (reduced.current || from === to) { tNow.current = to; request(); return; }
    const t0 = performance.now();
    let id = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / TRANS_MS);
      tNow.current = from + (to - from) * easeInOut(k);
      anim.current.slow = false;
      cancelAnimationFrame(frame.current);
      draw();
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(id); tNow.current = to; };
  }, [mode]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (canvas.current) setTheme(readTheme(canvas.current));
    // Fontes chegando depois do primeiro quadro: redesenha com elas.
    document.fonts?.ready.then(request).catch(() => {});
  }, []);

  // Tamanho do canvas acompanha a área (em px de tela de alta densidade); a primeira abertura enquadra tudo.
  useEffect(() => {
    const box = wrap.current, el = canvas.current;
    if (!box || !el) return;
    const resize = () => {
      const w = box.clientWidth, h = box.clientHeight, dpr = window.devicePixelRatio || 1;
      size.current = { w, h };
      el.width = Math.max(1, Math.round(w * dpr)); el.height = Math.max(1, Math.round(h * dpr));
      if (!cam.current && w && h) setCam(fitView());
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
    if (!camMoved && size.current.w) setCam(fitView());
  }, [ready]);

  // Mini painel: só enquanto a ligação dele é a selecionada; posicionado já no primeiro quadro e quando muda de tamanho
  // (a lista de montagens abre e fecha dentro dele).
  const popMeio = popId && selection?.kind === 'meio' && selection.id === popId ? meioById.get(popId) : undefined;
  useLayoutEffect(() => {
    const el = popEl.current;
    if (!el) return;
    placePop();
    const ro = new ResizeObserver(() => placePop());
    ro.observe(el);
    return () => ro.disconnect();
  }, [popMeio?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const closePop = (refocus: boolean) => { setPopId(null); if (refocus) canvas.current?.focus(); };
  // Desligar: todas as esteiras do grupo num passo só do desfazer.
  const unlink = (id: string) => {
    const m = meioById.get(id);
    if (!m) return;
    dispatch({ type: 'disconnectMeio', linkIds: m.links });
    setPopId(null);
    onSelect(null);
    canvas.current?.focus();
  };

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
      if (e.ctrlKey || e.metaKey) moveCam(zoomAt(c, Math.exp(-e.deltaY * unit * WHEEL_ZOOM), e.clientX - r.left, e.clientY - r.top, limits()));
      else moveCam(pan(c, (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Arrastar uma porta puxa uma esteira; arrastar um cartão/bloco o muda de lugar; arrastar o chip muda a ligação de
  // lugar; arrastar o resto move o mapa; sem arrastar, é um clique (seleciona; no chip, abre o mini painel).
  type Hit = { kind: 'block' | 'meio'; id: string } | null;
  const drag = useRef<{
    id: number; button: number; x0: number; y0: number; x: number; y: number; moved: boolean;
    hit: Hit; from: LigPlace | null; to: LigPlace | null; port: ScenePort | null; chip: Pt | null;
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
  // Na Planta, de longe, as portas não aparecem (a não ser puxando uma) e não pegam o ponteiro.
  const portsLive = () => {
    const c = cam.current;
    return !!c && (tNow.current < 0.5 || c.zoom >= PORT_ZOOM || !!drag.current?.port);
  };
  // O que está sob o ponteiro, pela geometria de tela do último quadro: porta, chip, cartão/bloco; na Planta, o corpo
  // da ligação também vale como ela.
  const hitAt = (e: React.PointerEvent | React.MouseEvent): ViewHit => {
    const v = lastView.current, c = cam.current;
    if (!v || !c) return null;
    const [x, y] = local(e);
    const h = viewHit(portsLive() ? v : { ...v, ports: [] }, x, y);
    if (h || tNow.current < 0.5) return h;
    const w = screenToWorld(c, x, y), sh = hitTest(scene, w[0], w[1]);
    return sh?.kind === 'meio' ? { kind: 'chip', meio: sh.id } : null;
  };
  const scenePort = (p: ViewPort): ScenePort => {
    const [wx, wy] = screenToWorld(cam.current!, p.x, p.y);
    return { block: p.block, side: p.side, item: p.item, x: wx, y: wy, fluid: !!data.items[p.item]?.fluid, dir: p.dir };
  };
  const portUnder = (e: React.PointerEvent): ScenePort | null => {
    const h = hitAt(e);
    return h?.kind === 'port' ? scenePort(h.port) : null;
  };
  // Seletor no ponto da tela (px do mapa); de uma porta, filtrado e ligando o bloco novo a ela.
  const openPicker = (x: number, y: number, extra: Pick<PickerAt, 'filter' | 'port'> = {}) => {
    const c = cam.current;
    if (!c) return;
    // No limite de blocos (ou de ligações, vindo de uma porta) não abre: o bloco novo seria recusado.
    if (blocksFull(f)) { setNotice('plBlocksFull'); return; }
    if (extra.port && linksFull(f)) { setNotice(WHY.full); return; }
    setPopId(null);
    setPicker({ x, y, at: screenToWorld(c, x, y), ...extra });
  };
  const closePicker = useCallback((refocus: boolean) => {
    setPicker(null);
    if (refocus) canvas.current?.focus();
  }, []);
  const pick = (e: PickerEntry) => {
    if (!picker) return;
    if (blocksFull(f) || (picker.port && linksFull(f))) { setNotice(picker.port && !blocksFull(f) ? WHY.full : 'plBlocksFull'); closePicker(true); return; }
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
    const h = e.button === 0 ? hitAt(e) : null;
    const port = h?.kind === 'port' ? scenePort(h.port) : null;
    const hit: Hit = h?.kind === 'block' ? { kind: 'block', id: h.id } : h?.kind === 'chip' ? { kind: 'meio', id: h.meio } : null;
    const from = hit?.kind === 'block' ? basePlaces[hit.id] ?? null : hit?.kind === 'meio' ? ligAt(hit.id) : null;
    const ch = hit?.kind === 'meio' ? lastView.current?.chips.find(x => x.meio === hit.id) : undefined;
    drag.current = {
      id: e.pointerId, button: e.button, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, hit, from, to: null, port,
      chip: ch ? [ch.x, ch.y] : null,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current, c = cam.current;
    if (!c) return;
    if (d && d.id === e.pointerId) {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_PX) return;
        d.moved = true;
        setDragging(d.port ? 'link' : d.from ? 'block' : 'pan');
        if (d.hit?.kind === 'meio') setPopId(null);
      }
      if (d.port) {
        const w = worldAt(e);
        if (w) setWire({ from: d.port, to: w });
        const over = portUnder(e);
        if ((over && portKey(over)) !== (hoverPort && portKey(hoverPort))) setHoverPort(over);
      } else if (d.from && d.hit) {
        const dx = e.clientX - d.x0, dy = e.clientY - d.y0, { id, kind } = d.hit;
        let p: LigPlace;
        if (kind === 'block') p = dragged(d.from as MapPlace, dx / c.zoom, dy / c.zoom);
        else {
          // O centro do chip segue o ponteiro; o retângulo da ligação vai junto, preso na grade, com o giro dela.
          const m = scene.meios.find(x => x.meio === id), sz = m ? { w: m.rect.w, h: m.rect.h } : { w: 0, h: 0 };
          const [cx, cy] = d.chip ?? [(d.from.x - c.x + sz.w / 2) * c.zoom, (d.from.y - c.y + sz.h / 2) * c.zoom];
          p = { ...chipWorld(c, cx + dx, cy + dy, sz), rot: d.from.rot };
        }
        d.to = p;
        setMoving(m => (m && m.id === id && m.place.x === p.x && m.place.y === p.y ? m
          : kind === 'block' ? { kind, id, place: p as MapPlace } : { kind, id, place: p }));
      } else {
        moveCam(pan(c, d.x - e.clientX, d.y - e.clientY));
      }
      d.x = e.clientX; d.y = e.clientY;
      return;
    }
    const h = hitAt(e);
    const over = h?.kind === 'port' ? scenePort(h.port) : null;
    if ((over && portKey(over)) !== (hoverPort && portKey(hoverPort))) setHoverPort(over);
    const id = h?.kind === 'block' ? h.id : h?.kind === 'chip' ? h.meio : null;
    if (id !== hover) setHover(id);
  };
  // Soltou a porta puxada: numa porta (ou no corpo de um bloco, que vale como a porta do item) liga; no vazio abre o
  // seletor filtrado; incompatível só avisa o motivo.
  const dropPort = (e: React.PointerEvent<HTMLCanvasElement>, from: ScenePort) => {
    const w = worldAt(e);
    if (!w) return;
    const h = hitAt(e);
    let to = h?.kind === 'port' ? scenePort(h.port) : null;
    if (!to && h?.kind === 'block') to = { block: h.id, item: from.item, side: from.side === 'out' ? 'in' : 'out', x: w[0], y: w[1], fluid: from.fluid };
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
      if (d.button !== 0) return;
      // Clique numa porta seleciona o bloco dela; no chip, seleciona a ligação e abre (ou fecha) o mini painel.
      if (d.hit?.kind === 'meio') {
        const id = d.hit.id;
        onSelect({ kind: 'meio', id });
        setPopId(p => (p === id && selection?.kind === 'meio' && selection.id === id ? null : id));
        return;
      }
      setPopId(null);
      onSelect(d.port ? { kind: 'stage', id: d.port.block } : d.hit ? { kind: 'stage', id: d.hit.id } : null);
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
  // o mini painel, Delete ou Backspace desliga (desfazível), Esc fecha o painel ou solta.
  const ligKey = (e: React.KeyboardEvent, id: string) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); if (popMeio) closePop(true); else onSelect(null); return; }
    if (e.key === 'Enter') { e.preventDefault(); setPopId(id); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); unlink(id); return; }
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

  const zoomCenter = (k: number) => { const c = cam.current; if (c) moveCam(zoomAt(c, k, size.current.w / 2, size.current.h / 2, limits())); };
  const showAll = () => { if (size.current.w) moveCam(fitView()); };

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
          {notice && <p className="pl-map-notice" role="status">{t(notice, fmt(notice === 'plBlocksFull' ? MAX_STAGES : MAX_LINKS, 0))}</p>}
          {picker && (
            <Picker data={data} filter={picker.filter} x={picker.x} y={picker.y} area={size.current} onPick={pick} onClose={closePicker} />
          )}
          {popMeio && (
            <ChipPopover key={popMeio.id} meio={popMeio} label={chips.get(popMeio.id) ?? null} result={results.get(popMeio.id)} factory={f} flow={flow}
              data={data} popRef={popEl}
              onSee={() => { setPopId(null); onOpenLig(popMeio.id); }}
              onSwap={key => dispatch({ type: 'setMeioAlt', meio: popMeio.id, key })}
              onUnlink={() => unlink(popMeio.id)} onClose={() => closePop(true)} />
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
