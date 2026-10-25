import { useEffect, useRef, useState } from 'react';
import { I18N, LANGS, fmt, t } from '../../i18n/index.js';
import { FLAGS } from '../../ui/flags.js';
import { BALANCER_PATH, type Lang } from '../lang.ts';

interface Props {
  lang: Lang; onLang: (l: Lang) => void;
  blocks: number; machines: number;
  status: string[];   // o que o fluxo tem a dizer (calculando, não estabilizou, loop travado)
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  shareUrl: () => string;
}

export function Header({ lang, onLang, blocks, machines, status, canUndo, canRedo, onUndo, onRedo, shareUrl }: Props) {
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

  // A marca em duas partes: SF BALANCER e, apagado, o nome da página.
  const brand = t('plBrand').split(' / ');
  return (
    <header className="pl-top">
      <div className="pl-brand">{brand[0]}{brand[1] && <span> / {brand[1]}</span>}</div>
      <a className="pl-nav" href={BALANCER_PATH[lang]}>{t('plBalancerLink')}</a>
      <div className="pl-grow" />
      <div className="pl-status" role="status">{status.join(' · ')}</div>
      <div className="pl-totals">{t('plTotals', fmt(blocks, 0), fmt(machines, 0))}</div>
      <div className="pl-pair">
        <button type="button" className="pl-btn" disabled={!canUndo} onClick={onUndo} aria-label={t('plUndo')} title={t('plUndo') + ' (Ctrl+Z)'}>{t('plUndo')}</button>
        <button type="button" className="pl-btn" disabled={!canRedo} onClick={onRedo} aria-label={t('plRedo')} title={t('plRedo') + ' (Ctrl+Shift+Z)'}>{t('plRedo')}</button>
      </div>
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
