import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Factory, GameData } from './model/types.ts';
import { PLANNER_STORE, encodeFactory, initialHistory, reduce, shouldPersist, type Action, type History } from './model/factorystate.ts';
import { BUILDER_PATH, type Lang } from './lang.ts';
import { getLang } from '../i18n/index.js';

export function usePlanner(data: GameData) {
  const [hist, dispatch] = useReducer(
    (h: History<Factory>, a: Action) => reduce(h, a, data),
    undefined,
    () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(PLANNER_STORE); } catch { /* sem storage */ }
      // Salvo da v1 (fase 1 e 2) abre migrado; link diferente da fábrica salva entra por cima dela (um Desfazer volta).
      return initialHistory(location.hash, saved, data);
    },
  );
  const factory: Factory = hist.present;
  // Aberto por #p=: a fábrica salva só é trocada na primeira edição (o hash ainda está lá neste primeiro render).
  const opened = useRef({ hist, fromLink: /^#?p=/.test(location.hash) });

  // Abriu por #p=: o hash já foi lido, então limpa o endereço.
  useEffect(() => {
    if (/^#?p=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }, []);

  useEffect(() => {
    if (!shouldPersist(opened.current.hist, hist, opened.current.fromLink)) return;
    try { localStorage.setItem(PLANNER_STORE, encodeFactory(factory)); } catch { /* sem storage */ }
  }, [factory, hist]);

  const shareUrl = useCallback(() => location.origin + BUILDER_PATH[getLang() as Lang] + '#p=' + encodeFactory(factory), [factory]);
  return useMemo(() => ({ factory, dispatch, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, shareUrl }),
    [factory, hist.past.length, hist.future.length, shareUrl]);
}
