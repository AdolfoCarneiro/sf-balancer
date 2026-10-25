import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { t } from '../../i18n/index.js';
import type { Item } from '../model/types.ts';
import { rateText } from './format.ts';

export type RawNodeData = { item: Item; total: number; lang: string };
export type RawNodeType = Node<RawNodeData, 'raw'>;
export const RAW_W = 130, RAW_H = 40;

// Recurso que entra numa etapa sem vir de outra: só o item e o total.
function RawNodeImpl({ data }: NodeProps<RawNodeType>) {
  const rate = rateText(data.item, data.total);
  return (
    <div className={'pl-raw' + (data.item.fluid ? ' pl-raw-fluid' : '')} role="group" aria-label={t('plRawAria', data.item.name, rate)}>
      <span>{data.item.name}</span>
      <span className="pl-dim">{rate}</span>
      <Handle type="source" position={Position.Right} id={data.item.id} isConnectable={false} className="pl-port-hidden" />
    </div>
  );
}

export const RawNode = memo(RawNodeImpl);
