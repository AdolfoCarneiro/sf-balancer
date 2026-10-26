import { BELTS, PIPES } from '../../logic/belts.js';
import type { GameData, Item, ItemId, PortWarning, Side, Stage, Flow } from './types.ts';

const E = 1e-9;
const floorE = (x: number) => Math.floor(x + E);
const ceil8 = (x: number) => Math.ceil(x / 8 - E) * 8;

const flowOf = (stage: Stage, data: GameData, item: ItemId, side: Side): Flow => {
  const f = data.recipes[stage.recipe][side].find(p => p.item === item);
  if (!f) throw new Error(`item ${item} não está em ${side} da receita ${stage.recipe}`);
  return f;
};
// Portas da etapa com o lado de cada uma.
export const portsOf = (stage: Stage, data: GameData): { item: ItemId; side: Side }[] => {
  const r = data.recipes[stage.recipe];
  return [...r.ins.map(f => ({ item: f.item, side: 'ins' as const })), ...r.outs.map(f => ({ item: f.item, side: 'outs' as const }))];
};
const ports = portsOf;
export const tierKey = (side: Side, item: ItemId): string => (side === 'ins' ? 'in:' : 'out:') + item;
export const tiersOf = (item: Item) => (item.fluid ? PIPES : BELTS) as { id: string; cap: number }[];

// Taxa do item numa máquina, já com o clock.
export function perMachine(stage: Stage, data: GameData, item: ItemId, side: Side): number {
  return flowOf(stage, data, item, side).perMin * stage.clock / 100;
}

export function stageTotals(stage: Stage, data: GameData) {
  const r = data.recipes[stage.recipe];
  const tot = (fs: Flow[], side: Side) => fs.map(f => ({ item: f.item, total: perMachine(stage, data, f.item, side) * stage.machines }));
  return { ins: tot(r.ins, 'ins'), outs: tot(r.outs, 'outs') };
}

export const defaultTier = (item: Item): string => (item.fluid ? 'Mk2' : 'Mk4');

export function capOf(item: Item, tier: string): number {
  const t = tiersOf(item).find(x => x.id === tier);
  if (!t) throw new Error(`tier ${tier} desconhecido`);
  return t.cap;
}

export function suggestedPerRow(stage: Stage, data: GameData): number {
  let m = Infinity;
  for (const p of ports(stage, data)) {
    const it = data.items[p.item];
    m = Math.min(m, floorE(capOf(it, defaultTier(it)) / perMachine(stage, data, p.item, p.side)));
  }
  return Math.max(1, Number.isFinite(m) ? m : 1);
}

export const perRowOf = (stage: Stage, data: GameData): number => stage.perRow ?? suggestedPerRow(stage, data);

export function stageRows(stage: Stage, data: GameData): number[] {
  const per = perRowOf(stage, data);
  const rows = Array(Math.floor(stage.machines / per)).fill(per);
  const rest = stage.machines - per * rows.length;
  if (rest > 0) rows.push(rest);
  return rows;
}

// Fileira mais cheia = a primeira.
const maxRow = (stage: Stage, data: GameData) => stageRows(stage, data)[0] ?? 0;

export function portTier(stage: Stage, data: GameData, item: ItemId, side: Side): string {
  const chosen = stage.tiers[tierKey(side, item)];
  if (chosen) return chosen;
  const it = data.items[item];
  const rate = maxRow(stage, data) * perMachine(stage, data, item, side);
  const list = tiersOf(it);
  const from = list.findIndex(t => t.id === defaultTier(it));
  const cands = list.slice(Math.max(0, from));
  return (cands.find(t => t.cap >= rate - E) ?? cands[cands.length - 1]).id;
}

export function portWarnings(stage: Stage, data: GameData): PortWarning[] {
  const out: PortWarning[] = [];
  for (const p of ports(stage, data)) {
    const it = data.items[p.item];
    const pm = perMachine(stage, data, p.item, p.side);
    const rowRate = maxRow(stage, data) * pm;
    const tier = portTier(stage, data, p.item, p.side);
    const cap = capOf(it, tier);
    if (rowRate <= cap + E) continue;
    out.push({ item: p.item, side: p.side, rowRate, tier, cap, fixTier: tiersOf(it).find(t => t.cap >= rowRate - E)?.id ?? null, fixPerRow: floorE(cap / pm) });
  }
  return out;
}

// As peças da etapa saem do arranjo (stagePieces em layout.ts).

// Estimativa da fileira simples (a área do arranjo simples sem fileiras deslocadas).
export function stageArea(stage: Stage, data: GameData): { w: number; d: number } {
  const b = data.buildings[data.recipes[stage.recipe].building];
  const rows = stageRows(stage, data).length;
  const w = perRowOf(stage, data) * b.w;
  const d = rows * (b.l + 2 * ports(stage, data).length) + (rows - 1) * 4;
  return { w: ceil8(w), d: ceil8(d) };
}
