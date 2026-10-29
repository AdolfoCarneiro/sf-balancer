import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { setLang } from '../i18n/index.js';
import { LANG_STORE } from '../ui/common.js';
import { builderLang } from './lang.ts';
import { App } from './App.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import game from './data/game.json';
import type { GameData } from './model/types.ts';
import { PLANNER_STORE, encodeFactory, exampleFactory } from './model/factorystate.ts';
import '../styles/tokens.css';
import '../styles/parts.css';
import './planner.css';

let saved: string | null = null;
try { saved = localStorage.getItem(LANG_STORE); } catch { /* sem storage */ }
setLang(builderLang(location.pathname, location.search, saved));

// Voltar ao exemplo depois de um erro: a fábrica salva vira o exemplo, o link #p= sai do endereço e o builder remonta.
function Root() {
  const [gen, setGen] = useState(0);
  const reset = () => {
    try { localStorage.setItem(PLANNER_STORE, encodeFactory(exampleFactory(game as unknown as GameData))); } catch { /* sem storage */ }
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    setGen(g => g + 1);
  };
  return <ErrorBoundary key={gen} onReset={reset}><App /></ErrorBoundary>;
}

// Monta já na primeira tarefa (o script segura a pintura, blocking="render"): a página nova aparece pronta, sem um quadro
// vazio entre a Fábrica e o Balancer.
const root = createRoot(document.getElementById('root')!);
flushSync(() => root.render(<Root />));
