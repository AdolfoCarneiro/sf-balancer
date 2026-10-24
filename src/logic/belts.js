// Esteiras, grupos de máquinas e linhas de coleta/distribuição.
import { t, fmt } from '../i18n/index.js';

export const BELTS = [
  { id: 'Mk1', cap: 60 }, { id: 'Mk2', cap: 120 }, { id: 'Mk3', cap: 270 },
  { id: 'Mk4', cap: 480 }, { id: 'Mk5', cap: 780 }, { id: 'Mk6', cap: 1200 },
];

// Fluido vai em cano (m³/min). Cano não tem splitter: a Pipeline Junction junta ou divide sem garantir partes iguais.
export const PIPES = [{ id: 'Mk1', cap: 300 }, { id: 'Mk2', cap: 600 }];

export const EPS = 1e-6;

export const INF = Infinity;

// Aceita o formato novo ({ driver, count, clock, nominal, total, per }) e o antigo ({ mode, count, rate, per }).
function normalizeGroup(g) {
  if (g.driver) return g;
  if (g.mode === 'total') return { driver: 'total', total: g.rate, per: g.per };
  return { driver: 'machines', count: g.count, nominal: g.rate, per: g.per };
}

// O campo que manda define o grupo: máquinas fracionadas, inteiras com clock, ou total.
// Devolve as três equivalências e a taxa real de cada máquina.
export function resolveGroup(raw) {
  const g = normalizeGroup(raw);
  const nominal = g.nominal > 0 ? g.nominal : 0;
  let n, N, total;
  if (g.driver === 'total') {
    total = g.total;
    if (!nominal) return { continuous: true, total, per: g.per || 0 };
    n = total / nominal;
    N = Math.max(1, Math.ceil(n - EPS));
  } else if (g.driver === 'clock') {
    N = Math.max(1, Math.ceil(g.count - EPS));
    total = g.count * nominal * g.clock / 100;
    n = total / nominal;
  } else {
    n = g.count;
    N = Math.max(1, Math.ceil(n - EPS));
    total = n * nominal;
  }
  const perMachine = total / N;
  return { continuous: false, n, N, total, perMachine, clock: perMachine / nominal, nominal, per: g.per || 0 };
}

