import { useEffect, useState } from 'react';
import { I18N, LANGS, getLang, setLang, t } from '../i18n/index.js';
import { LANG_STORE } from '../ui/common.js';
import { FLAGS } from '../ui/flags.js';
import { PLANNER_PATH, SITE_PATH, type Lang } from './lang.ts';

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

  return (
    <div className="pl-app">
      <header className="pl-top">
        <span className="pl-brand">{t('plBrand')}</span>
        <a className="pl-back" href={SITE_PATH[lang]}>{t('plBack')}</a>
        <div className="pl-langs" role="group" aria-label={t('langLabel')}>
          {(LANGS as Lang[]).map(l => (
            <button key={l} type="button" lang={I18N[l].htmlLang} title={I18N[l].langName} aria-pressed={l === lang} onClick={() => change(l)}>
              <span className="pl-flag" dangerouslySetInnerHTML={{ __html: FLAGS[l] }} />
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
    </div>
  );
}
