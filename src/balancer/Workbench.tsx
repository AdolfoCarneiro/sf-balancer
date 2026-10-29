// Bancada: o passo a passo da montagem escolhida, a lista de montagens testadas e a vazão de cada trecho. Usada pela
// biblioteca, pelo balancer do plano e pelo modal da ligação da Fábrica. Montagem: normal (designs planos), borboleta
// ou 3D (qualquer design em torres ou andares, com lifts).
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { getLang, t, fmt } from '../i18n/index.js';
import { layout3d, planFootprint, balancerCandidates, rankDesigns, designWhy, designPieces, designName } from '../logic/index.js';
import { cap1, designKey, segName } from './balancerSvg.js';
import { Tip } from './help.tsx';
import { Ponder, Seg, flatLayout, type Design, type Labels, type Marks } from './Ponder.tsx';
import { setLib, useLib, type Blueprint } from './prefs.ts';

// Atalhos externos para quem não quer montar o balancer na mão: o mod e os blueprints da comunidade.
export const EXT_MOD = 'https://ficsit.app/mod/LoadBalancers';
export const extBpUrl = () => `https://satisfactory-calculator.com/${getLang()}/blueprints`;
export const extLink = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`;
export const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function whyText(ranked: Design[]) {
  const w = designWhy(ranked);
  if (w.code === 'none') return t('whyNone');
  if (w.code === 'bp') return t('whyBp', w.a.bp.n, w.a.bp.m);
  if (w.code === 'only') return t('whyOnly');
  if (w.code === 'more') return t('whyMore', fmt(w.a.perOut), designName(w.b), fmt(w.b.perOut));
  if (w.code === 'noSink') return t('whyNoSink', designName(w.b), fmt(w.b.sinkRate));
  if (w.code === 'fewer') return t('whyFewer', designPieces(w.a), designName(w.b), designPieces(w.b));
  if (w.code === 'simpler') return t('whySimpler', designName(w.b), designPieces(w.b), designPieces(w.a));
  return t('whyTie', designName(w.b));
}

function designNote(d: Design, belt: string) {
  if (d.applies) return t({ notDirect: 'rNotDirect', direct: 'rDirect', oneInput: 'rOneInput', shape: 'rShape', bpShape: 'rBpShape', butterflyShape: 'rButterfly', bfExtra: 'rBfExtra', loopFits: 'rLoopFits' }[d.applies as string]!, d.M, d.n);
  const bad = d.segments.find((s: Design) => !s.ok);
  const note = bad ? t('rLimit', segName(bad), fmt(bad.rate), belt) : t('rNoLimit');
  return note + (d.sinkRate > 0.05 ? `; ${t('lgToSink')} ${fmt(d.sinkRate)}/min` : '');
}

// A vazão de cada trecho da montagem contra a esteira.
export function ChecksTable({ d, belt }: { d: Design; belt: string }) {
  return (
    <>
      <div className="tablewrap"><table className="checks"><tbody>
        <tr><th>{t('thSegment')}</th><th>{t('thLoad')}</th><th>{t('thFits', belt)}</th></tr>
        {d.segments.map((s: Design, i: number) => (
          <tr key={i}><td>{segName(s)}</td><td>{fmt(s.rate)}</td><td className={s.ok ? 'ok' : 'bad'}>{s.ok ? '✓' : '✗'}</td></tr>
        ))}
      </tbody></table></div>
      <p className="hint">{t('checkNote', belt, fmt(d.perOut)) + (d.segments.some((s: Design) => !s.ok) ? ` ${t('checkOver')}` : '')}</p>
    </>
  );
}

export interface BenchProps {
  N: number; M: number; rates: number[]; cap: number; belt: string; blueprints: Blueprint[]; labels: Labels;
  inUse?: string | null;   // a montagem que o plano usa (ganha a marca "em uso")
  // A montagem e a aba abertas: com onView/onStyle, quem chama guarda; sem, a bancada guarda (começando por view/style).
  view?: string | null; onView?: (k: string) => void;
  style?: string; onStyle?: (s: string) => void;
  marksBox?: { planMarks?: Marks };   // guarda as marcações da planta entre um desenho e outro (a biblioteca)
}

const STYLES = ['normal', 'butterfly', '3d'] as const;
const isBf = (d: Design) => d.kind.startsWith('butterfly');
const STYLE_FILTER: Record<string, (d: Design) => boolean> = { normal: d => !isBf(d), butterfly: isBf, '3d': d => d.kind !== 'blueprint' };

export function Workbench(p: BenchProps) {
  const prefs = useLib();
  const [ownView, setOwnView] = useState(p.view ?? null);
  const [ownStyle, setOwnStyle] = useState(p.style ?? 'normal');
  const ownMarks = useRef<{ planMarks?: Marks }>({});
  const view = p.onView ? p.view ?? null : ownView;
  const rawStyle = p.onStyle ? p.style ?? 'normal' : ownStyle;
  // Quem tinha a antiga aba Vertical salva abre no 3D.
  const style = rawStyle === 'vertical' ? '3d' : (STYLES as readonly string[]).includes(rawStyle) ? rawStyle : 'normal';
  const pickView = (k: string) => { if (p.onView) p.onView(k); else setOwnView(k); };
  const pickStyle = (s: string) => {
    if (s === style) return;
    if (p.onStyle) p.onStyle(s); else setOwnStyle(s);
  };

  const ratesKey = p.rates.join(',');
  const all: Design[] = useMemo(() => rankDesigns(balancerCandidates(p.N, p.M, p.rates, p.cap, p.blueprints)),
    [p.N, p.M, ratesKey, p.cap, p.blueprints, getLang()]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cands = all.filter(STYLE_FILTER[style]);
  const best = cands[0];
  // Aba (normal ou borboleta) onde está o melhor design de todos: marca a aba e avisa quando é outra.
  const top = all.find(d => !d.applies);
  const topStyle = top ? (isBf(top) ? 'butterfly' : 'normal') : null;
  const better = top && style !== '3d' && topStyle !== style
    ? t('styleBetter', `<button type="button" data-style="${topStyle}">${t('style' + cap1(topStyle!))}</button>`, esc(designName(top)), designPieces(top), fmt(top.perOut))
    : null;
  const styleBar = (
    <div className="wb-style">
      <span className="wb-style-l">{t('styleTitle')}<Tip k="tipStyle" /></span>
      <Seg label={t('styleTitle')} attr="style" options={STYLES} value={style} text={k => t('style' + cap1(k))} onPick={pickStyle}
        best={topStyle} bestTitle={t('styleBestTip')} />
      {better && (
        <p className="wb-better" dangerouslySetInnerHTML={{ __html: better }}
          onClick={(e: MouseEvent) => { const b = (e.target as Element).closest<HTMLElement>('[data-style]'); if (b) pickStyle(b.dataset.style!); }} />
      )}
    </div>
  );
  if (!best || best.applies) return <>{styleBar}<p className="lead">{t(style === 'butterfly' ? 'styleNone' : 'whyNone')}</p></>;

  const d = cands.find(x => !x.applies && designKey(x) === view) || best;
  const pc = d.pieces;
  // A borboleta abre em Andares (uma rodada por andar, como a borboleta vertical do jogo); em Torres as misturas entre
  // faixas viram esteiras compridas por cima de tudo. A escolha de cada família fica guardada à parte.
  const bfMode = isBf(d), pref = bfMode ? prefs.mode3dBf : prefs.mode3d;
  const mode3d = pref === 'floors' || pref === 'towers' ? pref : bfMode ? 'floors' : 'towers';
  const fl = style === '3d' ? layout3d(d, mode3d) : null;
  // Normal e borboleta mostram a planta: o espaço que ocupa e o Blueprint Designer que comporta.
  const pl = style !== '3d' && d.kind !== 'blueprint' ? flatLayout(d) : null, fp = pl && prefs.view2d === 'plan' ? planFootprint(pl) : null;
  // Marcações do Blueprint Designer da planta: ficam enquanto a montagem é a mesma (trocar Por nível/Por peça ou
  // Esquema/Planta mantém); mudou N→M, taxa, tier ou montagem, voltam ao padrão. Não vão para o link.
  const markKey = [style, designKey(d), p.N, p.M, p.rates.join(','), p.cap, p.belt].join('|');
  const mb = p.marksBox || ownMarks.current;
  if (!mb.planMarks || mb.planMarks.key !== markKey) mb.planMarks = { key: markKey, list: null, move: false };
  // O nome com as marcas "melhor" e "em uso" (o espaço antes de cada marca no mesmo texto do nome, como no HTML).
  const named = (c: Design, marks = true) => {
    const best1 = marks && c === best, use = marks && p.inUse === designKey(c);
    return (
      <>
        {cap1(designName(c)) + (best1 ? ' ' : '')}
        {best1 && <span className="ctag">{t('bestTag')}</span>}
        {use && <>{' '}<span className="ctag use">{t('inUseTag')}</span></>}
      </>
    );
  };
  const mode = fl ? mode3d : '2d';

  return (
    <>
      {styleBar}
      <div className="wb">
        <div>
          <div className="wb-stage">
            <Ponder key={[markKey, mode, prefs.per3d, prefs.view2d, getLang()].join('|')} d={d} labels={p.labels} mode={mode}
              lay={fl || pl} per={prefs.per3d} view2d={prefs.view2d} marks={mb.planMarks}
              onView2d={v => setLib({ view2d: v })}
              onMode={m => setLib(bfMode ? { mode3dBf: m } : { mode3d: m })}
              onPer={v => setLib({ per3d: v })} />
          </div>
          <div className="wb-checks">
            <h4>{t('checksTitle')}</h4>
            <ChecksTable d={d} belt={p.belt} />
            {fl && <p className="hint">{t('vertNote')}</p>}
            {fp && <p className="hint">{t('planNote')}</p>}
          </div>
        </div>
        <aside className="wb-side">
          <div className="wb-head"><span className="wb-shape num">{`${d.N}→${d.M}`}</span><span className="wb-name">{named(d)}</span></div>
          <dl className="pc-grid num">
            {pc.blueprints
              ? <div><dt>Blueprint</dt><dd>{pc.blueprints}</dd></div>
              : <><div><dt>{t('thSplitters')}</dt><dd>{pc.splitters}</dd></div><div><dt>{t('thMergers')}</dt><dd>{pc.mergers}</dd></div></>}
            {fl && <div><dt>{t('thLifts')}</dt><dd>{fl.lifts}</dd></div>}
            {fp && (
              <div className="pc-space">
                <dt>{t('thSpace')}<Tip k="tipSpace" /></dt>
                <dd>{t('spaceVal', fp.fw, fp.fd)}<small>{t('spaceM', fp.w, fp.d)}</small></dd>
                <dd className={fp.mk ? 'ok' : 'bad'}>{fp.mk ? t('bpFits', fp.mk) : t('bpNone')}</dd>
              </div>
            )}
            <div><dt>{t('thPerOut')}</dt><dd>{fmt(d.perOut)}<small>/min</small></dd></div>
          </dl>
          <div>
            {d === best
              ? <><h4>{t('whyTitle')}</h4><p>{whyText(cands)}</p></>
              : <><h4>{t('whyNotTitle')}</h4><p>{`${cap1(designName(best))}: ${whyText([best, d])}`}</p></>}
          </div>
          <div>
            <h4>{t('designsTitle')}<Tip k="tipDesigns" /></h4>
            <div className="cands" role="radiogroup" aria-label={t('designsTitle')}>
              <div className="cand-h" aria-hidden="true"><span>{t('thDesign')}</span><span>{t('thPerOut')}</span><span>{t('stPieces')}</span></div>
              {cands.map(c => (
                <button key={designKey(c)} type="button" className={'cand' + (c === d ? ' sel' : '')} role="radio" aria-checked={c === d}
                  data-key={designKey(c)} disabled={!!c.applies} onClick={() => pickView(designKey(c))}>
                  <span className="cn">{named(c, !c.applies)}</span>
                  <span className="cv">{c.applies ? '—' : fmt(c.perOut)}</span>
                  <span className="cp">{c.applies ? '' : designPieces(c)}</span>
                  <span className="cnote">{designNote(c, p.belt)}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <p className="hint ext" dangerouslySetInnerHTML={{ __html: t('extHint', extLink(EXT_MOD, 'Modular Load Balancers'), extLink(extBpUrl(), 'Satisfactory Calculator')) }} />
    </>
  );
}
