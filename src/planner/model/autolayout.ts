// Arrumação do grafo: dagre da esquerda para a direita, com o tamanho de cada nó estimado pelas fileiras.
import dagre from '@dagrejs/dagre';
import { stageRows, perRowOf } from './stage.ts';
import type { Chain, GameData, Stage, StageId } from './types.ts';

type Pos = { x: number; y: number };

const HEADER = 56, PAD = 24, FOOT_LINE = 18, FOOT_PAD = 16;
export const RANK_SEP = 200, NODE_SEP = 48;

// Mesmas medidas do StageNode: 1 px = 1 m, 2 px entre máquinas, 8 px entre fileiras (esteira embaixo).
export function nodeSize(stage: Stage, data: GameData): { w: number; h: number } {
  const r = data.recipes[stage.recipe];
  const b = data.buildings[r.building];
  const rows = stageRows(stage, data).length;
  const w = Math.max(200, perRowOf(stage, data) * (Math.max(4, b.w) + 2) + PAD);
  const h = HEADER + PAD + rows * (Math.max(4, b.l) + 8) + FOOT_PAD + FOOT_LINE * (r.ins.length + 2 * r.outs.length);
  return { w, h };
}

export function autoLayout(chain: Chain, data: GameData): Record<StageId, Pos> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: RANK_SEP, nodesep: NODE_SEP, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const s of chain.stages) { const { w, h } = nodeSize(s, data); g.setNode(s.id, { width: w, height: h }); }
  for (const l of chain.links) g.setEdge(l.from, l.to);
  dagre.layout(g);
  const out: Record<StageId, Pos> = {};
  // O dagre devolve o centro; o nó do React Flow é posicionado pelo canto.
  for (const s of chain.stages) {
    const n = g.node(s.id);
    out[s.id] = { x: Math.round(n.x - n.width / 2), y: Math.round(n.y - n.height / 2) };
  }
  return out;
}

// Etapa nova sem mexer nas outras: à direita do produtor, à esquerda do consumidor, ou abaixo de tudo.
export function placeNew(chain: Chain, data: GameData, id: StageId): Pos {
  const get = (x: StageId) => chain.stages.find(s => s.id === x);
  const me = get(id);
  const others = chain.stages.filter(s => s.id !== id);
  const myW = me ? nodeSize(me, data).w : 200;
  // Abaixo das etapas que já estão naquela coluna.
  const below = (x: number, w: number, y0: number) => {
    let y = y0;
    for (const s of others) {
      const sz = nodeSize(s, data);
      if (s.pos.x < x + w && x < s.pos.x + sz.w && s.pos.y + sz.h > y - NODE_SEP && s.pos.y < y + 1) y = s.pos.y + sz.h + NODE_SEP;
    }
    return y;
  };
  const prod = chain.links.find(l => l.to === id && get(l.from));
  if (prod) {
    const p = get(prod.from)!;
    const x = p.pos.x + nodeSize(p, data).w + RANK_SEP;
    return { x, y: below(x, myW, p.pos.y) };
  }
  const cons = chain.links.find(l => l.from === id && get(l.to));
  if (cons) {
    const c = get(cons.to)!;
    const x = c.pos.x - RANK_SEP - myW;
    return { x, y: below(x, myW, c.pos.y) };
  }
  if (!others.length) return { x: 0, y: 0 };
  const x = Math.min(...others.map(s => s.pos.x));
  return { x, y: Math.max(...others.map(s => s.pos.y + nodeSize(s, data).h)) + NODE_SEP };
}

// Duas etapas no mesmo lugar (o exemplo, ou um link sem posições) pedem arrumação.
export function needsLayout(chain: Chain): boolean {
  const seen = new Set<string>();
  for (const s of chain.stages) {
    const k = `${s.pos.x},${s.pos.y}`;
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

export function withLayout(chain: Chain, data: GameData): Chain {
  if (!needsLayout(chain)) return chain;
  const p = autoLayout(chain, data);
  return { ...chain, stages: chain.stages.map(s => ({ ...s, pos: p[s.id] })) };
}
