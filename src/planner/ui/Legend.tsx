import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n/index.js';

// Os desenhos usam os mesmos tokens do canvas (var no SVG inline).
type PortKind = 'ok' | 'deficit' | 'surplus' | 'exit' | 'stalled';
const PORT: Record<PortKind, { fill: string; stroke: string; dash?: string }> = {
  ok: { fill: 'var(--paper)', stroke: 'var(--ok)' },
  deficit: { fill: 'var(--deficit-bg)', stroke: 'var(--deficit)' },
  surplus: { fill: 'var(--surplus-bg)', stroke: 'var(--surplus)' },
  exit: { fill: 'var(--paper)', stroke: 'var(--holo)' },
  stalled: { fill: 'var(--paper)', stroke: 'var(--lock)', dash: '3 2' },
};

function PortSvg({ kind }: { kind: PortKind }) {
  const p = PORT[kind];
  return (
    <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true">
      <line x1="0" y1="14" x2="14" y2="14" stroke="var(--ink-dim)" strokeWidth="3" />
      <circle cx="24" cy="14" r="8" fill={p.fill} stroke={p.stroke} strokeWidth="3" strokeDasharray={p.dash} />
      {kind === 'exit' && <path d="M21 14h7m-3-3 3 3-3 3" fill="none" stroke={p.stroke} strokeWidth="1.8" />}
    </svg>
  );
}

type ChipKind = 'bal' | 'sink' | 'direct' | 'pipe' | 'short';
const CHIP: Record<ChipKind, { color: string; bg: string; text: string; dash?: string }> = {
  bal: { color: 'var(--ficsit)', bg: 'var(--bench)', text: '6 → 8' },
  sink: { color: 'var(--sink)', bg: 'var(--bench)', text: '+ Sink' },
  direct: { color: 'var(--ink-dim)', bg: 'var(--bench)', text: '1 → 1' },
  pipe: { color: 'var(--holo)', bg: 'var(--bench)', text: '300 m³' },
  short: { color: 'var(--deficit)', bg: 'var(--deficit-bg)', text: '4 → 4' },
};

function ChipSvg({ kind }: { kind: ChipKind }) {
  const c = CHIP[kind];
  return (
    <svg width="76" height="28" viewBox="0 0 76 28" aria-hidden="true">
      <rect x="1.5" y="2.5" width="73" height="23" rx="11.5" fill={c.bg} stroke={c.color} strokeWidth="2" />
      <text x="38" y="18" textAnchor="middle" fontSize="12" fontWeight="600" fill={c.color} fontFamily="var(--display)">{c.text}</text>
    </svg>
  );
}

// Um cartão pequeno anotado: barra de entrada em cima, um quadrado por máquina, barra de saída embaixo, "+ N fileiras".
function StripSvg() {
  const note = { fontSize: 11, fill: 'var(--ink-mid)', fontFamily: 'var(--body)' } as const;
  return (
    <svg className="pl-leg-strip" viewBox="0 0 330 120" role="img" aria-label={`${t('plLegStripIn')}, ${t('plLegStripMachine')}, ${t('plLegStripOut')}`}>
      <rect x="1" y="1" width="150" height="104" fill="var(--plate-2)" stroke="var(--line)" />
      <rect x="10" y="12" width="132" height="6" fill="var(--ficsit)" />
      {[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={10 + i * 22} y="24" width="18" height="18" fill="var(--ink)" opacity=".85" />)}
      <rect x="10" y="46" width="132" height="6" fill="var(--holo)" />
      <rect x="10" y="62" width="132" height="6" fill="var(--ficsit)" opacity=".5" />
      {[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={10 + i * 22} y="74" width="18" height="18" fill="var(--ink)" opacity=".5" />)}
      <text x="10" y="102" fontSize="11" fill="var(--ink-soft)" fontFamily="var(--display)" fontWeight="600">{t('plLegStripMore')}</text>
      <g stroke="var(--ink-dim)" strokeWidth="1"><line x1="152" y1="15" x2="170" y2="15" /><line x1="124" y1="33" x2="170" y2="33" /><line x1="152" y1="49" x2="170" y2="49" /></g>
      <text x="174" y="19" {...note}>{t('plLegStripIn')}</text>
      <text x="174" y="37" {...note}>{t('plLegStripMachine')}</text>
      <text x="174" y="53" {...note}>{t('plLegStripOut')}</text>
    </svg>
  );
}

function Row({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return <li><span className="pl-leg-ic">{icon}</span><span><b>{title}</b><br /><span className="pl-leg-d">{desc}</span></span></li>;
}

// Botão "Legenda" (44 px) e o diálogo; Esc fecha e o foco volta ao botão.
export function Legend() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const dlg = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };

  useEffect(() => { if (open) dlg.current?.focus(); }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !dlg.current) return;
    const f = [...dlg.current.querySelectorAll<HTMLElement>('button, [tabindex="0"]')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <>
      <button ref={btn} type="button" className="pl-leg-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{t('plLegend')}</button>
      {open && (
        <div className="pl-leg-back" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="pl-leg" role="dialog" aria-modal="true" aria-labelledby="pl-leg-title" tabIndex={-1} ref={dlg} onKeyDown={onKey}>
            <header>
              <h2 id="pl-leg-title">{t('plLegendTitle')}</h2>
              <button type="button" className="pl-btn" onClick={close}>{t('dlgClose')}</button>
            </header>
            <ul>
              <Row icon={<PortSvg kind="ok" />} title={t('plLegPortOk')} desc={t('plLegPortOkD')} />
              <Row icon={<PortSvg kind="deficit" />} title={t('plLegPortDeficit')} desc={t('plLegPortDeficitD')} />
              <Row icon={<PortSvg kind="surplus" />} title={t('plLegPortSurplus')} desc={t('plLegPortSurplusD')} />
              <Row icon={<PortSvg kind="exit" />} title={t('plLegPortExit')} desc={t('plLegPortExitD')} />
              <Row icon={<PortSvg kind="stalled" />} title={t('plLegPortStalled')} desc={t('plLegPortStalledD')} />
            </ul>
            <ul>
              <Row icon={<ChipSvg kind="bal" />} title={t('plLegChipBal')} desc={t('plLegChipBalD')} />
              <Row icon={<ChipSvg kind="sink" />} title={t('plLegChipSink')} desc={t('plLegChipSinkD')} />
              <Row icon={<ChipSvg kind="direct" />} title={t('plLegChipDirect')} desc={t('plLegChipDirectD')} />
              <Row icon={<ChipSvg kind="pipe" />} title={t('plLegChipPipe')} desc={t('plLegChipPipeD')} />
              <Row icon={<ChipSvg kind="short" />} title={t('plLegChipShort')} desc={t('plLegChipShortD')} />
            </ul>
            <StripSvg />
          </div>
        </div>
      )}
    </>
  );
}
