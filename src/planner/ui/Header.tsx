import { useEffect, useRef, useState } from 'react';
import { I18N, LANGS, fmt, t } from '../../i18n/index.js';
import { FLAGS } from '../../ui/flags.js';
import { SITE_PATH, type Lang } from '../lang.ts';

interface Props {
  lang: Lang; onLang: (l: Lang) => void;
  stages: number; machines: number;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  shareUrl: () => string;
  view: View; onView: (v: View) => void;
}

export type View = 'graph' | 'map';

export function Header({ lang, onLang, stages, machines, canUndo, canRedo, onUndo, onRedo, shareUrl, view, onView }: Props) {
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

  return (
    <header className="pl-top">
      <div className="pl-brand">{t('plBrand')}</div>
      <div className="pl-seg" role="tablist" aria-label={t('plViews')}>
        {(['graph', 'map'] as View[]).map(v => (
          <button key={v} type="button" role="tab" aria-selected={view === v} aria-controls="pl-graph" className={view === v ? 'on' : undefined}
            tabIndex={view === v ? 0 : -1} onClick={() => onView(v)}
            onKeyDown={e => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              const next: View = v === 'graph' ? 'map' : 'graph';
              onView(next);
              (e.currentTarget.parentElement?.querySelector(`[data-view=${next}]`) as HTMLElement | null)?.focus();
            }} data-view={v}>
            {t(v === 'graph' ? 'plViewGraph' : 'plViewMap')}
          </button>
        ))}
      </div>
      <div className="pl-seg" role="group" aria-label={t('plModeLabel')}>
        <button type="button" aria-pressed="true" className="on">{t('plModeNode')}</button>
        <button type="button" disabled>{t('plModeGoal')} <span className="pl-phase">{t('plPhase3')}</span></button>
      </div>
      <div className="pl-grow" />
      <div className="pl-totals">{t('plTotals', fmt(stages, 0), fmt(machines, 0))}</div>
      <button type="button" className="pl-btn" disabled={!canUndo} onClick={onUndo} aria-label={t('plUndo')} title={t('plUndo') + ' (Ctrl+Z)'}>{t('plUndo')}</button>
      <button type="button" className="pl-btn" disabled={!canRedo} onClick={onRedo} aria-label={t('plRedo')} title={t('plRedo') + ' (Ctrl+Shift+Z)'}>{t('plRedo')}</button>
      <button type="button" className="pl-btn pl-primary" onClick={share}>{t('plShare')}</button>
      <span className="pl-copied" aria-live="polite">{copied ? t('plCopied') : ''}</span>
      {manual && <input className="pl-url" readOnly value={manual} aria-label={t('plShareLink')} onFocus={e => e.currentTarget.select()} ref={el => el?.select()} />}
      <a className="pl-back" href={SITE_PATH[lang]}>{t('plBack')}</a>
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
