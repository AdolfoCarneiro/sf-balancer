// Divisões diretas do splitter e contagem de mergers/junções.
import { t } from '../i18n/index.js';
import { EPS } from './belts.js';

// Splitter só divide direto em produtos de 2 e 3.
export function isDirect(n) {
  if (n < 1) return false;
  while (n % 2 === 0) n /= 2;
  while (n % 3 === 0) n /= 3;
  return n === 1;
}

export function nextDirect(n) { let m = Math.max(1, n); while (!isDirect(m)) m++; return m; }

// Árvore de splitters para n partes (n direto): primeiro os 2, depois os 3. Cada nível custa o produto
// dos anteriores, então o fator menor em cima gasta menos: 6 = 2 × 3 são 3 splitters (3 × 2 seriam 4).
export function splitTree(n) {
  const factors = [];
  let m = n;
  while (m % 2 === 0) { factors.push(2); m /= 2; }
  while (m % 3 === 0) { factors.push(3); m /= 3; }
  let splitters = 0, prod = 1;
  const levels = [];
  for (const f of factors) { levels.push({ count: prod, ways: f }); splitters += prod; prod *= f; }
  return { parts: n, factors, levels, splitters };
}

export function describeTree(tree) {
  if (tree.parts === 1) return t('treeNone');
  return t('treeDesc', tree.levels, tree.parts);
}

// Opções para dividir uma doadora de taxa s em p partes iguais, cada uma cobrindo maxDeficit.
// Loop: os n − p retornos entram com a doadora no merger da entrada (3+ retornos = cascata).
export function divisionOptions(s, p, maxDeficit, cap) {
  if (isDirect(p)) {
    const tree = splitTree(p);
    return { direct: true, p, n: p, tree, part: s / p, ok: s / p + EPS >= maxDeficit };
  }
  const n = nextDirect(p);
  const tree = splitTree(n);
  const loopLoad = s * n / p;
  return {
    direct: false, p, n, tree,
    loop: {
      part: s / p, ok: s / p + EPS >= maxDeficit,
      recirculate: n - p, mergers: mergersFor(1 + n - p), beltLoad: loopLoad, beltOk: loopLoad <= cap + EPS,
    },
    sink: { part: s / n, ok: s / n + EPS >= maxDeficit, sinkParts: n - p, sinkRate: s * (n - p) / n },
  };
}

// Mergers para juntar `inputs` esteiras numa só (merger tem até 3 entradas, em cascata).
export function mergersFor(inputs) { return inputs <= 1 ? 0 : Math.ceil((inputs - 1) / 2); }

// Pipeline Junctions para ligar `ports` canos num ponto só: cada junction tem 4 portas e
// cada ligação entre duas junctions gasta duas, então j junctions em cadeia dão 2j + 2 portas.
export function junctionsFor(ports) { return ports <= 2 ? 0 : Math.ceil((ports - 2) / 2); }

// Quantas entradas já estão juntas na saída de cada merger da cascata: o primeiro pega 3, os outros +2.
export function chainSizes(inputs) {
  const out = [];
  for (let k = 0; inputs > 1 && k < inputs;) { k = Math.min(inputs, k === 0 ? 3 : k + 2); out.push(k); }
  return out;
}

// Em qual merger da cascata entra a entrada i.
export const chainSlot = i => (i < 3 ? 0 : 1 + Math.floor((i - 3) / 2));
