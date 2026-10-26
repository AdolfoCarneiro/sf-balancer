// Vista do mapa: a cena em escala num canvas, com a navegação do Figma (rolar move, Ctrl/⌘ + rodinha ou pinça
// dá zoom no cursor, arrastar o fundo move) e os botões de zoom e mostrar tudo. Clicar seleciona, arrastar um bloco ou
// uma ligação o muda de lugar (preso na grade), duplo clique abre o bloco; o painel ao lado gira, ajusta vãos e lista
// os avisos. Montar como no Modeler: duplo clique ou botão direito no vazio abre o seletor ali; arrastar de uma porta
// liga (soltando numa porta) ou cria o próximo bloco já ligado (soltando no vazio); Delete apaga o bloco.
// Seleção múltipla: Shift+clique põe ou tira um bloco, Shift+arrastar no vazio desenha o retângulo, Ctrl/⌘+A pega todos;
// arrastar um dos selecionados move todos e Delete apaga todos (um passo só do desfazer em cada caso).
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { chosenGeo, type MeioResult } from '../model/meioresult.ts';
import type { Meio } from '../model/meio.ts';
import { rowsSummary } from '../model/layout.ts';
import { solvedStage } from '../model/solved.ts';
import type { FlowResult } from '../model/solve.ts';
import { isSource, type Block, type Factory, type GameData, type ItemId, type LigPlace, type MapPlace, type StageId } from '../model/types.ts';
import type { Action } from '../model/factorystate.ts';
import { centerOn, clampCam, fit, pan, screenToWorld, zoomAt, type Camera } from '../model/map/camera.ts';
import type { MeioGeo, Pt, Rect } from '../model/map/geo.ts';
import { buildScene, hitTest, placesOf, proposeMap, selectionBox, type Scene } from '../model/map/scene.ts';
import { montarLig, montarPlaces } from '../model/views.ts';
import { dragged, ligDragged, ligRotated, nudged, rotated, withPlace } from '../model/map/edit.ts';
import { dropTarget, type ScenePort } from '../model/map/ports.ts';
import { MONTAR_REF, blockCardSize, cardScale, cardSpec, chipWorld, fitMontar, fitPlanta, montarFar, switchCam, viewGeo, viewHit, viewLimits, type ViewGeo, type ViewHit, type ViewPort } from '../model/map/cards.ts';
import { chipLabel, type ChipLabel } from '../model/chip.ts';
import { portStates, type PortState } from '../model/portstate.ts';
import { MAX_LINKS, MAX_STAGES, blocksFull, linksFull, nextBlockId } from '../model/factory.ts';
import { CLIP_STORE, copyBlocks, pasteBlocks } from '../model/clipboard.ts';
import { decodeFactory, encodeFactory } from '../model/factorystate.ts';
import type { PickerEntry, PickerFilter } from '../model/picker.ts';
import { Picker } from './Picker.tsx';
import { EmptyInvite } from './FirstHint.tsx';
import { TourHelp, openTour, useTourAnchor } from './Tour.tsx';
import { Legend } from './Legend.tsx';
import { Layers } from './Layers.tsx';
import { cleanViewLayers, hitGeo, type MapLayers, type ViewLayers } from '../model/map/layers.ts';
import { ChipPopover } from './ChipPopover.tsx';
import { SPECIAL_ICON, iconImage } from './icons.ts';
import { FLASH_MS, PORT_ZOOM, drawScene, readTheme, type CardText, type DrawOpts, type MapTheme } from './mapDraw.ts';
import { MapPanel, type Sheet } from './MapPanel.tsx';
import { badgeText, blockIcon, blockName, rateText, sizeText } from './format.ts';
import { blockBadges, type Badge } from '../model/badges.ts';
import { selIds, selKey as keyOfSel, stagesSel, toggleStage, type Selection, type ViewMode } from './selection.ts';

interface Props {
  view: ViewMode;   // Montar (cartões) ou Planta em escala; a troca anima
  factory: Factory; flow: FlowResult; data: GameData; lang: string; meioList: Meio[]; results: Map<string, MeioResult | null>;
  selection: Selection; onSelect: (s: Selection) => void; onOpenStage: (id: string) => void; dispatch: (a: Action) => void;
  onOpenLig: (id: string) => void;   // abre o modal da ligação
  onImportFile: (f: File) => void;   // importar do Modeler (botão do painel)
  onSplit: (ids: StageId[]) => void;   // separar a seleção numa fábrica nova (o App cuida da lista)
  onView: (v: ViewMode) => void;   // "Ver em escala" / "Voltar a montar" no painel
  problems: PortState[];   // faltas, sobras e travados do Balanço (o App já calcula), para os avisos do painel
  ref?: Ref<MapViewHandle>;
}

// O que o App pede ao mapa: ir até uma porta (a faixa Balanço, "N faltas"/"N sobras").
export interface MapViewHandle {
  focusPort: (block: StageId, side: 'in' | 'out', item: ItemId) => void;
  importFactory: (f: Factory) => void;   // substitui a fábrica (desfazível) e enquadra tudo
  openFactory: (f: Factory) => void;   // abre outra fábrica da lista (histórico novo) e enquadra tudo
}

// A câmera vale para a sessão: voltar ao mapa mantém o enquadramento; a primeira abertura mostra tudo.
// camMoved: o usuário já mexeu na câmera (aí ela não reenquadra sozinha quando os meios chegam).
let sessionCam: Camera | null = null;
let camMoved = false, refitted = false;

// Mapa vazio: a origem no centro, de perto (enquadrar um retângulo vazio daria o zoom máximo).
const EMPTY_ZOOM = 2;
const fitAll = (b: Rect, w: number, h: number): Camera =>
  (b.w || b.h ? fitPlanta(b, w, h) : { x: -w / 2 / EMPTY_ZOOM, y: -h / 2 / EMPTY_ZOOM, zoom: EMPTY_ZOOM });

