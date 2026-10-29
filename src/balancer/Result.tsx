// O resultado do plano: as alternativas, o desenho do fluxo da escolhida, o balanço de cada linha, o passo a passo, o
// balancer (ou a doadora dividida) e as peças de cada trecho.
import { Fragment, memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { t, srcTag, dstTag, fmt } from '../i18n/index.js';
import { sizeParts, lineComp, summarizeRates, describeTree, balancerCandidates, rankDesigns, designPieces, designName } from '../logic/index.js';
import { cap1 } from './balancerSvg.js';
import { flowSvg, flowHasLoop, flowLegend, treeSvg } from './flow.js';
import { Tip } from './help.tsx';
import { ChecksTable, whyText } from './Workbench.tsx';
import type { Blueprint } from './prefs.ts';

/* eslint-disable @typescript-eslint/no-explicit-any -- o plano vem do computePlan (src/logic, JS, coberto pelos testes) */
export type Plan = any;
export type Alt = any;
type Line = { id: number };
export const O = (l: Line) => srcTag(l.id) as string;
export const Dn = (l: Line) => dstTag(l.id) as string;
const planCost = (a: Alt) => a.pieces.mergers + a.pieces.splitters + a.pieces.smart + a.pieces.blueprints + a.pieces.junctions;
export const tierLabel = (input: { medium: string; belt: string }, cap: number) => (input.medium === 'fluid' ? t('pipeOpt', input.belt, fmt(cap)) : `${input.belt}, ${fmt(cap)}/min`);
const Html = ({ html, as: Tag = 'span', ...rest }: { html: string; as?: 'span' | 'li' | 'p' | 'div'; className?: string; style?: CSSProperties }) =>
  <Tag {...rest} dangerouslySetInnerHTML={{ __html: html }} />;

interface Props {
  p: Plan; alt: Alt; item: string; blueprints: Blueprint[];
  onSelect: (key: string) => void;
  onOpen: (key: string) => void;   // 'plan': o balancer N→M; 'g<i>': a árvore de uma doadora
}

export const Result = memo(function Result({ p, alt, item, blueprints, onSelect, onOpen }: Props) {
  const alts: Alt[] = p.alternatives;
  // O bloco do balancer (ou da doadora) no desenho abre a montagem dele.
  const openIn = (e: MouseEvent | KeyboardEvent) => {
    const k = (e.target as Element).closest?.('[data-open-bal]')?.getAttribute('data-open-bal');
    if (!k) return;
    if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onOpen(k);
  };
  return (
    <>
      <div className="work">
        <aside>
          <h2 className="section-title">{t('alts')}<Tip k="tipAlts" /></h2>
          <p className="lead">{t('altsLead')}</p>
          <div className="alts" role="radiogroup" aria-label={t('alts')}>
            {alts.map((a, i) => <AltCard key={a.key} a={a} first={i === 0} on={a.key === alt.key} onSelect={onSelect} />)}
          </div>
        </aside>
        <section>
          <h2 className="section-title">{alt.title}<Tip k="tipFlow" /></h2>
          <p className="lead">{`${alt.sub} ${t(p.fluid ? 'flowLeadPipe' : 'flowLead')}`}</p>
          <div className="sheet">
            <div style={{ display: 'contents' }} onClick={openIn} onKeyDown={openIn} dangerouslySetInnerHTML={{ __html: flowSvg(p, alt) }} />
            <Html as="div" className="legend" html={flowLegend(p.fluid, flowHasLoop(alt))} />
            {alt.warnings.map((w: string, i: number) => <div key={i} className="warn" style={{ marginTop: 10 }}>{w}</div>)}
            <div className="titleblock num">
              <div>{t('tbItem')}<b>{item}</b></div>
              <div>{t(p.fluid ? 'tbPipe' : 'tbBelt')}<b>{tierLabel(p.input, p.cap)}</b></div>
              <div>{t('tbMid')}<b>{alt.caseLabel}</b></div>
            </div>
          </div>
        </section>
      </div>
      <div className="pair">
        <section className="plate"><h2 className="section-title">{t('balanceTitle')}<Tip k="tipBalance" /></h2><BalanceTable a={alt} /></section>
        <section className="plate">
          <h2 className="section-title">{t('stepsTitle')}</h2>
          <ol className="steps">{planSteps(p, alt).map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      </div>
      <div className="pair">
        <BalancerSection p={p} a={alt} blueprints={blueprints} onOpen={onOpen} />
        <PiecesTable p={p} a={alt} />
      </div>
    </>
  );
});

function AltCard({ a, first, on, onSelect }: { a: Alt; first: boolean; on: boolean; onSelect: (k: string) => void }) {
  const fullCount = [...a.dests.values()].filter((d: any) => d.short < 0.05).length;
  return (
    <button className={'alt' + (on ? ' sel' : '')} type="button" role="radio" aria-checked={on} data-key={a.key} onClick={() => onSelect(a.key)}>
      {first && <span className="rec">{t('recommended')}</span>}
      <span className="alt-title">{a.title}</span>
      <span className="alt-sub">{a.caseLabel}</span>
      <dl className="stats">
        <div><dt>{t('stFull')}</dt><dd className={a.full ? 'ok' : 'bad'}>{`${fullCount}/${a.dests.size}`}</dd></div>
        <div><dt>{t('stSink')}</dt><dd>{fmt(a.sinkRate)}</dd></div>
        <div><dt>{t('stHeld')}</dt><dd>{fmt(a.held)}</dd></div>
        <div><dt>{t('stPieces')}</dt><dd>{planCost(a)}</dd></div>
      </dl>
    </button>
  );
}

function BalanceTable({ a }: { a: Alt }) {
  const v = a.view;
  const dest = (id: number) => {
    if (v.bal && a.bal.inputs.some((l: Line) => l.id === id)) return t('toBalancer', a.feeds.map((f: any) => Dn(f.dst)).join(', '));
    const hvs = (v.headers || []).filter((h: any) => h.h.inputs.some((l: Line) => l.id === id));
    if (hvs.length) return hvs.map((hv: any) => t('toHeader', hv.h.members.map(Dn).join(', '))).join(' · ');
    const fv = v.feeds.find((f: any) => f.f.mains.some((l: Line) => l.id === id));
    if (fv) {
      if (fv.overflowNode === null) return Dn(fv.f.dst);
      return t('destExcess', Dn(fv.f.dst), fv.overflowTo === null ? t('sinkWord') : dstTag(fv.overflowTo));
    }
    const gv = v.groups.find((g: any) => g.gr.donor.id === id);
    if (gv) return t('donatesTo', gv.gr.members.map(dstTag).join(', '));
    return t(({ represar: 'leftHold', sink: 'leftSink', extra: 'leftExtra' } as Record<string, string>)[a.policy]);
  };
  const drained = (id: number) => {
    const dv = v.drains.find((d: any) => d.line.id === id);
    return dv ? ` · ${t('destDrain', fmt(a.sim.flow[dv.sinkEdge]))}` : '';
  };
  const srcs = [...a.sources.values()].sort((x: any, y: any) => x.line.id - y.line.id);
  const dsts = [...a.dests.values()].sort((x: any, y: any) => x.line.id - y.line.id);
  return (
    <>
      <div className="tablewrap"><table><tbody>
        <tr><th>{t('thSrc')}</th><th className="l">{t('thGoesTo')}</th><th>{t('thProduces')}</th><th>{t('thOut')}</th><th>{t('thHeld')}</th></tr>
        {srcs.map((s: any) => (
          <tr key={s.line.id}>
            <td>{O(s.line) + ' '}<span className="sm">{lineComp(s.line)}</span></td><td className="l">{dest(s.line.id) + drained(s.line.id)}</td>
            <td>{fmt(s.line.rate)}</td><td>{fmt(s.out)}</td><td className={s.held > 0.05 ? '' : 'dim'}>{fmt(s.held)}</td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="tablewrap" style={{ marginTop: 16 }}><table><tbody>
        <tr><th>{t('thDst')}</th><th>{t('thDemand')}</th><th>{t('thGets')}</th><th>{t('thStatus')}</th></tr>
        {dsts.map((d: any) => (
          <tr key={d.line.id}>
            <td>{Dn(d.line) + ' '}<span className="sm">{lineComp(d.line)}</span></td><td>{fmt(d.line.rate)}</td><td>{fmt(d.got)}</td>
            <td className={d.short > 0.05 ? 'bad' : 'ok'}>{d.short > 0.05 ? t('statusShort', fmt(d.short), fmt(100 * d.got / d.line.rate)) : t('statusFull')}</td>
          </tr>
        ))}
      </tbody></table></div>
      <p className="hint">{t('balanceHint', fmt(a.sinkRate), a.pieces.sinkBelts, fmt(a.held), fmt(a.extraRate))}</p>
    </>
  );
}

function groupSteps(side: 'src' | 'dst', built: any, conv: string, fluid: boolean): string[] {
  const note = conv === 'k' ? 'k' : 'k−1';
  const head = t(side === 'src' ? 'headSrc' : 'headDst');
  return built.groups.map((g: any) => {
    const lbl = t('stepLbl', head, built.groups.length > 1 ? g.gi + 1 : null);
    if (g.continuous) return lbl + t(fluid ? 'stepContinuousPipe' : 'stepContinuous', fmt(g.total, 2), g.lines);
    const clk = Math.abs(g.clock - 1) > 1e-4 ? t('stepClock', fmt(g.clock * 100, 2)) : '';
    const per = fmt(g.perMachine, 2);
    if (!g.fullLines) return lbl + t('stepNoFull', g.N, clk, per);
    if (g.balanced && g.fullLines < g.sizes.length) {
      return lbl + t('stepBalanced', { N: g.N, clk, per, lines: g.sizes.length, parts: t('lineParts', sizeParts(g.sizes, g.eff)), src: side === 'src', note, fluid });
    }
    return lbl + t('stepGroup', { N: g.N, clk, per, full: g.fullLines, perLine: g.perLine, lineRate: fmt(g.lineRate), src: side === 'src', note, rem: g.rem, fluid });
  });
}

// O plano de conexão em texto, passo a passo.
export function planSteps(p: Plan, a: Alt): string[] {
  const steps: string[] = [];
  const fl = (e: number) => a.sim.flow[e];
  steps.push(...groupSteps('src', p.src, p.conv, p.fluid));
  const mixed = p.src.lines.map((l: any, i: number) => ({ ...l, id: i })).filter((l: any) => l.partial && l.comp && l.comp.length > 1);
  if (mixed.length) steps.push(t('stepMixed', mixed.map((l: any) => `${O(l)} = ${lineComp(l)} (${fmt(l.rate)}/min)`).join('; ')));
  steps.push(...groupSteps('dst', p.dst, p.conv, p.fluid));
  for (const v of a.view.groups) {
    const gr = v.gr, d = gr.division;
    const who = gr.members.map(dstTag).join(', ');
    if (gr.p === 1) steps.push(t('stepDonorWhole', O(gr.donor), who));
    else if (gr.mode === 'direct') steps.push(t('stepDonorDirect', O(gr.donor), fmt(gr.donor.rate), describeTree(d.tree), who));
    else if (gr.mode === 'sink') steps.push(t('stepDonorSink', O(gr.donor), describeTree(d.tree), gr.p, who, d.sink.sinkParts));
    else steps.push(t('stepDonorLoop', O(gr.donor), gr.p, describeTree(d.tree), d.loop.recirculate, who));
  }
  if (a.view.bal) {
    const d = a.view.bal.design;
    steps.push(t('stepBal', a.bal.inputs.map(O).join(', '), d.N, d.M, designName(d), fmt(d.perOut)));
  }
  for (const sv of a.view.splits || []) {
    steps.push(t('stepHeaderSplit', O(sv.sp.line), sv.sp.headers.map((i: number) => a.view.headers[i].h.members.map(Dn).join(' + ')).join(' / '), sv.junctions));
  }
  for (const hv of a.view.headers || []) {
    steps.push(t('stepHeader', hv.h.inputs.map(O).join(' + '), hv.h.members.map(Dn).join(', '), hv.junctions, fmt(hv.inEdges.reduce((s: number, e: number) => s + fl(e), 0))));
  }
  for (const fv of a.view.bal || a.view.headers ? [] : a.view.feeds.slice().sort((x: any, y: any) => x.f.dst.id - y.f.dst.id)) {
    const f = fv.f, ds = a.dests.get(f.dst.id);
    const mains = f.mains.map((l: Line, i: number) => {
      const held = a.sources.get(l.id).held;
      return t('stepMainPass', O(l), fmt(fl(fv.mainEdges[i])), held > 0.05 ? fmt(held) : null);
    }).join(' + ');
    let s = t('stepDstHead', Dn(f.dst), fmt(f.dst.rate));
    if (fv.overflowNode !== null) {
      const toD = fv.overflowTo === null ? null : dstTag(fv.overflowTo);
      s += t('stepOverflow', f.mains.map(O).join(' + '), fmt(fl(fv.outEdge)), fmt(fl(fv.overflowTo === null ? fv.sinkEdge : fv.overflowEdge)), toD);
    } else {
      const extras: string[] = [];
      if (fv.partEdge !== null) extras.push(t('stepPartDonor', fmt(fl(fv.partEdge))));
      fv.inbound.forEach((ib: any) => extras.push(t('stepExcessFrom', dstTag(ib.from), fmt(fl(ib.edge)))));
      if (extras.length) s += t('stepMerged', mains, extras.join(' + '), fv.mergers);
      else if (f.mains.length > 1) s += t('stepJoined', mains, fv.mergers);
      else s += t('stepDirect', mains);
    }
    s += ds.short > 0.05 ? t('stepShort', fmt(ds.short)) : t('stepFull');
    steps.push(s);
  }
  if (a.view.drains.length) {
    const tot = a.view.drains.reduce((acc: number, d: any) => acc + fl(d.sinkEdge), 0);
    steps.push(t('stepDrain', a.view.drains.map((d: any) => O(d.line)).join(', '), a.view.drains.length, fmt(tot)));
  }
  for (const d of a.unfed) steps.push(t('stepUnfed', Dn(d)));
  if (a.view.leftovers.length) {
    const names = a.view.leftovers.map((l: any) => O(l.line)).join(', ');
    const tot = a.view.leftovers.reduce((s: number, l: any) => s + l.line.rate, 0);
    steps.push(t('stepLeftover', names, a.view.leftovers.length, fmt(tot), a.policy));
  }
  return steps;
}

const Ok = () => <span className="ok">✓</span>;
const OpenRow = ({ k, prim, onOpen }: { k: string; prim?: boolean; onOpen: (k: string) => void }) => (
  <div className="open-row"><button type="button" className={'pbtn' + (prim ? ' prim' : '')} data-open-bal={k} onClick={() => onOpen(k)}>{t('lbOpen')}</button></div>
);

// O balancer N→M da alternativa: a montagem escolhida, por que ela e por que (ou não) um balancer aqui. Sem balancer:
// as doadoras divididas (direto, com loop ou com sink), os Smart Splitters e as sobras pro sink.
function BalancerSection({ p, a, blueprints, onOpen }: { p: Plan; a: Alt; blueprints: Blueprint[]; onOpen: (k: string) => void }) {
  if (a.view.bal) {
    const d = a.view.bal.design;
    const ranked = rankDesigns(balancerCandidates(d.N, d.M, d.rates, p.cap, blueprints));
    const best = p.alternatives[0];
    return (
      <section className="plate">
        <h2 className="section-title">{t('lbBalTitle', d.N, d.M)}<Tip k="tipLb" /></h2>
        <p style={{ margin: '0 0 6px' }}>{t('lbBalLine', cap1(designName(d)), designPieces(d), fmt(d.perOut))}</p>
        <p className="dim" style={{ margin: '0 0 12px' }}>{whyText(ranked)}</p>
        <ChecksTable d={d} belt={p.input.belt} />
        <h3 className="donor-title">{t('whyVsTitle')}</h3>
        <div className="opt on"><ul>
          <li>{best === a ? t('whyIsBest') : t('whyVsBest', best.title, best.full, planCost(best), planCost(a))}</li>
          <li>{t('whyBalWhen')}</li>
          <li>{t('whyOverflow')}</li>
        </ul></div>
        <OpenRow k="plan" prim onOpen={onOpen} />
      </section>
    );
  }
  if (p.fluid) {
    return (
      <section className="plate">
        <h2 className="section-title">{t('pipeTitle')}<Tip k="tipMedium" /></h2>
        <p style={{ margin: '0 0 8px' }}>{t('pipeNote')}</p>
        <p className="dim" style={{ margin: '0 0 8px' }}>{t('pipeValve')}</p>
        {a.view.headers && <p className="dim" style={{ margin: 0 }}>{t('pipeHeaderCap', fmt(p.cap))}</p>}
      </section>
    );
  }
  const groups = a.view.groups.filter((v: any) => v.gr.p > 1);
  const smart = a.view.feeds.filter((f: any) => f.overflowNode !== null);
  const drains = a.view.drains;
  const title = <h2 className="section-title">{t('lbTitle')}<Tip k="tipLb" /></h2>;
  if (!groups.length && !smart.length && !drains.length) return <section className="plate">{title}<p className="dim" style={{ margin: 0 }}>{t('lbNone')}</p></section>;
  const fl = (e: number) => a.sim.flow[e];
  return (
    <section className="plate">
      {title}
      {(smart.length > 0 || drains.length > 0) && (
        <>
          <h3 className="donor-title">{t('lbSmartTitle')}</h3>
          <div className="opt on">
            <ul>
              {smart.map((fv: any, i: number) => {
                const toD = fv.overflowTo === null ? null : dstTag(fv.overflowTo);
                const over = fl(fv.overflowTo === null ? fv.sinkEdge : fv.overflowEdge);
                return <Html key={'s' + i} as="li" html={t('lbSmartItem', fv.f.mains.map(O).join(' + '), Dn(fv.f.dst), toD, fmt(over))} />;
              })}
              {drains.map((d: any, i: number) => <Html key={'d' + i} as="li" html={t('lbDrainItem', O(d.line), fmt(fl(d.sinkEdge)))} />)}
            </ul>
            <p className="hint">{t('lbSmartHint')}</p>
          </div>
        </>
      )}
      {groups.map((v: any) => {
        const gr = v.gr, d = gr.division, k = 'g' + a.view.groups.indexOf(v);
        const tree = describeTree(d.tree);
        return (
          <Fragment key={k}>
            <h3 className="donor-title">{t('lbDonorTitle', O(gr.donor), fmt(gr.donor.rate), gr.p)}</h3>
            {d.direct ? (
              <div className="opt on">
                <ul>
                  <li>{t('lbDirect', tree, d.tree.splitters)}</li>
                  <li>{t('lbPart', fmt(d.part), fmt(gr.maxDeficit)) + ' '}<Ok /></li>
                </ul>
                <Html as="div" style={{ display: 'contents' }} html={treeSvg(d.tree, gr.p, 'none')} />
              </div>
            ) : (
              <div className="bal">
                <div className={'opt' + (gr.mode === 'loop' ? ' on' : '')}>
                  <h4>{t('lbLoopTitle')}</h4>
                  <ul>
                    <li>{t('lbLoopTree', tree, d.loop.recirculate)}</li>
                    <li>{t('lbLoopPieces', d.tree.splitters, d.loop.mergers)}</li>
                    <li>{t('lbLoopPart', fmt(d.loop.part), fmt(gr.maxDeficit)) + ' '}{d.loop.ok ? <Ok /> : <span className="bad">✗</span>}</li>
                    <li>{t('lbTreeIn', fmt(d.loop.beltLoad)) + ' '}{d.loop.beltOk ? <span className="ok">{t('lbFits')}</span> : <span className="bad">{t('lbOver', p.input.belt)}</span>}</li>
                  </ul>
                  <Html as="div" style={{ display: 'contents' }} html={treeSvg(d.tree, gr.p, 'loop')} />
                </div>
                <div className={'opt' + (gr.mode === 'sink' ? ' on' : '')}>
                  <h4>{t('lbSinkTitle', d.n)}</h4>
                  <ul>
                    <li>{t('lbSinkTree', tree, d.tree.splitters)}</li>
                    <li>{t('lbSinkParts', gr.p, d.sink.sinkParts)}</li>
                    <li>{t('lbSinkPart', fmt(d.sink.part), fmt(gr.maxDeficit)) + ' '}{d.sink.ok ? <Ok /> : <span className="bad">{t('lbNotCover')}</span>}</li>
                  </ul>
                  <Html as="div" style={{ display: 'contents' }} html={treeSvg(d.tree, gr.p, 'sink')} />
                </div>
              </div>
            )}
            <OpenRow k={k} onOpen={onOpen} />
          </Fragment>
        );
      })}
    </section>
  );
}

function PiecesTable({ p, a }: { p: Plan; a: Alt }) {
  const conv = p.conv === 'k' ? 'k' : 'k−1';
  const pc = a.pieces;
  const head = <h2 className="section-title">{t('pcTitle')}<Tip k="tipPieces" /></h2>;
  if (p.fluid) {
    return (
      <section className="plate">
        {head}
        <div className="tablewrap"><table><tbody>
          <tr><th>{t('thSection')}</th><th className="l">{t('thLines')}</th><th>{t('thJunctions')}</th></tr>
          <tr><td>{t('rowCollect')}</td><td className="l">{summarizeRates(p.src.lines)}</td><td>{p.collectMergers}</td></tr>
          <tr><td>{t('rowMid')}</td><td className="l">{a.caseLabel}</td><td>{pc.junctions}</td></tr>
          <tr><td>{t('rowDist')}</td><td className="l">{summarizeRates(p.dst.lines)}</td><td>{p.distSplitters}</td></tr>
          <tr className="sum"><td>{t('rowTotal')}</td><td></td><td>{p.collectMergers + pc.junctions + p.distSplitters}</td></tr>
        </tbody></table></div>
        <p className="hint">{t('pcHintPipe', conv)}</p>
      </section>
    );
  }
  return (
    <section className="plate">
      {head}
      <div className="tablewrap"><table><tbody>
        <tr><th>{t('thSection')}</th><th className="l">{t('thLines')}</th><th>{t('thMergers')}</th><th>{t('thSplitters')}</th><th>{t('thSmart')}</th></tr>
        <tr><td>{t('rowCollect')}</td><td className="l">{summarizeRates(p.src.lines)}</td><td>{p.collectMergers}</td><td>0</td><td>0</td></tr>
        <tr><td>{t('rowMid')}</td><td className="l">{a.caseLabel}</td><td>{pc.mergers}</td><td>{pc.splitters}</td><td>{pc.smart}</td></tr>
        <tr><td>{t('rowDist')}</td><td className="l">{summarizeRates(p.dst.lines)}</td><td>0</td><td>{p.distSplitters}</td><td>0</td></tr>
        <tr className="sum"><td>{t('rowTotal')}</td><td></td><td>{p.collectMergers + pc.mergers}</td><td>{p.distSplitters + pc.splitters}</td><td>{pc.smart}</td></tr>
      </tbody></table></div>
      <p className="hint">{t('pcHint', conv, pc.sinkBelts) + (pc.blueprints ? ` ${t('pcBp', pc.blueprints)}` : '')}</p>
    </section>
  );
}
