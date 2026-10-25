// Os meios da fábrica calculados fora do render: num Web Worker com cache; sem Worker, síncrono com o mesmo cache.
import { useEffect, useMemo, useReducer } from 'react';
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
