// Seletor do mapa (como o Recipe Chooser do Modeler): abre no ponto clicado, busca com foco, especiais (origens e
// sobras) e receitas em cartões com ícone, prédio e ingredientes; setas + Enter escolhem, Esc fecha.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { pickerEntries, pickerGroups, type PickerEntry, type PickerFilter } from '../model/picker.ts';
import type { Flow, GameData } from '../model/types.ts';
import { iconUrl } from './icons.ts';

interface Props {
  data: GameData; filter?: PickerFilter;
  x: number; y: number; area: { w: number; h: number };   // ponto e área do mapa, em px de tela
  onPick: (e: PickerEntry) => void;
  onClose: (refocus: boolean) => void;   // refocus: Esc devolve o foco ao canvas; clicar fora deixa o foco onde foi
}

const W = 440, H = 560, PAD = 8;

function Icon({ src, size }: { src: string | null; size: number }) {
  return src ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" />
    : <span className="pl-pick-noicon" style={{ width: size, height: size }} />;
}

// "60 [ícone] Steel Ingot + 30 [ícone] Water": taxa por minuto a 100 % (por máquina) antes de cada item.
function Flows({ flows, data }: { flows: Flow[]; data: GameData }) {
  return (
    <>
      {flows.map((f, i) => {
        const name = data.items[f.item]?.name ?? f.item;
        return (
          <span key={f.item + i} className="pl-pick-item" title={name}>
            <b>{fmt(f.perMin)}</b><Icon src={iconUrl(f.item)} size={18} /><span>{name}</span>
          </span>
        );
      })}
    </>
  );
}

export function Picker({ data, filter, x, y, area, onPick, onClose }: Props) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Vindo de uma porta, as receitas primeiro; sem filtro, as especiais primeiro (pickerGroups).
  const groups = useMemo(() => pickerGroups(pickerEntries(data, query, filter), filter), [data, query, filter]);
  const all = useMemo(() => groups.flatMap(g => g.entries), [groups]);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => setActive(0), [all]);
  useEffect(() => { document.getElementById(`${uid}-o${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, uid]);
  // Clicar fora fecha.
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) onClose(false); };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && all.length) { e.preventDefault(); setActive(a => (a + 1) % all.length); }
    else if (e.key === 'ArrowUp' && all.length) { e.preventDefault(); setActive(a => (a - 1 + all.length) % all.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (all[active]) onPick(all[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(true); }
  };

  const item = filter?.consumes ?? filter?.produces;
  const title = item ? t('plPickFor', data.items[item]?.name ?? item) : t('plPickTitle');
  const w = Math.min(W, area.w - 2 * PAD), h = Math.min(H, area.h - 2 * PAD);
  const left = Math.max(PAD, Math.min(x, area.w - w - PAD)), top = Math.max(PAD, Math.min(y, area.h - h - PAD));
  const listId = `${uid}-list`;
  const option = (e: PickerEntry, i: number) => {
    const r = e.spec.kind === 'recipe' ? data.recipes[e.spec.recipe] : undefined;
    return (
    <li key={i} id={`${uid}-o${i}`} role="option" aria-selected={i === active} className={'pl-pick-card' + (e.alt ? ' alt' : '')}
      onMouseDown={ev => ev.preventDefault()} onClick={() => onPick(e)} onMouseMove={() => { if (i !== active) setActive(i); }}>
      <Icon src={e.icon} size={42} />
      <span className="pl-pick-body">
        <span className="pl-pick-top"><b>{e.title}</b>{e.alt && <span className="pl-alt">{t('plPickAlt')}</span>}</span>
        {e.sub && <span className="pl-pick-sub">{e.sub}</span>}
        {r && (
          <span className="pl-pick-flow"><Flows flows={r.ins} data={data} /><span aria-hidden="true">→</span><Flows flows={r.outs} data={data} /></span>
        )}
      </span>
    </li>
    );
  };
  return (
    <div ref={box} className="pl-pick" role="dialog" aria-label={title} style={{ left, top, width: w, maxHeight: h }}
      onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
      <p className="pl-pick-title">{title}</p>
      <input ref={input} className="pl-pick-in" type="text" autoComplete="off" spellCheck={false} aria-label={t('plPickSearch')}
        placeholder={t('plPickSearch')} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
        role="combobox" aria-expanded={all.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={all.length ? `${uid}-o${active}` : undefined} />
      <ul id={listId} className="pl-pick-list" role="listbox" aria-label={title}>
        {groups.map((g, gi) => {
          const start = groups.slice(0, gi).reduce((n, x) => n + x.entries.length, 0), hid = `${uid}-g${g.kind}`;
          return (
            <li key={g.kind} role="group" aria-labelledby={hid}>
              <p id={hid} className="pl-pick-h">{t(g.kind === 'special' ? 'plPickSources' : 'plPickRecipes')}</p>
              <ul role="presentation">{g.entries.map((e, i) => option(e, start + i))}</ul>
            </li>
          );
        })}
      </ul>
      {!all.length && <p className="pl-note" role="status">{t('plPickNone')}</p>}
    </div>
  );
}
