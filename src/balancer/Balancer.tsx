// A página Balancer: o que uma etapa produz e a próxima consome viram linhas de esteira, e o plano mostra como ligar.
// O estado (model.ts) é o que foi digitado; o plano sai do computePlan (src/logic) a cada mudança.
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { getLang, t, dstTag, fmt } from '../i18n/index.js';
import { computePlan, decodeShare, encodeShare, historyNew, historyPush, historyRedo, historyReplace, historyUndo, issueUrl } from '../logic/index.js';
import { SiteBar, type Nav } from '../shell/SiteBar.tsx';
import { BALANCER_PATH, type Lang } from '../shell/site.ts';
import { TIP, Tip, dropStaleTip, hideTip, tipHandlers } from './help.tsx';
import { Groups, Rules, type GroupInfo } from './Form.tsx';
import { Guide } from './Guide.tsx';
import { Library } from './Library.tsx';
import { Dn, O, Result, tierLabel, type Plan } from './Result.tsx';
import { Workbench, type BenchProps } from './Workbench.tsx';
import { designKey } from './balancerSvg.js';
import { useBps } from './prefs.ts';
import {
  convertInputs, defaults, editGroup, emptyGroup, loadSaved, nextStage, normalize, readInput, save, withMedium,
  type Field, type Inputs, type Saved, type Side,
} from './model.ts';
import './balancer.css';

const SITE = 'https://sf-balancer.vercel.app';
const onVercel = /(^|\.)vercel\.app$/.test(location.hostname);

// Cenários salvos: só neste navegador.
interface Scenario { name: string; state: Saved }
const SCEN_STORE = 'sf-balancer:scenarios';
function loadScens(): Scenario[] {
  try {
    const sc = JSON.parse(localStorage.getItem(SCEN_STORE) || '[]');
    return Array.isArray(sc) ? sc.filter(x => x && typeof x.name === 'string' && x.state && Array.isArray(x.state.src)) : [];
  } catch { return []; }
}
const saveScens = (s: Scenario[]) => { try { localStorage.setItem(SCEN_STORE, JSON.stringify(s)); } catch { /* sem storage */ } };

// Estado salvo em outro idioma tem os números no formato daquele idioma.
const opened = (s: Partial<Saved>, from: string | undefined) => convertInputs(normalize(s), from || 'pt', getLang());

// Ao abrir: o link compartilhado (#s=) ganha do que estava salvo, e depois o endereço volta a ficar limpo; estados
// salvos antes dos idiomas foram digitados em português.
function initial(): { inputs: Inputs; selectedKey: string | null; msg: string } {
  const shared = location.hash.startsWith('#s=') ? decodeShare(location.hash.slice(3)) : null;
  if (shared) {
    history.replaceState(history.state, '', location.pathname + location.search);
    return { inputs: opened(shared, shared.lang), selectedKey: shared.selectedKey, msg: t('sharedLoaded') };
  }
  const saved = loadSaved();
  if (saved) return { inputs: opened(saved, saved.lang), selectedKey: saved.selectedKey ?? null, msg: '' };
  return { inputs: defaults(), selectedKey: null, msg: '' };
}

// O que o desfazer guarda: as entradas e o idioma em que os números estão. A alternativa escolhida fica de fora.
type Snap = Inputs & { lang: string };
const snapOf = (s: Inputs): Snap => ({ ...s, lang: getLang() });

