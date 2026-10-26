// Tutorial guiado (os passos em model/tour.ts): um balão ancorado no alvo de verdade, com o resto da tela escurecido e
// o alvo recortado. Abre sozinho na primeira visita (lembrado em sf-balancer:planner-tour como done/skipped) e de novo
// pelo botão "Tutorial" ou pelos "? Como mexer" de cada área (openTour(área)). Alvo que não está na tela (painel
// fechado, celular, etapa fechada) pula o passo; Esc pula o tutorial; o foco fica no balão e volta para quem abriu.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/index.js';
import { TOUR_STORE, nextShown, targetNames, tourDone, tourSteps, type TourArea, type TourStep } from '../model/tour.ts';

const OPEN_EVENT = 'sf-planner:tour';
const FIRST_DELAY_MS = 700;      // primeira visita: espera o mapa desenhar o primeiro quadro
const LOST_FRAMES = 20;          // alvo sumido por tantos quadros: passa para o próximo
const PAD = 6, GAP = 14, MARGIN = 12;

export function openTour(area?: TourArea) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: area ?? null }));
}

type Box = { x: number; y: number; w: number; h: number };

// Pontos do canvas (porta, chip, bloco) não são elementos: o mapa registra quem calcula o retângulo deles na tela.
const anchors = new Map<string, () => Box | null>();
export function useTourAnchor(name: string, fn: () => Box | null) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const get = () => latest.current();
    anchors.set(name, get);
    return () => { if (anchors.get(name) === get) anchors.delete(name); };
  }, [name]);
}

// Conteúdo a mais embaixo do texto de um passo (ex.: as cores do desenho da etapa), pelo nome do alvo.
const extras = new Map<string, ReactNode>();
export function useTourExtra(name: string, node: ReactNode) {
  useEffect(() => {
    extras.set(name, node);
    return () => { if (extras.get(name) === node) extras.delete(name); };
  });
}

function visible(el: HTMLElement): boolean {
  const ck = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  if (ck && !ck.call(el, { visibilityProperty: true })) return false;
  if (!ck && getComputedStyle(el).visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width >= 1 && r.height >= 1;
}

// O primeiro alvo à vista entre as alternativas do passo.
function findTarget(target: string): { box: Box; el: HTMLElement | null; name: string } | null {
  for (const name of targetNames(target)) {
    const v = anchors.get(name)?.();
    if (v) return { box: v, el: null, name };
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      return { box: { x: r.left, y: r.top, w: r.width, h: r.height }, el, name };
    }
  }
  return null;
}

const readSeen = (): boolean => { try { return tourDone(localStorage.getItem(TOUR_STORE)); } catch { return false; } };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Run { steps: TourStep[]; i: number }

