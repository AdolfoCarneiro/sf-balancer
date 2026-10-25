import { useEffect, useMemo, useRef, useState } from 'react';
import { getLang, setLang, t } from '../i18n/index.js';
import { LANG_STORE } from '../ui/common.js';
import { PLANNER_PATH, type Lang } from './lang.ts';
import game from './data/game.json';
import type { GameData } from './model/types.ts';
import { meiosOf } from './model/factory.ts';
import { factoryTotals, solvedStage } from './model/solved.ts';
import { usePlanner } from './store.ts';
import { useFlowState } from './solver.ts';
import { useMeioResults } from './meios.ts';
import { Header } from './ui/Header.tsx';
import { Sidebar } from './ui/Sidebar.tsx';
import { Inspector } from './ui/Inspector.tsx';
import type { Selection } from './ui/selection.ts';
import { StageView } from './ui/StageView.tsx';
import { MapView } from './ui/MapView.tsx';
import { blockName } from './ui/format.ts';

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

  const { factory: f, dispatch, canUndo, canRedo, shareUrl } = usePlanner(data);
  // O fluxo: no worker, com cache por componente; enquanto calcula, o último pronto.
  const { flow, pending } = useFlowState(f, data);
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
  // Os planos dos meios: calculados no worker, com cache; null enquanto calcula.
  const meioResults = useMeioResults(f, flow, data, lang, meioList);
  // Depois de desfazer, o bloco ou o meio selecionado pode não existir mais: aí não há seleção.
  const selection: Selection = !picked ? null
    : picked.kind === 'stage' ? (f.blocks.some(b => b.id === picked.id) ? picked : null)
    : (meioList.some(m => m.id === picked.id) ? picked : null);
  const { blocks, machines } = factoryTotals(f, flow);
  // O que o fluxo tem a dizer: calculando, não estabilizou, loop travado.
  const status = [
    ...(pending ? [t('plFlowCalc')] : []),
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

  // O painel do meio aparece com um meio selecionado (o resto fica no painel do mapa).
  const inspector = (
    <Inspector selection={selection} factory={f} flow={flow} data={data} lang={lang} meioList={meioList} results={meioResults} dispatch={dispatch} />
  );
  return (
    <div className="pl-app">
      <Header lang={lang} onLang={change} blocks={blocks} machines={machines} status={status} canUndo={canUndo} canRedo={canRedo}
        onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} shareUrl={shareUrl} />
      <div className="pl-body" style={openStage ? { display: 'none' } : undefined}>
        <Sidebar factory={f} flow={flow} data={data} selection={selection} onSelect={setSelection} dispatch={dispatch} />
        <MapView factory={f} flow={flow} data={data} lang={lang} meioList={meioList} results={meioResults} selection={selection}
          onSelect={setSelection} onOpenStage={setOpenStage} dispatch={dispatch} inspector={inspector} />
      </div>
      {openStage && (
        <StageView key={openStage.id} block={openStage} stage={solvedStage(openStage, flow.blocks[openStage.id])} factory={f} flow={flow}
          data={data} dispatch={dispatch} onClose={() => setOpenStage(null)} />
      )}
      <footer className="pl-foot">{t('plCredit')}</footer>
    </div>
  );
}
