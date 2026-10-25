// Os meios da cadeia calculados fora do render: num Web Worker com cache; sem Worker, síncrono com o mesmo cache.
import { useEffect, useMemo, useReducer } from 'react';
import { cacheKey, meioResult, splitCached, type MeioResult } from './model/meioresult.ts';
import type { Meio } from './model/meio.ts';
import type { Chain, GameData } from './model/types.ts';
import type { MeioDone, MeioJobs } from './worker/meio.worker.ts';

const CACHE_MAX = 256;
// Ordem de inserção = do mais antigo ao mais novo; passando do limite, o mais antigo sai.
const cache = new Map<string, MeioResult>();
const pending = new Set<string>(), failed = new Set<string>();
// Keys que algum componente montado ainda mostra: só elas pedem re-render quando chegam.
const wanted = new Set<string>();
const listeners = new Set<() => void>();

function remember(r: MeioResult) {
  cache.delete(r.key);
  cache.set(r.key, r);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}
const notify = () => { for (const f of listeners) f(); };

// undefined = ainda não tentou; null = sem Worker (teste, navegador antigo, falha ao carregar).
let worker: Worker | null | undefined;
function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    const w = new Worker(new URL('./worker/meio.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<MeioDone>) => {
      let changed = false;
      for (const r of e.data.results) {
        pending.delete(r.key);
        remember(r);
        if (wanted.has(r.key)) changed = true;
      }
      for (const k of e.data.failed) { pending.delete(k); failed.add(k); if (wanted.has(k)) changed = true; }
      if (changed) notify();
    };
    // O worker não carregou: volta para o cálculo síncrono.
    w.onerror = () => { w.terminate(); worker = null; pending.clear(); notify(); };
    worker = w;
  } catch { worker = null; }
  return worker;
}

// id do meio -> resultado; null = calculando; meio com erro fica de fora.
export function useMeioResults(chain: Chain, data: GameData, lang: string, list: Meio[]): Map<string, MeioResult | null> {
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { listeners.add(bump); return () => { listeners.delete(bump); }; }, []);

  const keys = useMemo(() => {
    const m = new Map<string, string>();
    for (const me of list) { try { m.set(me.id, cacheKey(me, chain, data, lang)); } catch { /* etapa inválida: sem meio */ } }
    return m;
  }, [list, chain, data, lang]);

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
      try { const n = meioResult(me, chain, data); remember(n); out.set(id, n); } catch { failed.add(key); }
    }
    return out;
  }, [keys, list, chain, data, version]);

  useEffect(() => {
    const ks = [...keys.values()];
    for (const k of ks) wanted.add(k);
    const w = getWorker();
    if (w) {
      const jobs: MeioJobs['jobs'] = [];
      for (const [id, key] of keys) if (results.get(id) === null && !pending.has(key)) { jobs.push({ id, key }); pending.add(key); }
      if (jobs.length) w.postMessage({ lang, chain, jobs } satisfies MeioJobs);
    }
    return () => { for (const k of ks) wanted.delete(k); };
  }, [keys, results, lang, chain]);

  return results;
}
