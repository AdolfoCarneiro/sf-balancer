// O fluxo da fábrica calculado fora do render: no Web Worker (com cache por componente lá dentro); sem Worker,
// síncrono com o mesmo cache. Também guarda o worker único do planner, usado pelos meios.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { solveSafe, type FlowResult } from './model/solve.ts';
import type { Factory, GameData } from './model/types.ts';
import type { WorkerIn, WorkerOut } from './worker/meio.worker.ts';

type Handler<T extends WorkerOut['type']> = (m: Extract<WorkerOut, { type: T }>) => void;
const handlers: { [T in WorkerOut['type']]?: Handler<T> } = {};
const lostListeners = new Set<() => void>();

// Quem trata cada tipo de resposta do worker (um por tipo).
export function onWorkerMessage<T extends WorkerOut['type']>(type: T, fn: Handler<T>): void { (handlers as Record<string, unknown>)[type] = fn; }
// Chamado quando o worker falha ao carregar (cada um volta ao cálculo síncrono).
export function onWorkerLost(fn: () => void): () => void { lostListeners.add(fn); return () => { lostListeners.delete(fn); }; }

// undefined = ainda não tentou; null = sem Worker (teste, navegador antigo, falha ao carregar).
let worker: Worker | null | undefined;
export function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    const w = new Worker(new URL('./worker/meio.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerOut>) => (handlers[e.data.type] as ((m: WorkerOut) => void) | undefined)?.(e.data);
    // O worker não carregou: volta para o cálculo síncrono.
    w.onerror = () => { w.terminate(); worker = null; for (const f of lostListeners) f(); };
    worker = w;
  } catch { worker = null; }
  return worker;
}
export const postToWorker = (w: Worker, m: WorkerIn): void => w.postMessage(m);

// Cache do cálculo síncrono (abertura e sem Worker). Roda no render: erro vira fluxo vazio com `failed`, nunca exceção.
const localCache = new Map<string, FlowResult>();
const solveHere = (f: Factory, d: GameData) => solveSafe({ v: 2, blocks: f.blocks, links: f.links }, d, localCache);

let lastSeq = 0;
const solvedListeners = new Set<(seq: number, result: FlowResult) => void>();
onWorkerMessage('solved', m => { for (const f of solvedListeners) f(m.seq, m.result); });

// flow: o último fluxo pronto; pending: os blocos ou as ligações mudaram e o novo ainda está no worker.
// Só blocos e ligações mudam o fluxo: mover no mapa, girar ou trocar a montagem não manda nada ao worker.
export function useFlowState(f: Factory, d: GameData): { flow: FlowResult; pending: boolean } {
  // A abertura resolve aqui uma vez (a primeira tela já sai com os números); depois, no worker.
  const [solved, setSolved] = useState(() => ({ flow: solveHere(f, d), blocks: f.blocks, links: f.links }));
  const [lost, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onWorkerLost(bump), []);
  const w = useMemo(getWorker, [lost]);
  const sync = useMemo(() => (w ? null : solveHere(f, d)), [w, f.blocks, f.links, d]);   // eslint-disable-line react-hooks/exhaustive-deps
  const seq = useRef(0);
  useEffect(() => {
    if (!w || (solved.blocks === f.blocks && solved.links === f.links)) return;
    const mine = seq.current = ++lastSeq;
    const { blocks, links } = f;
    const take = (s: number, result: FlowResult) => { if (s === mine) setSolved({ flow: result, blocks, links }); };
    solvedListeners.add(take);
    postToWorker(w, { type: 'solve', seq: mine, factory: { v: 2, blocks, links } });
    // Pedido novo (ou desmontou): a resposta deste fica descartada.
    return () => { solvedListeners.delete(take); };
  }, [w, f.blocks, f.links]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (sync) return { flow: sync, pending: false };
  return { flow: solved.flow, pending: solved.blocks !== f.blocks || solved.links !== f.links };
}

export const useFlow = (f: Factory, d: GameData): FlowResult => useFlowState(f, d).flow;
