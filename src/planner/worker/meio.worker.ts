// Calcula os meios fora da thread da página: recebe a cadeia e os meios pedidos, devolve o resultado de cada um.
import { setLang } from '../../i18n/index.js';
import game from '../data/game.json';
import { meios } from '../model/meio.ts';
import { meioResult, type MeioResult } from '../model/meioresult.ts';
import type { Chain, GameData } from '../model/types.ts';

export interface MeioJobs { lang: string; chain: Chain; jobs: { id: string; key: string }[] }
// failed: keys que deram erro no cálculo (a página para de esperar por elas).
export interface MeioDone { results: MeioResult[]; failed: string[] }

const data = game as unknown as GameData;
// Só o necessário do escopo do worker, sem trocar a lib do projeto inteiro.
const scope = self as unknown as { onmessage: ((e: MessageEvent<MeioJobs>) => void) | null; postMessage: (m: MeioDone) => void };

scope.onmessage = e => {
  const { lang, chain, jobs } = e.data;
  setLang(lang);
  const list = meios(chain, data);
  // Um envio por meio: os rápidos aparecem sem esperar o mais lento.
  for (const job of jobs) {
    const meio = list.find(m => m.id === job.id);
    try {
      if (!meio) throw new Error(`meio ${job.id} não existe`);
      scope.postMessage({ results: [{ ...meioResult(meio, chain, data), key: job.key }], failed: [] });
    } catch { scope.postMessage({ results: [], failed: [job.key] }); }
  }
};
