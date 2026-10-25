import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { fmt, t } from '../../i18n/index.js';
import { perMachine, perRowOf, portTier, portWarnings, stageRows } from '../model/stage.ts';
import type { GameData, Stage } from '../model/types.ts';
import { rateText } from './format.ts';

export type StageNodeData = { stage: Stage; game: GameData; lang: string };
export type StageNodeType = Node<StageNodeData, 'stage'>;

const GAP = 2, ROW_GAP = 8, MIN = 4;
export const PORT_TOP = 22, PORT_STEP = 26;

// Uma etapa: cabeçalho, fileiras em escala (1 px = 1 m) com a esteira embaixo, rodapé com as portas.
function StageNodeImpl({ data, selected }: NodeProps<StageNodeType>) {
  const { stage, game } = data;
  const r = game.recipes[stage.recipe];
  const b = game.buildings[r.building];
  const rows = stageRows(stage, game);
  const per = perRowOf(stage, game);
  const mw = Math.max(MIN, b.w), ml = Math.max(MIN, b.l);
  const main = r.outs[0] ? { item: r.outs[0].item, side: 'outs' as const } : r.ins[0] ? { item: r.ins[0].item, side: 'ins' as const } : null;
  const warns = portWarnings(stage, game);
  const allFluid = r.outs.length > 0 && r.outs.every(f => game.items[f.item]?.fluid);

  const svgW = per * (mw + GAP) - GAP, svgH = rows.length * (ml + ROW_GAP);
  const rowsLine = (side: 'ins' | 'outs', item: string) => {
    const pm = perMachine(stage, game, item, side), tier = portTier(stage, game, item, side);
    const full = rows.filter(k => k === per).length, last = rows.length > full ? rows[rows.length - 1] : 0;
    const key = side === 'outs' ? 'plRowsOut' : 'plRowsIn';
    // Só a fileira incompleta: mostra ela como a única.
    if (!full) return t(key, '1', fmt(last * pm), tier);
    return t(key, fmt(full, 0), fmt(per * pm), tier) + (last ? t('plRowsPlus', fmt(last * pm)) : '');
  };
  const port = (side: 'ins' | 'outs', f: { item: string }, i: number) => {
    const it = game.items[f.item];
    const label = t(side === 'ins' ? 'plPortIn' : 'plPortOut', it?.name ?? f.item);
    return (
      <Handle key={side + f.item} id={f.item} type={side === 'ins' ? 'target' : 'source'}
        position={side === 'ins' ? Position.Left : Position.Right}
        className={'pl-port' + (it?.fluid ? ' pl-port-fluid' : '')}
        style={{ top: PORT_TOP + i * PORT_STEP }} title={label} aria-label={label} />
    );
  };

  return (
    <div className={'pl-node' + (selected ? ' on' : '')}>
      {r.ins.map((f, i) => port('ins', f, i))}
      {r.outs.map((f, i) => port('outs', f, i))}
      <div className="pl-node-head">
        <div className="pl-node-name">{r.name}{r.alt && <span className="pl-alt">{t('plAlt')}</span>}</div>
        <div className="pl-node-sub">{t('plEach', b.name, fmt(stage.machines, 0), main ? rateText(game.items[main.item], perMachine(stage, game, main.item, main.side)) : '')}</div>
      </div>
      <div className="pl-node-body">
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} role="img"
          aria-label={t('plRowsAria', fmt(rows.length, 0), fmt(per, 0), b.name)}>
          {rows.map((k, ri) => {
            const y = ri * (ml + ROW_GAP);
            return (
              <g key={ri}>
                {Array.from({ length: k }, (_, mi) => (
                  <rect key={mi} className="pl-mach" x={mi * (mw + GAP) + .5} y={y + .5} width={mw - 1} height={ml - 1} />
                ))}
                <rect className={allFluid ? 'pl-belt pl-pipe' : 'pl-belt'} x={0} y={y + ml + 2} width={k * (mw + GAP) - GAP} height={2} />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="pl-node-foot">
        {r.ins.map(f => <span key={'i' + f.item}>{rowsLine('ins', f.item)} <span className="pl-dim">{game.items[f.item]?.name ?? f.item}</span></span>)}
        {r.outs.map(f => <span key={'o' + f.item}>{rowsLine('outs', f.item)}</span>)}
        {r.outs.map(f => (
          <span key={'t' + f.item} className="pl-dim">{game.items[f.item]?.name ?? f.item} {rateText(game.items[f.item], perMachine(stage, game, f.item, 'outs') * stage.machines)}</span>
        ))}
        {warns.map(w => (
          <span key={'w' + w.side + w.item} className="pl-warn">{t('plPortWarn', game.items[w.item]?.name ?? w.item, fmt(w.rowRate), w.tier, fmt(w.cap))}</span>
        ))}
      </div>
    </div>
  );
}

export const StageNode = memo(StageNodeImpl);
