import { createRoot } from 'react-dom/client';
import { setLang } from '../i18n/index.js';
import { LANG_STORE } from '../ui/common.js';
import { builderLang } from './lang.ts';
import { App } from './App.tsx';
import '../styles/tokens.css';
import '../styles/parts.css';
import './planner.css';

let saved: string | null = null;
try { saved = localStorage.getItem(LANG_STORE); } catch { /* sem storage */ }
setLang(builderLang(location.pathname, location.search, saved));

createRoot(document.getElementById('root')!).render(<App />);
