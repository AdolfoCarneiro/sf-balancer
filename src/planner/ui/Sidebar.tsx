import { fmt, t } from '../../i18n/index.js';
import type { Chain, GameData } from '../model/types.ts';
import type { Action } from '../model/persist.ts';
import { nextStageId } from '../model/chain.ts';
import type { SearchRequest, Selection } from './selection.ts';
import { RecipeSearch } from './RecipeSearch.tsx';

interface Props {
  chain: Chain; data: GameData; selection: Selection; onSelect: (s: Selection) => void;
  search: SearchRequest | null; onClearSearch: () => void; dispatch: (a: Action) => void;
}

export function Sidebar({ chain, data, selection, onSelect, search, onClearSearch, dispatch }: Props) {
  return (
    <aside className="pl-side">
      <section className="pl-sec" id="pl-add-stage">
        <h2>{t('plAddStage')}</h2>
        <RecipeSearch data={data} request={search} onClearRequest={onClearSearch} onPick={r => {
          // O id da etapa nova é o próximo da cadeia atual: seleciona-a em seguida.
          const id = nextStageId(chain);
          dispatch(search ? { type: 'addLinkedStage', recipe: r.id, at: search } : { type: 'addStage', recipe: r.id, machines: 1 });
          onSelect({ kind: 'stage', id });
          onClearSearch();
        }} />
      </section>
      <section className="pl-sec">
        <h2>{t('plStages')}</h2>
        {chain.stages.length === 0 && <p className="pl-note">{t('plNoStages')}</p>}
        {chain.stages.map(s => {
          const on = selection?.kind === 'stage' && selection.id === s.id;
          return (
            <button key={s.id} type="button" className="pl-stage" aria-pressed={on} onClick={() => onSelect(on ? null : { kind: 'stage', id: s.id })}>
              <span>{data.recipes[s.recipe]?.name ?? s.recipe}</span>
              <span className="pl-n">{fmt(s.machines, 0)}</span>
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
