import { useEffect, useState } from 'react';
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
import type { Selection } from './ui/selection.ts';

const data = game as unknown as GameData;
const onVercel = /(^|\.)vercel\.app$/.test(location.hostname);

export function App() {
  // O idioma vive no módulo i18n; este estado só força o re-render ao trocar.
  const [lang, setLangState] = useState<Lang>(getLang() as Lang);

  useEffect(() => {
    document.documentElement.lang = t('htmlLang');
    document.title = t('plPageTitle');
    // No site, o endereço acompanha o idioma; aberto do disco, fica como está.
    if (onVercel && location.pathname !== PLANNER_PATH[lang]) history.replaceState(null, '', PLANNER_PATH[lang] + location.hash);
  }, [lang]);

  const change = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(LANG_STORE, getLang()); } catch { /* sem storage */ }
    setLangState(l);
  };

  const { chain, dispatch, canUndo, canRedo, shareUrl } = usePlanner(data);
  const [selection, setSelection] = useState<Selection>(null);
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
      <div className="pl-body">
        <Sidebar chain={chain} data={data} selection={selection} onSelect={setSelection} />
        <main className="pl-center" id="pl-graph" aria-label={t('plGraph')} />
        <Inspector selection={selection} />
      </div>
    </div>
  );
}
