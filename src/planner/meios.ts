// Os meios da fábrica calculados fora do render: num Web Worker com cache; sem Worker, síncrono com o mesmo cache.
import { useEffect, useMemo, useReducer } from 'react';
import { flowView, type FlowView } from './model/ligacao.ts';
import { cacheKey, evict, meioResult, splitCached, type MeioResult } from './model/meioresult.ts';
import type { Meio } from './model/meio.ts';
import type { FlowResult } from './model/solve.ts';
import type { Factory, GameData } from './model/types.ts';
import { getWorker, onWorkerLost, onWorkerMessage, postToWorker } from './solver.ts';

const CACHE_MAX = 256;
// Ordem de inserção = do mais antigo ao mais novo; passando do limite, sai o mais antigo que não está na tela.
const cache = new Map<string, MeioResult>();
const pending = new Set<string>(), failed = new Set<string>();
// Keys que algum componente montado ainda mostra: só elas pedem re-render quando chegam.
const wanted = new Set<string>();
const listeners = new Set<() => void>();

function remember(r: MeioResult) {
  cache.delete(r.key);
  cache.set(r.key, r);
  evict(cache, CACHE_MAX, wanted);
}
const notify = () => { for (const f of listeners) f(); };

onWorkerMessage('meios', m => {
  let changed = false;
  for (const r of m.results) {
    pending.delete(r.key);
    remember(r);
    if (wanted.has(r.key)) changed = true;
  }
  for (const k of m.failed) { pending.delete(k); failed.add(k); if (wanted.has(k)) changed = true; }
  if (changed) notify();
});
// O worker não carregou: o que estava pendente volta para o cálculo síncrono.
onWorkerLost(() => { pending.clear(); notify(); });

// id do meio -> resultado; null = calculando; meio com erro fica de fora.
// flow: o fluxo da fábrica `f` (as chaves e o cálculo usam os mesmos números).
export function useMeioResults(f: Factory, flow: FlowResult, data: GameData, lang: string, list: Meio[]): Map<string, MeioResult | null> {
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { listeners.add(bump); return () => { listeners.delete(bump); }; }, []);

  const keys = useMemo(() => {
    const m = new Map<string, string>();
    for (const me of list) { try { m.set(me.id, cacheKey(me, f, flow, data, lang)); } catch { /* bloco inválido: sem meio */ } }
    return m;
  }, [list, f, flow, data, lang]);

  // Mostra o que está no cache; o que falta vai para o worker (ou é calculado aqui, sem worker).
  const results = useMemo(() => {
    const { ready, missing } = splitCached(keys, cache);
    const out = new Map<string, MeioResult | null>(ready);
    const w = getWorker();
    for (const id of missing) {
      const key = keys.get(id)!;
      if (failed.has(key)) continue;
      if (w) { out.set(id, null); continue; }
      const me = list.find(m => m.id === id)!;
      try { const n = meioResult(me, f, flow, data); remember(n); out.set(id, n); } catch { failed.add(key); }
    }
    return out;
  }, [keys, list, f, flow, data, version]);

  useEffect(() => {
    const ks = [...keys.values()];
    for (const k of ks) wanted.add(k);
    const w = getWorker();
    if (w) {
      const jobs: { id: string; key: string }[] = [];
      for (const [id, key] of keys) if (results.get(id) === null && !pending.has(key)) { jobs.push({ id, key }); pending.add(key); }
      if (jobs.length) postToWorker(w, { type: 'meios', lang, factory: f, flow, jobs });
    }
    return () => { for (const k of ks) wanted.delete(k); };
  }, [keys, results, lang, f, flow]);

  return results;
}

// ---- O desenho do fluxo de uma ligação (o modal) ----
// Cache por cacheKey + '|' + montagem; null no cache = deu erro.
const FLOW_MAX = 32;
const views = new Map<string, FlowView | null>();
const viewsPending = new Set<string>();
const viewListeners = new Set<() => void>();
const keepView = (key: string, v: FlowView | null) => {
  views.delete(key);
  views.set(key, v);
  for (const k of views.keys()) { if (views.size <= FLOW_MAX) break; views.delete(k); }
};
onWorkerMessage('flow', m => { viewsPending.delete(m.key); keepView(m.key, m.view); for (const f of viewListeners) f(); });
onWorkerLost(() => { viewsPending.clear(); for (const f of viewListeners) f(); });

export type FlowViewState = { kind: 'calc' } | { kind: 'failed' } | { kind: 'ready'; view: FlowView };

// alt: a montagem escolhida ('' sem montagem). Fora do render: no worker; sem Worker, síncrono com o mesmo cache.
export function useFlowView(meio: Meio, f: Factory, flow: FlowResult, data: GameData, lang: string, alt: string): FlowViewState {
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { viewListeners.add(bump); return () => { viewListeners.delete(bump); }; }, []);
  const key = useMemo(() => {
    try { return cacheKey(meio, f, flow, data, lang) + '|' + alt; } catch { return null; }
  }, [meio, f, flow, data, lang, alt]);
  const state = useMemo((): FlowViewState => {
    if (key === null) return { kind: 'failed' };
    if (views.has(key)) { const v = views.get(key)!; return v ? { kind: 'ready', view: v } : { kind: 'failed' }; }
    if (getWorker()) return { kind: 'calc' };
    let v: FlowView | null = null;
    try { v = flowView(meio, f, flow, data, alt); } catch { /* fica null */ }
    keepView(key, v);
    return v ? { kind: 'ready', view: v } : { kind: 'failed' };
  }, [key, meio, f, flow, data, alt, version]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const w = getWorker();
    if (!w || key === null || state.kind !== 'calc' || viewsPending.has(key)) return;
    viewsPending.add(key);
    postToWorker(w, { type: 'flow', lang, factory: f, flow, meio: meio.id, alt, key });
  }, [key, state, lang, f, flow, meio, alt]);
  return state;
}
