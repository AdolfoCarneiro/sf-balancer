import { fmt, t } from '../../i18n/index.js';
import type { Factory, GameData } from '../model/types.ts';
import type { FlowResult } from '../model/solve.ts';
import type { Action } from '../model/factorystate.ts';
import { nextBlockId } from '../model/factory.ts';
import type { Selection } from './selection.ts';
import { RecipeSearch } from './RecipeSearch.tsx';
import { mapCenter } from './MapView.tsx';
import { blockName } from './format.ts';

interface Props {
  factory: Factory; flow: FlowResult; data: GameData; selection: Selection; onSelect: (s: Selection) => void; dispatch: (a: Action) => void;
}

// Até o seletor no mapa (Task 6): a busca cria o bloco no centro da vista.
export function Sidebar({ factory: f, flow, data, selection, onSelect, dispatch }: Props) {
  return (
    <aside className="pl-side">
      <section className="pl-sec" id="pl-add-stage">
        <h2>{t('plAddStage')}</h2>
        <RecipeSearch data={data} request={null} onClearRequest={() => {}} onPick={r => {
          // O id do bloco novo é o próximo da fábrica atual: seleciona-o em seguida.
          const id = nextBlockId(f);
          dispatch({ type: 'addBlock', spec: { kind: 'recipe', recipe: r.id }, at: mapCenter() });
          onSelect({ kind: 'stage', id });
        }} />
      </section>
      <section className="pl-sec">
        <h2>{t('plStages')}</h2>
        {f.blocks.length === 0 && <p className="pl-note">{t('plNoStages')}</p>}
        {f.blocks.map(b => {
          const on = selection?.kind === 'stage' && selection.id === b.id;
          const n = b.kind === 'recipe' ? flow.blocks[b.id]?.machines : b.kind === 'extractor' ? flow.blocks[b.id]?.extractors : undefined;
          return (
            <button key={b.id} type="button" className="pl-stage" aria-pressed={on} onClick={() => onSelect(on ? null : { kind: 'stage', id: b.id })}>
              <span>{blockName(b, data)}</span>
              <span className="pl-n">{typeof n === 'number' ? fmt(n, 0) : n === null ? t('plUnbounded') : ''}</span>
            </button>
          );
        })}
      </section>
      <section className="pl-sec pl-note">
        <h2>{t('plLegend')}</h2>
        <div className="pl-leg"><span className="pl-sw pl-sw-m" />{t('plLegMachine')}</div>
        <div className="pl-leg"><span className="pl-sw pl-sw-b" />{t('plLegBelt')}</div>
        <div className="pl-leg"><span className="pl-sw pl-sw-p" />{t('plLegPipe')}</div>
        <div className="pl-leg"><span className="pl-sw-tag">A–D</span>{t('plLegMeio')}</div>
      </section>
    </aside>
  );
}
