// Biblioteca de balancers: o gerador N→M (com os blueprints que eu tenho), o que é e como montar, e o catálogo das
// famílias de montagem.
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t, fmt, parseNum } from '../i18n/index.js';
import { BELTS, balancerDesign, butterflyDesign, designName } from '../logic/index.js';
import { cap1, flatSvg, tags } from './balancerSvg.js';
import { Tip } from './help.tsx';
import { inLang } from './model.ts';
import { flatLayout, type Marks } from './Ponder.tsx';
import { BeltSelect } from './Form.tsx';
import { Workbench } from './Workbench.tsx';
import { setBps, setLib, useBps, useLib } from './prefs.ts';
import { BALANCER_PAGES, nmPath } from '../seo/routes.js';
import { NM_BELT, nmInfo } from '../seo/nm.js';

// Abre um balancer N→M no gerador (o endereço /balancer/3-to-4 e a lista "Balancers prontos"): esteira Mk4 cheia, como a
// página dele, na aba da melhor montagem; e rola até o gerador.
export function openNM(n: number, m: number, smooth = true) {
  setLib({ n: String(n), m: String(m), rate: '', belt: NM_BELT.id, view: null, style: nmInfo(n, m).style });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => document.getElementById('gen')?.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' }));
}

const CATALOG = [
  { kind: 'matrix', n: 3, m: 4, rate: 240, ds: 'dsMatrix' },
  { kind: 'funnel', n: 3, m: 2, rate: 120, ds: 'dsFunnel' },
  { kind: 'matrix-loop', n: 2, m: 5, rate: 240, ds: 'dsMatrixLoop' },
  { kind: 'matrix-split-loop', n: 1, m: 5, rate: 480, ds: 'dsMatrixSplitLoop' },
  { kind: 'funnel-loop', n: 3, m: 5, rate: 60, ds: 'dsFunnelLoop' },
  { kind: 'matrix-sink', n: 1, m: 7, rate: 480, ds: 'dsMatrixSink' },
  { kind: 'funnel-sink', n: 2, m: 5, rate: 60, ds: 'dsFunnelSink' },
  { kind: 'butterfly', n: 4, m: 4, rate: 480, ds: 'dsButterfly' },
  { kind: 'butterfly-loop', n: 5, m: 5, rate: 300, ds: 'dsButterflyLoop' },
];
const libLabels = (N: number, M: number) => ({ ins: tags(t('inTag'), N) as string[], outs: tags(t('outTag'), M) as string[] });
const intIn = (s: string, lo: number, hi: number) => { const v = parseNum(s); return Number.isInteger(v) && v >= lo && v <= hi ? v as number : null; };

