// "? Como mexer" da tela da etapa: o diálogo com os gestos e as cores do desenho (o tutorial guiado vem depois e
// ancora nos data-tour="stage-…"). Esc fecha e o foco volta ao botão.
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';

const TIPS = ['plSvHelpSelect', 'plSvHelpRow', 'plSvHelpBelt', 'plSvHelpView', 'plSvHelpBack'];

export function StageHelp({ items }: { items: { name: string; color: string }[] }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const dlg = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };
  useEffect(() => { if (open) dlg.current?.focus(); }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !dlg.current) return;
    const f = [...dlg.current.querySelectorAll<HTMLElement>('button')];
    if (!f.length) return;
    // Um botão só (Fechar): o Tab fica nele.
    e.preventDefault();
    f[0].focus();
  };
  return (
    <>
      <button ref={btn} type="button" className="pl-btn pl-sv-help" data-tour="stage-help" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}><span aria-hidden="true">?</span><span className="pl-sv-help-t"> {t('plSvHelp')}</span></button>
      {open && (
        <div className="pl-leg-back" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="pl-leg pl-sv-helpdlg" role="dialog" aria-modal="true" aria-labelledby="pl-sv-help-title" tabIndex={-1} ref={dlg}
            onKeyDown={onKey}>
            <header>
              <h2 id="pl-sv-help-title">{t('plSvHelpTitle')}</h2>
              <button type="button" className="pl-btn" onClick={close}>{t('dlgClose')}</button>
            </header>
            <ul className="pl-sv-tips">{TIPS.map(k => <li key={k}>{t(k)}</li>)}</ul>
            <ul className="pl-legend2" aria-label={t('plLegend')}>
              {items.map(it => <li key={it.name}><i style={{ background: it.color }} />{it.name}</li>)}
              <li><i className="pl-sq" style={{ background: 'var(--flow)' }} />Splitter</li>
              <li><i className="pl-sq" style={{ background: 'var(--ficsit)' }} />Merger</li>
              <li><i className="pl-sq pl-sq-lift" />Conveyor Lift</li>
              <li className="pl-dim">{t('plSvFoundation')}</li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