// Linhas de esteira a partir de vários grupos. Cada grupo enche linhas com a taxa real por máquina;
// as máquinas que sobram de cada grupo são empacotadas juntas, maior primeiro.
// balance: no automático, divide o grupo em linhas iguais (14 → 7 + 7) em vez de encher e deixar a sobra.
// mix: false mantém as sobras de cada grupo em linhas próprias.
export function buildLines(groups, cap, side = t('group'), fluid = false, { balance = false, mix = true } = {}) {
  const lines = [], info = [], warnings = [], loose = [];
  const name = gi => (groups.length > 1 ? t('groupOf', side, gi + 1) : side);
  groups.forEach((raw, gi) => {
    const r = resolveGroup(raw);
    if (r.continuous) {
      const full = Math.floor(r.total / cap + EPS);
      for (let i = 0; i < full; i++) lines.push({ machines: 0, rate: cap, partial: false, comp: [{ gi, total: true, rate: cap }] });
      const rem = r.total - full * cap;
      if (rem > EPS) lines.push({ machines: 0, rate: rem, partial: true, comp: [{ gi, total: true, rate: rem }] });
      info.push({ gi, ...r, lines: full + (rem > EPS ? 1 : 0) });
      return;
    }
    if (r.clock > 2.5 + EPS || r.clock < 0.01 - EPS) warnings.push({ level: 'warn', text: t('warnClock', name(gi), fmt(r.clock * 100, 2)) });
    const eff = Math.min(r.perMachine, cap);
    if (r.perMachine > cap + EPS) warnings.push({ level: 'warn', text: t(fluid ? 'warnMachineOverPipe' : 'warnMachineOverBelt', name(gi), fmt(r.perMachine), fmt(cap), fmt(r.perMachine - cap)) });
    const auto = Math.max(1, Math.floor(cap / eff + EPS));
    const perLine = r.per > 0 ? Math.floor(r.per) : auto;
    if (perLine * eff > cap + EPS) warnings.push({ level: 'bad', text: t(fluid ? 'warnPerLineOverPipe' : 'warnPerLineOver', name(gi), perLine, fmt(perLine * eff), fmt(cap), auto) });
    if (balance && !(r.per > 0)) {
      const n = Math.ceil(r.N / auto), k = Math.floor(r.N / n), big = r.N - k * n;
      const sizes = Array.from({ length: n }, (_, i) => (i < big ? k + 1 : k));
      for (const m of sizes) lines.push({ machines: m, rate: m * eff, partial: false, comp: [{ gi, count: m, rate: eff }] });
      info.push({ gi, ...r, auto, perLine: sizes[0], fullLines: big || n, lineRate: sizes[0] * eff, rem: 0, sizes, eff, balanced: true });
      return;
    }
    const full = Math.floor(r.N / perLine);
    for (let i = 0; i < full; i++) lines.push({ machines: perLine, rate: perLine * eff, partial: false, comp: [{ gi, count: perLine, rate: eff }] });
    const rem = r.N - full * perLine;
    for (let i = 0; i < rem; i++) loose.push({ gi, rate: eff });
    const sizes = Array(full).fill(perLine).concat(rem ? [rem] : []);
    info.push({ gi, ...r, auto, perLine, fullLines: full, lineRate: perLine * eff, rem, sizes, eff });
  });
  loose.sort((a, b) => b.rate - a.rate || a.gi - b.gi);
  const packed = [];
  for (const m of loose) {
    let line = packed.find(l => l.rate + m.rate <= cap + EPS && (mix || l.comp[0].gi === m.gi));
    if (!line) { line = { machines: 0, rate: 0, partial: true, comp: [] }; packed.push(line); }
    line.machines++;
    line.rate += m.rate;
    const c = line.comp.find(x => x.gi === m.gi);
    if (c) c.count++; else line.comp.push({ gi: m.gi, count: 1, rate: m.rate });
  }
  lines.push(...packed);
  // Sem mistura, as linhas saem na ordem dos grupos (a sobra do grupo 1 vem antes das linhas do grupo 2).
  if (!mix) lines.sort((a, b) => a.comp[0].gi - b.comp[0].gi);
  return { lines, groups: info, packed: packed.length, warnings, total: lines.reduce((a, l) => a + l.rate, 0) };
}

// Tamanhos das linhas de um grupo agrupados: [15, 15, 15, 14] → 3 de 15 + 1 de 14.
export function sizeParts(sizes, eff) {
  const parts = [];
  for (const k of sizes) {
    const p = parts.find(x => x.k === k);
    if (p) p.n++; else parts.push({ n: 1, k, rate: fmt(k * eff) });
  }
  return parts;
}

// Texto curto da composição de uma linha: "12 × 39,4" ou "1 × 200 + 1 × 120".
export function lineComp(l) {
  if (!l.comp) return `${l.machines} × ${fmt(l.rate / Math.max(1, l.machines))}`;
  return l.comp.map(c => (c.total ? t('continuousFlow') : `${c.count} × ${fmt(c.rate)}`)).join(' + ');
}

// Resumo das taxas: "5 × 455 + 1 × 300".
export function summarizeRates(lines) {
  const counts = [];
  for (const l of lines) {
    const c = counts.find(x => Math.abs(x.rate - l.rate) < EPS);
    if (c) c.n++; else counts.push({ rate: l.rate, n: 1 });
  }
  return counts.map(c => `${c.n} × ${fmt(c.rate)}`).join(' + ');
}

// Peças de manifold (mergers na coleta, splitters na distribuição).
export function manifoldPieces(lines, conv) {
  return lines.reduce((acc, l) => acc + (conv === 'k' ? l.machines : Math.max(0, l.machines - 1)), 0);
}
