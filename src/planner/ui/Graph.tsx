import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, ReactFlow,
  type Connection, type FinalConnectionState, type NodeChange, type Node, type Edge, type NodeTypes, type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { t } from '../../i18n/index.js';
import { canLink, rawInputs } from '../model/chain.ts';
import { meioPlan, meioSummary, type Meio, type MeioSummary } from '../model/meio.ts';
import { nodeSize } from '../model/autolayout.ts';
import type { Action } from '../model/persist.ts';
import type { Chain, GameData } from '../model/types.ts';
import type { SearchRequest, Selection } from './selection.ts';
import { StageNode, type StageNodeType } from './StageNode.tsx';
import { RawNode, RAW_W, RAW_H, type RawNodeType } from './RawNode.tsx';
import { MeioEdge, type MeioEdgeType } from './MeioEdge.tsx';

const nodeTypes: NodeTypes = { stage: StageNode, raw: RawNode } as unknown as NodeTypes;
const edgeTypes: EdgeTypes = { meio: MeioEdge } as unknown as EdgeTypes;
type Pos = { x: number; y: number };

interface Props {
  chain: Chain; data: GameData; lang: string; meioList: Meio[];
  selection: Selection; onSelect: (s: Selection) => void;
  dispatch: (a: Action) => void; onOpenSearch: (r: SearchRequest) => void; onOpenStage: (id: string) => void;
}

