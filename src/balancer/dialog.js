import { t, dstTag } from '../i18n/index.js';
import { S } from './state.js';
import { $, Dn, O } from './common.js';
import { workbench } from './workbench.js';
import { BPS, LIB, saveLib, setMode3d } from './library.js';
import { designKey } from './balancerSvg.js';

// ---- Diálogo com a montagem do balancer do plano ----
function openDesign(ctx) {
  $('dlgTitle').textContent = t('lbBalTitle', ctx.N, ctx.M);
  workbench($('dlgBody'), ctx);
  $('balDlg').showModal();
  $('dlgBody').querySelector('.ponder').focus();
}
// key: 'plan' para o balancer N→M da alternativa, 'g<i>' para a árvore de uma doadora.
export function openFromPlan(key) {
  if (!S.lastRender) return;
  const { p, alt } = S.lastRender;
  const base = { cap: p.cap, belt: p.input.belt, blueprints: BPS, mode3d: LIB.mode3d, mode3dBf: LIB.mode3dBf, onMode3d: setMode3d, per3d: LIB.per3d, onPer3d: v => { LIB.per3d = v; saveLib(); }, view2d: LIB.view2d, onView2d: v => { LIB.view2d = v; saveLib(); } };
  if (key === 'plan' && alt.view.bal) {
    const d = alt.view.bal.design;
    openDesign({ ...base, N: d.N, M: d.M, rates: d.rates, labels: { ins: alt.bal.inputs.map(O), outs: alt.feeds.map(f => Dn(f.dst)) }, inUse: designKey(d), view: designKey(d), style: d.kind.startsWith('butterfly') ? 'butterfly' : 'normal' });
  } else if (key[0] === 'g') {
    const gr = alt.view.groups[+key.slice(1)].gr;
    const kind = { direct: 'matrix', loop: 'matrix-loop', sink: 'matrix-sink' }[gr.mode];
    openDesign({ ...base, blueprints: [], N: 1, M: gr.p, rates: [gr.donor.rate], labels: { ins: [O(gr.donor)], outs: gr.members.map(dstTag) }, inUse: kind, view: kind });
  }
}

