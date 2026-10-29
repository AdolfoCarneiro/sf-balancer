// O que o modal da ligação mostra, calculado no worker: o desenho do fluxo da ferramenta (o mesmo SVG, só string) e
// os passo a passo que dá para montar (o balancer N→M da montagem e a árvore de cada doadora).
import { dstTag, srcTag, t } from '../../i18n/index.js';
import { flowHasLoop, flowSvg } from '../../balancer/flow.js';
import { designKey } from '../../balancer/balancerSvg.js';
import type { Lang } from '../../shell/site.ts';
import { meioInput, meioPlan, meioUrl, type Meio } from './meio.ts';
import type { FlowResult } from './solve.ts';
import type { Factory, GameData } from './types.ts';

// ctx do `workbench` da ferramenta (sem os blueprints e as preferências, que o modal põe). key: o `data-open-bal` do
// bloco no desenho ('plan' para o balancer N→M, 'g<i>' para a doadora i), para o clique no bloco abrir o passo a passo.
export interface Bench {
  key: string; label: string;
  ctx: {
    N: number; M: number; rates: number[]; cap: number; belt: string; labels: { ins: string[]; outs: string[] };
    inUse: string; view: string; style: 'normal' | 'butterfly';
  };
}
export interface FlowView { title: string; svg: string; loop: boolean; fluid: boolean; benches: Bench[]; warnings: string[] }

// Só o que este módulo lê do computePlan completo (o Plan do planner é a versão leve).
interface Line { id: number; rate: number }
interface Design { kind: string; N: number; M: number; rates: number[] }
interface Group { mode: 'direct' | 'loop' | 'sink'; p: number; n: number; donor: Line; members: Line[] }
interface FullAlt {
  key: string; caseLabel: string; warnings: string[];
  view: { bal?: { design: Design }; groups: { gr: Group }[] };
  bal?: { inputs: Line[] }; feeds: { dst: Line }[];
}
interface FullPlan { fluid: boolean; cap: number; alternatives: FullAlt[]; warnings: { text: string }[]; direct?: true; unbounded?: true; tooLarge?: unknown }

const TREE_KIND = { direct: 'matrix', loop: 'matrix-loop', sink: 'matrix-sink' } as const;

// Os passo a passo da montagem, como o openFromPlan da ferramenta: 'plan' (balancer N→M) e 'g<i>' (doadora).
function benchesOf(a: FullAlt, cap: number, belt: string): Bench[] {
  const out: Bench[] = [];
  const d = a.view.bal?.design;
  if (d && a.bal) {
    out.push({
      key: 'plan', label: `balancer ${d.N}→${d.M}`,
      ctx: {
        N: d.N, M: d.M, rates: [...d.rates], cap, belt,
        labels: { ins: a.bal.inputs.map(l => srcTag(l.id)), outs: a.feeds.map(fd => dstTag(fd.dst.id)) },
        inUse: designKey(d), view: designKey(d), style: d.kind.startsWith('butterfly') ? 'butterfly' : 'normal',
      },
    });
  }
  a.view.groups.forEach(({ gr }, i) => {
    const kind = TREE_KIND[gr.mode];
    out.push({
      key: 'g' + i, label: `${srcTag(gr.donor.id)} ÷${gr.mode === 'sink' ? gr.n : gr.p}${gr.mode === 'loop' ? ' ↺' : ''}`,
      ctx: {
        N: 1, M: gr.p, rates: [gr.donor.rate], cap, belt,
        labels: { ins: [srcTag(gr.donor.id)], outs: gr.members.map(m => dstTag(m.id)) },
        inUse: kind, view: kind, style: 'normal',
      },
    });
  });
  return out;
}

// altKey: a montagem escolhida (a primeira, se não existe mais). Ligação direta, sem limite ou grande demais: sem
// desenho e sem passo a passo, só o título e os avisos.
export function flowView(meio: Meio, f: Factory, flow: FlowResult, d: GameData, altKey: string): FlowView {
  const p = meioPlan(meio, f, flow, d) as unknown as FullPlan;
  const a = p.alternatives.find(x => x.key === altKey) ?? p.alternatives[0];
  const warnings = [...p.warnings.map(w => w.text), ...(a?.warnings ?? [])];
  if (!a) {
    const label = p.unbounded ? t('plUnbounded') : d.items[meio.item]?.name ?? meio.item;
    return { title: t('plLigTitle', label), svg: '', loop: false, fluid: p.fluid, benches: [], warnings };
  }
  const benches = p.fluid ? [] : benchesOf(a, p.cap, meioInput(meio, f, flow, d).tier);
  const bal = a.view.bal?.design;
  return {
    title: t('plLigTitle', bal ? `balancer ${bal.N}→${bal.M}` : a.caseLabel),
    svg: flowSvg(p, a), loop: !p.fluid && flowHasLoop(a), fluid: p.fluid, benches, warnings,
  };
}

// O link da página Balancer (/balancer, /pt/balancer, /es/balancer) com esta ligação, com a montagem escolhida
// (`selectedKey` do `#s=`).
export const balancerUrl = (meio: Meio, f: Factory, flow: FlowResult, d: GameData, lang: Lang, altKey?: string | null): string =>
  meioUrl(meio, f, flow, d, lang, altKey);
