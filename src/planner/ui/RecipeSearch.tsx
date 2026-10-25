import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { recipeLine, searchRecipes } from '../model/search.ts';
import type { GameData, Recipe } from '../model/types.ts';
import type { SearchRequest } from './selection.ts';

interface Props {
  data: GameData;
  // Busca aberta a partir de uma porta: filtra pelas receitas que consomem ou produzem o item.
  request: SearchRequest | null;
  onClearRequest: () => void;
  onPick: (recipe: Recipe) => void;
}

const MAX = 60;

export function RecipeSearch({ data, request, onClearRequest, onPick }: Props) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // Veio de uma porta: começa limpo e leva o foco para o campo.
  useEffect(() => {
    if (!request) return;
    setQuery('');
    input.current?.focus();
  }, [request]);

  const filter = request ? { [request.side === 'consumes' ? 'consumes' : 'produces']: request.item } : undefined;
  const results = useMemo(
    () => (query.trim() || request ? searchRecipes(data, query, filter).slice(0, MAX) : []),
    [data, query, request], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => setActive(0), [results]);
  useEffect(() => { document.getElementById(`${uid}-o${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, uid]);

  const pick = (r: Recipe | undefined) => {
    if (!r) return;
    onPick(r);
    setQuery('');
  };
  const clear = () => { setQuery(''); onClearRequest(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setActive(a => (a + 1) % results.length); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive(a => (a - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); clear(); }
  };

  const itemName = request ? data.items[request.item]?.name ?? request.item : '';
  const listId = `${uid}-list`;
  return (
    <div className="pl-search">
      <label htmlFor={`${uid}-in`} className="pl-lbl">{t('plSearchLabel')}</label>
      <input ref={input} id={`${uid}-in`} className="pl-field" type="text" autoComplete="off" spellCheck={false}
        placeholder={t('plSearchPlaceholder')} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
        role="combobox" aria-expanded={results.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={results.length ? `${uid}-o${active}` : undefined} />
      {request && (
        <span className="pl-chip">
          {t('plSearchFor', itemName)}
          <button type="button" aria-label={t('plSearchClear')} onClick={() => { clear(); input.current?.focus(); }}>×</button>
        </span>
      )}
      <ul id={listId} className="pl-results" role="listbox" aria-label={t('plSearchResults')} hidden={!results.length}>
        {results.map((r, i) => (
          <li key={r.id} id={`${uid}-o${i}`} role="option" aria-selected={i === active} className="pl-opt"
            onMouseDown={e => e.preventDefault()} onClick={() => pick(r)} onMouseMove={() => setActive(i)}>
            <span className="pl-opt-top"><span>{r.name}</span>{r.alt && <span className="pl-alt">{t('plAlt')}</span>}</span>
            <span className="pl-opt-line">{data.buildings[r.building]?.name ?? r.building} · {recipeLine(r, data)}</span>
          </li>
        ))}
      </ul>
      {(query.trim() || request) && !results.length && <p className="pl-note" role="status">{t('plSearchNone')}</p>}
      <p className="pl-note">{t('plSearchHint')}</p>
    </div>
  );
}