export function Graph({ chain, data, lang, meioList, selection, onSelect, dispatch, onOpenSearch, onOpenStage }: Props) {
  // O plano de cada meio é pesado: uma vez por mudança na cadeia (ou no idioma, que muda o caseLabel).
  const summaries = useMemo(() => {
    const m = new Map<string, MeioSummary | null>();
    for (const me of meioList) {
      try { m.set(me.id, meioSummary(meioPlan(me, chain, data))); } catch { m.set(me.id, null); }
    }
    return m;
  }, [meioList, chain, data, lang]);

  // Posição durante o arraste; no fim vira um moveStage (um passo de desfazer).
  const [drag, setDrag] = useState<Record<string, Pos>>({});
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const posOf = useCallback((id: string, p: Pos) => drag[id] ?? p, [drag]);

  const nodes = useMemo(() => {
    const out: Node[] = [];
    for (const s of chain.stages) {
      const n: StageNodeType = {
        id: s.id, type: 'stage', position: posOf(s.id, s.pos), data: { stage: s, game: data, lang },
        selected: selection?.kind === 'stage' && selection.id === s.id,
        ...(sizes[s.id] ? { measured: sizes[s.id] } : {}),
      };
      out.push(n);
    }
    // Recursos: à esquerda da etapa sem produtor; abaixo dela quando a etapa já recebe de outra.
    const raws = rawInputs(chain, data);
    for (const s of chain.stages) {
      const mine = raws.filter(r => r.stage === s.id);
      if (!mine.length) continue;
      const p = posOf(s.id, s.pos);
      const fed = chain.links.some(l => l.to === s.id);
      const h = sizes[s.id]?.height ?? nodeSize(s, data).h;
      mine.forEach((r, i) => {
        const id = `raw:${s.id}:${r.item}`;
        const n: RawNodeType = {
          id, type: 'raw', draggable: false, selectable: false, connectable: false, focusable: false,
          position: fed ? { x: p.x - RAW_W - 30, y: p.y + h + 24 + i * (RAW_H + 12) } : { x: p.x - RAW_W - 60, y: p.y + 10 + i * (RAW_H + 12) },
          data: { item: data.items[r.item], total: r.total, lang },
          ...(sizes[id] ? { measured: sizes[id] } : {}),
        };
        out.push(n);
      });
    }
    return out;
  }, [chain, data, lang, posOf, selection, sizes]);

  const selMeio = selection?.kind === 'meio' ? selection.id : null;
  const selectMeio = useCallback((id: string) => onSelect({ kind: 'meio', id }), [onSelect]);
  const edges = useMemo(() => {
    const out: Edge[] = [];
    for (const me of meioList) {
      me.links.forEach((lid, i) => {
        const l = chain.links.find(x => x.id === lid);
        if (!l) return;
        const it = data.items[l.item];
        const e: MeioEdgeType = {
          id: l.id, type: 'meio', source: l.from, sourceHandle: l.item, target: l.to, targetHandle: l.item, focusable: false,
          data: { meioId: me.id, itemName: it?.name ?? l.item, fluid: !!it?.fluid, on: selMeio === me.id, label: i === 0 ? summaries.get(me.id) ?? null : null, onSelect: selectMeio },
        };
        out.push(e);
      });
    }
    for (const r of rawInputs(chain, data)) {
      const it = data.items[r.item];
      const e: MeioEdgeType = {
        id: `raw:${r.stage}:${r.item}`, type: 'meio', source: `raw:${r.stage}:${r.item}`, sourceHandle: r.item, target: r.stage, targetHandle: r.item,
        focusable: false, selectable: false,
        data: { meioId: null, itemName: it?.name ?? r.item, fluid: !!it?.fluid, on: false, label: null },
      };
      out.push(e);
    }
    return out;
  }, [chain, data, meioList, selMeio, selectMeio, summaries]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const moved: Record<string, Pos | null> = {};
    const measured: Record<string, { width: number; height: number }> = {};
    for (const c of changes) {
      if (c.type === 'dimensions' && c.dimensions) measured[c.id] = c.dimensions;
      else if (c.type === 'position' && c.position && !c.id.startsWith('raw:')) {
        const p = { x: Math.round(c.position.x), y: Math.round(c.position.y) };
        if (c.dragging) moved[c.id] = p;
        else { moved[c.id] = null; dispatch({ type: 'moveStage', id: c.id, pos: p }); }
      } else if (c.type === 'select' && c.selected && !c.id.startsWith('raw:')) onSelect({ kind: 'stage', id: c.id });
    }
    if (Object.keys(measured).length) setSizes(s => ({ ...s, ...measured }));
    if (Object.keys(moved).length) setDrag(d => {
      const n = { ...d };
      for (const [id, p] of Object.entries(moved)) { if (p) n[id] = p; else delete n[id]; }
      return n;
    });
  }, [dispatch, onSelect]);

  // Recusa de ligação: mensagem por 4 s numa região aria-live.
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const say = (text: string) => {
    setMsg(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 4000);
  };

  const onConnect = (c: Connection) => {
    const item = c.sourceHandle ?? c.targetHandle;
    if (!item) return;
    const ok = canLink(chain, data, c.source, c.target, item);
    if (ok.ok) dispatch({ type: 'link', from: c.source, to: c.target, item });
    else say(t('plNo_' + ok.reason));
  };
  const onConnectEnd = (_e: MouseEvent | TouchEvent, st: FinalConnectionState) => {
    if (st.toHandle || st.toNode || st.isValid || !st.fromHandle?.id || !st.fromNode || st.fromNode.type !== 'stage') return;
    onOpenSearch({ item: st.fromHandle.id, side: st.fromHandle.type === 'source' ? 'consumes' : 'produces', stage: st.fromNode.id });
  };

  const aria = useMemo(() => ({
    'node.a11yDescription.default': t('plA11yNode'),
    'node.a11yDescription.keyboardDisabled': t('plA11yNode'),
    'node.a11yDescription.ariaLiveMessage': ({ x, y }: { x: number; y: number }) => t('plA11yMoved', Math.round(x), Math.round(y)),
    'edge.a11yDescription.default': t('plA11yEdge'),
    'controls.ariaLabel': t('plControls'),
    'controls.zoomIn.ariaLabel': t('plZoomIn'),
    'controls.zoomOut.ariaLabel': t('plZoomOut'),
    'controls.fitView.ariaLabel': t('plFitView'),
    'handle.ariaLabel': t('plA11yHandle'),
  }), [lang]);

  return (
    <>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onConnect={onConnect} onConnectEnd={onConnectEnd}
        onPaneClick={() => onSelect(null)} onNodeDoubleClick={(_, n) => { if (n.type === 'stage') onOpenStage(n.id); }}
        colorMode="dark" fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.15} maxZoom={2.5}
        zoomOnScroll={false} preventScrolling={false} zoomActivationKeyCode={['Control', 'Meta']} zoomOnPinch
        deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null} edgesFocusable={false} elementsSelectable
        ariaLabelConfig={aria}
      >
        <Background variant={BackgroundVariant.Lines} gap={24} color="var(--grid-fine)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <div className="pl-live" role="status" aria-live="polite">{msg}</div>
    </>
  );
}
