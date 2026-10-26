import { useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { Balance, PortState } from '../model/portstate.ts';
import type { GameData, ItemId } from '../model/types.ts';
import { iconUrl } from './icons.ts';
import { rateText } from './format.ts';

interface Props {
  balance: Balance;
  data: GameData;
  // Leva ao próximo problema do tipo (o App guarda o índice circular); devolve o escolhido ou null.
  onGo: (kind: 'deficit' | 'surplus') => PortState | null;
  nameOf: (blockId: string) => string;   // nome do bloco na tela, para o aviso
}

type Row = { item: ItemId; rate: number | null };

function Group({ label, rows, data }: { label: string; rows: Row[]; data: GameData }) {
  return (
    <div className="pl-bal-grp">
      <span className="pl-bal-lbl">{label}</span>
      {rows.length === 0 ? <span className="pl-bal-none">—</span> : rows.map(r => {
        const item = data.items[r.item];
        const name = item?.name ?? r.item;
        const src = iconUrl(r.item);
        return (
          <span className="pl-bal-it" key={r.item} title={name}>
            {src ? <img src={src} alt="" width={22} height={22} /> : <span className="pl-bal-noicon" />}
            <b>{r.rate === null ? t('plUnbounded') : rateText(item, r.rate)}</b>
            <span className="pl-sr">{name}</span>
          </span>
        );
      })}
    </div>
  );
}

export function BalanceBar({ balance, data, onGo, nameOf }: Props) {
  const [said, setSaid] = useState('');
  const nDef = balance.problems.filter(p => p.kind === 'deficit' || p.kind === 'stalled').length;
  const nSur = balance.problems.filter(p => p.kind === 'surplus').length;

  const go = (kind: 'deficit' | 'surplus') => {
    const p = onGo(kind);
    if (!p) return;
    const item = data.items[p.item];
    const rate = p.amount === null ? t('plUnbounded') : rateText(item, p.amount);
    setSaid(t('plBalGo', p.kind, item?.name ?? p.item, nameOf(p.block), rate));
  };

  return (
    <section className="pl-bal" data-tour="balance" aria-label={t('plBalAria')}>
      <Group label={t('plBalIn')} rows={balance.ins} data={data} />
      <Group label={t('plBalOut')} rows={balance.outs} data={data} />
      {balance.sink.length > 0 && <Group label={t('plBalSink')} rows={balance.sink} data={data} />}
      {balance.power > 0 && (
        <div className="pl-bal-grp">
          <span className="pl-bal-lbl">{t('plBalPower')}</span>
          <span className="pl-bal-it"><b>{t('plPowerMW', fmt(balance.power))}</b></span>
        </div>
      )}
      <div className="pl-bal-probs">
        <button type="button" className={`pl-bal-pb ${nDef ? 'def' : 'zero'}`} disabled={!nDef} onClick={() => go('deficit')}>{t('plBalDeficits', fmt(nDef, 0))}</button>
        <button type="button" className={`pl-bal-pb ${nSur ? 'sur' : 'zero'}`} disabled={!nSur} onClick={() => go('surplus')}>{t('plBalSurpluses', fmt(nSur, 0))}</button>
      </div>
      <span className="pl-sr" role="status" aria-live="polite">{said}</span>
    </section>
  );
}