const WHEEL_ZOOM = 0.0015;   // o mesmo fator do workbench.js
const BUTTON_ZOOM = 1.25;
const LINE_PX = 16;
const CLICK_PX = 4;   // até aqui o ponteiro só clicou; passou disso, arrasta
const PANEL_STORE = 'sf-balancer:planner-panel';   // painel aberto sem seleção (lembrado neste navegador)
const LAYERS_STORE = 'sf-balancer:planner-layers';   // camadas do mapa (lembradas neste navegador, não no Factory)
// Ícone dos controles do mapa: só aparece no celular, no lugar do texto.
const ctrlIco = (d: string) => <svg className="pl-ctrl-ico" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>;
const TOGETHER_STORE = 'sf-balancer:planner-together';   // "Mover junto" (lembrado neste navegador; padrão desligado)
const FIX_GAP = 48;   // px de tela entre o bloco e o bloco que o conserto cria
const PICKER_W = 380;   // largura do seletor, para abri-lo à esquerda de uma entrada
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
// Ir até um problema: a câmera anda em FOCUS_MS e o cartão e a porta piscam por FLASH_MS.
const FOCUS_MS = 300;
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
    const outs = b.kind === 'recipe' ? (data.recipes[b.recipe]?.outs ?? []).map(x => x.item) : isSource(b) ? [b.item] : [];
    for (const item of outs) out[item] ??= fluid(item) ? th.holo : th.ficsit;
  }
  return out;
}

// O cartão da Montar de um bloco, no idioma atual.
function cardText(b: Block, data: GameData, flow: FlowResult, bs: Badge[]): CardText {
  const spec = cardSpec(b, data, flow), bf = flow.blocks[b.id];
  const unitOf = (fluid: boolean) => t(fluid ? 'plPerMinFluid' : 'plPerMin', '').trim();
  const base = { ins: spec.ins, outs: spec.outs, icon: blockIcon(b, data), alt: false, fixed: false, clock: null, count: '', sub: '', rate: '', unit: '' };
  if (b.kind === 'generator') {
    // Gerador: o prédio com o combustível no canto, quantos e os MW grandes.
    const g = data.generators?.[b.building], n = bf?.machines;
    const building = (typeof n === 'number' ? `${fmt(n, 0)} × ` : '') + (data.items[b.fuel]?.name ?? b.fuel) + (b.clock && b.clock !== 100 ? ` · ${fmt(b.clock)}%` : '');
    const mw = bf?.x == null ? null : bf.x * (g?.power ?? 0);
    return { ...base, badge: b.fuel, title: g?.name ?? b.building, building, marker: true, rate: mw === null ? t('plUnbounded') : fmt(mw), unit: mw === null ? '' : 'MW' };
  }
  if (b.kind !== 'recipe') {
    // Origem: o que sai; sobra: a soma do que chega.
    const src = isSource(b);
    const ports = (src ? bf?.outs : bf?.ins) ?? [];
    const rate = ports.some(p => p.rate === null) ? null : ports.reduce((s, p) => s + (p.rate ?? 0), 0);
    const fluid = ports.length > 0 && ports.every(p => !!data.items[p.item]?.fluid);
    const n = b.kind === 'extractor' ? bf?.extractors : null;
    const building = b.kind === 'miner' ? t('plMiner') : b.kind === 'input' ? t('plInputSub') : b.kind === 'extractor'
      ? (typeof n === 'number' ? `${fmt(n, 0)} × ` : '') + (data.extractors[b.building]?.name ?? b.building) + (b.clock && b.clock !== 100 ? ` · ${fmt(b.clock)}%` : '') : '';
    const title = src ? data.items[b.item]?.name ?? b.item : blockName(b, data);
    // O ícone é o prédio (o item na Entrada) e o canto leva o outro: Oil Extractor e Resource Well não se confundem.
    const badge = b.kind === 'miner' || b.kind === 'extractor' ? b.item : b.kind === 'input' ? SPECIAL_ICON.container : null;
    return { ...base, badge, title, building, marker: true, rate: rate === null ? t('plUnbounded') : fmt(rate), unit: rate === null ? '' : unitOf(fluid) };
  }
  const s = solvedStage(b, bf), r = data.recipes[s.recipe];
  const stalled = bs.some(x => x.kind === 'stalled' || x.kind === 'deadlock');
  // Como no Modeler: o número grande são as máquinas rodando no clock do bloco, quebradas (29,15). Fixado: embaixo
  // "de 30" quando roda menos; livre: quantas construir e o clock delas.
  const fixedN = b.limits?.machines, run = bf?.x == null ? null : bf.x * 100 / b.clock;
  const count = bf?.unbounded ? t('plUnbounded') : stalled ? t('plCardStalled') : fmt(run ?? 0, 2);
  let sub: string, clock: string | null;
  if (fixedN !== undefined) {
    sub = run !== null && !stalled && run < fixedN - 0.005 ? t('plCardOf', fmt(fixedN, 0)) : t('plCardFixed');
    clock = b.clock !== 100 ? `${fmt(b.clock)}%` : null;
  } else {
    sub = bf?.unbounded || stalled ? t('plCardMachines') : t('plCardBuild', fmt(s.machines, 0));
    const rc = bf?.runClock;
    clock = rc != null && s.machines > 0 && Math.abs(rc - 100) > 0.05 ? `${fmt(rc, 1)}%` : null;
  }
  return {
    // O prédio com o produto principal no canto: de longe, só os ícones dizem o que o bloco faz.
    ...base, title: r.name, building: data.buildings[r.building]?.name ?? r.building, icon: r.building, badge: r.outs[0]?.item ?? null, alt: r.alt, marker: false,
    count, sub, fixed: fixedN !== undefined, clock,
  };
}

