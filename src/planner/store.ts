import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { Chain, GameData } from './model/types.ts';
import { PLANNER_STORE, encodeChain, initialHistory, newHistory, reduce, type Action } from './model/persist.ts';
import { PLANNER_PATH, type Lang } from './lang.ts';
import { getLang } from '../i18n/index.js';

export function usePlanner(data: GameData) {
  const [hist, dispatch] = useReducer(
    (h: ReturnType<typeof newHistory>, a: Action) => reduce(h, a, data),
    undefined,
    () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(PLANNER_STORE); } catch { /* sem storage */ }
      // Etapas empilhadas (o exemplo, ou um link sem posições) são arrumadas antes do primeiro passo do histórico;
      // link diferente da cadeia salva entra por cima dela (um Desfazer volta à salva).
      return initialHistory(location.hash, saved, data);
    },
  );
  const chain: Chain = hist.present;

  // Abriu por #p=: o hash já foi lido, então limpa o endereço.
  useEffect(() => {
    if (/^#?p=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PLANNER_STORE, encodeChain(chain)); } catch { /* sem storage */ }
  }, [chain]);

  const shareUrl = useCallback(() => location.origin + PLANNER_PATH[getLang() as Lang] + '#p=' + encodeChain(chain), [chain]);
  return useMemo(() => ({ chain, dispatch, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, shareUrl }),
    [chain, hist.past.length, hist.future.length, shareUrl]);
}
