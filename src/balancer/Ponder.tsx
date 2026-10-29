// Passo a passo de um balancer (como o Ponder do Create): a peça nova aparece como holograma, as anteriores ficam
// sólidas. mode: '2d' (o desenho em SVG) ou a montagem 3D ('towers' | 'floors'). Quem usa remonta (key) quando a
// montagem ou o jeito de mostrar muda: o passo volta para o fim, com tudo montado.
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { getLang, t, fmt } from '../i18n/index.js';
import { layout3d, focus3d, byPiece3d, planFootprint, designerSize, placeMark, defaultMarks, addMark, panView, zoomView, tapGesture, designPieces } from '../logic/index.js';
import { MARK_TAB, PIECE_ICON, PLAN_PX, balancerBuild, cap1, designKey, flatSvg, inColor, pieceIcon, planMarksSvg, stepTexts } from './balancerSvg.js';
import { Tip } from './help.tsx';
import { mount3d } from '../view3d/scene.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- as montagens e os desenhos vêm de src/logic (JS, coberto pelos testes) */
export type Design = any;
export interface Labels { ins: string[]; outs: string[] }
export interface Mark { id: number; mk: number; x: number; z: number }
// Marcações do Blueprint Designer na planta: valem para uma montagem (key); quem guarda é quem chama.
export interface Marks { key: string; list: Mark[] | null; move: boolean }

const FLAT_CACHE = new Map<string, any>();
export const flatLayout = (d: Design) => {
  const k = `${designKey(d)}|${d.N}|${d.M}`;
  if (!FLAT_CACHE.has(k)) FLAT_CACHE.set(k, layout3d(d, 'flat'));
  return FLAT_CACHE.get(k);
};

// Botões de uma escolha só (role=radio). attr: o data-* de cada botão (as capturas clicam por ele).
export function Seg<T extends string>({ label, attr, options, value, text, onPick, best, bestTitle }: {
  label: string; attr: string; options: readonly T[]; value: string; text: (v: T) => string; onPick?: (v: T) => void;
  best?: string | null; bestTitle?: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(v => (
        <button key={v} type="button" role="radio" aria-checked={v === value} {...{ [`data-${attr}`]: v }}
          {...(v === best ? { 'data-best': '', title: bestTitle } : {})}
          onClick={() => { if (v !== value) onPick?.(v); }}>{text(v)}</button>
      ))}
    </div>
  );
}

interface Props {
  d: Design; labels: Labels; mode: string; lay?: any; per?: string; view2d?: string; marks?: Marks;
  onView2d?: (v: string) => void; onMode?: (m: string) => void; onPer?: (v: string) => void;
  notice?: string;   // aviso no alto do desenho (sem 3D neste navegador)
}

