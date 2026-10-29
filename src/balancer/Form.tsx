// O formulário do planejador: os grupos de máquinas da origem e do destino e as regras (o que leva, esteira ou cano, o
// que fazer com a sobra, a convenção das peças).
import { t, fmt } from '../i18n/index.js';
import { BELTS, PIPES, sizeParts } from '../logic/index.js';
import { EPS } from '../logic/belts.js';
import { Tip } from './help.tsx';
import { DRIVES, type Conv, type Excess, type Field, type Group, type Inputs, type Medium, type Policy, type Side } from './model.ts';

/* eslint-disable @typescript-eslint/no-explicit-any -- as equivalências vêm do computePlan (src/logic, JS) */
export interface GroupInfo { side: Side; groups: any[]; cap: number; fluid: boolean }

const CELLS: { k: Field; cls: string; label: (s: Side) => string; tip: (s: Side) => string; mode: 'decimal' | 'numeric' }[] = [
  { k: 'count', cls: 'g-count', label: () => 'fMachines', tip: () => 'tipMachines', mode: 'decimal' },
  { k: 'clock', cls: 'g-clock', label: () => 'fClock', tip: () => 'tipClock', mode: 'decimal' },
  { k: 'nominal', cls: 'g-nom', label: s => (s === 'src' ? 'fNomSrc' : 'fNomDst'), tip: s => (s === 'src' ? 'tipNomSrc' : 'tipNomDst'), mode: 'decimal' },
  { k: 'total', cls: 'g-total', label: () => 'fTotal', tip: () => 'tipTotal', mode: 'decimal' },
  { k: 'per', cls: 'g-per', label: () => 'fPer', tip: () => 'tipPer', mode: 'numeric' },
];

// As três equivalências (máquinas a 100 %, no clock, por minuto) embaixo do grupo e nos campos que não mandam.
function equivalences(g: any, cap: number, fluid: boolean, side: Side): { ph: Partial<Record<Field, string>>; eq: string } {
  if (g.continuous) return { ph: {}, eq: t(fluid ? 'eqContinuousPipe' : 'eqContinuous', fmt(g.total, 2), g.lines, fmt(cap)) };
  return {
    ph: { count: fmt(g.n, 2), clock: fmt(g.clock * 100, 2), total: fmt(g.total, 2), per: t('perAuto', g.perLine) },
    eq: t('eqMachines', {
      n: fmt(g.n, 2), one: Math.abs(g.n - 1) < EPS, N: g.N, clock: fmt(g.clock * 100, 2), total: fmt(g.total, 2),
      src: side === 'src', per: fmt(g.perMachine, 2), perLine: g.perLine, lineRate: fmt(g.lineRate, 2),
      max: g.balanced ? g.auto : null, lines: g.sizes.length, parts: t('lineParts', sizeParts(g.sizes, g.eff)),
    }),
  };
}

export function Groups({ side, groups, info, bad, onEdit, onRemove }: {
  side: Side; groups: Group[]; info: GroupInfo | null; bad: Set<string>;
  onEdit: (i: number, k: Field, v: string) => void; onRemove: (i: number) => void;
}) {
  return (
    <div id={side === 'src' ? 'srcGroups' : 'dstGroups'}>
      {groups.map((g, i) => {
        const gi = info?.groups.find(x => x.gi === i);
        const eqv = gi ? equivalences(gi, info!.cap, info!.fluid, side) : { ph: {}, eq: '' };
        return (
          <div key={i} className="grp">
            <div className="grp-head">
              <span className="grp-name">{groups.length > 1 ? t('groupN', i + 1) : ''}</span>
              <button className="rm" type="button" hidden={groups.length === 1} onClick={() => onRemove(i)}>{t('removeGroup')}</button>
            </div>
            <div className="grp-fields">
              {CELLS.map(c => {
                // O "?" fica fora do <label>, então o rótulo aponta para o campo por id.
                const id = `bal-${side}-${i}-${c.k}`;
                const cls = 'field ' + c.cls + (bad.has(`${side}.${i}.${c.k}`) ? ' invalid' : '') + (DRIVES[g.driver] === c.k ? ' drives' : '');
                return (
                  <div key={c.k} className="cell">
                    <div className="cell-head"><span><label htmlFor={id}>{t(c.label(side))}</label><Tip k={c.tip(side)} /></span></div>
                    <input id={id} className={cls} type="text" inputMode={c.mode} value={g[c.k]} placeholder={eqv.ph[c.k] ?? ''}
                      onChange={e => onEdit(i, c.k, e.target.value)} />
                  </div>
                );
              })}
            </div>
            <p className="eq num" dangerouslySetInnerHTML={{ __html: eqv.eq }} />
          </div>
        );
      })}
    </div>
  );
}