export function Tour() {
  const [run, setRun] = useState<Run | null>(null);
  const opener = useRef<Element | null>(null);
  const boxEl = useRef<HTMLDivElement>(null);
  const spotEl = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const start = (area: TourArea | null) => {
    const steps = tourSteps(area ?? undefined);
    const i = nextShown(steps.length, -1, 1, k => !!findTarget(steps[k].target));
    if (i === null) return;
    if (!runRef.current) opener.current = document.activeElement;
    setRun({ steps, i });
  };

  useEffect(() => {
    const on = (e: Event) => start((e as CustomEvent<TourArea | null>).detail);
    window.addEventListener(OPEN_EVENT, on);
    const timer = readSeen() ? 0 : window.setTimeout(() => { if (!runRef.current && !readSeen()) start(null); }, FIRST_DELAY_MS);
    return () => { window.removeEventListener(OPEN_EVENT, on); clearTimeout(timer); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (how: 'done' | 'skipped') => {
    try { localStorage.setItem(TOUR_STORE, how); } catch { /* sem storage: vale só nesta visita */ }
    setRun(null);
    const el = opener.current as HTMLElement | null;
    opener.current = null;
    if (el?.isConnected && typeof el.focus === 'function') el.focus();
  };
  const go = (dir: 1 | -1) => {
    const r = runRef.current;
    if (!r) return;
    const j = nextShown(r.steps.length, r.i, dir, k => !!findTarget(r.steps[k].target));
    if (j !== null) setRun({ ...r, i: j });
    else if (dir === 1) finish('done');
  };

  // Passo novo: o alvo entra na tela (rolando o painel, se for o caso); depois, a cada quadro, recorte e balão seguem o
  // alvo (câmera do mapa, rolagem, redimensionar); sumiu de vez: próximo. Layout effect: o primeiro posicionamento sai
  // antes de pintar (sem o balão piscar no canto) e o foco vai para o botão principal já visível.
  useLayoutEffect(() => {
    if (!run) return;
    findTarget(run.steps[run.i].target)?.el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    let raf = 0, lost = 0, last = '';
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const found = findTarget(run.steps[run.i].target);
      const box = boxEl.current, spot = spotEl.current;
      if (!found || !box || !spot) {
        if (++lost >= LOST_FRAMES) { cancelAnimationFrame(raf); go(1); }
        return;
      }
      lost = 0;
      const W = window.innerWidth, H = window.innerHeight;
      // O recorte fica dentro da janela (um painel alto não estoura a tela).
      const sx = clamp(found.box.x - PAD, 2, W - 2), sy = clamp(found.box.y - PAD, 2, H - 2);
      const sr = clamp(found.box.x + found.box.w + PAD, sx, W - 2), sb = clamp(found.box.y + found.box.h + PAD, sy, H - 2);
      const bw = box.offsetWidth, bh = box.offsetHeight;
      const cx = (sx + sr) / 2, cy = (sy + sb) / 2;
      let place = 'below', left = 0, top = 0;
      if (sb + GAP + bh <= H - MARGIN) { top = sb + GAP; left = clamp(cx - bw / 2, MARGIN, W - bw - MARGIN); }
      else if (sy - GAP - bh >= MARGIN) { place = 'above'; top = sy - GAP - bh; left = clamp(cx - bw / 2, MARGIN, W - bw - MARGIN); }
      else if (sx - GAP - bw >= MARGIN) { place = 'left'; left = sx - GAP - bw; top = clamp(cy - bh / 2, MARGIN, H - bh - MARGIN); }
      else if (sr + GAP + bw <= W - MARGIN) { place = 'right'; left = sr + GAP; top = clamp(cy - bh / 2, MARGIN, H - bh - MARGIN); }
      else { place = 'inside'; left = clamp(cx - bw / 2, MARGIN, W - bw - MARGIN); top = clamp(sb - bh - MARGIN, MARGIN, H - bh - MARGIN); }
      // A seta do balão aponta para o meio do alvo (dentro das bordas do balão).
      const arrow = place === 'below' || place === 'above' ? clamp(cx - left, 18, bw - 18) : clamp(cy - top, 18, bh - 18);
      const key = [sx, sy, sr, sb, left, top, place, arrow].map(v => typeof v === 'number' ? Math.round(v) : v).join('|');
      if (key === last) return;
      last = key;
      Object.assign(spot.style, { left: `${sx}px`, top: `${sy}px`, width: `${sr - sx}px`, height: `${sb - sy}px` });
      Object.assign(box.style, { left: `${left}px`, top: `${top}px` });
      box.style.setProperty('--arrow', `${arrow}px`);
      box.dataset.place = place;
      box.dataset.ready = '1';
    };
    frame();
    primary.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(raf);
  }, [run]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) return null;
  const { steps, i } = run;
  const s = steps[i];
  // Contagem pelos passos à vista agora (os que vão ser pulados não entram).
  const shown = steps.map((x, k) => k === i || !!findTarget(x.target));
  const n = shown.filter(Boolean).length, at = shown.slice(0, i + 1).filter(Boolean).length;
  const hasPrev = nextShown(steps.length, i, -1, k => shown[k]) !== null;
  const isLast = nextShown(steps.length, i, 1, k => shown[k]) === null;
  const extra = targetNames(s.target).map(name => extras.get(name)).find(Boolean);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('skipped'); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if ((e.target as HTMLElement).tagName === 'BUTTON') { e.preventDefault(); go(e.key === 'ArrowRight' ? 1 : -1); }
      e.stopPropagation();
      return;
    }
    e.stopPropagation();   // atalhos do mapa (Delete, setas, Ctrl+Z) não valem com o tutorial aberto
    if (e.key !== 'Tab' || !boxEl.current) return;
    const f = [...boxEl.current.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !boxEl.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !boxEl.current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className="pl-tour" onKeyDown={onKey}>
      {/* Pega os cliques fora do balão: o tutorial não deixa mexer no mapa por baixo. */}
      <div className="pl-tour-back" onPointerDown={e => e.preventDefault()} />
      <div className="pl-tour-spot" ref={spotEl} aria-hidden="true" />
      <div className="pl-tour-box" ref={boxEl} role="dialog" aria-modal="true" aria-labelledby="pl-tour-title"
        aria-describedby="pl-tour-body">
        <div className="pl-tour-head">
          <span className="pl-tour-n">{t('plTourCount', String(at), String(n))}</span>
          <span className="pl-tour-ticks" aria-hidden="true">
            {Array.from({ length: n }, (_, k) => <i key={k} className={k < at ? 'on' : ''} />)}
          </span>
        </div>
        <h2 id="pl-tour-title" aria-live="polite">{t(s.title)}</h2>
        <p id="pl-tour-body">{t(s.body)}</p>
        {extra}
        <div className="pl-tour-acts">
          <button type="button" className="pl-btn pl-tour-skip" onClick={() => finish('skipped')}>{t('plTourSkip')}</button>
          <span className="pl-grow" />
          <button type="button" className="pl-btn" disabled={!hasPrev} onClick={() => go(-1)}>{t('plTourBack')}</button>
          <button type="button" className="pl-btn pl-primary" ref={primary}
            onClick={() => (isLast ? finish('done') : go(1))}>{t(isLast ? 'plTourDone' : 'plTourNext')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// "? Como mexer" de uma área: abre só os passos dela.
export function TourHelp({ area, className, tour }: { area: TourArea; className?: string; tour?: string }) {
  return (
    <button type="button" className={'pl-btn pl-tour-help ' + (className ?? '')} data-tour={tour} aria-haspopup="dialog"
      aria-label={t('plTourHelpOf', area)} title={t('plTourHelpOf', area)} onClick={() => openTour(area)}>
      <span aria-hidden="true">?</span><span className="pl-tour-help-t"> {t('plTourHelp')}</span>
    </button>
  );
}
