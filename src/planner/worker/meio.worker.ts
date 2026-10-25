// Calcula fora da thread da página: o fluxo da fábrica (com cache por componente) e os meios pedidos.
import { setLang } from '../../i18n/index.js';
import game from '../data/game.json';
import { meiosOf } from '../model/factory.ts';
import { flowView, type FlowView } from '../model/ligacao.ts';
import { meioResult, type MeioResult } from '../model/meioresult.ts';
import { solveCached, type FlowResult } from '../model/solve.ts';
import type { Factory, GameData } from '../model/types.ts';

// solve: o fluxo da fábrica; seq numera os pedidos (a página descarta resposta de pedido velho).
// meios: os meios pedidos, com o fluxo que a página usou para as chaves (os dois lados com os mesmos números).
// flow: o desenho do fluxo de uma ligação (o modal), na montagem `alt`; key = cacheKey + '|' + alt.
export type WorkerIn =
  | { type: 'solve'; seq: number; factory: Factory }
  | { type: 'meios'; lang: string; factory: Factory; flow: FlowResult; jobs: { id: string; key: string }[] }
  | { type: 'flow'; lang: string; factory: Factory; flow: FlowResult; meio: string; alt: string; key: string };
// failed: keys que deram erro no cálculo (a página para de esperar por elas); view null: o desenho deu erro.
export type WorkerOut =
  | { type: 'solved'; seq: number; result: FlowResult }
  | { type: 'meios'; results: MeioResult[]; failed: string[] }
  | { type: 'flow'; key: string; view: FlowView | null };

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
  if (m.type === 'flow') {
    setLang(m.lang);
    let view: FlowView | null = null;
    try {
      const meio = meiosOf(m.factory).find(x => x.id === m.meio);
      if (meio) view = flowView(meio, m.factory, m.flow, data, m.alt);
    } catch { /* fica null: a página mostra o erro */ }
    scope.postMessage({ type: 'flow', key: m.key, view });
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