// Uma escolha da regra (rádio de verdade, com o visual comum das caixas de seleção em parts.css).
function Choice<T extends string>({ name, value, cur, label, off, id, onPick }: {
  name: string; value: T; cur: T; label: string; off?: boolean; id?: string; onPick: (v: T) => void;
}) {
  return (
    <label className={'choice' + (off ? ' off' : '')} id={id}>
      <input type="radio" name={name} value={value} checked={cur === value} disabled={off} onChange={() => onPick(value)} />
      {' '}<span>{label}</span>
    </label>
  );
}

export function Rules({ s, onMedium, onPick }: {
  s: Inputs;
  onMedium: (m: Medium) => void;
  onPick: (patch: Partial<Pick<Inputs, 'belt' | 'pipe' | 'policy' | 'excess' | 'conv'>>) => void;
}) {
  const fluid = s.medium === 'fluid';
  return (
    <section className="plate rules">
      <div className="rule">
        <h3><span>{t('medTitle')}</span><Tip k="tipMedium" /></h3>
        <div className="inline">
          <Choice name="medium" value="item" cur={s.medium} label={t('medItem')} onPick={onMedium} />
          <Choice name="medium" value="fluid" cur={s.medium} label={t('medFluid')} onPick={onMedium} />
        </div>
      </div>
      {fluid ? (
        <div className="rule" id="pipeRule">
          <h3><span>{t('pipe')}</span><Tip k="tipPipe" /></h3>
          <select className="field" id="pipe" aria-label={t('pipeAria')} value={s.pipe} onChange={e => onPick({ pipe: e.target.value })}>
            {PIPES.map((b: { id: string; cap: number }) => <option key={b.id} value={b.id}>{t('pipeOpt', b.id, fmt(b.cap))}</option>)}
          </select>
        </div>
      ) : (
        <div className="rule" id="beltRule">
          <h3><span>{t('belt')}</span><Tip k="tipBelt" /></h3>
          <BeltSelect id="belt" aria={t('beltAria')} value={s.belt} onChange={v => onPick({ belt: v })} />
        </div>
      )}
      <div className="rule">
        <h3><span>{t('policyTitle')}</span><Tip k="tipPolicy" /></h3>
        <div className="inline">
          <Choice<Policy> name="policy" value="represar" cur={s.policy} label={t('policyHold')} onPick={v => onPick({ policy: v })} />
          <Choice<Policy> name="policy" value="sink" cur={s.policy} label={t('policySink')} off={fluid} id="policySinkChoice" onPick={v => onPick({ policy: v })} />
          <Choice<Policy> name="policy" value="extra" cur={s.policy} label={t('policyExtra')} onPick={v => onPick({ policy: v })} />
        </div>
      </div>
      <div className="rule" id="excessRule">
        <h3><span>{t('excessTitle')}</span><Tip k="tipExcess" /></h3>
        <div className="inline">
          <Choice<Excess> name="excess" value="represar" cur={s.excess} label={t('excessHold')} onPick={v => onPick({ excess: v })} />
          <Choice<Excess> name="excess" value="sink" cur={s.excess} label={t('excessSink')} off={fluid} id="excessSinkChoice" onPick={v => onPick({ excess: v })} />
        </div>
      </div>
      <div className="rule">
        <h3><span>{t('convTitle')}</span><Tip k="tipConv" /></h3>
        <div className="inline">
          <Choice<Conv> name="conv" value="k-1" cur={s.conv} label={t('convK1')} onPick={v => onPick({ conv: v })} />
          <Choice<Conv> name="conv" value="k" cur={s.conv} label={t('convK')} onPick={v => onPick({ conv: v })} />
        </div>
      </div>
    </section>
  );
}

export function BeltSelect({ id, aria, value, onChange }: { id: string; aria?: string; value: string; onChange: (v: string) => void }) {
  return (
    <select className="field" id={id} aria-label={aria} value={value} onChange={e => onChange(e.target.value)}>
      {BELTS.map((b: { id: string; cap: number }) => <option key={b.id} value={b.id}>{`${b.id}, ${fmt(b.cap)}/min`}</option>)}
    </select>
  );
}
