// Calcula fora da thread da página: o fluxo da fábrica (com cache por componente) e os meios pedidos.
import { setLang } from '../../i18n/index.js';
import game from '../data/game.json';
import { meiosOf } from '../model/factory.ts';
import { meioResult, type MeioResult } from '../model/meioresult.ts';
import { solveCached, type FlowResult } from '../model/solve.ts';
import type { Factory, GameData } from '../model/types.ts';

// solve: o fluxo da fábrica; seq numera os pedidos (a página descarta resposta de pedido velho).
// meios: os meios pedidos, com o fluxo que a página usou para as chaves (os dois lados com os mesmos números).
export type WorkerIn =
  | { type: 'solve'; seq: number; factory: Factory }
  | { type: 'meios'; lang: string; factory: Factory; flow: FlowResult; jobs: { id: string; key: string }[] };
// failed: keys que deram erro no cálculo (a página para de esperar por elas).
export type WorkerOut =
  | { type: 'solved'; seq: number; result: FlowResult }
  | { type: 'meios'; results: MeioResult[]; failed: string[] };

const data = game as unknown as GameData;
// Só o necessário do escopo do worker, sem trocar a lib do projeto inteiro.
const scope = self as unknown as { onmessage: ((e: MessageEvent<WorkerIn>) => void) | null; postMessage: (m: WorkerOut) => void };
// Componentes já resolvidos: editar um bloco só recalcula o componente dele.
const flowCache = new Map<string, FlowResult>();

scope.onmessage = e => {
  const m = e.data;
  if (m.type === 'solve') {
    scope.postMessage({ type: 'solved', seq: m.seq, result: solveCached(m.factory, data, flowCache).result });
    return;
  }
  const { lang, factory, flow, jobs } = m;
  setLang(lang);
  const list = meiosOf(factory);
  // Um envio por meio: os rápidos aparecem sem esperar o mais lento.
  for (const job of jobs) {
    const meio = list.find(x => x.id === job.id);
    try {
      if (!meio) throw new Error(`meio ${job.id} não existe`);
      scope.postMessage({ type: 'meios', results: [{ ...meioResult(meio, factory, flow, data), key: job.key }], failed: [] });
    } catch { scope.postMessage({ type: 'meios', results: [], failed: [job.key] }); }
  }
};