export function Ponder({ d, labels, mode, lay, per: perIn, view2d, marks, onView2d, onMode, onPer, notice }: Props) {
  const in3d = mode !== '2d';
  // No 2D, o desenho vem da montagem 'flat' (vista de cima): compacto no esquema, em escala na planta. O blueprint seu
  // é uma caixa só.
  const flat2d = !in3d && d.kind !== 'blueprint', plan = flat2d && view2d === 'plan', view = in3d ? mode : 'flat';
  // Por peça: um passo por splitter ou merger (byPiece3d); por nível: um por torre, andar ou coluna.
  const per = perIn === 'piece' ? 'piece' : 'level';
  const lang = getLang();
  const B = useMemo(() => {
    const lay0 = in3d || flat2d ? lay || (flat2d ? flatLayout(d) : layout3d(d, mode)) : null;
    const L = lay0 && per === 'piece' ? byPiece3d(lay0) : lay0;
    if (!L) return { lay0, L, ...balancerBuild(d, labels), kinds: [] as any[] };
    const { steps, kinds } = stepTexts(d, L, labels, view);
    return { lay0, L, svg: flat2d ? flatSvg(d, L, labels, per, plan) : '', kinds, steps: steps as string[] };
  }, [d, labels, lay, mode, in3d, flat2d, plan, per, view, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  const K = B.steps.length;
  const [cur, setCur] = useState(K);
  const [playing, setPlaying] = useState(false);
  const done = cur >= K;
  const go = (k: number) => setCur(Math.max(0, Math.min(K, k)));
  const stepTo = (k: number) => { setPlaying(false); go(k); };

  const stage = useRef<HTMLDivElement>(null);
  const svgOf = () => stage.current?.querySelector<SVGSVGElement>('.bsvg') ?? null;
  const scene = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [follow, setFollow] = useState<number | null>(null);

  // Tocando: um passo a cada 2,6 s até o fim.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setCur(c => Math.min(K, c + 1)), 2600);
    return () => clearInterval(id);
  }, [playing, K]);
  useEffect(() => { if (done && playing) setPlaying(false); }, [done, playing]);
  // O passo atual no desenho: as peças de depois somem, a do passo é holograma, as de antes ficam sólidas.
  useLayoutEffect(() => {
    scene.current?.setStep(cur, K);
    const st = svgOf();
    if (!st) return;
    st.classList.toggle('stepping', cur < K);
    st.querySelectorAll<SVGElement>('[data-s]').forEach(el => {
      const s = +el.dataset.s!;
      el.classList.toggle('fut', cur < K && s > cur);
      el.classList.toggle('now', cur < K && s === cur);
      el.classList.toggle('past', cur < K && s < cur);
    });
  }, [cur, K, B.svg]);

  // Planta: as marcações do Blueprint Designer (ms, de quem chama) e o zoom/arrastar da vista.
  const ms = plan ? marks ?? { key: '', list: null, move: false } : null;
  const fp = useMemo(() => (plan ? planFootprint(B.lay0) : null), [plan, B.lay0]);
  if (ms && !ms.list) ms.list = defaultMarks(fp);
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const api = useRef<{ reframe: () => void; fit: () => void; zoom: (k: number) => void; center: () => [number, number] } | null>(null);
  const setMarks = (list: Mark[], keep = false) => {
    ms!.list = list;
    if (!list.length) ms!.move = false;
    redraw();
    if (!keep) requestAnimationFrame(() => api.current?.reframe());
  };
  // As marcações no desenho (o piso embaixo das esteiras, a borda e o rótulo por cima).
  useLayoutEffect(() => {
    const st = svgOf();
    if (!ms || !st) return;
    const { floor, top } = planMarksSvg(ms.list, +st.dataset.ox! || 0, +st.dataset.oz! || 0);
    st.querySelector('.bpfloor')!.innerHTML = floor;
    st.querySelector('.bpmarks')!.innerHTML = top;
    st.classList.toggle('movemode', !!ms.move);
  });

  useLayoutEffect(() => {
    if (!flat2d) return;
    const st = svgOf(), box = stage.current;
    if (!st || !box) return;
    let lit: number | null = null;
    const light = (id: number | null) => {
      const f = id === null ? null : focus3d(B.lay0, id);
      st.classList.toggle('focusing', !!f);
      st.querySelectorAll<SVGElement>('[data-id]').forEach(el => el.classList.toggle('lit', !!f && f.pieces.has(+el.dataset.id!)));
      st.querySelectorAll<SVGElement>('[data-b]').forEach(el => el.classList.toggle('lit', !!f && f.belts.has(+el.dataset.b!)));
      lit = id;
    };
    // Planta: passar o mouse ou tocar numa peça, entrada ou saída deixa aceso só o caminho dela (como no 3D).
    let pinned: number | null = null;
    const drag = new Map<number, [number, number]>(), tap = tapGesture();
    // Zoom e arrastar: mexe só no viewBox (abre mostrando tudo). Roda ou pinça no ponto, botões no centro; arrastar
    // move quando há zoom. Toque parado (tapGesture) fixa ou solta o caminho aceso. "Ver tudo": o desenho inteiro no
    // meio da área livre (abaixo dos botões, acima da dica), com a proporção da área; zoom e arrastar ficam dentro
    // desse quadro. A altura da área acompanha o desenho, até 68% da tela.
    const W0 = st.viewBox.baseVal.width, H0 = st.viewBox.baseVal.height;
    let full = { x: 0, y: 0, w: W0, h: H0 }, vb = { ...full }, pinch: number | null = null, fitW = -1;
    const apply = () => { st.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); st.classList.toggle('zoomed', vb.w < full.w - 1e-6); };
    const ox = +st.dataset.ox! || 0, oz = +st.dataset.oz! || 0;
    // O que "Ver tudo" enquadra: o desenho e as marcações (com a aba do rótulo).
    const content = () => {
      let x0 = 0, y0 = 0, x1 = W0, y1 = H0;
      for (const m of ms?.list ?? []) {
        const s = designerSize(m.mk) * PLAN_PX, x = ox + m.x * PLAN_PX, y = oz + m.z * PLAN_PX;
        x0 = Math.min(x0, x - 8); y0 = Math.min(y0, y - MARK_TAB - 8); x1 = Math.max(x1, x + s + 8); y1 = Math.max(y1, y + s + 8);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const frame = (resize: boolean) => {
      const cw = box.clientWidth;
      if (!cw) return false;
      const b = content(), top = box.querySelector<HTMLElement>('.pmode')!.offsetHeight + 16, bot = box.querySelector<HTMLElement>('.hint2d')!.offsetHeight + 16;
      if (resize) box.style.height = `${Math.round(Math.max(340, Math.min(innerHeight * 0.68, cw * b.h / b.w + top + bot)))}px`;
      const ch = box.clientHeight, s = Math.max(b.w / cw, b.h / Math.max(80, ch - top - bot));
      full = { x: b.x + (b.w - cw * s) / 2, y: b.y - top * s - ((ch - top - bot) * s - b.h) / 2, w: cw * s, h: ch * s };
      return true;
    };
    const fit = () => {
      if (!frame(true)) return;
      fitW = box.clientWidth;
      vb = { ...full };
      apply();
    };
    // Depois de pôr, mover ou tirar marcação: o quadro de "Ver tudo" acompanha, sem mexer no zoom atual.
    const reframe = () => { if (frame(false)) { vb = zoomView(vb, full, 1, vb.x + vb.w / 2, vb.y + vb.h / 2); apply(); } };
    fit();
    // Só refaz quando a largura muda (a altura quem muda é o próprio fit).
    const ro = new ResizeObserver(() => requestAnimationFrame(() => { if (box.isConnected && box.clientWidth !== fitW) fit(); }));
    ro.observe(box);
    const toSvg = (x: number, y: number): [number, number] => {
      const m = st.getScreenCTM();
      if (!m) return [vb.x + vb.w / 2, vb.y + vb.h / 2];
      const pt = new DOMPoint(x, y).matrixTransform(m.inverse());
      return [pt.x, pt.y];
    };
    const zoom = (k: number, at?: [number, number]) => { vb = zoomView(vb, full, k, ...(at || [vb.x + vb.w / 2, vb.y + vb.h / 2])); apply(); };
    const toWorld = (x: number, y: number): [number, number] => { const [a, b] = toSvg(x, y); return [(a - ox) / PLAN_PX, (b - oz) / PLAN_PX]; };
    api.current = {
      reframe, fit, zoom,
      // O meio do que está na tela, em metros (onde nasce a marcação nova).
      center: () => { const r = st.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); },
    };
    // Ctrl (ou Cmd) + arrastar sobre uma marcação move só ela, presa na grade; no toque, o botão Mover marcação faz o
    // arrastar de um dedo pegar a marcação. Fora de uma marcação, arrastar continua movendo a vista.
    const hitMark = ([x, z]: [number, number]) => [...(ms?.list ?? [])].reverse().find(m => {
      const s = designerSize(m.mk);
      return x >= m.x && x <= m.x + s && z >= m.z - MARK_TAB / PLAN_PX && z <= m.z + s;
    });
    const wantsMark = (e: MouseEvent) => !!ms && (e.ctrlKey || e.metaKey || !!ms.move);
    let markDrag: { pid: number; id: number; at: [number, number]; x: number; z: number } | null = null;
    const on = <K extends keyof SVGElementEventMap>(type: K, f: (e: SVGElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      st.addEventListener(type, f as EventListener, o);
      return () => st.removeEventListener(type, f as EventListener, o);
    };
    const offs = [
      on('pointerover', e => { if (pinned === null && !drag.size) { const el = (e.target as Element).closest<SVGElement>('[data-id]'); const id = el ? +el.dataset.id! : null; if (id !== lit) light(id); } }),
      on('pointerleave', () => { if (pinned === null) light(null); }),
      on('click', e => { const rm = (e.target as Element).closest<SVGElement>('[data-rm]'); if (rm && ms) setMarks(ms.list!.filter(m => m.id !== +rm.dataset.rm!)); }),
      // Roda sozinha rola a página; zoom com Ctrl + roda ou pinça (no touchpad ela chega como Ctrl + roda).
      on('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015), toSvg(e.clientX, e.clientY)); }, { passive: false }),
      on('pointerdown', e => {
        if (markDrag || (e.target as Element).closest('[data-rm]')) return;
        const m = wantsMark(e) && !drag.size ? hitMark(toWorld(e.clientX, e.clientY)) : null;
        st.setPointerCapture(e.pointerId);
        if (m) {
          e.preventDefault();
          markDrag = { pid: e.pointerId, id: m.id, at: toWorld(e.clientX, e.clientY), x: m.x, z: m.z };
          st.classList.add('moving');
          return;
        }
        drag.set(e.pointerId, [e.clientX, e.clientY]); tap.down(e.pointerId, e.clientX, e.clientY); pinch = null;
      }),
      // No Mac, Ctrl + clique abre o menu de contexto: sobre uma marcação, não.
      on('contextmenu', e => { if (markDrag || (wantsMark(e) && hitMark(toWorld(e.clientX, e.clientY)))) e.preventDefault(); }),
      on('pointermove', e => {
        if (markDrag) {
          if (e.pointerId !== markDrag.pid) return;
          const [x, z] = toWorld(e.clientX, e.clientY), m = ms!.list!.find(o => o.id === markDrag!.id)!;
          const p = placeMark(fp, m.mk, markDrag.x + x - markDrag.at[0], markDrag.z + z - markDrag.at[1], 1);
          if (p.x !== m.x || p.z !== m.z) setMarks(ms!.list!.map(o => (o.id === m.id ? { ...o, x: p.x, z: p.z } : o)), true);
          return;
        }
        if (ms && !drag.size) st.classList.toggle('markhover', wantsMark(e) && !!hitMark(toWorld(e.clientX, e.clientY)));
        const prev = drag.get(e.pointerId);
        if (!prev) return;
        drag.set(e.pointerId, [e.clientX, e.clientY]);
        if (drag.size === 1) {
          const [x0, y0] = toSvg(...prev), [x1, y1] = toSvg(e.clientX, e.clientY);
          vb = panView(vb, full, x0 - x1, y0 - y1);
          apply();
        } else if (drag.size === 2) {
          const [a, b] = [...drag.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch) zoom(dist / pinch, toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
          pinch = dist;
        }
      }),
      on('pointerup', e => {
        if (markDrag && e.pointerId === markDrag.pid) { markDrag = null; st.classList.remove('moving'); reframe(); return; }
        if (!drag.delete(e.pointerId)) return;
        pinch = null;
        if (!tap.up(e.pointerId, e.clientX, e.clientY)) return;
        // Com o ponteiro capturado o alvo é o próprio svg: a peça tocada vem da posição.
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGElement>('[data-id]'), id = el && st.contains(el) ? +el.dataset.id! : null;
        pinned = id === pinned ? null : id;
        light(pinned);
      }),
      on('pointercancel', e => {
        if (markDrag && e.pointerId === markDrag.pid) { markDrag = null; st.classList.remove('moving'); reframe(); }
        drag.delete(e.pointerId); tap.cancel(e.pointerId); pinch = null;
      }),
    ];
    return () => { ro.disconnect(); offs.forEach(f => f()); api.current = null; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- quem chama remonta quando o desenho muda

  // 3D: a cena (three.js) carrega à parte; sem WebGL, o passo a passo volta para o desenho 2D com um aviso.
  useEffect(() => {
    if (!in3d) return;
    let gone = false;
    mount3d(stage.current, d, labels, B.L, { onFocus: setFollow }).then((sc: any) => {
      if (gone) { sc?.dispose(); return; }
      if (!sc) { setFallback(true); return; }
      scene.current = sc;
      setLoaded(true);
      sc.setStep(curRef.current, K);
    });
    return () => { gone = true; scene.current?.dispose(); scene.current = null; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const curRef = useRef(cur);
  curRef.current = cur;

  if (fallback) return <Ponder d={d} labels={labels} mode="2d" notice={t('no3d')} />;

  const keys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); stepTo(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepTo(cur - 1); }
  };
  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (done) setCur(0);
    setPlaying(true);
  };
  const perSeg = <Seg label={t(in3d ? 'per3dLabel' : 'perLabel')} attr="per" options={['level', 'piece'] as const} value={per} text={v => t('per3d' + cap1(v))} onPick={onPer} />;
  // No 2D o mesmo Por nível / Por peça fica acima do desenho (o blueprint é uma peça só).
  const ctl2d = !in3d && d.kind !== 'blueprint' && (
    <div className="pmode">
      <span>{t('view2dLabel')}</span>
      <Seg label={t('view2dLabel')} attr="v2d" options={['scheme', 'plan'] as const} value={plan ? 'plan' : 'scheme'} text={v => t('view2d' + cap1(v))} onPick={onView2d} />
      <Tip k="tipView2d" />
      <span>{t('perLabel')}</span>
      {perSeg}
      <Tip k="tipPer2d" />
    </div>
  );
  const matrix = !d.kind.startsWith('funnel');
  const legend = [
    matrix ? labels.ins.map((tag, i) => `<span><i style="background:${inColor(i)}"></i>${esc(tag)}</span>`).join('') : '',
    in3d || d.kind === 'blueprint' ? '' : [
      d.pieces.splitters ? `<span>${PIECE_ICON.splitter(d.net ? d.net.rounds[0].f : d.tree.factors[0])}${t('lgSplitWays')}</span>` : '',
      d.pieces.mergers ? `<span>${PIECE_ICON.merger}${t('lgMergerJoin')}</span>` : '',
      `<span>${PIECE_ICON.mixed}${t('lgMixed')}</span>`,
      plan ? `<span>${PIECE_ICON.grid}${t('lgGrid')}</span><span>${PIECE_ICON.designer}${t('lgDesigner')}</span>` : '',
      per === 'piece' ? `<span>${PIECE_ICON.num}${t('lgPieceNum')}</span>` : '',
    ].join(''),
    `<span><i class="holo"></i>${t('lgHolo')}</span>`,
    in3d ? `<span><i class="sp3"></i>${t('lgSplitter')}</span><span><i class="mg3"></i>${t('lgMerger')}</span><span><i class="pouti"></i>${t('lgPortOut')}</span><span><i class="pini"></i>${t('lgPortIn')}</span>` : '',
    d.extra && d.kind.endsWith('-loop') ? `<span><i class="loopi"></i>${t('lgLoopBack')}</span>` : '',
    d.extra && d.kind.endsWith('-sink') ? `<span><i style="background:var(--sink)"></i>${t('lgToSink')}</span>` : '',
  ].join('');
  const follows: [number, string, string][] = in3d ? [
    ...B.L.pieces.filter((p: any) => p.t === 'in').map((p: any, i: number) => [p.id, labels.ins[i], inColor(p.inp ?? i)]),
    ...B.L.pieces.filter((p: any) => p.t === 'out').map((p: any, i: number) => [p.id, labels.outs[i], inColor(i)]),
  ] : [];

  return (
    <div className="ponder" tabIndex={-1} onKeyDown={keys}>
      {!flat2d && ctl2d}
      <div ref={stage} className={'stage' + (in3d ? ' stage3d' : flat2d ? ' stage2d' : '')}>
        {notice && <p className="hint">{notice}</p>}
        {in3d ? (
          <>
            <div className="s3d-ctl">
              <Seg label={t('mode3dLabel')} attr="mode" options={['towers', 'floors'] as const} value={mode} text={m => t('mode3d' + cap1(m))} onPick={onMode} />
              <Tip k="tip3dMode" />
              {perSeg}
              <Tip k="tip3dPer" />
              <button type="button" className="pbtn" onClick={() => scene.current?.recenter()}>{t('recenter3d')}</button>
            </div>
            {!loaded && <p className="load3d">{t('loading3d')}</p>}
            <span className="hint3d">{t('hint3dFocus')}</span>
          </>
        ) : <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: B.svg }} />}
        {flat2d && (
          <>
            {ctl2d}
            <div className="zctl">
              <button type="button" className="pbtn" aria-label={t('zoomIn')} onClick={() => api.current?.zoom(1.5)}>+</button>
              <button type="button" className="pbtn" aria-label={t('zoomOut')} onClick={() => api.current?.zoom(1 / 1.5)}>−</button>
              <button type="button" className="pbtn" onClick={() => api.current?.fit()}>{t('zoomFit')}</button>
            </div>
            <span className="hint3d hint2d">{t('hint2dZoom') + (plan ? ` ${t('hint2dMarks')}` : '')}</span>
          </>
        )}
      </div>
      {ms && (
        <div className="bpbar" role="group" aria-label={t('bpMarksAria')}>
          <span className="bpbar-t">Blueprint Designer</span>
          <Tip k="tipBpMarks" />
          {[1, 2, 3].map(mk => (
            <button key={mk} type="button" className="pbtn" aria-label={t('bpMarkAddAria', mk, designerSize(mk) / 8)}
              onClick={() => setMarks(addMark(fp, ms.list, mk, api.current?.center() ?? [0, 0]))}>{t('bpMarkAdd', mk)}</button>
          ))}
          <button type="button" className="pbtn" aria-pressed={!!ms.move} disabled={!ms.list!.length}
            onClick={() => { ms.move = !ms.move; redraw(); }}>{t('bpMove')}</button>
          <span className="bplist">
            {ms.list!.length ? ms.list!.map(m => {
              const name = t('bpMarkName', m.id, m.mk, designerSize(m.mk) / 8);
              return (
                <span key={m.id} className="bpchip">{name}<button type="button" aria-label={t('bpMarkRemove', name)}
                  onClick={e => {
                    const i = ms.list!.indexOf(m), bar = (e.currentTarget as HTMLElement).closest('.bpbar')!;
                    setMarks(ms.list!.filter(o => o.id !== m.id));
                    // Pelo teclado, o foco vai para o próximo × (ou para o primeiro botão de pôr).
                    if (e.detail === 0) requestAnimationFrame(() => (bar.querySelectorAll<HTMLElement>('.bpchip button')[Math.min(i, ms.list!.length - 1)] ?? bar.querySelector<HTMLElement>('.pbtn'))?.focus());
                  }}>×</button></span>
              );
            }) : <span className="bpnone">{t('bpMarksNone')}</span>}
          </span>
        </div>
      )}
      <div className={'cap' + (done ? ' done' : '')} aria-live="polite">
        <span className="cap-n">{done ? '✓' : t('stepOf', cur + 1, K)}</span>
        <span className="cap-i" dangerouslySetInnerHTML={{ __html: !done && B.kinds[cur] ? pieceIcon(B.kinds[cur]) : '' }} />
        <p className="cap-t">{done ? t('stepDone', designPieces(d), d.M, fmt(d.perOut)) : B.steps[cur]}</p>
      </div>
      <div className="pctl">
        <button type="button" className="pbtn" aria-label={t('stepPrev')} disabled={cur === 0} onClick={() => stepTo(cur - 1)}>‹</button>
        <div className={'ticks' + (K > 24 ? ' many' : '')}>
          {B.steps.map((_, i) => (
            <button key={i} type="button" className={'tick' + (done || i < cur ? ' done' : '') + (!done && i === cur ? ' cur' : '')}
              aria-label={t('stepGoto', i + 1)} aria-current={!done && i === cur ? 'step' : 'false'} onClick={() => stepTo(i)} />
          ))}
        </div>
        <button type="button" className="pbtn" aria-label={t('stepNext')} disabled={done} onClick={() => stepTo(cur + 1)}>›</button>
        <button type="button" className="pbtn" onClick={play}>{playing ? t('stepPause') : t('stepPlay')}</button>
        <button type="button" className="pbtn prim" onClick={() => stepTo(done ? 0 : K)}>{done ? t('stepStart') : t('stepAll')}</button>
        <span className="pkeys">{t('ponderKeys')}</span>
      </div>
      {in3d && (
        <div className="follow">
          <span>{t('follow3d')}</span>
          {follows.map(([id, tag, c]) => (
            <button key={id} type="button" className="chip" aria-pressed={follow === id} aria-label={t('followAria', tag)}
              onClick={() => { if (!scene.current) return; const n = follow === id ? null : id; scene.current.focus(n); setFollow(n); }}>
              <i style={{ background: c }} />{tag}
            </button>
          ))}
        </div>
      )}
      <div className="plegend">
        <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: legend }} />
        {in3d && <Tip k="tip3dTop" />}
      </div>
    </div>
  );
}

const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
