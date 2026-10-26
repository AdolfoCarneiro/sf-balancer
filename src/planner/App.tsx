import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { getLang, setLang, t } from '../i18n/index.js';
import { LANG_STORE } from '../ui/common.js';
import { BUILDER_PATH, type Lang } from './lang.ts';
import game from './data/game.json';
import type { GameData } from './model/types.ts';
import { meiosOf } from './model/factory.ts';
import { solvedStage } from './model/solved.ts';
import { usePlanner } from './store.ts';
import { useFlowState } from './solver.ts';
import { useMeioResults } from './meios.ts';
import { Header } from './ui/Header.tsx';
import { stagesSel, type Selection, type ViewMode } from './ui/selection.ts';
import { StageView } from './ui/StageView.tsx';
import { MapView, type MapViewHandle } from './ui/MapView.tsx';
import { BalanceBar } from './ui/BalanceBar.tsx';
import { factoryBalance, nextProblem, type PortState } from './model/portstate.ts';
import { blockName } from './ui/format.ts';

const data = game as unknown as GameData;
// O modal da ligação traz a bancada da página Balancer (passo a passo, 3D): só baixa na primeira vez que abre.
const LigacaoModal = lazy(() => import('./ui/LigacaoModal.tsx').then(m => ({ default: m.LigacaoModal })));
const SITE = 'https://sf-balancer.vercel.app';
const onVercel = /(^|\.)vercel\.app$/.test(location.hostname);
// Gancho de teste da rede de segurança (ErrorBoundary): window.__sfPlannerCrash = true quebra o render; só com ?debug=1
// ou no servidor de desenvolvimento.
const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).get('debug') === '1';

