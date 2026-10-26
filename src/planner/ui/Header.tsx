import { useEffect, useRef, useState } from 'react';
import { I18N, LANGS, t } from '../../i18n/index.js';
import { FLAGS } from '../../ui/flags.js';
import { BALANCER_PATH, BUILDER_PATH, type Lang } from '../lang.ts';
import type { ViewMode } from './selection.ts';
import { ImportButton } from './ImportModeler.tsx';

interface Props {
  lang: Lang; onLang: (l: Lang) => void;
  status: string[];   // o que o fluxo tem a dizer (calculando, não estabilizou, loop travado)
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  shareUrl: () => string;
  view: ViewMode; onView: (v: ViewMode) => void;
  onImportFile: (f: File) => void;   // importar do Modeler (o App mostra o resumo)
}

export function Header({ lang, onLang, status, canUndo, canRedo, onUndo, onRedo, shareUrl, view, onView, onImportFile }: Props) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const share = async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setManual(null);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setManual(url); // sem permissão de área de transferência: mostra o link para copiar à mão
    }
  };

  const ico = (d: string) => <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
  return (
    <header className="pl-top">
      <div className="pl-brand">SF Balancer</div>
      <nav className="navtabs" aria-label={t('navAria')}>
        <a href={BUILDER_PATH[lang]} aria-current="page">{t('navFactory')}</a>
        <a href={BALANCER_PATH[lang]}>{t('navBalancer')}</a>
      </nav>
      <div className="pl-view" role="group" aria-label={t('plViewAria')}>
        <button type="button" aria-pressed={view === 'montar'} onClick={() => onView('montar')}>{t('plViewMontar')}</button>
        <button type="button" aria-pressed={view === 'planta'} onClick={() => onView('planta')}>{t('plViewPlanta')}</button>
      </div>
      <div className="pl-grow" />
      <div className="pl-status" role="status">{status.join(' · ')}</div>
      <div className="pl-pair">
        <button type="button" className="pl-btn" disabled={!canUndo} onClick={onUndo} aria-label={t('plUndo')} title={t('plUndo') + ' (Ctrl+Z)'}>{ico('M6 4L2 8l4 4M2 8h9a5 5 0 010 10H8')}<span className="pl-lbl">{t('plUndo')}</span></button>
        <button type="button" className="pl-btn" disabled={!canRedo} onClick={onRedo} aria-label={t('plRedo')} title={t('plRedo') + ' (Ctrl+Shift+Z)'}>{ico('M12 4l4 4-4 4M16 8H7a5 5 0 000 10h3')}<span className="pl-lbl">{t('plRedo')}</span></button>
      </div>
      <ImportButton onFile={onImportFile} className="pl-import" />
      <button type="button" className="pl-btn pl-primary" onClick={share}>{t('plShare')}</button>
      <span className="pl-copied" aria-live="polite">{copied ? t('plCopied') : ''}</span>
      {manual && <input className="pl-url" readOnly value={manual} aria-label={t('plShareLink')} onFocus={e => e.currentTarget.select()} ref={el => el?.select()} />}
      <div className="pl-langs" role="group" aria-label={t('langLabel')}>
        {(LANGS as Lang[]).map(l => (
          <button key={l} type="button" lang={I18N[l].htmlLang} title={I18N[l].langName} aria-pressed={l === lang} onClick={() => onLang(l)}>
            <span className="pl-flag" dangerouslySetInnerHTML={{ __html: FLAGS[l] }} />
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
}
