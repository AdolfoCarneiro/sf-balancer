import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n/index.js';
import { readTheme, type MapTheme } from './draw/theme.ts';

// Os desenhos usam o mesmo tema do canvas (readTheme: os tokens CSS e as cores fixas do mapa), com o mesmo look das portas
// (draw/ports.ts) e dos chips (draw/chips.ts).
type PortKind = 'ok' | 'deficit' | 'surplus' | 'exit' | 'entry' | 'stalled';
const portLook = (k: PortKind, th: MapTheme): { fill: string; ring: string; dash?: string } => {
  switch (k) {
    case 'deficit': return { fill: th.deficitBg, ring: th.deficit };
    case 'surplus': return { fill: th.surplusBg, ring: th.surplus };
    case 'exit': return { fill: th.ok, ring: th.ok };
    case 'entry': return { fill: th.deficit, ring: th.deficit };
    case 'stalled': return { fill: th.stallBg, ring: th.lock, dash: '5 4' };
    default: return { fill: th.bench, ring: th.line };
  }
};

function PortSvg({ kind, th }: { kind: PortKind; th: MapTheme }) {
  const p = portLook(kind, th);
  return (
    <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true">
      <line x1="0" y1="14" x2="14" y2="14" stroke={th.inkDim} strokeWidth="3" />
      <circle cx="24" cy="14" r="9.5" fill={p.fill} stroke={p.ring} strokeWidth="3" strokeDasharray={p.dash} />
    </svg>
  );
}

// Os chips: retângulo com a borda pelo tipo (balancer e sink laranja, falta coral, o resto a linha neutra) e o texto do
// tipo, das mesmas chaves que o canvas usa.
type ChipKind = 'bal' | 'sink' | 'direct' | 'pipe' | 'short';
function chipLook(k: ChipKind, th: MapTheme): { border: string; ink: string; text: string } {
  switch (k) {
    case 'bal': return { border: th.ficsit, ink: th.ficsitSoft, text: t('plChipLines', '6', '8') };
    case 'sink': return { border: th.ficsit, ink: th.ficsitSoft, text: t('plChipSink', '3', '4') };
    case 'direct': return { border: th.line, ink: th.ink, text: t('plChipDirect') };
    case 'pipe': return { border: th.line, ink: th.ink, text: t('plChipPipe', '2', '6') };
    default: return { border: th.deficit, ink: th.deficitInk, text: t('plChipLines', '4', '4') };
  }
}

function ChipSvg({ kind, th }: { kind: ChipKind; th: MapTheme }) {
  const c = chipLook(kind, th);
  return (
    <svg width="104" height="30" viewBox="0 0 104 30" aria-hidden="true">
      <rect x="1" y="1" width="102" height="28" fill={th.bench} stroke={c.border} strokeWidth="2" />
      <text x="52" y="19.5" textAnchor="middle" fontSize="13" fontWeight="600" fill={c.ink} fontFamily={th.display}>{c.text}</text>
    </svg>
  );
}

// Conveyor Lift como na Planta: quadrado na cor do item, um com a seta para baixo (desce) e outro para cima (sobe).
function LiftSvg({ th }: { th: MapTheme }) {
  const lift = (x: number, s: 1 | -1) => (
    <g key={x}>
      <rect x={x} y="3" width="22" height="22" fill={th.ficsit} stroke={th.beltCase} strokeWidth="1.5" />
      <path d={`M${x + 11} ${14 - 6 * s}V${14 + 6 * s}M${x + 6} ${14 + s}L${x + 11} ${14 + 6 * s}L${x + 16} ${14 + s}`}
        fill="none" stroke={th.beltCase} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
  return <svg width="56" height="28" viewBox="0 0 56 28" aria-hidden="true">{lift(2, 1)}{lift(32, -1)}</svg>;
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
  const th = useMemo(() => (open ? readTheme(document.documentElement) : null), [open]);

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
      {open && th && (
        <div className="pl-leg-back" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="pl-leg" role="dialog" aria-modal="true" aria-labelledby="pl-leg-title" tabIndex={-1} ref={dlg} onKeyDown={onKey}>
            <header>
              <h2 id="pl-leg-title">{t('plLegendTitle')}</h2>
              <button type="button" className="pl-btn" onClick={close}>{t('dlgClose')}</button>
            </header>
            <ul>
              <Row icon={<PortSvg kind="ok" th={th} />} title={t('plLegPortOk')} desc={t('plLegPortOkD')} />
              <Row icon={<PortSvg kind="deficit" th={th} />} title={t('plLegPortDeficit')} desc={t('plLegPortDeficitD')} />
              <Row icon={<PortSvg kind="surplus" th={th} />} title={t('plLegPortSurplus')} desc={t('plLegPortSurplusD')} />
              <Row icon={<PortSvg kind="exit" th={th} />} title={t('plLegPortExit')} desc={t('plLegPortExitD')} />
              <Row icon={<PortSvg kind="entry" th={th} />} title={t('plLegPortEntry')} desc={t('plLegPortEntryD')} />
              <Row icon={<PortSvg kind="stalled" th={th} />} title={t('plLegPortStalled')} desc={t('plLegPortStalledD')} />
            </ul>
            <ul>
              <Row icon={<ChipSvg kind="bal" th={th} />} title={t('plLegChipBal')} desc={t('plLegChipBalD')} />
              <Row icon={<ChipSvg kind="sink" th={th} />} title={t('plLegChipSink')} desc={t('plLegChipSinkD')} />
              <Row icon={<ChipSvg kind="direct" th={th} />} title={t('plLegChipDirect')} desc={t('plLegChipDirectD')} />
              <Row icon={<ChipSvg kind="pipe" th={th} />} title={t('plLegChipPipe')} desc={t('plLegChipPipeD')} />
              <Row icon={<ChipSvg kind="short" th={th} />} title={t('plLegChipShort')} desc={t('plLegChipShortD')} />
            </ul>
            <ul>
              <Row icon={<LiftSvg th={th} />} title={t('plLegLift')} desc={t('plLegLiftD')} />
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
