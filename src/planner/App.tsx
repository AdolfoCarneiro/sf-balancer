import { useEffect, useMemo, useRef, useState } from 'react';
import { getLang, setLang, t } from '../i18n/index.js';
import { LANG_STORE } from '../ui/common.js';
import { PLANNER_PATH, type Lang } from './lang.ts';
import game from './data/game.json';
import type { GameData } from './model/types.ts';
import { chainTotals } from './model/totals.ts';
import { usePlanner } from './store.ts';
import { Header } from './ui/Header.tsx';
import { Sidebar } from './ui/Sidebar.tsx';
import { Inspector } from './ui/Inspector.tsx';
import type { SearchRequest, Selection } from './ui/selection.ts';
import { Graph } from './ui/Graph.tsx';
import { meios } from './model/meio.ts';
import { useMeioResults } from './meios.ts';
import { StageView } from './ui/StageView.tsx';

const data = game as unknown as GameData;
const SITE = 'https://sf-balancer.vercel.app';
const onVercel = /(^|\.)vercel\.app$/.test(location.hostname);

export function App() {
  // O idioma vive no módulo i18n; este estado só força o re-render ao trocar.
  const [lang, setLangState] = useState<Lang>(getLang() as Lang);

  useEffect(() => {
    document.documentElement.lang = t('htmlLang');
    document.title = t('plPageTitle');
    document.querySelector<HTMLMetaElement>('meta[name=description]')?.setAttribute('content', t('plMetaDesc'));
    let canon = document.querySelector<HTMLLinkElement>('link[rel=canonical]');
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.append(canon); }
    canon.href = SITE + PLANNER_PATH[lang];
    // No site, o endereço acompanha o idioma; aberto do disco, fica como está.
    if (onVercel && location.pathname !== PLANNER_PATH[lang]) history.replaceState(null, '', PLANNER_PATH[lang] + location.hash);
  }, [lang]);

  const change = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(LANG_STORE, getLang()); } catch { /* sem storage */ }
    setLangState(l);
  };

  const { chain, dispatch, canUndo, canRedo, shareUrl } = usePlanner(data);
  const [picked, setSelection] = useState<Selection>(null);
  // Pedido de busca vindo do grafo (porta arrastada para o vazio).
  const [search, setSearch] = useState<SearchRequest | null>(null);
  // Etapa aberta na vista de detalhe; some se a etapa deixar de existir (apagar, desfazer).
  const [openId, setOpenId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const setOpenStage = (id: string | null) => {
    if (id) openerRef.current = document.activeElement as HTMLElement | null;
    setOpenId(id);
  };
  const openStage = openId ? chain.stages.find(s => s.id === openId) : undefined;
  // Etapa que sumiu (apagar, desfazer): fecha de vez, para não reabrir se o id voltar.
  useEffect(() => { if (openId && !openStage) setOpenId(null); }, [openId, openStage]);
  // Ao fechar, o foco volta a quem abriu (se ainda existe) ou ao grafo.
  const wasOpen = useRef(false);
  const isOpen = !!openStage;
  useEffect(() => {
    if (isOpen) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const o = openerRef.current;
    (o && o.isConnected && o !== document.body ? o : document.getElementById('pl-graph'))?.focus();
  }, [isOpen]);
  const meioList = useMemo(() => meios(chain, data), [chain]);
  // Os planos dos meios: calculados no worker, com cache; null enquanto calcula.
  const meioResults = useMeioResults(chain, data, lang, meioList);
  // Depois de desfazer, a etapa ou o meio selecionado pode não existir mais: aí não há seleção.
  const selection: Selection = !picked ? null
    : picked.kind === 'stage' ? (chain.stages.some(s => s.id === picked.id) ? picked : null)
    : (meioList.some(m => m.id === picked.id) ? picked : null);
  const { stages, machines } = chainTotals(chain, data);

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
      <Header lang={lang} onLang={change} stages={stages} machines={machines} canUndo={canUndo} canRedo={canRedo}
        onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} shareUrl={shareUrl} />
      <div className="pl-body" style={openStage ? { display: 'none' } : undefined}>
        <Sidebar chain={chain} data={data} selection={selection} onSelect={setSelection}
          search={search} onClearSearch={() => setSearch(null)} dispatch={dispatch} />
        <main className="pl-center" id="pl-graph" tabIndex={-1} aria-label={t('plGraph')}>
          <Graph chain={chain} data={data} lang={lang} meioList={meioList} results={meioResults} selection={selection} onSelect={setSelection}
            dispatch={dispatch} onOpenSearch={setSearch} onOpenStage={setOpenStage} />
        </main>
        <Inspector selection={selection} chain={chain} data={data} lang={lang} meioList={meioList} results={meioResults}
          dispatch={dispatch} onSelect={setSelection} onOpenStage={setOpenStage} />
      </div>
      {openStage && <StageView key={openStage.id} stage={openStage} chain={chain} data={data} dispatch={dispatch} onClose={() => setOpenStage(null)} />}
    </div>
  );
}
