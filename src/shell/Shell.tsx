import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { getLang, setLang, t } from '../i18n/index.js';
import { App as Factory } from '../planner/App.tsx';
import { ErrorBoundary } from '../planner/ui/ErrorBoundary.tsx';
import { PLANNER_STORE, encodeFactory, exampleFactory } from '../planner/model/factorystate.ts';
import type { GameData } from '../planner/model/types.ts';
import game from '../planner/data/game.json';
import { BalancerPage, loadBalancer, type BalancerModule } from '../balancer/BalancerPage.tsx';
import type { Nav } from './SiteBar.tsx';
import { LANG_STORE, pageOf, pagePath, type Lang, type Page } from './site.ts';
import { nmOf } from '../seo/routes.js';
import { nmMeta } from '../seo/nm.js';

const SITE = 'https://sf-balancer.vercel.app';
const onVercel = /(^|\.)vercel\.app$/.test(location.hostname);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// O app: as duas páginas (Fábrica e Balancer) num documento só. Trocar de aba não recarrega: muda o endereço
// (pushState), troca a página dentro de uma View Transition e as duas ficam montadas depois da primeira visita, então
// voltar encontra tudo como estava (câmera, seleção, o que foi digitado). O idioma, o título, a descrição, o canonical
// e o endereço moram aqui.
export function Shell({ start, balancer }: { start: Page; balancer: BalancerModule | null }) {
  const [lang, setLangState] = useState<Lang>(getLang() as Lang);
  const [page, setPage] = useState<Page>(start);
  const [bal, setBal] = useState<BalancerModule | null>(balancer);
  const pageRef = useRef(page);
  pageRef.current = page;
  const balRef = useRef(bal);
  balRef.current = bal;
  // A Fábrica só monta quando aparece pela primeira vez (abrir direto no Balancer não liga o mapa nem o tutorial).
  const [factorySeen, setFactorySeen] = useState(start === 'factory');
  // O endereço de agora: no Balancer, o balancer N→M aberto pela biblioteca tem página própria (título, canonical).
  // Quem muda o endereço sem trocar de página (a lista da biblioteca) avisa com o evento 'sf:path'.
  const [path, setPath] = useState(location.pathname);
  const nm = page === 'balancer' ? nmOf(path) : null;

  const show = (p: Page, mod: BalancerModule | null) => {
    const apply = () => flushSync(() => {
      setBal(mod);
      setPage(p);
      if (p === 'factory') setFactorySeen(true);
      window.scrollTo(0, 0);
    });
    if (!document.startViewTransition || reducedMotion()) { apply(); return; }
    const root = document.documentElement;
    root.dataset.nav = p;
    document.startViewTransition(apply).finished.finally(() => { if (root.dataset.nav === p) delete root.dataset.nav; });
  };
  const go = async (p: Page, push: boolean) => {
    if (p === pageRef.current) return;
    let mod = balRef.current;
    if (p === 'balancer' && !mod) {
      try { mod = await loadBalancer(); } catch { location.assign(pagePath(p, lang)); return; }   // sem rede: a página de verdade
    }
    if (push) history.pushState(null, '', pagePath(p, lang) + location.search);
    setPath(location.pathname);
    show(p, mod);
  };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const onPop = () => { setPath(location.pathname); void goRef.current(pageOf(location.pathname), false); };
    const onPath = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    addEventListener('sf:path', onPath);
    return () => { removeEventListener('popstate', onPop); removeEventListener('sf:path', onPath); };
  }, []);
  // Na Fábrica, o Balancer baixa quando o navegador está à toa: a primeira troca de aba já não espera a rede.
  useEffect(() => {
    if (bal) return;
    const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1500));
    idle(() => { loadBalancer().catch(() => {}); });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // O Balancer vê o idioma novo pelo nav e passa os números digitados para o formato dele.
  const changeLang = (l: Lang) => {
    if (getLang() === l) return;
    setLang(l);
    try { localStorage.setItem(LANG_STORE, l); } catch { /* sem storage */ }
    setLangState(l);
  };

  // Título, descrição, canonical e a seção Sobre/FAQ (só a da Fábrica, no index.html) acompanham a página e o idioma.
  useLayoutEffect(() => {
    const factory = page === 'factory';
    document.documentElement.dataset.page = page;   // o layout de cada página (shell.css)
    document.documentElement.lang = t('htmlLang');
    // O mesmo título e a mesma descrição das páginas geradas no build (src/seo/pages.js).
    const meta = nm ? nmMeta(nm.n, nm.m) : null;
    document.title = meta ? meta.title : t(factory ? 'plPageTitle' : 'pageTitle');
    document.querySelector<HTMLMetaElement>('meta[name=description]')?.setAttribute('content', meta ? meta.desc : t(factory ? 'plMetaDesc' : 'metaDesc'));
    let canon = document.querySelector<HTMLLinkElement>('link[rel=canonical]');
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.append(canon); }
    canon.href = SITE + pagePath(page, lang, nm);
    const about = document.getElementById('about');
    if (about) {
      about.hidden = !factory;
      // HTML base em inglês, para os buscadores.
      for (const el of about.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
    }
    // No site, o endereço acompanha o idioma; fora dele (localhost, docker), fica como está.
    if (onVercel && location.pathname !== pagePath(page, lang, nm)) history.replaceState(history.state, '', pagePath(page, lang, nm) + location.hash);
  }, [page, lang, nm?.n, nm?.m]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Voltar ao exemplo depois de um erro na Fábrica: a fábrica salva vira o exemplo, o #p= sai do endereço e ela remonta.
  const [gen, setGen] = useState(0);
  const reset = () => {
    try { localStorage.setItem(PLANNER_STORE, encodeFactory(exampleFactory(game as unknown as GameData))); } catch { /* sem storage */ }
    if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
    setGen(g => g + 1);
  };

  const nav: Nav = { page, lang, onPage: p => { void go(p, true); }, onLang: changeLang };
  // display: contents deixa a página como se fosse filha direta do #root (a Fábrica mede a altura por ele).
  const shown = (p: Page) => ({ display: page === p ? 'contents' : 'none' });
  return (
    <>
      {factorySeen && (
        <div style={shown('factory')}>
          <ErrorBoundary key={gen} onReset={reset}><Factory nav={nav} active={page === 'factory'} /></ErrorBoundary>
        </div>
      )}
      {/* bal só chega quando o Balancer aparece (o pré-carregamento só baixa o módulo); depois fica montado. */}
      {bal && (
        <div style={shown('balancer')}><BalancerPage mod={bal} nav={nav} active={page === 'balancer'} /></div>
      )}
    </>
  );
}
