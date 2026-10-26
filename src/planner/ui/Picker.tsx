// Seletor do mapa (como o Recipe Chooser do Modeler): abre no ponto clicado, busca com foco, os recursos em quadradinhos
// (ícone e nome do item), as receitas em cartões com ícone, prédio e ingredientes e as sobras no fim; setas + Enter
// escolhem, Esc fecha.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import { itemEntries, pickerEntries, pickerGroups, type PickerEntry, type PickerFilter, type PickerGroup } from '../model/picker.ts';
import type { Flow, GameData } from '../model/types.ts';
import { iconUrl } from './icons.ts';

interface Props {
  data: GameData; filter?: PickerFilter;
  x: number; y: number; area: { w: number; h: number };   // ponto e área do mapa, em px de tela
  onPick: (e: PickerEntry) => void;
  onClose: (refocus: boolean) => void;   // refocus: Esc devolve o foco ao canvas; clicar fora deixa o foco onde foi
}

const W = 440, H = 560, PAD = 8;
const GROUP_KEY = { sources: 'plPickRaw', recipes: 'plPickRecipes', power: 'plPickPower', outlets: 'plPickOutlets', items: 'plPickItems' } as const;

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
  // Entrada escolhida no vazio: a lista vira a de itens (segundo passo).
  const [itemStep, setItemStep] = useState(false);
  // Recursos, receitas e sobras, nessa ordem (pickerGroups), vindo de uma porta ou do vazio.
  const groups = useMemo((): PickerGroup[] => (itemStep ? [{ kind: 'items', entries: itemEntries(data, query) }]
    : pickerGroups(pickerEntries(data, query, filter), filter)), [data, query, filter, itemStep]);
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

  const pick = (e: PickerEntry) => {
    if (e.spec.kind === 'input' && !e.spec.item) { setItemStep(true); setQuery(''); input.current?.focus(); return; }
    onPick(e);
  };
  const back = () => { setItemStep(false); setQuery(''); input.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && all.length) { e.preventDefault(); setActive(a => (a + 1) % all.length); }
    else if (e.key === 'ArrowUp' && all.length) { e.preventDefault(); setActive(a => (a - 1 + all.length) % all.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (all[active]) pick(all[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (itemStep) back(); else onClose(true); }
  };

  const item = filter?.consumes ?? filter?.produces;
  const title = itemStep ? t('plPickItem') : item ? t('plPickFor', data.items[item]?.name ?? item) : t('plPickTitle');
  const w = Math.min(W, area.w - 2 * PAD), h = Math.min(H, area.h - 2 * PAD);
  const left = Math.max(PAD, Math.min(x, area.w - w - PAD)), top = Math.max(PAD, Math.min(y, area.h - h - PAD));
  const listId = `${uid}-list`;
  const option = (e: PickerEntry, i: number) => {
    const r = e.spec.kind === 'recipe' ? data.recipes[e.spec.recipe] : undefined;
    // Recurso: quadradinho com o ícone e o nome do item; o prédio (Miner, extrator) fica embaixo, pequeno.
    if (e.spec.kind === 'miner' || e.spec.kind === 'extractor' || e.spec.kind === 'input' || e.spec.kind === 'generator') return (
      <li key={i} id={`${uid}-o${i}`} role="option" aria-selected={i === active} className="pl-pick-card pl-pick-tile"
        onMouseDown={ev => ev.preventDefault()} onClick={() => pick(e)} onMouseMove={() => { if (i !== active) setActive(i); }}>
        {/* O prédio e o item lado a lado, no mesmo tamanho (como o nó do Modeler): Oil Extractor e Resource Well se separam. */}
        <span className="pl-pick-ic">
          {e.badge && <Icon src={e.badge} size={30} />}
          <Icon src={e.icon} size={30} />
        </span>
        <span className="pl-pick-body"><b>{e.title}</b>{e.sub && <span className="pl-pick-sub">{e.sub}</span>}</span>
      </li>
    );
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
      <p className="pl-pick-title">
        {itemStep && <button type="button" className="pl-pick-back" onClick={back} onMouseDown={ev => ev.preventDefault()}>{t('plPickBack')}</button>}
        {title}
      </p>
      <input ref={input} className="pl-pick-in" type="text" autoComplete="off" spellCheck={false} aria-label={t(itemStep ? 'plPickItemSearch' : 'plPickSearch')}
        placeholder={t(itemStep ? 'plPickItemSearch' : 'plPickSearch')} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
        role="combobox" aria-expanded={all.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={all.length ? `${uid}-o${active}` : undefined} />
      <ul id={listId} className="pl-pick-list" role="listbox" aria-label={title}>
        {groups.map((g, gi) => {
          const start = groups.slice(0, gi).reduce((n, x) => n + x.entries.length, 0), hid = `${uid}-g${g.kind}`;
          return (
            <li key={g.kind} role="group" aria-labelledby={hid}>
              <p id={hid} className="pl-pick-h">{t(GROUP_KEY[g.kind])}</p>
              <ul role="presentation" className={g.kind === 'recipes' || g.kind === 'outlets' ? undefined : 'pl-pick-tiles'}>{g.entries.map((e, i) => option(e, start + i))}</ul>
            </li>
          );
        })}
      </ul>
      {!all.length && <p className="pl-note" role="status">{t('plPickNone')}</p>}
    </div>
  );
}
