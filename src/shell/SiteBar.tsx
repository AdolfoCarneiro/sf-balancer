import type { MouseEvent, ReactNode } from 'react';
import { I18N, LANGS, t } from '../i18n/index.js';
import { FLAGS } from '../i18n/flags.js';
import { pagePath, type Lang, type Page } from './site.ts';

// O que as páginas recebem do shell: a página e o idioma de agora e como trocar os dois.
export interface Nav {
  page: Page; lang: Lang;
  onPage: (p: Page) => void;
  onLang: (l: Lang) => void;
}

// A barra de cima das duas páginas: a marca, as abas Fábrica | Balancer, o que a página põe no meio (children) e o
// idioma. As abas são links de verdade (abrir em outra aba funciona); o clique comum troca a página sem recarregar.
export function SiteBar({ nav, children }: { nav: Nav; children?: ReactNode }) {
  const tab = (p: Page, key: string) => {
    const go = (e: MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      nav.onPage(p);
    };
    return <a href={pagePath(p, nav.lang)} aria-current={nav.page === p ? 'page' : undefined} onClick={go}>{t(key)}</a>;
  };
  return (
    <header className="pl-top">
      <div className="pl-brand">SF Balancer</div>
      <nav className="navtabs" aria-label={t('navAria')}>
        {tab('factory', 'navFactory')}
        {tab('balancer', 'navBalancer')}
      </nav>
      {children}
      <div className="pl-langs" role="group" aria-label={t('langLabel')}>
        {(LANGS as Lang[]).map(l => (
          <button key={l} type="button" lang={I18N[l].htmlLang} title={I18N[l].langName} aria-pressed={l === nav.lang} onClick={() => nav.onLang(l)}>
            <span className="pl-flag" dangerouslySetInnerHTML={{ __html: FLAGS[l] }} />
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
}
