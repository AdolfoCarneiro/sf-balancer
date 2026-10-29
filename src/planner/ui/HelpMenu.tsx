// Ajuda do mapa (canto de cima à esquerda): um botão "? Ajuda" com o menu Como mexer neste mapa, Legenda e Tutorial
// completo. Junta o que antes eram três botões soltos (o "? Como mexer" e, nos controles de baixo, Legenda e Tutorial).
// Esc ou clicar fora fecha; setas andam entre as opções; o foco volta ao botão (o tutorial também o devolve para ele).
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { openTour } from './Tour.tsx';
import { LegendDialog } from './Legend.tsx';

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const [legend, setLegend] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])];

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const out = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!menu.current?.contains(n) && !btn.current?.contains(n)) setOpen(false);
    };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [open]);

  // Fecha o menu e devolve o foco ao botão antes de agir (o tutorial lembra quem tinha o foco para devolver).
  const run = (fn: () => void) => { setOpen(false); btn.current?.focus(); fn(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = items(), i = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  };

  return (
    <div className="pl-help">
      <button ref={btn} type="button" className="pl-btn pl-tour-help pl-map-help" data-tour="map-tour" aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? 'pl-help-menu' : undefined} onClick={() => setOpen(o => !o)}>
        <span aria-hidden="true">?</span><span className="pl-tour-help-t"> {t('plHelp')}</span>
      </button>
      {open && (
        <div className="pl-help-menu" id="pl-help-menu" role="menu" aria-label={t('plHelp')} ref={menu} onKeyDown={onKey}>
          <button type="button" role="menuitem" className="pl-help-map" onClick={() => run(() => openTour('map'))}>{t('plTourHelpOf', 'map')}</button>
          <button type="button" role="menuitem" className="pl-help-legend" onClick={() => run(() => setLegend(true))}>{t('plLegend')}</button>
          <button type="button" role="menuitem" className="pl-help-tour" onClick={() => run(() => openTour())}>{t('plHelpTour')}</button>
        </div>
      )}
      {legend && <LegendDialog onClose={() => { setLegend(false); btn.current?.focus(); }} />}
    </div>
  );
}