export const Library = memo(function Library({ lang }: { lang: string }) {
  const lib = useLib();
  const bps = useBps();
  const marks = useRef<{ planMarks?: Marks }>({});
  const gen = useRef<HTMLDivElement>(null);
  // A taxa digitada muda de formato junto com o idioma.
  const seen = useRef(lang);
  useLayoutEffect(() => {
    const prev = seen.current;
    seen.current = lang;
    if (prev === lang || !lib.rate.trim()) return;
    const v = inLang(prev, () => parseNum(lib.rate));
    if (isFinite(v)) setLib({ rate: fmt(v, 6) });
  }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  const N = intIn(lib.n, 1, 12), M = intIn(lib.m, 2, 12);
  const belt = BELTS.find((b: { id: string }) => b.id === lib.belt) || BELTS[3];
  const rv = parseNum(lib.rate);
  const rateOk = lib.rate.trim() === '' || rv > 0;
  const rates = useMemo(() => [rv > 0 ? rv : belt.cap], [rv, belt.cap]);
  const labels = useMemo(() => (N && M ? libLabels(N, M) : null), [N, M, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Mudou N, M, a taxa ou a esteira: volta para a melhor montagem.
  const edit = (patch: Parameters<typeof setLib>[0]) => setLib({ ...patch, view: null });

  const [bpN, setBpN] = useState(''), [bpM, setBpM] = useState('');
  const [bpBad, setBpBad] = useState({ n: false, m: false });
  const bpNRef = useRef<HTMLInputElement>(null);
  const addBp = () => {
    const n = parseNum(bpN), m = parseNum(bpM);
    const okN = Number.isInteger(n) && n >= 1 && n <= 12, okM = Number.isInteger(m) && m >= 2 && m <= 12;
    setBpBad({ n: !okN, m: !okM });
    if (!okN || !okM) return;
    if (!bps.some(b => b.n === n && b.m === m)) setBps([...bps, { n, m }]);
    bpNRef.current?.focus();
  };

  const catalog = useMemo(() => CATALOG.map(c => {
    const d = c.kind.startsWith('butterfly') ? butterflyDesign(c.n, c.m, [c.rate], 480, c.kind) : balancerDesign(c.kind, c.n, c.m, [c.rate], 480);
    return { c, name: cap1(designName(d)) as string, svg: flatSvg(d, flatLayout(d), libLabels(c.n, c.m), 'level', false) as string };
  }), [lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  const openCatalog = (c: typeof CATALOG[number]) => {
    const bf = c.kind.startsWith('butterfly');
    setLib({ n: String(c.n), m: String(c.m), rate: fmt(c.rate), view: c.kind, style: bf ? 'butterfly' : lib.style === 'butterfly' ? 'normal' : lib.style });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    gen.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section className="library" id="library" aria-labelledby="libTitle">
      <h2 id="libTitle">{t('libTitle')}</h2>
      <p className="lead">{t('libLead')}</p>
      <div className="plate gen" id="gen" ref={gen}>
        <div className="fld">
          <div className="cell-head"><label htmlFor="libN">{t('genIn')}</label></div>
          <input className={'field' + (N ? '' : ' invalid')} id="libN" type="text" inputMode="numeric" value={lib.n} onChange={e => edit({ n: e.target.value })} />
        </div>
        <span className="gen-arrow" aria-hidden="true">→</span>
        <div className="fld">
          <div className="cell-head"><label htmlFor="libM">{t('genOut')}</label></div>
          <input className={'field' + (M ? '' : ' invalid')} id="libM" type="text" inputMode="numeric" value={lib.m} onChange={e => edit({ m: e.target.value })} />
        </div>
        <div className="fld">
          <div className="cell-head"><span><label htmlFor="libRate">{t('genRate')}</label><Tip k="tipGenRate" /></span></div>
          <input className={'field' + (rateOk ? '' : ' invalid')} id="libRate" type="text" inputMode="decimal" placeholder={fmt(belt.cap)} value={lib.rate} onChange={e => edit({ rate: e.target.value })} />
        </div>
        <div className="fld">
          <div className="cell-head"><label htmlFor="libBelt">{t('genBelt')}</label></div>
          <BeltSelect id="libBelt" value={belt.id} onChange={v => edit({ belt: v })} />
        </div>
        <div className="bps-wrap">
          <div className="cell-head"><span><span>{t('bpTitle')}</span><Tip k="tipBp" /></span></div>
          <div className="bps" id="bpList">
            {bps.length
              ? bps.map((b, i) => (
                <span key={`${b.n}-${b.m}`} className="bp-chip num">{`${b.n}→${b.m}`}<button type="button" aria-label={t('bpRemove', b.n, b.m)}
                  onClick={() => { setBps(bps.filter((_, j) => j !== i)); bpNRef.current?.focus(); }}>×</button></span>
              ))
              : <span className="dim">{t('bpEmpty')}</span>}
            <span className="bp-add" onKeyDown={e => { if (e.key === 'Enter') addBp(); }}>
              <input ref={bpNRef} className={'field' + (bpBad.n ? ' invalid' : '')} id="bpN" type="text" inputMode="numeric" placeholder="N" aria-label={t('bpInAria')} value={bpN} onChange={e => setBpN(e.target.value)} />
              <span aria-hidden="true">→</span>
              <input className={'field' + (bpBad.m ? ' invalid' : '')} id="bpM" type="text" inputMode="numeric" placeholder="M" aria-label={t('bpOutAria')} value={bpM} onChange={e => setBpM(e.target.value)} />
              <button type="button" className="pbtn" id="bpAdd" onClick={addBp}>{t('bpAdd')}</button>
            </span>
          </div>
        </div>
      </div>
      <div id="libOut">
        {N && M && rateOk && labels
          ? <Workbench N={N} M={M} rates={rates} cap={belt.cap} belt={belt.id} blueprints={bps} labels={labels}
              view={lib.view} onView={v => setLib({ view: v })} style={lib.style} onStyle={s => setLib({ style: s, view: null })} marksBox={marks.current} />
          : <p className="lead">{t('invalid')}</p>}
      </div>
      <div className="learn">
        <div><h3>{t('lbWhatTitle')}</h3><p>{t('lbWhat')}</p></div>
        <div><h3>{t('lbHowTitle')}</h3><p>{t('lbHow')}</p></div>
        <div><h3>{t('lbWhyTitle')}</h3><p>{t('lbWhy')}</p></div>
        <div><h3>{t('lbNotTitle')}</h3><p>{t('lbNot')}</p></div>
        <div className="bf"><h3>{t('lbBfTitle')}</h3><p>{t('lbBf')}</p></div>
        <div className="build">
          <h3>{t('lbBuildTitle')}</h3>
          <ol>{[1, 2, 3, 4, 5].map(i => <li key={i}>{t('lbBuild' + i)}</li>)}</ol>
        </div>
      </div>
      <div className="catalog">
        <h3>{t('catTitle')}</h3>
        <p className="lead">{t('catLead')}</p>
        <div className="cat-grid" id="catGrid">
          {catalog.map(({ c, name, svg }) => (
            <div key={c.kind} className="plate cat">
              <div className="thumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
              <h4>{name}</h4>
              <p>{t(c.ds)}</p>
              <button type="button" className="pbtn" data-cat={c.kind} onClick={() => openCatalog(c)}>{t('catExample', c.n, c.m)}</button>
            </div>
          ))}
        </div>
      </div>
      <div className="ready">
        <h3>{t('libReady')}</h3>
        <p className="lead">{t('libReadyLead')}</p>
        <ul className="nm-list">
          {BALANCER_PAGES.map(([n, m]) => {
            const href = nmPath(lang, n, m);
            return (
              <li key={href}>
                <a href={href} className="num" onClick={e => {
                  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  history.pushState(null, '', href + location.search);
                  dispatchEvent(new Event('sf:path'));
                  openNM(n, m);
                }}>{`${n} → ${m}`}</a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
});
