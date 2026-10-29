import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { LAYER_KEYS, NO_LAYERS, type MapLayers } from '../model/map/layers.ts';

const LABEL: Record<(typeof LAYER_KEYS)[number], string> = { icons: 'plLayerIcons', names: 'plLayerNames', links: 'plLayerLinks', ports: 'plLayerPorts' };

// Botão "Camadas" (44 px) e o balão acima dele: uma caixa por camada, "Ligações compactas" (o chip vira um ponto) e
// "Só as máquinas" (desliga as quatro). Esc ou
// clicar fora fecha; Esc devolve o foco ao botão.
export function Layers({ value, onChange }: { value: MapLayers; onChange: (v: MapLayers) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = (refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLInputElement>('input')?.focus();
    const out = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!box.current?.contains(n) && !btn.current?.contains(n)) setOpen(false);
    };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(true); }
  };
  const off = LAYER_KEYS.every(k => !value[k]);

  return (
    <span className="pl-layers" data-tour="map-layers">
      <button ref={btn} type="button" className="pl-layers-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'pl-layers' : undefined}
        aria-label={t('plLayers')} title={t('plLayers')} onClick={() => (open ? close(false) : setOpen(true))}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2l7 3.5L9 9 2 5.5zM2 9l7 3.5L16 9M2 12.5L9 16l7-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="pl-layers-pop" id="pl-layers" role="dialog" aria-label={t('plLayersTitle')} ref={box} onKeyDown={onKey}>
          <fieldset>
            <legend>{t('plLayersTitle')}</legend>
            {LAYER_KEYS.map(k => (
              <label key={k}>
                <input type="checkbox" checked={value[k]} onChange={e => onChange({ ...value, [k]: e.target.checked })} />
                {t(LABEL[k])}
              </label>
            ))}
            <label className="pl-layers-compact">
              <input type="checkbox" checked={value.compact} onChange={e => onChange({ ...value, compact: e.target.checked })} />
              {t('plLayerCompact')}
            </label>
          </fieldset>
          <button type="button" className="pl-btn" aria-pressed={off} onClick={() => onChange({ ...NO_LAYERS, compact: value.compact })}>{t('plLayersOnly')}</button>
        </div>
      )}
    </span>
  );
}