export function App() {
  // O idioma vive no módulo i18n; este estado só força o re-render ao trocar.
  const [lang, setLangState] = useState<Lang>(getLang() as Lang);

  useEffect(() => {
    document.documentElement.lang = t('htmlLang');
    document.title = t('plPageTitle');
    document.querySelector<HTMLMetaElement>('meta[name=description]')?.setAttribute('content', t('plMetaDesc'));
    let canon = document.querySelector<HTMLLinkElement>('link[rel=canonical]');
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.append(canon); }
    canon.href = SITE + BUILDER_PATH[lang];
    // No site, o endereço acompanha o idioma; aberto do disco, fica como está.
    if (onVercel && location.pathname !== BUILDER_PATH[lang]) history.replaceState(null, '', BUILDER_PATH[lang] + location.hash);
  }, [lang]);

  const change = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(LANG_STORE, getLang()); } catch { /* sem storage */ }
    setLangState(l);
  };

  const { factory: f, dispatch, canUndo, canRedo, shareUrl } = usePlanner(data);
  if (DEBUG && (window as unknown as { __sfPlannerCrash?: boolean }).__sfPlannerCrash) throw new Error('debug: __sfPlannerCrash');
  // O fluxo: no worker, com cache por componente; enquanto calcula, o último pronto.
  const { flow, pending } = useFlowState(f, data);
  const [view, setView] = useState<ViewMode>('montar');
  const [picked, setSelection] = useState<Selection>(null);
  // Bloco de receita aberto na vista de detalhe; some se o bloco deixar de existir (apagar, desfazer).
  const [openId, setOpenId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const setOpenStage = (id: string | null) => {
    if (id && f.blocks.find(b => b.id === id)?.kind !== 'recipe') return;   // origem e sobra não têm fileiras
    if (id) openerRef.current = document.activeElement as HTMLElement | null;
    setOpenId(id);
  };
  const openBlock = openId ? f.blocks.find(b => b.id === openId) : undefined;
  const openStage = openBlock?.kind === 'recipe' ? openBlock : undefined;
  // Bloco que sumiu (apagar, desfazer): fecha de vez, para não reabrir se o id voltar.
  useEffect(() => { if (openId && !openStage) setOpenId(null); }, [openId, openStage]);
  // Ao fechar, o foco volta a quem abriu (se ainda existe) ou ao mapa.
  const wasOpen = useRef(false);
  const isOpen = !!openStage;
  useEffect(() => {
    if (isOpen) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const o = openerRef.current;
    (o && o.isConnected && o !== document.body ? o : document.getElementById('pl-graph'))?.focus();
  }, [isOpen]);
  const meioList = useMemo(() => meiosOf(f), [f.links]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Ligação aberta no modal; some se a ligação deixar de existir (desligar, desfazer). Ao fechar, o foco volta a quem
  // abriu (o canvas, no clique) ou ao canvas.
  const [ligId, setLigId] = useState<string | null>(null);
  const ligOpener = useRef<HTMLElement | null>(null);
  const openLig = (id: string) => { ligOpener.current = document.activeElement as HTMLElement | null; setLigId(id); };
  const ligMeio = ligId ? meioList.find(m => m.id === ligId) : undefined;
  const closeLig = () => {
    setLigId(null);
    const o = ligOpener.current;
    (o && o.isConnected && o !== document.body ? o : document.querySelector<HTMLElement>('.pl-map-canvas'))?.focus();
  };
  // Desligar uma das esteiras do grupo: o modal segue para a ligação que ficou com as outras (o id do grupo muda).
  const ligFollow = useRef<string | null>(null);
  const unlinkIn = (linkId: string) => {
    ligFollow.current = ligMeio?.links.find(id => id !== linkId) ?? null;
    dispatch({ type: 'disconnect', linkId });
  };
  useEffect(() => {
    if (!ligId || ligMeio) return;
    const next = ligFollow.current ? meioList.find(m => m.links.includes(ligFollow.current!)) : undefined;
    ligFollow.current = null;
    if (next) setLigId(next.id); else closeLig();
  }, [ligId, ligMeio]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Os planos dos meios: calculados no worker, com cache; null enquanto calcula.
  const meioResults = useMeioResults(f, flow, data, lang, meioList, pending);
  // Depois de desfazer, o bloco ou o meio selecionado pode não existir mais: aí não há seleção.
  // Com vários, ficam os que ainda existem (um só volta a ser o bloco de sempre).
  const selection: Selection = useMemo(() => !picked ? null
    : picked.kind === 'stage' ? (f.blocks.some(b => b.id === picked.id) ? picked : null)
    : picked.kind === 'stages' ? (picked.ids.every(id => f.blocks.some(b => b.id === id)) ? picked : stagesSel(picked.ids.filter(id => f.blocks.some(b => b.id === id))))
    : (meioList.some(m => m.id === picked.id) ? picked : null), [picked, f.blocks, meioList]);
  // Faixa Balanço: o que entra, sai e vai pro sink; os botões passam pelas faltas e sobras em círculo.
  const balance = useMemo(() => factoryBalance(f, flow, data), [f, flow]);
  const probIdx = useRef({ deficit: -1, surplus: -1 });
  const mapRef = useRef<MapViewHandle>(null);
  const goProblem = (kind: 'deficit' | 'surplus'): PortState | null => {
    const n = nextProblem(balance.problems, kind, probIdx.current[kind]);
    if (!n) return null;
    probIdx.current[kind] = n.index;
    setSelection({ kind: 'stage', id: n.problem.block });
    mapRef.current?.focusPort(n.problem.block, n.problem.side, n.problem.item);
    return n.problem;
  };
  const nameOfBlock = (id: string) => { const b = f.blocks.find(x => x.id === id); return b ? blockName(b, data) : id; };
  // O que o fluxo tem a dizer: calculando, não estabilizou, loop travado.
  const status = [
    ...(pending ? [t('plFlowCalc')] : []),
    ...(flow.failed ? [t('plFlowFailed')] : []),
    ...(flow.converged ? [] : [t('plNotConverged')]),
    ...flow.deadlock.map(ids => t('plDeadlock', ids.map(id => { const b = f.blocks.find(x => x.id === id); return b ? blockName(b, data) : id; }).join(', '))),
  ];

  // Ctrl/Cmd+Z desfaz, +Shift refaz; ignora quando o foco está num campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <div className="pl-app">
      <Header lang={lang} onLang={change} status={status} canUndo={canUndo} canRedo={canRedo}
        onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} shareUrl={shareUrl}
        view={view} onView={setView} />
      <BalanceBar balance={balance} data={data} onGo={goProblem} nameOf={nameOfBlock} />
      <div className="pl-body" style={openStage ? { display: 'none' } : undefined}>
        <MapView ref={mapRef} view={view} factory={f} flow={flow} data={data} lang={lang} meioList={meioList} results={meioResults} selection={selection}
          onSelect={setSelection} onOpenStage={setOpenStage} dispatch={dispatch} onOpenLig={openLig} onView={setView} problems={balance.problems} />
      </div>
      {openStage && (
        <StageView key={openStage.id} block={openStage} stage={solvedStage(openStage, flow.blocks[openStage.id])} factory={f} flow={flow}
          data={data} dispatch={dispatch} onClose={() => setOpenStage(null)} />
      )}
      {ligMeio && (
        <Suspense fallback={null}>
          <LigacaoModal key={ligMeio.id} meio={ligMeio} result={meioResults.get(ligMeio.id)} factory={f} flow={flow} data={data} lang={lang}
            dispatch={dispatch} onClose={closeLig} onUnlink={unlinkIn} />
        </Suspense>
      )}
      <footer className="pl-foot">{t('plCredit')}</footer>
    </div>
  );
}