export function MapView({ view: mode, factory: f, flow, data, lang, meioList, results, selection, onSelect, onOpenStage, dispatch, onOpenLig, onView, problems, onImportFile, onSplit, ref }: Props) {
  // Destacados no desenho: os blocos (um ou vários) ou a ligação.
  const selected = useMemo(() => selIds(selection), [selection]);
  const selStage = selection?.kind === 'stage' ? selection.id : null;
  const selMany = selection?.kind === 'stages' ? selection.ids : null;
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
  // basePlaces: as da Planta; montarBase: as da Montar (as dela, senão as da Planta). Cada vista mexe só nas suas.
  const basePlaces = useMemo(() => placesOf(f, data, geos, flow), [f, data, geos, flow]);
  const montarBase = useMemo(() => montarPlaces(f, basePlaces), [f, basePlaces]);
  const viewBase = montar ? montarBase : basePlaces;
  // Arrastando vários blocos (seleção múltipla): as posições provisórias de todos (na vista atual).
  const [moving, setMoving] = useState<{ kind: 'block'; id: StageId; place: MapPlace } | { kind: 'meio'; id: string; place: LigPlace }
    | { kind: 'blocks'; places: Record<StageId, MapPlace> } | null>(null);
  const movedIn = (base: Record<StageId, MapPlace>) => (moving?.kind === 'block' ? withPlace(base, moving.id, moving.place)
    : moving?.kind === 'blocks' ? { ...base, ...moving.places } : base);
  const places = useMemo(() => (montar ? basePlaces : movedIn(basePlaces)), [basePlaces, moving, montar]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo((): Factory => {
    if (!moving) return f;
    // Arrastando a ligação na Planta, os chips da Montar ficam onde estão (os que seguiam as ligs, presos nelas).
    if (moving.kind === 'meio') return montar
      ? { ...f, montarLigs: { ...(f.montarLigs ?? f.ligs), [moving.id]: moving.place } }
      : { ...f, ligs: { ...f.ligs, [moving.id]: moving.place }, montarLigs: f.montarLigs ?? { ...f.ligs } };
    // Arrastando na Planta, a Montar fica onde está (sem isso, quem a segue andaria junto com a posição provisória).
    return { ...f, montar: montar ? movedIn(montarBase) : montarBase };
  }, [f, moving, montar, montarBase]);   // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useMemo(() => buildScene(shown, data, places, geos, flow), [shown, data, places, geos, flow]);
  // "Mover junto": arrastar (setas, girar não) numa vista leva o mesmo deslocamento à outra.
  const [together, setTogetherState] = useState(() => { try { return localStorage.getItem(TOGETHER_STORE) === '1'; } catch { return false; } });
  const setTogether = (v: boolean) => {
    setTogetherState(v);
    try { localStorage.setItem(TOGETHER_STORE, v ? '1' : '0'); } catch { /* sem storage: vale só nesta visita */ }
  };
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
  // Toda edição grava todas as posições da vista de uma vez: ela fica fixa inteira num passo só do desfazer.
  const setPlaces = (ps: Record<StageId, MapPlace>, view: ViewMode = mode) =>
    dispatch({ type: 'setPlaces', places: ps, view, together, auto: basePlaces });
  const place = (id: StageId, p: MapPlace) => setPlaces(withPlace(viewBase, id, p));
  // O painel (lado das entradas, giro e vãos) mexe no bloco real: sempre na Planta.
  const placePlanta = (id: StageId, p: MapPlace) => setPlaces(withPlace(basePlaces, id, p), 'planta');
  // Propor de novo: a vista atual inteira, inclusive as ligações postas nela (voltam ao automático), num passo só.
  const propose = () => dispatch({ type: 'proposeMap', places: proposeMap(f, data, geos, flow), view: mode, auto: basePlaces });
  // Tamanho do retângulo da ligação no giro dado (a cena o tem no giro da Planta).
  const ligSize = (id: string, rot: number) => {
    const m = scene.meios.find(x => x.meio === id);
    if (!m) return { w: 0, h: 0 };
    return (rot - m.rot) % 2 ? { w: m.rect.h, h: m.rect.w } : { w: m.rect.w, h: m.rect.h };
  };
  // Onde a ligação está agora (posta ou colada) em cada vista: o canto do retângulo e o giro. Na Montar, sem posição
  // lá, o chip desenhado no último quadro (entre as portas).
  const ligAtPlanta = (id: string): LigPlace | null => {
    const m = scene.meios.find(x => x.meio === id);
    return m ? { x: m.rect.x, y: m.rect.y, rot: m.rot } : null;
  };
  const ligAtMontar = (id: string): LigPlace | null => {
    const saved = montarLig(f, id);
    if (saved) return saved;
    const m = scene.meios.find(x => x.meio === id), ch = lastView.current?.chips.find(x => x.meio === id), c = cam.current;
    return m && ch && c && tNow.current === 0 ? { ...chipWorld(c, ch.x, ch.y, ligSize(id, m.rot)), rot: m.rot } : null;
  };
  const ligAt = (id: string) => (montar ? ligAtMontar(id) : ligAtPlanta(id));
  const placeLig = (id: string, p: LigPlace | null, view: ViewMode = mode) =>
    dispatch({ type: 'placeLig', meio: id, place: p, view, together, shown: { planta: ligAtPlanta(id), montar: ligAtMontar(id) } });


  // Painel no desktop: sem seleção aparece só se a pessoa o abriu (lembrado); uma seleção nova o abre, e fechar com algo
  // selecionado vale até a seleção mudar. No celular é a folha de baixo: a seleção nova a sobe até a meia altura.
  const [panelPref, setPanelPref] = useState(() => { try { return localStorage.getItem(PANEL_STORE) === '1'; } catch { return false; } });
  const [panelSel, setPanelSel] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<Sheet>('peek');
  const selKey = keyOfSel(selection);
  const [seenSel, setSeenSel] = useState(selKey);
  if (seenSel !== selKey) {
    setSeenSel(selKey);
    setPanelSel(selKey ? true : null);
    if (selKey && sheet === 'peek') setSheet('half');
  }
  const panelOpen = panelSel ?? panelPref;
  // Camadas: ícones, nomes, ligações e portas (padrão tudo ligado), uma escolha por vista.
  const [viewLayers, setViewLayers] = useState<ViewLayers>(() => {
    try { return cleanViewLayers(JSON.parse(localStorage.getItem(LAYERS_STORE) ?? 'null')); } catch { return cleanViewLayers(null); }
  });
  const layers = viewLayers[mode];
  const setLayers = (v: MapLayers) => {
    const next = { ...viewLayers, [mode]: v };
    setViewLayers(next);
    try { localStorage.setItem(LAYERS_STORE, JSON.stringify(next)); } catch { /* sem storage: vale só nesta visita */ }
  };
  const togglePanel = () => {
    if (selKey) { setPanelSel(!panelOpen); return; }
    setPanelPref(!panelOpen);
    try { localStorage.setItem(PANEL_STORE, panelOpen ? '0' : '1'); } catch { /* sem storage: vale só nesta visita */ }
  };

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera | null>(sessionCam);
  const size = useRef({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [theme, setTheme] = useState<MapTheme | null>(null);
  // Mini painel do chip: a ligação dele (só vale enquanto ela é a selecionada).
  const [popId, setPopId] = useState<string | null>(null);
  // Destaque passageiro do cartão e da porta (ir até um problema).
  const [flash, setFlash] = useState<DrawOpts['flash']>(null);
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
  // Vários blocos selecionados: o que ocupam na Planta, com a medida em fundações.
  const selBox = useMemo(() => {
    const r = selection?.kind === 'stages' ? selectionBox(scene, selection.ids, meioList) : null;
    return r ? { r, text: sizeText(r) } : null;
  }, [selection, scene, meioList, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
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
    flash, layers, selBox,
    blockText: id => {
      const b = byId.get(id)!, bf = flow.blocks[id], icon = blockIcon(b, data);
      // Travado: o motivo à parte (o canvas decide onde ele aparece); loop travado no título.
      const bs = badges.get(id) ?? [], stall = bs.find(x => x.kind === 'stalled');
      const alert = stall ? badgeText(stall, b, data, true) : '';
      const lock = bs.some(x => x.kind === 'deadlock') ? ` · ${t('plDeadlockShort')}` : '';
      if (b.kind !== 'recipe') {
        // Origem: o que sai; sobra: o que chega, por item.
        const n = b.kind === 'extractor' ? bf?.extractors : b.kind === 'generator' ? bf?.machines : undefined;
        const title = blockName(b, data) + (typeof n === 'number' ? ` × ${fmt(n, 0)}` : '');
        if (b.kind === 'generator') {
          const mw = (bf?.x ?? 0) * (data.generators?.[b.building]?.power ?? 0);
          return { title: title + lock, sub: t('plPowerMW', fmt(mw)), icon, alert };
        }
        const ports = (isSource(b) ? bf?.outs : bf?.ins) ?? [];
        const sub = ports.map(p => (p.rate === null ? t('plUnbounded') : rateText(data.items[p.item], p.rate))).join(' · ');
        return { title: (bf?.unbounded ? `${title} · ${t('plUnbounded')}` : title) + lock, sub, icon, alert };
      }
      const s = solvedStage(b, bf), r = data.recipes[s.recipe], bd = data.buildings[r.building];
      const num = bf?.unbounded ? t('plUnbounded') : fmt(s.machines, 0);
      const rs = rowsSummary(s, data), sub = t('plRowsAria', fmt(rs.rows, 0), fmt(rs.per, 0), bd.name);
      // Placa da Planta: o ícone do prédio, a receita e o número em laranja.
      return { title: r.name + lock, num, sub, icon: r.building, alert };
    },
  }, [selected, hover, colors, theme, byId, flow, data, lang, hoverPort, wire, lit, badges, portStateMap, chips, meioById, cards, flash, layers, selBox]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A vista: t vai de 0 (Montar) a 1 (Planta) em TRANS_MS ao trocar; a câmera usa os limites de zoom da vista atual.
  const tNow = useRef(montar ? 0 : 1);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const limits = () => viewLimits(modeRef.current === 'montar');

  // Desenho num requestAnimationFrame: vários pedidos no mesmo quadro viram um desenho só. A Montar anima o tracejado
  // das esteiras (até 30 quadros/s) enquanto alguma aparece, parado com movimento reduzido, com a aba escondida ou se um
  // quadro passar de 12 ms. Tudo que o quadro lê vem daqui (o timer da animação chama um draw de um render antigo).
  const latest = useRef({ scene, opts, f: shown, data, flow, popId, meios: meioById });
  latest.current = { scene, opts, f: shown, data, flow, popId, meios: meioById };
  const lastView = useRef<ViewGeo | null>(null);
  // A geometria de tela só muda com a cena, a câmera, t, o celular, as ligações e o tamanho: guardada entre os quadros
  // da animação (a chave usa o mapa das ligações, estável, e não a função o.meio, refeita a cada hover ou arraste).
  const geoMemo = useRef<{ key: unknown[]; v: ViewGeo; belts: boolean } | null>(null);
  const geoFor = (sc: Scene, c: Camera, T: number, fs: Factory, dt: GameData, fl: FlowResult, meios: Map<string, Meio>) => {
    const { w, h } = size.current, key = [sc, c, T, phone.current, fs, dt, fl, meios, w, h];
    const g = geoMemo.current;
    if (g && g.key.length === key.length && g.key.every((k, i) => k === key[i])) return g;
    const v = viewGeo(sc, c, T, phone.current, fs, dt, fl);
    return (geoMemo.current = { key, v, belts: T < 1 && beltsOnScreen(v, id => meios.get(id), w, h) });
  };
  // Mini painel abaixo do chip (ou acima, se não couber), dentro da área do mapa; some se o chip sumir ou sair da tela.
  // O tamanho dele vem guardado (medido ao abrir e pelo ResizeObserver), sem ler o layout a cada quadro.
  const popSize = useRef({ w: 0, h: 0 });
  const placePop = () => {
    const el = popEl.current, v = lastView.current, id = latest.current.popId;
    if (!el || !v || !id) return;
    const ch = v.chips.find(x => x.meio === id), { w, h } = size.current;
    const off = !ch || ch.x < 0 || ch.y < 0 || ch.x > w || ch.y > h;
    if (el.hidden !== off) el.hidden = off;
    if (off) return;
    const { w: pw, h: ph } = popSize.current, gap = 8;
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
    const el = canvas.current, c = cam.current, { scene: sc, opts: o, f: fs, data: dt, flow: fl, meios } = latest.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !c || !o || !size.current.w) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const T = tNow.current, A = anim.current;
    const { v: view, belts } = geoFor(sc, c, T, fs, dt, fl, meios);
    lastView.current = view;
    const moving = belts && o.layers.links && !document.hidden && !reduced.current;
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
  // (na hora com movimento reduzido). Se nenhum bloco da nova vista fica na tela (as posições das duas são próprias),
  // vai ao bloco selecionado no lugar dele lá, ou enquadra a nova vista.
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) { firstMode.current = false; return; }
    const to = mode === 'planta' ? 1 : 0, from = tNow.current;
    if (cam.current) {
      setCam(cam.current);
      const { w, h } = size.current, { scene: sc, f: fs, data: dt, flow: fl } = latest.current;
      if (w && cam.current) {
        const v = viewGeo(sc, cam.current, to, phone.current, fs, dt, fl);
        setCam(switchCam(v, cam.current, w, h, selStage) ?? fitView());
      }
    }
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
    // Trocou de novo no meio: a próxima animação parte do t de agora.
    return () => cancelAnimationFrame(id);
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
  // Sem a camada das ligações não há chip para o mini painel ficar junto (o painel lateral tem as mesmas ações).
  const popMeio = popId && layers.links && selection?.kind === 'meio' && selection.id === popId ? meioById.get(popId) : undefined;
  useLayoutEffect(() => {
    const el = popEl.current;
    if (!el) return;
    popSize.current = { w: el.offsetWidth, h: el.offsetHeight };
    placePop();
    // Escondido mede 0: guarda só tamanho de verdade.
    const ro = new ResizeObserver(([en]) => {
      const b = en?.borderBoxSize?.[0], pw = b ? b.inlineSize : el.offsetWidth, ph = b ? b.blockSize : el.offsetHeight;
      if (pw && ph) { popSize.current = { w: pw, h: ph }; placePop(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [popMeio?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Seleção foi para outra coisa (clique, painel, desfazer): o painel não volta sozinho depois.
  useEffect(() => {
    if (popId && !(selection?.kind === 'meio' && selection.id === popId)) setPopId(null);
  }, [selection?.kind, selection?.kind === 'meio' ? selection.id : null]);   // eslint-disable-line react-hooks/exhaustive-deps
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
    shift: boolean;   // Shift no aperto: clique põe ou tira da seleção; no vazio, arrastar desenha o retângulo
    group: Record<StageId, MapPlace> | null; moved2: Record<StageId, MapPlace> | null;   // vários blocos: de onde e para onde
    marquee: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState<'pan' | 'block' | 'link' | 'marquee' | null>(null);
  // Retângulo de seleção (Shift + arrastar no vazio), em px do mapa.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
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
  // De longe (nas duas vistas), as portas não aparecem (a não ser puxando uma) e não pegam o ponteiro; na Montar, nem
  // os chips.
  const portsLive = () => {
    const c = cam.current;
    return !!c && ((tNow.current < 0.5 ? !montarFar(tNow.current, c.zoom) : c.zoom >= PORT_ZOOM) || !!drag.current?.port);
  };
  // O que está sob o ponteiro, pela geometria de tela do último quadro: porta, chip, cartão/bloco; na Planta, o corpo
  // da ligação também vale como ela. Camada desligada não pega o ponteiro.
  const hitAt = (e: React.PointerEvent | React.MouseEvent): ViewHit => {
    const v = lastView.current, c = cam.current;
    if (!v || !c) return null;
    const [x, y] = local(e);
    const h = viewHit(hitGeo(v, layers, portsLive(), !montarFar(tNow.current, c.zoom)), x, y);
    if (h || tNow.current < 0.5 || !layers.links) return h;
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
    const from = hit?.kind === 'block' ? viewBase[hit.id] ?? null : hit?.kind === 'meio' ? ligAt(hit.id) : null;
    const ch = hit?.kind === 'meio' ? lastView.current?.chips.find(x => x.meio === hit.id) : undefined;
    // Bloco que faz parte da seleção múltipla: arrastar leva todos.
    const group = hit?.kind === 'block' && selMany?.includes(hit.id)
      ? Object.fromEntries(selMany.filter(id => viewBase[id]).map(id => [id, viewBase[id]])) : null;
    drag.current = {
      id: e.pointerId, button: e.button, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, hit, from, to: null, port,
      // Shift ou Ctrl/⌘ + clique põe ou tira o bloco da seleção; Shift ou Ctrl/⌘ + arrastar no vazio, o retângulo.
      chip: ch ? [ch.x, ch.y] : null, shift: e.shiftKey || e.ctrlKey || e.metaKey, group, moved2: null,
      marquee: e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey) && !h,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointer.current = local(e);
    const d = drag.current, c = cam.current;
    if (!c) return;
    if (d && d.id === e.pointerId) {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_PX) return;
        d.moved = true;
        setDragging(d.marquee ? 'marquee' : d.port ? 'link' : d.from ? 'block' : 'pan');
        if (d.hit?.kind === 'meio') setPopId(null);
      }
      if (d.marquee) {
        const r = e.currentTarget.getBoundingClientRect();
        setMarquee({ x0: d.x0 - r.left, y0: d.y0 - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top });
      } else if (d.port) {
        const w = worldAt(e);
        if (w) setWire({ from: d.port, to: w });
        const over = portUnder(e);
        if ((over && portKey(over)) !== (hoverPort && portKey(hoverPort))) setHoverPort(over);
      } else if (d.from && d.hit) {
        const dx = e.clientX - d.x0, dy = e.clientY - d.y0, { id, kind } = d.hit;
        let p: LigPlace;
        if (kind === 'block' && d.group) {
          // Vários: o bloco puxado vai preso na grade e os outros andam o mesmo tanto (mantêm a distância entre si).
          const a = dragged(d.from as MapPlace, dx / c.zoom, dy / c.zoom), mx = a.x - d.from.x, my = a.y - d.from.y;
          if (!d.moved2 || d.moved2[id]?.x !== a.x || d.moved2[id]?.y !== a.y) {
            const next = Object.fromEntries(Object.entries(d.group).map(([k, q]) => [k, { ...q, x: q.x + mx, y: q.y + my }]));
            d.moved2 = next;
            setMoving({ kind: 'blocks', places: next });
          }
          d.x = e.clientX; d.y = e.clientY;
          return;
        }
        if (kind === 'block') p = dragged(d.from as MapPlace, dx / c.zoom, dy / c.zoom);
        else {
          // O centro do chip segue o ponteiro; o retângulo da ligação vai junto, preso na grade, com o giro dela.
          const sz = ligSize(id, d.from.rot);
          const [cx, cy] = d.chip ?? [(d.from.x - c.x + sz.w / 2) * c.zoom, (d.from.y - c.y + sz.h / 2) * c.zoom];
          p = { ...chipWorld(c, cx + dx, cy + dy, sz), rot: d.from.rot };
        }
        d.to = p;
        setMoving(m => (m && m.kind !== 'blocks' && m.id === id && m.place.x === p.x && m.place.y === p.y ? m
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
    setMarquee(null);
    if (cancel) return;
    if (d.marquee) {
      // Shift + arrastar no vazio: os blocos cujo retângulo na tela cruza o retângulo; Shift + clique no vazio não muda nada.
      if (!d.moved) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x0 = Math.min(d.x0, e.clientX) - r.left, x1 = Math.max(d.x0, e.clientX) - r.left;
      const y0 = Math.min(d.y0, e.clientY) - r.top, y1 = Math.max(d.y0, e.clientY) - r.top;
      const ids = (lastView.current?.blocks ?? []).filter(b => b.rect.x <= x1 && b.rect.x + b.rect.w >= x0 && b.rect.y <= y1 && b.rect.y + b.rect.h >= y0).map(b => b.id);
      setPopId(null);
      onSelect(stagesSel(ids));
      return;
    }
    if (!d.moved) {
      if (d.button !== 0) return;
      // Shift + clique num bloco (ou numa porta dele): põe ou tira da seleção.
      const shiftId = d.shift ? (d.port ? d.port.block : d.hit?.kind === 'block' ? d.hit.id : null) : null;
      if (shiftId) { setPopId(null); onSelect(toggleStage(selection, shiftId)); return; }
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
      } else if (d.group) {
        // Vários: todas as posições num passo só do desfazer; a seleção continua.
        if (d.moved2) setPlaces({ ...viewBase, ...d.moved2 });
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
  // Vários de uma vez: um passo só do desfazer.
  const removeMany = (ids: StageId[]) => {
    dispatch({ type: 'removeBlocks', ids });
    onSelect(null);
    canvas.current?.focus();
  };
  // Ctrl/⌘+A ou o botão do painel: todos os blocos (sem blocos, nada).
  const selectAll = () => {
    if (!f.blocks.length) return;
    setPopId(null);
    onSelect(stagesSel(f.blocks.map(b => b.id)));
  };
  // Teclado com vários blocos: setas movem todos 8 m (um passo do desfazer), Delete ou Backspace apaga todos, Esc solta.
  const manyKey = (e: React.KeyboardEvent, ids: StageId[]) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); onSelect(null); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeMany(ids); return; }
    const moved: Record<StageId, MapPlace> = {};
    for (const id of ids) { const n = viewBase[id] ? nudged(viewBase[id], e.key) : null; if (n) moved[id] = n; }
    if (!Object.keys(moved).length) return;
    e.preventDefault();
    setPlaces({ ...viewBase, ...moved });
  };

  // Teclado no bloco (na lista do painel ou no canvas): setas movem 8 m, R gira, Enter abre a etapa, Delete ou
  // Backspace apaga (desfazível), Esc solta.
  const blockKey = (e: React.KeyboardEvent, id: StageId | null) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { if (selection) { e.preventDefault(); onSelect(null); } return; }
    if (!id || !viewBase[id]) return;
    const cur = viewBase[id];
    if (e.key === 'Enter') { e.preventDefault(); onOpenStage(id); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(id);
      return;
    }
    // R gira o bloco real (na Planta, também vendo a Montar, como o Girar do painel); as setas andam na vista atual.
    const turn = e.key === 'r' || e.key === 'R';
    const next = turn ? (basePlaces[id] ? rotated(basePlaces[id]) : null) : nudged(cur, e.key);
    if (!next) return;
    e.preventDefault();
    if (selStage !== id) onSelect({ kind: 'stage', id });
    if (turn) placePlanta(id, next); else place(id, next);
  };

  // Teclado com a ligação selecionada: setas movem 8 m, R gira (a partir de onde ela está, posta ou colada), Enter abre
  // o mini painel, Delete ou Backspace desliga (desfazível), Esc fecha o painel ou solta.
  const ligKey = (e: React.KeyboardEvent, id: string) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); if (popMeio) closePop(true); else onSelect(null); return; }
    if (e.key === 'Enter') { e.preventDefault(); setPopId(id); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); unlink(id); return; }
    // R gira a ligação na Planta (o chip da Montar fica onde está); as setas andam na vista atual.
    if (e.key === 'r' || e.key === 'R') {
      const cur = ligAtPlanta(id);
      if (!cur) return;
      e.preventDefault();
      placeLig(id, ligRotated(cur), 'planta');
      return;
    }
    const cur = ligAt(id), next = cur && nudged(cur, e.key);
    if (!next) return;
    e.preventDefault();
    placeLig(id, next);
  };
  // Copiar e colar: Ctrl/⌘+C copia os blocos selecionados (com as ligações entre eles) para o navegador, Ctrl/⌘+V cola
  // onde o ponteiro está (sem ponteiro no mapa, ao lado do original) e seleciona o que colou, Ctrl/⌘+D duplica.
  const pointer = useRef<Pt | null>(null);
  const selIdsNow = (): StageId[] => (selection?.kind === 'stage' ? [selection.id] : selection?.kind === 'stages' ? selection.ids : []);
  const copySel = (): boolean => {
    const clip = copyBlocks(f, selIdsNow(), basePlaces, montarBase);
    if (!clip) return false;
    try { localStorage.setItem(CLIP_STORE, encodeFactory(clip)); } catch { /* sem storage */ }
    setClipNote(t('plClipCopied', fmt(clip.blocks.length, 0)));
    return true;
  };
  const pasteClip = (here: boolean) => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(CLIP_STORE); } catch { /* sem storage */ }
    const clip = raw ? decodeFactory(raw, data) : null;
    if (!clip?.blocks.length) { setClipNote(t('plPasteEmpty')); return; }
    const c = cam.current, p = pointer.current, { w, h } = size.current;
    const at = here && c && p && p[0] >= 0 && p[1] >= 0 && p[0] <= w && p[1] <= h ? screenToWorld(c, p[0], p[1]) : null;
    const r = pasteBlocks(f, clip, data, modeRef.current, at);
    if (!r.ids.length) { setClipNote(t('plPasteFull')); return; }
    dispatch({ type: 'load', factory: r.factory });
    onSelect(r.ids.length === 1 ? { kind: 'stage', id: r.ids[0] } : stagesSel(r.ids));
    setClipNote(t('plPasted', fmt(r.ids.length, 0)));
    canvas.current?.focus();
  };
  const [clipNote, setClipNote] = useState('');
  useEffect(() => { if (!clipNote) return; const id = window.setTimeout(() => setClipNote(''), 2500); return () => clearTimeout(id); }, [clipNote]);
  const canvasKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); selectAll(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'c') { if (copySel()) e.preventDefault(); return; }
      if (k === 'v') { e.preventDefault(); pasteClip(true); return; }
      if (k === 'd') { e.preventDefault(); if (copySel()) pasteClip(false); return; }
    }
    if (selection?.kind === 'meio') ligKey(e, selection.id);
    else if (selection?.kind === 'stages') manyKey(e, selection.ids);
    else blockKey(e, selStage);
  };

  // Aviso clicado no painel: a câmera vai até ele.
  const focus = (r: Rect) => { const c = cam.current; if (c && size.current.w) moveCam(centerOn(c, r, size.current.w, size.current.h)); };

  const zoomCenter = (k: number) => { const c = cam.current; if (c) moveCam(zoomAt(c, k, size.current.w / 2, size.current.h / 2, limits())); };
  const showAll = () => { if (size.current.w) moveCam(fitView()); };

  // Ir até uma porta (faixa Balanço): seleciona o bloco, leva a câmera até ele em FOCUS_MS (na hora com movimento
  // reduzido; na Montar, de longe, aproxima até 90 % do zoom de referência) e pisca o cartão e a porta por FLASH_MS.
  const camAnim = useRef(0);
  useEffect(() => () => cancelAnimationFrame(camAnim.current), []);
  const focusPort = (block: StageId, side: 'in' | 'out', item: ItemId) => {
    const c = cam.current, { w, h } = size.current, sb = scene.blocks.find(x => x.stage === block), b = byId.get(block);
    onSelect({ kind: 'stage', id: block });
    setPopId(null);
    setFlash({ id: block, port: `${block}|${side}|${item}`, until: Date.now() + FLASH_MS });
    if (!c || !w || !sb || !b) return;
    const isMontar = modeRef.current === 'montar';
    const z1 = isMontar && c.zoom < MONTAR_REF * 0.7 ? MONTAR_REF * 0.9 : c.zoom;
    // Centro do que se vê: o cartão (tamanho de tela, no lugar da Montar) na Montar, o bloco real na Planta.
    let cx = sb.rect.x + sb.rect.w / 2, cy = sb.rect.y + sb.rect.h / 2;
    if (isMontar) {
      const sz = blockCardSize(b, data, flow), k = cardScale(z1, phone.current) / z1;
      cx = sb.card[0] + sz.w * k / 2; cy = sb.card[1] + sz.h * k / 2;
    }
    const to: Camera = { x: cx - w / 2 / z1, y: cy - h / 2 / z1, zoom: z1 };
    cancelAnimationFrame(camAnim.current);
    camMoved = true;
    if (reduced.current) { setCam(to); return; }
    // Anda o centro da tela e o zoom (o canto da câmera depende dos dois).
    const fx = c.x + w / 2 / c.zoom, fy = c.y + h / 2 / c.zoom, t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / FOCUS_MS), e = 1 - (1 - k) ** 3;
      const z = c.zoom + (z1 - c.zoom) * e, x = fx + (cx - fx) * e, y = fy + (cy - fy) * e;
      setCam(k < 1 ? { x: x - w / 2 / z, y: y - h / 2 / z, zoom: z } : to);
      if (k < 1) camAnim.current = requestAnimationFrame(step);
    };
    camAnim.current = requestAnimationFrame(step);
  };
  // Importar (do Modeler): troca a fábrica num passo só do desfazer e enquadra tudo quando a cena nova chega (e de novo
  // quando os meios chegam, como na abertura).
  const fitNext = useRef(false);
  useEffect(() => { if (fitNext.current && size.current.w) { fitNext.current = false; setCam(fitView()); } }, [scene]);   // eslint-disable-line react-hooks/exhaustive-deps
  const importFactory = (nf: Factory) => {
    fitNext.current = true; camMoved = false; refitted = false;
    onSelect(null);
    dispatch({ type: 'load', factory: nf });
  };
  const openFactory = (nf: Factory) => {
    fitNext.current = true; camMoved = false; refitted = false;
    onSelect(null);
    dispatch({ type: 'reset', factory: nf });
  };
  useImperativeHandle(ref, () => ({ focusPort, importFactory, openFactory }));

  // Retângulo do bloco na tela do último quadro (Montar: o cartão; Planta: o bloco).
  const viewRect = (id: StageId): Rect | null => lastView.current?.blocks.find(b => b.id === id)?.rect ?? null;
  // Onde nasce o bloco de um conserto: à direita da saída, à esquerda da entrada, na altura do bloco. É só o ponto de
  // partida: o tamanho do bloco novo não se conhece aqui (na entrada, a largura do próprio bloco serve de estimativa).
  const fixAt = (p: PortState): Pt => {
    const r = viewRect(p.block), c = cam.current;
    if (r && c) return screenToWorld(c, p.side === 'out' ? r.x + r.w + FIX_GAP : r.x - FIX_GAP - r.w, r.y);
    const sb = scene.blocks.find(b => b.stage === p.block)?.rect;
    return sb ? [p.side === 'out' ? sb.x + sb.w + 8 : sb.x - sb.w - 8, sb.y] : [0, 0];
  };
  // "Criar fonte/destino": o seletor filtrado pela porta, ao lado do bloco, como arrastar da porta para o vazio.
  const createFor = (p: PortState) => {
    const r = viewRect(p.block), { w, h } = size.current;
    const x0 = r ? (p.side === 'out' ? r.x + r.w + FIX_GAP : r.x - FIX_GAP - PICKER_W) : w / 2 - PICKER_W / 2;
    const x = clamp(x0, 8, Math.max(8, w - PICKER_W - 8)), y = clamp(r ? r.y : 56, 8, Math.max(8, h - 200));
    openPicker(x, y, { filter: p.side === 'out' ? { consumes: p.item } : { produces: p.item }, port: { block: p.block, item: p.item, side: p.side } });
    setSheet('peek');   // celular: a folha desce para o seletor aparecer
  };
  // Ver em escala: centraliza o bloco e troca para a Planta (a troca mantém o centro).
  const toScale = (id: StageId) => {
    const r = scene.blocks.find(b => b.stage === id)?.rect;
    if (r) focus(r);
    onView('planta');
  };
  // Da lista ou de um aviso do painel: seleciona, leva a câmera até lá e o foco vai para o mapa.
  // Na Montar o cartão e o chip ficam onde o último quadro os desenhou (o cartão pendurado no canto do bloco, o chip sem
  // posição salva entre as portas dos cartões), não no retângulo da Planta: a câmera anda até o centro deles na tela,
  // como focusPort, para o chip e o mini painel ficarem à vista.
  const goTo = (s: Selection) => {
    onSelect(s);
    if (s?.kind === 'stages') { canvas.current?.focus(); return; }
    const c = cam.current, v = lastView.current, { w, h } = size.current;
    const onScreen = s && v && c && w && modeRef.current === 'montar' && tNow.current === 0
      ? (s.kind === 'stage' ? v.blocks.find(b => b.id === s.id)?.rect : v.chips.find(x => x.meio === s.id)) : undefined;
    if (onScreen && c) {
      const sx = 'meio' in onScreen ? onScreen.x : onScreen.x + onScreen.w / 2, sy = 'meio' in onScreen ? onScreen.y : onScreen.y + onScreen.h / 2;
      moveCam({ x: c.x + (sx - w / 2) / c.zoom, y: c.y + (sy - h / 2) / c.zoom, zoom: c.zoom });
    } else {
      const r = s?.kind === 'stage' ? scene.blocks.find(b => b.stage === s.id)?.rect : s ? scene.meios.find(m => m.meio === s.id)?.rect : undefined;
      if (r) focus(r);
    }
    canvas.current?.focus();
  };

  // Pontos do canvas para o tutorial: a primeira saída, o primeiro chip e o primeiro cartão à vista (px da janela).
  const onCanvas = (pick: (v: ViewGeo, w: number, h: number) => { x: number; y: number; w: number; h: number } | undefined) => () => {
    const el = canvas.current, v0 = lastView.current, c = cam.current;
    if (!el || !v0 || !c) return null;
    // O que dá para pegar agora (camadas desligadas ou chips de longe não contam), como o clique.
    const v = hitGeo(v0, layers, portsLive(), !montarFar(tNow.current, c.zoom));
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;   // mapa escondido (etapa aberta)
    const b = pick(v, r.width, r.height);
    return b ? { x: r.left + b.x, y: r.top + b.y, w: b.w, h: b.h } : null;
  };
  const inside = (x: number, y: number, w: number, h: number) => x >= 0 && y >= 0 && x <= w && y <= h;
  useTourAnchor('map-port', onCanvas((v, w, h) => {
    const p = v.ports.find(q => q.side === 'out' && inside(q.x, q.y, w, h)) ?? v.ports.find(q => inside(q.x, q.y, w, h));
    return p && { x: p.x - 22, y: p.y - 22, w: 44, h: 44 };
  }));
  useTourAnchor('map-chip', onCanvas((v, w, h) => {
    const c = v.chips.find(q => inside(q.x, q.y, w, h));
    return c && { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h };
  }));
  useTourAnchor('map-block', onCanvas((v, w, h) => {
    const b = v.blocks.find(q => inside(q.rect.x + q.rect.w / 2, q.rect.y + q.rect.h / 2, w, h));
    return b && b.rect;
  }));

  const area = sizeText(scene.bounds);
  return (
    <>
      <main className="pl-center" id="pl-graph" tabIndex={-1} aria-label={t('plViewMap')}>
        <div className="pl-map" ref={wrap}>
          <canvas ref={canvas} tabIndex={0} role="img"
            className={'pl-map-canvas' + (dragging === 'marquee' ? ' marquee' : dragging === 'pan' ? ' grabbing' : dragging === 'block' ? ' moving' : dragging === 'link' || hoverPort ? ' linking' : hover ? ' over' : '')}
            aria-label={t('plMapAria', fmt(f.blocks.length, 0), area)}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={e => endDrag(e)} onPointerCancel={e => endDrag(e, true)}
            onPointerLeave={() => { if (!drag.current) { if (hover) setHover(null); if (hoverPort) setHoverPort(null); } }}
            onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} onKeyDown={canvasKey} />
          {marquee && (
            <div className="pl-marquee" aria-hidden="true" style={{
              left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
            }} />
          )}
          {!f.blocks.length && !picker && <EmptyInvite />}
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
          <TourHelp area="map" className="pl-map-help" />
          <button type="button" className={'pl-btn pl-panel-toggle' + (panelOpen ? ' on' : '')} data-tour="panel-toggle" aria-expanded={panelOpen} aria-controls="pl-inspector"
            onClick={togglePanel}>{t(panelOpen ? 'plPanelClose' : 'plPanelOpen')}</button>
          <div className="pl-map-ctrl" role="group" aria-label={t('plMapControls')}>
            <button type="button" className="pl-btn pl-map-add" data-tour="map-new" onClick={() => openPicker(size.current.w / 2 - 190, 56)}>{t('plNewBlock')}</button>
            <Layers value={layers} onChange={setLayers} />
            <Legend />
            {/* No celular, Tutorial, Mover junto e Mostrar tudo ficam só no ícone (o texto no aria-label), em duas linhas. */}
            <button type="button" className="pl-btn" data-tour="map-tour" aria-haspopup="dialog" aria-label={t('plTourAgain')} onClick={() => openTour()}>
              {ctrlIco('M9 2a7 7 0 100 14A7 7 0 009 2zM7 6v6l5-3z')}<span className="pl-ctrl-lbl">{t('plTourAgain')}</span>
            </button>
            <button type="button" className={'pl-btn pl-together' + (together ? ' on' : '')} data-tour="map-together" aria-pressed={together}
              aria-label={t('plMoveTogether')} title={t('plMoveTogetherTip')} onClick={() => setTogether(!together)}>
              {ctrlIco('M7 11l4-4M5 9L3 11a2.5 2.5 0 003.5 3.5L8.5 12.5M13 9l2-2a2.5 2.5 0 00-3.5-3.5L9.5 5.5')}<span className="pl-ctrl-lbl">{t('plMoveTogether')}</span>
            </button>
            <button type="button" className="pl-btn" onClick={() => zoomCenter(1 / BUTTON_ZOOM)} aria-label={t('plMapZoomOut')} title={t('plMapZoomOut')}>−</button>
            <button type="button" className="pl-btn" onClick={() => zoomCenter(BUTTON_ZOOM)} aria-label={t('plMapZoomIn')} title={t('plMapZoomIn')}>+</button>
            <button type="button" className="pl-btn" onClick={showAll} aria-label={t('plMapFit')} title={t('plMapFit')}>
              {ctrlIco('M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4')}<span className="pl-ctrl-lbl">{t('plMapFit')}</span>
            </button>
          </div>
        </div>
      </main>
      <span className="pl-clip-note" role="status" aria-live="polite">{clipNote}</span>
      <MapPanel factory={f} flow={flow} data={data} dispatch={dispatch} onDelete={remove} onDeleteMany={removeMany} onSelectAll={selectAll}
        onClearSel={() => { onSelect(null); canvas.current?.focus(); }} onSplit={onSplit}
        onCopy={() => { copySel(); }} onPaste={() => pasteClip(false)} onDuplicate={() => { if (copySel()) pasteClip(false); }} meioList={meioList} scene={scene} places={places}
        selection={selection} problems={problems} view={mode} open={panelOpen} sheet={sheet} onSheet={setSheet}
        chip={id => chips.get(id) ?? null} results={results}
        onPlace={placePlanta} onPropose={propose} onFocus={focus} onGo={goTo}
        onGoPort={q => { focusPort(q.block, q.side, q.item); canvas.current?.focus(); }}
        onOpenStage={onOpenStage} onBlockKey={blockKey} onGap={gap => dispatch({ type: 'setMapGap', gap })}
        fixAt={fixAt} onCreate={createFor} onScale={toScale} onMontar={() => onView('montar')}
        onSeeLig={id => { setPopId(null); onOpenLig(id); }} onSwap={(id, key) => dispatch({ type: 'setMeioAlt', meio: id, key })}
        onUnlink={unlink} onImportFile={onImportFile} />
    </>
  );
}
