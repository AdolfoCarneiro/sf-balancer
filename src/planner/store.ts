import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Factory, GameData } from './model/types.ts';
import { PLANNER_STORE, encodeFactory, initialHistory, reduce, shouldPersist, type Action, type History } from './model/factorystate.ts';
import {
  LIBRARY_STORE, addEntry, cleanLibrary, currentEntry, entryFactory, libraryOf, mergeFile, openEntry, putCurrent, removeEntry,
  renameEntry, type Library,
} from './model/library.ts';
import { BUILDER_PATH, type Lang } from '../shell/site.ts';
import { getLang, t } from '../i18n/index.js';

const readJson = (key: string): unknown => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
};

export function usePlanner(data: GameData) {
  // A lista de fábricas; sem ela (primeira vez com a lista), a fábrica salva de antes vira a primeira.
  const libAtStart = useRef<Library | null>(null);
  const [hist, dispatch] = useReducer(
    (h: History<Factory>, a: Action) => reduce(h, a, data),
    undefined,
    () => {
      libAtStart.current = cleanLibrary(readJson(LIBRARY_STORE), data);
      let saved: string | null = libAtStart.current ? currentEntry(libAtStart.current).data : null;
      if (!saved) try { saved = localStorage.getItem(PLANNER_STORE); } catch { /* sem storage */ }
      // Salvo da v1 (fase 1 e 2) abre migrado; link diferente da fábrica salva entra por cima dela (um Desfazer volta).
      return initialHistory(location.hash, saved, data);
    },
  );
  const factory: Factory = hist.present;
  // Aberto por #p=: a fábrica salva só é trocada na primeira edição (o hash ainda está lá neste primeiro render).
  const opened = useRef({ hist, fromLink: /^#?p=/.test(location.hash) });
  const [lib, setLib] = useState<Library>(() => libAtStart.current
    ?? libraryOf(t('plFactoryFirst'), opened.current.fromLink ? hist.past[0] ?? factory : factory, Date.now()));

  // Abriu por #p=: o hash já foi lido, então limpa o endereço.
  useEffect(() => {
    if (/^#?p=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }, []);

  useEffect(() => {
    if (!shouldPersist(opened.current.hist, hist, opened.current.fromLink)) return;
    try { localStorage.setItem(PLANNER_STORE, encodeFactory(factory)); } catch { /* sem storage */ }
    setLib(l => keepNow(l));
  }, [factory, hist]);
  useEffect(() => {
    try { localStorage.setItem(LIBRARY_STORE, JSON.stringify(lib)); } catch { /* sem storage */ }
  }, [lib]);

  // Operações da lista. As que trocam a fábrica aberta devolvem a fábrica nova (quem chama a carrega no mapa, que
  // enquadra tudo); null quando nada muda. A aberta já está gravada na entrada dela pelo efeito acima.
  // A aberta entra na lista só se já foi gravada (aberta por link e sem edição, não apaga a salva).
  const keepNow = (l: Library, f: Factory = factory) => (shouldPersist(opened.current.hist, hist, opened.current.fromLink) || f !== factory ? putCurrent(l, f, Date.now()) : l);
  const libOps = useMemo(() => ({
    open(id: string): Factory | null {
      const e = lib.items.find(x => x.id === id);
      if (!e || id === lib.current) return null;
      setLib(l => openEntry(keepNow(l), id));
      return entryFactory(e, data);
    },
    // Fábrica nova na lista (vazia, duplicada, importada ou separada) e já aberta; `keep`: como fica a de agora.
    create(name: string, f: Factory, keep: Factory = factory): Factory | null {
      const next = addEntry(keepNow(lib, keep), name, f, Date.now());
      if (!next) return null;
      setLib(next);
      return f;
    },
    rename(id: string, name: string) { setLib(l => renameEntry(l, id, name)); },
    remove(id: string): Factory | null {
      const next = removeEntry(keepNow(lib), id);
      if (next === lib) return null;
      setLib(next);
      return next.current !== lib.current ? entryFactory(currentEntry(next), data) : null;
    },
    merge(list: { name: string; factory: Factory }[]): number {
      const r = mergeFile(keepNow(lib), list, Date.now());
      setLib(r.lib);
      return r.added;
    },
    // A lista com a fábrica aberta já gravada (para o backup e para a tela mostrar os números de agora).
    snapshot: (): Library => keepNow(lib),
  }), [lib, factory, data, hist]);   // eslint-disable-line react-hooks/exhaustive-deps

  const shareUrl = useCallback(() => location.origin + BUILDER_PATH[getLang() as Lang] + '#p=' + encodeFactory(factory), [factory]);
  return useMemo(() => ({ factory, dispatch, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, shareUrl, lib, libOps }),
    [factory, hist.past.length, hist.future.length, shareUrl, lib, libOps]);
}