export function Balancer({ nav, active }: { nav: Nav; active: boolean }) {
  const lang = nav.lang;
  const bps = useBps();
  const [start] = useState(initial);
  const [inp, setInp] = useState(start.inputs);
  const [selectedKey, setSelectedKey] = useState(start.selectedKey);
  // O idioma mudou (o shell avisa pelo nav): os números digitados passam para o formato novo antes de desenhar.
  const [inpLang, setInpLang] = useState<string>(lang);
  const H = useRef(historyNew(snapOf(start.inputs)));
  const timer = useRef<number | null>(null);
  if (inpLang !== lang) {
    // A digitação ainda aberta fecha como passo no idioma de antes; o passo atual passa a valer no formato novo.
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
      H.current = historyPush(H.current, { ...inp, lang: inpLang });
    }
    const conv = convertInputs(inp, inpLang, lang);
    setInp(conv);
    setInpLang(lang);
    H.current = historyReplace(H.current, { ...conv, lang });
  }
  const inpRef = useRef(inp);
  inpRef.current = inp;

  // ---- Desfazer e refazer: só as entradas, só nesta sessão ----
  // Digitação seguida vira um passo só: fecha após uma pausa curta ou ao sair do campo; escolha, rádio e botão fecham na hora.
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const commit = (s: Inputs = inpRef.current) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    H.current = historyPush(H.current, snapOf(s));
    bump();
  };
  const soon = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(), 500);
    bump();
  };
  const settle = () => { if (timer.current !== null) commit(); };
  const set = (next: Inputs, step: 'now' | 'soon') => {
    inpRef.current = next;
    setInp(next);
    if (step === 'now') commit(next); else soon();
  };
  const histStep = (dir: number) => {
    if (timer.current !== null) commit();
    const next = dir < 0 ? historyUndo(H.current) : historyRedo(H.current);
    if (next === H.current) return;
    H.current = next;
    let s: Inputs = next.present;
    if (next.present.lang !== getLang()) {
      s = convertInputs(next.present, next.present.lang, getLang());
      H.current = historyReplace(H.current, snapOf(s));
    }
    inpRef.current = s;
    setInp(s);
    bump();
  };
  const pending = timer.current !== null;
  const canUndo = H.current.past.length > 0 || pending;
  // Digitação ainda sem passo fechado já pode ser desfeita; refazer some porque o passo novo vai descartar.
  const canRedo = H.current.future.length > 0 && !pending;

  // Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Y e Ctrl/Cmd+Shift+Z refazem, no lugar do desfazer nativo dos campos. Campos de texto
  // fora do planejador (biblioteca, diálogo) mantêm o desfazer nativo. Escondida, a página não age (é a vez da Fábrica).
  const keys = useRef({ active, histStep });
  keys.current = { active, histStep };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!keys.current.active || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const undo = k === 'z' && !e.shiftKey, redo = k === 'y' || (k === 'z' && e.shiftKey);
      if (!undo && !redo) return;
      if (document.querySelector('dialog[open]')) return;
      const el = e.target as HTMLElement;
      const typing = el.closest?.('input:not([type=radio]):not([type=checkbox]), textarea, [contenteditable=""], [contenteditable=true]');
      if (typing && !el.closest('#form') && el.id !== 'item') return;
      e.preventDefault();
      keys.current.histStep(undo ? -1 : 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // O balão da ajuda: some ao rolar ou redimensionar e quando a página sai da tela.
  useEffect(() => {
    if (!active) { if (TIP.btn && root.current?.contains(TIP.btn)) hideTip(); return; }
    const hide = () => { if (TIP.btn) hideTip(); };
    addEventListener('scroll', hide, { passive: true, capture: true });
    addEventListener('resize', hide);
    return () => { removeEventListener('scroll', hide, { capture: true }); removeEventListener('resize', hide); };
  }, [active]);
  useEffect(dropStaleTip);
  const root = useRef<HTMLDivElement>(null);

  // ---- O plano ----
  const read = useMemo(() => readInput(inp, bps), [inp, bps, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  const p: Plan | null = useMemo(() => (read.valid ? computePlan(read.input) : null), [read]);
  // Com algum campo inválido as equivalências ficam as da última conta boa.
  const lastGood = useRef<Plan | null>(null);
  if (p) lastGood.current = p;
  const eqOf = (side: Side): GroupInfo | null => {
    const q = lastGood.current;
    return q ? { side, groups: q[side].groups, cap: q.cap, fluid: q.fluid } : null;
  };
  const alts = p?.alternatives ?? [];
  const alt = alts.find((a: { key: string }) => a.key === selectedKey) || alts[0];

  const saved = (): Saved => ({ ...inp, selectedKey, lang: getLang() });
  useEffect(() => { save(saved()); });   // eslint-disable-line react-hooks/exhaustive-deps
  const shareLink = () => `${onVercel ? SITE + BALANCER_PATH[getLang() as Lang] : location.href.split('#')[0]}#s=${encodeShare(saved())}`;
  const report = !p || !alt
    ? issueUrl(t('issueTitle', read.input.item), shareLink())
    : issueUrl(t('issueTitle', read.input.item), t('issueBody', {
      link: shareLink(), item: read.input.item, medium: `${t(p.fluid ? 'tbPipe' : 'tbBelt')}: ${tierLabel(read.input, p.cap)}`,
      supply: fmt(p.supply), demand: fmt(p.demand), plan: alt.title, caseLabel: alt.caseLabel,
    }));

  // ---- Cenários e link ----
  const [scens, setScens] = useState(loadScens);
  const [scenSel, setScenSel] = useState('');
  const [msg, setMsg] = useState<ReactNode>(start.msg);
  const msgTimer = useRef<number | null>(null);
  const flash = (m: ReactNode, keep = false) => {
    if (msgTimer.current !== null) clearTimeout(msgTimer.current);
    setMsg(m);
    if (!keep) msgTimer.current = window.setTimeout(() => setMsg(''), 5000);
  };
  useEffect(() => { if (start.msg) flash(start.msg); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const openScen = (v: string) => {
    setScenSel(v);
    const sc = scens[+v];
    if (v === '' || !sc) return;
    const s = opened(sc.state, sc.state.lang);
    setSelectedKey(sc.state.selectedKey || null);
    set(s, 'now');
  };
  const saveScen = () => {
    const name = inp.item.trim() || t('fallbackItem');
    const next = [...scens];
    let i = next.findIndex(x => x.name === name);
    if (i < 0) { next.push({ name, state: saved() }); i = next.length - 1; } else next[i] = { name, state: saved() };
    setScens(next); saveScens(next); setScenSel(String(i));
    flash(t('scenSaved', name));
  };
  const delScen = () => {
    const i = +scenSel;
    if (scenSel === '' || !scens[i]) return;
    const gone = scens[i];
    const next = scens.filter((_, j) => j !== i);
    setScens(next); saveScens(next); setScenSel('');
    flash(t('scenDeleted', gone.name));
  };
  const copyLink = async () => {
    const link = shareLink();
    try {
      await navigator.clipboard.writeText(link);
      flash(t('shareCopied'));
    } catch {
      flash(<>{t('shareFail')} <a href={link}>{link}</a></>, true);
    }
  };

  // ---- Edição ----
  const focusNext = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });
  const editField = (side: Side, i: number, k: Field, v: string) =>
    set({ ...inp, [side]: inp[side].map((g, j) => (j === i ? editGroup(g, k, v) : g)) }, 'soon');
  const addGroup = (side: Side) => {
    focusNext.current = `bal-${side}-${inp[side].length}-count`;
    set({ ...inp, [side]: [...inp[side], emptyGroup()] }, 'now');
  };
  const removeGroup = (side: Side, i: number) => set({ ...inp, [side]: inp[side].filter((_, j) => j !== i) }, 'now');
  const toNextStage = () => {
    focusNext.current = 'bal-src-0-nominal';
    setSelectedKey(null);
    set(nextStage(inp), 'now');
  };
  const reset = () => { setSelectedKey(null); set(defaults(), 'now'); };

  // ---- A montagem do balancer do plano, num diálogo ----
  const [bench, setBench] = useState<{ title: string; props: BenchProps } | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const openBench = (key: string) => {
    if (!p || !alt) return;
    const base = { cap: p.cap, belt: p.input.belt, blueprints: bps };
    if (key === 'plan' && alt.view.bal) {
      const d = alt.view.bal.design;
      setBench({
        title: t('lbBalTitle', d.N, d.M),
        props: { ...base, N: d.N, M: d.M, rates: d.rates, labels: { ins: alt.bal.inputs.map(O), outs: alt.feeds.map((f: { dst: { id: number } }) => Dn(f.dst)) }, inUse: designKey(d), view: designKey(d), style: d.kind.startsWith('butterfly') ? 'butterfly' : 'normal' },
      });
    } else if (key[0] === 'g') {
      const gr = alt.view.groups[+key.slice(1)].gr;
      const kind = ({ direct: 'matrix', loop: 'matrix-loop', sink: 'matrix-sink' } as Record<string, string>)[gr.mode];
      setBench({
        title: t('lbBalTitle', 1, gr.p),
        props: { ...base, blueprints: [], N: 1, M: gr.p, rates: [gr.donor.rate], labels: { ins: [O(gr.donor)], outs: gr.members.map(dstTag) }, inUse: kind, view: kind },
      });
    }
  };
  // O resultado só redesenha quando o plano muda (o desfazer e a digitação também redesenham a página).
  const openRef = useRef(openBench);
  openRef.current = openBench;
  const onOpen = useCallback((k: string) => openRef.current(k), []);
  useLayoutEffect(() => {
    const d = dlg.current;
    if (!bench || !d) return;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>('.ponder')?.focus();
  }, [bench]);

  const surplus = p ? p.supply - p.demand : 0;
  return (
    <div className="bal-page" ref={root} {...tipHandlers}>
      <SiteBar nav={nav}><div className="pl-grow" /></SiteBar>
      <div className="wrap">
        <header className="top">
          <div>
            <h1 className="kicker">{t('kicker')}</h1>
            <input className="item-name" id="item" value={inp.item} aria-label={t('itemAria')} spellCheck={false}
              onChange={e => set({ ...inp, item: e.target.value }, 'soon')} onBlur={settle} />
          </div>
          <dl className="ledger num" id="ledger">
            {p && (
              <>
                <div><dt>{t('supply')}<Tip k="tipLedger" /></dt><dd>{fmt(p.supply)}<small>/min</small></dd></div>
                <div><dt>{t('demand')}</dt><dd>{fmt(p.demand)}<small>/min</small></dd></div>
                <div><dt>{surplus >= 0 ? t('surplus') : t('shortfall')}</dt><dd className={surplus < 0 ? 'neg' : ''}>{fmt(Math.abs(surplus))}<small>/min</small></dd></div>
              </>
            )}
          </dl>
        </header>
        <p className="intro">
          <span>{t('intro')}</span>{' '}
          <span className="links"><a href="#how">{t('howLink')}</a><a href="#library">{t('libLink')}</a></span>
        </p>

        <div className="scenbar" role="group" aria-label={t('scenAria')}>
          <span className="scen-title"><span>{t('scenTitle')}</span><Tip k="tipScen" /></span>
          <select className="field" id="scenList" aria-label={t('scenAria')} value={scens[+scenSel] ? scenSel : ''} onChange={e => openScen(e.target.value)}>
            <option value="">{t('scenPick')}</option>
            {scens.map((x, i) => <option key={i} value={i}>{x.name}</option>)}
          </select>
          <button type="button" className="pbtn" id="scenSave" onClick={saveScen}>{t('scenSave')}</button>
          <button type="button" className="pbtn" id="scenDel" disabled={!scens[+scenSel] || scenSel === ''} onClick={delScen}>{t('scenDel')}</button>
          <button type="button" className="pbtn prim" id="shareCopy" onClick={copyLink}>{t('shareCopy')}</button>
          <span className="hist" role="group" aria-label={t('histAria')}>
            <button type="button" className="pbtn" id="undo" aria-label={t('undo')} title={t('undo')} disabled={!canUndo} onClick={() => histStep(-1)}>↶</button>
            <button type="button" className="pbtn" id="redo" aria-label={t('redo')} title={t('redo')} disabled={!canRedo} onClick={() => histStep(1)}>↷</button>
            <Tip k="tipHist" />
          </span>
          <span className="scen-msg" id="scenMsg" role="status" aria-live="polite">{msg}</span>
        </div>
        <div id="form" onBlur={settle}>
          <div className="band">
            <section className="plate">
              <h2><span>{t('sideSrc')}</span><Tip k="tipSrc" /></h2>
              <Groups side="src" groups={inp.src} info={eqOf('src')} bad={read.bad} onEdit={(i, k, v) => editField('src', i, k, v)} onRemove={i => removeGroup('src', i)} />
              <button className="linkbtn" data-add="src" type="button" onClick={() => addGroup('src')}>{t('addGroup')}</button>
            </section>
            <div className="arrow" aria-hidden="true" />
            <section className="plate">
              <h2><span>{t('sideDst')}</span><Tip k="tipDst" /></h2>
              <Groups side="dst" groups={inp.dst} info={eqOf('dst')} bad={read.bad} onEdit={(i, k, v) => editField('dst', i, k, v)} onRemove={i => removeGroup('dst', i)} />
              <div className="dst-actions">
                <button className="linkbtn" data-add="dst" type="button" onClick={() => addGroup('dst')}>{t('addGroup')}</button>
                <span><button className="linkbtn" id="dstToSrc" type="button" onClick={toNextStage}>{t('dstToSrc')}</button><Tip k="tipDstToSrc" /></span>
              </div>
            </section>
          </div>
          <Rules s={inp} onMedium={m => set(withMedium(inp, m), 'now')} onPick={patch => set({ ...inp, ...patch }, 'now')} />
        </div>
        <div className="warns" id="warns">
          {p?.warnings.map((w: { level: string; text: string }, i: number) => <div key={i} className={'warn' + (w.level === 'bad' ? ' bad' : '')}>{w.text}</div>)}
        </div>

        <div id="out">
          {!p ? <p className="lead" style={{ marginTop: 24 }}>{t('invalid')}</p>
            : !alt ? <p className="lead" style={{ marginTop: 24 }}>{t('noLines')}</p>
            : <Result p={p} alt={alt} item={read.input.item} blueprints={bps} onSelect={setSelectedKey} onOpen={onOpen} />}
        </div>

        <div className="foot hint">
          <button className="linkbtn" id="reset" type="button" onClick={reset}>{t('reset')}</button>{' '}
          <a className="linkbtn report" id="report" href={report} target="_blank" rel="noopener">{t('report')}</a>
        </div>

        <Library lang={lang} />
        <Guide lang={lang} />
      </div>
      <dialog className="dlg" id="balDlg" aria-labelledby="dlgTitle" ref={dlg}
        onClose={() => { setBench(null); hideTip(); }}
        onClick={e => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <div className="dlg-head">
          <h2 id="dlgTitle">{bench?.title}</h2>
          <button type="button" className="pbtn" id="dlgClose" onClick={() => dlg.current?.close()}>{t('dlgClose')}</button>
        </div>
        <div className="dlg-body" id="dlgBody">{bench && <Workbench {...bench.props} />}</div>
      </dialog>
    </div>
  );
}

